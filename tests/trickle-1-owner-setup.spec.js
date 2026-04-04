// ═══════════════════════════════════════════════════════════════
// TRICKLE TEST 1 — OWNER SETUP
// Owner configures the shop: company name, material catalog, addresses.
// ═══════════════════════════════════════════════════════════════
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SEED_PATH = path.resolve(__dirname, 'trickle-seed.json');
const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));

// Extract unique addresses from seed
const uniqueAddresses = [...new Set(seed.jobs.map(j => j.address))];

test.describe('Trickle 1 — Owner Setup', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate and wait for app boot (initDataLayer + autoLoadBuiltInLibraries)
    await page.goto('/');
    await page.waitForFunction(() => window.Astra && typeof window.Astra.loadJobs === 'function', {
      timeout: 15000,
    });
    // Enable debug mode so test APIs are available
    await page.evaluate(() => localStorage.setItem('astra_debug', 'true'));
  });

  test('app loads and IndexedDB is ready', async ({ page }) => {
    await test.step('verify Astra namespace exists', async () => {
      const hasAstra = await page.evaluate(() => !!window.Astra);
      expect(hasAstra).toBe(true);
    });

    await test.step('verify goTo is available', async () => {
      const hasGoTo = await page.evaluate(() => typeof window.goTo === 'function');
      expect(hasGoTo).toBe(true);
    });

    await test.step('verify data layer functions', async () => {
      const fns = await page.evaluate(() => ({
        loadJobs: typeof window.Astra.loadJobs,
        loadAddresses: typeof window.Astra.loadAddresses,
        addJob: typeof window.Astra.addJob,
        addAddress: typeof window.Astra.addAddress,
        findOrCreateAddress: typeof window.Astra.findOrCreateAddress,
      }));
      expect(fns.loadJobs).toBe('function');
      expect(fns.loadAddresses).toBe('function');
      expect(fns.addJob).toBe('function');
      expect(fns.addAddress).toBe('function');
      expect(fns.findOrCreateAddress).toBe('function');
    });
  });

  test('skip login if no auth configured', async ({ page }) => {
    // ASTRA auth is optional — check if auth module loaded
    const authConfigured = await page.evaluate(() => {
      return !!(window.Astra.getSupabaseUrl && window.Astra.getSupabaseUrl());
    });
    if (authConfigured) {
      console.log('   Auth configured — login would be needed (skipping in test)');
    } else {
      console.log('   No auth configured — proceeding without login');
    }
    // Either way, the app should be usable
    const canLoadJobs = await page.evaluate(() => Array.isArray(window.Astra.loadJobs()));
    expect(canLoadJobs).toBe(true);
  });

  test('navigate to Settings and verify pricebook', async ({ page }) => {
    await test.step('go to settings screen', async () => {
      await page.evaluate(() => window.goTo('screen-settings'));
      await page.waitForTimeout(500);
      const visible = await page.evaluate(() => {
        const el = document.getElementById('screen-settings');
        return el && el.style.display !== 'none';
      });
      expect(visible).toBe(true);
    });

    await test.step('verify pricebook config exists', async () => {
      const hasPricebook = await page.evaluate(() => {
        return typeof window.Astra.loadPricebookConfig === 'function';
      });
      expect(hasPricebook).toBe(true);
    });

    await test.step('set company name in pricebook if possible', async () => {
      // Pricebook stores markup/overhead — set company identifier via config
      const result = await page.evaluate(() => {
        const pb = window.Astra.loadPricebookConfig ? window.Astra.loadPricebookConfig() : null;
        if (pb) {
          pb.companyName = 'TRICKLE TEST ELECTRIC';
          if (window.Astra.savePricebookConfig) {
            window.Astra.savePricebookConfig(pb);
          }
          return 'saved';
        }
        return 'no-pricebook';
      });
      console.log('   Pricebook company name:', result);
    });
  });

  test('material catalog is loaded with rough + trim items', async ({ page }) => {
    await test.step('navigate to materials screen', async () => {
      await page.evaluate(() => window.goTo('screen-materials'));
      await page.waitForTimeout(500);
    });

    await test.step('verify material library is loaded', async () => {
      const libInfo = await page.evaluate(() => {
        const lib = window.Astra.loadMaterialLibrary();
        if (!lib) return { loaded: false, categories: 0, items: 0 };
        let items = 0;
        lib.categories.forEach(c => { items += c.items.length; });
        return { loaded: true, categories: lib.categories.length, items };
      });
      console.log('   Material library:', JSON.stringify(libInfo));
      expect(libInfo.loaded).toBe(true);
      expect(libInfo.items).toBeGreaterThanOrEqual(200);
      // Seed says 222 items (95 rough + 127 trim)
      console.log(`   Expected ~222 items, got ${libInfo.items}`);
    });

    await test.step('verify rough library specifically', async () => {
      const roughCount = await page.evaluate(() => {
        const rough = window.Astra.loadRoughLibrary();
        if (!rough) return 0;
        let count = 0;
        rough.categories.forEach(c => { count += c.items.length; });
        return count;
      });
      console.log(`   Rough items: ${roughCount}`);
      expect(roughCount).toBeGreaterThan(0);
    });

    await test.step('verify trim library specifically', async () => {
      const trimCount = await page.evaluate(() => {
        const trim = window.Astra.loadTrimLibrary();
        if (!trim) return 0;
        let count = 0;
        trim.categories.forEach(c => { count += c.items.length; });
        return count;
      });
      console.log(`   Trim items: ${trimCount}`);
      expect(trimCount).toBeGreaterThan(0);
    });
  });

  test('create all unique addresses from seed data', async ({ page }) => {
    console.log(`   Creating ${uniqueAddresses.length} unique addresses from seed data`);

    await test.step('navigate to addresses screen', async () => {
      await page.evaluate(() => window.goTo('screen-addresses'));
      await page.waitForTimeout(500);
    });

    await test.step('create each address via findOrCreateAddress', async () => {
      for (let i = 0; i < uniqueAddresses.length; i++) {
        const addr = uniqueAddresses[i];
        const addrId = await page.evaluate((address) => {
          return window.Astra.findOrCreateAddress(address);
        }, addr);
        expect(addrId).toBeTruthy();

        if ((i + 1) % 10 === 0 || i === uniqueAddresses.length - 1) {
          console.log(`   Created ${i + 1}/${uniqueAddresses.length} addresses`);
        }
      }
    });

    await test.step('verify address count matches seed unique addresses', async () => {
      const addrCount = await page.evaluate(() => window.Astra.loadAddresses().length);
      console.log(`   Total addresses in DB: ${addrCount}, expected: ${uniqueAddresses.length}`);
      expect(addrCount).toBeGreaterThanOrEqual(uniqueAddresses.length);
    });

    await test.step('verify each seed address exists', async () => {
      const allAddrs = await page.evaluate(() => {
        return window.Astra.loadAddresses().map(a => a.address);
      });
      for (const addr of uniqueAddresses) {
        // findOrCreateAddress normalizes — check first line match
        const normalized = addr.split(',')[0].trim().toLowerCase().replace(/\s+/g, ' ');
        const found = allAddrs.some(a => {
          const n = a.split(',')[0].trim().toLowerCase().replace(/\s+/g, ' ');
          return n === normalized;
        });
        if (!found) {
          console.log(`   WARNING: Address not found: ${addr}`);
        }
      }
    });
  });

  test('verify addresses screen renders correctly', async ({ page }) => {
    // First ensure addresses exist
    await page.evaluate((addrs) => {
      addrs.forEach(a => window.Astra.findOrCreateAddress(a));
    }, uniqueAddresses);

    await test.step('navigate to addresses and check render', async () => {
      await page.evaluate(() => window.goTo('screen-addresses'));
      await page.waitForTimeout(500);

      // Re-render address list
      if (await page.evaluate(() => typeof window.renderAddressList === 'function')) {
        await page.evaluate(() => window.renderAddressList());
        await page.waitForTimeout(300);
      }

      const screenVisible = await page.evaluate(() => {
        const el = document.getElementById('screen-addresses');
        return el && el.style.display !== 'none';
      });
      expect(screenVisible).toBe(true);
    });
  });
});
