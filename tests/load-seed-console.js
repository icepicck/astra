// ═══════════════════════════════════════════════════════════════
// ASTRA SEED LOADER — Paste this entire script into Chrome DevTools console
// while on your ASTRA site (icepicck.github.io/astra)
//
// This loads 55 Houston residential jobs into your local IndexedDB.
// After loading, hit SYNC (push) in Settings to send to Supabase.
// ═══════════════════════════════════════════════════════════════

(async function() {
  'use strict';

  // Category label mapping
  const CATEGORY_MAP = {
    panel_swap: 'PANEL SWAP',
    service_upgrade: 'SERVICE UPGRADE',
    outlet_switch: 'OUTLET / SWITCH',
    recessed_lighting: 'RECESSED LIGHTING',
    ceiling_fan: 'CEILING FAN',
    circuit_addition: 'CIRCUIT ADDITION',
    troubleshooting: 'TROUBLESHOOTING',
    subpanel_install: 'SUBPANEL INSTALL',
    outdoor_landscape: 'OUTDOOR LANDSCAPE',
    whole_home_rewire: 'WHOLE HOME REWIRE',
  };

  const TECH_MAP = {
    tech_carlos: 'Carlos',
    tech_james: 'James',
    tech_rachel: 'Rachel',
  };

  // Check ASTRA is loaded
  if (!window.Astra || !window.Astra.addJob) {
    console.error('ASTRA not loaded. Run this on your ASTRA site.');
    return;
  }

  // Fetch the seed data
  console.log('%c ASTRA SEED LOADER ', 'background:#FF6B00;color:#fff;font-weight:bold;font-size:14px;');
  console.log('Fetching seed dataset...');

  let seed;
  try {
    const res = await fetch('tests/trickle-seed.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    seed = await res.json();
  } catch (e) {
    console.error('Could not fetch trickle-seed.json from server. Trying local path...');
    console.error('If running from GitHub Pages, the test files may not be deployed.');
    console.error('Alternative: copy the seed JSON and assign it to window._seedData, then re-run.');
    return;
  }

  const jobs = seed.jobs;
  console.log(`Found ${jobs.length} jobs in seed dataset.`);

  // Check current state
  const existing = window.Astra.loadJobs().length;
  if (existing > 0) {
    console.warn(`You already have ${existing} jobs in local DB.`);
    console.warn('Seed data will be ADDED to existing jobs (not replaced).');
    console.warn('If you want a clean start, export your data first, then wipe via Settings > Developer > WIPE LOCAL DATA.');
  }

  // Sort chronologically
  const sorted = [...jobs].sort((a, b) =>
    new Date(a.date_created).getTime() - new Date(b.date_created).getTime()
  );

  // Create addresses first
  const uniqueAddrs = [...new Set(sorted.map(j => j.address))];
  console.log(`Creating ${uniqueAddrs.length} addresses...`);
  for (const addr of uniqueAddrs) {
    window.Astra.findOrCreateAddress(addr);
  }
  console.log(`Addresses: ${window.Astra.loadAddresses().length} total in DB.`);

  // Create techs
  const existingTechs = window.Astra.loadTechs().map(t => t.name.toLowerCase());
  for (const [, name] of Object.entries(TECH_MAP)) {
    if (!existingTechs.includes(name.toLowerCase())) {
      window.Astra.addTech({ id: crypto.randomUUID(), name: name });
      console.log(`  Added tech: ${name}`);
    }
  }

  // Load jobs
  let count = 0;
  for (const s of sorted) {
    const addressId = window.Astra.findOrCreateAddress(s.address);
    const typeLabel = CATEGORY_MAP[s.category] || s.category.toUpperCase().replace(/_/g, ' ');
    const techName = TECH_MAP[s.assigned_to] || s.assigned_to;

    // Build materials with pricing
    const materials = (s.materials || []).map(m => ({
      materialId: crypto.randomUUID(),
      itemId: m.itemId,
      name: m.name,
      qty: m.qty,
      unit: m.unit || 'EA',
      unitPrice: (window.Astra.getEffectivePrice && window.Astra.getEffectivePrice(m.itemId)) || 0,
    }));

    // Custom materials (builder-supplied, specialty items)
    const customMats = (s.custom_materials || []).map(m => ({
      materialId: crypto.randomUUID(),
      itemId: 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      name: m.name,
      qty: m.qty,
      unit: m.unit || 'EA',
      unitPrice: m.unitPrice || 0,
      custom: true,
    }));

    // Build notes
    let notes = s.notes || '';
    if (s.labor_hours) notes += '\nLABOR: ' + s.labor_hours + ' HRS';
    if (s.estimated_labor_hours) notes += '\nESTIMATED LABOR: ' + s.estimated_labor_hours + ' HRS';
    if (s.actual_cost) notes += '\nACTUAL COST: $' + s.actual_cost.toFixed(2);
    if (s.estimated_cost) notes += '\nESTIMATED COST: $' + s.estimated_cost.toFixed(2);

    // Property info in tech notes
    let techNotes = '';
    if (s.existing_panel) techNotes += 'EXISTING: ' + s.existing_panel + '\n';
    if (s.new_panel) techNotes += 'NEW: ' + s.new_panel + '\n';
    if (s.home_year) techNotes += 'HOME YEAR: ' + s.home_year + '\n';
    if (s.home_sqft) techNotes += 'SQFT: ' + s.home_sqft + '\n';

    const job = {
      id: crypto.randomUUID(),
      syncId: crypto.randomUUID(),
      address: s.address,
      addressId: addressId,
      types: [typeLabel],
      status: s.status === 'completed' ? 'Complete'
            : s.status === 'in_progress' ? 'In Progress'
            : 'Not Started',
      date: s.date_created,
      completedDate: s.date_completed || null,
      notes: notes.trim(),
      techNotes: techNotes.trim(),
      techId: '',
      techName: techName,
      materials: [...materials, ...customMats],
      photos: [],
      drawings: [],
      videos: [],
      archived: s.status === 'completed',
      createdAt: new Date(s.date_created + 'T08:00:00').toISOString(),
      updatedAt: new Date().toISOString(),
    };

    window.Astra.addJob(job);
    count++;

    if (count % 10 === 0) {
      console.log(`  Loaded ${count}/${sorted.length} jobs...`);
    }
  }

  // Summary
  const totalJobs = window.Astra.loadJobs().length;
  const totalAddrs = window.Astra.loadAddresses().length;
  const totalTechs = window.Astra.loadTechs().length;

  console.log('');
  console.log('%c SEED LOAD COMPLETE ', 'background:#2d8a4e;color:#fff;font-weight:bold;font-size:14px;');
  console.log(`  Jobs loaded: ${count}`);
  console.log(`  Total jobs in DB: ${totalJobs}`);
  console.log(`  Addresses: ${totalAddrs}`);
  console.log(`  Techs: ${totalTechs}`);
  console.log('');
  console.log('%c NEXT STEP: Go to Settings > Sync > PUSH to send to Supabase ', 'background:#FF6B00;color:#fff;font-weight:bold;');
  console.log('');

  // Refresh the UI
  if (window.goTo) window.goTo('screen-home');
})();
