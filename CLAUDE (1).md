# CLAUDE.md — ASTRA STANDING ORDERS v3

**This document is the single source of truth for all development on ASTRA.**

**Read this entire file before touching anything. If ANY other document in this repository contradicts what is written here — this document wins. No exceptions.**

---

## STANDING ORDER: DOCUMENTATION CLEANUP

Before beginning any development work, execute the following:

1. Search the repository for any README, ARCHITECTURE.md, CONTRIBUTING.md, NOTES.md, TODO.md, or any other documentation files.
2. If any such document contains statements that contradict this CLAUDE.md — delete the contradicting statements or delete the file entirely.
3. The ASTRA_Complete_Vision.md is a historical reference document. It contains the original thinking. Where it conflicts with this document, THIS document is authoritative. Do not modify the vision doc — it's an archive. But do not follow it where it diverges from what's written here.
4. If you encounter inline code comments that contradict the architecture described here (e.g., comments referencing "single HTML file" or outdated sync behavior), update those comments to reflect reality.

**The goal: zero contradictions anywhere in the repo. One truth. This file.**

---

## WHAT IS ASTRA

ASTRA is a cost intelligence engine for electrical contractors. It tracks jobs because job tracking is how it learns what things actually cost. Every logged job feeds back into the estimator. Every material used at an address becomes historical data. Every quote improves the next one.

**ASTRA is NOT a job tracker that added quoting. The estimator is the core product. Job tracking is the data acquisition layer.**

The target user is solo electricians and small shops (1-6 techs) who bleed margin because they don't have historical cost data, material pricing consistency, quick quoting workflows, or address-level intelligence.

**The product moment everything builds toward:** A supervisor pulls up a new job at an address the shop has serviced before. ASTRA says "last time we were here, it was 3 breakers, 50 feet of 12/2, took 4.5 hours." The estimate writes itself. That moment is the word-of-mouth trigger. Every architectural decision exists to make that moment faster, more accurate, and more reliable over time.

---

## ARCHITECTURE CONSTRAINTS — NON-NEGOTIABLE

**1. No frameworks. No build step. No package manager.**
ASTRA uses vanilla HTML, CSS, and JavaScript. No React, Vue, Angular, Svelte, or anything else. No webpack, vite, rollup, esbuild. No npm, yarn, pnpm. No node_modules. If you are tempted to introduce any of these — stop. That impulse is wrong here.

**2. Offline-first by default.**
Local state is ALWAYS canonical. IndexedDB is the source of truth. Supabase is cloud backup. The app must function with zero network connectivity indefinitely. Connection drops mid-job? Doesn't matter. Everything's already local. Sync happens in the background when connection is available.

**3. No runtime dependencies.**
Zero external JS libraries loaded at runtime except: Google Maps API (for address features) and the Supabase client library (for cloud sync). These are the only two exceptions and no others will be added.

**4. PWA with Service Worker.**
The app caches itself on first visit. Subsequent visits load from cache. The service worker handles cache management and will handle background sync (once built). The app can be added to home screen.

---

## ACTUAL FILE STRUCTURE (As Of v0.6)

The original vision document describes "a single HTML file." That is no longer accurate. The app has evolved into a modular IIFE architecture. The philosophy is intact — no build tools, no frameworks, no npm — but the files are separated for maintainability.

```
index.html              — App shell: all HTML screens, all CSS, no JS (~900 lines)
app.js                  — Core IIFE: data layer, navigation, ticket CRUD, settings,
                          search, dashboard, media handling (~1885 lines)
astra-estimates.js      — Estimates IIFE: builder, price book, intelligence engine,
                          recalc(), Phase B-D (~1400 lines)
astra-materials.js      — Materials IIFE: catalog browser, picker, job materials,
                          bulk templates, frequent flyers (~620 lines)
astra-maps.js           — Maps IIFE: Google Maps, Vector route, geocoding (~200 lines)
astra-sync.js           — Sync IIFE: Supabase push/pull, realtime subscriptions (~430 lines)
sw.js                   — Service worker: cache-first same-origin, network-first
                          external, 3s timeout (~62 lines)
manifest.json           — PWA manifest
rough_materials.json    — Rough-in material catalog (95 items)
trim_materials.json     — Trim-out material catalog (127 items)
serve.js                — Dev server (not deployed)
stress-test.js          — Integration tests (not deployed)
```

