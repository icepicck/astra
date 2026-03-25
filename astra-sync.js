// ═══════════════════════════════════════════
// ASTRA — AIRTABLE SYNC
// ═══════════════════════════════════════════
(function() {
'use strict';

const A = window.Astra;
const AIRTABLE_KEY_STORAGE = 'astra_airtable_pat';
const AIRTABLE_SYNC_MAP = 'astra_airtable_sync_map'; // maps astra IDs → airtable record IDs
const BASE_ID = 'appvxHudZe5QS4Dcd';
const API_BASE = 'https://api.airtable.com/v0/' + BASE_ID;

// Table IDs
const TABLES = {
  jobs: 'tblNy4jBI79SZHyvB',
  addresses: 'tblFEnaMCGXlsSa2A',
  techs: 'tblRIILIHddrtpuew',
  materials: 'tblyZgCLcNO35Y6C8'
};

function getAirtableKey() { return localStorage.getItem(AIRTABLE_KEY_STORAGE) || ''; }
function saveAirtableKey(key) { localStorage.setItem(AIRTABLE_KEY_STORAGE, key.trim()); }

function getSyncMap() {
  try { return JSON.parse(localStorage.getItem(AIRTABLE_SYNC_MAP)) || {}; } catch { return {}; }
}
function saveSyncMap(map) { localStorage.setItem(AIRTABLE_SYNC_MAP, JSON.stringify(map)); }

// ── Airtable API helpers ──
async function atFetch(path, method, body) {
  const key = getAirtableKey();
  if (!key) throw new Error('NO AIRTABLE API KEY');
  const opts = {
    method: method || 'GET',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API_BASE + '/' + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error('AIRTABLE ' + res.status + ': ' + (err.error && err.error.message || res.statusText));
  }
  return res.json();
}

// Airtable limits to 10 records per request
async function atBatchCreate(tableId, records) {
  const results = [];
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const res = await atFetch(tableId, 'POST', { records: batch });
    results.push(...res.records);
  }
  return results;
}

async function atBatchUpdate(tableId, records) {
  const results = [];
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const res = await atFetch(tableId, 'PATCH', { records: batch });
    results.push(...res.records);
  }
  return results;
}

async function atListAll(tableId, filterFormula) {
  let all = [];
  let offset = null;
  do {
    let path = tableId + '?pageSize=100';
    if (offset) path += '&offset=' + offset;
    if (filterFormula) path += '&filterByFormula=' + encodeURIComponent(filterFormula);
    const res = await atFetch(path);
    all.push(...res.records);
    offset = res.offset || null;
  } while (offset);
  return all;
}

