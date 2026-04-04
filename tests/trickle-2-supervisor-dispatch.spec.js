// ═══════════════════════════════════════════════════════════════
// TRICKLE TEST 2 — SUPERVISOR DISPATCH
// Supervisor creates and dispatches all 55 jobs from the seed dataset.
// Uses page.evaluate() to call Astra.addJob() directly for speed.
// ═══════════════════════════════════════════════════════════════
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SEED_PATH = path.resolve(__dirname, 'trickle-seed.json');
const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));

// Sort jobs chronologically by date_created
const jobsSorted = [...seed.jobs].sort((a, b) =>
  new Date(a.date_created).getTime() - new Date(b.date_created).getTime()
);

// Map seed tech IDs to display names
const TECH_MAP = {
  tech_carlos: 'Carlos',
  tech_james: 'James',
  tech_rachel: 'Rachel',
};

// Map seed categories to ASTRA chip labels (ALL CAPS, spaces for display)
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

test.describe('Trickle 2 — Supervisor Dispatch', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.Astra && typeof window.Astra.loadJobs === 'function', {
      timeout: 15000,
    });
    // Enable debug mode
    await page.evaluate(() => localStorage.setItem('astra_debug', 'true'));
    // Wait for material libraries to load
    await page.waitForFunction(() => {
      const lib = window.Astra.loadMaterialLibrary();
      return lib && lib.categories && lib.categories.length > 0;
    }, { timeout: 10000 });
  });

  test('ensure addresses exist before creating jobs', async ({ page }) => {
    const uniqueAddresses = [...new Set(seed.jobs.map(j => j.address))];
    const created = await page.evaluate((addrs) => {
      let count = 0;
      addrs.forEach(a => {
        const id = window.Astra.findOrCreateAddress(a);
        if (id) count++;
      });
      return count;
    }, uniqueAddresses);
    console.log(`   Ensured ${created} addresses exist`);
    expect(created).toBe(uniqueAddresses.length);
  });

  test('ensure techs exist before creating jobs', async ({ page }) => {
    const techCount = await page.evaluate((techMap) => {
      const existing = window.Astra.loadTechs();
      let added = 0;
      Object.entries(techMap).forEach(([id, name]) => {
        if (!existing.find(t => t.name === name)) {
          window.Astra.addTech({ id: crypto.randomUUID(), name });
          added++;
        }
      });
      return window.Astra.loadTechs().length;
    }, TECH_MAP);
    console.log(`   Tech roster: ${techCount} techs`);
    expect(techCount).toBeGreaterThanOrEqual(3);
  });

  test('create all 55 jobs from seed data in chronological order', async ({ page }) => {
    const jobCount = jobsSorted.length;
    console.log(`   Creating ${jobCount} jobs from seed data`);

    // Record starting job count
    const startCount = await page.evaluate(() => window.Astra.loadJobs().length);

    // Batch insert jobs using page.evaluate for speed
    // Process in chunks of 10 to avoid timeout and log progress
    const BATCH_SIZE = 10;
    for (let batch = 0; batch < Math.ceil(jobCount / BATCH_SIZE); batch++) {
      const start = batch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, jobCount);
      const batchJobs = jobsSorted.slice(start, end);

      await test.step(`create jobs ${start + 1}-${end}`, async () => {
        const results = await page.evaluate(({ jobs, catMap, techMap }) => {
          const created = [];
          for (const seedJob of jobs) {
            // Resolve address ID
            const addressId = window.Astra.findOrCreateAddress(seedJob.address);

            // Map category to ASTRA type label
            const typeLabel = catMap[seedJob.category] || seedJob.category.toUpperCase().replace(/_/g, ' ');

            // Map tech
            const techName = techMap[seedJob.assigned_to] || seedJob.assigned_to;

            // Build materials array
            const materials = (seedJob.materials || []).map(m => ({
              materialId: crypto.randomUUID(),
              itemId: m.itemId,
              name: m.name,
              qty: m.qty,
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

            // Build the ASTRA job object
            const job = {
              id: crypto.randomUUID(),
              syncId: crypto.randomUUID(),
              address: seedJob.address,
              addressId: addressId,
              types: [typeLabel],
              status: seedJob.status === 'completed' ? 'Complete'
                    : seedJob.status === 'in_progress' ? 'In Progress'
                    : 'Not Started',
              date: seedJob.date_created,
              notes: seedJob.notes || '',
              techNotes: '',
              techId: '',
              techName: techName,
              materials: [...materials, ...customMats],
              photos: [],
              drawings: [],
              videos: [],
              archived: seedJob.status === 'completed',
              createdAt: new Date(seedJob.date_created + 'T08:00:00').toISOString(),
              updatedAt: new Date().toISOString(),
            };

            // If completed, add labor info to notes
            if (seedJob.labor_hours) {
              job.notes += '\nLABOR: ' + seedJob.labor_hours + ' HRS';
            }
            if (seedJob.actual_cost) {
              job.notes += '\nACTUAL COST: $' + seedJob.actual_cost.toFixed(2);
            }
            if (seedJob.date_completed) {
              job.completedDate = seedJob.date_completed;
            }

            window.Astra.addJob(job);
            created.push({ id: job.id, category: seedJob.category, address: seedJob.address.split(',')[0] });
          }
          return created;
        }, { jobs: batchJobs, catMap: CATEGORY_MAP, techMap: TECH_MAP });

        console.log(`   Batch ${batch + 1}: created ${results.length} jobs (${start + 1}-${end})`);
      });
    }

    // Verify total count
    await test.step('verify job count', async () => {
      const endCount = await page.evaluate(() => window.Astra.loadJobs().length);
      const added = endCount - startCount;
      console.log(`   Total jobs added: ${added}, DB total: ${endCount}`);
      expect(added).toBe(jobCount);
    });
  });

  // Merged verification into single-context test so IDB data persists
  test('create jobs then verify category distribution and materials', async ({ page }) => {
    // Re-seed addresses + jobs if DB is empty (handles fresh context)
    const existingCount = await page.evaluate(() => window.Astra.loadJobs().length);
    if (existingCount < 55) {
      // Seed addresses
      const uniqueAddrs = [...new Set(seed.jobs.map(j => j.address))];
      await page.evaluate((addrs) => {
        addrs.forEach(a => window.Astra.findOrCreateAddress(a));
      }, uniqueAddrs);

      // Seed all jobs
      await page.evaluate(({ jobs, catMap, techMap }) => {
        for (const seedJob of jobs) {
          const addressId = window.Astra.findOrCreateAddress(seedJob.address);
          const typeLabel = catMap[seedJob.category] || seedJob.category.toUpperCase().replace(/_/g, ' ');
          const techName = techMap[seedJob.assigned_to] || seedJob.assigned_to;
          const materials = (seedJob.materials || []).map(m => ({
            materialId: crypto.randomUUID(), itemId: m.itemId, name: m.name,
            qty: m.qty, unit: m.unit || 'EA',
            unitPrice: window.Astra.getEffectivePrice(m.itemId) || 0,
          }));
          const customMats = (seedJob.custom_materials || []).map(m => ({
            materialId: crypto.randomUUID(), itemId: '', name: m.name,
            qty: m.qty, unit: m.unit || 'EA', unitPrice: m.unitPrice || 0, custom: true,
          }));
          const job = {
            id: crypto.randomUUID(), syncId: crypto.randomUUID(),
            address: seedJob.address, addressId, types: [typeLabel],
            status: seedJob.status === 'completed' ? 'Complete' : seedJob.status === 'in_progress' ? 'In Progress' : 'Not Started',
            date: seedJob.date_created, notes: seedJob.notes || '', techNotes: '',
            techId: '', techName: techName,
            materials: [...materials, ...customMats],
            photos: [], drawings: [], videos: [], archived: seedJob.status === 'completed',
            createdAt: new Date(seedJob.date_created + 'T08:00:00').toISOString(),
            updatedAt: new Date().toISOString(),
          };
          if (seedJob.labor_hours) job.notes += '\nLABOR: ' + seedJob.labor_hours + ' HRS';
          if (seedJob.actual_cost) job.notes += '\nACTUAL COST: $' + seedJob.actual_cost.toFixed(2);
          if (seedJob.date_completed) job.completedDate = seedJob.date_completed;
          window.Astra.addJob(job);
        }
      }, { jobs: jobsSorted, catMap: CATEGORY_MAP, techMap: TECH_MAP });
    }

    // Verify categories
    await test.step('verify category distribution', async () => {
      const jobsByCategory = await page.evaluate(() => {
        const jobs = window.Astra.loadJobs();
        const cats = {};
        jobs.forEach(j => { if (j.types && j.types.length > 0) cats[j.types[0]] = (cats[j.types[0]] || 0) + 1; });
        return cats;
      });
      console.log('   Jobs by category:');
      for (const [cat, count] of Object.entries(jobsByCategory)) console.log(`     ${cat}: ${count}`);
      expect(Object.keys(jobsByCategory).length).toBeGreaterThanOrEqual(5);
    });

    // Verify materials
    await test.step('verify materials attached', async () => {
      const matStats = await page.evaluate(() => {
        const jobs = window.Astra.loadJobs();
        let withMats = 0, totalMats = 0, maxMats = 0;
        jobs.forEach(j => { if (j.materials && j.materials.length > 0) { withMats++; totalMats += j.materials.length; maxMats = Math.max(maxMats, j.materials.length); } });
        return { total: jobs.length, withMats, totalMats, maxMats, avgMats: withMats ? (totalMats / withMats).toFixed(1) : 0 };
      });
      console.log('   Material stats:');
      console.log(`     Jobs with materials: ${matStats.withMats}/${matStats.total}`);
      console.log(`     Total material line items: ${matStats.totalMats}`);
      console.log(`     Avg materials per job: ${matStats.avgMats}`);
      console.log(`     Max materials on a job: ${matStats.maxMats}`);
      expect(matStats.withMats).toBeGreaterThan(0);
      expect(matStats.totalMats).toBeGreaterThan(100);
    });
  });
});