**Module communication pattern:** Each IIFE reads from `window.Astra` (set by `app.js`) and exposes its public functions on `window`. Clean separation. No circular dependencies.

---

## DATA MODEL (Confirmed by Audit)

### IndexedDB: `astra_db` (version 2)

| Store | Key | Contents |
|-------|-----|----------|
| `jobs` | `id` (UUID) | Tickets — address, types[], status, materials[], photos[], drawings[], videos[], techId, techName, notes, techNotes, dates, archived, addressId, manually_added_to_vector |
| `techs` | `id` (UUID) | Technicians — name (and eventually phone, license, active) |
| `addresses` | `id` (UUID) | Properties — full address, builder, subdivision, panel info (type, amp, breaker, service, location), lat/lng, notes |
| `estimates` | `id` (UUID) | Estimates — address, customer info, materials[], labor, adjustments, overhead, profit, tax, status, linkedJobId |

### IndexedDB: `astra_media` (version 1)

| Store | Key | Contents |
|-------|-----|----------|
| `blobs` | `id` (UUID) | Binary media — photos, drawings, videos as raw blobs |

### localStorage (Settings & Catalogs Only)

| Key | Contents | Future Plan |
|-----|----------|-------------|
| `astra_material_library_rough` | Rough-in material catalog JSON | **MIGRATE TO IDB** (see Step 3) |
| `astra_material_library_trim` | Trim-out material catalog JSON | **MIGRATE TO IDB** (see Step 3) |
| `astra_pricebook` | Price book config (rates, markups, company info) | **MIGRATE TO IDB** (see Step 3) |
| `astra_gmaps_key` | Google Maps API key | Stays (small, settings) |
| `astra_home_base` | Home base address for Vector routing | Stays (small, settings) |
| `astra_supabase_url` | Supabase project URL | Stays (requires RLS verification) |
| `astra_supabase_key` | Supabase anon key | Stays (public by Supabase design, BUT requires RLS) |
| `astra_last_sync` | ISO timestamp of last sync | Stays |
| `astra_nav_frequency` | Screen visit counts for smart shortcuts | Stays |

**Key principle:** Business data lives in IndexedDB. Settings and small config values live in localStorage. The material library and price book are business data that currently violate this principle — they need to move.

---

## WHAT'S BUILT AND WORKING (v0.6 — Confirmed by Audit)

### Core Systems — Solid, Don't Touch Unless Fixing a Listed Bug
- **Estimator engine** — `recalc()` computes material subtotals, markup, labor, overhead, profit, tax, grand total. Math is clean. Event delegation via capture-phase blur listener. Auto-save on blur. This is the crown jewel.
- **Estimator intelligence (Phase B)** — `_querySimilarJobs()` finds completed jobs with matching type. `_queryAddressJobs()` finds all jobs at same address. Property intel surfaces panel type, amp rating, breaker type from address record. The flywheel is already spinning.
- **Estimator feedback loop (Phase D)** — `_estCreateTicket()` creates a job from an accepted estimate with bidirectional linking. `_renderComparison()` shows estimated vs actual. `_renderAccuracyMetrics()` provides accuracy dashboard. The loop is closed.
- **Job/ticket CRUD** — Create, edit, view, archive, unarchive. In-memory cache with IDB write-through.
- **Material catalog** — 222 items across rough-in and trim-out. Searchable. Categorized. Variant support (Toggle/Decora, breaker brands) with part ref tracking.
- **Material tracking by address** — "Previously at this address" surfaces materials from prior jobs. Frequent flyers auto-surface top 10 most-used. Bulk templates for rough-in and trim-out starters.
- **Address database** — Full property intelligence fields (builder, subdivision, panel type, amp rating, breaker type, service type, panel location, notes). Google Maps geocoding for lat/lng.
- **In-memory cache pattern** — All reads synchronous from `_cache`. IDB is write-through. Fast. Correct.
- **Service worker** — Cache-first same-origin, network-first external with 3s timeout. Version-bumped cache. Auto-reload when idle, orange banner when busy. Separate icon cache preserved across updates.
- **Navigation** — SPA with show/hide screens. `history.pushState` for back/forward. Smart shortcuts based on usage frequency. Sidebar nav.
- **Media handling** — Photos, drawings (including PDFs), videos stored in separate IDB. Fullscreen viewer with pinch-to-zoom. Video capped at 50MB.
- **Export/import** — JSON backup with validation on import. Checks for required fields. Confirmation before replacing data.
- **Stress tests** — `stress-test.js` covers offline editing, sync spam, photo attachment integrity, cache-vs-IDB consistency.

