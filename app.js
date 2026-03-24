// ═══════════════════════════════════════════
// ASTRA v0.5 — FIELD SERVICE
// ═══════════════════════════════════════════

// ── DATA LAYER ──
const JOBS_KEY = 'astra_jobs';
const TECHS_KEY = 'astra_techs';
const ADDRS_KEY = 'astra_addresses';
const NAV_FREQ_KEY = 'astra_nav_frequency';
const HOME_BASE_KEY = 'astra_home_base';
const GMAPS_KEY_STORAGE = 'astra_gmaps_key';
const STATUSES = ['Not Started','In Progress','Complete','Needs Callback','Waiting on Materials'];

function loadJobs() {
  try { return JSON.parse(localStorage.getItem(JOBS_KEY)) || []; }
  catch { return []; }
}
function saveJobs(jobs) {
  const clean = jobs.map(j => ({
    ...j,
    photos: (j.photos || []).map(p => ({ id: p.id, name: p.name, type: p.type || 'image', addedAt: p.addedAt })),
    drawings: (j.drawings || []).map(d => ({ id: d.id, name: d.name, type: d.type || 'image', addedAt: d.addedAt })),
    videos: (j.videos || []).map(v => ({ id: v.id, name: v.name, type: 'video', addedAt: v.addedAt }))
  }));
  localStorage.setItem(JOBS_KEY, JSON.stringify(clean));
}
function loadTechs() {
  try { return JSON.parse(localStorage.getItem(TECHS_KEY)) || []; }
  catch { return []; }
}
function saveTechs(techs) { localStorage.setItem(TECHS_KEY, JSON.stringify(techs)); }
function loadAddresses() {
  try { return JSON.parse(localStorage.getItem(ADDRS_KEY)) || []; }
  catch { return []; }
}
function saveAddresses(addrs) { localStorage.setItem(ADDRS_KEY, JSON.stringify(addrs)); }
function getAddress(id) { return loadAddresses().find(a => a.id === id); }
function updateAddress(id, updates) {
  const addrs = loadAddresses();
  const idx = addrs.findIndex(a => a.id === id);
  if (idx === -1) return;
  Object.assign(addrs[idx], updates);
  saveAddresses(addrs);
}
function statusClass(s) { return 'badge-' + s.toLowerCase().replace(/\s+/g, '-'); }
function getJob(id) { return loadJobs().find(j => j.id === id); }
function updateJob(id, updates) {
  const jobs = loadJobs();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return;
  Object.assign(jobs[idx], updates, { updatedAt: new Date().toISOString() });
  saveJobs(jobs);
}

// Seed default tech
if (loadTechs().length === 0) {
  saveTechs([{ id: crypto.randomUUID(), name: 'Mike Torres' }]);
}

// Migrate existing tickets: ensure all have a date field
(function migrateDates() {
  const jobs = loadJobs();
  let changed = false;
  jobs.forEach(j => {
    if (!j.date) {
      j.date = j.createdAt ? j.createdAt.split('T')[0] : new Date().toISOString().split('T')[0];
      changed = true;
    }
    if (!j.videos) { j.videos = []; changed = true; }
    if (j.techNotes === undefined) { j.techNotes = ''; changed = true; }
    if (j.manually_added_to_vector === undefined) { j.manually_added_to_vector = false; changed = true; }
  });
  if (changed) saveJobs(jobs);
})();

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
  blobs.forEach(b => { total += (b.data || '').length; });
  return total;
}

async function migrateLegacyMedia() {
  const jobs = JSON.parse(localStorage.getItem(JOBS_KEY) || '[]');
  let migrated = false;
  for (const j of jobs) {
    for (const type of ['photos', 'drawings']) {
      if (!j[type]) continue;
      for (const item of j[type]) {
        if (item.data && item.data.startsWith('data:')) {
          if (!item.id) item.id = crypto.randomUUID();
          await saveMediaBlob(item.id, item.data);
          delete item.data;
          migrated = true;
        }
      }
    }
    if (!j.videos) j.videos = [];
  }
  if (migrated) localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
}

// Init
openMediaDB().then(() => migrateLegacyMedia()).then(() => renderJobList());

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
  if (screenId === 'screen-materials') renderMaterials();
  if (screenId === 'screen-vector') renderMap();
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

