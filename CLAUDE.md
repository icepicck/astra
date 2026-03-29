# CLAUDE.md — ASTRA STANDING ORDERS v3.1

**Single source of truth for all ASTRA development. If any other document contradicts this — this wins.**

**Standing order:** Search for README, ARCHITECTURE.md, CONTRIBUTING.md, NOTES.md, TODO.md, or any docs that contradict this file. Delete contradictions or delete the file. Fix inline code comments that reference outdated architecture. ASTRA_Complete_Vision.md is a historical archive — don't modify it, don't follow it where it diverges from this file.

---

## WHAT IS ASTRA

ASTRA is a cost intelligence engine for electrical contractors. It tracks jobs because job tracking is how it learns what things actually cost. Every logged job feeds back into the estimator. Every material used on a job type becomes historical data. Every quote improves the next one.

**ASTRA is NOT a job tracker that added quoting. The estimator is the core product. Job tracking is the data acquisition layer.**

Target user: solo electricians and small shops (1–6 techs) who bleed margin because they lack historical cost data, material pricing consistency, quick quoting workflows, or job-category intelligence.

**The product moment:** A tech starts a new panel swap estimate. ASTRA says "your last 15 panel swaps averaged $X in materials, Y hours labor, Z total cost." The estimate writes itself from real job history. That moment is the word-of-mouth trigger.

**Primary intelligence axis: JOB CATEGORY.** Panel swaps, outlet installs, service upgrades — the estimator learns from every completed job of the same type, regardless of address. Fires fast: 5–10 jobs of a type = useful averages. 50+ = statistically significant.

**Secondary intelligence axis (bonus): ADDRESS.** "You've been here before — here's what you did last time." Nice for repeat customers and service agreements, but NOT the core engine. Most residential electrical is one-and-done at a given address.

---

## ARCHITECTURE CONSTRAINTS — NON-NEGOTIABLE

1. **No frameworks. No build step. No package manager.** Vanilla HTML/CSS/JS. No React/Vue/Angular. No webpack/vite. No npm/yarn. No node_modules.
2. **Offline-first.** IndexedDB is source of truth. Supabase is cloud backup. App functions with zero connectivity indefinitely. Sync is background convenience.
3. **No runtime dependencies** except Google Maps API and Supabase client library. No others.
4. **PWA with Service Worker.** Cache-first on first visit. Installable to home screen.

---

## FILE STRUCTURE (v0.6)

```
index.html              — App shell: HTML screens + CSS, no JS (~900 lines)
app.js                  — Core IIFE: data layer, nav, ticket CRUD, settings, search, dashboard, media (~1885 lines)
astra-estimates.js      — Estimates IIFE: builder, price book, intelligence engine, recalc(), Phase B-D (~1400 lines)
astra-materials.js      — Materials IIFE: catalog, picker, job materials, bulk templates, frequent flyers (~620 lines)
astra-maps.js           — Maps IIFE: Google Maps, Vector route, geocoding (~200 lines)
astra-sync.js           — Sync IIFE: Supabase push/pull, realtime subscriptions (~430 lines)
sw.js                   — Service worker (~62 lines)
manifest.json           — PWA manifest
rough_materials.json    — Rough-in catalog (95 items)
trim_materials.json     — Trim-out catalog (127 items)
serve.js                — Dev server (not deployed)
stress-test.js          — Integration tests (not deployed)
```

**Module pattern:** Each IIFE reads from `window.Astra` (set by `app.js`), exposes public functions on `window`. No circular dependencies.

---

## DATA MODEL

### IndexedDB: `astra_db` (version 2)

| Store | Key | Contents |
|-------|-----|----------|
| `jobs` | `id` (UUID) | Tickets — address, types[], status, materials[], photos[], drawings[], videos[], techId, techName, notes, techNotes, dates, archived, addressId, manually_added_to_vector |
| `techs` | `id` (UUID) | Technicians — name (and eventually phone, license, active) |
| `addresses` | `id` (UUID) | Properties — full address, builder, subdivision, panel info, lat/lng, notes |
| `estimates` | `id` (UUID) | Estimates — address, customer info, materials[], labor, adjustments, overhead, profit, tax, status, linkedJobId |

### IndexedDB: `astra_media` (version 1)

| Store | Key | Contents |
|-------|-----|----------|
| `blobs` | `id` (UUID) | Binary media — photos, drawings, videos as raw blobs |

### localStorage (Settings Only)