### Supabase Sync — Working But Has Known Issues (See Defects List)
- **Push** — Addresses → Techs → Jobs → Materials. Batch upsert with `onConflict: 'id'`.
- **Pull** — Full pull with local-wins conflict resolution (timestamp-based).
- **Realtime** — Supabase realtime subscriptions for live cross-device sync. Skips if sync is in progress.
- **Manual trigger** — Push and Pull are button presses on the Settings screen. No automatic background sync yet.

---

## CONFIRMED DEFECTS — RANKED BY SEVERITY

These defects were identified independently by two separate audits. Where both audits flagged the same issue, it is marked as **CONFIRMED BY BOTH**. Each defect has a concrete resolution and is assigned to a step in the execution sequence.

### CRITICAL — Data Loss or Security Risk

**D1. Estimates do not sync to Supabase.** *(CONFIRMED BY BOTH)*
The most valuable data in the system has no cloud backup. `saveEstimate()` writes to IDB only. If the device is lost, wiped, or the browser clears IDB under storage pressure, all estimates are gone. No recovery.
→ **Resolution:** Add estimate sync using the same pattern as jobs. Push on save, pull on sync. Add `estimates` table to Supabase schema if not present.
→ **Assigned to:** Step 1

**D2. Push sync can silently overwrite newer cloud data.** *(Flagged by QA audit)*
`syncToCloud()` does batch upsert with `onConflict: 'id'`. No timestamp check on push. If Device A pushes a stale local copy, it overwrites Device B's newer edits in the cloud. No error. No warning. Silent data regression.
→ **Resolution:** Add `updated_at` comparison on push. Either use a Supabase database function that rejects stale writes, or compare timestamps client-side before pushing and skip records where cloud is newer.
→ **Assigned to:** Step 1

**D3. Material sync does destructive delete-and-rebuild on every push.** *(CONFIRMED BY BOTH)*
Every push deletes ALL materials for every local job ID, then re-inserts from scratch. Creates a window where materials are deleted but not yet re-inserted. If the browser crashes or network drops mid-push, jobs in the cloud have no materials. Scales catastrophically — a shop with 500 jobs does 5,000+ DELETE/INSERT operations on every sync.
→ **Resolution:** Switch to per-material upsert with unique IDs. Add a `material_id` (UUID) to each material record. Upsert on sync instead of nuke-and-rebuild.
→ **Assigned to:** Step 1

**D4. No authentication. Supabase is wide open.** *(CONFIRMED BY BOTH)*
No Supabase Auth. No user accounts. No sessions. No Row Level Security. Anyone with the project URL and anon key (which are in localStorage as plaintext) has full read/write access to all data in all tables. The anon key is designed to be public, but only if RLS policies are in place. If RLS is not configured, the entire database is exposed.
→ **Resolution:** Verify RLS status immediately. If not enabled, enable it before any new data enters the system. Full auth implementation is Step 4.
→ **Assigned to:** Step 2 (RLS verification), Step 4 (full auth)

**D5. No `account_id` on any Supabase table.** *(Flagged by Code audit)*
Current cloud schema has no concept of which shop owns a record. Multi-user requires `account_id` as a foreign key on jobs, addresses, techs, estimates, and materials to isolate shops from each other.
→ **Resolution:** Schema migration to add `account_id` column to all tables. Backfill existing records with a default account ID.
→ **Assigned to:** Step 4