function todayStr() { return new Date().toISOString().split('T')[0]; }

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
    let html = '';
    sortedKeys.forEach(key => {
      const g = grouped[key];
      const range = getWeekRange(g.year, g.week);
      html += `<div class="week-header" onclick="toggleWeek(this)"><span>WEEK ${g.week} — ${range}</span><span class="wh-arrow">▼</span></div>`;
      html += `<div class="week-group">${g.jobs.map(j => jobCard(j)).join('')}</div>`;
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
    sortedKeys.forEach(key => {
      const g = grouped[key];
      const range = getWeekRange(g.year, g.week);
      html += `<div class="week-header" onclick="toggleWeek(this)"><span>WEEK ${g.week} — ${range}</span><span class="wh-arrow">▼</span></div>`;
      html += `<div class="week-group">${g.jobs.map(j => jobCard(j)).join('')}</div>`;
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
    photos: [], drawings: [], videos: [],
    manually_added_to_vector: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const jobs = loadJobs();
  jobs.unshift(job);
  saveJobs(jobs);
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
      if (item.type === 'video') {
        parts.push(`<div class="media-thumb" onclick="openMedia('${jobId}','${type}',${i})">
          <video src="${data || ''}" muted preload="metadata"></video>
          <div class="video-badge">▶</div>
          <button class="media-delete" onclick="event.stopPropagation();deleteMedia('${jobId}','${type}',${i})">✕</button>
        </div>`);
      } else {
        parts.push(`<div class="media-thumb" onclick="openMedia('${jobId}','${type}',${i})">
          <img src="${data || ''}" alt="${esc(item.name)}">
          <button class="media-delete" onclick="event.stopPropagation();deleteMedia('${jobId}','${type}',${i})">✕</button>
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
        <select style="background:#1a1a1a;color:#e0e0e0;border:1px solid #333;border-radius:8px;padding:6px 10px;font-size:14px;min-height:36px;" onchange="updateJob('${jobId}',{techId:this.value,techName:this.options[this.selectedIndex].text})">
          <option value="">UNASSIGNED</option>
          ${techs.map(t => `<option value="${t.id}" ${t.id===j.techId?'selected':''}>${esc(t.name)}</option>`).join('')}
        </select>
      </div>
    </div>

    <button class="${vectorBtnClass}" onclick="toggleVector('${jobId}')">${vectorBtnText}</button>

    <div class="section-title">JOB NOTES</div>
    <div style="background:#222;border-radius:10px;padding:14px;font-size:14px;color:#888;line-height:1.5;min-height:48px;white-space:pre-wrap;border:1px solid #2a2a2a;">${esc(j.notes) || '<span style="color:#333;">NO JOB NOTES.</span>'}</div>

    <div class="section-title">TECH NOTES</div>
    <div class="field" style="margin-bottom:0;">
      <textarea id="detail-tech-notes" style="min-height:90px;" placeholder="NOTES FROM THE JOB..." onblur="updateJob('${jobId}',{techNotes:this.value})">${esc(j.techNotes || '')}</textarea>
    </div>

    <div class="section-title">MATERIALS${(j.materials||[]).length ? ' (' + (j.materials||[]).length + ')' : ''}</div>
    <button class="upload-btn" onclick="openMatPicker('${jobId}')">ADD MATERIALS</button>
    <div id="job-materials-list"></div>

    <div class="section-title">PHOTOS${j.photos.length ? ' (' + j.photos.length + ')' : ''}</div>
    <button class="upload-btn" onclick="document.getElementById('photo-input').click()">ADD PHOTOS</button>
    ${j.photos.length ? '<div class="media-grid">' + photoThumbs + '</div>' : ''}

    <div class="section-title">VIDEOS${j.videos.length ? ' (' + j.videos.length + ')' : ''}</div>
    <button class="upload-btn" onclick="document.getElementById('video-input').click()">ADD VIDEOS</button>
    ${j.videos.length ? '<div class="media-grid">' + videoThumbs + '</div>' : ''}

    <div class="section-title">DRAWINGS${j.drawings.length ? ' (' + j.drawings.length + ')' : ''}</div>
    <button class="upload-btn" onclick="document.getElementById('drawing-input').click()">UPLOAD DRAWING</button>
    ${j.drawings.length ? '<div class="media-grid">' + drawingThumbs + '</div>' : ''}

    ${j.archived
      ? `<button class="btn btn-restore" onclick="unarchiveJob('${jobId}')">RESTORE</button>`
      : `<button class="btn btn-danger" onclick="archiveJob('${jobId}')">ARCHIVE</button>`
    }
    <div style="height:24px;"></div>
  `;
  renderJobMaterials(jobId);
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
  }).join('') : '<div style="color:#333;font-size:13px;padding:12px;text-transform:uppercase;letter-spacing:0.5px;">NO TICKETS FOR THIS PROPERTY.</div>';

  document.getElementById('addr-detail-body').innerHTML = `
    <div class="detail-header">
      <div class="detail-address">${esc(a.address)}</div>
      <button class="btn-navigate" onclick="navigateTo('${esc(a.address).replace(/'/g, "\\'")}')">NAVIGATE</button>
    </div>
    <div class="section-title">PROPERTY INFO</div>
    <div class="dash-card" style="padding:8px 14px;">${fields}</div>
    ${renderAddrMaterialRollup(addrId)}
    <div class="section-title">WORK HISTORY (${jobs.length})</div>
    ${ticketList}
    <div style="height:24px;"></div>
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
  addrs.push(newAddr);
  saveAddresses(addrs);
  return newAddr.id;
}

// ═══════════════════════════════════════════
// ARCHIVE / STATUS
// ═══════════════════════════════════════════
function archiveJob(id) {
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
      <div class="dash-stat"><div class="dash-stat-num" style="color:#FF6B00;">${active.length}</div><div class="dash-stat-label">ACTIVE</div></div>
      <div class="dash-stat"><div class="dash-stat-num" style="color:#2d8a4e;">${archived.length}</div><div class="dash-stat-label">ARCHIVED</div></div>
      <div class="dash-stat"><div class="dash-stat-num" style="color:#c9a800;">${completionPct}%</div><div class="dash-stat-label">COMPLETION</div></div>
      <div class="dash-stat"><div class="dash-stat-num" style="color:#e0e0e0;">${totalPhotos + totalDrawings + totalVideos}</div><div class="dash-stat-label">FILES</div></div>
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
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#888;font-weight:600;">${esc(j.address)}</div>
            <div style="font-size:11px;color:#444;">${esc(j.status).toUpperCase()}${j.archived ? ' · ARCHIVED' : ''}</div>
          </div>
          <div style="font-size:11px;color:#444;white-space:nowrap;">${ago}</div>
        </div>`;
      }).join('')}
    </div>` : ''}
    <div style="height:24px;"></div>
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
  for (const f of this.files) {
    const id = crypto.randomUUID();
    const data = await compressImage(f, 1200, 0.7);
    await saveMediaBlob(id, data);
    j.photos.push({ id, name: f.name, type: 'image', addedAt: new Date().toISOString() });
  }
  updateJob(currentJobId, { photos: j.photos });
  renderDetail(currentJobId);
  this.value = '';
});

document.getElementById('drawing-input').addEventListener('change', async function() {
  if (!currentJobId || !this.files.length) return;
  const j = getJob(currentJobId);
  if (!j) return;
  for (const f of this.files) {
    const id = crypto.randomUUID();
    const data = await compressImage(f, 1600, 0.8);
    await saveMediaBlob(id, data);
    j.drawings.push({ id, name: f.name, type: 'image', addedAt: new Date().toISOString() });
  }
  updateJob(currentJobId, { drawings: j.drawings });
  renderDetail(currentJobId);
  this.value = '';
});

document.getElementById('video-input').addEventListener('change', async function() {
  if (!currentJobId || !this.files.length) return;
  const j = getJob(currentJobId);
  if (!j) return;
  if (!j.videos) j.videos = [];
  for (const f of this.files) {
    const id = crypto.randomUUID();
    const data = await fileToDataURL(f);
    await saveMediaBlob(id, data);
    j.videos.push({ id, name: f.name, type: 'video', addedAt: new Date().toISOString() });
  }
  updateJob(currentJobId, { videos: j.videos });
  renderDetail(currentJobId);
  this.value = '';
});

async function deleteMedia(jobId, type, idx) {
  const j = getJob(jobId);
  if (!j) return;
  const item = j[type][idx];
  if (item && item.id) await deleteMediaBlob(item.id);
  j[type].splice(idx, 1);
  updateJob(jobId, { [type]: j[type] });
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
  if (item.type === 'video') {
    body.innerHTML = `<video src="${data || ''}" controls autoplay style="max-width:100%;max-height:100%;" id="zoom-vid"></video>`;
  } else {
    body.innerHTML = `<img src="${data || ''}" alt="${esc(item.name)}" id="zoom-img" draggable="false">`;
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
// GOOGLE MAPS — VECTOR ROUTE
// ═══════════════════════════════════════════
let gmapsLoaded = false, gMap = null, gMarkers = [], gDirectionsRenderer = null, gMapJobs = [];

function getGmapsKey() { return localStorage.getItem(GMAPS_KEY_STORAGE) || ''; }
function saveGmapsKey(key) { localStorage.setItem(GMAPS_KEY_STORAGE, key.trim()); gmapsLoaded = false; gMap = null; }
function getHomeBase() { return localStorage.getItem(HOME_BASE_KEY) || ''; }
function saveHomeBase(val) { localStorage.setItem(HOME_BASE_KEY, val.trim()); }

function loadGmaps() {
  return new Promise((resolve, reject) => {
    if (gmapsLoaded && window.google && window.google.maps) { resolve(); return; }
    const key = getGmapsKey();
    if (!key) { reject('NO API KEY. ADD IN SETTINGS.'); return; }
    const old = document.getElementById('gmaps-script');
    if (old) old.remove();
    const s = document.createElement('script');
    s.id = 'gmaps-script';
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + key + '&libraries=places';
    s.onload = () => { gmapsLoaded = true; resolve(); };
    s.onerror = () => reject('MAP LOAD FAILED. CHECK API KEY.');
    document.head.appendChild(s);
  });
}

function gmapGeocode(address) {
  return new Promise((resolve, reject) => {
    new google.maps.Geocoder().geocode({ address }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else reject('GEOCODE FAILED: ' + status);
    });
  });
}

function setMapStatus(msg) {
  const el = document.getElementById('map-status');
  if (msg) { el.textContent = msg; el.style.display = ''; }
  else el.style.display = 'none';
}

async function renderMap() {
  const key = getGmapsKey();
  if (!key) {
    document.getElementById('map-container').innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;color:#444;font-size:14px;line-height:1.6;text-transform:uppercase;letter-spacing:1px;font-weight:700;">ADD GOOGLE MAPS API KEY IN SETTINGS</div>';
    document.getElementById('map-controls').style.display = 'none';
    return;
  }

  try { setMapStatus('LOADING...'); await loadGmaps(); }
  catch (e) { setMapStatus(e); return; }

  // Vector: today's tickets + manually added
  const today = todayStr();
  const jobs = loadJobs().filter(j => !j.archived && (j.date === today || j.manually_added_to_vector));

  if (!gMap) {
    gMap = new google.maps.Map(document.getElementById('map-container'), {
      center: { lat: 29.76, lng: -95.37 }, zoom: 11,
      disableDefaultUI: true, zoomControl: true,
      zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#1a1a1a' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a1a' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#555' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
        { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#666' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#111' }] }
      ]
    });
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(pos => {
        gMap.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }, () => {}, { timeout: 5000 });
    }
  } else {
    setTimeout(() => google.maps.event.trigger(gMap, 'resize'), 200);
  }

  gMarkers.forEach(m => m.setMap(null));
  gMarkers = []; gMapJobs = [];
  if (gDirectionsRenderer) { gDirectionsRenderer.setMap(null); gDirectionsRenderer = null; }

  if (jobs.length === 0) {
    setMapStatus('NO TICKETS FOR TODAY.');
    document.getElementById('map-controls').style.display = 'none';
    return;
  }

  setMapStatus('GEOCODING ' + jobs.length + ' ADDRESSES...');
  const bounds = new google.maps.LatLngBounds();
  let geocoded = 0;

  const statusColors = {
    'Not Started': '#FF6B00', 'In Progress': '#FBBF24',
    'Needs Callback': '#EF4444', 'Waiting on Materials': '#3B82F6'
  };

  for (const job of jobs) {
    try {
      const addrs = loadAddresses();
      const addrRec = addrs.find(a => a.address.toLowerCase() === job.address.toLowerCase());
      let coords;
      if (addrRec && addrRec.lat && addrRec.lng) {
        coords = { lat: addrRec.lat, lng: addrRec.lng };
      } else {
        coords = await gmapGeocode(job.address);
        if (addrRec) updateAddress(addrRec.id, { lat: coords.lat, lng: coords.lng });
      }
      const color = statusColors[job.status] || '#FF6B00';
      const marker = new google.maps.Marker({
        position: coords, map: gMap, title: job.address,
        icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, scale: 10 }
      });
      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="font-family:inherit;min-width:200px;padding:10px;background:#1a1a1a;color:#e0e0e0;border-radius:10px;">
          <div style="font-weight:800;font-size:13px;margin-bottom:6px;letter-spacing:0.5px;">${esc(job.address)}</div>
          <div style="font-size:11px;color:#555;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">${esc((job.types || []).join(', ')).toUpperCase()}</div>
          <div style="margin-bottom:10px;"><span style="display:inline-block;padding:3px 10px;border-radius:6px;font-weight:800;font-size:10px;color:#fff;background:${color};letter-spacing:0.5px;">${esc(job.status).toUpperCase()}</span></div>
          <button onclick="goTo('screen-detail','${job.id}')" style="background:#FF6B00;color:#fff;border:none;padding:10px 14px;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer;width:100%;text-transform:uppercase;letter-spacing:1px;">VIEW TICKET</button>
        </div>`
      });
      marker.addListener('click', () => infoWindow.open(gMap, marker));
      gMarkers.push(marker);
      gMapJobs.push({ job, coords, marker });
      bounds.extend(coords);
      geocoded++;
      setMapStatus('GEOCODED ' + geocoded + '/' + jobs.length);
    } catch (e) { console.warn('Geocode failed:', job.address, e); }
  }

  if (geocoded > 0) gMap.fitBounds(bounds, { top: 60, bottom: 80, left: 40, right: 40 });
  setMapStatus(null);
  document.getElementById('map-controls').style.display = 'flex';
  document.getElementById('map-optimize-btn').disabled = gMapJobs.length < 2;
  document.getElementById('map-clear-btn').style.display = 'none';
  document.getElementById('map-reroute-btn').style.display = 'none';
}