// ── PUSH: Astra → Airtable ──
async function syncToAirtable(statusCallback) {
  const syncMap = getSyncMap();
  if (!syncMap.addresses) syncMap.addresses = {};
  if (!syncMap.jobs) syncMap.jobs = {};
  if (!syncMap.techs) syncMap.techs = {};

  const jobs = A.loadJobs();
  const addresses = A.loadAddresses();
  const techs = A.loadTechs();

  let step = 0;
  const totalSteps = 4;
  const status = (msg) => { step++; if (statusCallback) statusCallback(step, totalSteps, msg); };

  // 1. Sync addresses
  status('SYNCING ADDRESSES...');
  const existingAddrs = await atListAll(TABLES.addresses);
  const addrByStreet = {};
  existingAddrs.forEach(r => { addrByStreet[r.fields['Street Address']] = r.id; });

  const newAddrs = [];
  const updateAddrs = [];
  for (const addr of addresses) {
    const fields = {
      'Street Address': addr.address || '',
      'City': addr.city || '',
      'Builder/Client': addr.builder || '',
      'Subdivision': addr.subdivision || '',
      'Notes': addr.notes || '',
      'Active': true
    };
    const existingId = syncMap.addresses[addr.id] || addrByStreet[addr.address];
    if (existingId) {
      syncMap.addresses[addr.id] = existingId;
      updateAddrs.push({ id: existingId, fields });
    } else {
      newAddrs.push({ _astraId: addr.id, fields });
    }
  }
  if (updateAddrs.length) await atBatchUpdate(TABLES.addresses, updateAddrs);
  if (newAddrs.length) {
    const created = await atBatchCreate(TABLES.addresses, newAddrs.map(r => ({ fields: r.fields })));
    created.forEach((rec, i) => { syncMap.addresses[newAddrs[i]._astraId] = rec.id; });
  }

  // 2. Sync techs
  status('SYNCING TECHS...');
  const existingTechs = await atListAll(TABLES.techs);
  const techByName = {};
  existingTechs.forEach(r => { techByName[r.fields['Name']] = r.id; });

  const newTechs = [];
  const updateTechs = [];
  for (const tech of techs) {
    const fields = {
      'Name': tech.name || '',
      'Active': true
    };
    const existingId = syncMap.techs[tech.id] || techByName[tech.name];
    if (existingId) {
      syncMap.techs[tech.id] = existingId;
      updateTechs.push({ id: existingId, fields });
    } else {
      newTechs.push({ _astraId: tech.id, fields });
    }
  }
  if (updateTechs.length) await atBatchUpdate(TABLES.techs, updateTechs);
  if (newTechs.length) {
    const created = await atBatchCreate(TABLES.techs, newTechs.map(r => ({ fields: r.fields })));
    created.forEach((rec, i) => { syncMap.techs[newTechs[i]._astraId] = rec.id; });
  }

  // 3. Sync jobs
  status('SYNCING JOBS...');
  const existingJobs = await atListAll(TABLES.jobs);
  const jobBySyncId = {};
  existingJobs.forEach(r => { if (r.fields['Sync ID']) jobBySyncId[r.fields['Sync ID']] = r.id; });

  const newJobs = [];
  const updateJobs = [];
  for (const job of jobs) {
    const fields = {
      'Job ID': job.id,
      'Sync ID': job.id,
      'Status': job.status || 'Not Started',
      'Notes': job.notes || '',
      'Tech Notes': job.techNotes || '',
      'Archived': !!job.archived,
      'Last Synced': new Date().toISOString()
    };
    // Job types
    if (job.types && job.types.length) {
      fields['Job Types'] = job.types.map(t => {
        // Map Astra type names to Airtable choice names
        const map = { 'ROUGH': 'Rough', 'ROUGH-IN': 'Rough', 'TRIM': 'Trim', 'TRIM-OUT': 'Trim',
          'SERVICE': 'Service Call', 'SERVICE CALL': 'Service Call', 'PUNCH': 'Punch List', 'PUNCH LIST': 'Punch List',
          'PANEL': 'Panel', 'METER': 'Meter', 'TEMP POWER': 'Temp Power', 'INSPECTION': 'Inspection',
          'CALLBACK': 'Callback', 'GENERAL': 'Other' };
        return map[t.toUpperCase()] || 'Other';
      });
    }
    // Date
    if (job.date) fields['Date of Work'] = job.date;
    // Created/Updated
    if (job.createdAt) fields['Created At'] = job.createdAt;
    if (job.updatedAt) fields['Updated At'] = job.updatedAt;
    // Linked address
    if (job.addressId && syncMap.addresses[job.addressId]) {
      fields['Address'] = [{ id: syncMap.addresses[job.addressId] }];
    }
    // Linked tech
    if (job.techId && syncMap.techs[job.techId]) {
      fields['Assigned Tech'] = [{ id: syncMap.techs[job.techId] }];
    }

    const existingId = syncMap.jobs[job.id] || jobBySyncId[job.id];
    if (existingId) {
      syncMap.jobs[job.id] = existingId;
      updateJobs.push({ id: existingId, fields });
    } else {
      newJobs.push({ _astraId: job.id, fields });
    }
  }
  if (updateJobs.length) await atBatchUpdate(TABLES.jobs, updateJobs);
  if (newJobs.length) {
    const created = await atBatchCreate(TABLES.jobs, newJobs.map(r => ({ fields: r.fields })));
    created.forEach((rec, i) => { syncMap.jobs[newJobs[i]._astraId] = rec.id; });
  }

  // 4. Sync materials
  status('SYNCING MATERIALS...');
  // Clear existing materials and re-push (simpler than diffing)
  const existingMats = await atListAll(TABLES.materials);
  if (existingMats.length) {
    // Delete in batches of 10
    for (let i = 0; i < existingMats.length; i += 10) {
      const batch = existingMats.slice(i, i + 10);
      const ids = batch.map(r => 'records[]=' + r.id).join('&');
      await atFetch(TABLES.materials + '?' + ids, 'DELETE');
    }
  }
  // Push all job materials
  const matRecords = [];
  for (const job of jobs) {
    if (!job.materials || !job.materials.length) continue;
    const jobAtId = syncMap.jobs[job.id];
    if (!jobAtId) continue;
    for (const m of job.materials) {
      const fields = {
        'Material': m.name || '',
        'Item ID': m.itemId || '',
        'Qty': m.qty || 0,
        'Unit': m.unit || '',
        'Job': [{ id: jobAtId }]
      };
      if (m.variant) fields['Variant'] = m.variant;
      if (m.partRef) fields['Part Ref'] = m.partRef;
      matRecords.push({ fields });
    }
  }
  if (matRecords.length) await atBatchCreate(TABLES.materials, matRecords);

  saveSyncMap(syncMap);
  return { jobs: jobs.length, addresses: addresses.length, techs: techs.length, materials: matRecords.length };
}