### HIGH — Architectural Gaps

**D6. Sync pulls ALL data with no filters.** *(CONFIRMED BY BOTH)*
`syncFromCloud()` does `select('*')` on every table. Every device gets every record. No role-based filtering. No account-based filtering.
Specific lines in `astra-sync.js` that need filters:
- Line ~231: `select('*')` from addresses → needs `WHERE account_id = ?`
- Line ~250: `select('*')` from techs → needs `WHERE account_id = ?`
- Line ~267: `select('*')` from jobs → Tech: `WHERE assigned_to = ? OR created_by = ?` / Supervisor: `WHERE account_id = ?`
- Line ~271: `select('*')` from materials → derived from job filter scope
- Lines ~347-355: Realtime subscriptions on ALL tables → needs RLS + filtered channels
- Line ~173: Push ALL addresses → needs account scoping
- Line ~181: Push ALL jobs → needs role-based scoping
→ **Resolution:** Implement role-based sync filters. The sync filter IS the security model — data that isn't downloaded cannot be accessed.
→ **Assigned to:** Step 5

**D7. Realtime subscriptions have no auth gating.** *(Flagged by Code audit)*
`startRealtime()` subscribes to ALL changes on ALL tables. With multi-user, every device receives every update for every job across the entire system. Needs RLS policies to filter realtime events.
→ **Resolution:** Implement alongside D6. RLS policies on Supabase tables will automatically filter realtime subscriptions.
→ **Assigned to:** Step 5

**D8. No automatic background sync.** *(Flagged by QA audit)*
Sync is manual — user clicks "PUSH TO CLOUD" or "PULL FROM CLOUD" in Settings. There is no automatic sync on save, no retry queue for failed pushes, no Background Sync API integration. The ASTRA vision document and previous CLAUDE.md versions described automatic background sync that does not exist.
→ **Resolution:** Implement auto-push on data changes (debounced). Add persistent retry queue for failed syncs. Eventually integrate Background Sync API in service worker.
→ **Assigned to:** Step 2

**D9. Global error handler shows all errors to users as red toasts.** *(Flagged by QA audit, underweighted by Code audit)*
`window.onerror` and `unhandledrejection` handler show raw error text to the user via red toast. This includes network timeouts, Supabase connection failures, Google Maps API hiccups — all of which are irrelevant to a tech logging materials. Violates the core principle: "the user never sees an error because the cloud is unreachable."
→ **Resolution:** Categorize errors. Network/sync errors → silent (console log + sync status indicator). Data layer errors → silent retry with console log. Only errors that directly affect the user's current action should toast. Never interrupt field work with infrastructure noise.
→ **Assigned to:** Step 2

### MODERATE — Will Need Changes for Multi-User

**D10. `_cache` is a global singleton.** *(Flagged by Code audit)*
In-memory cache assumes one user's data. If multi-user ever supports supervisor logging in as a different role on the same device, cache needs invalidation on auth change.
→ **Resolution:** Add cache clear on auth state change. Rebuild cache from IDB after login/logout.
→ **Assigned to:** Step 5

**D11. `addJob()` uses `unshift()` — newest first by insert order.** *(Flagged by Code audit)*
Single-user is fine. Multi-user sync inserts jobs in unpredictable order. Job list display must sort on render, not rely on array position.
→ **Resolution:** Sort jobs by `date` (or `updatedAt`) at render time. Never rely on `_cache.jobs` array order for display.
→ **Assigned to:** Step 3

**D12. Address matching could create duplicates in multi-user.** *(Flagged by Code audit)*
`findOrCreateAddress()` normalizes and compares street strings. Two techs entering slightly different formats of the same address create duplicate properties. This pollutes address-level intelligence — the core differentiator.
→ **Resolution:** Fuzzy address matching using geocode proximity (lat/lng within threshold) plus normalized string comparison. Flag near-duplicates for supervisor resolution.
→ **Assigned to:** Step 6

