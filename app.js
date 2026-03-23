// ═══════════════════════════════════════════
// DATA LAYER (localStorage for metadata)
// ═══════════════════════════════════════════
const JOBS_KEY = 'astra_jobs';
const TECHS_KEY = 'astra_techs';
const ADDRS_KEY = 'astra_addresses';
const STATUSES = ['Not Started','In Progress','Complete','Needs Callback','Waiting on Materials'];

function loadJobs() {
  try { return JSON.parse(localStorage.getItem(JOBS_KEY)) || []; }
  catch { return []; }
}
function saveJobs(jobs) {
  // Strip any legacy inline base64 data before saving to localStorage
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

function statusClass(s) {
  return 'badge-' + s.toLowerCase().replace(/\s+/g, '-');
}

// Seed default tech if none exist
if (loadTechs().length === 0) {
  saveTechs([{ id: crypto.randomUUID(), name: 'Mike Torres' }]);
}

// ═══════════════════════════════════════════
// INDEXEDDB MEDIA STORE
// ═══════════════════════════════════════════
let mediaDB = null;

function openMediaDB() {
  return new Promise((resolve, reject) => {
    if (mediaDB) { resolve(mediaDB); return; }
    const req = indexedDB.open('astra_media', 1);
    req.onupgradeneeded = function(e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs', { keyPath: 'id' });
      }
    };
    req.onsuccess = function(e) { mediaDB = e.target.result; resolve(mediaDB); };
    req.onerror = function() { reject(req.error); };
  });
}

async function saveMediaBlob(id, data) {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').put({ id: id, data: data });
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

// Migrate legacy inline base64 data to IndexedDB
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
  if (migrated) {
    localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
  }
}

// Init IndexedDB and migrate
openMediaDB().then(() => migrateLegacyMedia()).then(() => renderJobList());

// ═══════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════
let currentScreen = 'screen-jobs';
let currentJobId = null;

function goTo(screenId, jobId) {
  if (screenId === 'screen-jobs') renderJobList();
  if (screenId === 'screen-archive') renderArchiveList();
  if (screenId === 'screen-dashboard') renderDashboard();
  if (screenId === 'screen-addresses') { renderAddressList(''); document.getElementById('addr-search').value = ''; }
  if (screenId === 'screen-addr-detail' && jobId !== undefined) renderAddrDetail(jobId);
  if (screenId === 'screen-settings') renderSettings();
  if (screenId === 'screen-search') {
    setTimeout(() => {
      const inp = document.getElementById('search-input');
      inp.value = '';
      document.getElementById('search-results').innerHTML = '<div class="search-hint">Search across all tickets — active and archived.</div>';
      inp.focus();
    }, 300);
  }
  if (screenId === 'screen-detail' && jobId !== undefined) {
    currentJobId = jobId;
    renderDetail(jobId);
  }
  if (screenId === 'screen-create') resetCreateForm();

  const prev = document.getElementById(currentScreen);
  const next = document.getElementById(screenId);
  prev.classList.remove('active');
  prev.classList.add('slide-out');
  next.classList.add('active');
  currentScreen = screenId;
  next.querySelector('.screen-body').scrollTop = 0;
  setTimeout(() => prev.classList.remove('slide-out'), 300);
}

// ═══════════════════════════════════════════
// JOB LIST
// ═══════════════════════════════════════════
function renderJobList() {
  const jobs = loadJobs().filter(j => !j.archived);
  const el = document.getElementById('jobs-body');
  if (jobs.length === 0) {
    el.innerHTML = '<div class="empty-state"><div>⚡</div><div>No tickets yet.<br>Tap + to create one.</div></div>';
    return;
  }
  el.innerHTML = jobs.map(j => `
    <div class="card" onclick="goTo('screen-detail','${j.id}')">
      <div class="card-address">${esc(j.address)}</div>
      <div class="card-meta">
        ${j.types.map(t => `<span class="badge badge-type">${esc(t)}</span>`).join('')}
        <span class="badge ${statusClass(j.status)}">${esc(j.status)}</span>
      </div>
    </div>
  `).join('');
}

