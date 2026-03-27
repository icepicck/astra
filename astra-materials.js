// ═══════════════════════════════════════════
// ASTRA — MATERIALS
// ═══════════════════════════════════════════
(function() {
'use strict';

const A = window.Astra;

let _matPhase = localStorage.getItem('astra_mat_phase') || 'ROUGH';

function _setMatPhase(phase) {
  _matPhase = phase;
  localStorage.setItem('astra_mat_phase', phase);
  renderMaterials();
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
      const phase = (data.phase || 'ROUGH').toUpperCase();
      const key = phase === 'TRIM' ? A.MAT_LIB_TRIM_KEY : A.MAT_LIB_KEY;
      localStorage.setItem(key, JSON.stringify(data));
      const count = data.categories.reduce((s,c) => s + c.items.length, 0);
      alert('IMPORTED: ' + phase + ' (' + data.categories.length + ' CATEGORIES, ' + count + ' ITEMS)');
      renderMaterials();
    } catch (e) {
      alert('IMPORT FAILED: ' + e.message);
    }
    input.value = '';
  };
  reader.readAsText(input.files[0]);
}

async function autoLoadBuiltInLibraries() {
  // Auto-load rough and trim from bundled JSON files if not already imported
  if (!localStorage.getItem(A.MAT_LIB_KEY)) {
    try {
      const res = await fetch('rough_materials.json');
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem(A.MAT_LIB_KEY, JSON.stringify(data));
      }
    } catch {}
  }
  if (!localStorage.getItem(A.MAT_LIB_TRIM_KEY)) {
    try {
      const res = await fetch('trim_materials.json');
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem(A.MAT_LIB_TRIM_KEY, JSON.stringify(data));
      }
    } catch {}
  }
}

function renderMaterials() {
  const body = document.getElementById('materials-body');
  const rough = A.loadRoughLibrary();
  const trim = A.loadTrimLibrary();
  if (!rough && !trim) {
    body.innerHTML = `
      <div class="empty-state">
        <div><svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg></div>
        <div>NO MATERIAL LIBRARY LOADED</div>
        <button class="btn" style="margin-top:16px;" onclick="document.getElementById('mat-import-input').click()">IMPORT MATERIAL JSON</button>
        <input type="file" id="mat-import-input" accept=".json" style="display:none" onchange="importMaterialLibrary(this)">
      </div>`;
    return;
  }
  const activeLib = _matPhase === 'TRIM' ? trim : rough;
  const itemCount = activeLib ? activeLib.categories.reduce((s,c) => s + c.items.length, 0) : 0;

  // Phase toggle
  let toggleHtml = '<div class="date-toggle" style="margin-bottom:12px;">';
  toggleHtml += '<button class="date-toggle-btn' + (_matPhase === 'ROUGH' ? ' active' : '') + '" onclick="_setMatPhase(\'ROUGH\')">ROUGH-IN</button>';
  toggleHtml += '<button class="date-toggle-btn' + (_matPhase === 'TRIM' ? ' active' : '') + '" onclick="_setMatPhase(\'TRIM\')">TRIM-OUT</button>';
  toggleHtml += '</div>';

  body.innerHTML = toggleHtml + `
    <div class="search-bar" style="margin-bottom:12px;">
      <span class="search-icon"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg></span>
      <input type="text" id="mat-search" name="astra-xmatsearch" autocomplete="nope" placeholder="SEARCH ${itemCount} ITEMS..." oninput="filterMaterials(this.value)">
    </div>
    <div id="mat-list"></div>
    <div style="padding:12px;text-align:center;">
      <button class="btn" style="background:none;border:1px solid #333;color:#555;font-size:11px;" onclick="document.getElementById('mat-reimport-input').click()">IMPORT LIBRARY</button>
      <input type="file" id="mat-reimport-input" accept=".json" style="display:none" onchange="importMaterialLibrary(this)">
    </div>
    <div class="spacer"></div>`;
  filterMaterials('');
}

