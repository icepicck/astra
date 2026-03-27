// ═══════════════════════════════════════════
// ASTRA — ESTIMATES MODULE (Phase A)
// ═══════════════════════════════════════════
(function() {
'use strict';

const A = window.Astra;
const PRICEBOOK_KEY = 'astra_pricebook';
const _state = { currentEstimate: null };

// ── Price Book (localStorage) ──

function defaultPricebook() {
  return {
    laborRate: 125,
    overheadPercent: 15,
    profitPercent: 15,
    materialMarkup: 40,
    permitFee: 0,
    taxRate: 8.25
  };
}

function loadPricebook() {
  try { return Object.assign(defaultPricebook(), JSON.parse(localStorage.getItem(PRICEBOOK_KEY))); }
  catch { return defaultPricebook(); }
}

function savePricebook(pb) {
  localStorage.setItem(PRICEBOOK_KEY, JSON.stringify(pb));
}

// ── New Estimate Factory ──

function newEstimate() {
  const pb = loadPricebook();
  return {
    id: crypto.randomUUID(),
    address: '', addressId: null,
    customerName: '', customerPhone: '', customerEmail: '',
    status: 'Draft',
    jobType: '',
    description: '',
    materials: [],
    laborHours: 0,
    laborRate: pb.laborRate,
    laborTotal: 0,
    materialSubtotal: 0,
    materialMarkupTotal: 0,
    overheadPercent: pb.overheadPercent,
    overheadAmount: 0,
    profitPercent: pb.profitPercent,
    profitAmount: 0,
    permitFee: pb.permitFee,
    taxRate: pb.taxRate,
    taxAmount: 0,
    grandTotal: 0,
    validUntil: _dateOffset(30),
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function _dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ── Calculation Engine ──

function recalc(est) {
  const pb = loadPricebook();
  est.materialSubtotal = 0;
  est.materialMarkupTotal = 0;
  est.materials.forEach(function(m) {
    const cost = (parseFloat(m.unitCost) || 0) * (parseFloat(m.qty) || 0);
    const markupPct = parseFloat(m.markup) || 0;
    m.lineTotal = cost + (cost * markupPct / 100);
    est.materialSubtotal += cost;
    est.materialMarkupTotal += cost * markupPct / 100;
  });
  est.laborHours = parseFloat(est.laborHours) || 0;
  est.laborRate = parseFloat(est.laborRate) || 0;
  est.laborTotal = est.laborHours * est.laborRate;
  const subtotal = est.materialSubtotal + est.materialMarkupTotal + est.laborTotal;
  est.overheadPercent = parseFloat(est.overheadPercent) || 0;
  est.profitPercent = parseFloat(est.profitPercent) || 0;
  est.overheadAmount = subtotal * est.overheadPercent / 100;
  est.profitAmount = subtotal * est.profitPercent / 100;
  est.permitFee = parseFloat(est.permitFee) || 0;
  est.taxRate = parseFloat(est.taxRate) || 0;
  est.taxAmount = (est.materialSubtotal + est.materialMarkupTotal) * est.taxRate / 100;
  est.grandTotal = subtotal + est.overheadAmount + est.profitAmount + est.permitFee + est.taxAmount;
  return est;
}

function _fmt(n) {
  return '$' + (n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ══════════════════════════════════════════
// MATERIAL LIBRARY SEARCH
// ══════════════════════════════════════════

function _getAllLibraryItems() {
  const lib = A.loadMaterialLibrary();
  if (!lib || !lib.categories) return [];
  return lib.categories.flatMap(function(c) {
    return c.items.map(function(item) {
      return { id: item.id, name: item.name, unit: item.unit || 'EA', catLabel: c.label, variants: item.variants || [] };
    });
  });
}

function _estMatSearch(idx, query) {
  const dropdown = document.getElementById('est-mat-suggest-' + idx);
  if (!dropdown) return;
  const q = query.trim().toLowerCase();
  if (q.length < 2) { dropdown.style.display = 'none'; return; }

  const items = _getAllLibraryItems();
  const matches = items.filter(function(item) {
    return item.name.toLowerCase().includes(q) || item.catLabel.toLowerCase().includes(q);
  }).slice(0, 8);

  if (!matches.length) { dropdown.style.display = 'none'; return; }

  dropdown.style.display = 'block';
  dropdown.innerHTML = matches.map(function(item) {
    return '<div class="addr-suggest-item" onmousedown="window._estPickMat(' + idx + ',\'' + item.id + '\')">'
      + '<div style="flex:1;"><div style="font-weight:600;">' + A.esc(item.name) + '</div>'
      + '<div style="font-size:11px;color:#666;margin-top:2px;">' + A.esc(item.catLabel) + ' — ' + A.esc(item.unit) + '</div></div></div>';
  }).join('');
}

function _estPickMat(idx, itemId) {
  const est = _state.currentEstimate;
  if (!est || !est.materials[idx]) return;
  const items = _getAllLibraryItems();
  const item = items.find(function(i) { return i.id === itemId; });
  if (!item) return;

  _captureFormState();
  est.materials[idx].itemId = item.id;
  est.materials[idx].name = item.name;
  est.materials[idx].unit = item.unit;

  // Close dropdown and re-render
  const dropdown = document.getElementById('est-mat-suggest-' + idx);
  if (dropdown) dropdown.style.display = 'none';

  recalc(est);
  renderEstimateBuilder(est.id);
}

// ══════════════════════════════════════════
// ADDRESS AUTOCOMPLETE (Google Places + ASTRA)
// ══════════════════════════════════════════

let _estPlacesAC = null;

function _initEstPlaces() {
  _estPlacesAC = null;
  const input = document.getElementById('est-address');
  if (!input) return;
  if (!window.google || !window.google.maps || !window.google.maps.places) {
    // Try loading Google Maps if key exists
    const key = A.getGmapsKey();
    if (!key) return;
    // Maps may already be loading from Vector — poll for it
    var tries = 0;
    var poll = setInterval(function() {
      tries++;
      if (window.google && window.google.maps && window.google.maps.places) {
        clearInterval(poll);
        _attachEstPlaces();
      } else if (tries > 20) {
        clearInterval(poll);
      }
    }, 500);
    return;
  }
  _attachEstPlaces();
}

function _attachEstPlaces() {
  const input = document.getElementById('est-address');
  if (!input || !window.google || !window.google.maps || !window.google.maps.places) return;
  input.removeAttribute('autocomplete');
  _estPlacesAC = new google.maps.places.Autocomplete(input, {
    types: ['address'],
    componentRestrictions: { country: 'us' },
    fields: ['address_components', 'formatted_address']
  });
  // Bias toward Houston
  var houstonBounds = new google.maps.LatLngBounds(
    new google.maps.LatLng(29.5, -95.8),
    new google.maps.LatLng(30.2, -95.0)
  );
  _estPlacesAC.setBounds(houstonBounds);
  _estPlacesAC.addListener('place_changed', function() {
    var place = _estPlacesAC.getPlace();
    if (!place || !place.address_components) return;
    var streetNum = '', route = '', city = '', state = '', zip = '';
    for (var c of place.address_components) {
      var t = c.types[0];
      if (t === 'street_number') streetNum = c.long_name;
      else if (t === 'route') route = c.short_name;
      else if (t === 'locality') city = c.long_name;
      else if (t === 'administrative_area_level_1') state = c.short_name;
      else if (t === 'postal_code') zip = c.long_name;
    }
    var fullAddr = (streetNum + ' ' + route).trim();
    if (city) fullAddr += ', ' + city;
    if (state) fullAddr += ', ' + state;
    if (zip) fullAddr += ' ' + zip;
    var est = _state.currentEstimate;
    if (est) {
      est.address = fullAddr;
      // Check if this address exists in ASTRA
      var match = A.loadAddresses().find(function(a) {
        return a.address.toLowerCase() === fullAddr.toLowerCase();
      });
      est.addressId = match ? match.id : null;
    }
    input.value = fullAddr;
    // Hide ASTRA dropdown if open
    var dd = document.getElementById('est-addr-suggest');
    if (dd) dd.style.display = 'none';
  });
}

function _estAddrSearch(query) {
  // ASTRA address matches (shown below Google suggestions)
  var dropdown = document.getElementById('est-addr-suggest');
  if (!dropdown) return;
  var q = query.trim().toLowerCase();
  if (q.length < 2) { dropdown.style.display = 'none'; return; }

  var addrs = A.loadAddresses().filter(function(a) {
    return a.address.toLowerCase().includes(q);
  }).slice(0, 5);

  if (!addrs.length) { dropdown.style.display = 'none'; return; }

  dropdown.style.display = 'block';
  dropdown.innerHTML = '<div style="font-size:10px;color:#FF6B00;font-weight:800;letter-spacing:1px;padding:8px 14px 4px;text-transform:uppercase;">ASTRA ADDRESSES</div>'
    + addrs.map(function(a) {
      return '<div class="addr-suggest-item" onmousedown="window._estPickAddr(\'' + a.id + '\')">' + A.esc(a.address) + '</div>';
    }).join('');
}

function _estPickAddr(addrId) {
  var est = _state.currentEstimate;
  if (!est) return;
  var addr = A.loadAddresses().find(function(a) { return a.id === addrId; });
  if (!addr) return;

  _captureFormState();
  est.address = addr.address;
  est.addressId = addr.id;

  var input = document.getElementById('est-address');
  if (input) input.value = addr.address;
  var dropdown = document.getElementById('est-addr-suggest');
  if (dropdown) dropdown.style.display = 'none';
}

// ══════════════════════════════════════════
// CAPTURE FORM STATE — read all DOM inputs
// into _state.currentEstimate before re-render
// ══════════════════════════════════════════

function _captureFormState() {
  const est = _state.currentEstimate;
  if (!est) return;
  // Text fields
  const addr = document.getElementById('est-address');
  if (addr) est.address = addr.value;
  const cname = document.getElementById('est-cname');
  if (cname) est.customerName = cname.value;
  const cphone = document.getElementById('est-cphone');
  if (cphone) est.customerPhone = cphone.value;
  const cemail = document.getElementById('est-cemail');
  if (cemail) est.customerEmail = cemail.value;
  const desc = document.getElementById('est-desc');
  if (desc) est.description = desc.value;
  const notes = document.getElementById('est-notes');
  if (notes) est.notes = notes.value;
  // Labor
  const hrs = document.getElementById('est-labor-hrs');
  if (hrs) est.laborHours = hrs.value;
  const rate = document.getElementById('est-labor-rate');
  if (rate) est.laborRate = rate.value;
  // Adjustments
  const overhead = document.getElementById('est-overhead');
  if (overhead) est.overheadPercent = overhead.value;
  const profit = document.getElementById('est-profit');
  if (profit) est.profitPercent = profit.value;
  const tax = document.getElementById('est-tax');
  if (tax) est.taxRate = tax.value;
  const permit = document.getElementById('est-permit');
  if (permit) est.permitFee = permit.value;
  // Materials — read from DOM by data attributes
  const matItems = document.querySelectorAll('.est-mat-item');
  matItems.forEach(function(el, i) {
    if (!est.materials[i]) return;
    const nameInput = el.querySelector('[data-field="name"]');
    if (nameInput) est.materials[i].name = nameInput.value;
    const qtyInput = el.querySelector('[data-field="qty"]');
    if (qtyInput) est.materials[i].qty = parseFloat(qtyInput.value) || 0;
    const costInput = el.querySelector('[data-field="unitCost"]');
    if (costInput) est.materials[i].unitCost = parseFloat(costInput.value) || 0;
    const mkupInput = el.querySelector('[data-field="markup"]');
    if (mkupInput) est.materials[i].markup = parseFloat(mkupInput.value) || 0;
  });
}

// ═══════════════════════════════════════════
// RENDER: ESTIMATES LIST
// ═══════════════════════════════════════════

let _estFilter = 'all';

function renderEstimatesList() {
  const body = document.getElementById('estimates-body');
  if (!body) return;
  const estimates = A.loadEstimates();

  const filters = ['all', 'draft', 'sent', 'accepted', 'declined'];
  let filterHtml = '<div class="est-filter-bar">';
  filters.forEach(function(f) {
    filterHtml += '<button class="est-filter-btn' + (f === _estFilter ? ' active' : '') + '" onclick="window._setEstFilter(\'' + f + '\')">' + f.toUpperCase() + '</button>';
  });
  filterHtml += '</div>';

  const filtered = _estFilter === 'all' ? estimates : estimates.filter(function(e) {
    return e.status.toLowerCase() === _estFilter;
  });

  let html = filterHtml;

  if (filtered.length === 0) {
    html += '<div class="est-empty">' + (_estFilter === 'all' ? 'NO ESTIMATES YET<br>TAP + TO CREATE ONE' : 'NO ' + _estFilter.toUpperCase() + ' ESTIMATES') + '</div>';
  } else {
    filtered.forEach(function(est) {
      const statusCls = 'badge badge-' + est.status.toLowerCase();
      const date = est.updatedAt ? est.updatedAt.split('T')[0] : '';
      html += '<div class="est-card" onclick="goTo(\'screen-estimate-builder\',\'' + est.id + '\')">';
      html += '<div class="est-card-address">' + A.esc(est.address || 'NO ADDRESS') + '</div>';
      html += '<div class="est-card-row">';
      html += '<span class="' + statusCls + '">' + A.esc(est.status) + '</span>';
      html += '<span class="est-card-type">' + A.esc(est.jobType || '') + '</span>';
      html += '</div>';
      html += '<div class="est-card-row">';
      html += '<span class="est-card-date">' + date + '</span>';
      html += '<span class="est-card-total">' + _fmt(est.grandTotal) + '</span>';
      html += '</div>';
      html += '</div>';
    });
  }

  body.innerHTML = html;
}

function _setEstFilter(f) {
  _estFilter = f;
  renderEstimatesList();
}

// ═══════════════════════════════════════════
// RENDER: ESTIMATE BUILDER
// ═══════════════════════════════════════════

function renderEstimateBuilder(estId) {
  const body = document.getElementById('estimate-builder-body');
  if (!body) return;

  // Load or create — reuse in-memory estimate if IDs match
  if (estId && typeof estId === 'string') {
    if (_state.currentEstimate && _state.currentEstimate.id === estId) {
      // Already editing — keep in-memory state
    } else {
      _state.currentEstimate = A.getEstimate(estId);
      if (!_state.currentEstimate) _state.currentEstimate = newEstimate();
    }
  } else {
    _state.currentEstimate = newEstimate();
  }

  const est = _state.currentEstimate;
  recalc(est);
  const pb = loadPricebook();

  // Show/hide delete button
  const delBtn = document.getElementById('est-delete-btn');
  if (delBtn) delBtn.style.display = A.getEstimate(est.id) ? 'flex' : 'none';

  const JOB_TYPES = ['SERVICE CALL','PANEL UPGRADE','EV CHARGER','ROUGH-IN','TRIM-OUT','TROUBLESHOOT','GENERATOR','REWIRE','LIGHTING','GENERAL'];

  let html = '';

  // ── Job Info ──
  html += '<div class="est-section-title">JOB INFO</div>';
  html += '<div class="field"><label>ADDRESS</label>';
  html += '<input type="text" id="est-address" name="astra-xestaddr" autocomplete="nope" placeholder="STREET ADDRESS" value="' + A.esc(est.address) + '" oninput="window._estAddrSearch(this.value)">';
  html += '<div id="est-addr-suggest" class="addr-suggest" style="display:none;"></div>';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
  html += '<div class="field"><label>CUSTOMER</label><input type="text" id="est-cname" name="astra-xestcname" autocomplete="nope" placeholder="NAME" value="' + A.esc(est.customerName) + '"></div>';
  html += '<div class="field"><label>PHONE</label><input type="tel" id="est-cphone" name="astra-xestcphone" autocomplete="nope" placeholder="(555) 555-5555" value="' + A.esc(est.customerPhone) + '"></div>';
  html += '</div>';
  html += '<div class="field"><label>EMAIL</label><input type="email" id="est-cemail" name="astra-xestcemail" autocomplete="nope" placeholder="EMAIL" value="' + A.esc(est.customerEmail) + '"></div>';

  // Job type chips
  html += '<div class="field"><label>JOB TYPE</label><div style="display:flex;flex-wrap:wrap;gap:6px;">';
  JOB_TYPES.forEach(function(t) {
    const active = est.jobType === t;
    html += '<button class="badge badge-type" style="cursor:pointer;min-height:36px;padding:6px 12px;' + (active ? 'background:rgba(255,107,0,0.15);color:#FF6B00;border:1px solid #FF6B00;' : '') + '" onclick="window._estSetJobType(\'' + t + '\')">' + t + '</button>';
  });
  html += '</div></div>';

  html += '<div class="field"><label>DESCRIPTION</label><textarea id="est-desc" rows="2" placeholder="SCOPE OF WORK...">' + A.esc(est.description) + '</textarea></div>';

  // ── Intelligence Section (Phase B) ──
  html += _renderIntelSection(est);

  // ── Materials ──
  html += '<div class="est-section-title">MATERIALS</div>';

  est.materials.forEach(function(m, i) {
    html += '<div class="est-mat-item">';
    html += '<div class="est-mat-row" style="position:relative;">';
    html += '<input type="text" class="est-mat-name" data-field="name" data-idx="' + i + '" value="' + A.esc(m.name) + '" placeholder="SEARCH MATERIALS..." oninput="window._estMatSearch(' + i + ',this.value)" autocomplete="off" style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid #333;background:#222;color:#e0e0e0;font-size:14px;font-weight:600;font-family:inherit;">';
    html += '<button class="est-mat-remove" onclick="window._estRemoveMat(' + i + ')">✕</button>';
    html += '</div>';
    html += '<div id="est-mat-suggest-' + i + '" class="addr-suggest" style="display:none;position:relative;z-index:10;"></div>';
    if (m.unit && m.unit !== 'EA') {
      html += '<div style="font-size:11px;color:#555;margin:4px 0 2px;text-transform:uppercase;letter-spacing:0.5px;">' + A.esc(m.unit) + '</div>';
    }
    html += '<div class="est-mat-fields">';
    html += '<div class="est-mat-field"><label>QTY</label><input type="number" inputmode="decimal" min="0" data-field="qty" data-idx="' + i + '" value="' + (m.qty || '') + '"></div>';
    html += '<div class="est-mat-field"><label>COST</label><input type="number" inputmode="decimal" min="0" step="0.01" data-field="unitCost" data-idx="' + i + '" value="' + (m.unitCost || '') + '"></div>';
    html += '<div class="est-mat-field"><label>MKUP%</label><input type="number" inputmode="decimal" min="0" data-field="markup" data-idx="' + i + '" value="' + (m.markup != null ? m.markup : pb.materialMarkup) + '"></div>';
    html += '<div class="est-mat-field"><label>TOTAL</label><input type="text" value="' + _fmt(m.lineTotal || 0) + '" readonly style="color:#FF6B00;font-weight:700;background:none;border:none;"></div>';
    html += '</div>';
    html += '</div>';
  });

  html += '<button class="btn btn-secondary" style="width:100%;margin-top:8px;" onclick="window._estAddMat()">+ ADD MATERIAL</button>';

  // ── Labor ──
  html += '<div class="est-section-title">LABOR</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">';
  html += '<div class="field"><label>HOURS</label><input type="number" inputmode="decimal" min="0" id="est-labor-hrs" value="' + (est.laborHours || '') + '"></div>';
  html += '<div class="field"><label>$/HR</label><input type="number" inputmode="decimal" min="0" id="est-labor-rate" value="' + (est.laborRate || '') + '"></div>';
  html += '<div class="field"><label>TOTAL</label><input type="text" id="est-labor-total" value="' + _fmt(est.laborTotal) + '" readonly style="color:#FF6B00;font-weight:700;"></div>';
  html += '</div>';

  // ── Adjustments ──
  html += '<div class="est-section-title">ADJUSTMENTS</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">';
  html += '<div class="field"><label>OVERHEAD %</label><input type="number" inputmode="decimal" min="0" id="est-overhead" value="' + (est.overheadPercent || '') + '"></div>';
  html += '<div class="field"><label>PROFIT %</label><input type="number" inputmode="decimal" min="0" id="est-profit" value="' + (est.profitPercent || '') + '"></div>';
  html += '<div class="field"><label>TAX %</label><input type="number" inputmode="decimal" min="0" id="est-tax" value="' + (est.taxRate || '') + '"></div>';
  html += '</div>';
  html += '<div class="field"><label>PERMIT FEE</label><input type="number" inputmode="decimal" min="0" step="0.01" id="est-permit" value="' + (est.permitFee || '') + '"></div>';

  // ── Summary ──
  html += _renderSummary(est);

  // ── Notes ──
  html += '<div class="est-section-title">NOTES</div>';
  html += '<div class="field"><textarea id="est-notes" rows="3" placeholder="ADDITIONAL NOTES...">' + A.esc(est.notes) + '</textarea></div>';

  // ── Actions ──
  html += '<div class="est-actions">';
  html += '<button class="btn btn-primary" onclick="window._estSave()">SAVE DRAFT</button>';
  html += '</div>';
  html += '<div style="height:80px;"></div>';

  body.innerHTML = html;

  // ── Attach blur listeners for auto-recalc ──
  _attachBlurListeners();

  // ── Attach Google Places autocomplete ──
  _initEstPlaces();
}

// ── Attach blur handlers to all inputs so math recalcs automatically ──
let _blurAttached = false;
function _attachBlurListeners() {
  if (_blurAttached) return;
  const body = document.getElementById('estimate-builder-body');
  if (!body) return;
  _blurAttached = true;
  body.addEventListener('blur', function(e) {
    var el = e.target;
    if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
    if (el.readOnly) return;
    _captureFormState();
    recalc(_state.currentEstimate);
    _refreshComputedFields();
  }, true);
}

// ── Refresh only the computed/readonly fields without full re-render ──
function _refreshComputedFields() {
  const est = _state.currentEstimate;
  if (!est) return;

  // Material line totals
  const matItems = document.querySelectorAll('.est-mat-item');
  matItems.forEach(function(el, i) {
    if (!est.materials[i]) return;
    const totalInput = el.querySelector('.est-mat-field:last-child input');
    if (totalInput) totalInput.value = _fmt(est.materials[i].lineTotal || 0);
  });

  // Labor total
  const laborTotal = document.getElementById('est-labor-total');
  if (laborTotal) laborTotal.value = _fmt(est.laborTotal);

  // Summary
  const summaryEl = document.querySelector('.est-summary');
  if (summaryEl) summaryEl.outerHTML = _renderSummary(est);
}

function _renderSummary(est) {
  let html = '<div class="est-summary">';
  html += '<div class="est-summary-row"><span class="est-summary-label">MATERIALS</span><span class="est-summary-value">' + _fmt(est.materialSubtotal) + '</span></div>';
  html += '<div class="est-summary-row"><span class="est-summary-label">MATERIAL MARKUP</span><span class="est-summary-value">' + _fmt(est.materialMarkupTotal) + '</span></div>';
  html += '<div class="est-summary-row"><span class="est-summary-label">LABOR</span><span class="est-summary-value">' + _fmt(est.laborTotal) + '</span></div>';
  html += '<div class="est-summary-row"><span class="est-summary-label">OVERHEAD (' + (est.overheadPercent || 0) + '%)</span><span class="est-summary-value">' + _fmt(est.overheadAmount) + '</span></div>';
  html += '<div class="est-summary-row"><span class="est-summary-label">PROFIT (' + (est.profitPercent || 0) + '%)</span><span class="est-summary-value">' + _fmt(est.profitAmount) + '</span></div>';
  if (est.permitFee) html += '<div class="est-summary-row"><span class="est-summary-label">PERMIT</span><span class="est-summary-value">' + _fmt(est.permitFee) + '</span></div>';
  if (est.taxAmount) html += '<div class="est-summary-row"><span class="est-summary-label">TAX (' + (est.taxRate || 0) + '%)</span><span class="est-summary-value">' + _fmt(est.taxAmount) + '</span></div>';
  html += '<div class="est-summary-row total"><span class="est-summary-label">GRAND TOTAL</span><span class="est-summary-value">' + _fmt(est.grandTotal) + '</span></div>';
  if (est.grandTotal > 0) {
    const margin = ((est.profitAmount / est.grandTotal) * 100).toFixed(1);
    html += '<div style="text-align:center;margin-top:8px;font-size:12px;color:#555;font-weight:700;text-transform:uppercase;letter-spacing:1px;">MARGIN: ' + margin + '%</div>';
  }
  html += '</div>';
  return html;
}

// ── Builder Helpers ──

function _estSetJobType(type) {
  if (!_state.currentEstimate) return;
  _captureFormState();
  _state.currentEstimate.jobType = _state.currentEstimate.jobType === type ? '' : type;
  renderEstimateBuilder(_state.currentEstimate.id);
}

function _estAddMat() {
  if (!_state.currentEstimate) return;
  _captureFormState();
  const pb = loadPricebook();
  _state.currentEstimate.materials.push({
    itemId: crypto.randomUUID(),
    name: '',
    qty: 1,
    unit: 'EA',
    unitCost: 0,
    markup: pb.materialMarkup,
    lineTotal: 0
  });
  renderEstimateBuilder(_state.currentEstimate.id);
  // Focus the new material name input
  setTimeout(function() {
    const nameInputs = document.querySelectorAll('.est-mat-name');
    if (nameInputs.length > 0) {
      nameInputs[nameInputs.length - 1].focus();
    }
  }, 50);
}

function _estRemoveMat(idx) {
  if (!_state.currentEstimate) return;
  _captureFormState();
  _state.currentEstimate.materials.splice(idx, 1);
  recalc(_state.currentEstimate);
  renderEstimateBuilder(_state.currentEstimate.id);
}

function _estSave() {
  if (!_state.currentEstimate) return;
  _captureFormState();
  recalc(_state.currentEstimate);
  A.saveEstimate(_state.currentEstimate);
  A.showToast('ESTIMATE SAVED');
  const delBtn = document.getElementById('est-delete-btn');
  if (delBtn) delBtn.style.display = 'flex';
  _refreshComputedFields();
}

function deleteCurrentEstimate() {
  if (!_state.currentEstimate) return;
  if (!confirm('DELETE THIS ESTIMATE?')) return;
  A.deleteEstimate(_state.currentEstimate.id);
  _state.currentEstimate = null;
  A.showToast('ESTIMATE DELETED');
  A.goTo('screen-estimates');
}

// ═══════════════════════════════════════════
// RENDER: PRICE BOOK
// ═══════════════════════════════════════════

function renderPricebook() {
  const body = document.getElementById('pricebook-body');
  if (!body) return;
  const pb = loadPricebook();

  const fields = [
    { key: 'laborRate', label: 'LABOR RATE ($/HR)', step: '0.01' },
    { key: 'overheadPercent', label: 'OVERHEAD %', step: '0.1' },
    { key: 'profitPercent', label: 'PROFIT MARGIN %', step: '0.1' },
    { key: 'materialMarkup', label: 'DEFAULT MATERIAL MARKUP %', step: '0.1' },
    { key: 'permitFee', label: 'DEFAULT PERMIT FEE', step: '0.01' },
    { key: 'taxRate', label: 'TAX RATE %', step: '0.01' }
  ];

  let html = '<div style="padding-top:4px;">';

  fields.forEach(function(f) {
    html += '<div class="field"><label>' + f.label + '</label>';
    html += '<input type="number" inputmode="decimal" min="0" step="' + f.step + '" id="pb-' + f.key + '" value="' + (pb[f.key] || 0) + '" onblur="window._pbSave()">';
    html += '</div>';
  });

  html += '<button class="btn btn-primary" style="width:100%;margin-top:8px;" onclick="window._pbSave();A.showToast(\'PRICE BOOK SAVED\')">SAVE</button>';
  html += '<div style="height:40px;"></div>';
  html += '</div>';

  body.innerHTML = html;
}

function _pbSave() {
  const pb = loadPricebook();
  const fields = ['laborRate', 'overheadPercent', 'profitPercent', 'materialMarkup', 'permitFee', 'taxRate'];
  fields.forEach(function(key) {
    const el = document.getElementById('pb-' + key);
    if (el) pb[key] = parseFloat(el.value) || 0;
  });
  savePricebook(pb);
}

// ══════════════════════════════════════════
// PHASE B: INTELLIGENCE ENGINE
// ══════════════════════════════════════════

// ── Query: Similar Jobs by Type ──
function _querySimilarJobs(jobType) {
  if (!jobType) return { materials: [], jobCount: 0 };
  var jobs = A.loadJobs().filter(function(j) {
    return j.types && j.types.indexOf(jobType) !== -1 && j.materials && j.materials.length > 0;
  });
  if (!jobs.length) return { materials: [], jobCount: 0 };

  // Aggregate materials across all matching jobs
  var matMap = {};
  jobs.forEach(function(j) {
    j.materials.forEach(function(m) {
      var key = m.itemId || m.name;
      if (!matMap[key]) {
        matMap[key] = { itemId: m.itemId, name: m.name, unit: m.unit || 'EA', totalQty: 0, jobCount: 0 };
      }
      matMap[key].totalQty += (m.qty || 1);
      matMap[key].jobCount += 1;
    });
  });

  // Convert to array with averages, sorted by frequency
  var materials = Object.values(matMap).map(function(m) {
    m.avgQty = Math.ceil(m.totalQty / m.jobCount);
    return m;
  }).sort(function(a, b) { return b.jobCount - a.jobCount; });

  return { materials: materials, jobCount: jobs.length };
}

// ── Query: Jobs at Address ──
function _queryAddressJobs(addressId) {
  if (!addressId) return { materials: [], jobCount: 0, jobs: [] };
  var jobs = A.loadJobs().filter(function(j) {
    return j.addressId === addressId && j.materials && j.materials.length > 0;
  });
  if (!jobs.length) return { materials: [], jobCount: 0, jobs: [] };

  // Collect all unique materials used at this address
  var matMap = {};
  jobs.forEach(function(j) {
    j.materials.forEach(function(m) {
      var key = m.itemId || m.name;
      if (!matMap[key]) {
        matMap[key] = { itemId: m.itemId, name: m.name, unit: m.unit || 'EA', lastQty: m.qty || 1, uses: 0 };
      }
      matMap[key].lastQty = m.qty || 1;
      matMap[key].uses += 1;
    });
  });

  return {
    materials: Object.values(matMap).sort(function(a, b) { return b.uses - a.uses; }),
    jobCount: jobs.length,
    jobs: jobs
  };
}

// ── Query: Property Intelligence ──
function _getPropertyIntel(addressId) {
  if (!addressId) return null;
  var addrs = A.loadAddresses();
  var addr = addrs.find(function(a) { return a.id === addressId; });
  if (!addr) return null;
  var fields = [];
  if (addr.panelType) fields.push({ label: 'PANEL', value: addr.panelType });
  if (addr.ampRating) fields.push({ label: 'AMPS', value: addr.ampRating });
  if (addr.breakerType) fields.push({ label: 'BREAKER', value: addr.breakerType });
  if (addr.serviceType) fields.push({ label: 'SERVICE', value: addr.serviceType });
  if (addr.panelLocation) fields.push({ label: 'LOCATION', value: addr.panelLocation });
  if (addr.builder) fields.push({ label: 'BUILDER', value: addr.builder });
  if (addr.subdivision) fields.push({ label: 'SUBDIVISION', value: addr.subdivision });
  if (addr.notes) fields.push({ label: 'NOTES', value: addr.notes });
  if (!fields.length) return null;
  return { address: addr.address, fields: fields };
}

// ── Render: Intelligence Section (inside builder) ──
function _renderIntelSection(est) {
  var html = '';

  // Property Intelligence
  var intel = _getPropertyIntel(est.addressId);
  if (intel) {
    html += '<div class="est-intel-card">';
    html += '<div class="est-intel-header"><span class="est-intel-icon">⚡</span> PROPERTY INTEL</div>';
    html += '<div class="est-intel-chips">';
    intel.fields.forEach(function(f) {
      if (f.label === 'NOTES') {
        html += '<div class="est-intel-note">' + A.esc(f.value) + '</div>';
      } else {
        html += '<span class="est-intel-chip"><span class="est-intel-chip-label">' + f.label + '</span> ' + A.esc(f.value) + '</span>';
      }
    });
    html += '</div></div>';
  }

  // Load from Similar Jobs
  if (est.jobType) {
    var similar = _querySimilarJobs(est.jobType);
    if (similar.materials.length > 0) {
      html += '<div class="est-intel-card">';
      html += '<div class="est-intel-header"><span class="est-intel-icon">📊</span> SIMILAR ' + A.esc(est.jobType) + ' JOBS <span class="est-intel-count">' + similar.jobCount + ' JOB' + (similar.jobCount !== 1 ? 'S' : '') + '</span></div>';
      html += '<div class="est-intel-mats">';
      similar.materials.slice(0, 10).forEach(function(m) {
        var alreadyAdded = est.materials.some(function(em) { return (em.itemId === m.itemId) || (em.name === m.name); });
        html += '<div class="est-intel-mat-row' + (alreadyAdded ? ' added' : '') + '">';
        html += '<span class="est-intel-mat-name">' + A.esc(m.name) + '</span>';
        html += '<span class="est-intel-mat-qty">AVG ' + m.avgQty + ' ' + A.esc(m.unit) + '</span>';
        if (!alreadyAdded) {
          html += '<button class="est-intel-add-btn" onclick="window._estImportMat(\'' + A.esc(m.itemId) + '\',\'' + A.esc(m.name) + '\',\'' + A.esc(m.unit) + '\',' + m.avgQty + ')">+</button>';
        } else {
          html += '<span class="est-intel-added">✓</span>';
        }
        html += '</div>';
      });
      html += '</div>';
      if (similar.materials.length > 0) {
        var unadded = similar.materials.filter(function(m) {
          return !est.materials.some(function(em) { return (em.itemId === m.itemId) || (em.name === m.name); });
        });
        if (unadded.length > 0) {
          html += '<button class="btn btn-secondary" style="width:100%;margin-top:8px;font-size:12px;" onclick="window._estImportAllSimilar()">LOAD ALL ' + unadded.length + ' MATERIALS</button>';
        }
      }
      html += '</div>';
    }
  }

  // Load from Address History
  if (est.addressId) {
    var addrData = _queryAddressJobs(est.addressId);
    if (addrData.materials.length > 0) {
      html += '<div class="est-intel-card">';
      html += '<div class="est-intel-header"><span class="est-intel-icon">📍</span> PREVIOUSLY AT ADDRESS <span class="est-intel-count">' + addrData.jobCount + ' JOB' + (addrData.jobCount !== 1 ? 'S' : '') + '</span></div>';
      html += '<div class="est-intel-mats">';
      addrData.materials.slice(0, 10).forEach(function(m) {
        var alreadyAdded = est.materials.some(function(em) { return (em.itemId === m.itemId) || (em.name === m.name); });
        html += '<div class="est-intel-mat-row' + (alreadyAdded ? ' added' : '') + '">';
        html += '<span class="est-intel-mat-name">' + A.esc(m.name) + '</span>';
        html += '<span class="est-intel-mat-qty">LAST: ' + m.lastQty + ' ' + A.esc(m.unit) + '</span>';
        if (!alreadyAdded) {
          html += '<button class="est-intel-add-btn" onclick="window._estImportMat(\'' + A.esc(m.itemId) + '\',\'' + A.esc(m.name) + '\',\'' + A.esc(m.unit) + '\',' + m.lastQty + ')">+</button>';
        } else {
          html += '<span class="est-intel-added">✓</span>';
        }
        html += '</div>';
      });
      html += '</div>';
      var unaddedAddr = addrData.materials.filter(function(m) {
        return !est.materials.some(function(em) { return (em.itemId === m.itemId) || (em.name === m.name); });
      });
      if (unaddedAddr.length > 0) {
        html += '<button class="btn btn-secondary" style="width:100%;margin-top:8px;font-size:12px;" onclick="window._estImportAllAddress()">LOAD ALL ' + unaddedAddr.length + ' MATERIALS</button>';
      }
      html += '</div>';
    }
  }

  return html;
}

// ── Import helpers ──

function _estImportMat(itemId, name, unit, qty) {
  if (!_state.currentEstimate) return;
  _captureFormState();
  var pb = loadPricebook();
  _state.currentEstimate.materials.push({
    itemId: itemId,
    name: name,
    qty: qty,
    unit: unit,
    unitCost: 0,
    markup: pb.materialMarkup,
    lineTotal: 0
  });
  recalc(_state.currentEstimate);
  renderEstimateBuilder(_state.currentEstimate.id);
  A.showToast('ADDED: ' + name);
}

function _estImportAllSimilar() {
  if (!_state.currentEstimate) return;
  _captureFormState();
  var est = _state.currentEstimate;
  var similar = _querySimilarJobs(est.jobType);
  var pb = loadPricebook();
  var count = 0;
  similar.materials.forEach(function(m) {
    var alreadyAdded = est.materials.some(function(em) { return (em.itemId === m.itemId) || (em.name === m.name); });
    if (!alreadyAdded) {
      est.materials.push({
        itemId: m.itemId,
        name: m.name,
        qty: m.avgQty,
        unit: m.unit,
        unitCost: 0,
        markup: pb.materialMarkup,
        lineTotal: 0
      });
      count++;
    }
  });
  recalc(est);
  renderEstimateBuilder(est.id);
  A.showToast(count + ' MATERIAL' + (count !== 1 ? 'S' : '') + ' LOADED');
}

function _estImportAllAddress() {
  if (!_state.currentEstimate) return;
  _captureFormState();
  var est = _state.currentEstimate;
  var addrData = _queryAddressJobs(est.addressId);
  var pb = loadPricebook();
  var count = 0;
  addrData.materials.forEach(function(m) {
    var alreadyAdded = est.materials.some(function(em) { return (em.itemId === m.itemId) || (em.name === m.name); });
    if (!alreadyAdded) {
      est.materials.push({
        itemId: m.itemId,
        name: m.name,
        qty: m.lastQty,
        unit: m.unit,
        unitCost: 0,
        markup: pb.materialMarkup,
        lineTotal: 0
      });
      count++;
    }
  });
  recalc(est);
  renderEstimateBuilder(est.id);
  A.showToast(count + ' MATERIAL' + (count !== 1 ? 'S' : '') + ' LOADED');
}

// ── Public API ──
Object.assign(window, {
  renderEstimates: renderEstimatesList,
  renderEstimateBuilder: renderEstimateBuilder,
  renderPricebook: renderPricebook,
  deleteCurrentEstimate: deleteCurrentEstimate,
  _setEstFilter: _setEstFilter,
  _estSetJobType: _estSetJobType,
  _estAddMat: _estAddMat,
  _estRemoveMat: _estRemoveMat,
  _estSave: _estSave,
  _estMatSearch: _estMatSearch,
  _estPickMat: _estPickMat,
  _estAddrSearch: _estAddrSearch,
  _estPickAddr: _estPickAddr,
  _pbSave: _pbSave,
  _estImportMat: _estImportMat,
  _estImportAllSimilar: _estImportAllSimilar,
  _estImportAllAddress: _estImportAllAddress,
});

})();