async function optimizeRoute() {
  if (gMapJobs.length < 2) return;
  const btn = document.getElementById('map-optimize-btn');
  btn.textContent = 'OPTIMIZING...'; btn.disabled = true;

  try {
    const homeBase = getHomeBase();
    let origin, destination;

    if (homeBase) {
      try {
        const homeCoords = await gmapGeocode(homeBase);
        origin = homeCoords;
        destination = homeCoords; // round trip
      } catch (e) {
        origin = gMapJobs[0].coords;
        destination = gMapJobs[gMapJobs.length - 1].coords;
      }
    } else {
      origin = gMapJobs[0].coords;
      destination = gMapJobs[gMapJobs.length - 1].coords;
    }

    const waypoints = gMapJobs.map(d => ({ location: d.coords, stopover: true }));

    const result = await new Promise((resolve, reject) => {
      new google.maps.DirectionsService().route({
        origin, destination, waypoints, optimizeWaypoints: true,
        travelMode: google.maps.TravelMode.DRIVING
      }, (r, s) => s === 'OK' ? resolve(r) : reject('ROUTE FAILED: ' + s));
    });

    if (gDirectionsRenderer) gDirectionsRenderer.setMap(null);
    gDirectionsRenderer = new google.maps.DirectionsRenderer({
      map: gMap, directions: result, suppressMarkers: true,
      polylineOptions: { strokeColor: '#FF6B00', strokeWeight: 4, strokeOpacity: 0.8 }
    });

    const order = result.routes[0].waypoint_order;
    gMarkers.forEach(m => m.setMap(null));
    order.forEach((jobIdx, routePos) => {
      const d = gMapJobs[jobIdx];
      const marker = new google.maps.Marker({
        position: d.coords, map: gMap,
        label: { text: String(routePos + 1), color: '#fff', fontWeight: '800', fontSize: '13px' },
        icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: '#FF6B00', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, scale: 16 }
      });
      gMarkers[jobIdx] = marker;
    });

    let totalDist = 0, totalTime = 0;
    result.routes[0].legs.forEach(leg => { totalDist += leg.distance.value; totalTime += leg.duration.value; });
    btn.textContent = Math.round(totalTime / 60) + ' MIN · ' + (totalDist / 1609.34).toFixed(1) + ' MI';
    btn.disabled = false;
    document.getElementById('map-clear-btn').style.display = '';
    document.getElementById('map-reroute-btn').style.display = '';

  } catch (e) {
    console.error('Route failed:', e);
    btn.textContent = 'FAILED — RETRY'; btn.disabled = false;
  }
}

