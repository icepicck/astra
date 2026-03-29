// ═══════════════════════════════════════════
// ASTRA — MULTI-DEVICE SYNC TEST HARNESS
// Two browser contexts. One Supabase. Zero mercy.
// ═══════════════════════════════════════════
//
// Each Playwright browser context is a fully isolated "device":
//   - Separate IndexedDB
//   - Separate localStorage
//   - Separate in-memory cache
//   - Same Supabase instance
//
// PREREQUISITE: Supabase must be configured and reachable.
// Run: node multi-device-test.js
// Requires: npx playwright install chromium
// ═══════════════════════════════════════════

const { chromium } = require('playwright');

const results = [];

// ── Config: env vars, CLI args, or edit here ──
// Usage: node multi-device-test.js <SUPA_URL> <SUPA_KEY> [PORT]
const SUPA_URL = process.argv[2] || process.env.ASTRA_SUPA_URL || '';
const SUPA_KEY = process.argv[3] || process.env.ASTRA_SUPA_KEY || '';
const PORT = process.argv[4] || process.env.ASTRA_PORT || '3000';
const URL = `http://localhost:${PORT}`;

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════

async function freshDevice(browser, name) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];

  page.on('pageerror', err => errors.push({ type: 'pageerror', msg: err.message }));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push({ type: 'console.error', text: msg.text() });
  });
  page.on('dialog', async dialog => await dialog.accept());

  await page.goto(URL);
  await page.waitForTimeout(3000); // Let app fully init, IDB hydrate, SW register

  // Inject Supabase credentials
  if (SUPA_URL && SUPA_KEY) {
    await page.evaluate(({ url, key }) => {
      localStorage.setItem('astra_supabase_url', url);
      localStorage.setItem('astra_supabase_key', key);
      if (window.Astra.saveSupabaseUrl) window.Astra.saveSupabaseUrl(url);
      if (window.Astra.saveSupabaseKey) window.Astra.saveSupabaseKey(key);
    }, { url: SUPA_URL, key: SUPA_KEY });
    await page.waitForTimeout(1000);
  }

  return { page, context, errors, name };
}

