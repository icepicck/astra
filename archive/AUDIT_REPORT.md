# ASTRA Codebase Audit Report
**Auditor:** Claude Code | **Date:** 2026-03-27 | **Codebase Version:** v0.6

---

## 1. FILE STRUCTURE

ASTRA is NOT a single HTML file — it's a modular IIFE architecture. This is a deviation from what CLAUDE.md states, but the spirit is correct: no build tools, no frameworks, no npm at runtime.

| File | Role | Size |
|------|------|------|
| `index.html` | App shell — all HTML screens, all CSS, no JS | Large (~900 lines) |
| `app.js` | Core IIFE — data layer, navigation, ticket CRUD, settings, search, dashboard | ~1885 lines |
| `astra-estimates.js` | Estimates IIFE — builder, price book, intelligence engine, Phase B-D | ~1400 lines |
| `astra-materials.js` | Materials IIFE — catalog, picker, job materials, bulk templates | ~620 lines |
| `astra-maps.js` | Maps IIFE — Google Maps, Vector route, geocoding | ~200 lines |
| `astra-sync.js` | Sync IIFE — Supabase push/pull, realtime subscriptions | ~430 lines |
| `sw.js` | Service worker — cache-first for same-origin, network-first for external | ~62 lines |
| `manifest.json` | PWA manifest | Standard |
| `rough_materials.json` | 95 rough-in material items | Static JSON |
| `trim_materials.json` | 127 trim-out material items | Static JSON |

**Module communication pattern:** Each IIFE reads from `window.Astra` (set by `app.js`) and exposes its public functions on `window`. Clean separation. No circular dependencies.

---

## 2. DATA MODEL

### IndexedDB: `astra_db` (version 2)

| Store | Key | Contents |
|-------|-----|----------|
| `jobs` | `id` (UUID) | Tickets — address, types, status, materials[], photos[], drawings[], videos[], techId, notes, dates |
| `techs` | `id` (UUID) | Technicians — name, phone, license, active |
| `addresses` | `id` (UUID) | Properties — full address components, panel info, builder, subdivision, lat/lng, notes |
| `estimates` | `id` (UUID) | Estimates — address, customer info, materials[], labor, adjustments, status, linkedJobId |

### IndexedDB: `astra_media` (version 1)

| Store | Key | Contents |
|-------|-----|----------|
| `blobs` | `id` (UUID) | Binary media — photos, drawings, videos stored as raw blobs |

### localStorage

| Key | Contents |
|-----|----------|
| `astra_material_library_rough` | Rough-in material catalog (JSON) |
| `astra_material_library_trim` | Trim-out material catalog (JSON) |
| `astra_gmaps_key` | Google Maps API key |
| `astra_home_base` | Home base address for Vector routing |
| `astra_supabase_url` | Supabase project URL |
| `astra_supabase_key` | Supabase anon key |
| `astra_last_sync` | ISO timestamp of last sync |
| `astra_nav_frequency` | Screen visit counts for smart shortcuts |
| `astra_pricebook` | Estimate price book config (rates, markups, company info) |

**Key observation:** Settings and catalogs live in localStorage. Business data (jobs, estimates, addresses, techs) lives in IDB. Media blobs in a separate IDB database. This is a clean separation.

---

## 3. CORE FUNCTIONS MAP

### Data Layer (`app.js`)
- `_openAstraDB()` — Opens IDB connection, creates stores on upgrade
- `_idbPut()` / `_idbPutRetry()` / `_idbDelete()` / `_idbReplaceAll()` / `_idbGetAll()` — Granular IDB operations with failure recovery
- `initDataLayer()` — Loads from IDB, falls back to localStorage migration
- `loadJobs()` / `addJob()` / `updateJob()` / `getJob()` — Job CRUD (in-memory cache + IDB write-through)
- `loadAddresses()` / `addAddress()` / `updateAddress()` / `findOrCreateAddress()` — Address CRUD
- `loadTechs()` — Tech list
- `loadEstimates()` / `getEstimate()` / `saveEstimate()` / `deleteEstimate()` — Estimate CRUD

### Navigation (`app.js`)
- `goTo(screenId, jobId)` — Screen transitions with CSS opacity/visibility, pushState for back/forward
- `initScreen(screenId, jobId)` — Calls the appropriate render function per screen
- `renderShortcuts()` — Smart nav shortcuts based on usage frequency
- `toggleSidebar()` / `closeSidebar()` — Hamburger menu

