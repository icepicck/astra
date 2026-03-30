// ═══════════════════════════════════════════
// ASTRA — SUPABASE CLOUD SYNC
// One DB. One Account. Every Device. Same Data.
//
// Step 1 (Data Safety) changes:
//   D1  — Estimate sync (push + pull)
//   D2  — Timestamp-protected push (skip if cloud is newer)
//   D3  — Material upsert with material_id (no more delete-all/re-insert)
//   D14 — Backfill materialId on local materials missing one
// ═══════════════════════════════════════════
(function() {
'use strict';

var A = window.Astra;
var SUPA_URL_KEY = 'astra_supabase_url';
var SUPA_KEY_KEY = 'astra_supabase_key';
var LAST_SYNC_KEY = 'astra_last_sync';

// ── Defaults from auth module (single source of truth) ──
var DEFAULT_SUPA_URL = A._DEFAULT_SUPA_URL || '';
var DEFAULT_SUPA_KEY = A._DEFAULT_SUPA_KEY || '';

function getSupabaseUrl() { return localStorage.getItem(SUPA_URL_KEY) || DEFAULT_SUPA_URL; }
function saveSupabaseUrl(val) { localStorage.setItem(SUPA_URL_KEY, val.trim()); _client = null; }
function getSupabaseKey() { return localStorage.getItem(SUPA_KEY_KEY) || DEFAULT_SUPA_KEY; }
function saveSupabaseKey(val) { localStorage.setItem(SUPA_KEY_KEY, val.trim()); _client = null; }
function getLastSync() { return localStorage.getItem(LAST_SYNC_KEY) || ''; }
function setLastSync() { localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString()); }
function isConfigured() { return !!(getSupabaseUrl() && getSupabaseKey()); }

// ── Supabase Client (lazy singleton, shared with auth module) ──
var _client = null;
function getClient() {
  // Step 4: Use shared client from auth module if available
  if (window._astraSupabaseClient) { _client = window._astraSupabaseClient; return _client; }
  if (_client) return _client;
  var url = getSupabaseUrl();
  var key = getSupabaseKey();
  if (!url || !key) throw new Error('SUPABASE NOT CONFIGURED — ADD URL AND KEY IN SETTINGS.');
  if (!window.supabase || !window.supabase.createClient) throw new Error('SUPABASE LIBRARY NOT LOADED.');
  _client = window.supabase.createClient(url, key);
  window._astraSupabaseClient = _client; // Share with auth module
  return _client;
}

// ═══════════════════════════════════════════
// FIELD MAPPING: local camelCase ↔ Postgres snake_case
// ═══════════════════════════════════════════

// Step 4: Helper to get account_id for cloud writes
function _acctId() {
  return (A.getAccountId && A.getAccountId()) || null;
}

function jobToCloud(j) {
  return {
    id: j.id,
    account_id: _acctId(),
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
    photo_meta: (j.photos || []).map(function(p) { return { id: p.id, name: p.name, type: p.type, addedAt: p.addedAt }; }),
    drawing_meta: (j.drawings || []).map(function(d) { return { id: d.id, name: d.name, type: d.type, addedAt: d.addedAt }; }),
    video_meta: (j.videos || []).map(function(v) { return { id: v.id, name: v.name, type: v.type, addedAt: v.addedAt }; }),
    manually_added_to_vector: !!j.manually_added_to_vector,
    estimate_id: j.estimateId || null,
    created_by: j.createdBy || null,
    assigned_to: j.assignedTo || null,
    locked_by: j.lockedBy || null,
    locked_at: j.lockedAt || null,
    deleted_at: j.deletedAt || null,
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
    photos: r.photo_meta || [],
    drawings: r.drawing_meta || [],
    videos: r.video_meta || [],
    manually_added_to_vector: !!r.manually_added_to_vector,
    estimateId: r.estimate_id || '',
    createdBy: r.created_by || null,
    assignedTo: r.assigned_to || null,
    lockedBy: r.locked_by || null,
    lockedAt: r.locked_at || null,
    deletedAt: r.deleted_at || null,
    materials: [], // filled separately
    createdAt: r.created_at || new Date().toISOString(),
    updatedAt: r.updated_at || new Date().toISOString()
  };
}

function addrToCloud(a) {
  return {
    id: a.id,
    account_id: _acctId(),
    address: a.address || '',
    street: a.street || '',
    suite: a.suite || '',
    city: a.city || '',
    state: a.state || 'TX',
    zip: a.zip || '',
    builder: a.builder || '',
    subdivision: a.subdivision || '',
    panel_type: a.panelType || '',
    amp_rating: a.ampRating || '',
    breaker_type: a.breakerType || '',
    service_type: a.serviceType || '',
    panel_location: a.panelLocation || '',
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
    street: r.street || '',
    suite: r.suite || '',
    city: r.city || '',
    state: r.state || 'TX',
    zip: r.zip || '',
    builder: r.builder || '',
    subdivision: r.subdivision || '',
    panelType: r.panel_type || '',
    ampRating: r.amp_rating || '',
    breakerType: r.breaker_type || '',
    serviceType: r.service_type || '',
    panelLocation: r.panel_location || '',
    notes: r.notes || '',
    lat: r.lat || null,
    lng: r.lng || null,
    // D31: Preserve timestamps from cloud (matches jobFromCloud pattern)
    createdAt: r.created_at || new Date().toISOString(),
    updatedAt: r.updated_at || new Date().toISOString()
  };
}

function techToCloud(t) {
  return {
    id: t.id,
    account_id: _acctId(),
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
    active: r.active !== false,
    // D31: Preserve timestamps from cloud (matches jobFromCloud pattern)
    createdAt: r.created_at || new Date().toISOString(),
    updatedAt: r.updated_at || new Date().toISOString()
  };
}

// ── D1: Estimate field mapping ──
function estimateToCloud(e) {
  return {
    id: e.id,
    account_id: _acctId(),
    address: e.address || '',
    address_id: e.addressId || null,
    customer_name: e.customerName || '',
    customer_phone: e.customerPhone || '',
    customer_email: e.customerEmail || '',
    job_type: e.jobType || '',
    description: e.description || '',
    status: e.status || 'Draft',
    materials: e.materials || [],
    labor_hours: e.laborHours || 0,
    labor_rate: e.laborRate || 0,
    labor_total: e.laborTotal || 0,
    adjustments: e.adjustments || [],
    material_subtotal: e.materialSubtotal || 0,
    material_markup_total: e.materialMarkupTotal || 0,
    overhead_percent: e.overheadPercent || 0,
    overhead_amount: e.overheadAmount || 0,
    profit_percent: e.profitPercent || 0,
    profit_amount: e.profitAmount || 0,
    permit_fee: e.permitFee || 0,
    tax_rate: e.taxRate || 0,
    tax_amount: e.taxAmount || 0,
    grand_total: e.grandTotal || 0,
    valid_until: e.validUntil || null,
    notes: e.notes || '',
    linked_job_id: e.linkedJobId || null,
    updated_at: e.updatedAt || new Date().toISOString(),
    created_at: e.createdAt || new Date().toISOString()
  };
}

function estimateFromCloud(r) {
  return {
    id: r.id,
    address: r.address || '',
    addressId: r.address_id || '',
    customerName: r.customer_name || '',
    customerPhone: r.customer_phone || '',
    customerEmail: r.customer_email || '',
    jobType: r.job_type || '',
    description: r.description || '',
    status: r.status || 'Draft',
    materials: r.materials || [],
    laborHours: r.labor_hours || 0,
    laborRate: r.labor_rate || 0,
    laborTotal: r.labor_total || 0,
    adjustments: r.adjustments || [],
    materialSubtotal: r.material_subtotal || 0,
    materialMarkupTotal: r.material_markup_total || 0,
    overheadPercent: r.overhead_percent || 0,
    overheadAmount: r.overhead_amount || 0,
    profitPercent: r.profit_percent || 0,
    profitAmount: r.profit_amount || 0,
    permitFee: r.permit_fee || 0,
    taxRate: r.tax_rate || 0,
    taxAmount: r.tax_amount || 0,
    grandTotal: r.grand_total || 0,
    validUntil: r.valid_until || '',
    notes: r.notes || '',
    linkedJobId: r.linked_job_id || '',
    updatedAt: r.updated_at || new Date().toISOString(),
    createdAt: r.created_at || new Date().toISOString()
  };
}

// ── Batch upsert helper (chunks of 500) ──
async function batchUpsert(table, records, conflictCol) {
  var sb = getClient();
  var CHUNK = 500;
  var total = 0;
  for (var i = 0; i < records.length; i += CHUNK) {
    var batch = records.slice(i, i + CHUNK);
    var opts = { onConflict: conflictCol || 'id' };
    var result = await sb.from(table).upsert(batch, opts);
    if (result.error) throw new Error(table.toUpperCase() + ' UPSERT FAILED: ' + result.error.message);
    total += batch.length;
  }
  return total;
}

// ── Step 7A: Media blob sync helpers (Supabase Storage) ──
// Upload a media blob to Supabase Storage. Returns true on success, false on failure (silent).
async function _uploadMediaBlob(acctId, mediaId, blobData) {
  try {
    var sb = getClient();
    var path = acctId + '/' + mediaId;
    var blob = blobData;
    // Convert base64 data URI strings to Blob for upload
    if (typeof blobData === 'string') {
      var resp = await fetch(blobData);
      blob = await resp.blob();
    }
    var contentType = (blob && blob.type) ? blob.type : 'application/octet-stream';
    var result = await sb.storage.from('job-media').upload(path, blob, { contentType: contentType, upsert: true });
    if (result.error) { console.warn('Media upload failed:', mediaId, result.error.message); return false; }
    return true;
  } catch (e) {
    console.warn('Media upload error:', mediaId, e);
    return false;
  }
}

// Delete a media blob from Supabase Storage. Silent on failure.
async function _deleteCloudMedia(acctId, mediaId) {
  try {
    var sb = getClient();
    var path = acctId + '/' + mediaId;
    await sb.storage.from('job-media').remove([path]);
  } catch (e) {
    console.warn('Media cloud delete error:', mediaId, e);
  }
}

// Download a media blob from Supabase Storage. Returns Blob on success, null on failure.
async function downloadMediaBlob(acctId, mediaId) {
  try {
    var sb = getClient();
    var path = acctId + '/' + mediaId;
    var result = await sb.storage.from('job-media').download(path);
    if (result.error) { console.warn('Media download failed:', mediaId, result.error.message); return null; }
    return result.data;
  } catch (e) {
    console.warn('Media download error:', mediaId, e);
    return null;
  }
}

// ── D14: Ensure every local material has a materialId ──
// Backfills missing IDs so we can upsert instead of nuke-and-rebuild
function _ensureMaterialIds(jobs) {
  var changed = false;
  jobs.forEach(function(job) {
    if (!job.materials) return;
    job.materials.forEach(function(m) {
      if (!m.materialId) {
        m.materialId = crypto.randomUUID();
        changed = true;
      }
    });
  });
  return changed;
}

// ═══════════════════════════════════════════
// D2: TIMESTAMP-PROTECTED PUSH
// Fetches cloud updated_at for each table, skips records where cloud is newer.
// ═══════════════════════════════════════════

async function _getCloudTimestamps(table) {
  var sb = getClient();
  // D27: Only fetch timestamps for records changed since last sync
  var query = sb.from(table).select('id, updated_at');
  var lastSync = getLastSync();
  if (lastSync) query = query.gt('updated_at', lastSync);
  var result = await query;
  if (result.error) return {};
  var map = {};
  (result.data || []).forEach(function(r) { map[r.id] = r.updated_at; });
  return map;
}

function _filterByTimestamp(records, cloudTimes, localTimeField) {
  return records.filter(function(r) {
    var cloudTime = cloudTimes[r.id];
    if (!cloudTime) return true; // new record, always push
    var localMs = new Date(r[localTimeField] || 0).getTime();
    var cloudMs = new Date(cloudTime).getTime();
    return localMs >= cloudMs; // push if local is newer or equal
  });
}


// ═══════════════════════════════════════════
// PUSH: Local → Cloud
// Now with D1 (estimates), D2 (timestamp protection), D3 (material upsert)
// ═══════════════════════════════════════════
async function syncToCloud(statusCallback) {
  var status = function(msg) { if (statusCallback) statusCallback(0, 6, msg); };
  window._syncInProgress = true;

  try {
    var jobs = A.loadJobs();
    var addresses = A.loadAddresses();
    var techs = A.loadTechs();
    var estimates = A.loadEstimates();

    // Step 5 D6: Role-based push filter — techs only push their own jobs
    var user = (A.getCurrentUser && A.getCurrentUser()) || {};
    var role = user.role || 'admin';
    if (role === 'tech' && user.id) {
      jobs = jobs.filter(function(j) { return j.assignedTo === user.id || j.createdBy === user.id; });
    }

    // D14: Backfill materialIds on any jobs missing them
    if (_ensureMaterialIds(jobs)) {
      // Save backfilled IDs to IDB so they persist
      jobs.forEach(function(j) { A.updateJob(j.id, { materials: j.materials }); });
    }

    // D2: Fetch cloud timestamps for timestamp-protected push
    status('CHECKING CLOUD STATE...');
    var cloudJobTimes = await _getCloudTimestamps('jobs');
    var cloudAddrTimes = await _getCloudTimestamps('addresses');
    var cloudEstTimes = await _getCloudTimestamps('estimates');

    // 1. Addresses — skip if cloud is newer
    status('PUSHING ADDRESSES...');
    var addrRecords = addresses.map(addrToCloud);
    var filteredAddrs = _filterByTimestamp(addrRecords, cloudAddrTimes, 'updated_at');
    if (filteredAddrs.length) await batchUpsert('addresses', filteredAddrs);

    // 2. Techs — small table, always push all
    status('PUSHING TECHS...');
    await batchUpsert('techs', techs.map(techToCloud));

    // 3. Jobs — skip if cloud is newer (D2)
    status('PUSHING JOBS...');
    var jobRecords = jobs.map(jobToCloud);
    var filteredJobs = _filterByTimestamp(jobRecords, cloudJobTimes, 'updated_at');
    if (filteredJobs.length) await batchUpsert('jobs', filteredJobs);

    // 4. Materials — D3: UPSERT with material_id instead of delete-all/re-insert
    status('PUSHING MATERIALS...');
    var matRecords = [];
    var pushedJobIds = {}; // track which jobs we're pushing
    filteredJobs.forEach(function(j) { pushedJobIds[j.id] = true; });

    for (var ji = 0; ji < jobs.length; ji++) {
      var job = jobs[ji];
      // Only push materials for jobs that passed the timestamp filter
      if (!pushedJobIds[job.id]) continue;
      if (!job.materials || !job.materials.length) continue;
      for (var mi = 0; mi < job.materials.length; mi++) {
        var m = job.materials[mi];
        matRecords.push({
          job_id: job.id,
          account_id: _acctId(),
          material_id: m.materialId || crypto.randomUUID(),
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
      // Upsert on (job_id, material_id) unique index
      await batchUpsert('materials', matRecords, 'job_id,material_id');
    }

    // D25: Clean up removed materials — scoped by account_id
    // RLS enforces this at DB level, but explicit scope is defense-in-depth
    var sb = getClient();
    var acct = _acctId();
    for (var jobId in pushedJobIds) {
      var localMatIds = [];
      var localJob = jobs.find(function(j) { return j.id === jobId; });
      if (localJob && localJob.materials) {
        localJob.materials.forEach(function(m) {
          if (m.materialId) localMatIds.push(m.materialId);
        });
      }
      if (localMatIds.length > 0) {
        // Delete cloud materials for this job that aren't in local anymore
        var delQuery = sb.from('materials')
          .delete()
          .eq('job_id', jobId)
          .not('material_id', 'in', '(' + localMatIds.join(',') + ')');
        if (acct) delQuery = delQuery.eq('account_id', acct);
        await delQuery;
      } else if (localJob && (!localJob.materials || localJob.materials.length === 0)) {
        // Job has no materials — delete all cloud materials for this job
        var delAll = sb.from('materials').delete().eq('job_id', jobId);
        if (acct) delAll = delAll.eq('account_id', acct);
        await delAll;
      }
    }

    // 5. Estimates — D1: push estimates to cloud (skip if cloud is newer)
    status('PUSHING ESTIMATES...');
    var estRecords = estimates.map(estimateToCloud);
    var filteredEsts = _filterByTimestamp(estRecords, cloudEstTimes, 'updated_at');
    if (filteredEsts.length) await batchUpsert('estimates', filteredEsts);

    // 6. Step 7A: Media blob sync — upload unsynced blobs to Supabase Storage
    if (acct) {
      status('SYNCING MEDIA...');
      var mediaUploaded = 0;
      var allJobs = A.loadJobs ? A.loadJobs() : [];
      for (var mi = 0; mi < allJobs.length; mi++) {
        var mJob = allJobs[mi];
        var mediaTypes = ['photos', 'drawings', 'videos'];
        var jobDirty = false;
        for (var mt = 0; mt < mediaTypes.length; mt++) {
          var mType = mediaTypes[mt];
          var mArr = mJob[mType] || [];
          for (var mk = 0; mk < mArr.length; mk++) {
            var mEntry = mArr[mk];
            if (mEntry.synced === true) continue;
            // Get blob from local IDB
            var mBlob = await A.getMediaBlob(mEntry.id);
            if (!mBlob) continue; // No local blob — nothing to upload
            var uploaded = await _uploadMediaBlob(acct, mEntry.id, mBlob);
            if (uploaded) {
              mEntry.synced = true;
              jobDirty = true;
              mediaUploaded++;
            }
          }
        }
        // Persist synced flags back to IDB
        if (jobDirty) {
          A.updateJob(mJob.id, { photos: mJob.photos, drawings: mJob.drawings, videos: mJob.videos });
        }
      }

      // Process pending cloud media deletes
      var pendingDeletes = JSON.parse(localStorage.getItem('astra_pending_media_deletes') || '[]');
      if (pendingDeletes.length) {
        var remaining = [];
        for (var pd = 0; pd < pendingDeletes.length; pd++) {
          try {
            await _deleteCloudMedia(pendingDeletes[pd].accountId, pendingDeletes[pd].mediaId);
          } catch (e) {
            remaining.push(pendingDeletes[pd]); // Retry next push
          }
        }
        localStorage.setItem('astra_pending_media_deletes', JSON.stringify(remaining));
      }

      if (mediaUploaded) console.log('Media sync: uploaded', mediaUploaded, 'blobs');
    }

    setLastSync();
    window._syncInProgress = false;
    // Suppress realtime toasts briefly — push triggers cloud events back to us
    window._syncCooldown = true;
    setTimeout(function() { window._syncCooldown = false; }, 3000);
    return {
      jobs: filteredJobs.length,
      addresses: filteredAddrs.length,
      techs: techs.length,
      estimates: filteredEsts.length,
      materials: matRecords.length
    };
  } catch (e) {
    window._syncInProgress = false;
    throw e;
  }
}

// ═══════════════════════════════════════════
// PULL: Cloud → Local
// D1 (estimates), D3 (material_id preserved), D6 (RLS-filtered — role-aware)
// RLS policies handle role-based scoping at the DB level:
//   Tech: own assigned/created jobs only
//   Supervisor/Admin: all account jobs
//   All tables: deleted_at IS NULL excluded by RLS
// Client adds deleted_at filter as defense-in-depth.
// ═══════════════════════════════════════════
async function syncFromCloud(statusCallback) {
  var status = function(msg) { if (statusCallback) statusCallback(0, 4, msg); };
  var sb = getClient();
  window._syncInProgress = true;

  try {
    var newAddresses = 0, newJobs = 0, updatedJobs = 0, skippedJobs = 0;
    var newEstimates = 0, updatedEstimates = 0, skippedEstimates = 0;
    // D27: Incremental sync — only fetch records changed since last sync
    var lastSync = getLastSync();

    // 1. Pull addresses (unfiltered within account — architecture decision #3)
    status('PULLING ADDRESSES...');
    var addrQuery = sb.from('addresses').select('*').is('deleted_at', null);
    if (lastSync) addrQuery = addrQuery.gt('updated_at', lastSync);
    var addrResult = await addrQuery;
    if (addrResult.error) throw new Error('ADDRESS PULL FAILED: ' + addrResult.error.message);
    var cloudAddrs = addrResult.data || [];

    var localAddrs = A.loadAddresses();
    var localAddrMap = {};
    localAddrs.forEach(function(a) { localAddrMap[a.id] = a; });

    for (var ai = 0; ai < cloudAddrs.length; ai++) {
      var r = cloudAddrs[ai];
      var localAddr = localAddrMap[r.id];
      if (localAddr) {
        A.updateAddress(r.id, addrFromCloud(r));
      } else {
        A.addAddress(addrFromCloud(r));
        newAddresses++;
      }
    }

    // 2. Pull techs
    status('PULLING TECHS...');
    var techQuery = sb.from('techs').select('*').is('deleted_at', null);
    if (lastSync) techQuery = techQuery.gt('updated_at', lastSync);
    var techResult = await techQuery;
    if (techResult.error) throw new Error('TECH PULL FAILED: ' + techResult.error.message);
    var cloudTechs = techResult.data || [];

    var localTechs = A.loadTechs();
    var localTechMap = {};
    localTechs.forEach(function(t) { localTechMap[t.id] = t; });

    for (var ti = 0; ti < cloudTechs.length; ti++) {
      if (!localTechMap[cloudTechs[ti].id]) {
        var tech = techFromCloud(cloudTechs[ti]);
        A.addTech(tech); // D23: write-through to IDB, not just cache
      }
    }

    // 3. Pull jobs + materials
    // RLS is the security boundary. Client filter below is an optimization to reduce payload.
    status('PULLING JOBS...');
    var pullUser = (A.getCurrentUser && A.getCurrentUser()) || {};
    var pullRole = pullUser.role || 'admin';
    var jobQuery = sb.from('jobs').select('*').is('deleted_at', null);
    if (pullRole === 'tech' && pullUser.id) {
      jobQuery = jobQuery.or('assigned_to.eq.' + pullUser.id + ',created_by.eq.' + pullUser.id);
    }
    if (lastSync) jobQuery = jobQuery.gt('updated_at', lastSync);
    var jobResult = await jobQuery;
    if (jobResult.error) throw new Error('JOB PULL FAILED: ' + jobResult.error.message);
    var cloudJobs = jobResult.data || [];

    // D27: Pull materials for changed jobs only (complete list per job, not partial)
    // First sync (no lastSync) pulls all materials. Incremental pulls by changed job IDs.
    status('PULLING MATERIALS...');
    var changedJobIds = cloudJobs.map(function(j) { return j.id; });
    var matResult;
    if (lastSync && changedJobIds.length === 0) {
      matResult = { data: [], error: null };
    } else if (lastSync && changedJobIds.length <= 500) {
      matResult = await sb.from('materials').select('*').in('job_id', changedJobIds);
    } else {
      // First sync or 500+ changed jobs — pull all
      matResult = await sb.from('materials').select('*');
    }
    if (matResult.error) throw new Error('MATERIAL PULL FAILED: ' + matResult.error.message);
    var cloudMats = matResult.data || [];

    var matsByJob = {};
    for (var mi = 0; mi < cloudMats.length; mi++) {
      var cm = cloudMats[mi];
      if (!matsByJob[cm.job_id]) matsByJob[cm.job_id] = [];
      matsByJob[cm.job_id].push({
        materialId: cm.material_id || crypto.randomUUID(),
        itemId: cm.item_id || '',
        name: cm.name || '',
        qty: cm.qty || 1,
        unit: cm.unit || 'EA',
        variant: cm.variant || undefined,
        partRef: cm.part_ref || undefined
      });
    }

    for (var ji = 0; ji < cloudJobs.length; ji++) {
      var cr = cloudJobs[ji];
      var local = A.getJob(cr.id);
      var cloudJob = jobFromCloud(cr);
      cloudJob.materials = matsByJob[cr.id] || [];

      if (local) {
        // LOCAL WINS if local is newer — never silently overwrite field work
        var localTime = new Date(local.updatedAt || 0).getTime();
        var cloudTime = new Date(cloudJob.updatedAt || 0).getTime();
        if (localTime > cloudTime) { skippedJobs++; continue; }

        // Cloud is newer or equal — safe to update, but keep local media blobs
        A.updateJob(cr.id, {
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
          estimateId: cloudJob.estimateId,
          createdBy: cloudJob.createdBy,
          assignedTo: cloudJob.assignedTo,
          lockedBy: cloudJob.lockedBy,
          lockedAt: cloudJob.lockedAt,
          deletedAt: cloudJob.deletedAt,
          updatedAt: cloudJob.updatedAt
        });

        // Step 7A: Merge cloud media metadata into local job
        // New media from other devices gets synced:false so lazy download triggers
        var refreshedLocal = A.getJob(cr.id);
        if (refreshedLocal) {
          var mediaMerged = false;
          var mTypes = ['photos', 'drawings', 'videos'];
          for (var mti = 0; mti < mTypes.length; mti++) {
            var mKey = mTypes[mti];
            var localMedia = refreshedLocal[mKey] || [];
            var cloudMedia = cloudJob[mKey] || [];
            var localIds = {};
            for (var li = 0; li < localMedia.length; li++) localIds[localMedia[li].id] = true;
            for (var ci = 0; ci < cloudMedia.length; ci++) {
              if (!localIds[cloudMedia[ci].id]) {
                cloudMedia[ci].synced = false; // Blob not on this device yet
                localMedia.push(cloudMedia[ci]);
                mediaMerged = true;
              }
            }
            if (mediaMerged) refreshedLocal[mKey] = localMedia;
          }
          if (mediaMerged) {
            A.updateJob(cr.id, { photos: refreshedLocal.photos, drawings: refreshedLocal.drawings, videos: refreshedLocal.videos });
          }
        }

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

    // 4. D1: Pull estimates
    status('PULLING ESTIMATES...');
    var estQuery = sb.from('estimates').select('*').is('deleted_at', null);
    if (lastSync) estQuery = estQuery.gt('updated_at', lastSync);
    var estResult = await estQuery;
    if (estResult.error) throw new Error('ESTIMATE PULL FAILED: ' + estResult.error.message);
    var cloudEstimates = estResult.data || [];

    for (var ei = 0; ei < cloudEstimates.length; ei++) {
      var ce = cloudEstimates[ei];
      var localEst = A.getEstimate(ce.id);
      var cloudEst = estimateFromCloud(ce);

      if (localEst) {
        // Local wins if newer
        var localEstTime = new Date(localEst.updatedAt || 0).getTime();
        var cloudEstTime = new Date(cloudEst.updatedAt || 0).getTime();
        if (localEstTime > cloudEstTime) { skippedEstimates++; continue; }
        A.saveEstimate(cloudEst);
        updatedEstimates++;
      } else {
        A.saveEstimate(cloudEst);
        newEstimates++;
      }
    }

    setLastSync();
    window._syncInProgress = false;
    // Suppress realtime toasts briefly — bulk sync triggers cloud events for every record written
    window._syncCooldown = true;
    setTimeout(function() { window._syncCooldown = false; }, 3000);
    return {
      jobs: cloudJobs.length,
      addresses: cloudAddrs.length,
      techs: cloudTechs.length,
      estimates: cloudEstimates.length,
      newJobs: newJobs,
      newAddresses: newAddresses,
      updatedJobs: updatedJobs,
      skippedJobs: skippedJobs,
      newEstimates: newEstimates,
      updatedEstimates: updatedEstimates,
      skippedEstimates: skippedEstimates
    };
  } catch (e) {
    window._syncInProgress = false;
    throw e;
  }
}

// ═══════════════════════════════════════════
// REALTIME — Live sync across devices
// Now includes estimates table
// ═══════════════════════════════════════════
var _channel = null;

function startRealtime() {
  if (!isConfigured()) return;
  if (_channel) return;
  try {
    var sb = getClient();
    _channel = sb.channel('astra-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, function(payload) {
        _handleRemoteChange('jobs', payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'addresses' }, function(payload) {
        _handleRemoteChange('addresses', payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'techs' }, function(payload) {
        _handleRemoteChange('techs', payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estimates' }, function(payload) {
        _handleRemoteChange('estimates', payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'materials' }, function(payload) {
        _handleRemoteChange('materials', payload);
      })
      .subscribe(function(status) {
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
  var newRec = payload.new;
  var oldRec = payload.old;
  var eventType = payload.eventType;
  if (!newRec && !oldRec) return;
  if (window._syncInProgress) return;
  if (window._syncCooldown) return;

  // D26: If record was soft-deleted, remove local copy
  if (newRec && newRec.deleted_at) {
    if (table === 'jobs') { A.removeLocalJob && A.removeLocalJob(newRec.id); }
    else if (table === 'addresses') { A.removeLocalAddress && A.removeLocalAddress(newRec.id); }
    else if (table === 'estimates') { A.removeLocalEstimate && A.removeLocalEstimate(newRec.id); }
    return;
  }

  // D24: Handle material table events (needs oldRec for DELETE, so runs before newRec guard)
  if (table === 'materials') {
    var matRec = newRec || oldRec;
    if (!matRec || !matRec.job_id) return;
    var parentJob = A.getJob(matRec.job_id);
    if (!parentJob) return;

    if (eventType === 'DELETE') {
      var matId = matRec.material_id;
      parentJob.materials = (parentJob.materials || []).filter(function(m) {
        return m.materialId !== matId;
      });
    } else {
      // INSERT or UPDATE — add or replace material on parent job
      var mat = {
        materialId: matRec.material_id || crypto.randomUUID(),
        itemId: matRec.item_id || '',
        name: matRec.name || '',
        qty: matRec.qty || 1,
        unit: matRec.unit || 'EA',
        variant: matRec.variant || undefined,
        partRef: matRec.part_ref || undefined
      };
      var mats = parentJob.materials || [];
      var found = false;
      for (var i = 0; i < mats.length; i++) {
        if (mats[i].materialId === mat.materialId) { mats[i] = mat; found = true; break; }
      }
      if (!found) mats.push(mat);
      parentJob.materials = mats;
    }
    A.updateJob(matRec.job_id, { materials: parentJob.materials });
    return;
  }

  // All other tables require newRec
  if (!newRec) return;

  if (table === 'jobs') {
    var local = A.getJob(newRec.id);
    var cloudJob = jobFromCloud(newRec);
    if (local) {
      var localTime = new Date(local.updatedAt || 0).getTime();
      var cloudTime = new Date(cloudJob.updatedAt || 0).getTime();
      if (localTime > cloudTime) return;

      A.updateJob(newRec.id, {
        status: cloudJob.status,
        notes: cloudJob.notes,
        techNotes: cloudJob.techNotes,
        date: cloudJob.date,
        archived: cloudJob.archived,
        types: cloudJob.types,
        techId: cloudJob.techId,
        techName: cloudJob.techName,
        estimateId: cloudJob.estimateId,
        createdBy: cloudJob.createdBy,
        assignedTo: cloudJob.assignedTo,
        lockedBy: cloudJob.lockedBy,
        lockedAt: cloudJob.lockedAt,
        deletedAt: cloudJob.deletedAt,
        updatedAt: cloudJob.updatedAt
      });
    } else if (eventType === 'INSERT') {
      cloudJob.photos = []; cloudJob.drawings = []; cloudJob.videos = [];
      A.addJob(cloudJob);
    }
    A.showToast('SYNCED: ' + (cloudJob.address || 'JOB').substring(0, 30));

    // Step 7D: Generate notifications for relevant realtime job events
    var currentUser = (A.getCurrentUser && A.getCurrentUser()) || null;
    if (currentUser && A.addNotification && oldRec) {
      var addr = (cloudJob.address || 'JOB').substring(0, 35);
      var jobTypes = (cloudJob.types || []).join(', ');
      var detail = addr + (jobTypes ? ' — ' + jobTypes : '');

      // Approval: pending_approval → active status (not by current user)
      if (oldRec.status === 'pending_approval' && newRec.status !== 'pending_approval' && !newRec.archived) {
        if (newRec.created_by === currentUser.id && newRec.created_by !== (oldRec.locked_by || newRec.assigned_to)) {
          A.addNotification({ type: 'approval', title: 'JOB APPROVED', message: detail, jobId: newRec.id });
        }
      }

      // Rejection: pending_approval → archived
      if (oldRec.status === 'pending_approval' && newRec.archived && newRec.created_by === currentUser.id) {
        A.addNotification({ type: 'rejection', title: 'JOB REJECTED', message: detail, jobId: newRec.id });
      }

      // Lock takeover: someone else took my lock
      if (oldRec.locked_by === currentUser.id && newRec.locked_by && newRec.locked_by !== currentUser.id) {
        A.addNotification({ type: 'lock_takeover', title: 'LOCK TAKEN', message: detail + ' — ANOTHER USER TOOK OVER', jobId: newRec.id });
      }

      // Assignment: job newly assigned to me
      if (newRec.assigned_to === currentUser.id && oldRec.assigned_to !== currentUser.id) {
        A.addNotification({ type: 'assignment', title: 'JOB ASSIGNED', message: detail, jobId: newRec.id });
      }
    }

  } else if (table === 'addresses') {
    var localAddrs = A.loadAddresses();
    var exists = localAddrs.find(function(a) { return a.id === newRec.id; });
    if (exists) {
      A.updateAddress(newRec.id, addrFromCloud(newRec));
    } else if (eventType === 'INSERT') {
      A.addAddress(addrFromCloud(newRec));
    }

  } else if (table === 'estimates') {
    var localEst = A.getEstimate(newRec.id);
    var cloudEst = estimateFromCloud(newRec);
    if (localEst) {
      var localEstTime = new Date(localEst.updatedAt || 0).getTime();
      var cloudEstTime = new Date(cloudEst.updatedAt || 0).getTime();
      if (localEstTime > cloudEstTime) return;
      A.saveEstimate(cloudEst);
    } else if (eventType === 'INSERT') {
      A.saveEstimate(cloudEst);
    }
    A.showToast('SYNCED: ESTIMATE ' + (cloudEst.address || '').substring(0, 20));
  }
}

// ═══════════════════════════════════════════
// PHASE C: CHECKOUT LOCKING (D13)
// Prevents two users from editing the same job simultaneously.
// Lock is advisory at app level, enforced by RLS at DB level.
// 30-minute stale timeout. Supervisors can force-unlock.
// ═══════════════════════════════════════════

var LOCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Acquire lock on a job. Returns { success: true, job } or { success: false, lockedBy: 'Name' }
async function acquireLock(jobId) {
  var sb = getClient();
  var user = (A.getCurrentUser && A.getCurrentUser()) || null;
  if (!user) return { success: false, lockedBy: 'UNKNOWN' };

  // Try to lock: only if unlocked, stale (>30min), or already ours
  var now = new Date().toISOString();
  var staleThreshold = new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString();

  // Attempt: set lock where (no lock) OR (our lock) OR (stale lock)
  var result = await sb.from('jobs')
    .update({ locked_by: user.id, locked_at: now })
    .eq('id', jobId)
    .or('locked_by.is.null,locked_by.eq.' + user.id + ',locked_at.lt.' + staleThreshold)
    .select('id, locked_by, locked_at');

  if (result.error) {
    console.error('Lock acquire failed:', result.error.message);
    return { success: false, lockedBy: 'ERROR' };
  }

  if (result.data && result.data.length > 0) {
    // Lock acquired — update local cache
    A.updateJob(jobId, { lockedBy: user.id, lockedAt: now });
    return { success: true };
  }

  // Lock not acquired — someone else holds it. Fetch who.
  var check = await sb.from('jobs').select('locked_by, locked_at').eq('id', jobId).single();
  if (check.error || !check.data) return { success: false, lockedBy: 'UNKNOWN' };

  // Look up the lock holder's name
  var holderName = 'ANOTHER USER';
  if (check.data.locked_by) {
    var nameResult = await sb.from('users').select('name').eq('id', check.data.locked_by).single();
    if (nameResult.data && nameResult.data.name) holderName = nameResult.data.name;
  }

  return { success: false, lockedBy: holderName };
}

// Release lock on a job (called on navigate away, save, etc.)
async function releaseLock(jobId) {
  if (!jobId) return;
  var sb = getClient();
  var user = (A.getCurrentUser && A.getCurrentUser()) || null;
  if (!user) return;

  // Only release if WE hold the lock
  var result = await sb.from('jobs')
    .update({ locked_by: null, locked_at: null })
    .eq('id', jobId)
    .eq('locked_by', user.id);

  if (!result.error) {
    A.updateJob(jobId, { lockedBy: null, lockedAt: null });
  }
}

// Force-unlock + re-lock to supervisor in ONE atomic call (Silas: no window between)
async function forceUnlock(jobId) {
  var sb = getClient();
  var user = (A.getCurrentUser && A.getCurrentUser()) || null;
  if (!user || user.role !== 'supervisor') return { success: false };

  var now = new Date().toISOString();
  var result = await sb.from('jobs')
    .update({ locked_by: user.id, locked_at: now })
    .eq('id', jobId)
    .select('id, locked_by, locked_at');

  if (result.error || !result.data || result.data.length === 0) {
    return { success: false };
  }

  A.updateJob(jobId, { lockedBy: user.id, lockedAt: now });
  return { success: true };
}

// ── Public API ──
Object.assign(window, { syncToCloud: syncToCloud, syncFromCloud: syncFromCloud, startRealtime: startRealtime, stopRealtime: stopRealtime });
window.Astra.getSupabaseUrl = getSupabaseUrl;
window.Astra.saveSupabaseUrl = saveSupabaseUrl;
window.Astra.getSupabaseKey = getSupabaseKey;
window.Astra.saveSupabaseKey = saveSupabaseKey;
window.Astra.isSyncConfigured = isConfigured;
window.Astra.acquireLock = acquireLock;
window.Astra.releaseLock = releaseLock;
window.Astra.forceUnlock = forceUnlock;
window.Astra.downloadMediaBlob = downloadMediaBlob; // Step 7A: lazy download from Storage

// Auto-connect realtime if configured
if (isConfigured()) {
  try { startRealtime(); } catch (e) { console.warn('Realtime auto-start failed:', e); }
}

})();