async function createTicket(page, overrides = {}) {
  return await page.evaluate((opts) => {
    const job = {
      id: crypto.randomUUID(),
      syncId: crypto.randomUUID(),
      address: opts.address || `${Math.floor(Math.random() * 9999)} Sync Test St`,
      addressId: '',
      types: opts.types || ['Service Call'],
      status: opts.status || 'Not Started',
      date: opts.date || new Date().toISOString().split('T')[0],
      techId: '', techName: opts.techName || '',
      notes: opts.notes || 'Multi-device test ticket',
      techNotes: opts.techNotes || '',
      materials: opts.materials || [],
      photos: [], drawings: [], videos: [],
      manually_added_to_vector: false,
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    // Ensure materials have materialId for D3
    job.materials.forEach(function(m) {
      if (!m.materialId) m.materialId = crypto.randomUUID();
    });
    window.Astra.addJob(job);
    return job;
  }, overrides);
}

async function pushSync(page) {
  return await page.evaluate(() => {
    return new Promise(async (resolve) => {
      try {
        const result = await window.syncToCloud(() => {});
        resolve({ success: true, ...result });
      } catch (e) {
        resolve({ success: false, error: e.message });
      }
    });
  });
}

async function pullSync(page) {
  return await page.evaluate(() => {
    return new Promise(async (resolve) => {
      try {
        const result = await window.syncFromCloud(() => {});
        resolve({ success: true, ...result });
      } catch (e) {
        resolve({ success: false, error: e.message });
      }
    });
  });
}

async function getJobOnDevice(page, jobId) {
  return await page.evaluate((id) => {
    const j = window.Astra.getJob(id);
    return j ? { ...j } : null;
  }, jobId);
}

async function isSyncConfigured(page) {
  return await page.evaluate(() => {
    return !!(window.Astra.isSyncConfigured && window.Astra.isSyncConfigured());
  });
}

function report(name, status, errorCount, notes) {
  const entry = { name, status, errorCount, notes };
  results.push(entry);
  const icon = status === 'PASS' ? 'O' : status === 'PARTIAL' ? '~' : 'X';
  console.log(`\n[${icon}] ${name}`);
  console.log(`    ${notes}`);
  if (errorCount > 0) console.log(`    JS ERRORS: ${errorCount}`);
}

// ══════════════════════════════════════════
// PREFLIGHT
// ══════════════════════════════════════════

async function preflight(browser) {
  console.log('\n-- PREFLIGHT --');

  if (!SUPA_URL || !SUPA_KEY) {
    console.log('FATAL: Set env vars ASTRA_SUPA_URL and ASTRA_SUPA_KEY');
    return false;
  }

  const dev = await freshDevice(browser, 'PREFLIGHT');
  const configured = await isSyncConfigured(dev.page);
  if (!configured) {
    console.log('FATAL: Supabase not configured after credential injection.');
    await dev.context.close();
    return false;
  }

  const pushResult = await pushSync(dev.page);
  if (!pushResult.success) {
    console.log('FATAL: Push failed — ' + pushResult.error);
    await dev.context.close();
    return false;
  }

  console.log('PREFLIGHT PASSED');
  await dev.context.close();
  return true;
}

// ══════════════════════════════════════════
// SCENARIOS
// ══════════════════════════════════════════

// M1: Basic Create -> Push -> Pull Round Trip
async function scenarioM1(browser) {
  const devA = await freshDevice(browser, 'A');
  const devB = await freshDevice(browser, 'B');

  const job = await createTicket(devA.page, {
    address: '100 Round Trip Blvd',
    notes: 'Created on Device A',
    materials: [
      { itemId: 'bc_003', name: '1G OLD WORK BOX', qty: 5, unit: 'EA' },
      { itemId: 'wp_001', name: '14/2 ROMEX', qty: 250, unit: 'FT' }
    ]
  });

  const pushResult = await pushSync(devA.page);
  if (!pushResult.success) {
    report('M1: Basic Round Trip', 'FAIL', devA.errors.length, 'Push failed: ' + pushResult.error);
    await devA.context.close(); await devB.context.close();
    return;
  }
  await devA.page.waitForTimeout(2000);

  const pullResult = await pullSync(devB.page);
  if (!pullResult.success) {
    report('M1: Basic Round Trip', 'FAIL', devB.errors.length, 'Pull failed: ' + pullResult.error);
    await devA.context.close(); await devB.context.close();
    return;
  }

  const jobOnB = await getJobOnDevice(devB.page, job.id);
  const hasJob = !!jobOnB;
  const addressMatch = hasJob && jobOnB.address === '100 Round Trip Blvd';
  const notesMatch = hasJob && jobOnB.notes === 'Created on Device A';
  const hasMaterials = hasJob && jobOnB.materials && jobOnB.materials.length === 2;

  const status = hasJob && addressMatch && notesMatch && hasMaterials ? 'PASS' : 'FAIL';
  report('M1: Basic Round Trip', status,
    devA.errors.length + devB.errors.length,
    `Job: ${hasJob}, Address: ${addressMatch}, Notes: ${notesMatch}, Materials: ${hasMaterials ? jobOnB.materials.length + '/2' : 'MISSING'}`
  );

  await devA.context.close(); await devB.context.close();
}

// M2: Stale Push Should Not Overwrite Newer Data (D2)
async function scenarioM2(browser) {
  const devA = await freshDevice(browser, 'A');
  const devB = await freshDevice(browser, 'B');

  const job = await createTicket(devA.page, {
    address: '200 Stale Push Ave',
    notes: 'ORIGINAL from Device A'
  });
  await pushSync(devA.page);
  await devA.page.waitForTimeout(2000);

  await pullSync(devB.page);
  const jobOnB = await getJobOnDevice(devB.page, job.id);
  if (!jobOnB) {
    report('M2: Stale Push (D2)', 'FAIL', 0, 'Device B never received the job');
    await devA.context.close(); await devB.context.close();
    return;
  }

  // Device B edits (newer timestamp)
  await devB.page.evaluate((id) => {
    window.Astra.updateJob(id, {
      notes: 'EDITED BY DEVICE B — THIS IS NEWER',
      status: 'In Progress'
    });
  }, job.id);
  await devB.page.waitForTimeout(500);

  // Device B pushes (cloud now has B's newer version)
  await pushSync(devB.page);
  await devB.page.waitForTimeout(2000);

  // Device A pushes AGAIN with stale data
  await pushSync(devA.page);
  await devA.page.waitForTimeout(2000);

  // Device B pulls to check final state
  await pullSync(devB.page);
  const finalJob = await getJobOnDevice(devB.page, job.id);

  const editSurvived = finalJob && finalJob.notes === 'EDITED BY DEVICE B — THIS IS NEWER';
  const statusSurvived = finalJob && finalJob.status === 'In Progress';

  const status = editSurvived && statusSurvived ? 'PASS' : 'FAIL';
  report('M2: Stale Push (D2)', status,
    devA.errors.length + devB.errors.length,
    editSurvived
      ? 'B edit SURVIVED — stale push rejected (D2 working)'
      : `B edit LOST — cloud has: "${finalJob ? finalJob.notes : 'NULL'}"`
  );

  await devA.context.close(); await devB.context.close();
}

// M3: Material Sync Integrity (D3)
async function scenarioM3(browser) {
  const devA = await freshDevice(browser, 'A');
  const devB = await freshDevice(browser, 'B');

  const job = await createTicket(devA.page, {
    address: '300 Material Integrity Ln',
    materials: [
      { itemId: 'bc_003', name: '1G OLD WORK BOX', qty: 5, unit: 'EA' },
      { itemId: 'bc_007', name: '2G OLD WORK BOX', qty: 3, unit: 'EA' },
      { itemId: 'wp_001', name: '14/2 ROMEX', qty: 250, unit: 'FT' },
      { itemId: 'wp_003', name: '12/2 ROMEX', qty: 100, unit: 'FT' },
      { itemId: 'ak_011', name: '20A BREAKER', qty: 4, unit: 'EA' }
    ]
  });

  await pushSync(devA.page);
  await devA.page.waitForTimeout(2000);

  await pullSync(devB.page);
  const jobOnB = await getJobOnDevice(devB.page, job.id);
  const firstPullCount = jobOnB ? (jobOnB.materials || []).length : 0;

  // Push AGAIN (triggers upsert, not delete-all)
  await pushSync(devA.page);
  await devA.page.waitForTimeout(2000);

  await pullSync(devB.page);
  const jobAfter = await getJobOnDevice(devB.page, job.id);
  const secondPullCount = jobAfter ? (jobAfter.materials || []).length : 0;

  // Verify item IDs and quantities
  const expectedIds = ['bc_003', 'bc_007', 'wp_001', 'wp_003', 'ak_011'];
  const actualIds = jobAfter ? (jobAfter.materials || []).map(m => m.itemId) : [];
  const allIdsPresent = expectedIds.every(id => actualIds.includes(id));

  const status = firstPullCount === 5 && secondPullCount === 5 && allIdsPresent ? 'PASS' : 'FAIL';
  report('M3: Material Integrity (D3)', status,
    devA.errors.length + devB.errors.length,
    `1st pull: ${firstPullCount}/5, 2nd pull: ${secondPullCount}/5, IDs intact: ${allIdsPresent}`
  );

  await devA.context.close(); await devB.context.close();
}

// M4: Concurrent Push Race
async function scenarioM4(browser) {
  const devA = await freshDevice(browser, 'A');
  const devB = await freshDevice(browser, 'B');

  const jobsA = [];
  for (let i = 0; i < 3; i++) {
    jobsA.push(await createTicket(devA.page, { address: `${i} Device-A-Only St`, notes: 'From A' }));
  }

  const jobsB = [];
  for (let i = 0; i < 3; i++) {
    jobsB.push(await createTicket(devB.page, { address: `${i} Device-B-Only St`, notes: 'From B' }));
  }

  // Push simultaneously
  const [pushA, pushB] = await Promise.all([pushSync(devA.page), pushSync(devB.page)]);
  await devA.page.waitForTimeout(3000);

  // Both pull
  await pullSync(devA.page);
  await pullSync(devB.page);

  const aHasBs = (await Promise.all(jobsB.map(j => getJobOnDevice(devA.page, j.id)))).filter(Boolean).length;
  const bHasAs = (await Promise.all(jobsA.map(j => getJobOnDevice(devB.page, j.id)))).filter(Boolean).length;

  const status = aHasBs === 3 && bHasAs === 3 ? 'PASS' : 'FAIL';
  report('M4: Concurrent Push Race', status,
    devA.errors.length + devB.errors.length,
    `A has B's jobs: ${aHasBs}/3, B has A's jobs: ${bHasAs}/3. Push A: ${pushA.success}, Push B: ${pushB.success}`
  );

  await devA.context.close(); await devB.context.close();
}

// M5: Edit Conflict — Same Job, Both Devices (informational)
async function scenarioM5(browser) {
  const devA = await freshDevice(browser, 'A');
  const devB = await freshDevice(browser, 'B');

  const job = await createTicket(devA.page, {
    address: '500 Conflict Dr',
    notes: 'Original notes',
    status: 'Not Started'
  });
  await pushSync(devA.page);
  await devA.page.waitForTimeout(2000);

  await pullSync(devB.page);

  // A edits notes
  await devA.page.evaluate((id) => {
    window.Astra.updateJob(id, { notes: 'DEVICE A EDITED NOTES' });
  }, job.id);
  await devA.page.waitForTimeout(500);

  // B edits status (different field, same job)
  await devB.page.evaluate((id) => {
    window.Astra.updateJob(id, { status: 'In Progress' });
  }, job.id);
  await devB.page.waitForTimeout(500);

  // A pushes first, then B pushes (B is newer)
  await pushSync(devA.page);
  await devA.page.waitForTimeout(1000);
  await pushSync(devB.page);
  await devA.page.waitForTimeout(1000);

  // Both pull final state
  await pullSync(devA.page);
  await pullSync(devB.page);

  const finalA = await getJobOnDevice(devA.page, job.id);
  const finalB = await getJobOnDevice(devB.page, job.id);

  const notesOnA = finalA ? finalA.notes : 'NULL';
  const statusOnA = finalA ? finalA.status : 'NULL';
  const bothAgree = finalA && finalB && notesOnA === finalB.notes && statusOnA === finalB.status;
  const aNotesLost = notesOnA !== 'DEVICE A EDITED NOTES';

  const status = bothAgree ? (aNotesLost ? 'PARTIAL' : 'PASS') : 'FAIL';
  report('M5: Edit Conflict (informational)', status,
    devA.errors.length + devB.errors.length,
    `Notes: "${notesOnA}", Status: "${statusOnA}", Agree: ${bothAgree}` +
    (aNotesLost ? ' | A notes LOST (last-push-wins, expected)' : ' | Both edits preserved')
  );

  await devA.context.close(); await devB.context.close();
}

// M6: Offline Device Reconnects and Syncs
async function scenarioM6(browser) {
  const devA = await freshDevice(browser, 'A');
  const devB = await freshDevice(browser, 'B');

  await devA.context.setOffline(true);

  const offlineJobs = [];
  for (let i = 0; i < 5; i++) {
    offlineJobs.push(await createTicket(devA.page, {
      address: `${i} Offline Work St`,
      notes: `Created offline #${i}`,
      materials: [{ itemId: 'bc_003', name: '1G OLD WORK BOX', qty: i + 1, unit: 'EA' }]
    }));
  }

  // Verify local cache while offline
  const allLocal = (await Promise.all(offlineJobs.map(j => getJobOnDevice(devA.page, j.id)))).every(Boolean);

  // Reconnect and push
  await devA.context.setOffline(false);
  await devA.page.waitForTimeout(2000);
  const pushResult = await pushSync(devA.page);
  await devA.page.waitForTimeout(2000);

  // B pulls
  await pullSync(devB.page);
  const pulledJobs = await Promise.all(offlineJobs.map(j => getJobOnDevice(devB.page, j.id)));
  const pulledCount = pulledJobs.filter(Boolean).length;
  const allNotesOk = pulledJobs.every((j, i) => j && j.notes === `Created offline #${i}`);
  const allMatsOk = pulledJobs.every((j, i) => j && j.materials && j.materials.length === 1 && j.materials[0].qty === i + 1);

  const status = allLocal && pushResult.success && pulledCount === 5 && allNotesOk && allMatsOk ? 'PASS' : 'FAIL';
  report('M6: Offline Reconnect', status,
    devA.errors.length + devB.errors.length,
    `Local while offline: ${allLocal}. Push: ${pushResult.success}. B received: ${pulledCount}/5. Notes: ${allNotesOk}. Materials: ${allMatsOk}`
  );

  await devA.context.close(); await devB.context.close();
}

// M7: Address Sync and Property Intel
async function scenarioM7(browser) {
  const devA = await freshDevice(browser, 'A');
  const devB = await freshDevice(browser, 'B');

  const addrId = await devA.page.evaluate(() => {
    const addr = {
      id: crypto.randomUUID(),
      address: '700 Property Intel Way, Houston, TX 77001',
      builder: 'ACME BUILDERS',
      subdivision: 'SUNSET RIDGE',
      panelType: 'Main Breaker',
      ampRating: '200A',
      breakerType: 'SQD',
      serviceType: 'Underground',
      panelLocation: 'Indoor',
      notes: 'Tight crawlspace.'
    };
    window.Astra.addAddress(addr);
    return addr.id;
  });

  await pushSync(devA.page);
  await devA.page.waitForTimeout(2000);

  await pullSync(devB.page);

  const addrOnB = await devB.page.evaluate((id) => {
    return window.Astra.loadAddresses().find(a => a.id === id) || null;
  }, addrId);

  const hasAddr = !!addrOnB;
  const fieldsOk = hasAddr &&
    addrOnB.builder === 'ACME BUILDERS' &&
    addrOnB.panelType === 'Main Breaker' &&
    addrOnB.ampRating === '200A' &&
    addrOnB.breakerType === 'SQD' &&
    addrOnB.serviceType === 'Underground';

  const status = hasAddr && fieldsOk ? 'PASS' : 'FAIL';
  report('M7: Address + Property Intel', status,
    devA.errors.length + devB.errors.length,
    `Address on B: ${hasAddr}. Fields correct: ${fieldsOk}`
  );

  await devA.context.close(); await devB.context.close();
}

// M8: Estimate Sync Round Trip (D1)
async function scenarioM8(browser) {
  const devA = await freshDevice(browser, 'A');
  const devB = await freshDevice(browser, 'B');

  const estId = await devA.page.evaluate(() => {
    const est = {
      id: crypto.randomUUID(),
      address: '800 Estimate Sync Ct',
      customerName: 'John Smith',
      customerPhone: '555-1234',
      customerEmail: 'john@example.com',
      jobType: 'PANEL UPGRADE',
      description: 'Upgrade to 200A',
      materials: [
        { name: '200A PANEL', qty: 1, unitCost: 450, markup: 25, unit: 'EA' },
        { name: '4/0 COPPER', qty: 20, unitCost: 12, markup: 20, unit: 'FT' }
      ],
      laborHours: 8,
      laborRate: 85,
      laborTotal: 680,
      adjustments: [],
      overheadPercent: 10,
      overheadAmount: 0,
      profitPercent: 15,
      profitAmount: 0,
      materialSubtotal: 690,
      materialMarkupTotal: 160.5,
      taxRate: 8.25,
      taxAmount: 0,
      permitFee: 150,
      grandTotal: 0,
      notes: '',
      validUntil: '',
      linkedJobId: '',
      status: 'Draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    window.Astra.saveEstimate(est);
    return est.id;
  });

  const estOnA = await devA.page.evaluate((id) => window.Astra.getEstimate(id), estId);
  if (!estOnA) {
    report('M8: Estimate Sync (D1)', 'FAIL', 0, 'Estimate not saved locally on A');
    await devA.context.close(); await devB.context.close();
    return;
  }

  await pushSync(devA.page);
  await devA.page.waitForTimeout(2000);

  await pullSync(devB.page);

  const estOnB = await devB.page.evaluate((id) => window.Astra.getEstimate(id), estId);
  const hasEst = !!estOnB;
  const dataOk = hasEst &&
    estOnB.customerName === 'John Smith' &&
    estOnB.address === '800 Estimate Sync Ct' &&
    estOnB.jobType === 'PANEL UPGRADE' &&
    estOnB.materials && estOnB.materials.length === 2 &&
    estOnB.laborHours === 8 &&
    estOnB.laborRate === 85 &&
    estOnB.status === 'Draft';

  const status = hasEst && dataOk ? 'PASS' : 'FAIL';
  report('M8: Estimate Sync (D1)', status,
    devA.errors.length + devB.errors.length,
    hasEst
      ? `Synced. Customer: ${estOnB.customerName}. Materials: ${estOnB.materials.length}/2. Labor: ${estOnB.laborHours}h @ $${estOnB.laborRate}. Status: ${estOnB.status}`
      : 'Estimate NOT on Device B'
  );

  await devA.context.close(); await devB.context.close();
}

// M9: Material Sync Under Network Interruption (D3)
async function scenarioM9(browser) {
  const devA = await freshDevice(browser, 'A');
  const devB = await freshDevice(browser, 'B');

  const job = await createTicket(devA.page, {
    address: '900 Airplane Mode Ln',
    materials: [
      { itemId: 'bc_003', name: '1G OLD WORK BOX', qty: 10, unit: 'EA' },
      { itemId: 'bc_007', name: '2G OLD WORK BOX', qty: 8, unit: 'EA' },
      { itemId: 'wp_001', name: '14/2 ROMEX', qty: 500, unit: 'FT' },
      { itemId: 'wp_003', name: '12/2 ROMEX', qty: 300, unit: 'FT' },
      { itemId: 'ak_011', name: '20A BREAKER', qty: 6, unit: 'EA' },
      { itemId: 'sm_012', name: 'SINGLE POLE SWITCH', qty: 12, unit: 'EA' },
      { itemId: 'wp_005', name: '10/3 ROMEX', qty: 100, unit: 'FT' }
    ]
  });

  // Clean push first
  await pushSync(devA.page);
  await devA.page.waitForTimeout(2000);

  await pullSync(devB.page);
  const before = await getJobOnDevice(devB.page, job.id);
  const matsBefore = before ? (before.materials || []).length : 0;

  // Interrupted push: start push, cut network, reconnect
  const pushPromise = pushSync(devA.page);
  await devA.page.waitForTimeout(200);
  await devA.context.setOffline(true);
  await devA.page.waitForTimeout(2000);
  await devA.context.setOffline(false);
  const interruptedPush = await pushPromise;

  // Clean re-push
  await devA.page.waitForTimeout(1000);
  await pushSync(devA.page);
  await devA.page.waitForTimeout(2000);

  // B pulls — materials should be intact
  await pullSync(devB.page);
  const after = await getJobOnDevice(devB.page, job.id);
  const matsAfter = after ? (after.materials || []).length : 0;

  const status = matsBefore === 7 && matsAfter === 7 ? 'PASS' : 'FAIL';
  report('M9: Network Interrupt (D3)', status,
    devA.errors.length + devB.errors.length,
    `Before: ${matsBefore}/7. After interrupt + re-push: ${matsAfter}/7. Interrupted: ${interruptedPush.success ? 'completed' : 'failed (expected)'}`
  );

  await devA.context.close(); await devB.context.close();
}

// M10: Rapid Push-Pull Ping Pong
async function scenarioM10(browser) {
  const devA = await freshDevice(browser, 'A');
  const devB = await freshDevice(browser, 'B');
  const allJobIds = [];

  for (let round = 0; round < 5; round++) {
    const jobA = await createTicket(devA.page, { address: `${round} Ping From A` });
    allJobIds.push(jobA.id);
    await pushSync(devA.page);
    await devA.page.waitForTimeout(1000);

    await pullSync(devB.page);
    const jobB = await createTicket(devB.page, { address: `${round} Pong From B` });
    allJobIds.push(jobB.id);
    await pushSync(devB.page);
    await devB.page.waitForTimeout(1000);

    await pullSync(devA.page);
    await devA.page.waitForTimeout(500);
  }

  const aJobs = (await Promise.all(allJobIds.map(id => getJobOnDevice(devA.page, id)))).filter(Boolean).length;
  const bJobs = (await Promise.all(allJobIds.map(id => getJobOnDevice(devB.page, id)))).filter(Boolean).length;

  const status = aJobs === 10 && bJobs === 10 ? 'PASS' : 'FAIL';
  report('M10: Ping Pong (5 rounds)', status,
    devA.errors.length + devB.errors.length,
    `A: ${aJobs}/10, B: ${bJobs}/10`
  );

  await devA.context.close(); await devB.context.close();
}

// ══════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════

(async () => {
  console.log('=============================================');
  console.log('  ASTRA MULTI-DEVICE SYNC TEST HARNESS');
  console.log('  Two phones. One cloud. Zero mercy.');
  console.log('=============================================\n');

  const browser = await chromium.launch({ headless: true });

  const ready = await preflight(browser);
  if (!ready) {
    console.log('\nABORTED — Fix Supabase connection and retry.');
    await browser.close();
    process.exit(1);
  }

  try {
    await scenarioM1(browser);
    await scenarioM2(browser);
    await scenarioM3(browser);
    await scenarioM4(browser);
    await scenarioM5(browser);
    await scenarioM6(browser);
    await scenarioM7(browser);
    await scenarioM8(browser);
    await scenarioM9(browser);
    await scenarioM10(browser);
  } catch (e) {
    console.error('\nFATAL:', e);
  }

  await browser.close();

  // Final Report
  console.log('\n\n=============================================');
  console.log('  FINAL REPORT');
  console.log('=============================================');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const partial = results.filter(r => r.status === 'PARTIAL').length;

  console.log(`PASSED:  ${passed} / ${results.length}`);
  console.log(`FAILED:  ${failed}`);
  console.log(`PARTIAL: ${partial}`);

  if (failed > 0) {
    console.log('\nFAILURES:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  ${r.name}: ${r.notes}`));
  }
  if (partial > 0) {
    console.log('\nPARTIAL:');
    results.filter(r => r.status === 'PARTIAL').forEach(r => console.log(`  ${r.name}: ${r.notes}`));
  }
  if (passed === results.length) {
    console.log('\nALL TESTS PASSED');
  }

  console.log('\nAd Astra.');
  process.exit(failed > 0 ? 1 : 0);
})();
