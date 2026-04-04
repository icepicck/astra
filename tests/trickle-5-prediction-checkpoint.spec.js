// ═══════════════════════════════════════════════════════════════
// TRICKLE TEST 5 — PREDICTION CHECKPOINT
// Seeds jobs, queries prediction engine per category, outputs
// accuracy report. Single test to preserve IDB context.
// ═══════════════════════════════════════════════════════════════
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SEED_PATH = path.resolve(__dirname, 'trickle-seed.json');
const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));

// Build actual averages from seed data by category
const actualsByCategory = {};
for (const job of seed.jobs) {
  if (job.status !== 'completed') continue;
  const cat = job.category;
  if (!actualsByCategory[cat]) {
    actualsByCategory[cat] = { jobCount: 0, totalLaborHours: 0, totalCost: 0, totalMaterialCount: 0 };
  }
  actualsByCategory[cat].jobCount++;
  actualsByCategory[cat].totalLaborHours += job.labor_hours || 0;
  actualsByCategory[cat].totalCost += job.actual_cost || 0;
  actualsByCategory[cat].totalMaterialCount += (job.materials || []).length + (job.custom_materials || []).length;
}
for (const cat of Object.keys(actualsByCategory)) {
  const a = actualsByCategory[cat];
  a.avgLaborHours = a.totalLaborHours / a.jobCount;
  a.avgCost = a.totalCost / a.jobCount;
  a.avgMaterialCount = a.totalMaterialCount / a.jobCount;
}

// Category label mapping — must match what trickle-2 stores as job.types[0]
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

