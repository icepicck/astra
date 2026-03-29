# ASTRA CONTEXT STRATEGY — RATIFIED
## Token-Aware Development Framework
### Ratified: March 29, 2026 — All Hands Unanimous
### Amended: March 29, 2026 — Sonnet Audit v1.0 (6 corrections applied)
### Amended: March 29, 2026 — v4.0 Alignment (CLAUDE_lean.md → CLAUDE.md, cheat sheet maintenance pass for Steps 1–4 completion)
### Authority: Supplements CLAUDE.md. Where this document addresses context selection and task routing, it governs. Where CLAUDE.md addresses architecture, defects, and execution sequence, CLAUDE.md governs. No contradictions between them.
### Security: This document contains NO credentials. No API keys. No URLs with tokens. Keep it that way.

---

## PURPOSE

Use Opus once to fracture the problem. Create explicit decision rules so subsequent Claude interactions (Sonnet/Haiku/Code) know exactly what context they need — nothing more, nothing less.

**Result:** Same code quality. ~60–70% less token burn on routine work. Faster execution. A solo founder competing at 3x the effective output of his token budget.

---

## THE DECISION TREE

When a new ASTRA task arrives, follow this:

```
Is this work on ASTRA?
  ├─ No → Answer conversationally. Don't load profiles.
  │
  └─ Yes → What's the task?
      │
      ├─ Does it touch anything on the FLYWHEEL TRIPWIRE list?
      │   └─ Yes → Escalate to Profile 2 minimum, regardless of how "routine" it looks.
      │
      ├─ Does it touch anything on the SECURITY TRIPWIRE list?
      │   └─ Yes → Escalate to Profile 2 minimum, regardless of how "routine" it looks.
      │
      ├─ Does the output render on screen (HTML, CSS, toast, label, anything visible)?
      │   └─ Yes → Include CLAUDE_UX rules alongside whatever profile applies.
      │
      ├─ Routine (add material, fix typo, update docs)?
      │   └─ PROFILE 1: Code snippet + CLAUDE_ROUTINE rules
      │
      ├─ Single module (bug, feature, refactor)?
      │   └─ PROFILE 2: Full module + module cheat sheet + module verification
      │
      ├─ Integration or multi-module (2+ files, data flow changes)?
      │   └─ PROFILE 3: Relevant code + CLAUDE_ARCHITECTURE rules + integration verification
      │
      └─ Architectural decision or new phase?
          └─ PROFILE 4: Full CLAUDE.md + all relevant code + architectural verification
```

---

## CONTEXT PROFILES

### PROFILE 0: CUSTOMER SUPPORT (Reserved — build when first customer ships)

**Applies to:** User reports a problem. "My job disappeared." "Sync isn't working." "Estimate shows wrong total."

**What to send:** Current data model summary, sync behavior summary, three most common data-not-showing scenarios. ~300 tokens.

**Status:** Slot reserved. Not yet built. Build before first paying customer.

---

### PROFILE 1: ROUTINE WORK

**Applies to:** Material catalog adds, UI tweaks, non-logic bug fixes, documentation updates, simple edits.

**What to send:**
- Task description
- Relevant code snippet only (the function or section being edited)
- CLAUDE_ROUTINE rules (below)
- CLAUDE_UX rules (below) IF the change is user-visible

**What NOT to send:** Full CLAUDE.md, unrelated modules, historical context, verification checklists.

**Token budget:** ~500–1,000 input tokens.

**Example:** "Add 'LB/FT Aluminum Conduit' to the trim materials catalog. Here's astra-materials.js lines 140–200."

---

### PROFILE 2: MODULE WORK

**Applies to:** Fixing logic bugs in one module, adding features to one module, refactoring a single file. Also: any task escalated by flywheel or security tripwires.

**What to send:**
- Task description
- The full module file(s) being edited
- The module's cheat sheet (CLAUDE_SYNC, CLAUDE_ESTIMATES, etc.)
- Module verification checklist
- CLAUDE_UX rules IF the change is user-visible