| Key | Contents | Notes |
|-----|----------|-------|
| `astra_material_library_rough` | Rough-in catalog JSON | **MIGRATE TO IDB** (Step 3) |
| `astra_material_library_trim` | Trim-out catalog JSON | **MIGRATE TO IDB** (Step 3) |
| `astra_pricebook` | Price book config | **MIGRATE TO IDB** (Step 3) |
| `astra_gmaps_key` | Google Maps API key | Stays |
| `astra_home_base` | Home base address | Stays |
| `astra_supabase_url` | Supabase project URL | Stays (requires RLS) |
| `astra_supabase_key` | Supabase anon key | Stays (public by design, requires RLS) |
| `astra_last_sync` | ISO timestamp | Stays |
| `astra_nav_frequency` | Screen visit counts | Stays |

**Principle:** Business data → IDB. Small config → localStorage. Material library + price book violate this — fix in Step 3.

---

## BUILT AND WORKING — DON'T TOUCH UNLESS FIXING A LISTED DEFECT

**Core (solid):**
- **Estimator engine** — `recalc()`: material subtotals, markup, labor, overhead, profit, tax, grand total. Math clean. Event delegation via capture-phase blur. Auto-save on blur. Crown jewel.
- **Estimator intelligence (Phase B)** — `_querySimilarJobs()`: completed jobs with matching type (PRIMARY axis). `_queryAddressJobs()`: jobs at same address (SECONDARY bonus). Property intel surfaces panel type, amp rating, breaker type.
- **Estimator feedback (Phase D)** — `_estCreateTicket()`: job from accepted estimate with bidirectional linking. `_renderComparison()`: estimated vs actual. `_renderAccuracyMetrics()`: accuracy dashboard. Loop closed.
- **Job/ticket CRUD** — Create, edit, view, archive, unarchive. In-memory cache with IDB write-through.
- **Material catalog** — 222 items, rough-in + trim-out. Searchable, categorized, variant support.
- **Material tracking** — "Previously at this address" surfaces prior job materials. Frequent flyers auto-surface top 10. Bulk templates.
- **Address database** — Property intelligence fields (builder, subdivision, panel info, notes). Google Maps geocoding.
- **Cache pattern** — All reads from `_cache` (synchronous). IDB is write-through.
- **Service worker** — Cache-first same-origin, network-first external w/ 3s timeout. Version-bumped. Auto-reload when idle, orange banner when busy.
- **Navigation** — SPA show/hide. `history.pushState`. Smart shortcuts by usage frequency.
- **Media** — Photos, drawings (PDF), videos in separate IDB. Fullscreen + pinch-to-zoom. Video cap 50MB.
- **Export/import** — JSON backup with validation. Confirmation before replacing data.
- **Stress tests** — Offline editing, sync spam, photo integrity, cache-vs-IDB consistency.

**Sync (working, has known issues):**
- **Push:** Addresses → Techs → Jobs → Materials. Batch upsert `onConflict: 'id'`.
- **Pull:** Full pull, local-wins conflict resolution (timestamp-based).
- **Realtime:** Supabase subscriptions for live cross-device sync. Skips if sync in progress.
- **Manual trigger:** Push/Pull are button presses in Settings. No auto-sync yet.

---

## DEFECTS — RANKED BY SEVERITY

### CRITICAL — Data Loss or Security Risk

| ID | Issue | Resolution | Step |
|----|-------|-----------|------|
| D1 | Estimates don't sync to Supabase. Most valuable data has no cloud backup. | Add estimate sync (same pattern as jobs). Add `estimates` table if needed. | 1 |
| D2 | Push sync can silently overwrite newer cloud data. No timestamp check on push. | Add `updated_at` comparison on push. Skip records where cloud is newer. | 1 |
| D3 | Material sync does destructive delete-and-rebuild on every push. Crash mid-push = materials gone in cloud. Scales catastrophically. | Switch to per-material upsert with `material_id` (UUID). | 1 |
| D4 | No authentication. No RLS. Anyone with project URL + anon key has full read/write. | Step 2: verify/enable RLS. Step 4: full Supabase Auth. | 2, 4 |
| D5 | No `account_id` on Supabase tables. No concept of which shop owns a record. | Schema migration: add `account_id` to all tables. Backfill existing records. | 4 |

### HIGH — Architectural Gaps

| ID | Issue | Resolution | Step |
|----|-------|-----------|------|
| D6 | Sync pulls ALL data unfiltered. `select('*')` on every table. | Role-based sync filters. Specific lines in `astra-sync.js`: ~231 (addresses), ~250 (techs), ~267 (jobs), ~271 (materials), ~347-355 (realtime), ~173 (push addresses), ~181 (push jobs). | 5 |
| D7 | Realtime subscriptions have no auth gating. Every device gets every update. | RLS policies auto-filter realtime. Implement alongside D6. | 5 |
| D8 | No automatic sync. Manual push/pull only. No retry queue. | Auto-push on data changes (debounced). Persistent retry queue in IDB. | 2 |
| D9 | Global error handler shows ALL errors as red toasts, including network timeouts. | Categorize: network/sync → silent. Only user-affecting errors toast. | 2 |

