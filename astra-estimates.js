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
    taxRate: 8.25,
    companyName: '',
    companyPhone: '',
    companyEmail: '',
    companyLicense: ''
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

let _estMatPhase = 'ALL'; // ALL, ROUGH, TRIM

function _setEstMatPhase(phase) {
  _estMatPhase = phase;
  var toggle = document.getElementById('est-mat-phase-toggle');
  if (toggle) {
    toggle.querySelectorAll('.date-toggle-btn').forEach(function(btn) {
      var btnPhase = btn.textContent.trim() === 'ALL' ? 'ALL' : btn.textContent.trim() === 'ROUGH-IN' ? 'ROUGH' : 'TRIM';
      btn.classList.toggle('active', btnPhase === phase);
    });
  }
}

function _getAllLibraryItems() {
  var lib;
  if (_estMatPhase === 'ROUGH') lib = A.loadRoughLibrary();
  else if (_estMatPhase === 'TRIM') lib = A.loadTrimLibrary();
  else lib = A.loadMaterialLibrary();
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
  const validUntil = document.getElementById('est-valid-until');
  if (validUntil) est.validUntil = validUntil.value;
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

  // Accuracy metrics at bottom of list
  html += _renderAccuracyMetrics();

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

  // Load or create — always fetch fresh from cache to pick up sync changes
  if (estId && typeof estId === 'string') {
    var fresh = A.getEstimate(estId);
    if (fresh) {
      _state.currentEstimate = fresh;
    } else {
      _state.currentEstimate = newEstimate();
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

  html += '<div class="field"><label>DESCRIPTION</label><textarea id="est-desc" rows="2" placeholder="SCOPE OF WORK..." autocomplete="nope">' + A.esc(est.description) + '</textarea></div>';

  // ── Intelligence Section (Phase B) ──
  html += _renderIntelSection(est);

  // ── Materials ──
  html += '<div class="est-section-title">MATERIALS</div>';
  html += '<div class="date-toggle" style="margin-bottom:12px;" id="est-mat-phase-toggle">';
  html += '<button class="date-toggle-btn' + (_estMatPhase === 'ALL' ? ' active' : '') + '" onclick="window._setEstMatPhase(\'ALL\')">ALL</button>';
  html += '<button class="date-toggle-btn' + (_estMatPhase === 'ROUGH' ? ' active' : '') + '" onclick="window._setEstMatPhase(\'ROUGH\')">ROUGH-IN</button>';
  html += '<button class="date-toggle-btn' + (_estMatPhase === 'TRIM' ? ' active' : '') + '" onclick="window._setEstMatPhase(\'TRIM\')">TRIM-OUT</button>';
  html += '</div>';

  est.materials.forEach(function(m, i) {
    html += '<div class="est-mat-item">';
    html += '<div class="est-mat-row" style="position:relative;">';
    html += '<input type="text" class="est-mat-name" data-field="name" data-idx="' + i + '" value="' + A.esc(m.name) + '" placeholder="SEARCH MATERIALS..." oninput="window._estMatSearch(' + i + ',this.value)" autocomplete="nope" name="astra-xestmat' + i + '" style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid #333;background:#222;color:#e0e0e0;font-size:14px;font-weight:600;font-family:inherit;">';
    html += '<button class="est-mat-remove" onclick="window._estRemoveMat(' + i + ')">✕</button>';
    html += '</div>';
    html += '<div id="est-mat-suggest-' + i + '" class="addr-suggest" style="display:none;position:relative;z-index:10;"></div>';
    if (m.unit && m.unit !== 'EA') {
      html += '<div style="font-size:11px;color:#555;margin:4px 0 2px;text-transform:uppercase;letter-spacing:0.5px;">' + A.esc(m.unit) + '</div>';
    }
    html += '<div class="est-mat-fields">';
    html += '<div class="est-mat-field"><label>QTY</label><input type="number" inputmode="decimal" min="0" data-field="qty" data-idx="' + i + '" autocomplete="nope" value="' + (m.qty || '') + '"></div>';
    html += '<div class="est-mat-field"><label>COST</label><input type="number" inputmode="decimal" min="0" step="0.01" data-field="unitCost" data-idx="' + i + '" autocomplete="nope" value="' + (m.unitCost || '') + '"></div>';
    html += '<div class="est-mat-field"><label>MKUP%</label><input type="number" inputmode="decimal" min="0" data-field="markup" data-idx="' + i + '" autocomplete="nope" value="' + (m.markup != null ? m.markup : pb.materialMarkup) + '"></div>';
    html += '<div class="est-mat-field"><label>TOTAL</label><input type="text" value="' + _fmt(m.lineTotal || 0) + '" readonly style="color:#FF6B00;font-weight:700;background:none;border:none;"></div>';
    html += '</div>';
    html += '</div>';
  });

  html += '<button class="btn btn-secondary" style="width:100%;margin-top:8px;" onclick="window._estAddMat()">+ ADD MATERIAL</button>';

  // ── Labor ──
  html += '<div class="est-section-title">LABOR</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">';
  html += '<div class="field"><label>HOURS</label><input type="number" inputmode="decimal" min="0" id="est-labor-hrs" autocomplete="nope" value="' + (est.laborHours || '') + '"></div>';
  html += '<div class="field"><label>$/HR</label><input type="number" inputmode="decimal" min="0" id="est-labor-rate" autocomplete="nope" value="' + (est.laborRate || '') + '"></div>';
  html += '<div class="field"><label>TOTAL</label><input type="text" id="est-labor-total" autocomplete="nope" value="' + _fmt(est.laborTotal) + '" readonly style="color:#FF6B00;font-weight:700;"></div>';
  html += '</div>';

  // ── Adjustments ──
  html += '<div class="est-section-title">ADJUSTMENTS</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">';
  html += '<div class="field"><label>OVERHEAD %</label><input type="number" inputmode="decimal" min="0" id="est-overhead" autocomplete="nope" value="' + (est.overheadPercent || '') + '"></div>';
  html += '<div class="field"><label>PROFIT %</label><input type="number" inputmode="decimal" min="0" id="est-profit" autocomplete="nope" value="' + (est.profitPercent || '') + '"></div>';
  html += '<div class="field"><label>TAX %</label><input type="number" inputmode="decimal" min="0" id="est-tax" autocomplete="nope" value="' + (est.taxRate || '') + '"></div>';
  html += '</div>';
  html += '<div class="field"><label>PERMIT FEE</label><input type="number" inputmode="decimal" min="0" step="0.01" id="est-permit" autocomplete="nope" value="' + (est.permitFee || '') + '"></div>';

  // ── Summary ──
  html += _renderSummary(est);

  // ── Status Pipeline ──
  html += '<div class="est-section-title">STATUS</div>';
  var statuses = ['Draft', 'Sent', 'Accepted', 'Declined'];
  html += '<div class="est-status-bar">';
  statuses.forEach(function(s) {
    var active = est.status === s;
    var cls = 'est-status-btn est-status-' + s.toLowerCase();
    if (active) cls += ' active';
    html += '<button class="' + cls + '" onclick="window._estSetStatus(\'' + s + '\')">' + s.toUpperCase() + '</button>';
  });
  html += '</div>';

  // ── Valid Until ──
  html += '<div class="field" style="margin-top:12px;"><label>VALID UNTIL</label>';
  html += '<input type="date" id="est-valid-until" value="' + (est.validUntil || '') + '">';
  html += '</div>';

  // ── Comparison (Phase D) ──
  html += _renderComparison(est);

  // ── Notes ──
  html += '<div class="est-section-title">NOTES</div>';
  html += '<div class="field"><textarea id="est-notes" rows="3" placeholder="ADDITIONAL NOTES..." autocomplete="nope">' + A.esc(est.notes) + '</textarea></div>';

  // ── Actions ──
  html += '<div class="est-actions">';
  html += '<button class="btn btn-primary" onclick="window._estSave()">SAVE</button>';
  html += '</div>';
  html += '<div class="est-actions" style="margin-top:8px;">';
  html += '<button class="btn btn-secondary" onclick="window._estShare()" style="flex:1;">SHARE</button>';
  html += '<button class="btn btn-secondary" onclick="window._estPreview()" style="flex:1;">PREVIEW</button>';
  html += '</div>';
  // Create Ticket button (only if no linked job yet and estimate has content)
  if (!est.linkedJobId && est.address && est.materials.length > 0) {
    html += '<div class="est-actions" style="margin-top:8px;">';
    html += '<button class="btn btn-secondary" style="flex:1;border-color:#2d8a4e;color:#2d8a4e;" onclick="window._estCreateTicket()">CREATE TICKET FROM ESTIMATE</button>';
    html += '</div>';
  }
  // View linked ticket button
  if (est.linkedJobId) {
    html += '<div class="est-actions" style="margin-top:8px;">';
    html += '<button class="btn btn-secondary" style="flex:1;" onclick="goTo(\'screen-detail\',\'' + est.linkedJobId + '\')">VIEW LINKED TICKET</button>';
    html += '</div>';
  }
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
    // Auto-save to IDB so work isn't lost
    A.saveEstimate(_state.currentEstimate);
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

  let html = '<div style="padding-top:4px;">';

  // Company info section
  html += '<div class="est-section-title">COMPANY INFO</div>';
  var companyFields = [
    { key: 'companyName', label: 'COMPANY NAME', type: 'text', placeholder: 'YOUR BUSINESS NAME' },
    { key: 'companyPhone', label: 'PHONE', type: 'tel', placeholder: '(555) 555-5555' },
    { key: 'companyEmail', label: 'EMAIL', type: 'email', placeholder: 'YOU@EMAIL.COM' },
    { key: 'companyLicense', label: 'LICENSE #', type: 'text', placeholder: 'STATE LICENSE NUMBER' }
  ];
  companyFields.forEach(function(f) {
    html += '<div class="field"><label>' + f.label + '</label>';
    html += '<input type="' + f.type + '" id="pb-' + f.key + '" value="' + A.esc(pb[f.key] || '') + '" placeholder="' + f.placeholder + '" autocomplete="nope" name="astra-xpb' + f.key + '" onblur="window._pbSave()">';
    html += '</div>';
  });

  // Rate fields
  html += '<div class="est-section-title">DEFAULT RATES</div>';
  var rateFields = [
    { key: 'laborRate', label: 'LABOR RATE ($/HR)', step: '0.01' },
    { key: 'overheadPercent', label: 'OVERHEAD %', step: '0.1' },
    { key: 'profitPercent', label: 'PROFIT MARGIN %', step: '0.1' },
    { key: 'materialMarkup', label: 'DEFAULT MATERIAL MARKUP %', step: '0.1' },
    { key: 'permitFee', label: 'DEFAULT PERMIT FEE', step: '0.01' },
    { key: 'taxRate', label: 'TAX RATE %', step: '0.01' }
  ];
  rateFields.forEach(function(f) {
    html += '<div class="field"><label>' + f.label + '</label>';
    html += '<input type="number" inputmode="decimal" min="0" step="' + f.step + '" id="pb-' + f.key + '" value="' + (pb[f.key] || 0) + '" autocomplete="nope" name="astra-xpb' + f.key + '" onblur="window._pbSave()">';
    html += '</div>';
  });

  html += '<button class="btn btn-primary" style="width:100%;margin-top:8px;" onclick="window._pbSave(true)">SAVE</button>';
  html += '<div style="height:40px;"></div>';
  html += '</div>';

  body.innerHTML = html;
}

function _pbSave(showConfirmation) {
  var pb = loadPricebook();
  var numFields = ['laborRate', 'overheadPercent', 'profitPercent', 'materialMarkup', 'permitFee', 'taxRate'];
  numFields.forEach(function(key) {
    var el = document.getElementById('pb-' + key);
    if (el) pb[key] = parseFloat(el.value) || 0;
  });
  var textFields = ['companyName', 'companyPhone', 'companyEmail', 'companyLicense'];
  textFields.forEach(function(key) {
    var el = document.getElementById('pb-' + key);
    if (el) pb[key] = el.value;
  });
  savePricebook(pb);
  if (showConfirmation && window.Astra && window.Astra.showToast) {
    window.Astra.showToast('PRICE BOOK SAVED');
  }
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

// ══════════════════════════════════════════
// PHASE C: CUSTOMER DELIVERY
// ══════════════════════════════════════════

// ── Status Pipeline ──
function _estSetStatus(status) {
  if (!_state.currentEstimate) return;
  _captureFormState();
  _state.currentEstimate.status = status;
  _state.currentEstimate.updatedAt = new Date().toISOString();
  recalc(_state.currentEstimate);
  A.saveEstimate(_state.currentEstimate);
  renderEstimateBuilder(_state.currentEstimate.id);
  A.showToast('STATUS: ' + status.toUpperCase());
}

// ── Generate Estimate HTML ──
function _generateEstimateHTML(est) {
  var pb = loadPricebook();
  var companyName = pb.companyName || 'ELECTRICAL SERVICES';
  var companyPhone = pb.companyPhone || '';
  var companyEmail = pb.companyEmail || '';
  var companyLicense = pb.companyLicense || '';
  var dateStr = new Date(est.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  var validStr = est.validUntil ? new Date(est.validUntil + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
  html += '<title>Estimate — ' + _h(est.address || 'No Address') + '</title>';
  html += '<style>';
  html += '*{margin:0;padding:0;box-sizing:border-box}';
  html += 'body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#fff;color:#222;font-size:14px;padding:20px;max-width:700px;margin:0 auto}';
  html += '.header{border-bottom:3px solid #FF6B00;padding-bottom:16px;margin-bottom:20px}';
  html += '.company{font-size:22px;font-weight:900;color:#FF6B00;letter-spacing:1px;text-transform:uppercase}';
  html += '.company-info{font-size:12px;color:#666;margin-top:4px}';
  html += '.est-label{font-size:11px;color:#999;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px}';
  html += '.est-title{font-size:18px;font-weight:800;margin-bottom:16px;color:#222}';
  html += '.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}';
  html += '.info-box{background:#f8f8f8;border-radius:8px;padding:10px 12px}';
  html += '.info-label{font-size:10px;color:#999;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin-bottom:2px}';
  html += '.info-value{font-size:14px;font-weight:600;color:#222}';
  html += '.section-title{font-size:11px;font-weight:800;color:#FF6B00;letter-spacing:1.5px;text-transform:uppercase;padding:10px 0 6px;border-bottom:1px solid #eee;margin-bottom:8px}';
  html += 'table{width:100%;border-collapse:collapse;margin-bottom:16px}';
  html += 'th{text-align:left;font-size:10px;font-weight:800;color:#999;letter-spacing:1px;text-transform:uppercase;padding:6px 8px;border-bottom:2px solid #eee}';
  html += 'td{padding:8px;font-size:13px;border-bottom:1px solid #f0f0f0}';
  html += 'td.num{text-align:right;font-weight:600}';
  html += 'th.num{text-align:right}';
  html += '.summary{background:#f8f8f8;border-radius:10px;padding:16px;margin-bottom:16px}';
  html += '.sum-row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:#666}';
  html += '.sum-row.total{border-top:2px solid #FF6B00;margin-top:8px;padding-top:10px}';
  html += '.sum-row.total span{font-size:20px;font-weight:900;color:#222}';
  html += '.sum-row.total .amt{color:#FF6B00}';
  html += '.notes{background:#fffbe6;border-radius:8px;padding:12px;font-size:13px;color:#555;line-height:1.5;margin-bottom:16px}';
  html += '.footer{text-align:center;padding-top:20px;border-top:1px solid #eee;font-size:11px;color:#bbb}';
  html += '.valid{font-size:12px;color:#999;font-weight:600;text-align:center;margin-bottom:16px}';
  html += '@media print{body{padding:0}table{page-break-inside:avoid}}';
  html += '</style></head><body>';

  // Header
  html += '<div class="header">';
  html += '<div class="company">' + _h(companyName) + '</div>';
  var contactParts = [];
  if (companyPhone) contactParts.push(_h(companyPhone));
  if (companyEmail) contactParts.push(_h(companyEmail));
  if (companyLicense) contactParts.push('LIC# ' + _h(companyLicense));
  if (contactParts.length) html += '<div class="company-info">' + contactParts.join(' · ') + '</div>';
  html += '</div>';

  // Title
  html += '<div class="est-label">ESTIMATE</div>';
  html += '<div class="est-title">' + _h(est.address || 'No Address') + '</div>';

  // Info grid
  html += '<div class="info-grid">';
  if (est.customerName) html += '<div class="info-box"><div class="info-label">CUSTOMER</div><div class="info-value">' + _h(est.customerName) + '</div></div>';
  if (est.customerPhone) html += '<div class="info-box"><div class="info-label">PHONE</div><div class="info-value">' + _h(est.customerPhone) + '</div></div>';
  if (est.customerEmail) html += '<div class="info-box"><div class="info-label">EMAIL</div><div class="info-value">' + _h(est.customerEmail) + '</div></div>';
  html += '<div class="info-box"><div class="info-label">DATE</div><div class="info-value">' + dateStr + '</div></div>';
  if (est.jobType) html += '<div class="info-box"><div class="info-label">JOB TYPE</div><div class="info-value">' + _h(est.jobType) + '</div></div>';
  if (est.description) html += '<div class="info-box" style="grid-column:1/-1;"><div class="info-label">SCOPE</div><div class="info-value">' + _h(est.description) + '</div></div>';
  html += '</div>';

  // Materials table
  if (est.materials.length > 0) {
    html += '<div class="section-title">MATERIALS</div>';
    html += '<table><thead><tr><th>ITEM</th><th class="num">QTY</th><th class="num">COST</th><th class="num">TOTAL</th></tr></thead><tbody>';
    est.materials.forEach(function(m) {
      var cost = (parseFloat(m.unitCost) || 0) * (parseFloat(m.qty) || 0);
      var markup = cost * (parseFloat(m.markup) || 0) / 100;
      html += '<tr><td>' + _h(m.name || 'Unnamed') + (m.unit && m.unit !== 'EA' ? ' <span style="color:#999;font-size:11px;">(' + _h(m.unit) + ')</span>' : '') + '</td>';
      html += '<td class="num">' + (m.qty || 0) + '</td>';
      html += '<td class="num">' + _fmtClean(parseFloat(m.unitCost) || 0) + '</td>';
      html += '<td class="num">' + _fmtClean(cost + markup) + '</td></tr>';
    });
    html += '</tbody></table>';
  }

  // Labor
  if (est.laborTotal > 0) {
    html += '<div class="section-title">LABOR</div>';
    html += '<table><thead><tr><th>DESCRIPTION</th><th class="num">HOURS</th><th class="num">RATE</th><th class="num">TOTAL</th></tr></thead><tbody>';
    html += '<tr><td>' + _h(est.jobType || 'Labor') + '</td><td class="num">' + (est.laborHours || 0) + '</td><td class="num">' + _fmtClean(est.laborRate) + '</td><td class="num">' + _fmtClean(est.laborTotal) + '</td></tr>';
    html += '</tbody></table>';
  }

  // Summary
  html += '<div class="summary">';
  html += '<div class="sum-row"><span>Materials</span><span>' + _fmtClean(est.materialSubtotal + est.materialMarkupTotal) + '</span></div>';
  if (est.laborTotal) html += '<div class="sum-row"><span>Labor</span><span>' + _fmtClean(est.laborTotal) + '</span></div>';
  if (est.overheadAmount) html += '<div class="sum-row"><span>Overhead</span><span>' + _fmtClean(est.overheadAmount) + '</span></div>';
  if (est.profitAmount) html += '<div class="sum-row"><span>Profit</span><span>' + _fmtClean(est.profitAmount) + '</span></div>';
  if (est.permitFee) html += '<div class="sum-row"><span>Permit Fee</span><span>' + _fmtClean(est.permitFee) + '</span></div>';
  if (est.taxAmount) html += '<div class="sum-row"><span>Tax</span><span>' + _fmtClean(est.taxAmount) + '</span></div>';
  html += '<div class="sum-row total"><span>TOTAL</span><span class="amt">' + _fmtClean(est.grandTotal) + '</span></div>';
  html += '</div>';

  // Valid until
  if (validStr) {
    html += '<div class="valid">This estimate is valid until ' + validStr + '</div>';
  }

  // Notes
  if (est.notes) {
    html += '<div class="section-title">NOTES</div>';
    html += '<div class="notes">' + _h(est.notes).replace(/\n/g, '<br>') + '</div>';
  }

  // Footer
  html += '<div class="footer">Generated by ASTRA</div>';
  html += '</body></html>';
  return html;
}

// HTML-safe escape for output doc
function _h(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// Clean dollar format (no $ prefix in table cells looks cleaner)
function _fmtClean(n) { return '$' + (n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

// ── Preview: open in new tab ──
function _estPreview() {
  if (!_state.currentEstimate) return;
  _captureFormState();
  recalc(_state.currentEstimate);
  var html = _generateEstimateHTML(_state.currentEstimate);
  var blob = new Blob([html], { type: 'text/html' });
  var url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

// ── Share: native share or fallback ──
function _estShare() {
  if (!_state.currentEstimate) return;
  _captureFormState();
  recalc(_state.currentEstimate);
  var est = _state.currentEstimate;

  // Build plain text version for sharing
  var pb = loadPricebook();
  var companyName = pb.companyName || 'ELECTRICAL SERVICES';
  var lines = [];
  lines.push('ESTIMATE — ' + companyName);
  lines.push('');
  if (est.address) lines.push('Address: ' + est.address);
  if (est.customerName) lines.push('Customer: ' + est.customerName);
  if (est.jobType) lines.push('Job Type: ' + est.jobType);
  if (est.description) lines.push('Scope: ' + est.description);
  lines.push('');

  if (est.materials.length > 0) {
    lines.push('MATERIALS:');
    est.materials.forEach(function(m) {
      var cost = (parseFloat(m.unitCost) || 0) * (parseFloat(m.qty) || 0);
      var markup = cost * (parseFloat(m.markup) || 0) / 100;
      lines.push('  ' + m.name + ' — Qty: ' + (m.qty || 0) + ' — ' + _fmtClean(cost + markup));
    });
    lines.push('');
  }

  if (est.laborTotal > 0) {
    lines.push('LABOR: ' + (est.laborHours || 0) + ' hrs @ ' + _fmtClean(est.laborRate) + '/hr = ' + _fmtClean(est.laborTotal));
    lines.push('');
  }

  lines.push('TOTAL: ' + _fmtClean(est.grandTotal));

  if (est.validUntil) {
    var vd = new Date(est.validUntil + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    lines.push('Valid until ' + vd);
  }

  if (est.notes) {
    lines.push('');
    lines.push('Notes: ' + est.notes);
  }

  var text = lines.join('\n');

  // Try native share API (works great on mobile)
  if (navigator.share) {
    navigator.share({
      title: 'Estimate — ' + (est.address || 'No Address'),
      text: text
    }).catch(function() {});
  } else {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(text).then(function() {
      A.showToast('ESTIMATE COPIED TO CLIPBOARD');
    }).catch(function() {
      A.showToast('SHARE NOT AVAILABLE', 'error');
    });
  }
}

// ══════════════════════════════════════════
// PHASE D: FEEDBACK LOOP
// ══════════════════════════════════════════

// ── Create Ticket from Estimate ──
function _estCreateTicket() {
  var est = _state.currentEstimate;
  if (!est) return;
  _captureFormState();
  recalc(est);

  // Ensure estimate is saved first
  A.saveEstimate(est);

  // Build address ID
  var addressId = est.addressId;
  if (!addressId && est.address) {
    addressId = A.findOrCreateAddress(est.address);
  }

  // Convert estimate materials to ticket material format
  var ticketMats = est.materials.map(function(m) {
    return {
      itemId: m.itemId || crypto.randomUUID(),
      name: m.name,
      qty: parseFloat(m.qty) || 1,
      unit: m.unit || 'EA',
      variant: '',
      partRef: ''
    };
  });

  // Create the job
  var job = {
    id: crypto.randomUUID(),
    syncId: crypto.randomUUID(),
    address: est.address,
    addressId: addressId,
    types: est.jobType ? [est.jobType] : ['GENERAL'],
    status: 'Not Started',
    date: A.todayStr(),
    techId: '', techName: '',
    notes: est.description || '',
    techNotes: '',
    materials: ticketMats,
    photos: [], drawings: [], videos: [],
    manually_added_to_vector: false,
    estimateId: est.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  A.addJob(job);

  // Link estimate to job
  est.linkedJobId = job.id;
  est.status = 'Accepted';
  A.saveEstimate(est);

  A.showToast('TICKET CREATED FROM ESTIMATE');
  A.goTo('screen-detail', job.id);
}

// ── Get linked job for comparison ──
function _getLinkedJob(est) {
  if (!est || !est.linkedJobId) return null;
  return A.getJob(est.linkedJobId);
}

// ── Render: Comparison Section (estimated vs actual) ──
function _renderComparison(est) {
  var job = _getLinkedJob(est);
  if (!job) return '';

  var html = '<div class="est-section-title">ESTIMATED vs ACTUAL</div>';
  html += '<div class="est-intel-card" style="border-color:#FF6B00;">';

  // Job status
  var statusColor = job.status === 'Complete' ? '#2d8a4e' : '#c9a800';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
  html += '<span style="font-size:12px;font-weight:800;color:#888;letter-spacing:1px;">LINKED TICKET</span>';
  html += '<span class="badge" style="background:' + statusColor + ';color:#fff;font-size:10px;">' + A.esc(job.status) + '</span>';
  html += '</div>';

  // Materials comparison
  var estMats = {};
  est.materials.forEach(function(m) {
    var key = m.itemId || m.name;
    estMats[key] = { name: m.name, estQty: parseFloat(m.qty) || 0, unit: m.unit || 'EA', actQty: 0 };
  });

  var jobMats = job.materials || [];
  jobMats.forEach(function(m) {
    var key = m.itemId || m.name;
    if (estMats[key]) {
      estMats[key].actQty = parseFloat(m.qty) || 0;
    } else {
      estMats[key] = { name: m.name, estQty: 0, unit: m.unit || 'EA', actQty: parseFloat(m.qty) || 0 };
    }
  });

  var matList = Object.values(estMats);
  if (matList.length > 0) {
    html += '<div style="font-size:11px;font-weight:800;color:#666;letter-spacing:1px;margin-bottom:6px;">MATERIALS</div>';
    html += '<table style="width:100%;border-collapse:collapse;">';
    html += '<tr style="border-bottom:1px solid #333;">';
    html += '<th style="text-align:left;font-size:10px;color:#555;font-weight:800;padding:4px 0;">ITEM</th>';
    html += '<th style="text-align:right;font-size:10px;color:#555;font-weight:800;padding:4px 0;">EST</th>';
    html += '<th style="text-align:right;font-size:10px;color:#555;font-weight:800;padding:4px 0;">ACTUAL</th>';
    html += '<th style="text-align:right;font-size:10px;color:#555;font-weight:800;padding:4px 0;">DIFF</th>';
    html += '</tr>';

    var totalEst = 0, totalAct = 0;
    matList.forEach(function(m) {
      var diff = m.actQty - m.estQty;
      var diffColor = diff === 0 ? '#555' : diff > 0 ? '#c0392b' : '#2d8a4e';
      var diffStr = diff === 0 ? '—' : (diff > 0 ? '+' : '') + diff;
      totalEst += m.estQty;
      totalAct += m.actQty;
      html += '<tr style="border-bottom:1px solid #222;">';
      html += '<td style="font-size:12px;color:#ccc;padding:6px 0;">' + A.esc(m.name) + '</td>';
      html += '<td style="text-align:right;font-size:12px;color:#888;padding:6px 0;">' + m.estQty + '</td>';
      html += '<td style="text-align:right;font-size:12px;color:#e0e0e0;font-weight:600;padding:6px 0;">' + m.actQty + '</td>';
      html += '<td style="text-align:right;font-size:12px;color:' + diffColor + ';font-weight:700;padding:6px 0;">' + diffStr + '</td>';
      html += '</tr>';
    });
    html += '</table>';

    // Accuracy score
    if (totalEst > 0 && totalAct > 0) {
      var accuracy = Math.round((1 - Math.abs(totalAct - totalEst) / totalEst) * 100);
      if (accuracy < 0) accuracy = 0;
      var accColor = accuracy >= 90 ? '#2d8a4e' : accuracy >= 70 ? '#c9a800' : '#c0392b';
      html += '<div style="text-align:center;margin-top:12px;padding:10px;background:#1a1a1a;border-radius:8px;">';
      html += '<div style="font-size:10px;color:#555;font-weight:800;letter-spacing:1px;">MATERIAL ACCURACY</div>';
      html += '<div style="font-size:28px;font-weight:900;color:' + accColor + ';">' + accuracy + '%</div>';
      html += '</div>';
    }
  }

  // Cost comparison
  if (job.status === 'Complete' && est.grandTotal > 0) {
    html += '<div style="display:flex;gap:8px;margin-top:12px;">';
    html += '<div style="flex:1;background:#1a1a1a;border-radius:8px;padding:10px;text-align:center;">';
    html += '<div style="font-size:10px;color:#555;font-weight:800;letter-spacing:1px;">ESTIMATED</div>';
    html += '<div style="font-size:18px;font-weight:900;color:#FF6B00;">' + _fmt(est.grandTotal) + '</div>';
    html += '</div>';
    html += '<div style="flex:1;background:#1a1a1a;border-radius:8px;padding:10px;text-align:center;">';
    html += '<div style="font-size:10px;color:#555;font-weight:800;letter-spacing:1px;">STATUS</div>';
    html += '<div style="font-size:18px;font-weight:900;color:#2d8a4e;">COMPLETE</div>';
    html += '</div>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// ── Accuracy Metrics Dashboard (across all linked estimates) ──
function _renderAccuracyMetrics() {
  var estimates = A.loadEstimates();
  var linked = estimates.filter(function(e) { return e.linkedJobId; });
  if (!linked.length) return '';

  var totalAccuracy = 0;
  var completedCount = 0;
  var overCount = 0;
  var underCount = 0;
  var exactCount = 0;

  linked.forEach(function(est) {
    var job = A.getJob(est.linkedJobId);
    if (!job) return;

    var estMats = {};
    est.materials.forEach(function(m) {
      var key = m.itemId || m.name;
      estMats[key] = parseFloat(m.qty) || 0;
    });

    var totalEst = 0, totalAct = 0;
    est.materials.forEach(function(m) { totalEst += parseFloat(m.qty) || 0; });
    (job.materials || []).forEach(function(m) { totalAct += parseFloat(m.qty) || 0; });

    if (totalEst > 0) {
      var acc = (1 - Math.abs(totalAct - totalEst) / totalEst) * 100;
      if (acc < 0) acc = 0;
      totalAccuracy += acc;
      completedCount++;
      if (totalAct > totalEst) overCount++;
      else if (totalAct < totalEst) underCount++;
      else exactCount++;
    }
  });

  if (!completedCount) return '';

  var avgAccuracy = Math.round(totalAccuracy / completedCount);
  var accColor = avgAccuracy >= 90 ? '#2d8a4e' : avgAccuracy >= 70 ? '#c9a800' : '#c0392b';

  var html = '<div class="est-intel-card" style="margin-top:16px;">';
  html += '<div class="est-intel-header"><span class="est-intel-icon">📈</span> ESTIMATE ACCURACY <span class="est-intel-count">' + completedCount + ' LINKED</span></div>';
  html += '<div style="display:flex;gap:8px;">';
  html += '<div style="flex:1;background:#1a1a1a;border-radius:8px;padding:12px;text-align:center;">';
  html += '<div style="font-size:10px;color:#555;font-weight:800;letter-spacing:1px;">AVG ACCURACY</div>';
  html += '<div style="font-size:28px;font-weight:900;color:' + accColor + ';">' + avgAccuracy + '%</div>';
  html += '</div>';
  html += '<div style="flex:1;background:#1a1a1a;border-radius:8px;padding:12px;text-align:center;">';
  html += '<div style="font-size:10px;color:#555;font-weight:800;letter-spacing:1px;">TREND</div>';
  html += '<div style="font-size:14px;font-weight:800;margin-top:6px;">';
  if (overCount > underCount) html += '<span style="color:#c0392b;">UNDER-ESTIMATING</span>';
  else if (underCount > overCount) html += '<span style="color:#2d8a4e;">OVER-ESTIMATING</span>';
  else html += '<span style="color:#FF6B00;">ON TARGET</span>';
  html += '</div></div></div>';
  html += '</div>';

  return html;
}

// ── Public API ──
Object.assign(window, {
  renderEstimates: renderEstimatesList,
  renderEstimateBuilder: renderEstimateBuilder,
  renderPricebook: renderPricebook,
  deleteCurrentEstimate: deleteCurrentEstimate,
  _setEstFilter: _setEstFilter,
  _estSetJobType: _estSetJobType,
  _estSetStatus: _estSetStatus,
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
  _setEstMatPhase: _setEstMatPhase,
  _estPreview: _estPreview,
  _estShare: _estShare,
  _estCreateTicket: _estCreateTicket,
});

// ── Test API (diagnostics.html only) ──
window.Astra._testEst = {
  newEstimate: newEstimate,
  recalc: recalc,
  loadPricebook: loadPricebook,
  savePricebook: savePricebook,
  defaultPricebook: defaultPricebook,
  _getAllLibraryItems: _getAllLibraryItems,
};

})();
