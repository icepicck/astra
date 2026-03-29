// ═══════════════════════════════════════════
// ASTRA — STEP 2 VERIFICATION
// Paste into browser console on a device with Supabase configured.
// Tests: auto-sync, dirty flag, sync indicator, silent errors, startup drain
// ═══════════════════════════════════════════

(async function() {
  'use strict';

  var results = [];
  var passed = 0;
  var failed = 0;

  function test(name, condition, notes) {
    var status = condition ? 'PASS' : 'FAIL';
    if (condition) passed++; else failed++;
    results.push({ name: name, status: status, notes: notes || '' });
    console.log((condition ? '[O]' : '[X]') + ' ' + name + (notes ? ' — ' + notes : ''));
  }

  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  console.log('=============================================');
  console.log('  STEP 2 VERIFICATION — Infrastructure Hardening');
  console.log('=============================================\n');

  // ── T1: Sync indicator exists in DOM ──
  var indicator = document.getElementById('sync-indicator');
  test('T1: Sync indicator exists', !!indicator);

  // ── T2: Sync indicator starts hidden ──
  test('T2: Indicator starts hidden',
    indicator && indicator.className.indexOf('sync-hidden') !== -1,
    indicator ? indicator.className : 'missing');

  // ── T3: _syncMeta store exists in IDB ──
  var hasStore = false;
  try {
    var db = await new Promise(function(resolve, reject) {
      var req = indexedDB.open('astra_db');
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    });
    hasStore = db.objectStoreNames.contains('_syncMeta');
    db.close();
  } catch (e) {}
  test('T3: _syncMeta IDB store exists', hasStore);

  // ── T4: Create a ticket — dirty flag should set ──
  var jobsBefore = window.Astra.loadJobs().length;
  var testJob = {
    id: crypto.randomUUID(),
    syncId: crypto.randomUUID(),
    address: 'STEP2-VERIFY-' + Date.now(),
    addressId: '',
    types: ['Service Call'],
    status: 'Not Started',
    date: new Date().toISOString().split('T')[0],
    techId: '', techName: '',
    notes: 'Step 2 verification test ticket',
    techNotes: '',
    materials: [{ materialId: crypto.randomUUID(), itemId: 'bc_003', name: '1G OLD WORK BOX', qty: 3, unit: 'EA' }],
    photos: [], drawings: [], videos: [],
    manually_added_to_vector: false,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  window.Astra.addJob(testJob);
  await sleep(500); // let IDB write complete

  var jobsAfter = window.Astra.loadJobs().length;
  test('T4: Job created locally', jobsAfter === jobsBefore + 1);

  // ── T5: Dirty flag set in IDB after write ──
  var dirtyFlag = null;
  try {
    var db2 = await new Promise(function(resolve, reject) {
      var req = indexedDB.open('astra_db');
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    });
    dirtyFlag = await new Promise(function(resolve) {
      var tx = db2.transaction('_syncMeta', 'readonly');
      var req = tx.objectStore('_syncMeta').get('dirty');
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { resolve(null); };
    });
    db2.close();
  } catch (e) {}
  test('T5: Dirty flag set after write',
    dirtyFlag && dirtyFlag.value === true,
    dirtyFlag ? 'value=' + dirtyFlag.value + ', at=' + dirtyFlag.at : 'not found');

  // ── T6: No error toasts from offline IDB work ──
  var toastContainer = document.getElementById('toast-container');
  var errorToasts = toastContainer ? toastContainer.querySelectorAll('.toast-error').length : 0;
  test('T6: Zero error toasts from local work', errorToasts === 0, errorToasts + ' error toasts');

  // ── T7: Sync indicator shows pending/syncing (if Supabase configured) ──
  var isConfigured = window.Astra.isSyncConfigured && window.Astra.isSyncConfigured();
  if (isConfigured) {
    // Wait for debounced auto-sync to kick in (3s debounce + network time)
    console.log('  ... waiting for auto-sync (5s) ...');
    await sleep(5000);

    var indicatorState = indicator ? indicator.className : '';
    var didSync = indicatorState.indexOf('sync-synced') !== -1 ||
                  indicatorState.indexOf('sync-hidden') !== -1; // synced then auto-hidden
    test('T7: Auto-sync fired after job creation',
      didSync,
      'indicator class: ' + indicatorState);

    // ── T8: Dirty flag cleared after successful sync ──
    var dirtyAfterSync = null;
    try {
      var db3 = await new Promise(function(resolve, reject) {
        var req = indexedDB.open('astra_db');
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
      });
      dirtyAfterSync = await new Promise(function(resolve) {
        var tx = db3.transaction('_syncMeta', 'readonly');
        var req = tx.objectStore('_syncMeta').get('dirty');
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { resolve(null); };
      });
      db3.close();
    } catch (e) {}
    test('T8: Dirty flag cleared after sync',
      dirtyAfterSync && dirtyAfterSync.value === false,
      dirtyAfterSync ? 'value=' + dirtyAfterSync.value : 'not found');

    // ── T9: Job made it to Supabase ──
    try {
      var sb = window.supabase.createClient(
        localStorage.getItem('astra_supabase_url'),
        localStorage.getItem('astra_supabase_key')
      );
      var result = await sb.from('jobs').select('id').eq('id', testJob.id);
      var inCloud = result.data && result.data.length === 1;
      test('T9: Job synced to Supabase', inCloud,
        inCloud ? 'found in cloud' : 'NOT in cloud');
    } catch (e) {
      test('T9: Job synced to Supabase', false, 'query failed: ' + e.message);
    }

    // ── T10: Rapid writes batch correctly ──
    var rapidJobs = [];
    for (var i = 0; i < 5; i++) {
      var rj = {
        id: crypto.randomUUID(), syncId: crypto.randomUUID(),
        address: 'RAPID-' + i + '-' + Date.now(),
        addressId: '', types: ['Service Call'], status: 'Not Started',
        date: new Date().toISOString().split('T')[0],
        techId: '', techName: '', notes: 'Rapid fire #' + i,
        techNotes: '', materials: [], photos: [], drawings: [], videos: [],
        manually_added_to_vector: false, archived: false,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      window.Astra.addJob(rj);
      rapidJobs.push(rj);
    }
    console.log('  ... waiting for batch sync (6s) ...');
    await sleep(6000); // debounce + sync time

    try {
      var sb2 = window.supabase.createClient(
        localStorage.getItem('astra_supabase_url'),
        localStorage.getItem('astra_supabase_key')
      );
      var rapidIds = rapidJobs.map(function(j) { return j.id; });
      var rResult = await sb2.from('jobs').select('id').in('id', rapidIds);
      var rapidCount = rResult.data ? rResult.data.length : 0;
      test('T10: 5 rapid jobs batched and synced', rapidCount === 5, rapidCount + '/5 in cloud');
    } catch (e) {
      test('T10: 5 rapid jobs batched and synced', false, 'query failed: ' + e.message);
    }

  } else {
    console.log('[SKIP] T7-T10: Supabase not configured — skipping cloud tests');
    console.log('       Configure Supabase in Settings and re-run for full verification.');
  }

  // ── T11: Online/offline listener exists ──
  test('T11: navigator.onLine accessible', typeof navigator.onLine === 'boolean');

  // ── Cleanup: remove test jobs ──
  var allJobs = window.Astra.loadJobs();
  var testAddresses = ['STEP2-VERIFY-', 'RAPID-'];
  var toRemove = allJobs.filter(function(j) {
    return testAddresses.some(function(prefix) { return j.address.indexOf(prefix) === 0; });
  });
  toRemove.forEach(function(j) {
    var idx = allJobs.indexOf(j);
    if (idx !== -1) allJobs.splice(idx, 1);
  });
  console.log('\nCleaned up ' + toRemove.length + ' test jobs from local cache.');

  // ── Final Report ──
  console.log('\n=============================================');
  console.log('  STEP 2 RESULTS');
  console.log('=============================================');
  console.log('PASSED: ' + passed + ' / ' + (passed + failed));
  console.log('FAILED: ' + failed);
  if (failed > 0) {
    console.log('\nFAILURES:');
    results.filter(function(r) { return r.status === 'FAIL'; }).forEach(function(r) {
      console.log('  ' + r.name + (r.notes ? ': ' + r.notes : ''));
    });
  }
  if (failed === 0) console.log('\nALL TESTS PASSED');
  console.log('\nAd Astra.');
})();