function reroute() {
  if (!('geolocation' in navigator)) { setMapStatus('GPS NOT AVAILABLE.'); return; }
  setMapStatus('GETTING GPS...');
  navigator.geolocation.getCurrentPosition(async pos => {
    const origin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    // Re-optimize from current location
    if (gMapJobs.length < 1) return;
    const btn = document.getElementById('map-optimize-btn');
    btn.textContent = 'REROUTING...'; btn.disabled = true;

    try {
      const waypoints = gMapJobs.map(d => ({ location: d.coords, stopover: true }));
      const result = await new Promise((resolve, reject) => {
        new google.maps.DirectionsService().route({
          origin, destination: origin, waypoints, optimizeWaypoints: true,
          travelMode: google.maps.TravelMode.DRIVING
        }, (r, s) => s === 'OK' ? resolve(r) : reject('REROUTE FAILED: ' + s));
      });

      if (gDirectionsRenderer) gDirectionsRenderer.setMap(null);
      gDirectionsRenderer = new google.maps.DirectionsRenderer({
        map: gMap, directions: result, suppressMarkers: true,
        polylineOptions: { strokeColor: '#FF6B00', strokeWeight: 4, strokeOpacity: 0.8 }
      });

      const order = result.routes[0].waypoint_order;
      gMarkers.forEach(m => m.setMap(null));
      order.forEach((jobIdx, routePos) => {
        const d = gMapJobs[jobIdx];
        gMarkers[jobIdx] = new google.maps.Marker({
          position: d.coords, map: gMap,
          label: { text: String(routePos + 1), color: '#fff', fontWeight: '800', fontSize: '13px' },
          icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: '#FF6B00', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, scale: 16 }
        });
      });

      let totalDist = 0, totalTime = 0;
      result.routes[0].legs.forEach(leg => { totalDist += leg.distance.value; totalTime += leg.duration.value; });
      btn.textContent = Math.round(totalTime / 60) + ' MIN · ' + (totalDist / 1609.34).toFixed(1) + ' MI';
      btn.disabled = false;
      setMapStatus(null);
    } catch (e) {
      btn.textContent = 'FAILED'; btn.disabled = false;
      setMapStatus(String(e));
    }
  }, () => { setMapStatus('GPS DENIED.'); }, { timeout: 10000 });
}

