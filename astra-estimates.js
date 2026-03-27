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
    serviceCallFee: 99,
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
  // Material totals
  est.materialSubtotal = 0;
  est.materialMarkupTotal = 0;
  est.materials.forEach(function(m) {
    const cost = (parseFloat(m.unitCost) || 0) * (parseFloat(m.qty) || 0);
    const markupPct = parseFloat(m.markup) || pb.materialMarkup;
    m.markup = markupPct;
    m.lineTotal = cost + (cost * markupPct / 100);
    est.materialSubtotal += cost;
    est.materialMarkupTotal += cost * markupPct / 100;
  });
  // Labor
  est.laborTotal = (parseFloat(est.laborHours) || 0) * (parseFloat(est.laborRate) || 0);
  // Subtotal before overhead/profit
  const subtotal = est.materialSubtotal + est.materialMarkupTotal + est.laborTotal;
  // Overhead & profit
  est.overheadAmount = subtotal * (parseFloat(est.overheadPercent) || 0) / 100;
  est.profitAmount = subtotal * (parseFloat(est.profitPercent) || 0) / 100;
  // Permit
  const permit = parseFloat(est.permitFee) || 0;
  // Tax (on materials + markup only)
  est.taxAmount = (est.materialSubtotal + est.materialMarkupTotal) * (parseFloat(est.taxRate) || 0) / 100;
  // Grand total
  est.grandTotal = subtotal + est.overheadAmount + est.profitAmount + permit + est.taxAmount;
  return est;
}