// ── PULL: Airtable → Astra ──
async function syncFromAirtable(statusCallback) {
  const syncMap = getSyncMap();
  if (!syncMap.addresses) syncMap.addresses = {};
  if (!syncMap.jobs) syncMap.jobs = {};
  if (!syncMap.techs) syncMap.techs = {};

  // Reverse maps: airtable ID → astra ID
  const atToAstraAddr = {};
  Object.entries(syncMap.addresses).forEach(([k, v]) => { atToAstraAddr[v] = k; });
  const atToAstraTech = {};
  Object.entries(syncMap.techs).forEach(([k, v]) => { atToAstraTech[v] = k; });
  const atToAstraJob = {};
  Object.entries(syncMap.jobs).forEach(([k, v]) => { atToAstraJob[v] = k; });

  let step = 0;
  const totalSteps = 3;
  const status = (msg) => { step++; if (statusCallback) statusCallback(step, totalSteps, msg); };

  // 1. Pull addresses
  status('PULLING ADDRESSES...');
  const atAddrs = await atListAll(TABLES.addresses);
  const localAddrs = A.loadAddresses();
  for (const rec of atAddrs) {
    const f = rec.fields;
    const astraId = atToAstraAddr[rec.id];
    if (astraId) {
      // Update existing
      A.updateAddress(astraId, {
        address: f['Street Address'] || '',
        city: f['City'] || '',
        builder: f['Builder/Client'] || '',
        subdivision: f['Subdivision'] || '',
        notes: f['Notes'] || ''
      });
    }
    // Don't create new addresses from Airtable yet — too risky without full field mapping
  }

  // 2. Pull jobs
  status('PULLING JOBS...');
  const atJobs = await atListAll(TABLES.jobs);
  for (const rec of atJobs) {
    const f = rec.fields;
    const syncId = f['Sync ID'];
    if (!syncId) continue;
    const job = A.getJob(syncId);
    if (!job) continue; // Only update existing jobs, don't create from Airtable

    const updates = {};
    if (f['Status'] && f['Status'] !== job.status) updates.status = f['Status'];
    if (f['Notes'] !== undefined && f['Notes'] !== job.notes) updates.notes = f['Notes'];
    if (f['Tech Notes'] !== undefined && f['Tech Notes'] !== job.techNotes) updates.techNotes = f['Tech Notes'];
    if (f['Archived'] !== undefined && f['Archived'] !== !!job.archived) updates.archived = f['Archived'];
    if (f['Date of Work'] && f['Date of Work'] !== job.date) updates.date = f['Date of Work'];

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date().toISOString();
      A.updateJob(syncId, updates);
    }
  }

  // 3. Pull materials
  status('PULLING MATERIALS...');
  const atMats = await atListAll(TABLES.materials);
  // Group materials by job airtable ID
  const matsByJob = {};
  for (const rec of atMats) {
    const f = rec.fields;
    const jobLinks = f['Job'];
    if (!jobLinks || !jobLinks.length) continue;
    const jobAtId = jobLinks[0];
    if (!matsByJob[jobAtId]) matsByJob[jobAtId] = [];
    matsByJob[jobAtId].push({
      itemId: f['Item ID'] || '',
      name: f['Material'] || '',
      qty: f['Qty'] || 1,
      unit: f['Unit'] || 'EA',
      variant: f['Variant'] || undefined,
      partRef: f['Part Ref'] || undefined
    });
  }
  // Apply materials to jobs
  let matsUpdated = 0;
  for (const [jobAtId, mats] of Object.entries(matsByJob)) {
    const astraId = atToAstraJob[jobAtId];
    if (!astraId) continue;
    const job = A.getJob(astraId);
    if (!job) continue;
    // Only update if material counts differ (simple conflict avoidance)
    if (!job.materials || job.materials.length !== mats.length) {
      A.updateJob(astraId, { materials: mats, updatedAt: new Date().toISOString() });
      matsUpdated++;
    }
  }

  return { jobs: atJobs.length, addresses: atAddrs.length, materialsUpdated: matsUpdated };
}

// ── Public API ──
Object.assign(window, { syncToAirtable, syncFromAirtable });
window.Astra.getAirtableKey = getAirtableKey;
window.Astra.saveAirtableKey = saveAirtableKey;

})();
