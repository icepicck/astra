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
  app.js                  — Core IIFE: data layer, nav, ticket CRUD, settings, search, dashboard, media, notifications (~2,950 lines)
  astra-auth.js           — Authentication IIFE: Supabase Auth, session management, account setup, 2FA/TOTP (~745 lines)
  astra-estimates.js      — Estimates IIFE: builder, price book, intelligence engine, recalc() (~1,495 lines)
  astra-maps.js           — Maps IIFE: Google Maps, Vector route, geocoding, address dedup (~370 lines)
  astra-materials.js      — Materials IIFE: catalog, picker, job materials, bulk templates, material dedup (~725 lines)
  astra-sync.js           — Sync IIFE: Supabase push/pull, realtime subscriptions, media blob sync (~1,065 lines)
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

### IndexedDB: `astra_db` (version 5)

| Store | Key | Contents |
|-------|-----|----------|
| `jobs` | `id` (UUID) | Tickets — address, types[], status, materials[], photos[], drawings[], videos[], techId, techName, notes, techNotes, dates, archived, addressId, manually_added_to_vector. **Step 5 adds:** locked_by, locked_at |
| `techs` | `id` (UUID) | Technicians — name (and eventually phone, license, active) |
| `addresses` | `id` (UUID) | Properties — full address, builder, subdivision, panel info, lat/lng, notes |
| `estimates` | `id` (UUID) | Estimates — address, customer info, materials[], labor, adjustments, overhead, profit, tax, status, linkedJobId |
| `_config` | string key | Material library (rough + trim), price book, cached user profile |
| `_syncMeta` | string key | Dirty flag, sync state, retry queue metadata |
| `notifications` | `id` (UUID) | In-app notifications — type, title, message, jobId, read, createdAt |

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
- 2FA/TOTP via Supabase MFA. Enrollment QR + manual secret in settings. Login challenge screen. Enable/disable toggle.

**Multi-User (implemented in Step 5):**
- Role-based sync filters (tech sees own jobs, supervisor sees all).
- Ticket locking: lock on edit, release on save/timeout. Supervisor force-unlock.
- Custom modals replacing all `confirm()` dialogs. 48px buttons.
- Approval pipeline: tech creates `pending_approval`, supervisor approves/rejects/requests changes.
- RBAC: tech, supervisor, admin roles with scoped permissions.

**Cost Intelligence Protection (implemented in Step 6):**
- Fuzzy address dedup: haversine distance + normalized string matching. Supervisor resolves.
- Material dedup: detect overlaps on same address/same day. Remove/Combine/Keep. `deduplicated` flag.

**Beyond MVP (implemented in Step 7):**
- Media blob sync via Supabase Storage. Upload on push, lazy download on view. Cloud placeholder thumbnails.
- In-app notification center. Bell icon + unread badge. Persistent IDB-backed. Triggered by realtime events.
- Historical job import for cold-start seed data. Variant parsing from name strings.
- Developer settings (admin-only).

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
| D6 | Sync pulls ALL data unfiltered. | Role-based sync filters in astra-sync.js. | 5 | ✅ DONE |
| D7 | Realtime subscriptions have no auth gating. | RLS policies auto-filter realtime. | 5 | ✅ DONE |
| D8 | No automatic sync. | Auto-push on data changes. Persistent retry queue. | 2 | ✅ DONE |
| D9 | Error handler shows ALL errors as red toasts. | Categorized: network/sync → silent. | 2 | ✅ DONE |

### MODERATE — Multi-User Prep

| ID | Issue | Resolution | Step | Status |
|----|-------|-----------|------|--------|
| D10 | `_cache` is global singleton. No invalidation on auth change. | Cache clear + rebuild from IDB on login/logout. | 5 | ✅ DONE |
| D11 | `addJob()` uses `unshift()` — order depends on insert, not date. | Sort by date at render time. | 3 | ✅ DONE |
| D12 | Address matching could create duplicates in multi-user. | Fuzzy match + supervisor resolves near-dupes. | 6 | ✅ DONE |
| D13 | No ticket locking. Two people can edit same ticket. | Lock on edit, release on save/timeout. Supervisor force-unlock. | 5 | ✅ DONE |
| D14 | Individual materials have no unique cloud ID. | Added `material_id` UUID. | 1 | ✅ DONE |
| D16 | `confirm()` dialogs are blocking and hostile on mobile. | Custom modals with 48px buttons. **ELEVATED from Low.** | 5 | ✅ DONE |