function renderArchiveList() {
  const jobs = loadJobs().filter(j => j.archived);
  const el = document.getElementById('archive-body');
  if (jobs.length === 0) {
    el.innerHTML = '<div class="empty-state"><div>📦</div><div>No archived tickets.</div></div>';
    return;
  }
  el.innerHTML = jobs.map(j => `
    <div class="card" onclick="goTo('screen-detail','${j.id}')">
      <div class="card-address">${esc(j.address)}</div>
      <div class="card-meta">
        ${j.types.map(t => `<span class="badge badge-type">${esc(t)}</span>`).join('')}
        <span class="badge ${statusClass(j.status)}">${esc(j.status)}</span>
        <span class="badge badge-archived">Archived</span>
      </div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════
// CREATE TICKET
// ═══════════════════════════════════════════
function resetCreateForm() {
  document.getElementById('c-address').value = '';
  document.querySelectorAll('#c-types .chip').forEach(c => c.classList.remove('selected'));
  document.getElementById('c-status').value = 'Not Started';
  document.getElementById('c-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('c-notes').value = '';
  // Populate tech dropdown
  const sel = document.getElementById('c-tech');
  const techs = loadTechs();
  sel.innerHTML = '<option value="">Select tech…</option>' +
    techs.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
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
  if (a) document.getElementById('c-address').value = a.address;
  document.getElementById('c-addr-suggest').style.display = 'none';
}

function saveNewTicket() {
  const address = document.getElementById('c-address').value.trim();
  if (!address) { document.getElementById('c-address').focus(); return; }

  const types = [];
  document.querySelectorAll('#c-types .chip.selected').forEach(c => types.push(c.textContent));

  const techSel = document.getElementById('c-tech');
  const techId = techSel.value;
  const techName = techSel.options[techSel.selectedIndex]?.text || '';

  const addressId = findOrCreateAddress(address);

  const job = {
    id: crypto.randomUUID(),
    syncId: crypto.randomUUID(),
    address: address,
    addressId: addressId,
    types: types.length ? types : ['General'],
    status: document.getElementById('c-status').value,
    date: document.getElementById('c-date').value,
    techId: techId,
    techName: techId ? techName : '',
    notes: document.getElementById('c-notes').value,
    photos: [],
    drawings: [],
    videos: [],
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
function getJob(id) { return loadJobs().find(j => j.id === id); }

function updateJob(id, updates) {
  const jobs = loadJobs();
  const idx = jobs.findIndex(j => j.id === id);
  if (idx === -1) return;
  Object.assign(jobs[idx], updates, { updatedAt: new Date().toISOString() });
  saveJobs(jobs);
}

async function renderDetail(jobId) {
  const j = getJob(jobId);
  if (!j) return;
  if (!j.videos) j.videos = [];

  const techs = loadTechs();
  const typeBadges = j.types.map(t => `<span class="badge badge-type">${esc(t)}</span>`).join('');
  const dateFormatted = j.date ? new Date(j.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  // Load thumbnail URLs from IndexedDB
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

  document.getElementById('detail-body').innerHTML = `
    <div class="detail-header">
      <div class="detail-address">${esc(j.address)}</div>
      <div style="display:flex;gap:16px;margin-bottom:6px;">
        ${j.addressId ? '<button style="background:none;border:none;color:#FF6B00;font-size:13px;font-weight:600;cursor:pointer;padding:0;" onclick="goTo(\'screen-addr-detail\',\'' + j.addressId + '\')">View Property →</button>' : ''}
        <button style="background:none;border:none;color:#4A9DFF;font-size:13px;font-weight:600;cursor:pointer;padding:0;" onclick="navigateTo('${esc(j.address).replace(/'/g, "\\'")}')">Navigate →</button>
      </div>
      <div class="card-meta" style="margin-bottom:10px;">
        ${typeBadges}
        <span class="badge ${statusClass(j.status)} badge-status" onclick="openStatusPicker()">${esc(j.status)}</span>
      </div>
      <div class="detail-row"><span>Date</span><span>${dateFormatted}</span></div>
      <div class="detail-row"><span>Tech</span>
        <select style="background:#2b2b2b;color:#fff;border:1px solid #444;border-radius:8px;padding:6px 10px;font-size:14px;min-height:36px;" onchange="updateJob('${jobId}',{techId:this.value,techName:this.options[this.selectedIndex].text})">
          <option value="">Unassigned</option>
          ${techs.map(t => `<option value="${t.id}" ${t.id===j.techId?'selected':''}>${esc(t.name)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="section-title">Notes</div>
    <div class="field" style="margin-bottom:0;">
      <textarea id="detail-notes" style="min-height:90px;" onblur="updateJob('${jobId}',{notes:this.value})">${esc(j.notes)}</textarea>
    </div>

    <div class="section-title">Photos${j.photos.length ? ' ('+j.photos.length+')' : ''}</div>
    <button class="upload-btn" onclick="document.getElementById('photo-input').click()">
      <span style="font-size:20px;">📷</span> Add Photos
    </button>
    ${j.photos.length ? '<div class="media-grid">' + photoThumbs + '</div>' : ''}

    <div class="section-title">Videos${j.videos.length ? ' ('+j.videos.length+')' : ''}</div>
    <button class="upload-btn" onclick="document.getElementById('video-input').click()">
      <span style="font-size:20px;">🎥</span> Add Videos
    </button>
    ${j.videos.length ? '<div class="media-grid">' + videoThumbs + '</div>' : ''}

    <div class="section-title">Drawings${j.drawings.length ? ' ('+j.drawings.length+')' : ''}</div>
    <button class="upload-btn" onclick="document.getElementById('drawing-input').click()">
      <span style="font-size:20px;">📎</span> Upload Drawing
    </button>
    ${j.drawings.length ? '<div class="media-grid">' + drawingThumbs + '</div>' : ''}

    ${j.archived
      ? `<button class="btn btn-unarchive" onclick="unarchiveJob('${jobId}')">Restore from Archive</button>`
      : `<button class="btn btn-archive" onclick="archiveJob('${jobId}')">Archive Ticket</button>`
    }
    <div style="height:24px;"></div>
  `;
}

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
function renderDashboard() {
  const allJobs = loadJobs();
  const active = allJobs.filter(j => !j.archived);
  const archived = allJobs.filter(j => j.archived);
  const total = allJobs.length;

  // Status breakdown (active only)
  const statusCounts = {};
  STATUSES.forEach(s => statusCounts[s] = 0);
  active.forEach(j => { if (statusCounts[j.status] !== undefined) statusCounts[j.status]++; });

  const statusColors = {
    'Not Started': '#666', 'In Progress': '#c9a800', 'Complete': '#2d8a4e',
    'Needs Callback': '#c0392b', 'Waiting on Materials': '#FF6B00'
  };

  // Job type frequency
  const typeCounts = {};
  allJobs.forEach(j => j.types.forEach(t => { typeCounts[t] = (typeCounts[t] || 0) + 1; }));
  const typesSorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  const maxTypeCount = typesSorted.length ? typesSorted[0][1] : 1;

  // Tech workload (active only)
  const techCounts = {};
  active.forEach(j => { if (j.techName) techCounts[j.techName] = (techCounts[j.techName] || 0) + 1; });
  const techSorted = Object.entries(techCounts).sort((a, b) => b[1] - a[1]);

  // Media counts
  let totalPhotos = 0, totalDrawings = 0, totalVideos = 0;
  allJobs.forEach(j => { totalPhotos += (j.photos || []).length; totalDrawings += (j.drawings || []).length; totalVideos += (j.videos || []).length; });

  // Recent activity (last 10 updated)
  const recent = [...allJobs].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 8);

  // Completion rate
  const completedCount = allJobs.filter(j => j.status === 'Complete' || j.archived).length;
  const completionPct = total ? Math.round((completedCount / total) * 100) : 0;

  // This week's activity
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const createdThisWeek = allJobs.filter(j => new Date(j.createdAt) >= weekAgo).length;
  const updatedThisWeek = allJobs.filter(j => new Date(j.updatedAt) >= weekAgo).length;

  document.getElementById('dashboard-body').innerHTML = `
    <!-- Overview Stats -->
    <div class="dash-grid">
      <div class="dash-stat">
        <div class="dash-stat-num" style="color:#FF6B00;">${active.length}</div>
        <div class="dash-stat-label">Active Jobs</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-num" style="color:#2d8a4e;">${archived.length}</div>
        <div class="dash-stat-label">Archived</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-num" style="color:#c9a800;">${completionPct}%</div>
        <div class="dash-stat-label">Completion Rate</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-num" style="color:#fff;">${totalPhotos + totalDrawings + totalVideos}</div>
        <div class="dash-stat-label">Total Files</div>
      </div>
    </div>

    <!-- Status Breakdown -->
    <div class="dash-card" style="margin-top:12px;">
      <div class="dash-card-title">Active Jobs by Status</div>
      ${STATUSES.map(s => {
        const count = statusCounts[s];
        const pct = active.length ? Math.round((count / active.length) * 100) : 0;
        return `<div class="dash-row">
          <div class="dash-row-label"><span class="badge ${statusClass(s)}" style="font-size:10px;">${s}</span></div>
          <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${pct}%;background:${statusColors[s]};"></div></div>
          <div class="dash-row-value">${count}</div>
        </div>`;
      }).join('')}
    </div>

    <!-- Job Types -->
    ${typesSorted.length ? `<div class="dash-card">
      <div class="dash-card-title">Job Types</div>
      ${typesSorted.map(([type, count]) => {
        const pct = Math.round((count / maxTypeCount) * 100);
        return `<div class="dash-row">
          <div class="dash-row-label" style="min-width:100px;">${esc(type)}</div>
          <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${pct}%;background:#FF6B00;"></div></div>
          <div class="dash-row-value">${count}</div>
        </div>`;
      }).join('')}
    </div>` : ''}

    <!-- Tech Workload -->
    ${techSorted.length ? `<div class="dash-card">
      <div class="dash-card-title">Tech Workload (Active)</div>
      ${techSorted.map(([name, count]) => `<div class="dash-row">
        <div class="dash-row-label">${esc(name)}</div>
        <div class="dash-row-value">${count} job${count !== 1 ? 's' : ''}</div>
      </div>`).join('')}
    </div>` : ''}

    <!-- This Week -->
    <div class="dash-card">
      <div class="dash-card-title">This Week</div>
      <div class="dash-row">
        <div class="dash-row-label">Tickets Created</div>
        <div class="dash-row-value" style="color:#FF6B00;">${createdThisWeek}</div>
      </div>
      <div class="dash-row">
        <div class="dash-row-label">Tickets Updated</div>
        <div class="dash-row-value">${updatedThisWeek}</div>
      </div>
      <div class="dash-row">
        <div class="dash-row-label">Photos</div>
        <div class="dash-row-value">${totalPhotos}</div>
      </div>
      <div class="dash-row">
        <div class="dash-row-label">Videos</div>
        <div class="dash-row-value">${totalVideos}</div>
      </div>
      <div class="dash-row">
        <div class="dash-row-label">Drawings</div>
        <div class="dash-row-value">${totalDrawings}</div>
      </div>
    </div>

    <!-- Recent Activity -->
    ${recent.length ? `<div class="dash-card">
      <div class="dash-card-title">Recent Activity</div>
      ${recent.map(j => {
        const ago = timeAgo(j.updatedAt);
        return `<div class="dash-activity" onclick="goTo('screen-detail','${j.id}')" style="cursor:pointer;">
          <div class="dash-activity-dot" style="background:${statusColors[j.status] || '#666'};"></div>
          <div style="flex:1;overflow:hidden;">
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#ccc;font-weight:500;">${esc(j.address)}</div>
            <div style="font-size:11px;color:#555;">${esc(j.status)}${j.archived ? ' · Archived' : ''}</div>
          </div>
          <div style="font-size:11px;color:#555;white-space:nowrap;">${ago}</div>
        </div>`;
      }).join('')}
    </div>` : ''}

    <div style="height:24px;"></div>
  `;
}

function timeAgo(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + 'd ago';
  return Math.floor(days / 7) + 'w ago';
}

// ═══════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════
function runSearch(query) {
  const el = document.getElementById('search-results');
  const q = query.trim().toLowerCase();

  if (!q) {
    el.innerHTML = '<div class="search-hint">Search across all tickets — active and archived.</div>';
    return;
  }

  const jobs = loadJobs();
  const matches = jobs.filter(j => {
    const haystack = [
      j.address, j.techName, j.notes, j.status,
      ...j.types
    ].join(' ').toLowerCase();
    return q.split(/\s+/).every(word => haystack.includes(word));
  });

  if (matches.length === 0) {
    el.innerHTML = '<div class="search-hint">No tickets match "' + esc(query) + '"</div>';
    return;
  }

  const active = matches.filter(j => !j.archived);
  const archived = matches.filter(j => j.archived);
  let html = '';

  if (active.length) {
    html += '<div class="search-divider">Active (' + active.length + ')</div>';
    html += active.map(j => searchCard(j)).join('');
  }
  if (archived.length) {
    html += '<div class="search-divider">Archived (' + archived.length + ')</div>';
    html += archived.map(j => searchCard(j, true)).join('');
  }
  el.innerHTML = html;
}

function searchCard(j, isArchived) {
  return `
    <div class="card" onclick="goTo('screen-detail','${j.id}')">
      <div class="card-address">${esc(j.address)}</div>
      <div class="card-meta">
        ${j.types.map(t => `<span class="badge badge-type">${esc(t)}</span>`).join('')}
        <span class="badge ${statusClass(j.status)}">${esc(j.status)}</span>
        ${isArchived ? '<span class="badge badge-archived">Archived</span>' : ''}
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════
// ADDRESS DATABASE
// ═══════════════════════════════════════════
const ADDR_FIELDS = [
  { key: 'builder', label: 'Builder' },
  { key: 'subdivision', label: 'Subdivision' },
  { key: 'panelType', label: 'Panel Type' },
  { key: 'panelBrand', label: 'Panel Brand' },
  { key: 'ampRating', label: 'Amp Rating' },
  { key: 'breakerType', label: 'Breaker Type' },
  { key: 'serviceType', label: 'Service Type' },
  { key: 'panelLocation', label: 'Panel Location' },
  { key: 'notes', label: 'Property Notes' }
];

function renderAddressList(query) {
  const addrs = loadAddresses();
  const q = (query || '').trim().toLowerCase();
  const filtered = q ? addrs.filter(a => {
    const hay = [a.address, a.builder, a.subdivision, a.panelBrand, a.panelType, a.ampRating, a.notes].join(' ').toLowerCase();
    return q.split(/\s+/).every(w => hay.includes(w));
  }) : addrs;

  const el = document.getElementById('addr-list');
  if (!filtered.length) {
    el.innerHTML = q
      ? '<div class="search-hint">No properties match "' + esc(query) + '"</div>'
      : '<div class="empty-state"><div>🏠</div><div>No properties saved yet.<br>They\'re created when you make a ticket.</div></div>';
    return;
  }
  const allJobs = loadJobs();
  el.innerHTML = filtered.map(a => {
    const jobs = allJobs.filter(j => j.addressId === a.id);
    const subtitle = [a.builder, a.subdivision].filter(Boolean).join(' · ');
    const panelChip = [a.ampRating ? a.ampRating + 'A' : '', a.panelBrand].filter(Boolean).join(' · ');
    const lastJob = jobs.filter(j => j.date).sort((x, y) => y.date.localeCompare(x.date))[0];
    const lastDate = lastJob ? new Date(lastJob.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    return `<div class="card" onclick="goTo('screen-addr-detail','${a.id}')">
      <div class="card-address">${esc(a.address)}</div>
      ${subtitle ? '<div class="card-subtitle">' + esc(subtitle) + '</div>' : ''}
      <div class="card-meta">
        ${panelChip ? '<span class="card-panel-chip">' + esc(panelChip) + '</span>' : ''}
        <span class="badge badge-type">${jobs.length} ticket${jobs.length !== 1 ? 's' : ''}</span>
        ${lastDate ? '<span class="card-last-visit">Last: ' + lastDate + '</span>' : ''}
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

  const fields = ADDR_FIELDS.map(f => `<div class="prop-field">
    <span class="prop-label">${f.label}</span>
    <input class="prop-input" value="${esc(a[f.key] || '')}" placeholder="—"
      onblur="updateAddress('${addrId}',{${f.key}:this.value})">
  </div>`).join('');

  const ticketList = jobs.length ? jobs.map(j => {
    const dateStr = j.date ? new Date(j.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';
    return `<div class="card" onclick="goTo('screen-detail','${j.id}')" style="padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          ${j.types.map(t => '<span class="badge badge-type" style="font-size:10px;">' + esc(t) + '</span>').join(' ')}
          <span class="badge ${statusClass(j.status)}" style="font-size:10px;">${esc(j.status)}</span>
        </div>
        <span style="font-size:12px;color:#666;">${dateStr}</span>
      </div>
    </div>`;
  }).join('') : '<div style="color:#555;font-size:14px;padding:12px;">No tickets yet for this property.</div>';

  document.getElementById('addr-detail-body').innerHTML = `
    <div class="detail-header">
      <div class="detail-address">${esc(a.address)}</div>
      <button class="btn-navigate" onclick="navigateTo('${esc(a.address).replace(/'/g, "\\'")}')">Navigate</button>
    </div>
    <div class="section-title">Property Info</div>
    <div class="dash-card" style="padding:8px 14px;">${fields}</div>
    <div class="section-title">Work History (${jobs.length})</div>
    ${ticketList}
    <div style="height:24px;"></div>
  `;
}

function findOrCreateAddress(addressText) {
  const addrs = loadAddresses();
  const existing = addrs.find(a => a.address.toLowerCase() === addressText.toLowerCase());
  if (existing) return existing.id;
  const newAddr = { id: crypto.randomUUID(), address: addressText };
  ADDR_FIELDS.forEach(f => { newAddr[f.key] = ''; });
  addrs.push(newAddr);
  saveAddresses(addrs);
  return newAddr.id;
}

// ═══════════════════════════════════════════
// ARCHIVE
// ═══════════════════════════════════════════
function archiveJob(id) {
  updateJob(id, { archived: true });
  goTo('screen-jobs');
}
function unarchiveJob(id) {
  updateJob(id, { archived: false });
  goTo('screen-jobs');
}
function goBackFromDetail() {
  const j = getJob(currentJobId);
  goTo(j && j.archived ? 'screen-archive' : 'screen-jobs');
}

// ═══════════════════════════════════════════
// STATUS PICKER
// ═══════════════════════════════════════════
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
    updateJob(currentJobId, { status: status });
    renderDetail(currentJobId);
  }
  closeStatusPicker();
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
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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

// ═══════════════════════════════════════════
// DELETE MEDIA
// ═══════════════════════════════════════════
async function deleteMedia(jobId, type, idx) {
  const label = type === 'photos' ? 'photo' : type === 'videos' ? 'video' : 'drawing';
  if (!confirm('Delete this ' + label + '?')) return;
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
let panStartX = 0, panStartY = 0, panLastX = 0, panLastY = 0;
let isPanning = false;

async function openMedia(jobId, type, idx) {
  const j = getJob(jobId);
  if (!j) return;
  const item = j[type][idx];
  if (!item) return;

  zoomScale = 1; zoomX = 0; zoomY = 0;
  document.getElementById('overlay-title').textContent = item.name;
  const body = document.getElementById('overlay-body');
  const data = await getMediaBlob(item.id);

  if (item.type === 'video') {
    body.innerHTML = `<video src="${data || ''}" controls autoplay style="max-width:100%;max-height:100%;" id="zoom-vid"></video>`;
  } else {
    body.innerHTML = `<img src="${data || ''}" alt="${esc(item.name)}" id="zoom-img" draggable="false">`;
    const img = document.getElementById('zoom-img');
    setupPinchZoom(body, img);
  }
  document.getElementById('media-overlay').classList.add('active');
}

function setupPinchZoom(container, img) {
  function applyTransform() {
    img.style.transform = `translate(${zoomX}px, ${zoomY}px) scale(${zoomScale})`;
  }

  // ── Touch: pinch-zoom + single-finger pan ──
  container.addEventListener('touchstart', function(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      isPanning = false;
      pinchStartDist = getTouchDist(e.touches);
      pinchStartScale = zoomScale;
    } else if (e.touches.length === 1) {
      isPanning = true;
      panStartX = e.touches[0].clientX - zoomX;
      panStartY = e.touches[0].clientY - zoomY;
    }
  }, { passive: false });

  container.addEventListener('touchmove', function(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = getTouchDist(e.touches);
      zoomScale = Math.min(5, Math.max(1, pinchStartScale * (dist / pinchStartDist)));
      if (zoomScale <= 1) { zoomX = 0; zoomY = 0; }
      applyTransform();
    } else if (e.touches.length === 1 && isPanning) {
      e.preventDefault();
      zoomX = e.touches[0].clientX - panStartX;
      zoomY = e.touches[0].clientY - panStartY;
      applyTransform();
    }
  }, { passive: false });

  container.addEventListener('touchend', function() { isPanning = false; });

  // ── Mouse: click-drag pan + wheel zoom ──
  container.addEventListener('mousedown', function(e) {
    e.preventDefault();
    isPanning = true;
    panStartX = e.clientX - zoomX;
    panStartY = e.clientY - zoomY;
    container.style.cursor = 'grabbing';
  });
  container.addEventListener('mousemove', function(e) {
    if (!isPanning) return;
    zoomX = e.clientX - panStartX;
    zoomY = e.clientY - panStartY;
    applyTransform();
  });
  container.addEventListener('mouseup', function() {
    isPanning = false;
    container.style.cursor = 'grab';
  });
  container.addEventListener('mouseleave', function() {
    isPanning = false;
    container.style.cursor = 'grab';
  });
  container.style.cursor = 'grab';

  container.addEventListener('wheel', function(e) {
    e.preventDefault();
    zoomScale = Math.min(5, Math.max(1, zoomScale + (e.deltaY > 0 ? -0.2 : 0.2)));
    if (zoomScale <= 1) { zoomX = 0; zoomY = 0; }
    applyTransform();
  }, { passive: false });
}

function getTouchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function closeOverlay() {
  document.getElementById('media-overlay').classList.remove('active');
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
  jobs.forEach(j => {
    photos += (j.photos || []).length;
    drawings += (j.drawings || []).length;
    videos += (j.videos || []).length;
  });

  document.getElementById('settings-stats').innerHTML = `
    <div class="dash-row"><div class="dash-row-label">Total Tickets</div><div class="dash-row-value">${jobs.length}</div></div>
    <div class="dash-row"><div class="dash-row-label">Active</div><div class="dash-row-value" style="color:#FF6B00;">${active}</div></div>
    <div class="dash-row"><div class="dash-row-label">Archived</div><div class="dash-row-value" style="color:#2d8a4e;">${archived}</div></div>
    <div class="dash-row"><div class="dash-row-label">Photos</div><div class="dash-row-value">${photos}</div></div>
    <div class="dash-row"><div class="dash-row-label">Videos</div><div class="dash-row-value">${videos}</div></div>
    <div class="dash-row"><div class="dash-row-label">Drawings</div><div class="dash-row-value">${drawings}</div></div>
    <div class="dash-row"><div class="dash-row-label">Properties</div><div class="dash-row-value">${loadAddresses().length}</div></div>
  `;

  // Storage usage — IndexedDB (media) + localStorage (metadata)
  let mediaBytes = 0;
  try { mediaBytes = await getMediaDBSize(); } catch(e) {}
  let lsBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    lsBytes += (localStorage.getItem(key) || '').length * 2;
  }
  const totalBytes = mediaBytes + lsBytes;
  const usedMB = (totalBytes / (1024 * 1024)).toFixed(1);

  // IndexedDB can store hundreds of MB — show usage without a hard cap
  document.getElementById('storage-info').innerHTML = `
    <div class="dash-row"><div class="dash-row-label">Media (IndexedDB)</div><div class="dash-row-value">${(mediaBytes / (1024 * 1024)).toFixed(1)} MB</div></div>
    <div class="dash-row"><div class="dash-row-label">Ticket Data</div><div class="dash-row-value">${(lsBytes / 1024).toFixed(0)} KB</div></div>
    <div class="dash-row"><div class="dash-row-label">Total Used</div><div class="dash-row-value" style="color:#FF6B00;">${usedMB} MB</div></div>
    <div style="font-size:12px;color:#555;margin-top:8px;">Media stored in IndexedDB — hundreds of MB available.</div>
  `;
}

async function exportData() {
  const mediaBlobs = await getAllMediaBlobs();
  const data = {
    version: '0.4',
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
      if (!data.jobs || !Array.isArray(data.jobs)) {
        alert('Invalid backup file — no jobs found.');
        return;
      }
      if (!confirm('This will replace ALL current data with the backup. Continue?')) return;
      localStorage.setItem(JOBS_KEY, JSON.stringify(data.jobs));
      if (data.techs) saveTechs(data.techs);
      if (data.addresses) saveAddresses(data.addresses);
      // Restore media blobs
      if (data.media && Array.isArray(data.media)) {
        await clearAllMediaBlobs();
        for (const blob of data.media) {
          await saveMediaBlob(blob.id, blob.data);
        }
      }
      renderSettings();
      alert('Data restored! ' + data.jobs.length + ' tickets imported.');
    } catch (e) {
      alert('Error reading backup file: ' + e.message);
    }
    input.value = '';
  };
  reader.readAsText(input.files[0]);
}

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
// renderJobList() is called after IndexedDB init + migration (see DATA LAYER)

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