function clearRoute() {
  if (gDirectionsRenderer) { gDirectionsRenderer.setMap(null); gDirectionsRenderer = null; }
  gMarkers.forEach(m => m.setMap(null)); gMarkers = [];
  const statusColors = {
    'Not Started': '#FF6B00', 'In Progress': '#FBBF24',
    'Needs Callback': '#EF4444', 'Waiting on Materials': '#3B82F6'
  };
  gMapJobs.forEach(d => {
    const color = statusColors[d.job.status] || '#FF6B00';
    const marker = new google.maps.Marker({
      position: d.coords, map: gMap, title: d.job.address,
      icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, scale: 10 }
    });
    gMarkers.push(marker); d.marker = marker;
  });
  document.getElementById('map-optimize-btn').textContent = 'OPTIMIZE';
  document.getElementById('map-optimize-btn').disabled = gMapJobs.length < 2;
  document.getElementById('map-clear-btn').style.display = 'none';
  document.getElementById('map-reroute-btn').style.display = 'none';
}

// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
// MATERIALS
// ═══════════════════════════════════════════
const MAT_LIB_KEY = 'astra_material_library_rough';

function loadMaterialLibrary() {
  try { return JSON.parse(localStorage.getItem(MAT_LIB_KEY)) || null; }
  catch { return null; }
}

