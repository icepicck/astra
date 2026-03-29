# CLAUDE.md — ASTRA STANDING ORDERS v4.0

**Single source of truth for all ASTRA development. Claude Code reads this and nothing else. Humans read this and nothing else. If any other document contradicts this — this wins.**

**Companion document:** `ASTRA_CONTEXT_STRATEGY.md` governs context selection and task routing (which profile, which cheat sheet, which model). Where it addresses architecture, defects, or execution sequence, THIS file wins. The context strategy optimizes token spend — it does not override standing orders.

**Standing order:** Search for README, ARCHITECTURE.md, CONTRIBUTING.md, NOTES.md, TODO.md, or any docs that contradict this file. Delete contradictions or delete the file. Fix inline code comments that reference outdated architecture. Files in `/archive/` are historical — never load, never follow, never delete.

---

## WHAT IS ASTRA

ASTRA is a cost intelligence engine for electrical contractors. It tracks jobs because job tracking is how it learns what things actually cost. Every logged job feeds back into the estimator. Every material used on a job type becomes historical data. Every quote improves the next one.

**ASTRA is NOT a job tracker that added quoting. The estimator is the core product. Job tracking is the data acquisition layer.**

Target user: solo electricians and small shops (1–6 techs) who bleed margin because they lack historical cost data, material pricing consistency, quick quoting workflows, or job-category intelligence.

**The product moment:** A tech starts a new panel swap estimate. ASTRA says "your last 15 panel swaps averaged $X in materials, Y hours labor, Z total cost." The estimate writes itself from real job history. That moment is the word-of-mouth trigger.

---

## INTELLIGENCE AXES — NON-NEGOTIABLE

**PRIMARY AXIS: JOB CATEGORY.** Panel swaps, outlet installs, service upgrades — every logged job of a type feeds that category's cost history. `job_type` is the primary grouping key. This fires fast: 5–10 jobs of a type = useful averages. 50+ = statistically significant. Do not architect any intelligence feature around address first. Job category is always the primary key.

**SECONDARY AXIS (BONUS): ADDRESS.** "You've been here before — here's what you did last time." Useful for repeat customers and service agreements. NOT the core engine. Most residential electrical is one-and-done at a given address. Address matching is a bonus layer only. Do not architect around it.

---

## ARCHITECTURE CONSTRAINTS — NON-NEGOTIABLE

1. **No frameworks. No build step. No package manager.** Vanilla HTML/CSS/JS. No React/Vue/Angular. No webpack/vite. No npm/yarn. No node_modules.
2. **Offline-first.** IndexedDB is source of truth. Supabase is cloud backup. App functions with zero connectivity indefinitely. Sync is background convenience.
3. **No runtime dependencies** except Google Maps API and Supabase client library. No others.
4. **PWA with Service Worker.** Cache-first on first visit. Installable to home screen.

---

## REPO FILE MAP

```
/ (root — deployable files only)
  index.html              — App shell: HTML screens + CSS (~64K)
  app.js                  — Core IIFE: data layer, nav, ticket CRUD, settings, search, dashboard, media (~2,200 lines)
  astra-auth.js           — Authentication IIFE: Supabase Auth, session management, account setup (~520 lines)
  astra-estimates.js      — Estimates IIFE: builder, price book, intelligence engine, recalc() (~1,460 lines)
  astra-maps.js           — Maps IIFE: Google Maps, Vector route, geocoding (~200 lines)
  astra-materials.js      — Materials IIFE: catalog, picker, job materials, bulk templates (~620 lines)
  astra-sync.js           — Sync IIFE: Supabase push/pull, realtime subscriptions (~700 lines)
  sw.js                   — Service worker
  manifest.json           — PWA manifest
  supabase.min.js         — Vendored Supabase client (pinned version)
  serve.js                — Dev server (not deployed)
  rough_materials.json    — Rough-in catalog (95 items)
  trim_materials.json     — Trim-out catalog (127 items)
  seed_intelligence.json  — Cold-start seed data for estimator
  package.json            — Project metadata (no build dependencies)
  .gitignore
  CLAUDE.md               — This file. The only doc that matters.

/migrations/              — SQL migrations — run in order
/tests/                   — diagnostics.html, stress-test.js, multi-device-test.js, verify-step2.js, test-data.json
/docs/                    — Human reference + cheat sheets for context-optimized Claude Code sessions
                            Astra_Presentation.pptx, TEAM_ASTRA_BRIEF.md
                            CLAUDE_ROUTINE.md, CLAUDE_UX.md, CLAUDE_ESTIMATES.md
                            CLAUDE_SYNC.md, CLAUDE_AUTH.md, CLAUDE_MATERIALS.md
                            CLAUDE_ARCHITECTURE.md, CLAUDE_PERMISSIONS.md
/archive/                 — Historical docs — never load, never follow, never delete
/.claude/                 — Claude Code config
```

