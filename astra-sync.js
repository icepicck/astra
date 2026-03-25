// ═══════════════════════════════════════════
// ASTRA — SUPABASE CLOUD SYNC
// One DB. One Account. Every Device. Same Data.
// ═══════════════════════════════════════════
(function() {
'use strict';

const A = window.Astra;
const SUPA_URL_KEY = 'astra_supabase_url';
const SUPA_KEY_KEY = 'astra_supabase_key';
const LAST_SYNC_KEY = 'astra_last_sync';

function getSupabaseUrl() { return localStorage.getItem(SUPA_URL_KEY) || ''; }
function saveSupabaseUrl(val) { localStorage.setItem(SUPA_URL_KEY, val.trim()); _client = null; }
function getSupabaseKey() { return localStorage.getItem(SUPA_KEY_KEY) || ''; }
function saveSupabaseKey(val) { localStorage.setItem(SUPA_KEY_KEY, val.trim()); _client = null; }
function getLastSync() { return localStorage.getItem(LAST_SYNC_KEY) || ''; }
function setLastSync() { localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString()); }
function isConfigured() { return !!(getSupabaseUrl() && getSupabaseKey()); }

// ── Supabase Client (lazy singleton) ──
let _client = null;
function getClient() {
  if (_client) return _client;
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) throw new Error('SUPABASE NOT CONFIGURED — ADD URL AND KEY IN SETTINGS.');
  if (!window.supabase || !window.supabase.createClient) throw new Error('SUPABASE LIBRARY NOT LOADED.');
  _client = window.supabase.createClient(url, key);
  return _client;
}

// ── Field mapping: local camelCase ↔ Postgres snake_case ──
function jobToCloud(j) {
  return {
    id: j.id,
    address: j.address || '',
    address_id: j.addressId || null,
    types: j.types || [],
    status: j.status || 'Not Started',
    notes: j.notes || '',
    tech_notes: j.techNotes || '',
    date: j.date || null,
    archived: !!j.archived,
    tech_id: j.techId || null,
    tech_name: j.techName || '',
    photo_meta: (j.photos || []).map(p => ({ id: p.id, name: p.name, type: p.type, addedAt: p.addedAt })),
    drawing_meta: (j.drawings || []).map(d => ({ id: d.id, name: d.name, type: d.type, addedAt: d.addedAt })),
    video_meta: (j.videos || []).map(v => ({ id: v.id, name: v.name, type: v.type, addedAt: v.addedAt })),
    manually_added_to_vector: !!j.manually_added_to_vector,
    created_at: j.createdAt || new Date().toISOString(),
    updated_at: j.updatedAt || new Date().toISOString()
  };
}

function jobFromCloud(r) {
  return {
    id: r.id,
    address: r.address || '',
    addressId: r.address_id || '',
    types: r.types || [],
    status: r.status || 'Not Started',
    notes: r.notes || '',
    techNotes: r.tech_notes || '',
    date: r.date || '',
    archived: !!r.archived,
    techId: r.tech_id || '',
    techName: r.tech_name || '',
    photos: (r.photo_meta || []),
    drawings: (r.drawing_meta || []),
    videos: (r.video_meta || []),
    manually_added_to_vector: !!r.manually_added_to_vector,
    materials: [], // filled separately
    createdAt: r.created_at || new Date().toISOString(),
    updatedAt: r.updated_at || new Date().toISOString()
  };
}

function addrToCloud(a) {
  return {
    id: a.id,
    address: a.address || '',
    city: a.city || '',
    builder: a.builder || '',
    subdivision: a.subdivision || '',
    notes: a.notes || '',
    lat: a.lat || null,
    lng: a.lng || null,
    updated_at: new Date().toISOString(),
    created_at: a.createdAt || new Date().toISOString()
  };
}

function addrFromCloud(r) {
  return {
    id: r.id,
    address: r.address || '',
    city: r.city || '',
    builder: r.builder || '',
    subdivision: r.subdivision || '',
    notes: r.notes || '',
    lat: r.lat || null,
    lng: r.lng || null
  };
}

function techToCloud(t) {
  return {
    id: t.id,
    name: t.name || '',
    phone: t.phone || '',
    license: t.license || '',
    active: t.active !== false,
    updated_at: new Date().toISOString(),
    created_at: t.createdAt || new Date().toISOString()
  };
}

function techFromCloud(r) {
  return {
    id: r.id,
    name: r.name || '',
    phone: r.phone || '',
    license: r.license || '',
    active: r.active !== false
  };
}