### LOW — Polish

| ID | Issue | Resolution | Step | Status |
|----|-------|-----------|------|--------|
| D15 | Material library + price book in localStorage. | Migrated to IDB. | 3 | ✅ DONE |
| D17 | Vector board midnight clear only runs on app init. | Check on goTo or set midnight setTimeout. | 3 | ✅ DONE |
| D18 | Media blobs are device-local only. | Supabase Storage sync. Upload on push, lazy download on view. | 7 | ✅ DONE |
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
STEP 5: MULTI-USER            ✅ COMPLETE
STEP 6: COST INTEL PROTECTION ✅ COMPLETE
STEP 7: BEYOND MVP            ✅ COMPLETE
```

**ALL STEPS COMPLETE.** Full roadmap shipped.

---

### STEPS 1–7: ALL COMPLETE ✅

All steps implemented and verified. Summary:

- **Step 1 (Data Safety):** Estimates sync bidirectionally. Materials survive interrupted push. Pricebook saves clean.
- **Step 2 (Infrastructure):** Airplane mode → create 5 jobs + materials + estimate → reconnect → all syncs automatically. Zero error toasts during offline. Retry queue persists across restart.
- **Step 3 (Housekeeping):** Fresh install — no "Mike Torres." Material library in IDB. Jobs sort by date. Supabase client vendored.
- **Step 4 (Authentication):** Cross-account isolation verified. RLS blocks direct API queries. Logout clears cache, login rebuilds.
- **Step 5 (Multi-User):** Role-based sync (D6/D7), ticket locking (D13), cache invalidation (D10), custom modals (D16). RBAC: tech/supervisor/admin. Approval pipeline with three-second rule. Lock-on-edit with supervisor force-unlock.
- **Step 6 (Cost Intel Protection):** Fuzzy address dedup via geocode proximity + normalized string (D12). Material dedup with supervisor resolution: Remove/Combine/Keep. `deduplicated` flag gates cost intelligence.
- **Step 7 (Beyond MVP):** Media blob sync via Supabase Storage (D18) — upload on push, lazy download on view. In-app notification center — persistent IDB-backed notifications for approvals, rejections, lock takeovers, assignments with bell icon + badge. 2FA/TOTP via Supabase MFA — enrollment QR, login challenge, enable/disable in settings. Historical job import for cold-start. Developer settings (admin-only).

#### Architecture Decisions (locked, implemented)

1. **Lock state = columns on jobs table** (`locked_by`, `locked_at`) — NOT a separate table.
2. **Approval queue = filtered view on existing job list + nav badge** — NOT a new screen.
3. **Address pull = unfiltered within account** — job pull enforces scope.
4. **Force-unlock = supervisor nulls `locked_by` directly via RLS** — no separate policy.
5. **Media sync = Supabase Storage** — `job-media` private bucket, RLS by account_id path prefix. Upload during push, lazy download on view.
6. **Notifications = IDB-persisted** — triggered from realtime events, capped at 100, bell icon in nav.
7. **2FA = Supabase native MFA** — TOTP enrollment/challenge/verify, no custom secret storage.

#### RBAC

| Role | Scope | Creates As | Approves | Manages Users | Dev Settings |
|------|-------|-----------|---------|--------------|-------------|
| Tech | Own + pending | `pending_approval` | No | No | No |
| Supervisor | All account | `active` | Yes | No | No |
| Admin | All account | `active` | Yes | Yes | Yes |

---

### FUTURE — Beyond Roadmap
Not part of any current step. Ideas for later.

Admin dashboard, anonymized market data as secondary revenue, sync rate limiting, push notifications (browser/OS-level).

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

*All steps complete. Full roadmap shipped. ASTRA is a multi-user, cloud-synced, 2FA-secured cost intelligence engine.*