function _fmt(n) {
  return '$' + (n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ═══════════════════════════════════════════
// RENDER: ESTIMATES LIST
// ═══════════════════════════════════════════

let _estFilter = 'all';

function renderEstimatesList() {
  const body = document.getElementById('estimates-body');
  if (!body) return;
  const estimates = A.loadEstimates();

  // Filter bar
  const filters = ['all', 'draft', 'sent', 'accepted', 'declined'];
  let filterHtml = '<div class="est-filter-bar">';
  filters.forEach(function(f) {
    filterHtml += '<button class="est-filter-btn' + (f === _estFilter ? ' active' : '') + '" onclick="window._setEstFilter(\'' + f + '\')">' + f.toUpperCase() + '</button>';
  });
  filterHtml += '</div>';

  // Filter estimates
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
      // Already editing this one — keep in-memory state
    } else {
      _state.currentEstimate = A.getEstimate(estId);
      if (!_state.currentEstimate) _state.currentEstimate = newEstimate();
    }
  } else {
    // No ID = new estimate (from FAB +)
    _state.currentEstimate = newEstimate();
  }
  const est = _state.currentEstimate;
  const pb = loadPricebook();

  // Show/hide delete button
  const delBtn = document.getElementById('est-delete-btn');
  if (delBtn) delBtn.style.display = A.getEstimate(est.id) ? 'flex' : 'none';

  // Job types for chips
  const JOB_TYPES = ['SERVICE CALL','PANEL UPGRADE','EV CHARGER','ROUGH-IN','TRIM-OUT','TROUBLESHOOT','GENERATOR','REWIRE','LIGHTING','GENERAL'];

  let html = '';

  // ── Job Info ──
  html += '<div class="est-section-title">JOB INFO</div>';
  html += '<div class="field"><label>ADDRESS</label>';
  html += '<input type="text" id="est-address" name="astra-xestaddr" autocomplete="nope" placeholder="STREET ADDRESS" value="' + A.esc(est.address) + '" onblur="window._estField(\'address\',this.value)">';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
  html += '<div class="field"><label>CUSTOMER</label><input type="text" id="est-cname" name="astra-xestcname" autocomplete="nope" placeholder="NAME" value="' + A.esc(est.customerName) + '" onblur="window._estField(\'customerName\',this.value)"></div>';
  html += '<div class="field"><label>PHONE</label><input type="tel" id="est-cphone" name="astra-xestcphone" autocomplete="nope" placeholder="(555) 555-5555" value="' + A.esc(est.customerPhone) + '" onblur="window._estField(\'customerPhone\',this.value)"></div>';
  html += '</div>';
  html += '<div class="field"><label>EMAIL</label><input type="email" id="est-cemail" name="astra-xestcemail" autocomplete="nope" placeholder="EMAIL" value="' + A.esc(est.customerEmail) + '" onblur="window._estField(\'customerEmail\',this.value)"></div>';

  // Job type chips
  html += '<div class="field"><label>JOB TYPE</label><div style="display:flex;flex-wrap:wrap;gap:6px;">';
  JOB_TYPES.forEach(function(t) {
    const active = est.jobType === t;
    html += '<button class="badge badge-type" style="cursor:pointer;min-height:36px;padding:6px 12px;' + (active ? 'background:rgba(255,107,0,0.15);color:#FF6B00;border:1px solid #FF6B00;' : '') + '" onclick="window._estSetJobType(\'' + t + '\')">' + t + '</button>';
  });
  html += '</div></div>';

  html += '<div class="field"><label>DESCRIPTION</label><textarea id="est-desc" rows="2" placeholder="SCOPE OF WORK..." onblur="window._estField(\'description\',this.value)">' + A.esc(est.description) + '</textarea></div>';

  // ── Materials ──
  html += '<div class="est-section-title">MATERIALS</div>';

  est.materials.forEach(function(m, i) {
    html += '<div class="est-mat-item">';
    html += '<div class="est-mat-row">';
    html += '<span class="est-mat-name">' + A.esc(m.name) + '</span>';
    html += '<button class="est-mat-remove" onclick="window._estRemoveMat(' + i + ')">✕</button>';
    html += '</div>';
    html += '<div class="est-mat-fields">';
    html += '<div class="est-mat-field"><label>QTY</label><input type="number" inputmode="decimal" value="' + (m.qty || '') + '" onblur="window._estUpdateMat(' + i + ',\'qty\',this.value)"></div>';
    html += '<div class="est-mat-field"><label>COST</label><input type="number" inputmode="decimal" step="0.01" value="' + (m.unitCost || '') + '" onblur="window._estUpdateMat(' + i + ',\'unitCost\',this.value)"></div>';
    html += '<div class="est-mat-field"><label>MKUP%</label><input type="number" inputmode="decimal" value="' + (m.markup != null ? m.markup : pb.materialMarkup) + '" onblur="window._estUpdateMat(' + i + ',\'markup\',this.value)"></div>';
    html += '<div class="est-mat-field"><label>TOTAL</label><input type="text" value="' + _fmt(m.lineTotal || 0) + '" readonly style="color:#FF6B00;font-weight:700;background:none;border:none;"></div>';
    html += '</div>';
    html += '</div>';
  });

  html += '<button class="btn btn-secondary" style="width:100%;margin-top:8px;" onclick="window._estAddMat()">+ ADD MATERIAL</button>';

  // ── Labor ──
  html += '<div class="est-section-title">LABOR</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">';
  html += '<div class="field"><label>HOURS</label><input type="number" inputmode="decimal" id="est-labor-hrs" value="' + (est.laborHours || '') + '" onblur="window._estField(\'laborHours\',this.value);window._estRecalc()"></div>';
  html += '<div class="field"><label>$/HR</label><input type="number" inputmode="decimal" id="est-labor-rate" value="' + (est.laborRate || '') + '" onblur="window._estField(\'laborRate\',this.value);window._estRecalc()"></div>';
  html += '<div class="field"><label>TOTAL</label><input type="text" value="' + _fmt(est.laborTotal) + '" readonly style="color:#FF6B00;font-weight:700;"></div>';
  html += '</div>';

  // ── Adjustments ──
  html += '<div class="est-section-title">ADJUSTMENTS</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">';
  html += '<div class="field"><label>OVERHEAD %</label><input type="number" inputmode="decimal" value="' + (est.overheadPercent || '') + '" onblur="window._estField(\'overheadPercent\',this.value);window._estRecalc()"></div>';
  html += '<div class="field"><label>PROFIT %</label><input type="number" inputmode="decimal" value="' + (est.profitPercent || '') + '" onblur="window._estField(\'profitPercent\',this.value);window._estRecalc()"></div>';
  html += '<div class="field"><label>TAX %</label><input type="number" inputmode="decimal" value="' + (est.taxRate || '') + '" onblur="window._estField(\'taxRate\',this.value);window._estRecalc()"></div>';
  html += '</div>';
  html += '<div class="field"><label>PERMIT FEE</label><input type="number" inputmode="decimal" step="0.01" value="' + (est.permitFee || '') + '" onblur="window._estField(\'permitFee\',this.value);window._estRecalc()"></div>';

  // ── Summary ──
  html += _renderSummary(est);

  // ── Notes ──
  html += '<div class="est-section-title">NOTES</div>';
  html += '<div class="field"><textarea id="est-notes" rows="3" placeholder="ADDITIONAL NOTES..." onblur="window._estField(\'notes\',this.value)">' + A.esc(est.notes) + '</textarea></div>';

  // ── Actions ──
  html += '<div class="est-actions">';
  html += '<button class="btn btn-primary" onclick="window._estSave()">SAVE DRAFT</button>';
  html += '</div>';
  html += '<div style="height:80px;"></div>';

  body.innerHTML = html;
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
  // Margin %
  if (est.grandTotal > 0) {
    const margin = ((est.profitAmount / est.grandTotal) * 100).toFixed(1);
    html += '<div style="text-align:center;margin-top:8px;font-size:12px;color:#555;font-weight:700;text-transform:uppercase;letter-spacing:1px;">MARGIN: ' + margin + '%</div>';
  }
  html += '</div>';
  return html;
}