// ── Batch upsert helper (chunks of 500) ──
async function batchUpsert(table, records) {
  const sb = getClient();
  const CHUNK = 500;
  let total = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const batch = records.slice(i, i + CHUNK);
    const { error } = await sb.from(table).upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(table.toUpperCase() + ' UPSERT FAILED: ' + error.message);
    total += batch.length;
  }
  return total;
}

// ═══════════════════════════════════════════
// PUSH: Local → Cloud
// ═══════════════════════════════════════════
async function syncToCloud(statusCallback) {
  const status = (msg) => { if (statusCallback) statusCallback(0, 4, msg); };

  const jobs = A.loadJobs();
  const addresses = A.loadAddresses();
  const techs = A.loadTechs();

  // 1. Addresses
  status('PUSHING ADDRESSES...');
  await batchUpsert('addresses', addresses.map(addrToCloud));

  // 2. Techs
  status('PUSHING TECHS...');
  await batchUpsert('techs', techs.map(techToCloud));

  // 3. Jobs
  status('PUSHING JOBS...');
  await batchUpsert('jobs', jobs.map(jobToCloud));

  // 4. Materials — delete all, re-insert
  status('PUSHING MATERIALS...');
  const sb = getClient();
  const jobIds = jobs.map(j => j.id);
  if (jobIds.length) {
    const { error: delErr } = await sb.from('materials').delete().in('job_id', jobIds);
    if (delErr) throw new Error('MATERIAL DELETE FAILED: ' + delErr.message);
  }

  const matRecords = [];
  for (const job of jobs) {
    if (!job.materials || !job.materials.length) continue;
    for (const m of job.materials) {
      matRecords.push({
        job_id: job.id,
        item_id: m.itemId || '',
        name: m.name || '',
        qty: m.qty || 1,
        unit: m.unit || 'EA',
        variant: m.variant || null,
        part_ref: m.partRef || null
      });
    }
  }
  if (matRecords.length) {
    const CHUNK = 500;
    for (let i = 0; i < matRecords.length; i += CHUNK) {
      const batch = matRecords.slice(i, i + CHUNK);
      const { error } = await sb.from('materials').insert(batch);
      if (error) throw new Error('MATERIAL INSERT FAILED: ' + error.message);
    }
  }

  setLastSync();
  return { jobs: jobs.length, addresses: addresses.length, techs: techs.length, materials: matRecords.length };
}

// ═══════════════════════════════════════════
// PULL: Cloud → Local
// ═══════════════════════════════════════════
async function syncFromCloud(statusCallback) {
  const status = (msg) => { if (statusCallback) statusCallback(0, 3, msg); };
  const sb = getClient();

  let newAddresses = 0, newJobs = 0, updatedJobs = 0;

  // 1. Pull addresses
  status('PULLING ADDRESSES...');
  const { data: cloudAddrs, error: addrErr } = await sb.from('addresses').select('*');
  if (addrErr) throw new Error('ADDRESS PULL FAILED: ' + addrErr.message);

  const localAddrs = A.loadAddresses();
  const localAddrMap = {};
  localAddrs.forEach(a => { localAddrMap[a.id] = a; });

  for (const r of cloudAddrs) {
    const local = localAddrMap[r.id];
    if (local) {
      A.updateAddress(r.id, addrFromCloud(r));
    } else {
      A.addAddress({ ...addrFromCloud(r) });
      newAddresses++;
    }
  }

  // 2. Pull techs
  status('PULLING TECHS...');
  const { data: cloudTechs, error: techErr } = await sb.from('techs').select('*');
  if (techErr) throw new Error('TECH PULL FAILED: ' + techErr.message);

  const localTechs = A.loadTechs();
  const localTechMap = {};
  localTechs.forEach(t => { localTechMap[t.id] = t; });

  for (const r of cloudTechs) {
    if (!localTechMap[r.id]) {
      // addTech not exposed yet — push into techs array manually
      const tech = techFromCloud(r);
      A.loadTechs().push(tech);
    }
  }

  // 3. Pull jobs + materials
  status('PULLING JOBS...');
  const { data: cloudJobs, error: jobErr } = await sb.from('jobs').select('*');
  if (jobErr) throw new Error('JOB PULL FAILED: ' + jobErr.message);

  // Pull all materials and group by job_id
  const { data: cloudMats, error: matErr } = await sb.from('materials').select('*');
  if (matErr) throw new Error('MATERIAL PULL FAILED: ' + matErr.message);

  const matsByJob = {};
  for (const m of cloudMats) {
    if (!matsByJob[m.job_id]) matsByJob[m.job_id] = [];
    matsByJob[m.job_id].push({
      itemId: m.item_id || '',
      name: m.name || '',
      qty: m.qty || 1,
      unit: m.unit || 'EA',
      variant: m.variant || undefined,
      partRef: m.part_ref || undefined
    });
  }

  for (const r of cloudJobs) {
    const local = A.getJob(r.id);
    const cloudJob = jobFromCloud(r);
    cloudJob.materials = matsByJob[r.id] || [];

    if (local) {
      // Update existing — merge cloud data but keep local media blobs
      const updates = {
        address: cloudJob.address,
        addressId: cloudJob.addressId,
        types: cloudJob.types,
        status: cloudJob.status,
        notes: cloudJob.notes,
        techNotes: cloudJob.techNotes,
        date: cloudJob.date,
        archived: cloudJob.archived,
        techId: cloudJob.techId,
        techName: cloudJob.techName,
        materials: cloudJob.materials,
        updatedAt: cloudJob.updatedAt
      };
      A.updateJob(r.id, updates);
      updatedJobs++;
    } else {
      // New job from cloud — local photos/drawings/videos will be empty (blobs are device-local)
      cloudJob.photos = cloudJob.photos || [];
      cloudJob.drawings = cloudJob.drawings || [];
      cloudJob.videos = cloudJob.videos || [];
      A.addJob(cloudJob);
      newJobs++;
    }
  }

  setLastSync();
  return {
    jobs: cloudJobs.length,
    addresses: cloudAddrs.length,
    techs: cloudTechs.length,
    newJobs, newAddresses, updatedJobs
  };
}

