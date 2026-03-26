// ═══════════════════════════════════════════
// ASTRA v0.6 — FIELD SERVICE
// ═══════════════════════════════════════════
window.Astra = window.Astra || {};
(function() {
'use strict';

// ── TOAST NOTIFICATIONS ──
function showToast(msg, type) {
  type = type || 'info';
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type !== 'info' ? ' toast-' + type : '');
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toast-out 0.3s forwards';
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ── GLOBAL ERROR HANDLING ──
window.onerror = function(msg, src, line) {
  console.error('Global error:', msg, src, line);
  showToast('ERROR: ' + msg, 'error');
};
window.addEventListener('unhandledrejection', function(e) {
  console.error('Unhandled promise rejection:', e.reason);
  showToast('ERROR: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)), 'error');
});

// ── DATA LAYER (IndexedDB + In-Memory Cache) ──
const JOBS_KEY = 'astra_jobs';
const TECHS_KEY = 'astra_techs';
const ADDRS_KEY = 'astra_addresses';
const NAV_FREQ_KEY = 'astra_nav_frequency';
const HOME_BASE_KEY = 'astra_home_base';
const GMAPS_KEY_STORAGE = 'astra_gmaps_key';
const STATUSES = ['Not Started','In Progress','Complete','Needs Callback','Waiting on Materials'];
const MAT_LIB_KEY = 'astra_material_library_rough';
const MAT_LIB_TRIM_KEY = 'astra_material_library_trim';

function getGmapsKey() { return localStorage.getItem(GMAPS_KEY_STORAGE) || ''; }
function saveGmapsKey(key) { localStorage.setItem(GMAPS_KEY_STORAGE, key.trim()); }
function getHomeBase() { return localStorage.getItem(HOME_BASE_KEY) || ''; }
function saveHomeBase(val) { localStorage.setItem(HOME_BASE_KEY, val.trim()); }

function loadMaterialLibrary() {
  let rough = null, trim = null;
  try { rough = JSON.parse(localStorage.getItem(MAT_LIB_KEY)) || null; } catch {}
  try { trim = JSON.parse(localStorage.getItem(MAT_LIB_TRIM_KEY)) || null; } catch {}
  if (!rough && !trim) return null;
  const cats = [];
  if (rough && rough.categories) cats.push(...rough.categories);
  if (trim && trim.categories) cats.push(...trim.categories);
  return { categories: cats };
}
function loadRoughLibrary() {
  try { return JSON.parse(localStorage.getItem(MAT_LIB_KEY)) || null; } catch { return null; }
}
function loadTrimLibrary() {
  try { return JSON.parse(localStorage.getItem(MAT_LIB_TRIM_KEY)) || null; } catch { return null; }
}

// In-memory cache — all reads are synchronous from here
const _cache = { jobs: [], techs: [], addresses: [] };
let _astraDB = null;

function _openAstraDB() {
  return new Promise((resolve, reject) => {
    if (_astraDB) { resolve(_astraDB); return; }
    const req = indexedDB.open('astra_db', 1);
    req.onupgradeneeded = function(e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('jobs')) db.createObjectStore('jobs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('techs')) db.createObjectStore('techs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('addresses')) db.createObjectStore('addresses', { keyPath: 'id' });
    };
    req.onsuccess = function(e) { _astraDB = e.target.result; resolve(_astraDB); };
    req.onerror = function() { reject(req.error); };
  });
}

// Granular IDB operations — no more nuke-and-rebuild
// All writes detect failures and alert the user. No silent data loss.

function _idbPut(storeName, item) {
  if (!_astraDB) return;
  try {
    const tx = _astraDB.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(item);
    tx.onabort = tx.onerror = function() {
      console.error('IDB put FAILED (' + storeName + '):', tx.error);
      showToast('SAVE FAILED — RETRYING...', 'error');
      _idbPutRetry(storeName, item);
    };
  } catch (e) {
    console.error('IDB put error (' + storeName + '):', e);
    showToast('SAVE FAILED — CHECK STORAGE', 'error');
  }
}

function _idbPutRetry(storeName, item) {
  if (!_astraDB) return;
  setTimeout(function() {
    try {
      const tx = _astraDB.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(item);
      tx.oncomplete = function() { showToast('SAVE RECOVERED'); };
      tx.onabort = tx.onerror = function() {
        console.error('IDB retry FAILED (' + storeName + '):', tx.error);
        showToast('SAVE FAILED — DATA NOT SAVED. DO NOT CLOSE APP.', 'error');
      };
    } catch (e) {
      console.error('IDB retry error (' + storeName + '):', e);
      showToast('SAVE FAILED — DATA NOT SAVED. DO NOT CLOSE APP.', 'error');
    }
  }, 500);
}

function _idbDelete(storeName, id) {
  if (!_astraDB) return;
  try {
    const tx = _astraDB.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    tx.onabort = tx.onerror = function() {
      console.error('IDB delete FAILED (' + storeName + '):', tx.error);
      showToast('DELETE FAILED — TRY AGAIN', 'error');
    };
  } catch (e) { console.error('IDB delete error (' + storeName + '):', e); }
}

function _idbReplaceAll(storeName, items) {
  if (!_astraDB) return;
  try {
    const tx = _astraDB.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    items.forEach(item => store.put(item));
    tx.onabort = tx.onerror = function() {
      console.error('IDB replaceAll FAILED (' + storeName + '):', tx.error);
      showToast('BULK SAVE FAILED — DATA NOT SAVED. DO NOT CLOSE APP.', 'error');
    };
  } catch (e) {
    console.error('IDB replaceAll error (' + storeName + '):', e);
    showToast('BULK SAVE FAILED — CHECK STORAGE', 'error');
  }
}

function _cleanJobForStorage(j) {
  return {
    ...j,
    photos: (j.photos || []).map(p => ({ id: p.id, name: p.name, type: p.type || 'image', addedAt: p.addedAt })),
    drawings: (j.drawings || []).map(d => ({ id: d.id, name: d.name, type: d.type || 'image', addedAt: d.addedAt })),
    videos: (j.videos || []).map(v => ({ id: v.id, name: v.name, type: 'video', mimeType: v.mimeType, addedAt: v.addedAt }))
  };
}

function _idbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    if (!_astraDB) { resolve([]); return; }
    const tx = _astraDB.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function initDataLayer() {
  await _openAstraDB();

  // Try loading from IDB first
  const [idbJobs, idbTechs, idbAddrs] = await Promise.all([
    _idbGetAll('jobs'), _idbGetAll('techs'), _idbGetAll('addresses')
  ]);

  if (idbJobs.length > 0 || idbTechs.length > 0 || idbAddrs.length > 0) {
    _cache.jobs = idbJobs;
    _cache.techs = idbTechs;
    _cache.addresses = idbAddrs;
  } else {
    // Migrate from localStorage on first run
    try { _cache.jobs = JSON.parse(localStorage.getItem(JOBS_KEY)) || []; } catch { _cache.jobs = []; }
    try { _cache.techs = JSON.parse(localStorage.getItem(TECHS_KEY)) || []; } catch { _cache.techs = []; }
    try { _cache.addresses = JSON.parse(localStorage.getItem(ADDRS_KEY)) || []; } catch { _cache.addresses = []; }
    // Persist to IDB
    _idbReplaceAll('jobs', _cache.jobs);
    _idbReplaceAll('techs', _cache.techs);
    _idbReplaceAll('addresses', _cache.addresses);
    // Clean up localStorage business data (keep settings)
    localStorage.removeItem(JOBS_KEY);
    localStorage.removeItem(TECHS_KEY);
    localStorage.removeItem(ADDRS_KEY);
  }

  // Seed default tech
  if (_cache.techs.length === 0) {
    _cache.techs = [{ id: crypto.randomUUID(), name: 'Mike Torres' }];
    _idbReplaceAll('techs', _cache.techs);
  }

  // Migrate dates + ensure fields exist
  let changed = false;
  _cache.jobs.forEach(j => {
    if (!j.date) {
      j.date = j.createdAt ? j.createdAt.split('T')[0] : todayStr();
      changed = true;
    }
    if (!j.videos) { j.videos = []; changed = true; }
    if (j.techNotes === undefined) { j.techNotes = ''; changed = true; }
    if (j.manually_added_to_vector === undefined) { j.manually_added_to_vector = false; changed = true; }
    // Backfill addressId for legacy jobs
    if (!j.addressId && j.address) {
      const match = _cache.addresses.find(a => a.address.toLowerCase() === j.address.toLowerCase());
      if (match) { j.addressId = match.id; changed = true; }
    }
  });
  if (changed) _idbReplaceAll('jobs', _cache.jobs);
}

// Synchronous read/write API
function loadJobs() { return _cache.jobs; }
function replaceAllJobs(jobs) {
  _cache.jobs = jobs.map(j => _cleanJobForStorage(j));
  _idbReplaceAll('jobs', _cache.jobs);
}
function loadTechs() { return _cache.techs; }
function replaceAllTechs(techs) { _cache.techs = techs; _idbReplaceAll('techs', techs); }
function loadAddresses() { return _cache.addresses; }
function replaceAllAddresses(addrs) { _cache.addresses = addrs; _idbReplaceAll('addresses', addrs); }
function getAddress(id) { return _cache.addresses.find(a => a.id === id); }
function updateAddress(id, updates) {
  const idx = _cache.addresses.findIndex(a => a.id === id);
  if (idx === -1) return;
  Object.assign(_cache.addresses[idx], updates);
  _idbPut('addresses', _cache.addresses[idx]);
}
function addAddress(addr) {
  _cache.addresses.push(addr);
  _idbPut('addresses', addr);
}
function statusClass(s) { return 'badge-' + s.toLowerCase().replace(/\s+/g, '-'); }
function getJob(id) { return _cache.jobs.find(j => j.id === id); }
function updateJob(id, updates) {
  const idx = _cache.jobs.findIndex(j => j.id === id);
  if (idx === -1) return;
  Object.assign(_cache.jobs[idx], updates, { updatedAt: new Date().toISOString() });
  _idbPut('jobs', _cleanJobForStorage(_cache.jobs[idx]));
}
function addJob(job) {
  _cache.jobs.unshift(job);
  _idbPut('jobs', _cleanJobForStorage(job));
}

// ── INDEXEDDB MEDIA STORE ──
let mediaDB = null;

function openMediaDB() {
  return new Promise((resolve, reject) => {
    if (mediaDB) { resolve(mediaDB); return; }
    const req = indexedDB.open('astra_media', 1);
    req.onupgradeneeded = function(e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
    };
    req.onsuccess = function(e) { mediaDB = e.target.result; resolve(mediaDB); };
    req.onerror = function() { reject(req.error); };
  });
}

async function saveMediaBlob(id, data) {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').put({ id, data });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getMediaBlob(id) {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readonly');
    const req = tx.objectStore('blobs').get(id);
    req.onsuccess = () => resolve(req.result ? req.result.data : null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteMediaBlob(id) {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllMediaBlobs() {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readonly');
    const req = tx.objectStore('blobs').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function clearAllMediaBlobs() {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getMediaDBSize() {
  const blobs = await getAllMediaBlobs();
  let total = 0;
  blobs.forEach(b => {
    if (b.data instanceof Blob) total += b.data.size;
    else if (typeof b.data === 'string') total += b.data.length;
  });
  return total;
}

async function cleanOrphanedMedia() {
  const allBlobs = await getAllMediaBlobs();
  const jobs = loadJobs();
  const usedIds = new Set();
  jobs.forEach(j => {
    (j.photos || []).forEach(p => usedIds.add(p.id));
    (j.drawings || []).forEach(d => usedIds.add(d.id));
    (j.videos || []).forEach(v => usedIds.add(v.id));
  });
  let cleaned = 0;
  for (const blob of allBlobs) {
    if (!usedIds.has(blob.id)) {
      await deleteMediaBlob(blob.id);
      cleaned++;
    }
  }
  if (cleaned > 0) console.log('Cleaned ' + cleaned + ' orphaned media blobs.');
}

async function migrateLegacyMedia() {
  let migrated = false;
  for (const j of _cache.jobs) {
    for (const type of ['photos', 'drawings']) {
      if (!j[type]) continue;
      for (const item of j[type]) {
        if (item.data && typeof item.data === 'string' && item.data.startsWith('data:')) {
          if (!item.id) item.id = crypto.randomUUID();
          await saveMediaBlob(item.id, item.data);
          delete item.data;
          migrated = true;
        }
      }
    }
    if (!j.videos) j.videos = [];
  }
  if (migrated) _idbReplaceAll('jobs', _cache.jobs);
}

// ── REQUEST PERSISTENT STORAGE ──
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then(granted => {
    if (!granted) console.warn('Persistent storage denied — data may be evicted by browser.');
  });
}

// Init — data layer must be ready before any rendering
initDataLayer()
  .then(() => window.autoLoadBuiltInLibraries && window.autoLoadBuiltInLibraries())
  .then(() => openMediaDB())
  .then(() => migrateLegacyMedia())
  .then(() => { renderJobList(); cleanOrphanedMedia(); })
  .catch(e => console.error('Init failed:', e));

// ═══════════════════════════════════════════
// NAVIGATION + SIDEBAR
// ═══════════════════════════════════════════
let currentScreen = 'screen-jobs';
let currentJobId = null;
let homeView = 'daily';
let archiveView = 'daily';

const SCREEN_ICONS = {
  'screen-search': '⌕', 'screen-addresses': '◎', 'screen-vector': '▷',
  'screen-materials': '☰', 'screen-archive': '▣', 'screen-dashboard': '◧', 'screen-settings': '⚙'
};
const SCREEN_LABELS = {
  'screen-jobs': 'HOME', 'screen-search': 'SEARCH', 'screen-addresses': 'ADDRESSES',
  'screen-vector': 'VECTOR', 'screen-materials': 'MATERIALS', 'screen-archive': 'ARCHIVE',
  'screen-dashboard': 'DASHBOARD', 'screen-settings': 'SETTINGS'
};
const DEFAULT_SHORTCUTS = ['screen-search', 'screen-addresses', 'screen-vector'];

function loadNavFreq() {
  try { return JSON.parse(localStorage.getItem(NAV_FREQ_KEY)) || {}; } catch { return {}; }
}
function saveNavFreq(freq) { localStorage.setItem(NAV_FREQ_KEY, JSON.stringify(freq)); }

function trackNavigation(screenId) {
  if (screenId === 'screen-jobs' || screenId === 'screen-detail' ||
      screenId === 'screen-create' || screenId === 'screen-addr-detail') return;
  const freq = loadNavFreq();
  freq[screenId] = (freq[screenId] || 0) + 1;
  saveNavFreq(freq);
}

function getShortcuts() {
  const freq = loadNavFreq();
  const totalNavs = Object.values(freq).reduce((a, b) => a + b, 0);
  if (totalNavs < 10) return DEFAULT_SHORTCUTS;
  return Object.entries(freq)
    .filter(([k]) => k !== 'screen-jobs')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
}

function renderShortcuts() {
  const shortcuts = getShortcuts();
  const el = document.getElementById('nav-shortcuts');
  el.innerHTML = shortcuts.map(s =>
    `<button class="nav-shortcut${currentScreen === s ? ' sc-active' : ''}" onclick="goTo('${s}')" title="${SCREEN_LABELS[s] || ''}">${SCREEN_ICONS[s] || '·'}</button>`
  ).join('');
}

function updateSidebarActive() {
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.classList.toggle('sb-active', item.dataset.screen === currentScreen);
  });
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
}

let skipPushState = false;

function goTo(screenId, jobId) {
  closeSidebar();
  initScreen(screenId, jobId);

  // Transition
  const prev = document.getElementById(currentScreen);
  const next = document.getElementById(screenId);
  if (prev) prev.classList.remove('active');
  if (next) next.classList.add('active');
  currentScreen = screenId;

  const scrollBody = next ? next.querySelector('.screen-body') : null;
  if (scrollBody) scrollBody.scrollTop = 0;

  // Browser history for back/forward buttons
  if (!skipPushState) {
    const state = { screen: screenId };
    if (jobId !== undefined) state.jobId = jobId;
    history.pushState(state, '', '');
  }

  trackNavigation(screenId);
  renderShortcuts();
  updateSidebarActive();
}

function initScreen(screenId, jobId) {
  if (screenId === 'screen-jobs') renderJobList();
  if (screenId === 'screen-archive') renderArchiveList();
  if (screenId === 'screen-dashboard') renderDashboard();
  if (screenId === 'screen-addresses') { renderAddressList(''); const s = document.getElementById('addr-search'); if(s) s.value = ''; }
  if (screenId === 'screen-addr-detail' && jobId !== undefined) renderAddrDetail(jobId);
  if (screenId === 'screen-materials' && window.renderMaterials) window.renderMaterials();
  if (screenId === 'screen-vector' && window.renderMap) window.renderMap();
  if (screenId === 'screen-settings') renderSettings();
  if (screenId === 'screen-search') {
    setTimeout(() => {
      const inp = document.getElementById('search-input');
      if (inp) { inp.value = ''; inp.focus(); }
      const res = document.getElementById('search-results');
      if (res) res.innerHTML = '<div class="search-hint">SEARCH ALL TICKETS</div>';
    }, 200);
  }
  if (screenId === 'screen-detail' && jobId !== undefined) {
    currentJobId = jobId;
    renderDetail(jobId);
  }
  if (screenId === 'screen-create') resetCreateForm();
}

// Browser back/forward button support
window.addEventListener('popstate', function(e) {
  if (e.state && e.state.screen) {
    skipPushState = true;
    goTo(e.state.screen, e.state.jobId);
    skipPushState = false;
  } else {
    skipPushState = true;
    goTo('screen-jobs');
    skipPushState = false;
  }
});

// Set initial history state
history.replaceState({ screen: 'screen-jobs' }, '', '');

// ═══════════════════════════════════════════
// ISO WEEK UTILITIES
// ═══════════════════════════════════════════
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getISOWeekYear(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}

function getWeekRange(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayNum = jan4.getUTCDay() || 7;
  const mon = new Date(jan4);
  mon.setUTCDate(jan4.getUTCDate() - dayNum + 1 + (week - 1) * 7);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return months[mon.getUTCMonth()] + ' ' + mon.getUTCDate() + '–' + (sun.getUTCMonth() !== mon.getUTCMonth() ? months[sun.getUTCMonth()] + ' ' : '') + sun.getUTCDate();
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ═══════════════════════════════════════════
// HOME SCREEN — DAILY / WEEKLY
// ═══════════════════════════════════════════
function setHomeView(view) {
  homeView = view;
  document.querySelectorAll('#home-toggle .date-toggle-btn').forEach((btn, i) => {
    btn.classList.toggle('active', (i === 0 && view === 'daily') || (i === 1 && view === 'weekly'));
  });
  renderJobList();
}

function renderJobList() {
  const allJobs = loadJobs().filter(j => !j.archived);
  const el = document.getElementById('jobs-body');
  if (!el) return;

  if (allJobs.length === 0) {
    el.innerHTML = '<div class="empty-state"><div>⚡</div><div>NO TICKETS</div></div>';
    return;
  }

  if (homeView === 'daily') {
    const today = todayStr();
    const jobs = allJobs.filter(j => j.date === today);
    if (jobs.length === 0) {
      el.innerHTML = '<div class="empty-state"><div>—</div><div>NO TICKETS DUE TODAY</div></div>';
      return;
    }
    el.innerHTML = jobs.map(j => jobCard(j)).join('');
  } else {
    // Weekly view — group by ISO week
    const grouped = {};
    allJobs.forEach(j => {
      const d = new Date(j.date + 'T00:00:00');
      const week = getISOWeek(d);
      const year = getISOWeekYear(d);
      const key = year + '-' + String(week).padStart(2, '0');
      if (!grouped[key]) grouped[key] = { week, year, jobs: [] };
      grouped[key].jobs.push(j);
    });
    const sortedKeys = Object.keys(grouped).sort();
    if (sortedKeys.length === 0) {
      el.innerHTML = '<div class="empty-state"><div>—</div><div>NO TICKETS</div></div>';
      return;
    }
    const nowWeek = getISOWeek(new Date());
    const nowYear = getISOWeekYear(new Date());
    const currentKey = nowYear + '-' + String(nowWeek).padStart(2, '0');
    let html = '';
    sortedKeys.forEach(key => {
      const g = grouped[key];
      const range = getWeekRange(g.year, g.week);
      const isCurrent = key === currentKey;
      html += `<div class="week-header${isCurrent ? '' : ' collapsed'}" onclick="toggleWeek(this)"><span>WEEK ${g.week} — ${range}</span><span class="wh-arrow">▼</span></div>`;
      html += `<div class="week-group${isCurrent ? '' : ' collapsed'}">${g.jobs.map(j => jobCard(j)).join('')}</div>`;
    });
    el.innerHTML = html;
  }
}

function toggleWeek(el) {
  el.classList.toggle('collapsed');
  const group = el.nextElementSibling;
  if (group) group.classList.toggle('collapsed');
}

function autoExpand(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function jobCard(j) {
  const dateStr = j.date ? new Date(j.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  return `<div class="card" onclick="goTo('screen-detail','${j.id}')">
    <div class="card-address">${esc(j.address)}</div>
    <div class="card-meta">
      ${j.types.map(t => `<span class="badge badge-type">${esc(t).toUpperCase()}</span>`).join('')}
      <span class="badge ${statusClass(j.status)}">${esc(j.status).toUpperCase()}</span>
      ${dateStr ? `<span class="card-due">${dateStr}</span>` : ''}
    </div>
  </div>`;
}

// ═══════════════════════════════════════════
// ARCHIVE — DAILY / WEEKLY (PARITY WITH HOME)
// ═══════════════════════════════════════════
function setArchiveView(view) {
  archiveView = view;
  document.querySelectorAll('#archive-toggle .date-toggle-btn').forEach((btn, i) => {
    btn.classList.toggle('active', (i === 0 && view === 'daily') || (i === 1 && view === 'weekly'));
  });
  renderArchiveList();
}

function renderArchiveList() {
  const allJobs = loadJobs().filter(j => j.archived);
  const el = document.getElementById('archive-body');
  if (!el) return;

  if (allJobs.length === 0) {
    el.innerHTML = '<div class="empty-state"><div>▣</div><div>NO ARCHIVED TICKETS</div></div>';
    return;
  }

  if (archiveView === 'daily') {
    const today = todayStr();
    const jobs = allJobs.filter(j => j.date === today);
    if (jobs.length === 0) {
      el.innerHTML = '<div class="empty-state"><div>—</div><div>NO ARCHIVED TICKETS FOR TODAY</div></div>';
      return;
    }
    el.innerHTML = jobs.map(j => jobCard(j)).join('');
  } else {
    const grouped = {};
    allJobs.forEach(j => {
      const d = new Date(j.date + 'T00:00:00');
      const week = getISOWeek(d);
      const year = getISOWeekYear(d);
      const key = year + '-' + String(week).padStart(2, '0');
      if (!grouped[key]) grouped[key] = { week, year, jobs: [] };
      grouped[key].jobs.push(j);
    });
    const sortedKeys = Object.keys(grouped).sort().reverse(); // newest first for archive
    let html = '';
    const first = sortedKeys[0]; // most recent week expanded
    sortedKeys.forEach(key => {
      const g = grouped[key];
      const range = getWeekRange(g.year, g.week);
      const isFirst = key === first;
      html += `<div class="week-header${isFirst ? '' : ' collapsed'}" onclick="toggleWeek(this)"><span>WEEK ${g.week} — ${range}</span><span class="wh-arrow">▼</span></div>`;
      html += `<div class="week-group${isFirst ? '' : ' collapsed'}">${g.jobs.map(j => jobCard(j)).join('')}</div>`;
    });
    el.innerHTML = html;
  }
}

// ═══════════════════════════════════════════
// CREATE TICKET
// ═══════════════════════════════════════════
function buildFullAddress() {
  const street = document.getElementById('c-street').value.trim();
  const suite = document.getElementById('c-suite').value.trim();
  const city = document.getElementById('c-city').value.trim();
  const state = document.getElementById('c-state').value;
  const zip = document.getElementById('c-zip').value.trim();
  const line1 = suite ? street + ', ' + suite : street;
  const parts = [line1, city, state].filter(Boolean);
  return zip ? parts.join(', ') + ' ' + zip : parts.join(', ');
}

let gPlacesAutocomplete = null;

function resetCreateForm() {
  document.getElementById('c-street').value = '';
  document.getElementById('c-suite').value = '';
  document.getElementById('c-city').value = '';
  document.getElementById('c-state').value = 'TX';
  document.getElementById('c-zip').value = '';
  document.querySelectorAll('#c-types .chip').forEach(c => c.classList.remove('selected'));
  document.getElementById('c-status').value = 'Not Started';
  document.getElementById('c-date').value = todayStr();
  document.getElementById('c-notes').value = '';
  if (window.Astra && window.Astra.clearCreateTicketMaterials) window.Astra.clearCreateTicketMaterials();
  const matList = document.getElementById('create-materials-list');
  if (matList) matList.innerHTML = '';
  const err = document.getElementById('c-date-error');
  if (err) err.classList.remove('visible');
  const sel = document.getElementById('c-tech');
  const techs = loadTechs();
  sel.innerHTML = '<option value="">—</option>' +
    techs.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  initPlacesAutocomplete();
}

function dismissGmapsBanner() {
  // Purge any Google error banners
  document.querySelectorAll('.dismissButton, .gm-err-container').forEach(el => el.closest('div[style]')?.remove() || el.remove());
  // Nuclear: find the white overlay Google injects
  document.querySelectorAll('div[style*="background-color: white"], div[style*="background-color: rgb(255, 255, 255)"]').forEach(el => {
    if (el.textContent.includes('Google Maps') || el.textContent.includes('Do you own')) el.remove();
  });
}

function initPlacesAutocomplete() {
  gPlacesAutocomplete = null;
  const key = getGmapsKey();
  if (!key) return;
  if (!window.google || !window.google.maps || !window.google.maps.places) {
    loadGmaps().then(() => {
      setTimeout(() => { attachPlacesAutocomplete(); dismissGmapsBanner(); }, 200);
      setTimeout(dismissGmapsBanner, 1000);
      setTimeout(dismissGmapsBanner, 3000);
    }).catch(e => console.warn('GMAPS LOAD FAILED:', e));
    return;
  }
  setTimeout(() => { attachPlacesAutocomplete(); dismissGmapsBanner(); }, 200);
  setTimeout(dismissGmapsBanner, 1000);
  setTimeout(dismissGmapsBanner, 3000);
}

function attachPlacesAutocomplete() {
  const input = document.getElementById('c-street');
  if (!input || !window.google || !window.google.maps || !window.google.maps.places) return;
  // Remove autocomplete="off" so Google widget can work
  input.removeAttribute('autocomplete');
  // Clean up old pac-containers
  document.querySelectorAll('.pac-container').forEach(el => el.remove());
  gPlacesAutocomplete = new google.maps.places.Autocomplete(input, {
    types: ['address'],
    componentRestrictions: { country: 'us' },
    fields: ['address_components', 'formatted_address', 'geometry']
  });
  // Bias toward Houston area
  const houstonBounds = new google.maps.LatLngBounds(
    new google.maps.LatLng(29.5, -95.8),
    new google.maps.LatLng(30.2, -95.0)
  );
  gPlacesAutocomplete.setBounds(houstonBounds);
  gPlacesAutocomplete.addListener('place_changed', () => {
    const place = gPlacesAutocomplete.getPlace();
    if (!place || !place.address_components) return;
    document.getElementById('c-addr-suggest').style.display = 'none';
    let streetNum = '', route = '', city = '', state = '', zip = '', suite = '';
    for (const c of place.address_components) {
      const t = c.types[0];
      if (t === 'street_number') streetNum = c.long_name;
      else if (t === 'route') route = c.short_name;
      else if (t === 'locality') city = c.long_name;
      else if (t === 'administrative_area_level_1') state = c.short_name;
      else if (t === 'postal_code') zip = c.long_name;
      else if (t === 'subpremise') suite = c.long_name;
    }
    document.getElementById('c-street').value = (streetNum + ' ' + route).trim();
    document.getElementById('c-suite').value = suite;
    document.getElementById('c-city').value = city;
    document.getElementById('c-state').value = state;
    document.getElementById('c-zip').value = zip;
  });
}

function addrAutocomplete(val) {
  const el = document.getElementById('c-addr-suggest');
  const q = val.trim().toLowerCase();
  if (!q || q.length < 2) { el.style.display = 'none'; return; }
  const addrs = loadAddresses().filter(a => a.address.toLowerCase().includes(q)).slice(0, 5);
  if (!addrs.length) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = addrs.map(a =>
    `<div class="addr-suggest-item" onclick="pickAddr('${a.id}')">${esc(a.address)}</div>`
  ).join('');
}

function pickAddr(addrId) {
  const a = getAddress(addrId);
  if (!a) return;
  document.getElementById('c-street').value = a.street || a.address || '';
  document.getElementById('c-suite').value = a.suite || '';
  document.getElementById('c-city').value = a.city || '';
  document.getElementById('c-state').value = a.state || 'TX';
  document.getElementById('c-zip').value = a.zip || '';
  document.getElementById('c-addr-suggest').style.display = 'none';
}

function saveNewTicket() {
  const street = document.getElementById('c-street').value.trim();
  if (!street) { document.getElementById('c-street').focus(); return; }

  const dateVal = document.getElementById('c-date').value;
  if (!dateVal) {
    document.getElementById('c-date-error').classList.add('visible');
    document.getElementById('c-date').focus();
    return;
  }

  const address = buildFullAddress();
  const addrComponents = {
    street, suite: document.getElementById('c-suite').value.trim(),
    city: document.getElementById('c-city').value.trim(),
    state: document.getElementById('c-state').value,
    zip: document.getElementById('c-zip').value.trim()
  };

  const types = [];
  document.querySelectorAll('#c-types .chip.selected').forEach(c => types.push(c.textContent));
  const techSel = document.getElementById('c-tech');
  const techId = techSel.value;
  const techName = techSel.options[techSel.selectedIndex]?.text || '';
  const addressId = findOrCreateAddress(address, addrComponents);

  const job = {
    id: crypto.randomUUID(), syncId: crypto.randomUUID(),
    address, addressId,
    types: types.length ? types : ['GENERAL'],
    status: document.getElementById('c-status').value,
    date: dateVal,
    techId, techName: techId ? techName : '',
    notes: document.getElementById('c-notes').value,
    techNotes: '',
    materials: (window.Astra && window.Astra.getCreateTicketMaterials) ? [...window.Astra.getCreateTicketMaterials()] : [],
    photos: [], drawings: [], videos: [],
    manually_added_to_vector: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (window.Astra && window.Astra.clearCreateTicketMaterials) window.Astra.clearCreateTicketMaterials();
  addJob(job);
  goTo('screen-jobs');
}

// ═══════════════════════════════════════════
// TICKET DETAIL
// ═══════════════════════════════════════════
async function renderDetail(jobId) {
  const j = getJob(jobId);
  if (!j) return;
  if (!j.videos) j.videos = [];

  const techs = loadTechs();
  const typeBadges = j.types.map(t => `<span class="badge badge-type">${esc(t).toUpperCase()}</span>`).join('');
  const dateFormatted = j.date ? new Date(j.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase() : '—';

  async function thumbHTML(items, type) {
    const parts = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const data = await getMediaBlob(item.id);
      const src = (data instanceof Blob) ? URL.createObjectURL(data) : (data || '');
      if (item.type === 'pdf') {
        parts.push(`<div class="media-thumb" onclick="openMedia('${jobId}','${type}',${i})" style="display:flex;align-items:center;justify-content:center;background:#2a2a2a;">
          <div style="text-align:center;"><div style="font-size:28px;">📄</div><div style="font-size:10px;color:#888;margin-top:4px;">PDF</div></div>
          <button class="media-delete" onclick="event.stopPropagation();deleteMedia('${jobId}','${type}','${item.id}')">✕</button>
          <div class="media-thumb-label">${esc(item.name)}</div>
        </div>`);
      } else if (item.type === 'video') {
        parts.push(`<div class="media-thumb" onclick="openMedia('${jobId}','${type}',${i})">
          <video src="${src}" muted preload="metadata"></video>
          <div class="video-badge">▶</div>
          <button class="media-delete" onclick="event.stopPropagation();deleteMedia('${jobId}','${type}','${item.id}')">✕</button>
        </div>`);
      } else {
        parts.push(`<div class="media-thumb" onclick="openMedia('${jobId}','${type}',${i})">
          <img src="${src}" alt="${esc(item.name)}">
          <button class="media-delete" onclick="event.stopPropagation();deleteMedia('${jobId}','${type}','${item.id}')">✕</button>
          ${type === 'drawings' ? '<div class="media-thumb-label">' + esc(item.name) + '</div>' : ''}
        </div>`);
      }
    }
    return parts.join('');
  }

  const photoThumbs = await thumbHTML(j.photos, 'photos');
  const drawingThumbs = await thumbHTML(j.drawings, 'drawings');
  const videoThumbs = await thumbHTML(j.videos, 'videos');

  const vectorBtnClass = j.manually_added_to_vector ? 'btn-vector in-vector' : 'btn-vector';
  const vectorBtnText = j.manually_added_to_vector ? 'REMOVE FROM VECTOR' : 'ADD TO VECTOR';

  document.getElementById('detail-body').innerHTML = `
    <div class="detail-header">
      <div class="detail-address">${esc(j.address)}</div>
      <div style="display:flex;gap:12px;margin-bottom:8px;">
        ${j.addressId ? `<button class="btn-navigate" onclick="goTo('screen-addr-detail','${j.addressId}')">PROPERTY</button>` : ''}
        <button class="btn-navigate" onclick="navigateTo('${esc(j.address).replace(/'/g, "\\'")}')">NAVIGATE</button>
      </div>
      <div class="card-meta" style="margin-bottom:10px;">
        ${typeBadges}
        <span class="badge ${statusClass(j.status)} badge-status" onclick="openStatusPicker()">${esc(j.status).toUpperCase()}</span>
      </div>
      <div class="detail-row"><span>DUE DATE</span><span>${dateFormatted}</span></div>
      <div class="detail-row"><span>TECH</span>
        <select class="select-dark" onchange="updateJob('${jobId}',{techId:this.value,techName:this.options[this.selectedIndex].text})">
          <option value="">UNASSIGNED</option>
          ${techs.map(t => `<option value="${t.id}" ${t.id===j.techId?'selected':''}>${esc(t.name)}</option>`).join('')}
        </select>
      </div>
    </div>

    <button class="${vectorBtnClass}" onclick="toggleVector('${jobId}')">${vectorBtnText}</button>

    <div class="section-title">JOB NOTES</div>
    <div class="notes-box">${esc(j.notes) || '<span style="color:#333;">NO JOB NOTES.</span>'}</div>

    <div class="section-title">TECH NOTES</div>
    <div class="field" style="margin-bottom:0;">
      <textarea id="detail-tech-notes" style="min-height:90px;" placeholder="NOTES FROM THE JOB..." onblur="updateJob('${jobId}',{techNotes:this.value})">${esc(j.techNotes || '')}</textarea>
    </div>

    <div class="section-title">PHOTOS${j.photos.length ? ' (' + j.photos.length + ')' : ''}</div>
    <button class="upload-btn" onclick="document.getElementById('photo-input').click()">ADD PHOTOS</button>
    ${j.photos.length ? '<div class="media-grid">' + photoThumbs + '</div>' : ''}

    <div class="section-title">VIDEOS${j.videos.length ? ' (' + j.videos.length + ')' : ''}</div>
    <button class="upload-btn" onclick="document.getElementById('video-input').click()">ADD VIDEOS</button>
    ${j.videos.length ? '<div class="media-grid">' + videoThumbs + '</div>' : ''}

    <div class="section-title">DRAWINGS${j.drawings.length ? ' (' + j.drawings.length + ')' : ''}</div>
    <button class="upload-btn" onclick="document.getElementById('drawing-input').click()">UPLOAD DRAWING</button>
    ${j.drawings.length ? '<div class="media-grid">' + drawingThumbs + '</div>' : ''}

    <div class="section-title" onclick="toggleMatSection()" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
      <span>MATERIALS${(j.materials||[]).length ? ' (' + (j.materials||[]).length + ')' : ''}</span>
      <span id="mat-section-arrow" style="font-size:14px;color:#555;transition:transform 0.2s;transform:rotate(-90deg);">▼</span>
    </div>
    <button class="upload-btn" onclick="openMatPicker('${jobId}')">ADD MATERIALS</button>
    <div id="mat-section-collapsible" style="display:none;">
      <div id="job-materials-list"></div>
    </div>

    ${j.archived
      ? `<button class="btn btn-restore" onclick="unarchiveJob('${jobId}')">RESTORE</button>`
      : `<button class="btn btn-danger" onclick="archiveJob('${jobId}')">ARCHIVE</button>`
    }
    <div class="spacer"></div>
  `;
  if (window.renderJobMaterials) window.renderJobMaterials(jobId);
}

function toggleMatSection() {
  const el = document.getElementById('mat-section-collapsible');
  const arrow = document.getElementById('mat-section-arrow');
  if (!el) return;
  if (el.style.display === 'none') {
    el.style.display = '';
    if (arrow) arrow.style.transform = '';
  } else {
    el.style.display = 'none';
    if (arrow) arrow.style.transform = 'rotate(-90deg)';
  }
}

function toggleVector(jobId) {
  const j = getJob(jobId);
  if (!j) return;
  updateJob(jobId, { manually_added_to_vector: !j.manually_added_to_vector });
  renderDetail(jobId);
}

// ═══════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════
let _searchTimer = null;
function debouncedSearch(query) {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => runSearch(query), 200);
}
function runSearch(query) {
  const el = document.getElementById('search-results');
  const q = query.trim().toLowerCase();
  if (!q) { el.innerHTML = '<div class="search-hint">SEARCH ALL TICKETS</div>'; return; }

  const jobs = loadJobs();
  const matches = jobs.filter(j => {
    const hay = [j.address, j.techName, j.notes, j.techNotes, j.status, ...j.types].join(' ').toLowerCase();
    return q.split(/\s+/).every(w => hay.includes(w));
  });

  if (!matches.length) { el.innerHTML = '<div class="search-hint">NO RESULTS FOR "' + esc(query).toUpperCase() + '"</div>'; return; }

  const active = matches.filter(j => !j.archived);
  const archived = matches.filter(j => j.archived);
  let html = '';
  if (active.length) {
    html += '<div class="search-divider">ACTIVE (' + active.length + ')</div>';
    html += active.map(j => jobCard(j)).join('');
  }
  if (archived.length) {
    html += '<div class="search-divider">ARCHIVED (' + archived.length + ')</div>';
    html += archived.map(j => jobCard(j)).join('');
  }
  el.innerHTML = html;
}

// ═══════════════════════════════════════════
// ADDRESS DATABASE
// ═══════════════════════════════════════════
const ADDR_FIELDS = [
  { key: 'builder', label: 'BUILDER' },
  { key: 'subdivision', label: 'SUBDIVISION' },
  { key: 'panelType', label: 'PANEL TYPE' },
  { key: 'ampRating', label: 'AMP RATING', options: ['100A','150A','200A','250A','300A','400A','600A'] },
  { key: 'breakerType', label: 'BREAKER TYPE', options: ['SQD','CH','BR','SIEM'] },
  { key: 'serviceType', label: 'SERVICE TYPE', options: ['Underground','Overhead'] },
  { key: 'panelLocation', label: 'PANEL LOCATION', options: ['Indoor','Outdoor'] },
  { key: 'notes', label: 'PROPERTY NOTES', textarea: true }
];

function renderAddressList(query) {
  const addrs = loadAddresses();
  const q = (query || '').trim().toLowerCase();
  const filtered = q ? addrs.filter(a => {
    const hay = [a.address, a.builder, a.subdivision, a.panelType, a.ampRating, a.breakerType, a.notes].join(' ').toLowerCase();
    return q.split(/\s+/).every(w => hay.includes(w));
  }) : addrs;

  const el = document.getElementById('addr-list');
  if (!filtered.length) {
    el.innerHTML = q
      ? '<div class="search-hint">NO PROPERTIES MATCH "' + esc(query).toUpperCase() + '"</div>'
      : '<div class="empty-state"><div>◎</div><div>NO PROPERTIES SAVED</div></div>';
    return;
  }
  const allJobs = loadJobs();
  el.innerHTML = filtered.map(a => {
    const jobs = allJobs.filter(j => j.addressId === a.id);
    const subtitle = [a.builder, a.subdivision].filter(Boolean).join(' · ');
    const panelChip = [a.ampRating, a.breakerType, a.panelType].filter(Boolean).join(' · ');
    const lastJob = jobs.filter(j => j.date).sort((x, y) => y.date.localeCompare(x.date))[0];
    const lastDate = lastJob ? new Date(lastJob.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase() : '';
    return `<div class="card" onclick="goTo('screen-addr-detail','${a.id}')">
      <div class="card-address">${esc(a.address)}</div>
      ${subtitle ? '<div class="card-subtitle">' + esc(subtitle).toUpperCase() + '</div>' : ''}
      <div class="card-meta">
        ${panelChip ? '<span class="card-panel-chip">' + esc(panelChip).toUpperCase() + '</span>' : ''}
        <span class="badge badge-type">${jobs.length} TICKET${jobs.length !== 1 ? 'S' : ''}</span>
        ${lastDate ? '<span class="card-last-visit">LAST: ' + lastDate + '</span>' : ''}
      </div>
    </div>`;
  }).join('');
}

let currentAddrId = null;
function renderAddrDetail(addrId) {
  const a = getAddress(addrId);
  if (!a) return;
  currentAddrId = addrId;
  const jobs = loadJobs().filter(j => j.addressId === addrId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const fields = ADDR_FIELDS.map(f => {
    const val = a[f.key] || '';
    if (f.textarea) {
      return `<div class="prop-field" style="flex-direction:column;align-items:stretch;">
        <span class="prop-label" style="margin-bottom:6px;">${f.label}</span>
        <textarea class="prop-input auto-expand" style="text-align:left;min-height:100px;padding:10px;background:#1a1a1a;border-radius:8px;border:1px solid #333;line-height:1.5;overflow:hidden;" placeholder="—"
          oninput="autoExpand(this)" onblur="updateAddress('${addrId}',{${f.key}:this.value})">${esc(val)}</textarea>
      </div>`;
    }
    if (f.options) {
      const opts = f.options.map(o => `<option value="${o}"${val === o ? ' selected' : ''}>${o}</option>`).join('');
      return `<div class="prop-field">
        <span class="prop-label">${f.label}</span>
        <select class="prop-input" style="appearance:none;cursor:pointer;background:none;border:none;"
          onchange="updateAddress('${addrId}',{${f.key}:this.value})">
          <option value=""${!val ? ' selected' : ''}>—</option>${opts}
        </select>
      </div>`;
    }
    return `<div class="prop-field">
      <span class="prop-label">${f.label}</span>
      <input class="prop-input" value="${esc(val)}" placeholder="—"
        onblur="updateAddress('${addrId}',{${f.key}:this.value})">
    </div>`;
  }).join('');

  const ticketList = jobs.length ? jobs.map(j => {
    const dateStr = j.date ? new Date(j.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase() : '';
    return `<div class="card" onclick="goTo('screen-detail','${j.id}')" style="padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          ${j.types.map(t => '<span class="badge badge-type" style="font-size:10px;">' + esc(t).toUpperCase() + '</span>').join(' ')}
          <span class="badge ${statusClass(j.status)}" style="font-size:10px;">${esc(j.status).toUpperCase()}</span>
        </div>
        <span style="font-size:12px;color:#555;">${dateStr}</span>
      </div>
    </div>`;
  }).join('') : '<div class="empty-msg">NO TICKETS FOR THIS PROPERTY.</div>';

  document.getElementById('addr-detail-body').innerHTML = `
    <div class="detail-header">
      <div class="detail-address">${esc(a.address)}</div>
      <button class="btn-navigate" onclick="navigateTo('${esc(a.address).replace(/'/g, "\\'")}')">NAVIGATE</button>
    </div>
    <div class="section-title">PROPERTY INFO</div>
    <div class="dash-card" style="padding:8px 14px;">${fields}</div>
    ${window.renderAddrMaterialRollup ? window.renderAddrMaterialRollup(addrId) : ''}
    <div class="section-title">WORK HISTORY (${jobs.length})</div>
    ${ticketList}
    <div class="spacer"></div>
  `;
  document.querySelectorAll('#addr-detail-body .auto-expand').forEach(el => autoExpand(el));
}

function findOrCreateAddress(addressText, components) {
  const addrs = loadAddresses();
  const existing = addrs.find(a => a.address.toLowerCase() === addressText.toLowerCase());
  if (existing) return existing.id;
  const newAddr = { id: crypto.randomUUID(), address: addressText };
  if (components) {
    newAddr.street = components.street || '';
    newAddr.suite = components.suite || '';
    newAddr.city = components.city || '';
    newAddr.state = components.state || '';
    newAddr.zip = components.zip || '';
  }
  ADDR_FIELDS.forEach(f => { if (!(f.key in newAddr)) newAddr[f.key] = ''; });
  addAddress(newAddr);
  return newAddr.id;
}

// ═══════════════════════════════════════════
// ARCHIVE / STATUS
// ═══════════════════════════════════════════
function archiveJob(id) {
  if (!confirm('ARCHIVE THIS TICKET?')) return;
  updateJob(id, { archived: true });
  goTo('screen-jobs');
}
function unarchiveJob(id) {
  updateJob(id, { archived: false });
  goTo('screen-jobs');
}

function openStatusPicker() {
  document.getElementById('sp-backdrop').classList.add('active');
  document.getElementById('sp-picker').classList.add('active');
}
function closeStatusPicker() {
  document.getElementById('sp-backdrop').classList.remove('active');
  document.getElementById('sp-picker').classList.remove('active');
}
function pickStatus(status) {
  if (currentJobId) {
    updateJob(currentJobId, { status });
    renderDetail(currentJobId);
  }
  closeStatusPicker();
}

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
function renderDashboard() {
  const allJobs = loadJobs();
  const active = allJobs.filter(j => !j.archived);
  const archived = allJobs.filter(j => j.archived);
  const total = allJobs.length;

  const statusCounts = {};
  STATUSES.forEach(s => statusCounts[s] = 0);
  active.forEach(j => { if (statusCounts[j.status] !== undefined) statusCounts[j.status]++; });

  const statusColors = {
    'Not Started': '#444', 'In Progress': '#c9a800', 'Complete': '#2d8a4e',
    'Needs Callback': '#c0392b', 'Waiting on Materials': '#FF6B00'
  };

  const typeCounts = {};
  allJobs.forEach(j => j.types.forEach(t => { typeCounts[t] = (typeCounts[t] || 0) + 1; }));
  const typesSorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  const maxTypeCount = typesSorted.length ? typesSorted[0][1] : 1;

  const techCounts = {};
  active.forEach(j => { if (j.techName) techCounts[j.techName] = (techCounts[j.techName] || 0) + 1; });
  const techSorted = Object.entries(techCounts).sort((a, b) => b[1] - a[1]);

  let totalPhotos = 0, totalDrawings = 0, totalVideos = 0;
  allJobs.forEach(j => { totalPhotos += (j.photos || []).length; totalDrawings += (j.drawings || []).length; totalVideos += (j.videos || []).length; });

  const recent = [...allJobs].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 8);
  const completedCount = allJobs.filter(j => j.status === 'Complete' || j.archived).length;
  const completionPct = total ? Math.round((completedCount / total) * 100) : 0;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const createdThisWeek = allJobs.filter(j => new Date(j.createdAt) >= weekAgo).length;
  const updatedThisWeek = allJobs.filter(j => new Date(j.updatedAt) >= weekAgo).length;

  document.getElementById('dashboard-body').innerHTML = `
    <div class="dash-grid">
      <div class="dash-stat"><div class="dash-stat-num stat-active">${active.length}</div><div class="dash-stat-label">ACTIVE</div></div>
      <div class="dash-stat"><div class="dash-stat-num stat-archived">${archived.length}</div><div class="dash-stat-label">ARCHIVED</div></div>
      <div class="dash-stat"><div class="dash-stat-num stat-completion">${completionPct}%</div><div class="dash-stat-label">COMPLETION</div></div>
      <div class="dash-stat"><div class="dash-stat-num">${totalPhotos + totalDrawings + totalVideos}</div><div class="dash-stat-label">FILES</div></div>
    </div>
    <div class="dash-card" style="margin-top:10px;">
      <div class="dash-card-title">STATUS BREAKDOWN</div>
      ${STATUSES.map(s => {
        const count = statusCounts[s];
        const pct = active.length ? Math.round((count / active.length) * 100) : 0;
        return `<div class="dash-row">
          <div class="dash-row-label"><span class="badge ${statusClass(s)}" style="font-size:10px;">${s.toUpperCase()}</span></div>
          <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${pct}%;background:${statusColors[s]};"></div></div>
          <div class="dash-row-value">${count}</div>
        </div>`;
      }).join('')}
    </div>
    ${typesSorted.length ? `<div class="dash-card">
      <div class="dash-card-title">JOB TYPES</div>
      ${typesSorted.map(([type, count]) => {
        const pct = Math.round((count / maxTypeCount) * 100);
        return `<div class="dash-row">
          <div class="dash-row-label" style="min-width:100px;">${esc(type).toUpperCase()}</div>
          <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${pct}%;background:#FF6B00;"></div></div>
          <div class="dash-row-value">${count}</div>
        </div>`;
      }).join('')}
    </div>` : ''}
    ${techSorted.length ? `<div class="dash-card">
      <div class="dash-card-title">TECH WORKLOAD</div>
      ${techSorted.map(([name, count]) => `<div class="dash-row">
        <div class="dash-row-label">${esc(name).toUpperCase()}</div>
        <div class="dash-row-value">${count}</div>
      </div>`).join('')}
    </div>` : ''}
    <div class="dash-card">
      <div class="dash-card-title">THIS WEEK</div>
      <div class="dash-row"><div class="dash-row-label">CREATED</div><div class="dash-row-value" style="color:#FF6B00;">${createdThisWeek}</div></div>
      <div class="dash-row"><div class="dash-row-label">UPDATED</div><div class="dash-row-value">${updatedThisWeek}</div></div>
      <div class="dash-row"><div class="dash-row-label">PHOTOS</div><div class="dash-row-value">${totalPhotos}</div></div>
      <div class="dash-row"><div class="dash-row-label">VIDEOS</div><div class="dash-row-value">${totalVideos}</div></div>
    </div>
    ${recent.length ? `<div class="dash-card">
      <div class="dash-card-title">RECENT ACTIVITY</div>
      ${recent.map(j => {
        const ago = timeAgo(j.updatedAt);
        return `<div class="dash-activity" onclick="goTo('screen-detail','${j.id}')" style="cursor:pointer;">
          <div class="dash-activity-dot" style="background:${statusColors[j.status] || '#444'};"></div>
          <div style="flex:1;overflow:hidden;">
            <div class="activity-addr">${esc(j.address)}</div>
            <div class="activity-meta">${esc(j.status).toUpperCase()}${j.archived ? ' · ARCHIVED' : ''}</div>
          </div>
          <div class="activity-meta">${ago}</div>
        </div>`;
      }).join('')}
    </div>` : ''}
    <div class="spacer"></div>
  `;
}

function timeAgo(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'NOW';
  if (mins < 60) return mins + 'M';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'H';
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + 'D';
  return Math.floor(days / 7) + 'W';
}

// ═══════════════════════════════════════════
// FILE UPLOADS → INDEXEDDB
// ═══════════════════════════════════════════
function compressImage(file, maxWidth, quality) {
  maxWidth = maxWidth || 1200;
  quality = quality || 0.7;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = function() {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

document.getElementById('photo-input').addEventListener('change', async function() {
  if (!currentJobId || !this.files.length) return;
  const j = getJob(currentJobId);
  if (!j) return;
  const photos = [...(j.photos || [])];
  for (const f of this.files) {
    const id = crypto.randomUUID();
    const data = await compressImage(f, 1200, 0.7);
    await saveMediaBlob(id, data);
    photos.push({ id, name: f.name, type: 'image', addedAt: new Date().toISOString() });
  }
  updateJob(currentJobId, { photos });
  renderDetail(currentJobId);
  this.value = '';
});

document.getElementById('drawing-input').addEventListener('change', async function() {
  if (!currentJobId || !this.files.length) return;
  const j = getJob(currentJobId);
  if (!j) return;
  const drawings = [...(j.drawings || [])];
  for (const f of this.files) {
    const id = crypto.randomUUID();
    const isPDF = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
    if (isPDF) {
      await saveMediaBlob(id, f.slice(0, f.size, f.type));
      drawings.push({ id, name: f.name, type: 'pdf', mimeType: f.type, addedAt: new Date().toISOString() });
    } else {
      const data = await compressImage(f, 1600, 0.8);
      await saveMediaBlob(id, data);
      drawings.push({ id, name: f.name, type: 'image', addedAt: new Date().toISOString() });
    }
  }
  updateJob(currentJobId, { drawings });
  renderDetail(currentJobId);
  this.value = '';
});

const VIDEO_MAX_BYTES = 50 * 1024 * 1024; // 50 MB cap

document.getElementById('video-input').addEventListener('change', async function() {
  if (!currentJobId || !this.files.length) return;
  const j = getJob(currentJobId);
  if (!j) return;
  const videos = [...(j.videos || [])];
  for (const f of this.files) {
    if (f.size > VIDEO_MAX_BYTES) {
      alert('VIDEO TOO LARGE: ' + f.name + ' (' + (f.size / (1024*1024)).toFixed(0) + ' MB). MAX 50 MB.');
      continue;
    }
    const id = crypto.randomUUID();
    const blob = f.slice(0, f.size, f.type);
    await saveMediaBlob(id, blob);
    videos.push({ id, name: f.name, type: 'video', mimeType: f.type, addedAt: new Date().toISOString() });
  }
  updateJob(currentJobId, { videos });
  renderDetail(currentJobId);
  this.value = '';
});

async function deleteMedia(jobId, type, mediaId) {
  if (!confirm('DELETE THIS FILE?')) return;
  const j = getJob(jobId);
  if (!j) return;
  const item = (j[type] || []).find(m => m.id === mediaId);
  if (item) await deleteMediaBlob(item.id);
  const updated = (j[type] || []).filter(m => m.id !== mediaId);
  updateJob(jobId, { [type]: updated });
  renderDetail(jobId);
}

// ═══════════════════════════════════════════
// FULLSCREEN MEDIA VIEWER + PINCH-TO-ZOOM
// ═══════════════════════════════════════════
let zoomScale = 1, zoomX = 0, zoomY = 0;
let pinchStartDist = 0, pinchStartScale = 1;
let panStartX = 0, panStartY = 0;
let isPanning = false;

async function openMedia(jobId, type, idx) {
  const j = getJob(jobId);
  if (!j) return;
  const item = j[type][idx];
  if (!item) return;
  zoomScale = 1; zoomX = 0; zoomY = 0;
  document.getElementById('overlay-title').textContent = item.name.toUpperCase();
  const body = document.getElementById('overlay-body');
  const data = await getMediaBlob(item.id);
  const mediaUrl = (data instanceof Blob) ? URL.createObjectURL(data) : (data || '');
  if (item.type === 'pdf') {
    window.open(mediaUrl, '_blank');
    return;
  }
  if (item.type === 'video') {
    body.innerHTML = `<video src="${mediaUrl}" controls autoplay style="max-width:100%;max-height:100%;" id="zoom-vid"></video>`;
  } else {
    body.innerHTML = `<img src="${mediaUrl}" alt="${esc(item.name)}" id="zoom-img" draggable="false">`;
    setupPinchZoom(body, document.getElementById('zoom-img'));
  }
  document.getElementById('media-overlay').classList.add('active');
}

function setupPinchZoom(container, img) {
  function apply() { img.style.transform = `translate(${zoomX}px, ${zoomY}px) scale(${zoomScale})`; }
  container.addEventListener('touchstart', function(e) {
    if (e.touches.length === 2) {
      e.preventDefault(); isPanning = false;
      pinchStartDist = getTouchDist(e.touches); pinchStartScale = zoomScale;
    } else if (e.touches.length === 1) {
      isPanning = true;
      panStartX = e.touches[0].clientX - zoomX;
      panStartY = e.touches[0].clientY - zoomY;
    }
  }, { passive: false });
  container.addEventListener('touchmove', function(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      zoomScale = Math.min(5, Math.max(1, pinchStartScale * (getTouchDist(e.touches) / pinchStartDist)));
      if (zoomScale <= 1) { zoomX = 0; zoomY = 0; }
      apply();
    } else if (e.touches.length === 1 && isPanning) {
      e.preventDefault();
      zoomX = e.touches[0].clientX - panStartX;
      zoomY = e.touches[0].clientY - panStartY;
      apply();
    }
  }, { passive: false });
  container.addEventListener('touchend', () => { isPanning = false; });
  container.addEventListener('mousedown', function(e) {
    e.preventDefault(); isPanning = true;
    panStartX = e.clientX - zoomX; panStartY = e.clientY - zoomY;
    container.style.cursor = 'grabbing';
  });
  container.addEventListener('mousemove', function(e) {
    if (!isPanning) return;
    zoomX = e.clientX - panStartX; zoomY = e.clientY - panStartY; apply();
  });
  container.addEventListener('mouseup', () => { isPanning = false; container.style.cursor = 'grab'; });
  container.addEventListener('mouseleave', () => { isPanning = false; container.style.cursor = 'grab'; });
  container.style.cursor = 'grab';
  container.addEventListener('wheel', function(e) {
    e.preventDefault();
    zoomScale = Math.min(5, Math.max(1, zoomScale + (e.deltaY > 0 ? -0.2 : 0.2)));
    if (zoomScale <= 1) { zoomX = 0; zoomY = 0; }
    apply();
  }, { passive: false });
}

function getTouchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function closeOverlay() { document.getElementById('media-overlay').classList.remove('active'); }

// ═══════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════
function navigateTo(address) {
  window.open('https://maps.google.com/maps?q=' + encodeURIComponent(address), '_blank');
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function toggleChip(el) { el.classList.toggle('selected'); }

// ═══════════════════════════════════════════
// SETTINGS / EXPORT / IMPORT
// ═══════════════════════════════════════════
async function renderSettings() {
  const jobs = loadJobs();
  const active = jobs.filter(j => !j.archived).length;
  const archived = jobs.filter(j => j.archived).length;
  let photos = 0, drawings = 0, videos = 0;
  jobs.forEach(j => { photos += (j.photos || []).length; drawings += (j.drawings || []).length; videos += (j.videos || []).length; });

  document.getElementById('settings-stats').innerHTML = `
    <div class="dash-row"><div class="dash-row-label">TOTAL</div><div class="dash-row-value">${jobs.length}</div></div>
    <div class="dash-row"><div class="dash-row-label">ACTIVE</div><div class="dash-row-value" style="color:#FF6B00;">${active}</div></div>
    <div class="dash-row"><div class="dash-row-label">ARCHIVED</div><div class="dash-row-value" style="color:#2d8a4e;">${archived}</div></div>
    <div class="dash-row"><div class="dash-row-label">PHOTOS</div><div class="dash-row-value">${photos}</div></div>
    <div class="dash-row"><div class="dash-row-label">VIDEOS</div><div class="dash-row-value">${videos}</div></div>
    <div class="dash-row"><div class="dash-row-label">DRAWINGS</div><div class="dash-row-value">${drawings}</div></div>
    <div class="dash-row"><div class="dash-row-label">PROPERTIES</div><div class="dash-row-value">${loadAddresses().length}</div></div>
  `;

  const gmapsInput = document.getElementById('gmaps-key');
  if (gmapsInput) gmapsInput.value = getGmapsKey();
  const homeBaseInput = document.getElementById('home-base-input');
  if (homeBaseInput) homeBaseInput.value = getHomeBase();
  const supaUrlInput = document.getElementById('supabase-url');
  if (supaUrlInput && window.Astra.getSupabaseUrl) supaUrlInput.value = window.Astra.getSupabaseUrl();
  const supaKeyInput = document.getElementById('supabase-key');
  if (supaKeyInput && window.Astra.getSupabaseKey) supaKeyInput.value = window.Astra.getSupabaseKey();

  let mediaBytes = 0;
  try { mediaBytes = await getMediaDBSize(); } catch(e) {}
  let lsBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    lsBytes += (localStorage.getItem(key) || '').length * 2;
  }
  const usedMB = ((mediaBytes + lsBytes) / (1024 * 1024)).toFixed(1);

  document.getElementById('storage-info').innerHTML = `
    <div class="dash-row"><div class="dash-row-label">MEDIA</div><div class="dash-row-value">${(mediaBytes / (1024 * 1024)).toFixed(1)} MB</div></div>
    <div class="dash-row"><div class="dash-row-label">METADATA</div><div class="dash-row-value">${(lsBytes / 1024).toFixed(0)} KB</div></div>
    <div class="dash-row"><div class="dash-row-label">TOTAL</div><div class="dash-row-value" style="color:#FF6B00;">${usedMB} MB</div></div>
  `;
}

async function exportData() {
  const mediaBlobs = await getAllMediaBlobs();
  const data = {
    version: '0.5',
    exportedAt: new Date().toISOString(),
    jobs: loadJobs(),
    techs: loadTechs(),
    addresses: loadAddresses(),
    materialLibrary: loadRoughLibrary(),
    materialLibraryTrim: loadTrimLibrary(),
    navFrequency: JSON.parse(localStorage.getItem(NAV_FREQ_KEY) || '{}'),
    homeBase: getHomeBase(),
    media: mediaBlobs
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'astra-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

async function importData(input) {
  if (!input.files.length) return;
  const reader = new FileReader();
  reader.onload = async function() {
    try {
      const data = JSON.parse(reader.result);
      if (!data.jobs || !Array.isArray(data.jobs)) { alert('INVALID BACKUP: NO JOBS ARRAY.'); return; }
      // Validate each job has minimum required fields
      const invalid = data.jobs.filter(j => !j.id || !j.address);
      if (invalid.length > 0) { alert('INVALID BACKUP: ' + invalid.length + ' JOBS MISSING ID OR ADDRESS.'); return; }
      if (data.techs && !Array.isArray(data.techs)) { alert('INVALID BACKUP: TECHS NOT AN ARRAY.'); return; }
      if (data.addresses && !Array.isArray(data.addresses)) { alert('INVALID BACKUP: ADDRESSES NOT AN ARRAY.'); return; }
      if (!confirm('REPLACE ALL DATA WITH BACKUP? (' + data.jobs.length + ' TICKETS)')) return;
      // Ensure all jobs have required fields with defaults
      data.jobs.forEach(j => {
        if (!j.photos) j.photos = [];
        if (!j.drawings) j.drawings = [];
        if (!j.videos) j.videos = [];
        if (!j.status) j.status = 'Not Started';
        if (!j.types) j.types = ['GENERAL'];
        if (!j.date) j.date = j.createdAt ? j.createdAt.split('T')[0] : todayStr();
        if (j.techNotes === undefined) j.techNotes = '';
        if (j.manually_added_to_vector === undefined) j.manually_added_to_vector = false;
      });
      replaceAllJobs(data.jobs);
      if (data.techs) replaceAllTechs(data.techs);
      if (data.addresses) replaceAllAddresses(data.addresses);
      if (data.materialLibrary) localStorage.setItem(MAT_LIB_KEY, JSON.stringify(data.materialLibrary));
      if (data.materialLibraryTrim) localStorage.setItem(MAT_LIB_TRIM_KEY, JSON.stringify(data.materialLibraryTrim));
      if (data.navFrequency) localStorage.setItem(NAV_FREQ_KEY, JSON.stringify(data.navFrequency));
      if (data.homeBase) saveHomeBase(data.homeBase);
      if (data.gmapsKey) saveGmapsKey(data.gmapsKey);
      if (data.media && Array.isArray(data.media)) {
        await clearAllMediaBlobs();
        for (const blob of data.media) {
          if (blob && blob.id && blob.data) await saveMediaBlob(blob.id, blob.data);
        }
      }
      renderSettings();
      alert(data.jobs.length + ' TICKETS RESTORED.');
    } catch (e) { alert('IMPORT FAILED: ' + e.message); }
    input.value = '';
  };
  reader.readAsText(input.files[0]);
}

// ── Cloud Sync UI ──
function _syncStatus(msg) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.style.display = msg ? '' : 'none';
  el.textContent = msg || '';
}

// Sync mutex — only one sync operation at a time
// On window so astra-sync.js realtime handler can check it
window._syncInProgress = false;

async function runSyncPush() {
  if (!window.Astra.isSyncConfigured || !window.Astra.isSyncConfigured()) {
    showToast('ADD SUPABASE URL AND KEY IN SETTINGS', 'error'); return;
  }
  if (window._syncInProgress) { showToast('SYNC ALREADY IN PROGRESS — WAIT', 'error'); return; }
  window._syncInProgress = true;
  const btn = document.getElementById('sync-push-btn');
  const pullBtn = document.getElementById('sync-pull-btn');
  btn.disabled = true; btn.textContent = 'PUSHING...';
  if (pullBtn) pullBtn.disabled = true;
  _syncStatus('STARTING...');
  try {
    const result = await window.syncToCloud((step, total, msg) => _syncStatus(msg));
    _syncStatus(null);
    showToast(result.jobs + ' TICKETS, ' + result.addresses + ' ADDRESSES, ' + result.materials + ' MATERIALS PUSHED');
    btn.textContent = 'PUSHED ✓';
    setTimeout(() => { btn.textContent = 'PUSH TO CLOUD'; btn.disabled = false; }, 3000);
  } catch (e) {
    console.error('Push failed:', e);
    _syncStatus('FAILED: ' + e.message);
    showToast('PUSH FAILED: ' + e.message, 'error');
    btn.textContent = 'PUSH TO CLOUD'; btn.disabled = false;
  } finally {
    window._syncInProgress = false;
    if (pullBtn) pullBtn.disabled = false;
  }
}

async function runSyncPull() {
  if (!window.Astra.isSyncConfigured || !window.Astra.isSyncConfigured()) {
    showToast('ADD SUPABASE URL AND KEY IN SETTINGS', 'error'); return;
  }
  if (window._syncInProgress) { showToast('SYNC ALREADY IN PROGRESS — WAIT', 'error'); return; }
  if (!confirm('PULL DATA FROM CLOUD? THIS WILL UPDATE LOCAL TICKETS WITH CLOUD CHANGES.')) return;
  window._syncInProgress = true;
  const btn = document.getElementById('sync-pull-btn');
  const pushBtn = document.getElementById('sync-push-btn');
  btn.disabled = true; btn.textContent = 'PULLING...';
  if (pushBtn) pushBtn.disabled = true;
  _syncStatus('STARTING...');
  try {
    const result = await window.syncFromCloud((step, total, msg) => _syncStatus(msg));
    _syncStatus(null);
    const parts = [];
    if (result.newJobs) parts.push(result.newJobs + ' NEW TICKETS');
    if (result.newAddresses) parts.push(result.newAddresses + ' NEW ADDRESSES');
    parts.push(result.jobs + ' TOTAL SYNCED');
    showToast(parts.join(', '));
    btn.textContent = 'PULLED ✓';
    setTimeout(() => { btn.textContent = 'PULL FROM CLOUD'; btn.disabled = false; }, 3000);
    renderJobList();
  } catch (e) {
    console.error('Pull failed:', e);
    _syncStatus('FAILED: ' + e.message);
    showToast('PULL FAILED: ' + e.message, 'error');
    btn.textContent = 'PULL FROM CLOUD'; btn.disabled = false;
  } finally {
    window._syncInProgress = false;
    if (pushBtn) pushBtn.disabled = false;
  }
}

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
renderShortcuts();
updateSidebarActive();

// Clear vector flags at midnight
(function clearVectorAtMidnight() {
  const lastClear = localStorage.getItem('astra_vector_last_clear');
  const today = todayStr();
  if (lastClear !== today) {
    const jobs = loadJobs();
    jobs.forEach(j => {
      if (j.manually_added_to_vector) {
        j.manually_added_to_vector = false;
        _idbPut('jobs', _cleanJobForStorage(j));
      }
    });
    localStorage.setItem('astra_vector_last_clear', today);
  }
})();

// PWA icons
(function() {
  function generateIcon(size) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.roundRect(0, 0, size, size, size * 0.2); ctx.fill();
    ctx.fillStyle = '#FF6B00';
    ctx.font = 'bold ' + (size * 0.55) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('A', size / 2, size / 2 + size * 0.04);
    return new Promise(resolve => c.toBlob(resolve, 'image/png'));
  }
  async function cacheIcons() {
    const cache = await caches.open('astra-icons');
    const i192 = await generateIcon(192);
    const i512 = await generateIcon(512);
    await cache.put(new Request('icon-192.png'), new Response(i192, { headers: { 'Content-Type': 'image/png' } }));
    await cache.put(new Request('icon-512.png'), new Response(i512, { headers: { 'Content-Type': 'image/png' } }));
  }
  cacheIcons();
  const c = document.createElement('canvas');
  c.width = 180; c.height = 180;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.roundRect(0, 0, 180, 180, 36); ctx.fill();
  ctx.fillStyle = '#FF6B00'; ctx.font = 'bold 99px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('A', 90, 97);
  const appleIcon = document.createElement('link');
  appleIcon.rel = 'apple-touch-icon'; appleIcon.href = c.toDataURL('image/png');
  document.head.appendChild(appleIcon);
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    // Check for updates every 30 seconds
    setInterval(() => reg.update(), 30000);
    // When a new SW is waiting, it will skipWaiting automatically,
    // then controllerchange fires and we reload
    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      if (!newSW) return;
      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'activated') {
          showToast('UPDATED — RELOADING...');
          setTimeout(() => window.location.reload(), 500);
        }
      });
    });
  }).catch(() => {});
  // Also catch controller changes (covers edge cases)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

// ── Shared namespace for sub-modules (maps, materials) ──
Object.assign(window.Astra, {
  loadJobs, loadAddresses, updateAddress, addAddress, getJob, updateJob, addJob, loadTechs,
  todayStr, esc, goTo, showToast,
  getGmapsKey, saveGmapsKey, getHomeBase, saveHomeBase,
  MAT_LIB_KEY, MAT_LIB_TRIM_KEY, loadMaterialLibrary, loadRoughLibrary, loadTrimLibrary,
});

// ── Public API — expose only what HTML handlers need ──
Object.assign(window, {
  // Navigation
  goTo, toggleSidebar, closeSidebar, setHomeView, setArchiveView,
  // Ticket CRUD
  saveNewTicket, updateJob, archiveJob, unarchiveJob,
  toggleVector, openStatusPicker, closeStatusPicker, pickStatus,
  // Address
  updateAddress, addrAutocomplete, pickAddr, navigateTo, renderAddressList, autoExpand,
  // Search
  debouncedSearch,
  // Materials (core-side)
  toggleMatSection,
  // Chips & toggles
  toggleChip, toggleWeek,
  // Media
  openMedia, deleteMedia, closeOverlay,
  // Data import/export
  exportData, importData,
  // Cloud sync
  runSyncPush, runSyncPull,
  // Settings
  saveGmapsKey, saveHomeBase,
});

})();