// ── Builder Helpers ──

function _estField(key, val) {
  if (!_state.currentEstimate) return;
  _state.currentEstimate[key] = val;
}

function _estSetJobType(type) {
  if (!_state.currentEstimate) return;
  _state.currentEstimate.jobType = _state.currentEstimate.jobType === type ? '' : type;
  renderEstimateBuilder(_state.currentEstimate.id);
}

function _estAddMat() {
  if (!_state.currentEstimate) return;
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
  // Focus the new material name — find last mat item
  setTimeout(function() {
    const items = document.querySelectorAll('.est-mat-name');
    // We need to focus the input, but names are spans. Let's focus the qty instead
    const fields = document.querySelectorAll('.est-mat-item');
    if (fields.length > 0) {
      const last = fields[fields.length - 1];
      const nameSpan = last.querySelector('.est-mat-name');
      // Make name editable on new items
      if (nameSpan && _state.currentEstimate.materials[_state.currentEstimate.materials.length - 1].name === '') {
        _estEditMatName(_state.currentEstimate.materials.length - 1);
      }
    }
  }, 50);
}

function _estEditMatName(idx) {
  const items = document.querySelectorAll('.est-mat-item');
  if (!items[idx]) return;
  const nameEl = items[idx].querySelector('.est-mat-name');
  if (!nameEl) return;
  const mat = _state.currentEstimate.materials[idx];
  nameEl.innerHTML = '<input type="text" value="' + A.esc(mat.name) + '" placeholder="MATERIAL NAME" style="width:100%;padding:6px 8px;border-radius:6px;border:1px solid #FF6B00;background:#222;color:#e0e0e0;font-size:14px;font-weight:600;font-family:inherit;" onblur="window._estUpdateMat(' + idx + ',\'name\',this.value)" autofocus>';
  const inp = nameEl.querySelector('input');
  if (inp) inp.focus();
}

function _estRemoveMat(idx) {
  if (!_state.currentEstimate) return;
  _state.currentEstimate.materials.splice(idx, 1);
  recalc(_state.currentEstimate);
  renderEstimateBuilder(_state.currentEstimate.id);
}

function _estUpdateMat(idx, field, val) {
  if (!_state.currentEstimate || !_state.currentEstimate.materials[idx]) return;
  if (field === 'name') {
    _state.currentEstimate.materials[idx][field] = val;
  } else {
    _state.currentEstimate.materials[idx][field] = parseFloat(val) || 0;
  }
  recalc(_state.currentEstimate);
  _refreshSummary();
  // Update line total inline
  _refreshLineTotal(idx);
}