### Ticket System (`app.js`)
- `renderJobList()` — Home screen, daily/weekly view with collapsible week headers
- `renderDetail(jobId)` — Full ticket detail with status, materials, photos, drawings, videos
- `saveNewTicket()` — Ticket creation with address autocomplete, job types, tech assignment
- `renderArchiveList()` — Archived tickets view
- `renderDashboard()` — Stats dashboard

### Estimator Engine (`astra-estimates.js`)
- `recalc(est)` — The crown jewel. Computes material subtotals, markup, labor, overhead, profit, tax, grand total
- `_captureFormState()` — Reads all DOM inputs back into state before any re-render
- `renderEstimateBuilder(estId)` — Full estimate builder with all sections
- `_refreshComputedFields()` — Partial DOM update for computed fields (no full re-render)
- `loadPricebook()` / `savePricebook()` — Price book config in localStorage
- `_generateEstimateHTML(est)` — Clean shareable HTML document
- `_estShare()` — Native share API with clipboard fallback
- `_renderIntelSection(est)` — Phase B intelligence (similar jobs, address history, property intel)
- `_renderComparison(est)` — Phase D estimated vs actual comparison
- `_estCreateTicket()` — Phase D ticket creation from estimate

### Materials (`astra-materials.js`)
- `renderMaterials()` — Material catalog browser with rough/trim toggle
- `openMatPicker(jobId)` — Full-screen material picker overlay with search, categories, variants
- `filterMatPicker()` — Search/filter with "previously at this address", "frequent", and bulk templates
- `renderJobMaterials(jobId)` — Material list on ticket detail with step qty, long-press delete
- `autoLoadBuiltInLibraries()` — Fetches JSON catalogs on first run

### Maps (`astra-maps.js`)
- `renderMap()` — Google Maps with job markers, status colors, route optimization
- `loadGmaps()` — Lazy-loads Google Maps API
- `gmapGeocode(address)` — Address to lat/lng

### Sync (`astra-sync.js`)
- `syncToCloud()` — Full push: addresses → techs → jobs → materials
- `syncFromCloud()` — Full pull with local-wins conflict resolution
- `startRealtime()` — Supabase realtime subscriptions for live cross-device sync
- `_handleRemoteChange()` — Processes realtime events with local-wins timestamp check

---

## 4. SUPABASE INTEGRATION

### Current Tables
| Table | Synced | Notes |
|-------|--------|-------|
| `jobs` | ✅ Push + Pull | Full sync with local-wins conflict resolution |
| `addresses` | ✅ Push + Pull | Full sync |
| `techs` | ✅ Push + Pull | Push works, pull has a workaround (pushes into array) |
| `materials` | ✅ Push + Pull | Delete-all + re-insert on push. Grouped by job_id on pull |
| `estimates` | ❌ NOT SYNCED | Saved locally only. No cloud backup. **KNOWN BUG from CLAUDE.md** |

### Auth Status
**No authentication exists.** Supabase is used with the anon key only. No user accounts, no sessions, no RLS. Anyone with the URL and key has full read/write access to all data. This is the single biggest gap for multi-user.

### Conflict Resolution
- **Local always wins** if local `updatedAt` is newer than cloud `updatedAt`
- Cloud wins only if cloud is strictly newer
- Realtime changes skip if a sync operation is in progress (`window._syncInProgress`)

---

## 5. SERVICE WORKER

- **Strategy:** Cache-first for same-origin assets, network-first with 3-second timeout for external
- **Cache name:** `astra-v50` (bumped with each deployment)
- **Cached assets:** `index.html`, all JS files, `manifest.json`, material JSONs, Supabase CDN
- **Update flow:** SW install → `skipWaiting()` → activate → `clients.claim()`. App detects `controllerchange` or `installed` state → auto-reload if idle, orange banner if busy
- **Icon cache:** Separate `astra-icons` cache preserved across updates

---

## 6. UI PATTERNS