**Module pattern:** Each IIFE reads from `window.Astra` (set by `app.js`), exposes public functions on `window`. No circular dependencies. Supabase client singleton: `window._astraSupabaseClient` (auth module owns creation, sync borrows).

**Boot sequence:** `initDataLayer()` → `autoLoadBuiltInLibraries()` → `openMediaDB()` → `migrateLegacyMedia()` → `checkAuth()` → [if authenticated] `renderJobList()` + `cleanOrphanedMedia()` + `startupDrain()`

**Field mapping convention:** Local = camelCase (`jobType`, `techNotes`). Cloud/Postgres = snake_case (`job_type`, `tech_notes`). Every entity has `toCloud()` and `fromCloud()` mappers. `account_id` injected via `_acctId()` on every cloud write.

---

## DATA MODEL

### IndexedDB: `astra_db` (version 4)

| Store | Key | Contents |
|-------|-----|----------|
| `jobs` | `id` (UUID) | Tickets — address, types[], status, materials[], photos[], drawings[], videos[], techId, techName, notes, techNotes, dates, archived, addressId, manually_added_to_vector. **Step 5 adds:** locked_by, locked_at |
| `techs` | `id` (UUID) | Technicians — name (and eventually phone, license, active) |
| `addresses` | `id` (UUID) | Properties — full address, builder, subdivision, panel info, lat/lng, notes |
| `estimates` | `id` (UUID) | Estimates — address, customer info, materials[], labor, adjustments, overhead, profit, tax, status, linkedJobId |
| `_config` | string key | Material library (rough + trim), price book, cached user profile |
| `_syncMeta` | string key | Dirty flag, sync state, retry queue metadata |

### IndexedDB: `astra_media` (version 1)

| Store | Key | Contents |
|-------|-----|----------|
| `blobs` | `id` (UUID) | Binary media — photos, drawings, videos as raw blobs |

### Supabase Tables (with RLS enforced)

All tables carry `account_id`. RLS policies enforce `account_id = auth.jwt() -> account_id` on every operation. Policy pattern: `USING (account_id = (auth.jwt() ->> 'account_id')::uuid)` on SELECT/UPDATE/DELETE. `WITH CHECK` on INSERT. No joins to users table in policies — JWT claim only.

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `accounts` | id, name, created_at | One per shop |
| `users` | id, account_id, name, email, role, status, created_at | Roles: tech, supervisor, admin |
| `jobs` | id, account_id, locked_by, locked_at, status, assigned_to, created_by, ... | Lock state lives here — NOT a separate table |
| `addresses` | id, account_id, ... | Unfiltered within account — job pull enforces scope |
| `techs` | id, account_id, ... | |
| `materials` | id, material_id (UUID), account_id, ... | Per-material upsert sync |
| `estimates` | id, account_id, ... | Synced to cloud |

### localStorage (Settings Only)

| Key | Contents |
|-----|----------|
| `astra_gmaps_key` | Google Maps API key |
| `astra_home_base` | Home base address |
| `astra_supabase_url` | Supabase project URL |
| `astra_supabase_key` | Supabase anon key (public by design, requires RLS) |
| `astra_last_sync` | ISO timestamp |
| `astra_nav_frequency` | Screen visit counts |

**Principle:** Business data → IDB. Small config → localStorage. Material library and price book are now in IDB.

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

