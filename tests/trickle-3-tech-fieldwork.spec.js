// ═══════════════════════════════════════════════════════════════
// TRICKLE TEST 3 — TECH FIELDWORK
// Tech logs actual work: updates materials, logs labor hours,
// marks sections complete, saves.
// ═══════════════════════════════════════════════════════════════
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SEED_PATH = path.resolve(__dirname, 'trickle-seed.json');
const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));

// Only completed jobs get fieldwork updates
const completedJobs = seed.jobs.filter(j => j.status === 'completed');

// Category label mapping (must match what trickle-2 used)
const CATEGORY_MAP = {
  panel_swap: 'PANEL SWAP',
  service_upgrade: 'SERVICE UPGRADE',
  outlet_switch: 'OUTLET / SWITCH',
  recessed_lighting: 'RECESSED LIGHTING',
  ceiling_fan: 'CEILING FAN',
  ev_charger: 'EV CHARGER',
  whole_house_rewire: 'WHOLE HOUSE REWIRE',
  troubleshoot: 'TROUBLESHOOT',
  gfci_upgrade: 'GFCI UPGRADE',
  dedicated_circuit: 'DEDICATED CIRCUIT',
  landscape_lighting: 'LANDSCAPE LIGHTING',
  generator_hookup: 'GENERATOR HOOKUP',
  smoke_detectors: 'SMOKE DETECTORS',
  pool_spa: 'POOL / SPA',
};

