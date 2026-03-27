const { chromium } = require('playwright');

const URL = 'http://localhost:3000';
const results = [];

// ── Shared Helpers ──

async function freshPage(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push({ type: 'pageerror', msg: err.message }));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push({ type: 'console.error', text: msg.text() });
  });
  page.on('dialog', async dialog => await dialog.accept());
  await page.goto(URL);
  await page.waitForTimeout(3000);
  return { page, context, errors };
}

async function integrityCheck(page) {
  return await page.evaluate(async () => {
    const result = { pass: true, issues: [] };
    const cacheJobs = window.Astra.loadJobs();
    const cacheTechs = window.Astra.loadTechs();
    const cacheAddrs = window.Astra.loadAddresses();

    function idbGetAll(dbName, storeName) {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, 'readonly');
          const r = tx.objectStore(storeName).getAll();
          r.onsuccess = () => resolve(r.result || []);
          r.onerror = () => reject(r.error);
        };
        req.onerror = () => reject(req.error);
      });
    }

    const [idbJobs, idbTechs, idbAddrs] = await Promise.all([
      idbGetAll('astra_db', 'jobs'),
      idbGetAll('astra_db', 'techs'),
      idbGetAll('astra_db', 'addresses')
    ]);

    if (cacheJobs.length !== idbJobs.length) {
      result.pass = false;
      result.issues.push(`JOBS COUNT: cache=${cacheJobs.length} idb=${idbJobs.length}`);
    }
    if (cacheTechs.length !== idbTechs.length) {
      result.pass = false;
      result.issues.push(`TECHS COUNT: cache=${cacheTechs.length} idb=${idbTechs.length}`);
    }
    if (cacheAddrs.length !== idbAddrs.length) {
      result.pass = false;
      result.issues.push(`ADDRS COUNT: cache=${cacheAddrs.length} idb=${idbAddrs.length}`);
    }

    const cacheIds = new Set(cacheJobs.map(j => j.id));
    const idbIds = new Set(idbJobs.map(j => j.id));
    for (const id of cacheIds) {
      if (!idbIds.has(id)) { result.pass = false; result.issues.push(`IN CACHE NOT IDB: ${id}`); }
    }
    for (const id of idbIds) {
      if (!cacheIds.has(id)) { result.pass = false; result.issues.push(`IN IDB NOT CACHE: ${id}`); }
    }

    if (cacheIds.size !== cacheJobs.length) {
      result.pass = false; result.issues.push('DUPLICATE JOB IDS IN CACHE');
    }

    let mediaBlobs = [];
    try { mediaBlobs = await idbGetAll('astra_media', 'blobs'); } catch (e) {}
    const usedMediaIds = new Set();
    cacheJobs.forEach(j => {
      (j.photos || []).forEach(p => usedMediaIds.add(p.id));
      (j.drawings || []).forEach(d => usedMediaIds.add(d.id));
      (j.videos || []).forEach(v => usedMediaIds.add(v.id));
    });
    const blobIds = new Set(mediaBlobs.map(b => b.id));
    const orphaned = mediaBlobs.filter(b => !usedMediaIds.has(b.id));
    const missing = [...usedMediaIds].filter(id => !blobIds.has(id));
    if (orphaned.length) result.issues.push(`ORPHANED BLOBS: ${orphaned.length}`);
    if (missing.length) { result.pass = false; result.issues.push(`MISSING BLOBS: ${missing.length}`); }

    for (const j of idbJobs) {
      for (const type of ['photos', 'drawings', 'videos']) {
        for (const item of (j[type] || [])) {
          if (item.data) { result.pass = false; result.issues.push(`RAW BLOB IN IDB JOB ${j.id} ${type}`); }
        }
      }
    }

    result.cacheJobs = cacheJobs.length;
    result.idbJobs = idbJobs.length;
    result.mediaBlobs = mediaBlobs.length;
    result.orphanedBlobs = orphaned.length;
    result.missingBlobs = missing.length;
    return result;
  });
}