function importMaterialLibrary(input) {
  if (!input.files.length) return;
  const reader = new FileReader();
  reader.onload = function() {
    try {
      const data = JSON.parse(reader.result);
      if (!data.categories || !Array.isArray(data.categories)) {
        alert('INVALID MATERIAL JSON.');
        return;
      }
      localStorage.setItem(MAT_LIB_KEY, JSON.stringify(data));
      alert('IMPORTED: ROUGH (' + data.categories.length + ' CATEGORIES, ' + data.categories.reduce((s,c) => s + c.items.length, 0) + ' ITEMS)');
      renderMaterials();
    } catch (e) {
      alert('IMPORT FAILED: ' + e.message);
    }
    input.value = '';
  };
  reader.readAsText(input.files[0]);
}

function renderMaterials() {
  const body = document.getElementById('materials-body');
  const lib = loadMaterialLibrary();
  if (!lib) {
    body.innerHTML = `
      <div class="empty-state">
        <div>☰</div>
        <div>NO MATERIAL LIBRARY LOADED</div>
        <button class="btn" style="margin-top:16px;" onclick="document.getElementById('mat-import-input').click()">IMPORT ROUGH JSON</button>
        <input type="file" id="mat-import-input" accept=".json" style="display:none" onchange="importMaterialLibrary(this)">
      </div>`;
    return;
  }
  const allItems = lib.categories.flatMap(c => c.items.map(i => ({ ...i, catLabel: c.label, catId: c.id })));
  body.innerHTML = `
    <div class="search-bar" style="margin-bottom:12px;">
      <span class="search-icon">⌕</span>
      <input type="text" id="mat-search" name="astra-xmatsearch" autocomplete="nope" placeholder="SEARCH ${allItems.length} ITEMS..." oninput="filterMaterials(this.value)">
    </div>
    <div id="mat-list"></div>
    <div style="padding:12px;text-align:center;">
      <button class="btn" style="background:none;border:1px solid #333;color:#555;font-size:11px;" onclick="document.getElementById('mat-reimport-input').click()">RE-IMPORT LIBRARY</button>
      <input type="file" id="mat-reimport-input" accept=".json" style="display:none" onchange="importMaterialLibrary(this)">
    </div>
    <div style="height:24px;"></div>`;
  filterMaterials('');
}