- **SPA with show/hide screens** — `.screen` elements toggled via `.active` class with opacity transition
- **No hash routing** — Uses `history.pushState` for back/forward button support
- **Dynamic rendering** — Most screens render by building HTML strings and setting `innerHTML`
- **Event delegation** — Estimate builder uses capture-phase blur listener on container
- **Inline handlers** — Most click/blur handlers are inline `onclick`/`onblur` in generated HTML, calling functions exposed on `window`
- **Modals/overlays** — Material picker is a fixed overlay. Status picker is inline. No modal framework.
- **Toast notifications** — Auto-dismissing 3-second toasts, positioned top-center

---

## 7. STATE MANAGEMENT

```
User Action
    → In-memory cache (_cache.jobs, _cache.estimates, etc.)
    → IDB write-through (immediate, async)
    → UI re-render (from cache)
    → Sync to Supabase (background, when available)
```

**All reads are synchronous from the in-memory cache.** IDB is only read on app startup to hydrate the cache. After that, all CRUD goes to cache first, then IDB. This is fast.

**Risk:** If the app crashes between cache write and IDB write, data is lost. The retry mechanism on `_idbPut` mitigates this, but the window exists.

---

## 8. GOOGLE MAPS INTEGRATION

- **Lazy loaded** — Script tag injected only when Maps screen or address autocomplete is needed
- **Features used:** Maps JavaScript API, Places Autocomplete, Geocoding, Directions
- **API key:** Stored in localStorage, entered in Settings
- **Used in:** Vector screen (route optimization), ticket creation (address autocomplete), estimate builder (address autocomplete)
- **Bounds bias:** Houston area (29.5/-95.8 to 30.2/-95.0)

---

## 9. THE ESTIMATOR — DETAILED MAP

### Data Flow
```
User inputs (address, materials, labor, adjustments)
    → _captureFormState() reads all DOM inputs into est object
    → recalc(est) computes all derived values
    → _refreshComputedFields() updates readonly fields in-place
    → saveEstimate() persists to IDB (auto on blur)
```

### recalc() Engine
1. For each material: `lineTotal = (unitCost × qty) + (unitCost × qty × markup%)`
2. `materialSubtotal` = sum of all `(unitCost × qty)`
3. `materialMarkupTotal` = sum of all markup amounts
4. `laborTotal` = `laborHours × laborRate`
5. `subtotal` = materialSubtotal + materialMarkupTotal + laborTotal
6. `overheadAmount` = subtotal × overheadPercent
7. `profitAmount` = subtotal × profitPercent
8. `taxAmount` = (materialSubtotal + materialMarkupTotal) × taxRate (tax on materials only)
9. `grandTotal` = subtotal + overhead + profit + permitFee + tax

### Price Book
Lives in localStorage. Provides defaults for new estimates: labor rate, overhead%, profit%, material markup%, permit fee, tax rate. Also stores company info for estimate output.

### Intelligence (Phase B)
- `_querySimilarJobs(jobType)` — Finds all completed jobs with matching type, aggregates materials with average quantities
- `_queryAddressJobs(addressId)` — Finds all jobs at same address, returns materials with last-used quantities
- Property intelligence — Surfaces panel type, amp rating, breaker type, service type, builder from address record

### Feedback Loop (Phase D)
- `_estCreateTicket()` — Creates a job from an accepted estimate, links both ways
- `_renderComparison(est)` — Shows estimated vs actual materials in a comparison table
- `_renderAccuracyMetrics()` — Dashboard of estimate accuracy across all linked estimate-ticket pairs

---

## 10. RISKS & MULTI-USER READINESS

### 🔴 Critical — Must Fix for Multi-User

1. **No authentication.** Supabase is wide open with anon key. Anyone can read/write all data. This is Phase 1, priority #1.

2. **Sync pulls ALL data.** `syncFromCloud()` does `select('*')` on every table with no filters. Every device gets every record. This is where role-based sync filters go (tech sees own work, supervisor sees all).

3. **No `account_id` on any table.** Current schema has no concept of which shop/account owns a record. Multi-user requires `account_id` as a foreign key on jobs, addresses, techs, estimates, materials.

4. **No `assigned_to` / `created_by` on jobs.** `techId` exists but it's a name assignment, not a user auth ID. Multi-user needs proper user IDs linked to Supabase Auth.

5. **Estimates don't sync to Supabase.** `saveEstimate()` writes to IDB only. No cloud push/pull. Need to add estimate sync before multi-user or estimates are device-locked.