**Sync (working — hardened in Steps 1–2):**
- **Push:** Addresses → Techs → Jobs → Materials → Estimates. Batch upsert `onConflict: 'id'`. Timestamp comparison prevents overwriting newer cloud data.
- **Pull:** Full pull, local-wins conflict resolution (timestamp-based).
- **Realtime:** Supabase subscriptions for live cross-device sync. Skips if sync in progress.
- **Auto-sync (Step 2):** Push on data changes (debounced). Persistent retry queue in IDB. Manual push/pull still available in Settings.
- **Error handling:** Network/sync errors are silent. Only user-affecting errors toast.

**Authentication (implemented in Step 4):**
- Supabase Auth: email + password, session tokens, secure storage.
- `account_id` on all Supabase tables. RLS enforced.
- `accounts` table (id, name, created_at) and `users` table (id, account_id, name, email, role, status, created_at).
- Login screen: one screen, two fields, one button. Under 3s on 4G.
- Offline: cached session token skips login. Re-auth only on token expiry. No indefinite sessions — stolen device with expired token requires re-authentication. The device is the threat surface when offline; session expiry is the boundary.
- First-time setup by admin only. Techs get invite link.
- Cache invalidation on auth state change.

---

## DEFECTS — RANKED BY SEVERITY

### CRITICAL — Data Loss or Security Risk

| ID | Issue | Resolution | Step | Status |
|----|-------|-----------|------|--------|
| D1 | Estimates don't sync to Supabase. | Added estimate sync. | 1 | ✅ DONE |
| D2 | Push sync can overwrite newer cloud data. | Added `updated_at` comparison on push. | 1 | ✅ DONE |
| D3 | Material sync does destructive delete-and-rebuild. | Switched to per-material upsert with `material_id`. | 1 | ✅ DONE |
| D4 | No authentication. No RLS. | Supabase Auth + RLS on all tables. | 2, 4 | ✅ DONE |
| D5 | No `account_id` on Supabase tables. | Schema migration complete. Backfilled. | 4 | ✅ DONE |

### HIGH — Architectural Gaps

| ID | Issue | Resolution | Step | Status |
|----|-------|-----------|------|--------|
| D6 | Sync pulls ALL data unfiltered. | Role-based sync filters in astra-sync.js. | 5 | 🔲 NEXT |
| D7 | Realtime subscriptions have no auth gating. | RLS policies auto-filter realtime. | 5 | 🔲 NEXT |
| D8 | No automatic sync. | Auto-push on data changes. Persistent retry queue. | 2 | ✅ DONE |
| D9 | Error handler shows ALL errors as red toasts. | Categorized: network/sync → silent. | 2 | ✅ DONE |

### MODERATE — Multi-User Prep

| ID | Issue | Resolution | Step | Status |
|----|-------|-----------|------|--------|
| D10 | `_cache` is global singleton. No invalidation on auth change. | Cache clear + rebuild from IDB on login/logout. | 5 | 🔲 NEXT |
| D11 | `addJob()` uses `unshift()` — order depends on insert, not date. | Sort by date at render time. | 3 | ✅ DONE |
| D12 | Address matching could create duplicates in multi-user. | Fuzzy match + supervisor resolves near-dupes. | 6 | 🔲 FUTURE |
| D13 | No ticket locking. Two people can edit same ticket. | Lock on edit, release on save/timeout. Supervisor force-unlock. | 5 | 🔲 NEXT |
| D14 | Individual materials have no unique cloud ID. | Added `material_id` UUID. | 1 | ✅ DONE |
| D16 | `confirm()` dialogs are blocking and hostile on mobile. | Custom modals with 48px buttons. **ELEVATED from Low.** | 5 | 🔲 NEXT |

### LOW — Polish