**What NOT to send:** Other modules (unless they're consumers/producers of the data being changed), full CLAUDE.md.

**Token budget:** ~2,000–4,000 input tokens.

**Example:** "The realtime handler in astra-sync.js doesn't process material table changes. Here's the full sync module. Follow CLAUDE_SYNC rules."

---

### PROFILE 3: INTEGRATION WORK

**Applies to:** Work touching 2+ modules, data flow changes, sync behavior changes, approval pipeline, any cross-module wiring.

**What to send:**
- Task description
- Current code from both/all modules involved
- CLAUDE_ARCHITECTURE rules
- Integration verification checklist
- CLAUDE_UX rules IF the change is user-visible

**What NOT to send:** Full CLAUDE.md, modules not involved in the integration.

**Token budget:** ~3,000–6,000 input tokens.

**Example:** "Wire the approval workflow in astra-sync.js to update the job list in app.js when a supervisor approves a ticket. Here's both modules."

---

### PROFILE 4: ARCHITECTURAL DECISION (Opus only)

**Applies to:** New phases, permission system overhaul, data model changes, security hardening, major refactor, intelligence engine rework, integration of 3+ modules.

**What to send:**
- Full CLAUDE.md
- All relevant code
- Problem statement with trade-offs
- Architectural verification checklist

**Token budget:** ~8,000–15,000 input tokens. Expensive. Rare.

**Example:** "We're starting Step 5: Multi-User. How should checkout locking, role-based sync filtering, and the approval pipeline wire together? Here's everything."

---

## TASK-TO-PROFILE ROUTING TABLE

| Task Type | Profile | Model | Approx. Tokens | Include UX? |
|-----------|---------|-------|-----------------|-------------|
| Add material to catalog | 1 | Haiku/Sonnet | 500 | No |
| Fix UI bug (style, layout) | 1 | Haiku/Sonnet | 600 | **Yes** |
| Fix button text or label | 1 | Haiku/Sonnet | 400 | **Yes** |
| Update docs or comments | 1 | Haiku/Sonnet | 400 | No |
| Debug single function | 2 | Sonnet | 2,500 | If visible |
| Add feature to one module | 2 | Sonnet | 3,000 | If visible |
| Refactor one module | 2 | Sonnet | 3,500 | If visible |
| Flywheel-adjacent routine task | 2 | Sonnet | 2,500 | If visible |
| Security-adjacent routine task | 2 | Sonnet | 2,500 | If visible |
| Wire two modules together | 3 | Sonnet | 4,500 | If visible |
| Approval pipeline work | 3 | Sonnet | 5,000 | **Yes** |
| Sync architecture changes | 3 | Sonnet/Opus | 5,000 | No |
| New phase (C, D, etc.) | 4 | Opus | 12,000 | Depends |
| Permission system overhaul | 4 | Opus | 10,000 | **Yes** |
| Intelligence engine rework | 4 | Opus | 15,000 | If visible |
| Data model migration | 4 | Opus | 10,000 | No |
| Schema change (add/remove columns, all tables) | 4 | Opus | 10,000 | No |
| **Step 5 Tasks** | | | | |
| Custom modal replacement (D16) | 2 | Sonnet | 3,000 | **Yes** |
| Checkout locking implementation (D13) | 3 | Sonnet/Opus | 5,000 | **Yes** |
| Role-based sync filters (D6+D7) | 3 | Sonnet/Opus | 5,000 | No |
| Cache invalidation on auth change (D10) | 2 | Sonnet | 3,000 | No |
| Approval pipeline UI | 3 | Sonnet | 5,000 | **Yes** |
| Nav badge for pending approvals | 2 | Sonnet | 2,500 | **Yes** |

---

## TRIPWIRES — SELF-ROUTING ESCALATION

These lists enable automatic escalation. If a task looks like Profile 1 but touches a tripwire, it becomes Profile 2 minimum. The model reads these, recognizes the intersection, and upgrades itself. No human decision needed.

---

### NAMED TRIPWIRE RULE — READ THIS FIRST

**There are two kinds of tripwire hits: adjacency hits and named hits. They are not the same.**

- **Adjacency hit:** The task is near a protected area. Profile 2 minimum. Proceed with appropriate cheat sheets.
- **Named hit:** The task explicitly names a function, field, or behavior that appears verbatim on the flywheel or security tripwire list below. **Profile 3 floor. Hard human gate. Do NOT write code until Robert types "proceed" in the current session after seeing the plan.**

**Named flywheel functions — memorize these. Any task naming one of these directly is a named hit:**
- `recalc()`
- `_querySimilarJobs()`
- `_queryAddressJobs()`
- `_getPropertyIntel()`
- `_renderIntelSection()`
- `_renderComparison()`
- `_renderAccuracyMetrics()`

"I'll flag it before proceeding" is NOT a gate. The gate is Robert typing "proceed" after seeing the plan. No exceptions. A wrong change to any named function silently poisons every future estimate — plausible-looking wrong numbers are worse than obvious errors.

---

### FLYWHEEL TRIPWIRES

If the task touches ANY of the following, escalate to Profile 2 minimum:

- `materials[]` structure on jobs (feeds intelligence engine via `_querySimilarJobs`)
- `types[]` on jobs (primary grouping key for cost intelligence)
- `addressId` linking between jobs and addresses (secondary intelligence axis)
- Estimate status flow: Draft → Sent → Accepted → linked to job
- `recalc()` inputs, outputs, or calculation chain
- `_querySimilarJobs()` or `_queryAddressJobs()` logic, inputs, or outputs
- `_getPropertyIntel()` data sources
- `_renderIntelSection()` display logic
- `_renderComparison()` or `_renderAccuracyMetrics()` (Phase D feedback loop)
- Any field that feeds into cost averages or material frequency counts
- Material dedup logic (affects what data enters the intelligence engine)
- Job type definitions, categories, or grouping logic
- Job status transitions in approval pipeline (Step 5 — only `completed` jobs feed cost intelligence; wrong status flow = wrong data in averages)

**Why:** The intelligence engine is the product. Job tracking is the data acquisition layer. Anything that changes what data enters the engine, how it's grouped, or how it's surfaced risks poisoning the flywheel. A Haiku instance with only CLAUDE_ROUTINE doesn't know this. Profile 2 with the estimates or materials cheat sheet does.

**NOT a flywheel trigger — do NOT escalate for these:**
- Material picker UI bugs (search filter not returning results, display issues, layout problems)
- Material list render bugs
- Any bug where the symptom is visual and the fix is in display/filter logic only

These tasks touch `astra-materials.js` but do NOT modify `materials[]` structure on jobs, dedup logic, or cost intelligence inputs. Route by module scope only (Profile 1 or 2). Firing the flywheel tripwire on picker UI bugs trains alert fatigue — save it for real hits.

### SECURITY TRIPWIRES

If the task does ANY of the following, escalate to Profile 2 minimum:

- Exposes a new function on `window` (API surface expansion)
- Modifies IndexedDB read/write patterns or store schemas
- Changes how the Supabase client is created, configured, or used
- Adds any new external URL, fetch call, or network request
- Modifies auth flow, login, logout, session handling, or token storage
- Changes service worker caching behavior or fetch interception
- Modifies RLS policies or Supabase table permissions
- Adds or changes any data that gets pushed to cloud
- Changes how `_cache` is populated, cleared, or invalidated
- Touches `_currentUser`, `getAccountId()`, or role-checking logic
- Modifies `locked_by`, `locked_at`, or force-unlock logic (Step 5 — checkout semantics are a write-protection boundary)
- Changes role-based sync filters or pull scope (Step 5 — the sync filter IS the security model)

**Why:** A "routine" task that adds a `window`-exposed function is an attack surface expansion. A task that changes IDB read patterns is a data access change. These aren't flywheel risks — they're security risks. The model must know when it's crossing a security boundary.

**New `window.Astra.*` helper functions — routing note:**
When adding a new function exposed on `window.Astra` (security tripwire: API surface expansion), route to Profile 2 with CLAUDE_ARCHITECTURE + the relevant section of app.js ONLY. Do NOT include module cheat sheets for modules the function doesn't touch. Escalation does not mean send everything — it means send the right things. A data access helper in app.js does not need CLAUDE_ESTIMATES.

---

## MODULE CHEAT SHEETS

Each sheet is ~150–250 tokens. Include ONLY the relevant sheet per task. Every sheet follows the same structure: Rules, Key Patterns Already Implemented, Do Not, Verification.

**Standalone files:** Each cheat sheet is available as a separate file in `/docs/` (e.g., `/docs/CLAUDE_SYNC.md`). Claude Code loads the one it needs. The canonical versions are maintained below and in those files — keep them in sync after every Step completion.

---

### CLAUDE_ROUTINE

```
## QUICK RULES FOR ROUTINE WORK

**Non-negotiable:**
- 48px minimum tap targets. No exceptions.
- Orange (#FF6B00) for actions ONLY. No decorative orange.
- ALL-CAPS for headers, labels, status indicators.
- No dependencies. No frameworks. No build tools.
- Comment WHY, not WHAT. Maintainer thinks in electrical systems, not CS.
- Test in airplane mode before submitting.

**Data layer rules:**
- Write to _cache first (synchronous), then IDB (write-through).
- If modifying a job: use updateJob(id, updates) — it handles cache + IDB + dirty flag.
- If modifying an address: use updateAddress(id, updates).
- If modifying an estimate: use saveEstimate(est).
- Never write directly to IDB. Always go through the CRUD functions in app.js.

**Before submitting:**
- Check FLYWHEEL TRIPWIRES above. If your task intersects, stop — escalate to Profile 2.
- Check SECURITY TRIPWIRES above. If your task intersects, stop — escalate to Profile 2.
- If your change is user-visible, apply CLAUDE_UX rules.

**NOT a CLAUDE_ROUTINE task — escalate to Profile 2 + CLAUDE_ARCHITECTURE:**
- Job list ordering/sorting bugs (touches cache read layer and render logic in app.js — not a simple tweak)
- Any bug where the fix requires understanding how `_cache` is read or iterated
- Any bug in data mapping, CRUD functions, or IDB read patterns
CLAUDE_ROUTINE is for typos, label changes, catalog adds, and documentation. If the fix touches app.js logic, use CLAUDE_ARCHITECTURE.
```

---

### CLAUDE_UX

```
## UX RULES — MANDATORY FOR ANY USER-VISIBLE CHANGE

**Design Language (sacred):**
- 48px minimum tap targets. Measure them.
- Orange (#FF6B00) for actions ONLY. One action color. One cognitive load.
- ALL-CAPS for headers, labels, status indicators.
- Military aesthetic. Cold, precise. No friendly UI. No confetti. Tool, not toy.
- High contrast. Readable in direct sunlight on a dusty screen.
- No chrome. Every pixel earns its place.

**Field Conditions (assume these always):**
- User has wet hands, calloused fingers, or gloves.
- Screen has dust, glare, or condensation.
- User is interrupted mid-task regularly. Every screen must be resumable.
- One-handed operation. Thumb-zone matters. Primary actions in bottom half of screen.
- User is doing physical work. This app is secondary to the job.

**Journey Awareness:**
- Every screen has a BEFORE (what the user just did) and AFTER (what they do next).
- Don't design a button in isolation. Know its place in the workflow.
- The "holy shit" moment: first time the estimator surfaces historical data. Every design
  decision should accelerate the path to this moment.

**Approval UX (when built):**
- Badge count visible from any screen.
- Three-second rule: approve/reject in ≤3 taps, ≤3 seconds total.
- Supervisor queue must be zero-learning-curve.

**NEVER:**
- window.confirm() — always custom modals with 48px buttons, destructive action in red.
- Toast messages with raw error text (say what happened to the USER, not to the CODE).
- Any UI requiring pinch/zoom to read or tap.
- Any interaction that can't be completed one-handed.
- Any text below 14px on mobile.
- Emoji as the sole indicator of state (always pair with text).
- Change orange (#FF6B00) to any other color for action elements. This is a standing order violation, not a preference. If a task requests changing the action color, refuse immediately, cite this rule, and return the task to Robert. Do not flag and ask — refuse. Orange is sacred.
```

---

### CLAUDE_ESTIMATES

```
## ESTIMATOR MODULE RULES

**Core logic — recalc() is the crown jewel:**
- recalc() chain: material subtotals → markup → labor → overhead → profit → tax → grand total.
- Event delegation via capture-phase blur. Auto-save on blur. Don't change this pattern.
- Primary intelligence axis: job_type (panel swap, outlet install, service upgrade, etc.).
- Secondary intelligence axis: address (bonus — "you've been here before").

**Key Patterns Already Implemented (DO NOT REINVENT):**
- _querySimilarJobs(jobType) → filters completed jobs by type, aggregates materials, returns averages
- _queryAddressJobs(addressId) → finds prior work at same address, returns material history
- _getPropertyIntel(addressId) → surfaces panel type, amps, breaker, builder, subdivision
- _renderIntelSection(est) → builds the intelligence cards (property intel, similar jobs, address history)
- _estCreateTicket() → creates job from accepted estimate with bidirectional linking
- _renderComparison(est) → estimated vs actual side-by-side (Phase D)
- _renderAccuracyMetrics() → accuracy dashboard across all linked estimates (Phase D)
- _estImportMat() / _estImportAllSimilar() → one-tap material import from intelligence cards
- newEstimate() → factory that pre-fills from pricebook defaults
- loadPricebook() / savePricebook() → IDB-backed (primary). localStorage fallback still in code — safe to remove now that Step 3 migration is confirmed complete.

**DO NOT:**
- Refactor recalc() unless specifically tasked and in Profile 2+.
- Change how _querySimilarJobs groups by job type (it's the primary intelligence axis).
- Add new material fields without updating both estimateToCloud() and estimateFromCloud() in sync.

**Verification:**
- Does the change improve accuracy or speed of estimation?
- Does it risk poisoning cost intelligence (wrong data entering averages)?
- Can you prove correctness with three test cases (zero jobs, 5 jobs, 50 jobs of same type)?
- Does recalc() still produce correct grand total after your change?
```

---

### CLAUDE_SYNC

```
## SYNC & OFFLINE MODULE RULES

**Core invariant:** Local state is ALWAYS canonical. IndexedDB is source of truth. Supabase is
cloud backup. App must function with zero network indefinitely. Sync is background convenience.
Network failure = sync delay, not outage.

**Key Patterns Already Implemented (DO NOT REINVENT):**
- _markDirty() → sets IDB _syncMeta flag + triggers _debouncedAutoSync (3s debounce)
- _runAutoSync() → guards: dirty, online, configured, not already syncing. Exponential backoff on failure (5s → 60s cap).
- _clearDirty() → clears IDB flag on successful sync
- _startupDrain() → checks for dirty flag from previous session on boot, auto-syncs after 5s delay
- _filterByTimestamp(records, cloudTimes, field) → compares local updated_at vs cloud, skips if cloud is newer
- _ensureMaterialIds(jobs) → backfills missing UUIDs on materials before push
- batchUpsert(table, records, conflictCol) → chunks of 500, onConflict resolution
- _getCloudTimestamps(table) → fetches all cloud id + updated_at for comparison
- startRealtime() → subscribes channel to jobs, addresses, techs, estimates on postgres_changes
- _handleRemoteChange(table, payload) → local-wins timestamp check, updates cache + IDB
- _updateSyncIndicator(state) → ambient dot: synced/pending/syncing/offline/hidden
- Online/offline listeners → auto-trigger sync on reconnection after 2s stabilization delay
- Supabase client singleton: window._astraSupabaseClient (auth module owns creation, sync borrows)

**Field mapping convention:**
- Local: camelCase (jobType, techNotes, addressId)
- Cloud/Postgres: snake_case (job_type, tech_notes, address_id)
- Every entity has a toCloud() and fromCloud() mapper function
- account_id is injected via _acctId() on every cloud write

**DO NOT:**
- Convert var → const/let inside IIFEs (compatibility pattern, intentional).
- Convert function declarations → arrow functions in IIFEs (hoisting + this binding).
- Add async/await to _idbPut (IDB transaction timing is sensitive to microtask ordering).
- Change the push order: addresses → techs → jobs → materials → estimates (FK dependencies).
- Remove the _syncCooldown window (prevents realtime echo after push).
- Create a second Supabase client — always use window._astraSupabaseClient.

**Known gaps (documented, not yet fixed):**
- _handleRemoteChange has no handler for 'materials' table events (P0 — fix before multi-user)
- Tech pull mutates _cache.techs directly without IDB write-through (P0 — fix before multi-user)
- Pull does select('*') on all tables — no incremental sync yet (P1 — fix before 500+ jobs)
- Pull doesn't handle cloud-side deletions (P1 — need soft delete strategy for multi-user)
- addrFromCloud() doesn't preserve createdAt (moderate)
- savePricebook() dual-writes to IDB and localStorage (safe to remove localStorage write — Step 3 migration confirmed complete)

**Verification:**
- Does the app still function in airplane mode after your change?
- Does auto-sync trigger within 3 seconds of a data write (when online)?
- Does the dirty flag persist across app restart?
- Is timestamp protection preserved (local-wins when local is newer)?
```

---

### CLAUDE_AUTH

```
## AUTHENTICATION MODULE RULES

**Boot sequence:** initDataLayer() → autoLoadBuiltInLibraries() → openMediaDB() → migrateLegacyMedia() → checkAuth() → [if authenticated] renderJobList() + cleanOrphanedMedia() + startupDrain() | [if not] showLogin()

**Key Patterns Already Implemented (DO NOT REINVENT):**
- checkAuth() → checks Supabase session, falls back to IDB cached user for offline
- _loadUserProfile(authUserId) → fetches from Supabase 'users' table
- _saveCachedUser(user) / _clearCachedUser() → IDB _config store persistence
- login(email, password) → signInWithPassword → loadProfile → rebuildFromCloud → navigate to jobs
- signup(email, password, name, accountName) → creates auth user + account + user profile
- logout() → clears cached user, clears cache, clears IDB stores, stops realtime, signs out
- inviteTech(email, name) → creates 'invited' row in users table for later signup linking
- _rebuildFromCloud() → full pull after login to populate local data from account's cloud data
- DEFAULT_ACCOUNT_ID → first signup claims it, subsequent signups create new accounts

**DO NOT:**
- Store credentials, tokens, or session data in any cheat sheet or instruction document.
- Trust cached user data for authorization decisions on cloud writes (RLS enforces server-side).
- Modify the logout → clearCache → clearAllStores sequence (prevents data bleed between accounts).
- Allow any auth state change without stopping and restarting realtime subscriptions.

**Standing order from Robert:** Step 4 Auth is verified and complete. Real customer data is now permissible with auth active. All writes must go through authenticated sessions with RLS enforcement.

**Verification:**
- Login → data loads from cloud → app functions normally.
- Logout → all local data cleared → login screen shown → no data from previous session visible.
- Offline with cached session → app functions with cached data.
- Different account login → zero data bleed from previous account.
```

---

### CLAUDE_MATERIALS

```
## MATERIALS CATALOG MODULE RULES

**Catalog structure:**
- 222 total items: rough-in (95 items) + trim-out (127 items)
- Source files: rough_materials.json, trim_materials.json
- Each item: code, name, category, unit, estimatedCost, variants (optional)
- Variant support: toggle/decora, breaker brands (Eaton/Square D/Siemens), part refs
- Categories: Wire, Boxes, Devices, Connectors, Conduit, Fittings, Panels, Breakers, etc.

**Key Patterns Already Implemented (DO NOT REINVENT):**
- autoLoadBuiltInLibraries() → fetches JSON catalogs, merges into IDB config
- loadMaterialLibrary() → merges rough + trim from _configCache
- Material picker: searchable overlay, category-filtered, variant selection
- Frequent flyers: auto-surfaces top 10 most-used materials per job
- Bulk templates: pre-built material lists for common job types
- "Previously at this address": surfaces materials from prior jobs at same address

**DO NOT:**
- Duplicate material codes across rough and trim catalogs.
- Remove variant support (electricians need brand-specific part selection).
- Change the materialId UUID pattern (sync depends on it for upsert).
- Modify material structure without updating jobToCloud/jobFromCloud mappers in sync.

**Verification:**
- New material appears in picker search.
- Material has correct code, name, category, and unit.
- Catalog loads correctly offline (from IDB, not network).
- Adding material to job triggers _markDirty() for auto-sync.
```

---

### CLAUDE_ARCHITECTURE

```
## SYSTEM ARCHITECTURE OVERVIEW (~250 tokens)

**Data layer:**
- IndexedDB astra_db (version 4): jobs, techs, addresses, estimates, _config, _syncMeta
- IndexedDB astra_media (version 1): blobs (photos, drawings, videos)
- localStorage: settings only (gmaps key, home base, supabase URL/key, last sync, nav frequency)
- In-memory _cache: synchronous read layer. All UI reads from _cache. IDB is write-through.

**Module communication:**
- app.js → sets window.Astra namespace (core data/nav CRUD)
- astra-estimates.js → reads window.Astra, exposes estimator + intelligence functions
- astra-materials.js → reads window.Astra, exposes catalog + picker functions
- astra-maps.js → reads window.Astra, exposes Google Maps + Vector routing
- astra-sync.js → reads window.Astra, handles Supabase push/pull/realtime
- astra-auth.js → reads window.Astra, handles Supabase Auth + session management
- Each module is an IIFE. No circular dependencies. Public API exposed on window.

**Boot sequence:**
initDataLayer() → autoLoadBuiltInLibraries() → openMediaDB() → migrateLegacyMedia()
→ checkAuth() → [if authenticated] renderJobList() + cleanOrphanedMedia() + startupDrain()

**Service worker (sw.js):**
- Cache-first for same-origin (app shell assets)
- Network-first with 3s timeout for external (Google Maps, Supabase)
- Version-bumped (CACHE_NAME = 'astra-v63')
- Update: silent reload when idle, orange banner when busy

**Key invariant:** Local state is truth. Network failure = sync delay, not outage.

**File sizes (current):**
- index.html: 64K (HTML + CSS, no JS)
- app.js: 93K (~2,200 lines)
- astra-estimates.js: 63K (~1,460 lines)
- astra-materials.js: 28K (~620 lines)
- astra-maps.js: 14K (~200 lines)
- astra-sync.js: 26K (~700 lines)
- astra-auth.js: 19K (~520 lines)
```

---

### CLAUDE_PERMISSIONS

```
## PERMISSION & APPROVAL RULES

**RBAC Model:**

| Role | Data Scope | Creates Jobs As | Approves | Manages Users | Dev Settings |
|------|-----------|----------------|---------|--------------|-------------|
| Tech | Own + pending | pending_approval | No | No | No |
| Supervisor | All account | active | Yes | No | No |
| Admin | All account | active | Yes | Yes | Yes |

**Two creation paths:**
- Tech Discovery: tech finds work → creates ticket → status: pending_approval → enters supervisor queue
- Supervisor Dispatch: supervisor creates and assigns → status: active → appears for tech immediately

**Approval pipeline:**
- Approve → status: active, assigned to tech
- Request Changes → stays pending, reason logged, tech notified
- Reject → status: archived, reason logged

**Three-second rule:** Supervisor approval must complete in ≤3 taps, ≤3 seconds. If the supervisor
experience is clunky, they'll ignore the queue and the entire multi-user model collapses.

**Checkout locking (Step 5):**
- Lock on edit: locked_by + locked_at written to record
- Release on save or 30-minute timeout
- Supervisor can force-unlock
- DB write protection: WHERE locked_by = current_user_id (lock mismatch = write fails)
- UI: your ticket = edit, someone else's = read-only + "Locked by [Name]", supervisor = "Take Over"

**Sync filtering by role (Step 5):**
- Tech: WHERE (assigned_to = user AND status = 'active') OR (created_by = user AND status = 'pending_approval')
- Supervisor/Admin: WHERE account_id = current_account_id
- RLS auto-filters realtime subscriptions when auth is active
```

---

## VERIFICATION CHECKLISTS

Use the right checklist for the work type. Don't over-verify routine work. Don't under-verify integration work.

### ROUTINE VERIFICATION (Profile 1)
```
- [ ] Tested offline (airplane mode)
- [ ] No external dependencies added
- [ ] 48px tap targets (if UI change)
- [ ] Orange only for actions (if UI change)
- [ ] Code commented (WHY, not what)
- [ ] No contradictions with CLAUDE.md
- [ ] Checked flywheel tripwires — not applicable
- [ ] Checked security tripwires — not applicable
```

### MODULE VERIFICATION (Profile 2)
```
- [ ] Tested offline
- [ ] No new dependencies
- [ ] Module-specific logic preserved (except intended change)
- [ ] IDB schema unchanged (unless the task specifically requires it)
- [ ] Module cheat sheet patterns respected (didn't reinvent existing functions)
- [ ] "DO NOT" items in cheat sheet not violated
- [ ] No regressions in related features
- [ ] Flywheel protected (intelligence engine inputs unchanged unless intended)
```

### INTEGRATION VERIFICATION (Profile 3)
```
- [ ] Both/all modules tested together offline
- [ ] Data flows correctly in both directions
- [ ] No race conditions on shared state (use checkout semantics for conflicts)
- [ ] Supervisor approval ≤3 seconds (if approval-related)
- [ ] No new dependencies between modules
- [ ] Cost intelligence protected (materials feed only if clean)
- [ ] State mutation is explicit (don't hide updates in nested calls)
- [ ] Regression check: 3 unrelated features still function correctly
```

### ARCHITECTURAL VERIFICATION (Profile 4)
```
- [ ] No frameworks introduced
- [ ] No new runtime dependencies
- [ ] Offline-first preserved
- [ ] All three verification levels above pass
- [ ] CLAUDE.md updated to reflect new architecture
- [ ] Module cheat sheets updated if patterns changed
- [ ] All contradictions purged from codebase and docs
- [ ] Step verification checklist from CLAUDE.md passes
```

---

## CHEAT SHEET MAINTENANCE PROTOCOL

The cheat sheets are instruction sets, not documentation. A wrong function name causes wasted tokens and hallucinated code. They must stay current.

### After Every Codebase Change:
```
- [ ] Every function name in cheat sheets exists in current codebase
- [ ] Every "DO NOT" item is still accurate
- [ ] No rule contradicts CLAUDE.md standing orders
- [ ] Flywheel tripwire list matches current intelligence engine inputs
- [ ] Security tripwire list matches current attack surface
```

### After Every Step Completion (Step 4, Step 5, etc.):
```
- [ ] New module cheat sheet created if new module was added
- [ ] Existing cheat sheets updated with new patterns ("already implemented" lists)
- [ ] "Known gaps" sections updated (fixed items removed, new items added)
- [ ] Routing table updated if new task types emerged
- [ ] Verification checklists updated if new invariants were established
- [ ] Standalone files in /docs/ synced with inline versions in this document
- [ ] Version date on this document updated
```

### Review Cadence:
- **Weekly (first month):** Track ROI metrics, calibrate tripwires
- **After every Step completion:** Full cheat sheet verification
- **Monthly (after first month):** Spot-check cheat sheets against codebase

---

## ROI TRACKING

After one week of using this framework, measure:

| Metric | Target | If Missed |
|--------|--------|-----------|
| Tasks completed per day | Increase vs. pre-strategy baseline | Cheat sheets may be too thin — add more "already implemented" context |
| Rework rate (tasks needing second pass due to wrong context) | Below 10% | Cheat sheets need more detail or tripwires need refinement |
| Escalation accuracy (tripwires catching Profile 1 tasks that should be Profile 2) | Above 80% | Tripwire lists need expansion |
| Token cost per completed task by profile | Profile 1: <1K, Profile 2: <4K, Profile 3: <6K | Context being over-loaded — trim what's being sent |

Calibrate weekly for the first month. Monthly after that. The numbers will tell you if the strategy is working.

---

## WHAT THIS BUYS ASTRA

- **60–70% less token burn** on routine work (the bulk of daily development)
- **Same code quality** because constraints are explicit and patterns are documented
- **Faster responses** from Claude (smaller context = faster processing)
- **Self-routing escalation** via tripwires (the model protects the flywheel and security surface without human intervention)
- **Predictable token budget** (you know what each task type costs before you start)
- **Institutional memory** that survives across sessions (cheat sheets carry forward what Opus figured out)
- **Competitive leverage** — a solo founder operating at 3x effective output of his compute budget

---

## STANDING ORDERS

1. **All Claude interactions on ASTRA follow the profile routing system.** No exceptions.
2. **The decision tree is the first thing evaluated on every task.** Before writing code, before reading files, before anything — route the task.
3. **Tripwires are self-enforcing.** If the model recognizes a flywheel or security tripwire, it escalates. It does not ask permission. It does not downgrade because the user said "it's quick."
4. **CLAUDE_UX rules apply to EVERY user-visible change.** If it renders on screen, UX rules are in play.
5. **No credentials in any cheat sheet or instruction document.** Ever. For any reason.
6. **Cheat sheets are maintained after every Step completion.** Stale cheat sheets are worse than no cheat sheets.
7. **CLAUDE.md remains the supreme authority** on architecture, defects, execution sequence, and design language. This document governs context selection and task routing only. Where they overlap, CLAUDE.md wins.
8. **When in doubt, escalate.** Profile 2 is always safer than Profile 1. Profile 4 is always safer than Profile 3. The cost of over-sending context is tokens. The cost of under-sending is rework or flywheel damage.

---

## SIGNATURES

| Member | Role | Vote | Condition |
|--------|------|------|-----------|
| Robert Farrell | CEO / Creator | **RATIFIED** | — |
| Kaz Volkov | Architecture Lead | **RATIFIED** | Cheat sheets must include "already implemented" patterns and "DO NOT" lists |
| Dr. Marcus Bellweather | UX Lead | **RATIFIED** | CLAUDE_UX is mandatory for all user-visible changes |
| Duncan Marsh | QA Lead | **RATIFIED** | Cheat sheet verification protocol enforced after every Step completion |
| Silas Crenshaw | Security | **RATIFIED** | Security tripwires and no-credentials rule are non-negotiable |
| Derek Shah | Finance & Strategy | **RATIFIED** | ROI tracking after week one; Profile 0 slot reserved for customer support |

---

*Ratified unanimously. Effective immediately. Steps 1–4 complete — cheat sheet maintenance pass applied. Next review after Step 5 completion.*

*Ad Astra.*