**D13. No ticket locking mechanism.** *(Flagged by Code audit)*
Two people can edit the same ticket simultaneously. Multi-user needs checkout semantics.
→ **Resolution:** Lock on edit, release on save or 30-minute timeout. Supervisor force-unlock. Write protection at Supabase level: `UPDATE ... WHERE locked_by = current_user_id`.
→ **Assigned to:** Step 5

**D14. Individual materials have no unique cloud ID.** *(Flagged by Code audit)*
Materials within a job have no `material_id` for cloud sync. Current delete-all/re-insert strategy won't survive concurrent edits from multiple devices.
→ **Resolution:** Add UUID to each material record. Use for upsert sync. Related to D3.
→ **Assigned to:** Step 1 (alongside D3 fix)

### LOW — Polish and Hygiene

**D15. Material library and price book live in localStorage.** *(Flagged by QA audit)*
localStorage has ~5MB limit. Material catalog + price book are business data that should be in IDB. Risk grows as catalog grows (custom materials, price history).
→ **Resolution:** Migrate to IDB with same cache pattern as jobs/estimates.
→ **Assigned to:** Step 3

**D16. `confirm()` dialogs are blocking and hostile on mobile.** *(Flagged by QA audit)*
Browser-native `confirm()` halts the JS thread. Ugly, inconsistent across devices, small buttons. Inconsistent with the 48px-tap-target field-grade UX standard.
→ **Resolution:** Custom confirmation modals with 48px buttons. Or swipe-to-confirm / press-and-hold for destructive actions.
→ **Assigned to:** Step 6

**D17. Vector board midnight clear only runs on app init.** *(Flagged by QA audit)*
If the app stays open past midnight (common — techs leave apps open for days), vector board doesn't clear until next full reload.
→ **Resolution:** Check on every `goTo('screen-vector')` navigation, or set a `setTimeout` to fire at midnight.
→ **Assigned to:** Step 3

**D18. Media blobs are device-local only.** *(Flagged by Code audit)*
Photos, drawings, videos don't sync to Supabase. Supervisor can't see photos a tech took. Needs Supabase Storage integration eventually.
→ **Resolution:** Future — Supabase Storage for media blobs. Not blocking for multi-user MVP.
→ **Assigned to:** Step 7 (Future)

**D19. Hardcoded "Mike Torres" tech name on fresh install.** *(Flagged by QA audit)*
Every fresh install seeds a tech named "Mike Torres." Confusing for new shops.
→ **Resolution:** Either prompt for first tech name on initial setup, or seed with "DEFAULT TECH" that the user renames.
→ **Assigned to:** Step 3

**D20. Supabase client library loaded from unpinned CDN.** *(Flagged by QA audit)*
`@supabase/supabase-js@2` on jsDelivr — unpinned minor/patch version. Breaking changes could flow in automatically. First cold load depends on CDN availability.
→ **Resolution:** Pin to exact version. Ideally vendor the file locally — download it, include in repo, serve it from same origin. True zero-CDN-dependency.
→ **Assigned to:** Step 3

**D21. Photo/drawing uploads have no size cap.** *(Flagged by QA audit)*
Videos are capped at 50MB. Photos/drawings go through compression but have no hard limit on output size. Under storage pressure, browser may evict IDB — taking all unsynced data with it.
→ **Resolution:** Cap compressed output at 2MB. Monitor total IDB usage. Warn user when approaching storage limits.
→ **Assigned to:** Step 3

**D22. Pricebook save button throws error.** *(Known bug from vision doc)*
Error on click but data persists anyway. Wiring issue — console investigation needed.
→ **Resolution:** Investigate console error. Fix the wiring or convert to explicit "Manual Backup" trigger.
→ **Assigned to:** Step 1

---

## THE EXECUTION SEQUENCE

This is the build order. Each step must be completed and verified before moving to the next. No skipping. No parallelization across steps.

---

### STEP 1: DATA SAFETY — Protect What Exists
**Goal:** Every piece of valuable data in ASTRA has a cloud backup. No silent data loss vectors.