| ID | Issue | Resolution | Step | Status |
|----|-------|-----------|------|--------|
| D15 | Material library + price book in localStorage. | Migrated to IDB. | 3 | ✅ DONE |
| D17 | Vector board midnight clear only runs on app init. | Check on goTo or set midnight setTimeout. | 3 | ✅ DONE |
| D18 | Media blobs are device-local only. | Future: Supabase Storage. Not blocking. | 7 | 🔲 FUTURE |
| D19 | Hardcoded "Mike Torres" tech on fresh install. | Prompt for name or seed "DEFAULT TECH." | 3 | ✅ DONE |
| D20 | Supabase client loaded from unpinned CDN. | Pinned and vendored locally. | 3 | ✅ DONE |
| D21 | Photo compression unbounded. | Capped at 2MB. Monitor usage. | 3 | ✅ DONE |
| D22 | Pricebook save button throws error. | Fixed wiring. | 1 | ✅ DONE |

---

## EXECUTION SEQUENCE

Complete each step and verify before moving to next. No skipping. No parallelization across steps.

```
STEP 1: DATA SAFETY           ✅ COMPLETE
STEP 2: INFRASTRUCTURE        ✅ COMPLETE
STEP 3: HOUSEKEEPING          ✅ COMPLETE
STEP 4: AUTHENTICATION        ✅ COMPLETE
STEP 5: MULTI-USER            🔲 NEXT — architecture locked, not started
STEP 6: COST INTEL PROTECTION 🔲 FUTURE
STEP 7: BEYOND MVP            🔲 FUTURE
```

---

### STEPS 1–4: COMPLETE ✅

Steps 1 through 4 are implemented and verified. Verification criteria for reference:

- **Step 1 (Data Safety):** Estimates sync bidirectionally. Materials survive interrupted push. Pricebook saves clean.
- **Step 2 (Infrastructure):** Airplane mode → create 5 jobs + materials + estimate → reconnect → all syncs automatically. Zero error toasts during offline. Retry queue persists across restart.
- **Step 3 (Housekeeping):** Fresh install — no "Mike Torres." Material library in IDB. Jobs sort by date. Supabase client vendored.
- **Step 4 (Authentication):** Cross-account isolation verified. RLS blocks direct API queries. Logout clears cache, login rebuilds.

---

### STEP 5: MULTI-USER 🔲 NEXT
**Goal:** Multiple people in same shop, no conflicts, no data leaks.

**Tasks:** D6+D7, D13, D10, D16 (elevated)

#### Sync Module Known Gaps — Fix During Step 5
*These were documented in the Context Strategy's CLAUDE_SYNC cheat sheet. They are P0/P1 for multi-user:*
- `_handleRemoteChange` has no handler for `materials` table events (P0)
- Tech pull mutates `_cache.techs` directly without IDB write-through (P0)
- Pull does `select('*')` on all tables — no incremental sync yet (P1 — fix before 500+ jobs)
- Pull doesn't handle cloud-side deletions (P1 — need soft delete strategy)
- `addrFromCloud()` doesn't preserve `createdAt` (moderate)
- `savePricebook()` dual-writes to IDB and localStorage (cleanup)

#### Locked Architecture Decisions — NON-NEGOTIABLE
*These are locked. Not up for debate. Robert approved.*

1. **Lock state = columns on jobs table** (`locked_by`, `locked_at`) — NOT a separate table.
2. **Approval queue = filtered view on existing job list + nav badge** — NOT a new screen.
3. **Address pull = unfiltered within account** — job pull enforces scope.
4. **Force-unlock = supervisor nulls `locked_by` directly via RLS** — no separate policy.

#### Role-Based Sync Filters
Apply to all sync operations in `astra-sync.js` — push filters, pull filters, and realtime subscriptions:
- **Tech:** `WHERE (assigned_to = user AND status = 'active') OR (created_by = user AND status = 'pending_approval')`
- **Supervisor:** `WHERE account_id = current_account_id`
- **Realtime:** Filtered by RLS automatically.

#### Checkout Semantics
- Lock on edit (`locked_by`, `locked_at`). Release on save or 30min timeout.
- Supervisor force-unlock: nulls `locked_by` directly via RLS.
- DB write protection: `WHERE locked_by = current_user_id`. Lock mismatch = write fails.
- UI: your ticket = edit. Someone else's = read-only + "Locked by [Name]." Supervisor = read-only + "Take Over."