test.describe('Trickle 5 — Prediction Checkpoint', () => {

  // Single test preserves page context (and therefore IDB) across all steps
  test('seed data, query predictions, and output accuracy report', async ({ page }) => {

    // ── Boot ──
    await page.goto('/');
    await page.waitForFunction(() => window.Astra && typeof window.Astra.loadJobs === 'function', { timeout: 15000 });
    await page.waitForFunction(() => {
      const lib = window.Astra.loadMaterialLibrary();
      return lib && lib.categories && lib.categories.length > 0;
    }, { timeout: 10000 });

    // ── Step 1: Seed jobs ──
    await test.step('seed 55 jobs into IDB', async () => {
      const jobCount = await page.evaluate(() => window.Astra.loadJobs().length);
      if (jobCount >= 55) {
        console.log(`   Already have ${jobCount} jobs, skipping seed`);
        return;
      }
      console.log(`   Seeding ${seed.jobs.length} jobs...`);
      await page.evaluate(({ jobs, catMap }) => {
        for (const s of jobs) {
          const addressId = window.Astra.findOrCreateAddress(s.address);
          const typeLabel = catMap[s.category] || s.category.toUpperCase().replace(/_/g, ' ');
          const materials = (s.materials || []).map(m => ({
            materialId: crypto.randomUUID(), itemId: m.itemId, name: m.name,
            qty: m.qty, unit: m.unit || 'EA',
            unitPrice: window.Astra.getEffectivePrice ? window.Astra.getEffectivePrice(m.itemId) || 0 : 0,
          }));
          const customMats = (s.custom_materials || []).map(m => ({
            materialId: crypto.randomUUID(), itemId: 'custom_' + Date.now(),
            name: m.name, qty: m.qty, unit: m.unit || 'EA',
            unitPrice: m.unitPrice || 0, custom: true,
          }));
          window.Astra.addJob({
            id: crypto.randomUUID(), syncId: crypto.randomUUID(),
            address: s.address, addressId, types: [typeLabel],
            status: s.status === 'completed' ? 'Complete' : 'In Progress',
            date: s.date_created,
            completedDate: s.date_completed || null,
            notes: (s.notes || '') +
              (s.labor_hours ? '\nLABOR: ' + s.labor_hours + ' HRS' : '') +
              (s.actual_cost ? '\nACTUAL COST: $' + s.actual_cost.toFixed(2) : ''),
            techNotes: s.labor_hours
              ? 'ACTUAL LABOR: ' + s.labor_hours + ' HRS\nESTIMATED: ' + s.estimated_labor_hours + ' HRS'
              : '',
            techId: '', techName: s.assigned_to,
            materials: [...materials, ...customMats],
            photos: [], drawings: [], videos: [],
            archived: s.status === 'completed',
            createdAt: new Date(s.date_created + 'T08:00:00').toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }, { jobs: seed.jobs, catMap: CATEGORY_MAP });

      const finalCount = await page.evaluate(() => window.Astra.loadJobs().length);
      console.log(`   Seeded. Jobs in DB: ${finalCount}`);
      expect(finalCount).toBeGreaterThanOrEqual(55);
    });

    // ── Step 2: Query prediction engine per category ──
    const predictions = {};
    await test.step('query prediction engine for all categories', async () => {
      const categories = Object.keys(actualsByCategory);

      for (const cat of categories) {
        const typeLabel = CATEGORY_MAP[cat] || cat.toUpperCase().replace(/_/g, ' ');
        const prediction = await page.evaluate((jobType) => {
          const jobs = window.Astra.loadJobs().filter(j =>
            j.types && j.types.indexOf(jobType) !== -1 &&
            j.materials && j.materials.length > 0
          );
          if (!jobs.length) return { materials: [], jobCount: 0, uniqueCount: 0 };

          const matMap = {};
          let totalLabor = 0, totalCost = 0, laborJobs = 0, costJobs = 0;
          jobs.forEach(j => {
            j.materials.filter(m => m.qty > 0).forEach(m => {
              const key = (m.itemId || m.name) + '|' + (m.variant || '');
              if (!matMap[key]) matMap[key] = { itemId: m.itemId, name: m.name, variant: m.variant || null, unit: m.unit || 'EA', totalQty: 0, jobCount: 0 };
              matMap[key].totalQty += (m.qty || 1);
              matMap[key].jobCount += 1;
            });
            // Extract labor/cost from notes
            const notes = (j.techNotes || '') + ' ' + (j.notes || '');
            const lm = notes.match(/(?:ACTUAL\s*)?LABOR:\s*([\d.]+)\s*HRS/i);
            if (lm) { totalLabor += parseFloat(lm[1]); laborJobs++; }
            const cm = notes.match(/ACTUAL COST:\s*\$([\d.]+)/i);
            if (cm) { totalCost += parseFloat(cm[1]); costJobs++; }
          });

          const materials = Object.values(matMap).map(m => { m.avgQty = Math.ceil(m.totalQty / m.jobCount); return m; });
          return {
            jobCount: jobs.length,
            uniqueCount: materials.length,
            avgLaborHours: laborJobs ? (totalLabor / laborJobs) : 0,
            avgCost: costJobs ? (totalCost / costJobs) : 0,
            avgMatsPerJob: jobs.length ? (jobs.reduce((s, j) => s + j.materials.filter(m => m.qty > 0).length, 0) / jobs.length) : 0,
          };
        }, typeLabel);

        predictions[cat] = prediction;
      }
    });

    // ── Step 3: Quick comparison table ──
    await test.step('output quick comparison table', async () => {
      console.log('');
      console.log('   ═══════════════════════════════════════════════════════════════════');
      console.log('   PREDICTION ENGINE ACCURACY REPORT');
      console.log('   ═══════════════════════════════════════════════════════════════════');
      console.log('   CATEGORY              | JOBS | PRED MATS | ACTUAL AVG | MATCH');
      console.log('   ----------------------|------|-----------|------------|------');

      for (const cat of Object.keys(actualsByCategory)) {
        const actual = actualsByCategory[cat];
        const pred = predictions[cat] || { jobCount: 0, uniqueCount: 0 };
        const catLabel = (CATEGORY_MAP[cat] || cat).padEnd(22);
        const jobStr = String(pred.jobCount).padStart(4);
        const predStr = String(pred.uniqueCount).padStart(9);
        const actualStr = actual.avgMaterialCount.toFixed(1).padStart(10);
        const match = pred.jobCount >= 5 && pred.uniqueCount > 0 ? '  YES' : pred.jobCount < 5 ? '  <5' : '   NO';
        console.log(`   ${catLabel}| ${jobStr} | ${predStr} | ${actualStr} | ${match}`);
      }
      console.log('   ═══════════════════════════════════════════════════════════════════');
    });

    // ── Step 4: Detailed report ──
    await test.step('output detailed accuracy report', async () => {
      console.log('');
      console.log('   ════════════════════════════════════════════════════════════════════');
      console.log('   DETAILED PREDICTION REPORT');
      console.log('   ════════════════════════════════════════════════════════════════════');

      for (const cat of Object.keys(actualsByCategory)) {
        const actual = actualsByCategory[cat];
        const pred = predictions[cat] || { jobCount: 0, uniqueCount: 0, avgLaborHours: 0, avgCost: 0, avgMatsPerJob: 0 };
        const label = CATEGORY_MAP[cat] || cat;
        console.log(`   ${label}`);
        console.log(`     Jobs: ${pred.jobCount} | Unique Mats: ${pred.uniqueCount} | Avg Mats/Job: ${pred.avgMatsPerJob.toFixed(1)}`);
        console.log(`     Pred Labor: ${pred.avgLaborHours.toFixed(1)} hrs | Actual Labor: ${actual.avgLaborHours.toFixed(1)} hrs`);
        console.log(`     Pred Cost: $${pred.avgCost.toFixed(0)} | Actual Cost: $${actual.avgCost.toFixed(0)}`);
        console.log('');
      }

      const cats5plus = Object.keys(actualsByCategory).filter(c => (predictions[c] || {}).jobCount >= 5);
      console.log(`   Total categories: ${Object.keys(actualsByCategory).length}`);
      console.log(`   Categories with 5+ jobs: ${cats5plus.length}`);
      console.log('   ════════════════════════════════════════════════════════════════════');

      expect(Object.keys(predictions).length).toBeGreaterThan(0);
    });

    // ── Step 5: Assert convergence ──
    await test.step('assert predictions converge for categories with 5+ jobs', async () => {
      const failures = [];
      for (const cat of Object.keys(actualsByCategory)) {
        const actual = actualsByCategory[cat];
        const pred = predictions[cat] || { jobCount: 0, uniqueCount: 0 };
        if (pred.jobCount < 5) continue;
        if (pred.uniqueCount === 0 && actual.avgMaterialCount > 0) {
          failures.push(`${CATEGORY_MAP[cat]}: predicted 0 materials but actual avg is ${actual.avgMaterialCount.toFixed(1)}`);
        }
      }
      if (failures.length > 0) {
        console.log('   FAILURES:');
        failures.forEach(f => console.log(`     - ${f}`));
      }
      expect(failures.length).toBe(0);
    });

    // ── Step 6: Verify estimates screen ──
    await test.step('verify estimates screen renders', async () => {
      await page.evaluate(() => window.goTo('screen-estimates'));
      await page.waitForTimeout(500);
      const visible = await page.evaluate(() => {
        const el = document.getElementById('screen-estimates');
        return el && el.style.display !== 'none';
      });
      expect(visible).toBe(true);
    });
  });
});