**Defects addressed:** D1, D2, D3, D14, D22

**Tasks:**
- [ ] **D1** — Implement estimate sync to Supabase. Add `estimates` table if not present. Same push/pull pattern as jobs. Push on save (debounced), pull on sync.
- [ ] **D2** — Add timestamp protection to push sync. Compare `updated_at` before overwriting cloud records. If cloud is newer, skip that record on push (same logic pull already uses).
- [ ] **D3 + D14** — Fix material sync. Add `material_id` (UUID) to each material record. Switch from delete-all/re-insert to per-material upsert. Ensure no window where cloud has zero materials for a job.
- [ ] **D22** — Fix pricebook save button. Investigate console error. Fix wiring.

**Verification:** Create an estimate on Device A, push, pull on Device B. Edit on B, push, pull on A. Verify no data loss in either direction. Verify materials survive a push interrupted by airplane mode toggle. Verify pricebook saves without console errors.

**Do not proceed to Step 2 until verification passes.**

---

### STEP 2: INFRASTRUCTURE HARDENING — Make It Bulletproof
**Goal:** The app behaves the way the architecture describes — silent sync, graceful degradation, no user-facing infrastructure noise.

**Defects addressed:** D4 (partial), D8, D9

**Tasks:**
- [ ] **D4 (partial)** — Verify Supabase RLS status. Document which policies exist. If none exist, implement basic RLS that restricts access. This is a prerequisite for everything that follows.
- [ ] **D8** — Implement auto-sync. Debounced push after data changes (jobs, estimates, addresses). Persistent retry queue — store pending sync operations in IDB, retry on connectivity change (`navigator.onLine` events). This is the "background sync" the architecture always described but never had.
- [ ] **D9** — Categorize error handling. Network/sync errors → silent (console log + subtle sync status indicator). Only errors that affect the user's current action get a toast. A tech should never see a red error because Supabase timed out.

**Verification:** Enable airplane mode, create 5 jobs, add materials, create an estimate. Disable airplane mode. Verify all data syncs automatically with no user interaction. Verify zero error toasts appeared during offline work. Verify retry queue persists across app restarts (close and reopen app, verify pending syncs complete).

**Do not proceed to Step 3 until verification passes.**

---

### STEP 3: HOUSEKEEPING — Clean Up Known Debt
**Goal:** Fix accumulated low-severity issues that individually are minor but collectively create fragility.

**Defects addressed:** D11, D15, D17, D19, D20, D21

**Tasks:**
- [ ] **D15** — Migrate material library and price book from localStorage to IndexedDB. Same cache pattern as everything else. Ensure material catalog survives `localStorage.clear()`.
- [ ] **D20** — Pin Supabase client library to exact version. Vendor the file locally if possible (download, include in repo, update service worker cache list).
- [ ] **D19** — Replace "Mike Torres" seed with "DEFAULT TECH" or a first-run setup prompt.
- [ ] **D17** — Fix vector board midnight clear. Check on every `goTo('screen-vector')` or set a midnight timeout.
- [ ] **D11** — Sort jobs by date at render time. Don't rely on `_cache.jobs` array order.
- [ ] **D21** — Cap photo/drawing compressed output at 2MB. Add storage usage monitoring with warning threshold on settings screen.
- [ ] Update all inline code comments that reference "single HTML file" or outdated architecture descriptions.
- [ ] Purge or correct any documentation files in the repo that contradict this CLAUDE.md.

**Verification:** Fresh install test. Verify no "Mike Torres." Verify material library survives `localStorage.clear()`. Verify job list displays in correct date order after importing a shuffled backup. Verify Supabase client loads from local vendor copy with no CDN request.

---

### STEP 4: AUTHENTICATION — The Gate
**Goal:** ASTRA knows who you are. Every action has an identity.

**Defects addressed:** D4 (full), D5