function filterMaterials(query) {
  const lib = loadMaterialLibrary();
  if (!lib) return;
  const el = document.getElementById('mat-list');
  const q = query.trim().toLowerCase();
  let html = '';
  for (const cat of lib.categories) {
    const items = q ? cat.items.filter(i => i.name.toLowerCase().includes(q)) : cat.items;
    if (!items.length) continue;
    html += `<div class="section-title" style="margin-top:12px;">${esc(cat.label)} (${items.length})</div>`;
    html += `<div class="dash-card" style="padding:4px 14px;">`;
    for (const item of items) {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:13px;font-weight:600;flex:1;">${esc(item.name)}</span>
        <span style="font-size:11px;color:#555;min-width:30px;text-align:right;">${esc(item.unit)}</span>
      </div>`;
    }
    html += `</div>`;
  }
  if (!html) html = '<div class="search-hint">NO ITEMS MATCH "' + esc(query).toUpperCase() + '"</div>';
  el.innerHTML = html;
}

// ── Ticket-level materials ──
function getJobMaterials(jobId) {
  const j = getJob(jobId);
  return (j && j.materials) ? j.materials : [];
}

function setJobMaterials(jobId, materials) {
  updateJob(jobId, { materials });
}

function renderJobMaterials(jobId) {
  const el = document.getElementById('job-materials-list');
  if (!el) return;
  const mats = getJobMaterials(jobId);
  if (!mats.length) {
    el.innerHTML = '<div style="color:#333;font-size:12px;padding:8px 0;text-transform:uppercase;">NO MATERIALS ADDED.</div>';
    return;
  }
  // Group by category
  const lib = loadMaterialLibrary();
  const catMap = {};
  if (lib) lib.categories.forEach(c => c.items.forEach(i => { catMap[i.id] = c.label; }));
  const grouped = {};
  for (const m of mats) {
    const cat = catMap[m.itemId] || 'OTHER';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(m);
  }
  let html = '';
  for (const [cat, items] of Object.entries(grouped)) {
    html += `<div style="font-size:10px;color:#555;font-weight:800;letter-spacing:1px;margin-top:8px;margin-bottom:4px;">${esc(cat)}</div>`;
    for (const m of items) {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:13px;flex:1;">${esc(m.name)}</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <button onclick="adjustMatQty('${jobId}','${m.itemId}',-1)" style="background:none;border:1px solid #333;color:#e0e0e0;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:14px;">−</button>
          <span style="font-size:14px;font-weight:800;min-width:24px;text-align:center;">${m.qty}</span>
          <button onclick="adjustMatQty('${jobId}','${m.itemId}',1)" style="background:none;border:1px solid #333;color:#e0e0e0;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:14px;">+</button>
          <span style="font-size:10px;color:#555;min-width:24px;">${esc(m.unit)}</span>
          <button onclick="removeMatFromJob('${jobId}','${m.itemId}')" style="background:none;border:none;color:#c0392b;cursor:pointer;font-size:14px;padding:0 4px;">✕</button>
        </div>
      </div>`;
    }
  }
  el.innerHTML = html;
}

function adjustMatQty(jobId, itemId, delta) {
  const mats = getJobMaterials(jobId);
  const m = mats.find(x => x.itemId === itemId);
  if (!m) return;
  m.qty = Math.max(1, m.qty + delta);
  setJobMaterials(jobId, mats);
  renderJobMaterials(jobId);
}

function removeMatFromJob(jobId, itemId) {
  const mats = getJobMaterials(jobId).filter(x => x.itemId !== itemId);
  setJobMaterials(jobId, mats);
  renderJobMaterials(jobId);
}

function openMatPicker(jobId) {
  const lib = loadMaterialLibrary();
  if (!lib) { alert('NO MATERIAL LIBRARY. IMPORT IN MATERIALS SCREEN.'); return; }
  const existing = getJobMaterials(jobId).map(m => m.itemId);
  let overlay = document.getElementById('mat-picker-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mat-picker-overlay';
    document.body.appendChild(overlay);
  }
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;padding:16px;';
  overlay.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <span style="font-weight:800;font-size:14px;text-transform:uppercase;letter-spacing:1px;">ADD MATERIALS</span>
      <button onclick="closeMatPicker()" style="background:none;border:none;color:#e0e0e0;font-size:24px;cursor:pointer;padding:4px 8px;">✕</button>
    </div>
    <div class="search-bar" style="margin-bottom:12px;">
      <span class="search-icon">⌕</span>
      <input type="text" id="mat-picker-search" name="astra-xmatpick" autocomplete="nope" placeholder="SEARCH MATERIALS..." oninput="filterMatPicker('${jobId}',this.value)" autofocus>
    </div>
    <div id="mat-picker-list" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;"></div>`;
  filterMatPicker(jobId, '');
}

function closeMatPicker() {
  const overlay = document.getElementById('mat-picker-overlay');
  if (overlay) overlay.remove();
}

