// ═══════════════════════════════════════════════════════════════
// TRICKLE TEST 4 — SUPERVISOR CLOSEOUT
// Supervisor closes all completed jobs: status to Complete,
// close-out notes from seed data, archive.
// ═══════════════════════════════════════════════════════════════
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SEED_PATH = path.resolve(__dirname, 'trickle-seed.json');
const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));

const completedJobs = seed.jobs.filter(j => j.status === 'completed');

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

test.describe('Trickle 4 — Supervisor Closeout', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.Astra && typeof window.Astra.loadJobs === 'function', {
      timeout: 15000,
    });
    await page.evaluate(() => localStorage.setItem('astra_debug', 'true'));
    await page.waitForFunction(() => {
      const lib = window.Astra.loadMaterialLibrary();
      return lib && lib.categories && lib.categories.length > 0;
    }, { timeout: 10000 });
  });

  test('ensure seed jobs exist (re-seed if empty)', async ({ page }) => {
    const jobCount = await page.evaluate(() => window.Astra.loadJobs().length);
    if (jobCount < seed.jobs.length) {
      console.log(`   Only ${jobCount} jobs found, re-seeding...`);
      await page.evaluate(({ jobs, catMap }) => {
        for (const seedJob of jobs) {
          const addressId = window.Astra.findOrCreateAddress(seedJob.address);
          const typeLabel = catMap[seedJob.category] || seedJob.category.toUpperCase().replace(/_/g, ' ');
          const materials = (seedJob.materials || []).map(m => ({
            materialId: crypto.randomUUID(), itemId: m.itemId, name: m.name,
            qty: m.qty, unit: m.unit || 'EA',
            unitPrice: window.Astra.getEffectivePrice(m.itemId) || 0,
          }));
          const customMats = (seedJob.custom_materials || []).map(m => ({
            materialId: crypto.randomUUID(), itemId: '', name: m.name,
            qty: m.qty, unit: m.unit || 'EA', unitPrice: m.unitPrice || 0, custom: true,
          }));
          window.Astra.addJob({
            id: crypto.randomUUID(), syncId: crypto.randomUUID(),
            address: seedJob.address, addressId,
            types: [typeLabel],
            status: seedJob.status === 'completed' ? 'In Progress' : 'Not Started',
            date: seedJob.date_created,
            notes: seedJob.notes || '',
            techNotes: '', techId: '', techName: seedJob.assigned_to,
            materials: [...materials, ...customMats],
            photos: [], drawings: [], videos: [],
            archived: false,
            createdAt: new Date(seedJob.date_created + 'T08:00:00').toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }, { jobs: seed.jobs, catMap: CATEGORY_MAP });
    }
    const finalCount = await page.evaluate(() => window.Astra.loadJobs().length);
    console.log(`   Jobs in DB: ${finalCount}`);
    expect(finalCount).toBeGreaterThanOrEqual(seed.jobs.length);
  });

  test('supervisor closes out all completed jobs', async ({ page }) => {
    console.log(`   Closing out ${completedJobs.length} completed jobs`);

    const BATCH_SIZE = 10;
    let totalClosed = 0;
    let totalNotFound = 0;

    for (let batch = 0; batch < Math.ceil(completedJobs.length / BATCH_SIZE); batch++) {
      const start = batch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, completedJobs.length);
      const batchJobs = completedJobs.slice(start, end);

      await test.step(`close out jobs ${start + 1}-${end}`, async () => {
        const results = await page.evaluate(({ seedBatch, catMap }) => {
          const allJobs = window.Astra.loadJobs();
          const closed = [];

          for (const seedJob of seedBatch) {
            const typeLabel = catMap[seedJob.category] || seedJob.category.toUpperCase().replace(/_/g, ' ');

            // Find matching job
            const match = allJobs.find(j =>
              j.address === seedJob.address &&
              j.types && j.types.indexOf(typeLabel) !== -1
            );

            if (!match) {
              closed.push({ found: false, address: seedJob.address.split(',')[0] });
              continue;
            }

            // Build close-out notes
            const closeOutNotes = [
              '--- SUPERVISOR CLOSE-OUT ---',
              'COMPLETED: ' + (seedJob.date_completed || 'N/A'),
              'LABOR: ' + seedJob.labor_hours + ' HRS (EST: ' + seedJob.estimated_labor_hours + ' HRS)',
              'ACTUAL COST: $' + (seedJob.actual_cost ? seedJob.actual_cost.toFixed(2) : 'N/A'),
              'ESTIMATED COST: $' + (seedJob.estimated_cost ? seedJob.estimated_cost.toFixed(2) : 'N/A'),
              seedJob.actual_cost && seedJob.estimated_cost
                ? 'VARIANCE: $' + (seedJob.actual_cost - seedJob.estimated_cost).toFixed(2) +
                  ' (' + (((seedJob.actual_cost - seedJob.estimated_cost) / seedJob.estimated_cost) * 100).toFixed(1) + '%)'
                : '',
              'DISPATCHED BY: ' + seedJob.dispatched_by,
              'ASSIGNED TO: ' + seedJob.assigned_to,
            ].filter(Boolean).join('\n');

            // Append close-out notes to existing notes
            const existingNotes = match.notes || '';
            const fullNotes = existingNotes + '\n\n' + closeOutNotes;

            // Update job: status to Complete, archive it
            window.Astra.updateJob(match.id, {
              status: 'Complete',
              notes: fullNotes,
              archived: true,
              completedDate: seedJob.date_completed || undefined,
            });

            closed.push({
              found: true,
              id: match.id,
              category: seedJob.category,
              laborVariance: seedJob.labor_hours - seedJob.estimated_labor_hours,
            });
          }
          return closed;
        }, { seedBatch: batchJobs, catMap: CATEGORY_MAP });

        const found = results.filter(r => r.found).length;
        const missing = results.filter(r => !r.found).length;
        totalClosed += found;
        totalNotFound += missing;
        console.log(`   Batch ${batch + 1}: closed ${found}, not found ${missing}`);
      });
    }

    console.log(`   Total closed: ${totalClosed}, not found: ${totalNotFound}`);
    expect(totalClosed).toBeGreaterThan(0);
  });

  test('verify all seed-completed jobs are now status Complete', async ({ page }) => {
    const statusCheck = await page.evaluate(() => {
      const jobs = window.Astra.loadJobs();
      const statuses = {};
      jobs.forEach(j => {
        statuses[j.status] = (statuses[j.status] || 0) + 1;
      });
      return { total: jobs.length, statuses };
    });

    console.log('   Job status distribution:');
    for (const [status, count] of Object.entries(statusCheck.statuses)) {
      console.log(`     ${status}: ${count}`);
    }

    expect(statusCheck.statuses['Complete']).toBeGreaterThanOrEqual(completedJobs.length);
  });

  test('verify close-out notes contain cost variance data', async ({ page }) => {
    const noteStats = await page.evaluate(() => {
      const jobs = window.Astra.loadJobs().filter(j => j.status === 'Complete');
      let withCloseout = 0;
      let withVariance = 0;
      const variances = [];

      jobs.forEach(j => {
        const notes = j.notes || '';
        if (notes.includes('SUPERVISOR CLOSE-OUT')) {
          withCloseout++;
          const varianceMatch = notes.match(/VARIANCE:\s*\$(-?[\d.]+)/);
          if (varianceMatch) {
            withVariance++;
            variances.push(parseFloat(varianceMatch[1]));
          }
        }
      });

      const avgVariance = variances.length
        ? (variances.reduce((a, b) => a + b, 0) / variances.length).toFixed(2)
        : 'N/A';

      return { completed: jobs.length, withCloseout, withVariance, avgVariance };
    });

    console.log('   Close-out note stats:');
    console.log(`     Complete jobs: ${noteStats.completed}`);
    console.log(`     With close-out notes: ${noteStats.withCloseout}`);
    console.log(`     With variance data: ${noteStats.withVariance}`);
    console.log(`     Avg cost variance: $${noteStats.avgVariance}`);
    expect(noteStats.withCloseout).toBeGreaterThan(0);
  });

  test('verify archived jobs are properly flagged', async ({ page }) => {
    const archiveCheck = await page.evaluate(() => {
      const jobs = window.Astra.loadJobs();
      const archived = jobs.filter(j => j.archived);
      const completed = jobs.filter(j => j.status === 'Complete');
      const completedAndArchived = jobs.filter(j => j.status === 'Complete' && j.archived);
      return {
        total: jobs.length,
        archived: archived.length,
        completed: completed.length,
        completedAndArchived: completedAndArchived.length,
      };
    });

    console.log('   Archive stats:');
    console.log(`     Total jobs: ${archiveCheck.total}`);
    console.log(`     Archived: ${archiveCheck.archived}`);
    console.log(`     Complete: ${archiveCheck.completed}`);
    console.log(`     Complete + Archived: ${archiveCheck.completedAndArchived}`);
    expect(archiveCheck.completedAndArchived).toBeGreaterThan(0);
  });
});