// ═══════════════════════════════════════════
// REALTIME — Live sync across devices
// ═══════════════════════════════════════════
let _channel = null;

function startRealtime() {
  if (!isConfigured()) return;
  if (_channel) return; // already subscribed
  try {
    const sb = getClient();
    _channel = sb.channel('astra-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, payload => {
        _handleRemoteChange('jobs', payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'addresses' }, payload => {
        _handleRemoteChange('addresses', payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'techs' }, payload => {
        _handleRemoteChange('techs', payload);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('ASTRA REALTIME: CONNECTED');
        }
      });
  } catch (e) {
    console.warn('Realtime subscribe failed:', e);
  }
}

function stopRealtime() {
  if (_channel) {
    try { getClient().removeChannel(_channel); } catch (e) {}
    _channel = null;
  }
}

function _handleRemoteChange(table, payload) {
  const { eventType, new: newRec, old: oldRec } = payload;
  if (!newRec) return;

  if (table === 'jobs') {
    const local = A.getJob(newRec.id);
    const cloudJob = jobFromCloud(newRec);
    if (local) {
      A.updateJob(newRec.id, {
        status: cloudJob.status,
        notes: cloudJob.notes,
        techNotes: cloudJob.techNotes,
        date: cloudJob.date,
        archived: cloudJob.archived,
        types: cloudJob.types,
        techId: cloudJob.techId,
        techName: cloudJob.techName,
        updatedAt: cloudJob.updatedAt
      });
    } else if (eventType === 'INSERT') {
      cloudJob.photos = []; cloudJob.drawings = []; cloudJob.videos = [];
      A.addJob(cloudJob);
    }
    A.showToast('SYNCED: ' + (cloudJob.address || 'JOB').substring(0, 30));
  } else if (table === 'addresses') {
    const localAddrs = A.loadAddresses();
    const exists = localAddrs.find(a => a.id === newRec.id);
    if (exists) {
      A.updateAddress(newRec.id, addrFromCloud(newRec));
    } else if (eventType === 'INSERT') {
      A.addAddress(addrFromCloud(newRec));
    }
  }
}

// ── Public API ──
Object.assign(window, { syncToCloud, syncFromCloud, startRealtime, stopRealtime });
window.Astra.getSupabaseUrl = getSupabaseUrl;
window.Astra.saveSupabaseUrl = saveSupabaseUrl;
window.Astra.getSupabaseKey = getSupabaseKey;
window.Astra.saveSupabaseKey = saveSupabaseKey;
window.Astra.isSyncConfigured = isConfigured;

// Auto-connect realtime if configured
if (isConfigured()) {
  try { startRealtime(); } catch (e) { console.warn('Realtime auto-start failed:', e); }
}

})();