### MODERATE — Multi-User Prep

| ID | Issue | Resolution | Step |
|----|-------|-----------|------|
| D10 | `_cache` is global singleton. No invalidation on auth change. | Cache clear + rebuild from IDB on login/logout. | 5 |
| D11 | `addJob()` uses `unshift()` — order depends on insert, not date. | Sort by date at render time. | 3 |
| D12 | Address matching could create duplicates in multi-user. Pollutes address-level intelligence (secondary layer). | Fuzzy match: geocode proximity + normalized string. Supervisor resolves near-dupes. | 6 |
| D13 | No ticket locking. Two people can edit same ticket simultaneously. | Lock on edit, release on save or 30min timeout. Supervisor force-unlock. DB-level write protection: `WHERE locked_by = current_user_id`. | 5 |
| D14 | Individual materials have no unique cloud ID. | Add `material_id` UUID. Use for upsert sync. (Related to D3.) | 1 |

### LOW — Polish

| ID | Issue | Resolution | Step |
|----|-------|-----------|------|
| D15 | Material library + price book in localStorage (~5MB limit). | Migrate to IDB with same cache pattern. | 3 |
| D16 | `confirm()` dialogs are blocking and hostile on mobile. | Custom modals with 48px buttons. | 6 |
| D17 | Vector board midnight clear only runs on app init. | Check on `goTo('screen-vector')` or set midnight `setTimeout`. | 3 |
| D18 | Media blobs are device-local only. | Future: Supabase Storage. Not blocking for MVP. | 7 |
| D19 | Hardcoded "Mike Torres" tech on fresh install. | Prompt for name or seed "DEFAULT TECH." | 3 |
| D20 | Supabase client loaded from unpinned CDN. | Pin exact version. Vendor locally if possible. | 3 |
| D21 | Photo compression unbounded — can exceed IDB quota. | Cap compressed output at 2MB. Monitor usage. Warn at threshold. | 3 |
| D22 | Pricebook save button throws error (data persists anyway). | Investigate console error. Fix wiring. | 1 |

---

## EXECUTION SEQUENCE

Complete each step and verify before moving to next. No skipping. No parallelization across steps.

### STEP 1: DATA SAFETY
**Goal:** Every valuable data type has cloud backup. No silent data loss.

**Tasks:** D1, D2, D3+D14, D22

**Verify:** Create estimate on Device A → push → pull on Device B. Edit on B → push → pull on A. No data loss either direction. Materials survive push interrupted by airplane mode. Pricebook saves clean.

---

### STEP 2: INFRASTRUCTURE HARDENING
**Goal:** Silent sync, graceful degradation, no infrastructure noise reaching users.

**Tasks:** D4 (partial — verify/enable RLS), D8, D9

**Verify:** Airplane mode → create 5 jobs + materials + estimate → disable airplane mode → all syncs automatically with zero user interaction. Zero error toasts during offline work. Retry queue persists across app restart.

---

### STEP 3: HOUSEKEEPING
**Goal:** Fix accumulated low-severity debt.

**Tasks:** D15, D20, D19, D17, D11, D21. Update stale inline comments.

**Verify:** Fresh install — no "Mike Torres." Material library survives `localStorage.clear()`. Jobs sort by date after importing shuffled backup. Supabase client loads from local vendor copy.

---

### STEP 4: AUTHENTICATION
**Goal:** ASTRA knows who you are. Every action has an identity.

**Tasks:** D4 (full auth), D5

- Supabase Auth: email + password, session tokens, secure storage.
- Schema migration: `account_id` on all tables. Backfill existing records.
- Create `accounts` table (id, name, created_at) and `users` table (id, account_id, name, email, role, status, created_at).
- Login screen: one screen, two fields, one button. Under 3s on 4G.
- Offline: cached session token skips login. Re-auth only on token expiry.
- First-time setup by admin only. Techs get invite link.
- RLS on all tables: `account_id` must match.
- Cache invalidation on auth state change.

**Verify:** User A on Device 1, User B (different account) on Device 2. Neither sees other's data. RLS blocks direct API queries cross-account. Logout clears cache, login rebuilds.

---

### STEP 5: MULTI-USER
**Goal:** Multiple people in same shop, no conflicts, no data leaks.

**Tasks:** D6+D7, D13, D10

- Role-based sync filters at specific `astra-sync.js` lines (see D6).
  - Tech: `WHERE (assigned_to = user AND status = 'active') OR (created_by = user AND status = 'pending_approval')`
  - Supervisor: `WHERE account_id = current_account_id`
  - Realtime filtered by RLS automatically.