**Tasks:**
- [ ] **D4 (full)** — Implement Supabase Auth. Email + password. Session tokens. Secure storage.
- [ ] **D5** — Schema migration: add `account_id` to all Supabase tables (jobs, addresses, techs, estimates, materials). Backfill existing records with a default account ID. Add `created_by` and `assigned_to` (Supabase Auth user IDs) to jobs table.
- [ ] Create `accounts` table: id, name, created_at.
- [ ] Create `users` table: id, account_id, name, email, role (tech/supervisor/admin), status (active/inactive), created_at.
- [ ] Build login screen. One screen. Email, password, go. No onboarding wizard. No "tell us about your team." Admin sets up, sends tech a link, tech taps and they're in.
- [ ] Cache invalidation on auth state change — clear `_cache`, rebuild from IDB on login/logout.
- [ ] RLS policies enforced on all tables: users can only read/write records where `account_id` matches their own.

**Login UX constraints:**
- One screen. Two fields. One button.
- Under 3 seconds on 4G.
- Offline: if session token is cached, skip login. Re-auth only on token expiry.
- First-time setup by admin only. Techs receive an invite link.

**Verification:** Log in as User A on Device 1. Log in as User B on Device 2 (different account). Verify neither can see the other's data. Verify RLS blocks direct Supabase API queries from returning cross-account data. Verify logout clears cache, login rebuilds it.

---

### STEP 5: MULTI-USER — The Real Architecture
**Goal:** Multiple people use ASTRA in the same shop without conflicts, data leaks, or workflow collisions.

**Defects addressed:** D6, D7, D10, D13

**Tasks:**
- [ ] **D6 + D7** — Role-based sync filters at the exact lines identified:
  - Tech: `WHERE (assigned_to = current_user_id AND status = 'active') OR (created_by = current_user_id AND status = 'pending_approval')`
  - Supervisor: `WHERE account_id = current_account_id`
  - Realtime filtered by RLS automatically.
  - **The sync filter IS the security model.** Data not downloaded cannot be accessed. Not hidden. Not there.

- [ ] **D13** — Checkout semantics:
  - Lock on edit: `locked_by = current_user_id`, `locked_at = now()`.
  - Release on save or 30-minute timeout.
  - Supervisor force-unlock via "Take Over."
  - Database-level write protection: `UPDATE tickets SET ... WHERE id = ? AND locked_by = current_user_id`. Lock mismatch = write fails. No merge dialog. Conflicts structurally impossible.
  - UI: your ticket = normal edit. Someone else's = read-only + "Locked by [Name]." Supervisor = read-only + "Take Over."

- [ ] **D10** — Cache invalidation on role/user change.

- [ ] Two creation paths:
  - **Tech Discovery:** Tech creates → `pending_approval` → auto-assigned to self → syncs as pending. Editable while pending.
  - **Supervisor Dispatch:** Supervisor creates → `active` → assigns to tech → no approval needed.
  - Both feed estimator. Both affect material rollup. Both coexist.

- [ ] Approval pipeline:
  - `pending_approval` → [Approve] → `active` (releases lock, notifies tech)
  - `pending_approval` → [Request Changes] → stays pending (comment, notifies tech)
  - `pending_approval` → [Reject] → `archived` (reason, notifies tech)
  - **Three-second rule:** Approving a ticket takes a supervisor three seconds or less. Badge count on nav. Tap, see pending, approve/reject. If it takes longer, supervisors ignore the queue and the pipeline collapses. Hard design constraint.

- [ ] RBAC enforcement:
  | Role | Data Scope | Creates As | Approves | Manages Users | Dev Settings |
  |------|-----------|-----------|---------|--------------|-------------|
  | Tech | Own + pending | `pending_approval` | No | No | No |
  | Supervisor | All account | `active` | Yes | No | No |
  | Admin | All account | `active` | Yes | Yes | Yes |

**Verification:** Three devices — Tech A, Tech B, Supervisor. Tech A creates job → Tech B can't see it. Supervisor approves → appears for assigned tech as active. Tech A edits → Supervisor sees locked. Supervisor force-unlocks → Tech A gets read-only. Full approval flow under three seconds per ticket from supervisor's perspective.

---