6. **Realtime has no auth gating.** `startRealtime()` subscribes to ALL changes on ALL tables. With multi-user, a tech's device would receive realtime updates for every job across the entire account. Need RLS + filtered subscriptions.

### 🟡 Moderate — Will Need Changes

7. **`_cache` is a global singleton.** The in-memory cache assumes one user's data. Multi-user on same device (supervisor logging in as different tech) would need cache invalidation on auth change.

8. **No ticket locking mechanism.** Two people can edit the same ticket simultaneously. Multi-user needs checkout semantics (lock on edit, 30-min timeout, force-unlock).

9. **Material sync is destructive.** Push does `DELETE all materials WHERE job_id IN (...)` then re-inserts. If two devices push simultaneously, one device's materials get nuked. Need a per-material sync strategy or last-write-wins with timestamps.

10. **`addJob()` uses `unshift()` — newest first.** This is fine for single-user, but multi-user sync could insert jobs out of order. Need sort-on-render, not insert-order.

11. **No `syncId` / `updated_at` on materials.** Individual materials within a job have no unique cloud ID. The current delete-all/re-insert strategy won't survive concurrent edits.

12. **Address matching is by normalized street string.** `findOrCreateAddress()` normalizes and compares. Two techs entering slightly different formats of the same address could create duplicates. Multi-user needs fuzzy address matching or geocode-based dedup.

### 🟢 Low Priority — Polish

13. **`hardReload()` is exposed on window.** Not a security issue but could be triggered accidentally in console.

14. **Error handler shows raw error messages.** `window.onerror` shows the error text to the user. Multi-user should sanitize these.

15. **Media blobs are device-local.** Photos/drawings/videos are in a local IDB database. They don't sync to Supabase. Multi-user means a supervisor can't see photos a tech took. Need Supabase Storage integration eventually.

16. **No retry queue for failed syncs.** If a push fails, the user has to manually retry. Should have a persistent queue that retries on reconnection.

---

## 11. SPECIFIC MULTI-USER FILTER POINTS

These are the exact lines that need role-based filtering in Phase 1:

| File | Line | Current | Needs |
|------|------|---------|-------|
| `astra-sync.js` | 231 | `select('*')` from addresses | `WHERE account_id = ?` |
| `astra-sync.js` | 250 | `select('*')` from techs | `WHERE account_id = ?` |
| `astra-sync.js` | 267 | `select('*')` from jobs | Tech: `WHERE assigned_to = ? OR created_by = ?` / Supervisor: `WHERE account_id = ?` |
| `astra-sync.js` | 271 | `select('*')` from materials | Filter by job scope (derived from job filter) |
| `astra-sync.js` | 347-355 | Realtime on ALL tables | RLS policies + filtered channels |
| `astra-sync.js` | 173 | Push ALL addresses | Only push owned/modified addresses |
| `astra-sync.js` | 181 | Push ALL jobs | Only push own jobs (tech) or all (supervisor) |

---

## 12. WHAT'S SOLID

The architecture is genuinely strong. Here's what doesn't need touching:

- **Offline-first is real.** IDB is source of truth. Network failures are invisible to the user. This works.
- **recalc() engine is correct.** Math is clean, no floating point issues beyond normal JS. The calculation chain is predictable.
- **In-memory cache pattern is fast.** All reads are synchronous. No async overhead on user interactions.
- **Screen transition system works.** Simple, no bugs, pushState for back/forward.
- **Material catalog is comprehensive.** 222 items across rough and trim. Searchable. Categorized.
- **Event delegation on estimate builder.** Single blur listener handles all inputs. Smart.
- **SW update mechanism.** Auto-reload when idle, banner when busy. Clean.
- **Local-wins conflict resolution.** Timestamp-based, simple, correct for the current use case.

---

## SUMMARY

ASTRA is a well-built offline-first PWA with a working estimator, job tracking, material catalog, and basic Supabase sync. The architecture is sound for single-user. The main gaps for multi-user are all predictable: auth, data isolation, sync filtering, and locking. None of these require architectural rewrites — they're additive.

The estimator is the best part of the app. The intelligence engine (similar jobs, address history, property intel) is unique and already feeding the cost intelligence flywheel. The feedback loop (estimated vs actual) closes the circle.

**Ready for Phase 1 when you give the word.**