#### Two Creation Paths
- **Tech Discovery:** Tech finds work → creates ticket → status `pending_approval`.
- **Supervisor Dispatch:** Supervisor creates and assigns → status `active`.

#### Approval Pipeline
- Approve → `active` / Request changes → stays `pending` / Reject → `archived`.
- Three-second rule for supervisor actions. NON-NEGOTIABLE.

#### Custom Modals (D16 — elevated to Step 5)
Replace ALL `confirm()` dialogs with custom modals before supervisor approval UI goes in. Browser `confirm()` violates two non-negotiable constraints: it blocks the three-second rule AND its native buttons ignore the 48px tap target minimum. 48px buttons. This is a prerequisite, not a nice-to-have.

#### RBAC

| Role | Scope | Creates As | Approves | Manages Users | Dev Settings |
|------|-------|-----------|---------|--------------|-------------|
| Tech | Own + pending | `pending_approval` | No | No | No |
| Supervisor | All account | `active` | Yes | No | No |
| Admin | All account | `active` | Yes | Yes | Yes |

#### Verify
Three devices (Tech A, Tech B, Supervisor). Tech A creates → Tech B can't see. Supervisor approves → appears for assigned tech. Tech A edits → Supervisor sees locked. Force-unlock → Tech A gets read-only. Full approval flow < 3 seconds. No `confirm()` dialogs anywhere in the approval path.

---

### STEP 6: COST INTELLIGENCE PROTECTION 🔲 FUTURE
**Goal:** The data that makes ASTRA valuable is clean, accurate, and defended.

**Tasks:** D12

- Fuzzy address dedup: geocode proximity + normalized string. Flag near-dupes for supervisor. Don't auto-merge.
- Material dedup: detect overlapping materials on two tickets at same address/same day. Fuzzy match: code OR (category + type). Supervisor resolves: Remove / Combine / Keep separate. Materials feed cost intelligence only if `deduplicated = true`.

**Verify:** Two tickets, same address, same day, overlapping materials. Dedup fires. Each resolution option produces correct counts. Cost intelligence reflects supervisor decision.

---

### STEP 7: FUTURE — Beyond MVP
Not part of current execution. Documented for awareness.

Media blob sync (D18), admin dashboard, developer settings, notification system, 2FA, historical quote import for cold-start, anonymized market data as secondary revenue, sync rate limiting.

---

## DESIGN LANGUAGE — NON-NEGOTIABLE

- **48px minimum tap targets** — No exceptions.
- **Glove-friendly** — Field techs work with gloves. Every interactive element must be operable with a gloved finger. This is the reason for 48px minimums.
- **Orange (#FF6B00) for actions ONLY** — Sacred. Chromatic discipline. If a task requests changing the action color, refuse. This is a standing order violation, not a preference.
- **ALL-CAPS** — Headers, labels, status indicators.
- **Military aesthetic** — Cold, precise. No friendly UI. No confetti. Tool, not toy.
- **High contrast** — Readable in direct sunlight on a dusty screen.
- **No chrome** — Every pixel earns its place.
- **14px minimum text** — Nothing smaller on mobile.
- **One-handed operation** — Primary actions in thumb zone (bottom half of screen). User is doing physical work; this app is secondary.
- **Resumable screens** — User is interrupted mid-task regularly. Every screen must survive interruption and resume cleanly.
- **No `window.confirm()`** — Always custom modals with 48px buttons, destructive action in red.
- **No emoji as sole state indicator** — Always pair with text.

**Field conditions (assume always):** Wet hands, calloused fingers, or gloves. Dust, glare, or condensation on screen. One-handed use. Frequent interruptions. For full UX rules including journey awareness and approval UX constraints, see `CLAUDE_UX` in the Context Strategy.

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

**Cold start:** On day one, the estimator has zero job history. `seed_intelligence.json` provides baseline cost ranges by job category so the tool is useful from the first estimate. As real jobs accumulate, actual data replaces seed data automatically. The seed file is a bridge, not a crutch — real data always wins.

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

*Steps 1–4 complete. Begin at Step 5. Report back when verification passes.*