### STEP 6: COST INTELLIGENCE PROTECTION — The Moat
**Goal:** The data that makes ASTRA valuable is clean, accurate, and defended against corruption.

**Defects addressed:** D12, D16

**Tasks:**
- [ ] **D12** — Fuzzy address deduplication. Geocode proximity (lat/lng within threshold) plus normalized string comparison. Flag near-duplicates for supervisor resolution. Don't auto-merge — supervisor decides.

- [ ] Material deduplication detection:
  - Detect overlapping materials on two tickets at same address, same day.
  - Fuzzy match: code match OR (category + type match).
  - Supervisor resolution UI: Remove / Combine quantities / Keep separate.
  - Materials feed cost intelligence only if `deduplicated = true`.

- [ ] **D16** — Replace all `confirm()` dialogs with custom modals. 48px buttons. Field-grade UX.

**Verification:** Two tickets, same address, same day, overlapping materials. Dedup detection fires. Each resolution option produces correct counts. Cost intelligence rollup reflects supervisor decision, not raw double-count.

---

### STEP 7: FUTURE — Beyond MVP
Not part of current execution. Documented for awareness.

- Media blob sync to Supabase Storage (D18)
- Admin dashboard + user management UI
- Developer settings page (admin-gated)
- Notification system (offline-aware)
- 2FA for supervisor/admin
- Historical quote import for cold-start
- Anonymized market data as secondary revenue
- Sync rate limiting (battery + data plan awareness)

---

## DESIGN LANGUAGE

- **48px minimum tap targets** — No exceptions.
- **Orange (#FF6B00) for actions ONLY** — Sacred. Enforced in every review.
- **ALL-CAPS for authority** — Headers, labels, status indicators.
- **Cold, precise, military aesthetic** — No friendly UI. No confetti. No congratulations. Tool, not toy.
- **High contrast** — Readable in direct sunlight.
- **No unnecessary chrome** — Every pixel earns its place.

---

## THE COST INTELLIGENCE FLYWHEEL

```
Tech logs job with materials at an address
        ↓
Data feeds into estimator's historical knowledge
        ↓
Next estimate at that address is more accurate
        ↓
Better estimates = better margins
        ↓
Shop logs more jobs because the tool earns money
        ↓
More jobs = more data = better estimates
        ↓
(Compounding. Defensible. Irreplicable.)
```

**The address is the entity that matters.** Not the customer. `property_id` is a foreign key on tickets AND estimates. Everything rolls up to the address. Every feature protects this flywheel.

---

## THE 99.99% UPTIME MODEL

- App runs locally. Always available. Server is a convenience, not a dependency.
- Network failure = sync delay, NOT an outage.
- Never show a spinner for local operations. Tap → result. Instantly.
- Never show an error because the cloud is unreachable.

---

## RULES OF ENGAGEMENT

1. **No dependencies.** No frameworks. No build tools. No package managers.
2. **Don't refactor what works.** Estimator, cache/IDB pattern, service worker — leave them alone.
3. **Ask before changing architecture.** Flag concerns. Don't unilaterally restructure.
4. **Test offline.** Every change works with airplane mode. If not, it doesn't ship.
5. **Respect the design language.** 48px. Orange for actions. High contrast. Military.
6. **Local is truth.** Network failure = sync delay, not outage.
7. **Comment your intent.** Explain WHY. Maintainer thinks in electrical systems, not CS.
8. **Protect the flywheel.** If it risks poisoning cost intelligence, it doesn't ship.
9. **Three-second rule.** Supervisor actions under three seconds or they won't be used.
10. **Graceful degradation.** Infrastructure noise never reaches the user.
11. **Verify before proceeding.** Each step has a verification checklist. Pass it before moving on.
12. **Purge contradictions.** Documentation, comments, or code that contradicts this file — fix immediately.

---

## CONTACTS

- **Creator/Architect:** Robert — electrical background, field reality, final word on workflow decisions.
- **Execution:** Claude Code — you execute. You don't override.
- **Source of truth:** This document. Not the vision doc. Not previous versions. Not inline comments. This.

---

*Begin at Step 1. Report back when verification passes.*