function filterMatPicker(jobId, query) {
  const lib = loadMaterialLibrary();
  if (!lib) return;
  const el = document.getElementById('mat-picker-list');
  const q = query.trim().toLowerCase();
  const existing = getJobMaterials(jobId).map(m => m.itemId);
  let html = '';
  for (const cat of lib.categories) {
    const items = q ? cat.items.filter(i => i.name.toLowerCase().includes(q)) : cat.items;
    if (!items.length) continue;
    html += `<div style="font-size:10px;color:#555;font-weight:800;letter-spacing:1px;margin:12px 0 6px;">${esc(cat.label)}</div>`;
    for (const item of items) {
      const added = existing.includes(item.id);
      html += `<div onclick="${added ? '' : "addMatToJob('" + jobId + "','" + item.id + "','" + esc(item.name).replace(/'/g, "\\'") + "','" + item.unit + "')"}"
        style="display:flex;justify-content:space-between;align-items:center;padding:12px 8px;border-bottom:1px solid #2a2a2a;cursor:${added ? 'default' : 'pointer'};min-height:44px;${added ? 'opacity:0.4;' : ''}">
        <span style="font-size:13px;font-weight:600;">${esc(item.name)}</span>
        <span style="font-size:11px;color:${added ? '#FF6B00' : '#555'};">${added ? '✓ ADDED' : item.unit}</span>
      </div>`;
    }
  }
  if (!html) html = '<div style="color:#555;text-align:center;padding:24px;font-size:12px;">NO ITEMS MATCH</div>';
  el.innerHTML = html;
}

function addMatToJob(jobId, itemId, name, unit) {
  const mats = getJobMaterials(jobId);
  if (mats.find(m => m.itemId === itemId)) return;
  mats.push({ itemId, name, qty: 1, unit });
  setJobMaterials(jobId, mats);
  // Re-render picker to show checkmark
  const search = document.getElementById('mat-picker-search');
  filterMatPicker(jobId, search ? search.value : '');
  renderJobMaterials(jobId);
}

// ── Address-level material rollup ──
function getAddrMaterialRollup(addrId) {
  const jobs = loadJobs().filter(j => j.addressId === addrId && !j.archived);
  const rollup = {};
  for (const j of jobs) {
    if (!j.materials) continue;
    for (const m of j.materials) {
      if (rollup[m.itemId]) {
        rollup[m.itemId].qty += m.qty;
      } else {
        rollup[m.itemId] = { ...m };
      }
    }
  }
  return Object.values(rollup).sort((a, b) => a.name.localeCompare(b.name));
}

function renderAddrMaterialRollup(addrId) {
  const rollup = getAddrMaterialRollup(addrId);
  if (!rollup.length) return '';
  const lib = loadMaterialLibrary();
  const catMap = {};
  if (lib) lib.categories.forEach(c => c.items.forEach(i => { catMap[i.id] = c.label; }));
  const grouped = {};
  for (const m of rollup) {
    const cat = catMap[m.itemId] || 'OTHER';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(m);
  }
  let html = `<div class="section-title">MATERIALS TOTAL (${rollup.length})</div><div class="dash-card" style="padding:8px 14px;">`;
  for (const [cat, items] of Object.entries(grouped)) {
    html += `<div style="font-size:10px;color:#555;font-weight:800;letter-spacing:1px;margin-top:8px;margin-bottom:4px;">${esc(cat)}</div>`;
    for (const m of items) {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:13px;">${esc(m.name)}</span>
        <span style="font-size:13px;font-weight:800;color:#FF6B00;">${m.qty} ${esc(m.unit)}</span>
      </div>`;
    }
  }
  html += '</div>';
  return html;
}

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
    jobs: JSON.parse(localStorage.getItem(JOBS_KEY) || '[]'),
    techs: loadTechs(),
    addresses: loadAddresses(),
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
      if (!data.jobs || !Array.isArray(data.jobs)) { alert('INVALID BACKUP.'); return; }
      if (!confirm('REPLACE ALL DATA WITH BACKUP?')) return;
      localStorage.setItem(JOBS_KEY, JSON.stringify(data.jobs));
      if (data.techs) saveTechs(data.techs);
      if (data.addresses) saveAddresses(data.addresses);
      if (data.media && Array.isArray(data.media)) {
        await clearAllMediaBlobs();
        for (const blob of data.media) await saveMediaBlob(blob.id, blob.data);
      }
      renderSettings();
      alert(data.jobs.length + ' TICKETS RESTORED.');
    } catch (e) { alert('IMPORT FAILED: ' + e.message); }
    input.value = '';
  };
  reader.readAsText(input.files[0]);
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
    let changed = false;
    jobs.forEach(j => {
      if (j.manually_added_to_vector) { j.manually_added_to_vector = false; changed = true; }
    });
    if (changed) saveJobs(jobs);
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
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