- Checkout semantics: lock on edit (`locked_by`, `locked_at`). Release on save or 30min timeout. Supervisor force-unlock. DB write protection: `WHERE locked_by = current_user_id`. Lock mismatch = write fails.
- UI: your ticket = edit. Someone else's = read-only + "Locked by [Name]." Supervisor = read-only + "Take Over."
- Two creation paths: Tech Discovery (→ `pending_approval`) and Supervisor Dispatch (→ `active`).
- Approval pipeline: approve → `active` / request changes → stays pending / reject → `archived`. Three-second rule for supervisor actions.
- RBAC:

| Role | Scope | Creates As | Approves | Manages Users | Dev Settings |
|------|-------|-----------|---------|--------------|-------------|
| Tech | Own + pending | `pending_approval` | No | No | No |
| Supervisor | All account | `active` | Yes | No | No |
| Admin | All account | `active` | Yes | Yes | Yes |

**Verify:** Three devices (Tech A, Tech B, Supervisor). Tech A creates → Tech B can't see. Supervisor approves → appears for assigned tech. Tech A edits → Supervisor sees locked. Force-unlock → Tech A gets read-only. Full approval flow < 3 seconds.

---

### STEP 6: COST INTELLIGENCE PROTECTION
**Goal:** The data that makes ASTRA valuable is clean, accurate, and defended.

**Tasks:** D12, D16

- Fuzzy address dedup: geocode proximity + normalized string. Flag near-dupes for supervisor. Don't auto-merge.
- Material dedup: detect overlapping materials on two tickets at same address/same day. Fuzzy match: code OR (category + type). Supervisor resolves: Remove / Combine / Keep separate. Materials feed cost intelligence only if `deduplicated = true`.
- Replace all `confirm()` with custom modals. 48px buttons.

**Verify:** Two tickets, same address, same day, overlapping materials. Dedup fires. Each resolution option produces correct counts. Cost intelligence reflects supervisor decision.

---

### STEP 7: FUTURE — Beyond MVP
Not part of current execution. Documented for awareness.

Media blob sync (D18), admin dashboard, developer settings, notification system, 2FA, historical quote import for cold-start, anonymized market data as secondary revenue, sync rate limiting.

---

## DESIGN LANGUAGE

- **48px minimum tap targets** — No exceptions.
- **Orange (#FF6B00) for actions ONLY** — Sacred.
- **ALL-CAPS** — Headers, labels, status indicators.
- **Military aesthetic** — Cold, precise. No friendly UI. No confetti. Tool, not toy.
- **High contrast** — Readable in direct sunlight.
- **No chrome** — Every pixel earns its place.

---

## THE COST INTELLIGENCE FLYWHEEL

```
Tech logs job with materials and job type
        ↓
Data feeds into estimator's job-category knowledge
        ↓
Next estimate for that job type is more accurate
        ↓
Better estimates = better margins
        ↓
Shop logs more jobs because the tool earns money
        ↓
More jobs = more data = better estimates
        ↓
(Compounding. Defensible. Irreplicable.)
```

**The job category is the primary axis.** Panel swap, outlet install, service upgrade — each builds its own cost history. `job_type` is the primary grouping key. Address is secondary bonus: `property_id` links to addresses for "you've been here before" context, but core value comes from category-level averages across ALL jobs of that type. Every feature protects this flywheel.

---

## RULES OF ENGAGEMENT

1. **No dependencies.** No frameworks. No build tools. No package managers.
2. **Don't refactor what works.** Estimator, cache/IDB pattern, service worker — leave them alone.
3. **Ask before changing architecture.** Flag concerns. Don't unilaterally restructure.
4. **Test offline.** Every change works in airplane mode or it doesn't ship.
5. **Respect the design language.** 48px. Orange = actions. High contrast. Military.
6. **Local is truth.** Network failure = sync delay, not outage.
7. **Comment your intent.** Explain WHY. Maintainer thinks in electrical systems, not CS.
8. **Protect the flywheel.** If it risks poisoning cost intelligence, it doesn't ship.
9. **Three-second rule.** Supervisor actions under three seconds or they won't be used.
10. **Graceful degradation.** Infrastructure noise never reaches the user.
11. **Verify before proceeding.** Pass the step's verification checklist before moving on.
12. **Purge contradictions.** Anything contradicting this file — fix immediately.

---

## CONTACTS

- **Creator/Architect:** Robert — electrical background, field reality, final word on workflow decisions.
- **Execution:** Claude Code — you execute. You don't override.
- **Source of truth:** This document. Not the vision doc. Not previous versions. Not inline comments. This.

---

*Begin at Step 1. Report back when verification passes.*