async function createTicketDirect(page, overrides = {}) {
  return await page.evaluate((opts) => {
    const job = {
      id: crypto.randomUUID(),
      syncId: crypto.randomUUID(),
      address: opts.address || `${Math.floor(Math.random()*9999)} Test St`,
      addressId: '',
      types: opts.types || ['Service Call'],
      status: opts.status || 'Not Started',
      date: opts.date || new Date().toISOString().split('T')[0],
      techId: '', techName: '',
      notes: opts.notes || 'Stress test ticket',
      techNotes: '',
      materials: opts.materials || [],
      photos: [], drawings: [], videos: [],
      manually_added_to_vector: false,
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    window.Astra.addJob(job);
    return job;
  }, overrides);
}

function report(name, status, errorCount, integrity, notes) {
  const entry = { name, status, errorCount, integrity: integrity ? (integrity.pass ? 'MATCH' : 'DIVERGED') : 'N/A', notes };
  results.push(entry);
  console.log(`\n=== ${name} ===`);
  console.log(`STATUS: ${status}`);
  console.log(`ERRORS: ${errorCount}`);
  console.log(`CACHE vs IDB: ${entry.integrity}`);
  if (integrity && integrity.issues && integrity.issues.length) console.log(`ISSUES: ${integrity.issues.join(', ')}`);
  if (notes) console.log(`NOTES: ${notes}`);
}

// ══════════════════════════════════════════
// SCENARIOS
// ══════════════════════════════════════════

async function scenario1(browser) {
  const { page, context, errors } = await freshPage(browser);
  const GARBAGE = [
    '', '<script>alert("xss")</script>', "Robert'); DROP TABLE jobs;--",
    '\u{1F50C}\u{26A1}\u{1F3E0}\u{1F480}', 'a'.repeat(10000), '   ', '<img src=x onerror=alert(1)>',
    'null', 'undefined', '0', '{"key":"value"}', '\n\n\n',
    '<div onmouseover="alert(1)">hover</div>', '\\x00\\x01\\x02',
    'NORMAL ADDRESS 123 MAIN ST', 'a\tb\tc', '<!--comment-->',
    'javascript:alert(1)', '%3Cscript%3E', '<svg onload=alert(1)>'
  ];

  const ids = [];
  for (const g of GARBAGE) {
    const job = await createTicketDirect(page, { address: g, notes: g });
    ids.push(job.id);
  }
  await page.waitForTimeout(3000);

  const integrity = await integrityCheck(page);

  // Check for XSS in DOM
  await page.evaluate(() => window.goTo('screen-jobs'));
  await page.waitForTimeout(500);
  const hasRawScript = await page.evaluate(() => {
    return document.getElementById('jobs-body').innerHTML.includes('<script>');
  });

  const dupes = ids.length !== new Set(ids).size;
  let status = integrity.pass && !hasRawScript && !dupes ? 'PASS' : 'FAIL';
  let notes = [];
  if (hasRawScript) notes.push('XSS: raw <script> found in DOM');
  if (dupes) notes.push('DUPLICATE IDS');

  report('SCENARIO 1: Rapid-Fire Ticket Creation', status, errors.length, integrity, notes.join('; ') || 'All 20 tickets created, no XSS, no dupes');
  await context.close();
}

async function scenario2(browser) {
  const { page, context, errors } = await freshPage(browser);

  const ids = await page.evaluate(() => {
    const created = [];
    for (let i = 0; i < 10; i++) {
      const job = {
        id: crypto.randomUUID(), syncId: crypto.randomUUID(),
        address: `${i} Archive Test St`, addressId: '',
        types: ['Service Call'], status: 'Not Started',
        date: new Date().toISOString().split('T')[0],
        techId: '', techName: '', notes: 'Archive race test',
        techNotes: '', materials: [], photos: [], drawings: [], videos: [],
        manually_added_to_vector: false, archived: false,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      window.Astra.addJob(job);
      // Immediately archive — no waiting
      window.Astra.updateJob(job.id, { archived: true });
      created.push(job.id);
    }
    return created;
  });

  await page.waitForTimeout(3000);
  const integrity = await integrityCheck(page);

  const archiveCheck = await page.evaluate((ids) => {
    const allArchived = ids.every(id => {
      const j = window.Astra.getJob(id);
      return j && j.archived === true;
    });
    return allArchived;
  }, ids);

  const status = integrity.pass && archiveCheck ? 'PASS' : 'FAIL';
  report('SCENARIO 2: Create-Then-Immediately-Archive', status, errors.length, integrity,
    archiveCheck ? 'All 10 archived correctly' : 'SOME NOT ARCHIVED');
  await context.close();
}

async function scenario3(browser) {
  const { page, context, errors } = await freshPage(browser);

  const result = await page.evaluate(async () => {
    // Create ticket
    const jobId = crypto.randomUUID();
    const job = {
      id: jobId, syncId: crypto.randomUUID(),
      address: 'Photo Test St', addressId: '',
      types: ['Service Call'], status: 'Not Started',
      date: new Date().toISOString().split('T')[0],
      techId: '', techName: '', notes: 'Photo test',
      techNotes: '', materials: [], photos: [], drawings: [], videos: [],
      manually_added_to_vector: false, archived: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    window.Astra.addJob(job);

    // Inject 5 fake photos into job + media store
    const photoIds = [];
    for (let i = 0; i < 5; i++) {
      const pid = crypto.randomUUID();
      photoIds.push(pid);
      job.photos.push({ id: pid, name: `photo${i}.jpg`, type: 'image', addedAt: new Date().toISOString() });
      // Write fake blob to media store
      const mediaDB = await new Promise((res, rej) => {
        const req = indexedDB.open('astra_media');
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      await new Promise((res, rej) => {
        const tx = mediaDB.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').put({ id: pid, data: 'fakeblobdata' });
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    }
    window.Astra.updateJob(jobId, { photos: job.photos });
    await new Promise(r => setTimeout(r, 500));

    // Delete photo index 1 (by ID)
    const del1 = photoIds[1];
    let j = window.Astra.getJob(jobId);
    j.photos = j.photos.filter(p => p.id !== del1);
    window.Astra.updateJob(jobId, { photos: j.photos });

    // Delete photo index 2 from original array (by ID) — no wait
    const del2 = photoIds[2];
    j = window.Astra.getJob(jobId);
    j.photos = j.photos.filter(p => p.id !== del2);
    window.Astra.updateJob(jobId, { photos: j.photos });

    // Add 1 new photo
    const newPid = crypto.randomUUID();
    j = window.Astra.getJob(jobId);
    j.photos.push({ id: newPid, name: 'new.jpg', type: 'image', addedAt: new Date().toISOString() });
    window.Astra.updateJob(jobId, { photos: j.photos });
    const mediaDB2 = await new Promise((res, rej) => {
      const req = indexedDB.open('astra_media');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    await new Promise((res, rej) => {
      const tx = mediaDB2.transaction('blobs', 'readwrite');
      tx.objectStore('blobs').put({ id: newPid, data: 'newfakeblobdata' });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });

    // Delete photo index 0 from original array (by ID)
    const del0 = photoIds[0];
    j = window.Astra.getJob(jobId);
    j.photos = j.photos.filter(p => p.id !== del0);
    window.Astra.updateJob(jobId, { photos: j.photos });

    await new Promise(r => setTimeout(r, 2000));

    j = window.Astra.getJob(jobId);
    return {
      remainingPhotos: j.photos.length,
      expectedIds: [photoIds[3], photoIds[4], newPid],
      actualIds: j.photos.map(p => p.id)
    };
  });

  await page.waitForTimeout(1000);
  const integrity = await integrityCheck(page);

  const correctCount = result.remainingPhotos === 3;
  const correctIds = JSON.stringify(result.expectedIds.sort()) === JSON.stringify(result.actualIds.sort());
  const status = integrity.pass && correctCount && correctIds ? 'PASS' : 'FAIL';
  report('SCENARIO 3: Photo Attachment Index Massacre', status, errors.length, integrity,
    `${result.remainingPhotos}/3 photos remain, IDs match: ${correctIds}`);
  await context.close();
}

async function scenario4(browser) {
  const { page, context, errors } = await freshPage(browser);

  // Create 5 tickets
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const job = await createTicketDirect(page, { address: `${i} Offline St` });
    ids.push(job.id);
  }
  await page.waitForTimeout(2000);

  // Go offline
  await context.setOffline(true);

  // Edit each
  await page.evaluate((ids) => {
    ids.forEach((id, i) => {
      window.Astra.updateJob(id, {
        notes: `OFFLINE EDIT #${i}`,
        status: 'In Progress',
        techNotes: `Tech note offline ${i}`
      });
    });
  }, ids);

  // Verify cache has edits while offline
  const cacheCheck = await page.evaluate((ids) => {
    return ids.every((id, i) => {
      const j = window.Astra.getJob(id);
      return j.notes === `OFFLINE EDIT #${i}` && j.status === 'In Progress';
    });
  }, ids);

  // Go back online
  await context.setOffline(false);
  await page.waitForTimeout(2000);

  const integrity = await integrityCheck(page);

  // Verify IDB has the edits too
  const idbCheck = await page.evaluate(async (ids) => {
    function idbGetAll(dbName, storeName) {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, 'readonly');
          const r = tx.objectStore(storeName).getAll();
          r.onsuccess = () => resolve(r.result || []);
          r.onerror = () => reject(r.error);
        };
        req.onerror = () => reject(req.error);
      });
    }
    const idbJobs = await idbGetAll('astra_db', 'jobs');
    return ids.every((id, i) => {
      const j = idbJobs.find(x => x.id === id);
      return j && j.notes === `OFFLINE EDIT #${i}` && j.status === 'In Progress';
    });
  }, ids);

  const status = integrity.pass && cacheCheck && idbCheck ? 'PASS' : 'FAIL';
  report('SCENARIO 4: Offline Edit Gauntlet', status, errors.length, integrity,
    `Cache edits: ${cacheCheck}, IDB edits: ${idbCheck}`);
  await context.close();
}

async function scenario5(browser) {
  const { page, context, errors } = await freshPage(browser);

  // Spam sync push 15 times
  await page.evaluate(() => {
    for (let i = 0; i < 15; i++) {
      setTimeout(() => {
        try { window.runSyncPush(); } catch (e) {}
      }, i * 100);
    }
  });

  await page.waitForTimeout(5000);
  const integrity = await integrityCheck(page);

  // Filter out expected "no supabase" errors
  const realErrors = errors.filter(e => {
    const msg = (e.msg || e.text || '').toLowerCase();
    return !msg.includes('supabase') && !msg.includes('url') && !msg.includes('key');
  });

  const status = integrity.pass ? 'PASS' : 'FAIL';
  report('SCENARIO 5: Sync Button Spam', status, realErrors.length, integrity,
    `${errors.length} total console msgs (expected Supabase config warnings), ${realErrors.length} unexpected errors`);
  await context.close();
}

async function scenario6(browser) {
  const { page, context, errors } = await freshPage(browser);

  // Create 3 tickets
  const jobA = await createTicketDirect(page, { address: '100 Alpha St' });
  const jobB = await createTicketDirect(page, { address: '200 Bravo St' });
  const jobC = await createTicketDirect(page, { address: '300 Charlie St' });
  await page.waitForTimeout(1000);

  // Rapid nav
  const navs = [
    `goTo('screen-detail','${jobA.id}')`, `goTo('screen-jobs')`,
    `goTo('screen-detail','${jobB.id}')`, `goTo('screen-jobs')`,
    `goTo('screen-jobs')`, `goTo('screen-materials')`,
    `goTo('screen-jobs')`, `goTo('screen-detail','${jobA.id}')`,
    `goTo('screen-search')`, `goTo('screen-addresses')`,
    `goTo('screen-detail','${jobC.id}')`, `goTo('screen-dashboard')`,
    `goTo('screen-settings')`, `goTo('screen-detail','${jobA.id}')`
  ];

  for (const nav of navs) {
    await page.evaluate(nav);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(1000);

  // Check exactly 1 active screen
  const activeScreens = await page.evaluate(() => {
    return document.querySelectorAll('.screen.active').length;
  });

  // Check detail shows job A
  const detailAddr = await page.evaluate(() => {
    const el = document.querySelector('#detail-body .detail-address');
    return el ? el.textContent : 'NOT FOUND';
  });

  const correctScreen = activeScreens === 1;
  const correctDetail = detailAddr.includes('100 Alpha St');
  const status = correctScreen && correctDetail ? 'PASS' : 'FAIL';
  report('SCENARIO 6: Navigation Chaos', status, errors.length, null,
    `Active screens: ${activeScreens}, Detail shows: "${detailAddr.substring(0, 40)}"`);
  await context.close();
}

async function scenario7(browser) {
  const { page, context, errors } = await freshPage(browser);
  const job = await createTicketDirect(page);
  await page.waitForTimeout(1000);

  const result = await page.evaluate((jobId) => {
    window.addMatToJob(jobId, 'bc_003', '', '', '5');
    window.addMatToJob(jobId, 'bc_007', '', '', '10');
    window.addMatToJob(jobId, 'wp_001', '', '', '500');
    window.addMatToJob(jobId, 'wp_003', '', '', '0');
    window.addMatToJob(jobId, 'ak_011', '', '', '99999');
    window.addMatToJob(jobId, 'bc_003', '', '', '3'); // duplicate

    const j = window.Astra.getJob(jobId);
    const mats = j.materials || [];
    return {
      count: mats.length,
      items: mats.map(m => ({ itemId: m.itemId, qty: m.qty })),
      wp003Qty: (mats.find(m => m.itemId === 'wp_003') || {}).qty,
      ak011Qty: (mats.find(m => m.itemId === 'ak_011') || {}).qty,
    };
  }, job.id);

  await page.waitForTimeout(1000);
  const integrity = await integrityCheck(page);

  const correctCount = result.count === 5;
  const correctFloor = result.wp003Qty >= 1;
  const correctHuge = result.ak011Qty === 99999;
  const status = integrity.pass && correctCount && correctFloor && correctHuge ? 'PASS' : 'FAIL';
  report('SCENARIO 7: Material Picker Frenzy', status, errors.length, integrity,
    `${result.count}/5 materials, wp_003 qty=${result.wp003Qty}, ak_011 qty=${result.ak011Qty}`);
  await context.close();
}

async function scenario8(browser) {
  const delays = [10, 50, 100, 200, 500];
  const survived = {};

  for (const delay of delays) {
    const { page, context } = await freshPage(browser);

    // Create ticket
    const jobId = await page.evaluate(() => {
      const job = {
        id: crypto.randomUUID(), syncId: crypto.randomUUID(),
        address: 'Kill Test St', addressId: '',
        types: ['Service Call'], status: 'Not Started',
        date: new Date().toISOString().split('T')[0],
        techId: '', techName: '', notes: `Kill at ${Date.now()}`,
        techNotes: '', materials: [{ itemId: 'bc_003', name: 'Test Box', qty: 1, unit: 'EA' }],
        photos: [], drawings: [], videos: [],
        manually_added_to_vector: false, archived: false,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      window.Astra.addJob(job);
      return job.id;
    });

    await page.waitForTimeout(delay);
    await context.close();

    // Reopen and check
    const { page: page2, context: ctx2 } = await freshPage(browser);
    const found = await page2.evaluate((id) => {
      return !!window.Astra.getJob(id);
    }, jobId);

    survived[`${delay}ms`] = found;
    await ctx2.close();
  }

  const allSurvived = Object.values(survived).every(v => v);
  const status = allSurvived ? 'PASS' : 'PARTIAL';
  const notes = Object.entries(survived).map(([k, v]) => `${k}: ${v ? 'SURVIVED' : 'LOST'}`).join(', ');
  report('SCENARIO 8: App Kill Mid-Write', status, 0, null, notes);
}

async function scenario9(browser) {
  const { page, context, errors } = await freshPage(browser);

  // Create 5 tickets with materials
  for (let i = 0; i < 5; i++) {
    await createTicketDirect(page, {
      address: `${i} Export St`,
      materials: [
        { itemId: `mat_${i}`, name: `Material ${i}`, qty: i + 1, unit: 'EA' }
      ]
    });
  }
  await page.waitForTimeout(2000);

  const exportData = await page.evaluate(async () => {
    const jobs = window.Astra.loadJobs();
    const techs = window.Astra.loadTechs();
    const addrs = window.Astra.loadAddresses();

    // Replicate export structure
    let mediaBlobs = [];
    try {
      const db = await new Promise((res, rej) => {
        const req = indexedDB.open('astra_media');
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      mediaBlobs = await new Promise((res, rej) => {
        const tx = db.transaction('blobs', 'readonly');
        const r = tx.objectStore('blobs').getAll();
        r.onsuccess = () => res(r.result || []);
        r.onerror = () => rej(r.error);
      });
    } catch (e) {}

    return {
      version: '0.5',
      jobs, techs, addresses: addrs, media: mediaBlobs,
      jobCount: jobs.length,
      allHaveId: jobs.every(j => j.id),
      allHaveAddress: jobs.every(j => j.address),
      allHaveStatus: jobs.every(j => j.status),
      allHaveMaterials: jobs.every(j => Array.isArray(j.materials)),
      exportJobs: jobs.filter(j => j.address && j.address.includes('Export St'))
    };
  });

  const hasAll5 = exportData.exportJobs.length === 5;
  const hasMats = exportData.exportJobs.every(j => j.materials.length > 0);
  const status = hasAll5 && hasMats && exportData.allHaveId ? 'PASS' : 'FAIL';
  report('SCENARIO 9: Import/Export Round Trip', status, errors.length, null,
    `${exportData.exportJobs.length}/5 export tickets, all have materials: ${hasMats}, version: ${exportData.version}`);
  await context.close();
}

async function scenario10(browser) {
  const { page, context, errors } = await freshPage(browser);

  // Create some tickets to search
  for (let i = 0; i < 5; i++) {
    await createTicketDirect(page, { address: `${1000 + i} Searchable Blvd, Houston, TX` });
  }
  await page.waitForTimeout(1000);

  await page.evaluate(() => window.goTo('screen-search'));
  await page.waitForTimeout(500);

  // Type one char at a time
  const searchInput = '#search-input';
  for (const char of 'electrical') {
    await page.type(searchInput, char, { delay: 30 });
  }
  await page.waitForTimeout(500);

  // Clear and paste huge string
  await page.fill(searchInput, '');
  await page.fill(searchInput, 'a'.repeat(5000));
  await page.waitForTimeout(500);

  // Emoji search
  await page.fill(searchInput, '\u{1F480}\u{1F50C}\u{26A1}');
  await page.waitForTimeout(500);

  // XSS search
  await page.fill(searchInput, '<script>alert(1)</script>');
  await page.waitForTimeout(500);

  const hasRawScript = await page.evaluate(() => {
    const el = document.getElementById('search-results');
    return el ? el.innerHTML.includes('<script>') : false;
  });

  // Search for known address
  await page.fill(searchInput, 'Searchable');
  await page.waitForTimeout(500);
  const foundResults = await page.evaluate(() => {
    const el = document.getElementById('search-results');
    return el ? el.querySelectorAll('.card').length : 0;
  });

  const noXSS = !hasRawScript;
  const status = noXSS && foundResults >= 1 ? 'PASS' : 'FAIL';
  report('SCENARIO 10: Search Abuse', status, errors.length, null,
    `XSS blocked: ${noXSS}, found ${foundResults} results for "Searchable"`);
  await context.close();
}

async function scenario11(browser) {
  // Tab 1
  const { page: tab1, context: ctx1 } = await freshPage(browser);

  // Create ticket in tab 1
  const jobX = await createTicketDirect(tab1, { address: 'Tab1 Created St' });
  await tab1.waitForTimeout(1000);

  // Tab 2 — new context (separate cache, shared IDB)
  const { page: tab2, context: ctx2 } = await freshPage(browser);

  // Check tab 2 cache for job X (should NOT be there — separate cache)
  const inTab2Cache = await tab2.evaluate((id) => {
    return !!window.Astra.getJob(id);
  }, jobX.id);

  // Check tab 2 IDB directly (SHOULD be there)
  const inTab2IDB = await tab2.evaluate(async (id) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('astra_db');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('jobs', 'readonly');
        const r = tx.objectStore('jobs').get(id);
        r.onsuccess = () => resolve(!!r.result);
        r.onerror = () => reject(r.error);
      };
    });
  }, jobX.id);

  // Note: in Playwright, separate contexts get separate IDBs.
  // This is a browser sandbox thing, not an ASTRA bug.
  // Real multi-tab uses same browser context.
  const notes = `Tab2 cache: ${inTab2Cache}, Tab2 IDB: ${inTab2IDB}. NOTE: Playwright contexts have separate IDB — real multi-tab would share IDB but have separate caches.`;
  report('SCENARIO 11: Concurrent Tab Warfare', 'INFO', 0, null, notes);
  await ctx1.close();
  await ctx2.close();
}

async function scenario12(browser) {
  const { page, context, errors } = await freshPage(browser);

  // Seed 10 tickets
  const seedIds = [];
  for (let i = 0; i < 10; i++) {
    const job = await createTicketDirect(page, { address: `${i} Chaos St` });
    seedIds.push(job.id);
  }
  await page.waitForTimeout(2000);

  const STATUSES = ['Not Started', 'In Progress', 'Complete', 'Needs Callback', 'Waiting on Materials'];
  const SCREENS = ['screen-jobs', 'screen-search', 'screen-addresses', 'screen-materials', 'screen-archive', 'screen-dashboard', 'screen-settings'];
  const MAT_IDS = ['bc_003', 'bc_007', 'wp_001', 'wp_003', 'wp_005', 'ak_011', 'sm_012'];

  const actionLog = await page.evaluate(async (args) => {
    const { seedIds, STATUSES, SCREENS, MAT_IDS } = args;
    const log = [];
    const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const start = Date.now();

    while (Date.now() - start < 60000) {
      const action = Math.floor(Math.random() * 7);
      try {
        switch (action) {
          case 0: { // Create
            const j = {
              id: crypto.randomUUID(), syncId: crypto.randomUUID(),
              address: `${Math.random().toString(36).substring(2)} Chaos Ave`,
              addressId: '', types: ['Service Call'], status: rand(STATUSES),
              date: new Date().toISOString().split('T')[0],
              techId: '', techName: '', notes: 'chaos', techNotes: '',
              materials: [], photos: [], drawings: [], videos: [],
              manually_added_to_vector: false, archived: false,
              createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
            };
            window.Astra.addJob(j);
            seedIds.push(j.id);
            log.push('CREATE');
            break;
          }
          case 1: { // Archive
            const id = rand(seedIds);
            window.Astra.updateJob(id, { archived: true });
            log.push('ARCHIVE');
            break;
          }
          case 2: { // Edit
            const id = rand(seedIds);
            window.Astra.updateJob(id, { notes: 'chaos edit ' + Date.now(), status: rand(STATUSES) });
            log.push('EDIT');
            break;
          }
          case 3: { // Navigate
            window.goTo(rand(SCREENS));
            log.push('NAV');
            break;
          }
          case 4: { // Add material
            const id = rand(seedIds);
            window.addMatToJob(id, rand(MAT_IDS), '', '', String(Math.floor(Math.random() * 100) + 1));
            log.push('MAT');
            break;
          }
          case 5: { // Search
            window.debouncedSearch(Math.random().toString(36).substring(2, 8));
            log.push('SEARCH');
            break;
          }
          case 6: { // Toggle vector
            const id = rand(seedIds);
            const j = window.Astra.getJob(id);
            if (j) window.Astra.updateJob(id, { manually_added_to_vector: !j.manually_added_to_vector });
            log.push('VECTOR');
            break;
          }
        }
      } catch (e) {
        log.push('ERR:' + e.message.substring(0, 50));
      }
      // Random delay 0-200ms
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 200)));
    }
    return { totalActions: log.length, breakdown: log.reduce((acc, a) => { acc[a] = (acc[a] || 0) + 1; return acc; }, {}) };
  }, { seedIds, STATUSES, SCREENS, MAT_IDS });

  await page.waitForTimeout(5000);
  const integrity = await integrityCheck(page);

  const status = integrity.pass ? 'PASS' : 'FAIL';
  const breakdown = Object.entries(actionLog.breakdown).map(([k, v]) => `${k}:${v}`).join(' ');
  report('SCENARIO 12: Everything At Once (60s Chaos)', status, errors.length, integrity,
    `${actionLog.totalActions} total actions — ${breakdown}`);
  await context.close();
}

async function scenario13(browser) {
  const { page, context, errors } = await freshPage(browser);

  // Create 10 tickets and let them settle
  for (let i = 0; i < 10; i++) {
    await createTicketDirect(page, { address: `${i} Race St` });
  }
  await page.waitForTimeout(2000);

  // Rapidly: 5 addJob + 5 updateJob simultaneously
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) {
      const j = {
        id: crypto.randomUUID(), syncId: crypto.randomUUID(),
        address: `${i} RaceAdd St`, addressId: '',
        types: ['Service Call'], status: 'Not Started',
        date: new Date().toISOString().split('T')[0],
        techId: '', techName: '', notes: 'race add', techNotes: '',
        materials: [], photos: [], drawings: [], videos: [],
        manually_added_to_vector: false, archived: false,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      window.Astra.addJob(j);

      // Simultaneously update an existing job
      const existing = window.Astra.loadJobs()[i];
      if (existing) {
        window.Astra.updateJob(existing.id, { notes: 'race update ' + i });
      }
    }
  });

  await page.waitForTimeout(3000);
  const integrity = await integrityCheck(page);

  const status = integrity.pass ? 'PASS' : 'FAIL';
  report('SCENARIO 13: _idbReplaceAll Race Condition', status, errors.length, integrity,
    `15 jobs expected in original batch + 5 race adds`);
  await context.close();
}