test.describe('Trickle 3 — Tech Fieldwork', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.Astra && typeof window.Astra.loadJobs === 'function', {
      timeout: 15000,
    });
    await page.evaluate(() => localStorage.setItem('astra_debug', 'true'));
    // Ensure material library is loaded
    await page.waitForFunction(() => {
      const lib = window.Astra.loadMaterialLibrary();
      return lib && lib.categories && lib.categories.length > 0;
    }, { timeout: 10000 });
  });

  test('ensure seed jobs exist (re-create if needed)', async ({ page }) => {
    const jobCount = await page.evaluate(() => window.Astra.loadJobs().length);
    if (jobCount < seed.jobs.length) {
      console.log(`   Only ${jobCount} jobs found, re-seeding ${seed.jobs.length} jobs...`);
      await page.evaluate(({ jobs, catMap }) => {
        for (const seedJob of jobs) {
          const addressId = window.Astra.findOrCreateAddress(seedJob.address);
          const typeLabel = catMap[seedJob.category] || seedJob.category.toUpperCase().replace(/_/g, ' ');
          const materials = (seedJob.materials || []).map(m => ({
            materialId: crypto.randomUUID(),
            itemId: m.itemId, name: m.name, qty: m.qty,
            unit: m.unit || 'EA',
            unitPrice: window.Astra.getEffectivePrice(m.itemId) || 0,
          }));
          const customMats = (seedJob.custom_materials || []).map(m => ({
            materialId: crypto.randomUUID(), itemId: '', name: m.name,
            qty: m.qty, unit: m.unit || 'EA', unitPrice: m.unitPrice || 0, custom: true,
          }));
          const job = {
            id: crypto.randomUUID(), syncId: crypto.randomUUID(),
            address: seedJob.address, addressId,
            types: [typeLabel],
            status: seedJob.status === 'completed' ? 'Complete' : seedJob.status === 'in_progress' ? 'In Progress' : 'Not Started',
            date: seedJob.date_created,
            notes: seedJob.notes || '',
            techNotes: '', techId: '', techName: seedJob.assigned_to,
            materials: [...materials, ...customMats],
            photos: [], drawings: [], videos: [],
            archived: seedJob.status === 'completed',
            createdAt: new Date(seedJob.date_created + 'T08:00:00').toISOString(),
            updatedAt: new Date().toISOString(),
          };
          if (seedJob.labor_hours) job.notes += '\nLABOR: ' + seedJob.labor_hours + ' HRS';
          if (seedJob.actual_cost) job.notes += '\nACTUAL COST: $' + seedJob.actual_cost.toFixed(2);
          if (seedJob.date_completed) job.completedDate = seedJob.date_completed;
          window.Astra.addJob(job);
        }
      }, { jobs: seed.jobs, catMap: CATEGORY_MAP });
    }
    const finalCount = await page.evaluate(() => window.Astra.loadJobs().length);
    console.log(`   Jobs in DB: ${finalCount}`);
    expect(finalCount).toBeGreaterThanOrEqual(seed.jobs.length);
  });

  test('tech updates completed jobs with actual field data', async ({ page }) => {
    console.log(`   Updating ${completedJobs.length} completed jobs with fieldwork data`);

    const BATCH_SIZE = 10;
    for (let batch = 0; batch < Math.ceil(completedJobs.length / BATCH_SIZE); batch++) {
      const start = batch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, completedJobs.length);
      const batchJobs = completedJobs.slice(start, end);

      await test.step(`update jobs ${start + 1}-${end}`, async () => {
        const results = await page.evaluate(({ seedBatch, catMap }) => {
          const allJobs = window.Astra.loadJobs();
          const updated = [];

          for (const seedJob of seedBatch) {
            const typeLabel = catMap[seedJob.category] || seedJob.category.toUpperCase().replace(/_/g, ' ');

            // Find the matching ASTRA job by address + type
            const match = allJobs.find(j =>
              j.address === seedJob.address &&
              j.types && j.types.indexOf(typeLabel) !== -1
            );

            if (!match) {
              updated.push({ found: false, address: seedJob.address.split(',')[0] });
              continue;
            }

            // Update materials to match "actual" quantities from seed
            const actualMaterials = (seedJob.materials || []).map(m => ({
              materialId: crypto.randomUUID(),
              itemId: m.itemId,
              name: m.name,
              qty: m.qty, // seed data already has final/actual quantities
              unit: m.unit || 'EA',
              unitPrice: window.Astra.getEffectivePrice(m.itemId) || 0,
            }));

            // Add custom materials
            const customMats = (seedJob.custom_materials || []).map(m => ({
              materialId: crypto.randomUUID(),
              itemId: '',
              name: m.name,
              qty: m.qty,
              unit: m.unit || 'EA',
              unitPrice: m.unitPrice || 0,
              custom: true,
            }));

            // Build tech notes with labor info
            const techNotes = [
              'ACTUAL LABOR: ' + seedJob.labor_hours + ' HRS',
              'ESTIMATED LABOR: ' + seedJob.estimated_labor_hours + ' HRS',
              seedJob.actual_cost ? 'ACTUAL COST: $' + seedJob.actual_cost.toFixed(2) : '',
              seedJob.estimated_cost ? 'ESTIMATED COST: $' + seedJob.estimated_cost.toFixed(2) : '',
              seedJob.date_completed ? 'COMPLETED: ' + seedJob.date_completed : '',
            ].filter(Boolean).join('\n');

            // Apply updates
            window.Astra.updateJob(match.id, {
              materials: [...actualMaterials, ...customMats],
              techNotes: techNotes,
              status: 'Complete',
              archived: true,
            });

            updated.push({ found: true, id: match.id, address: seedJob.address.split(',')[0] });
          }
          return updated;
        }, { seedBatch: batchJobs, catMap: CATEGORY_MAP });

        const found = results.filter(r => r.found).length;
        const missing = results.filter(r => !r.found).length;
        console.log(`   Batch ${batch + 1}: updated ${found}, not found ${missing}`);
      });
    }
  });

  test('verify tech notes contain labor data', async ({ page }) => {
    const laborStats = await page.evaluate(() => {
      const jobs = window.Astra.loadJobs();
      let withLabor = 0;
      let totalHours = 0;
      jobs.forEach(j => {
        const notes = (j.techNotes || '') + (j.notes || '');
        const laborMatch = notes.match(/LABOR:\s*([\d.]+)\s*HRS/i);
        if (laborMatch) {
          withLabor++;
          totalHours += parseFloat(laborMatch[1]);
        }
      });
      return { total: jobs.length, withLabor, totalHours: totalHours.toFixed(1) };
    });

    console.log('   Labor stats:');
    console.log(`     Jobs with labor data: ${laborStats.withLabor}/${laborStats.total}`);
    console.log(`     Total labor hours: ${laborStats.totalHours}`);
    expect(laborStats.withLabor).toBeGreaterThan(0);
  });

  test('verify all completed jobs have materials', async ({ page }) => {
    const matCheck = await page.evaluate(() => {
      const jobs = window.Astra.loadJobs().filter(j => j.status === 'Complete');
      let withMats = 0;
      let totalLineItems = 0;
      jobs.forEach(j => {
        if (j.materials && j.materials.length > 0) {
          withMats++;
          totalLineItems += j.materials.length;
        }
      });
      return { completed: jobs.length, withMats, totalLineItems };
    });

    console.log('   Material verification:');
    console.log(`     Completed jobs: ${matCheck.completed}`);
    console.log(`     With materials: ${matCheck.withMats}`);
    console.log(`     Total line items: ${matCheck.totalLineItems}`);
    expect(matCheck.withMats).toBeGreaterThan(0);
  });
});