function _refreshLineTotal(idx) {
  const items = document.querySelectorAll('.est-mat-item');
  if (!items[idx]) return;
  const totalField = items[idx].querySelector('.est-mat-field:last-child input');
  if (totalField && _state.currentEstimate.materials[idx]) {
    totalField.value = _fmt(_state.currentEstimate.materials[idx].lineTotal || 0);
  }
  // Update labor total too
  const laborTotal = document.querySelector('#est-labor-hrs');
  if (laborTotal) {
    const ltField = laborTotal.closest('div[style]');
    if (ltField) {
      const inputs = ltField.parentElement.querySelectorAll('input[readonly]');
      if (inputs.length) inputs[0].value = _fmt(_state.currentEstimate.laborTotal);
    }
  }
}

function _refreshSummary() {
  const summaryEl = document.querySelector('.est-summary');
  if (summaryEl && _state.currentEstimate) {
    summaryEl.outerHTML = _renderSummary(_state.currentEstimate);
  }
}

function _estRecalc() {
  if (!_state.currentEstimate) return;
  recalc(_state.currentEstimate);
  _refreshSummary();
}

function _estSave() {
  if (!_state.currentEstimate) return;
  recalc(_state.currentEstimate);
  A.saveEstimate(_state.currentEstimate);
  A.showToast('ESTIMATE SAVED');
  // Show delete button now that it's saved
  const delBtn = document.getElementById('est-delete-btn');
  if (delBtn) delBtn.style.display = 'flex';
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
    { key: 'laborRate', label: 'LABOR RATE ($/HR)', step: '0.01', prefix: '$' },
    { key: 'overheadPercent', label: 'OVERHEAD %', step: '0.1', suffix: '%' },
    { key: 'profitPercent', label: 'PROFIT MARGIN %', step: '0.1', suffix: '%' },
    { key: 'materialMarkup', label: 'DEFAULT MATERIAL MARKUP %', step: '0.1', suffix: '%' },
    { key: 'serviceCallFee', label: 'SERVICE CALL FEE', step: '0.01', prefix: '$' },
    { key: 'permitFee', label: 'DEFAULT PERMIT FEE', step: '0.01', prefix: '$' },
    { key: 'taxRate', label: 'TAX RATE %', step: '0.01', suffix: '%' }
  ];

  let html = '<div style="padding-top:4px;">';

  fields.forEach(function(f) {
    html += '<div class="field"><label>' + f.label + '</label>';
    html += '<input type="number" inputmode="decimal" step="' + f.step + '" id="pb-' + f.key + '" value="' + (pb[f.key] || 0) + '" onblur="window._pbSave()">';
    html += '</div>';
  });

  html += '<button class="btn btn-primary" style="width:100%;margin-top:8px;" onclick="window._pbSave();A.showToast(\'PRICE BOOK SAVED\')">SAVE</button>';
  html += '<div style="height:40px;"></div>';
  html += '</div>';

  body.innerHTML = html;
}

function _pbSave() {
  const pb = loadPricebook();
  const fields = ['laborRate', 'overheadPercent', 'profitPercent', 'materialMarkup', 'serviceCallFee', 'permitFee', 'taxRate'];
  fields.forEach(function(key) {
    const el = document.getElementById('pb-' + key);
    if (el) pb[key] = parseFloat(el.value) || 0;
  });
  savePricebook(pb);
}

// ── Public API ──
Object.assign(window, {
  renderEstimates: renderEstimatesList,
  renderEstimateBuilder: renderEstimateBuilder,
  renderPricebook: renderPricebook,
  deleteCurrentEstimate: deleteCurrentEstimate,
  _setEstFilter: _setEstFilter,
  _estField: _estField,
  _estSetJobType: _estSetJobType,
  _estAddMat: _estAddMat,
  _estRemoveMat: _estRemoveMat,
  _estUpdateMat: _estUpdateMat,
  _estRecalc: _estRecalc,
  _estSave: _estSave,
  _estEditMatName: _estEditMatName,
  _pbSave: _pbSave,
});

})();