function filterMaterials(query) {
  const lib = _matPhase === 'TRIM' ? A.loadTrimLibrary() : A.loadRoughLibrary();
  if (!lib) { const el = document.getElementById('mat-list'); if (el) el.innerHTML = '<div class="search-hint">NO ' + _matPhase + ' LIBRARY LOADED</div>'; return; }
  const el = document.getElementById('mat-list');
  const q = query.trim().toLowerCase();
  let html = '';
  for (const cat of lib.categories) {
    const items = q ? cat.items.filter(i => i.name.toLowerCase().includes(q)) : cat.items;
    if (!items.length) continue;
    html += `<div class="section-title" style="margin-top:12px;">${A.esc(cat.label)} (${items.length})</div>`;
    html += `<div class="dash-card" style="padding:4px 14px;">`;
    for (const item of items) {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #2a2a2a;">
        <span style="font-size:13px;font-weight:600;flex:1;">${A.esc(item.name)}</span>
        <span style="font-size:11px;color:#555;min-width:30px;text-align:right;">${A.esc(item.unit)}</span>
      </div>`;
    }
    html += `</div>`;
  }
  if (!html) html = '<div class="search-hint">NO ITEMS MATCH "' + A.esc(query).toUpperCase() + '"</div>';
  el.innerHTML = html;
}

// ── Ticket-level materials ──
let _createTicketMaterials = [];

function getJobMaterials(jobId) {
  if (jobId === '_new_') return _createTicketMaterials;
  const j = A.getJob(jobId);
  return (j && j.materials) ? j.materials : [];
}

function setJobMaterials(jobId, materials) {
  if (jobId === '_new_') { _createTicketMaterials = materials; return; }
  A.updateJob(jobId, { materials });
}

function renderJobMaterials(jobId) {
  const el = document.getElementById(jobId === '_new_' ? 'create-materials-list' : 'job-materials-list');
  if (!el) return;
  const mats = getJobMaterials(jobId);
  if (!mats.length) {
    el.innerHTML = '<div style="color:#333;font-size:12px;padding:8px 0;text-transform:uppercase;">NO MATERIALS ADDED.</div>';
    return;
  }
  // Group by category
  const lib = A.loadMaterialLibrary();
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
    html += `<div class="cat-label">${A.esc(cat)}</div>`;
    for (const m of items) {
      html += `<div class="mat-row">
        <span class="mat-name">${A.esc(m.name)}${m.variant ? ' <span style="color:#FF6B00;font-size:11px;">(' + A.esc(m.variant) + ')</span>' : ''}${m.partRef ? ' <span style="color:#444;font-size:10px;">#' + A.esc(m.partRef) + '</span>' : ''}</span>
        <div class="mat-controls">
          <button class="qty-btn" onclick="adjustMatQty('${jobId}','${m.itemId}',-1)">−</button>
          <input type="number" inputmode="numeric" class="qty-input" value="${m.qty}" min="1"
            onchange="setMatQty('${jobId}','${m.itemId}',this.value)"
            onblur="setMatQty('${jobId}','${m.itemId}',this.value)"
            onfocus="this.select()">
          <span class="qty-unit">${A.esc(m.unit)}</span>
          <button class="remove-btn" onclick="removeMatFromJob('${jobId}','${m.itemId}')">✕</button>
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

function setMatQty(jobId, itemId, val) {
  const mats = getJobMaterials(jobId);
  const m = mats.find(x => x.itemId === itemId);
  if (!m) return;
  const qty = Math.max(1, parseInt(val) || 1);
  if (m.qty === qty) return;
  m.qty = qty;
  setJobMaterials(jobId, mats);
  renderJobMaterials(jobId);
}

function removeMatFromJob(jobId, itemId) {
  if (!confirm('REMOVE THIS MATERIAL?')) return;
  const mats = getJobMaterials(jobId).filter(x => x.itemId !== itemId);
  setJobMaterials(jobId, mats);
  renderJobMaterials(jobId);
}

function openMatPicker(jobId) {
  const lib = A.loadMaterialLibrary();
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
      <span class="search-icon"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg></span>
      <input type="text" id="mat-picker-search" name="astra-xmatpick" autocomplete="nope" placeholder="SEARCH MATERIALS..." oninput="filterMatPicker('${jobId}',this.value)" autofocus>
    </div>
    <div id="mat-picker-list" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;"></div>`;
  filterMatPicker(jobId, '');
}

function closeMatPicker() {
  const overlay = document.getElementById('mat-picker-overlay');
  if (overlay) overlay.remove();
}

let _matPickerActiveItem = null;
let _matPickerActiveVariant = null;

function _matQtyRow(jobId, itemId, escapedName, escapedUnit, defaultQty, color, variants) {
  let variantHtml = '';
  if (variants && variants.length > 0 && !_matPickerActiveVariant) {
    // Show variant selection buttons
    variantHtml = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">`;
    for (const v of variants) {
      variantHtml += `<button onclick="_matPickerActiveVariant='${v.replace(/'/g,"\\'")}';showMatQtyInput('${jobId}','${itemId}')"
        style="height:40px;padding:0 14px;background:#1a1a1a;border:1px solid ${color};border-radius:8px;color:#e0e0e0;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:0.5px;">${A.esc(v)}</button>`;
    }
    variantHtml += `</div>`;
    return `<div style="background:#2a2a2a;border-radius:10px;padding:12px;margin:4px 0;border:1px solid ${color};">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px;">${escapedName} <span style="color:#555;font-size:11px;">${escapedUnit}</span></div>
      <div style="font-size:10px;color:${color};font-weight:800;letter-spacing:1px;margin-bottom:6px;">SELECT STYLE:</div>
      ${variantHtml}
      <button onclick="_matPickerActiveItem=null;_matPickerActiveVariant=null;filterMatPicker('${jobId}',document.getElementById('mat-picker-search')?document.getElementById('mat-picker-search').value:'')"
        style="height:36px;width:100%;background:none;border:1px solid #333;border-radius:8px;color:#666;font-size:12px;cursor:pointer;margin-top:4px;">CANCEL</button>
    </div>`;
  }
  const variantLabel = _matPickerActiveVariant ? ' <span style="color:' + color + ';font-size:11px;font-weight:800;">' + A.esc(_matPickerActiveVariant) + '</span>' : '';
  return `<div style="background:#2a2a2a;border-radius:10px;padding:12px;margin:4px 0;border:1px solid ${color};">
    <div style="font-size:13px;font-weight:700;margin-bottom:8px;">${escapedName}${variantLabel} <span style="color:#555;font-size:11px;">${escapedUnit}</span></div>
    <div class="picker-qty-group">
      <button class="picker-qty-btn" style="border:2px solid ${color};" onclick="_matStepQty(-1)"
        onpointerdown="_matLongPress(this,-1)" onpointerup="_matLongStop()" onpointerleave="_matLongStop()">−</button>
      <input type="number" id="mat-qty-input" inputmode="numeric" pattern="[0-9]*" min="1" value="${defaultQty}"
        class="picker-qty-input" style="border:2px solid ${color};"
        onkeydown="if(event.key==='Enter'){_matAddFromPicker('${jobId}','${itemId}');event.preventDefault();}">
      <button class="picker-qty-btn" style="border:2px solid ${color};" onclick="_matStepQty(1)"
        onpointerdown="_matLongPress(this,1)" onpointerup="_matLongStop()" onpointerleave="_matLongStop()">+</button>
      <button class="picker-add-btn" style="background:${color};" onclick="_matAddFromPicker('${jobId}','${itemId}')">ADD</button>
      <button class="picker-qty-btn" style="border:1px solid #333;color:#666;" onclick="_matPickerActiveItem=null;_matPickerActiveVariant=null;filterMatPicker('${jobId}',document.getElementById('mat-picker-search')?document.getElementById('mat-picker-search').value:'')">✕</button>
    </div>
  </div>`;
}

// +/- stepper helpers with long-press acceleration
let _matLongTimer = null;
let _matLongInterval = null;

function _matStepQty(delta) {
  const inp = document.getElementById('mat-qty-input');
  if (!inp) return;
  inp.value = Math.max(1, (parseInt(inp.value) || 1) + delta);
}

function _matLongPress(btn, delta) {
  _matLongStop();
  _matLongTimer = setTimeout(() => {
    _matLongInterval = setInterval(() => _matStepQty(delta), 80);
  }, 400);
}

function _matLongStop() {
  if (_matLongTimer) { clearTimeout(_matLongTimer); _matLongTimer = null; }
  if (_matLongInterval) { clearInterval(_matLongInterval); _matLongInterval = null; }
}

function _matAddFromPicker(jobId, itemId) {
  const inp = document.getElementById('mat-qty-input');
  addMatToJob(jobId, itemId, '', '', inp ? inp.value : '1');
}

function _matPickerRow(jobId, itemId, escapedName, added, rightText, rightColor) {
  return `<div class="picker-row${added ? ' added' : ''}" onclick="${added ? '' : "showMatQtyInput('" + jobId + "','" + itemId + "')"}"
    style="cursor:${added ? 'default' : 'pointer'};min-height:48px;">
    <span class="picker-item-name" style="font-weight:600;">${escapedName}</span>
    <span style="font-size:11px;color:${rightColor};">${rightText}</span>
  </div>`;
}

// ── Frequent flyers — track material add frequency ──
const MAT_FREQ_KEY = 'astra_mat_frequency';
function loadMatFreq() {
  try { return JSON.parse(localStorage.getItem(MAT_FREQ_KEY)) || {}; } catch { return {}; }
}
function trackMatAdd(itemId) {
  const freq = loadMatFreq();
  freq[itemId] = (freq[itemId] || 0) + 1;
  localStorage.setItem(MAT_FREQ_KEY, JSON.stringify(freq));
}
function getFrequentMats(lib, limit) {
  const freq = loadMatFreq();
  const entries = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, limit || 10);
  if (!entries.length) return [];
  const allItems = {};
  lib.categories.forEach(c => c.items.forEach(i => { allItems[i.id] = { ...i, catLabel: c.label }; }));
  return entries.map(([id]) => allItems[id]).filter(Boolean);
}

function filterMatPicker(jobId, query) {
  const lib = A.loadMaterialLibrary();
  if (!lib) return;
  const el = document.getElementById('mat-picker-list');
  if (!el) return;
  const q = query.trim().toLowerCase();
  const existing = getJobMaterials(jobId).map(m => m.itemId);
  let html = '';

  // Bulk templates (only when not searching and no materials added yet)
  if (!q && existing.length === 0) {
    html += `<div class="cat-label" style="color:#9b59b6;margin:4px 0 6px;">QUICK START</div>`;
    html += `<button class="template-btn" style="border:1px solid #9b59b6;" onclick="applyBulkTemplate('${jobId}','rough')">
      <span style="color:#9b59b6;font-weight:800;">ROUGH-IN STARTER</span><br><span style="color:#555;font-size:11px;">15 common items — boxes, wire, panels, ground rod, bushings</span>
    </button>`;
    html += `<button class="template-btn" style="border:1px solid #2d8a4e;" onclick="applyBulkTemplate('${jobId}','trim')">
      <span style="color:#2d8a4e;font-weight:800;">TRIM-OUT STARTER</span><br><span style="color:#555;font-size:11px;">12 common items — receptacles, switches, plates, breakers, smoke detectors</span>
    </button>`;
    html += `<div style="height:1px;background:#333;margin:12px 0;"></div>`;
  }

  // "Previously at this address" section (only when not searching)
  if (!q) {
    const job = A.getJob(jobId);
    if (job && job.addressId) {
      const otherJobs = A.loadJobs().filter(j => j.addressId === job.addressId && j.id !== jobId);
      const prevMats = {};
      otherJobs.forEach(j => {
        if (!j.materials) return;
        j.materials.forEach(m => {
          if (!prevMats[m.itemId]) prevMats[m.itemId] = { ...m };
          else prevMats[m.itemId].qty += m.qty;
        });
      });
      const prevList = Object.values(prevMats);
      if (prevList.length > 0) {
        html += `<div class="cat-label" style="color:#2d8a4e;margin:4px 0 6px;">PREVIOUSLY AT THIS ADDRESS</div>`;
        for (const item of prevList) {
          const added = existing.includes(item.itemId);
          const isActive = _matPickerActiveItem === item.itemId;
          const libItem = lib.categories.flatMap(c => c.items).find(i => i.id === item.itemId);
          const unit = libItem ? libItem.unit : item.unit;
          if (isActive && !added) {
            html += _matQtyRow(jobId, item.itemId, A.esc(item.name), A.esc(unit) + ' — PREV: ' + item.qty, item.qty, '#2d8a4e', libItem ? libItem.variants : null);
          } else {
            html += _matPickerRow(jobId, item.itemId, A.esc(item.name), added, added ? '✓ ADDED' : 'PREV: ' + item.qty + ' ' + unit, added ? '#FF6B00' : '#2d8a4e');
          }
        }
        html += `<div style="height:1px;background:#333;margin:12px 0;"></div>`;
      }
    }
  }

  // Frequent flyers section (only when not searching)
  if (!q) {
    const frequent = getFrequentMats(lib, 10);
    if (frequent.length > 0) {
      html += `<div class="cat-label" style="color:#FF6B00;margin:4px 0 6px;">FREQUENT</div>`;
      for (const item of frequent) {
        const added = existing.includes(item.id);
        const isActive = _matPickerActiveItem === item.id;
        if (isActive && !added) {
          html += _matQtyRow(jobId, item.id, A.esc(item.name), A.esc(item.unit), 1, '#FF6B00', item.variants);
        } else {
          const badge = item.variants ? ' ▸' : '';
          html += _matPickerRow(jobId, item.id, A.esc(item.name) + badge, added, added ? '✓ ADDED' : item.unit, added ? '#FF6B00' : '#555');
        }
      }
      html += `<div style="height:1px;background:#333;margin:12px 0;"></div>`;
    }
  }

  for (const cat of lib.categories) {
    const items = q ? cat.items.filter(i => i.name.toLowerCase().includes(q)) : cat.items;
    if (!items.length) continue;
    html += `<div class="cat-label" style="margin:12px 0 6px;">${A.esc(cat.label)}</div>`;
    for (const item of items) {
      const added = existing.includes(item.id);
      const isActive = _matPickerActiveItem === item.id;
      if (isActive && !added) {
        html += _matQtyRow(jobId, item.id, A.esc(item.name), A.esc(item.unit), 1, '#FF6B00', item.variants);
      } else {
        const badge = item.variants ? ' ▸' : '';
        html += _matPickerRow(jobId, item.id, A.esc(item.name) + badge, added, added ? '✓ ADDED' : item.unit, added ? '#FF6B00' : '#555');
      }
    }
  }
  if (!html) html = '<div style="color:#555;text-align:center;padding:24px;font-size:12px;">NO ITEMS MATCH</div>';
  el.innerHTML = html;
  // Auto-focus qty input if active
  if (_matPickerActiveItem) {
    const inp = document.getElementById('mat-qty-input');
    if (inp) { inp.focus(); inp.select(); }
  }
}

function showMatQtyInput(jobId, itemId) {
  if (_matPickerActiveItem !== itemId) _matPickerActiveVariant = null;
  _matPickerActiveItem = itemId;
  const search = document.getElementById('mat-picker-search');
  filterMatPicker(jobId, search ? search.value : '');
}

function _lookupMatItem(itemId) {
  const lib = A.loadMaterialLibrary();
  if (!lib) return null;
  for (const cat of lib.categories) {
    const item = cat.items.find(i => i.id === itemId);
    if (item) return item;
  }
  return null;
}

function addMatToJob(jobId, itemId, nameOverride, unitOverride, qtyStr) {
  const mats = getJobMaterials(jobId);
  const variant = _matPickerActiveVariant || null;
  if (mats.find(m => m.itemId === itemId && (m.variant || null) === variant)) return;
  const item = _lookupMatItem(itemId);
  const name = item ? item.name : (nameOverride || itemId);
  const unit = item ? item.unit : (unitOverride || 'EA');
  const qty = Math.max(1, parseInt(qtyStr) || 1);
  const entry = { itemId, name, qty, unit };
  if (_matPickerActiveVariant) {
    entry.variant = _matPickerActiveVariant;
    // Attach part ref if available
    if (item && item.part_refs && item.part_refs[_matPickerActiveVariant]) {
      entry.partRef = item.part_refs[_matPickerActiveVariant];
    }
  }
  mats.push(entry);
  setJobMaterials(jobId, mats);
  trackMatAdd(itemId);
  _matPickerActiveItem = null;
  _matPickerActiveVariant = null;
  // Re-render picker to show checkmark
  const search = document.getElementById('mat-picker-search');
  filterMatPicker(jobId, search ? search.value : '');
  renderJobMaterials(jobId);
  const variantTag = entry.variant ? ' (' + entry.variant + ')' : '';
  A.showToast(name + variantTag + ' ×' + qty + ' ADDED');
}

// ── Bulk templates ──
const BULK_TEMPLATES = {
  rough: {
    label: 'ROUGH-IN STARTER',
    items: [
      { id: 'bc_003', qty: 20 },  // 1 SINGLE GANG BOX
      { id: 'bc_004', qty: 8 },   // 2 GANG BOX
      { id: 'bc_007', qty: 10 },  // 4/0 NAIL ON LIGHT
      { id: 'bc_009', qty: 3 },   // PLASTIC FAN BOX
      { id: 'bc_019', qty: 15 },  // RECESS CAN DMF
      { id: 'wp_001', qty: 500 }, // 14/2 WG ROMEX
      { id: 'wp_003', qty: 250 }, // 12/2 WG ROMEX
      { id: 'wp_005', qty: 100 }, // 10/2 WG ROMEX
      { id: 'wp_016', qty: 1 },   // CH 42 INDOOR (panel)
      { id: 'ak_011', qty: 2 },   // GALVANIZED GROUND ROD 8'
      { id: 'ak_001', qty: 10 },  // 3/8" POP IN BUSHINGS
      { id: 'sm_012', qty: 1 },   // GROUND BAR
      { id: 'sm_011', qty: 1 },   // INTERBONDING SYSTEM
      { id: 'ak_015', qty: 20 },  // LONG NAILPLATE
      { id: 'sm_010', qty: 1 }    // FLASH TAPE
    ]
  },
  trim: {
    label: 'TRIM-OUT STARTER',
    items: [
      { id: 'tr_001', qty: 20 },  // Duplex Receptacle 15A TR
      { id: 'tr_003', qty: 4 },   // GFCI Receptacle 15A TR White
      { id: 'tr_007', qty: 4 },   // Receptacle 20A T-Slot (Kitchen/Laundry)
      { id: 'sw_001', qty: 15 },  // Single Pole Switch 15A
      { id: 'sw_002', qty: 6 },   // 3-Way Switch 15A
      { id: 'cp_001', qty: 20 },  // 1-Gang Plate Duplex Receptacle
      { id: 'cp_002', qty: 15 },  // 1-Gang Plate Toggle Switch
      { id: 'cp_004', qty: 4 },   // 2-Gang Plate Duplex/Duplex
      { id: 'ls_003', qty: 6 },   // Smoke/CO Combo Detector Hardwired
      { id: 'fh_001', qty: 2 },   // Wire Nut Assorted Pack
      { id: 'fh_006', qty: 20 },  // Grounding Pigtail Pre-Made
      { id: 'fh_013', qty: 2 }    // Electrical Tape 3/4" Black
    ]
  }
};

function applyBulkTemplate(jobId, templateKey) {
  const tmpl = BULK_TEMPLATES[templateKey];
  if (!tmpl) return;
  const mats = getJobMaterials(jobId);
  const existingIds = new Set(mats.map(m => m.itemId));
  let added = 0;
  for (const entry of tmpl.items) {
    if (existingIds.has(entry.id)) continue;
    const item = _lookupMatItem(entry.id);
    if (!item) continue;
    mats.push({ itemId: entry.id, name: item.name, qty: entry.qty, unit: item.unit });
    trackMatAdd(entry.id);
    added++;
  }
  if (added === 0) {
    A.showToast('ALL ITEMS ALREADY ADDED', 'info');
    return;
  }
  setJobMaterials(jobId, mats);
  _matPickerActiveItem = null;
  const search = document.getElementById('mat-picker-search');
  filterMatPicker(jobId, search ? search.value : '');
  renderJobMaterials(jobId);
  A.showToast(tmpl.label + ' — ' + added + ' ITEMS ADDED');
}

// ── Address-level material rollup ──
function getAddrMaterialRollup(addrId) {
  const jobs = A.loadJobs().filter(j => j.addressId === addrId);
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
  const lib = A.loadMaterialLibrary();
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
    html += `<div class="cat-label">${A.esc(cat)}</div>`;
    for (const m of items) {
      html += `<div class="rollup-row">
        <span class="rollup-name">${A.esc(m.name)}</span>
        <span class="rollup-qty">${m.qty} ${A.esc(m.unit)}</span>
      </div>`;
    }
  }
  html += '</div>';
  return html;
}

// ── Public API ──
Object.assign(window, {
  renderMaterials, renderJobMaterials, autoLoadBuiltInLibraries,
  openMatPicker, closeMatPicker, filterMatPicker, showMatQtyInput,
  adjustMatQty, setMatQty, removeMatFromJob, applyBulkTemplate,
  addMatToJob, filterMaterials, importMaterialLibrary,
  renderAddrMaterialRollup, _setMatPhase,
  _matStepQty, _matAddFromPicker, _matLongPress, _matLongStop,
});
Object.defineProperty(window, '_matPickerActiveItem', {
  get() { return _matPickerActiveItem; },
  set(v) { _matPickerActiveItem = v; }
});
Object.defineProperty(window, '_matPickerActiveVariant', {
  get() { return _matPickerActiveVariant; },
  set(v) { _matPickerActiveVariant = v; }
});
// Expose create-ticket staging for core
window.Astra.getCreateTicketMaterials = function() { return _createTicketMaterials; };
window.Astra.clearCreateTicketMaterials = function() { _createTicketMaterials = []; };

})();