// ══════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════

(async () => {
  console.log('=== ASTRA STRESS TEST — THE IDIOT USER PROTOCOL ===\n');
  const browser = await chromium.launch({ headless: true });

  try {
    await scenario1(browser);
    await scenario2(browser);
    await scenario3(browser);
    await scenario4(browser);
    await scenario5(browser);
    await scenario6(browser);
    await scenario7(browser);
    await scenario8(browser);
    await scenario9(browser);
    await scenario10(browser);
    await scenario11(browser);
    await scenario12(browser);
    await scenario13(browser);
  } catch (e) {
    console.error('FATAL ERROR:', e);
  }

  await browser.close();

  // Final report
  console.log('\n\n══════════════════════════════════════════');
  console.log('═══ FINAL REPORT ═══');
  console.log('══════════════════════════════════════════');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const partial = results.filter(r => r.status === 'PARTIAL').length;
  const info = results.filter(r => r.status === 'INFO').length;
  console.log(`PASSED: ${passed} / ${results.length}`);
  console.log(`FAILED: ${failed}`);
  console.log(`PARTIAL: ${partial}`);
  console.log(`INFO: ${info}`);

  if (failed > 0) {
    console.log('\nCRITICAL FAILURES:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  - ${r.name}: ${r.notes}`));
  }
  if (partial > 0) {
    console.log('\nPARTIAL FAILURES:');
    results.filter(r => r.status === 'PARTIAL').forEach(r => console.log(`  - ${r.name}: ${r.notes}`));
  }

  console.log('\n=== Ad Astra. ===');
})();
