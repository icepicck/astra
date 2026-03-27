# CLAUDE.md — ASTRA Project Briefing v2

**Read this entire file before touching anything.**

---

## WHAT IS ASTRA

ASTRA is a cost intelligence engine for electrical contractors. It tracks jobs because job tracking is how it learns what things actually cost. Every logged job feeds back into the estimator. Every material used at an address becomes historical data. Every quote improves the next one.

**ASTRA is NOT a job tracker that added quoting. The estimator is the core product. Job tracking is the data acquisition layer.**

The target user is solo electricians and small shops (1-6 techs) who bleed margin because they don't have historical cost data, material pricing consistency, quick quoting workflows, or address-level intelligence.

**The product moment everything builds toward:** A supervisor pulls up a new job at an address the shop has serviced before. ASTRA says "last time we were here, it was 3 breakers, 50 feet of 12/2, took 4.5 hours." The estimate writes itself. That is the moment this product earns word-of-mouth. Every architectural decision exists to make that moment faster, more accurate, and more reliable over time.

---

## ARCHITECTURE — READ THIS CAREFULLY

### The Non-Negotiable Constraints

**1. Single HTML file. No exceptions.**
ASTRA is one HTML file. No React. No Vue. No Angular. No build step. No bundler. No node_modules. No npm. Vanilla JavaScript, vanilla CSS, inline in one file. A tech opens a URL and it works. If you are tempted to introduce a framework, a build tool, or a package manager — stop. That impulse is wrong here.

**2. Offline-first by default.**
Local state is ALWAYS canonical. IndexedDB is the source of truth. Supabase is cloud backup. The app must function with zero network connectivity indefinitely. Connection drops mid-job? Doesn't matter. Everything's already local. Sync happens in the background when connection is available.

**3. No dependencies.**
Zero external JS libraries loaded at runtime (exception: Google Maps API for address features). Everything is hand-written vanilla JavaScript. This is intentional. This is permanent. This is not up for discussion.

**4. PWA with Service Worker.**
The app caches itself on first visit. Subsequent visits load from cache. The service worker handles background sync. The app can be added to home screen.

### Why This Architecture Makes ASTRA Nearly Indestructible

**99.99% availability is almost trivial here** because of how this is built. Understand this mental model:

- The app does NOT depend on the server being up. It runs locally. It is always available.
- If Supabase goes down for an hour, nothing happens. Techs keep working. Materials keep getting logged. Estimates keep getting built.
- When the server comes back, everything syncs. No data loss. No interruption.
- Sync failures are non-catastrophic. Failed syncs queue for retry on next connection. The retry is persistent and patient.
- **The app is ALWAYS up because it's local. The server is a convenience, not a dependency.**

The uptime SLA is really about the sync layer, not the app itself. When you write error handling, internalize this: a network failure is a sync delay, NOT an outage. Never show the user an error screen because the cloud is unreachable. The app works. Period. The sync catches up later.

A modern phone has more computing power than the machines that landed humans on the moon. ASTRA is vanilla JavaScript talking directly to IndexedDB. No virtual DOM diffing. No reconciliation cycle. No framework standing between the user's thumb and the data. The phone is operating at maybe 2% utilization running this app. That is an intentional engineering safety factor — the capacity-to-load ratio is so extreme that performance degradation is essentially theoretical.

**Every competitor is cloud-first.** ServiceTitan goes down, every tech in the country is dead in the water. ASTRA's server goes down, nobody notices until they glance at the sync indicator. That is a structural advantage. Protect it.

### Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Frontend | Vanilla HTML/CSS/JS (single file) | Everything the user sees and touches |
| Local Storage | IndexedDB | Source of truth for all data |
| Cloud Backup | Supabase | Backup, sync, and (future) multi-user |
| Maps | Google Maps API | Address autocomplete, property lookup |
| Offline | Service Worker | Cache management, background sync |

### Data Flow

```
User Action → IndexedDB (immediate, local)
                ↓
           Service Worker detects connectivity
                ↓
           Supabase sync (background, non-blocking)
                ↓
           If sync fails → queued for retry (persistent, patient)
           If sync succeeds → marked as synced
```

**Local always wins.** If there's ever a conflict between local and cloud, local is correct. The only future exception is supervisor override (documented below in multi-user section), and even that is rare.

**Never show a loading spinner for local operations.** Tap → result. Instantly. If you find yourself reaching for a spinner or skeleton screen on a local read/write, something has gone wrong architecturally.

---

## WHAT'S BUILT AND WORKING (v0.6)

These features are live, functional, and in the codebase right now:

- **Estimator engine** — localStorage-backed price book, full `recalc()` engine, material costs update estimates in real-time. This is the crown jewel. Don't break it.
- **Job/ticket tracking** — Create, edit, view jobs. Stored in IndexedDB.
- **Material catalog** — 222+ items (95 rough-in, 127 trim-out). Categorized and searchable.
- **Material tracking by address** — Materials logged per property. This feeds cost intelligence.
- **Property/address management** — Google Maps API integration for address lookup.
- **IndexedDB persistence** — All data stored locally, survives browser close.
- **Supabase cloud sync** — Background sync for backup (jobs).
- **Service worker** — Caching and offline support.
- **PWA** — Installable, works from home screen.

**The estimator already works.** It's the best part of the app. What it needs next is Supabase sync (so estimates survive device changes) and the historical data feed from completed jobs. But the core engine is done and functional. Do not refactor it. Enhance it.

---

## WHAT'S ON PAPER ONLY (NOT YET BUILT)

Everything in the multi-user architecture is designed but not implemented:

- Authentication (Supabase Auth)
- Multi-user roles (Tech / Supervisor / Admin)
- Role-Based Access Control (RBAC)
- Data isolation (sync filters by role)
- Ticket checkout / locking semantics
- Approval pipeline (pending → approved → rejected)
- Two-path ticket creation (tech discovery + supervisor dispatch)
- Material deduplication detection
- Admin dashboard / user management
- Developer settings (admin-gated)
- Notification system

**Do not build any of this until explicitly told to.** Your first mission is to understand what exists.

---

## THE BUILD SEQUENCE (When The Time Comes)

When Robert gives the green light to start building multi-user, this is the order. Not a suggestion — the order. Each phase must be airtight before the next begins.

### Phase 1: Auth + Data Isolation
Supabase Auth. Email and password. Session tokens. Hardened. Then the sync filters — tech sees their own work, supervisor sees all. **Until this is locked down, nothing else matters.** This is the foundation. If someone can see data they shouldn't or write to a ticket they don't own, the product is dead on arrival.

The login flow must be fast. One screen. Email, password, go. No "create your workspace" wizard. No onboarding questionnaire. Admin sets it up, sends the tech a link, tech taps it, they're in.

### Phase 2: Checkout Semantics + Approval Pipeline
Lock mechanism, 30-minute timeout, supervisor force-unlock. State machine for pending → approved/rejected/changes-requested. This is the core workflow that makes multi-user actually function.

**The three-second rule:** Approving a ticket must take a supervisor three seconds or less. Badge count on the nav. Tap, see pending tickets, approve or reject. If it takes longer than three seconds, supervisors will ignore the queue and the entire pipeline collapses. This is a hard design constraint, not a nice-to-have.

### Phase 3: Material Deduplication
Without this, the cost intelligence engine — the ENTIRE POINT of the product — is poisoned by double-counted materials. Every other feature is cosmetic if the data feeding the estimator is wrong. Detection via fuzzy match, resolution via supervisor judgment. Materials only feed cost intelligence if `deduplicated = true`.

### Phase 4: Everything else
Admin dashboard, user management, developer settings, notifications. Polish. Important, but none of it matters if Phases 1-3 aren't bulletproof.

**Auth. Checkout. Dedup. Those three, airtight, tested to destruction, shipped. Everything else is polish.**

---

## DESIGN LANGUAGE — RESPECT THIS

ASTRA follows a military-grade field tool aesthetic. This is deliberate and non-negotiable.

- **48px minimum tap targets** — Field workers have rough hands, dusty screens, bright sun. Every interactive element must be at minimum 48x48px. This is WCAG 2.5.5 and it's here because bad tap targets in field apps have caused real financial damage — accidental invoices, mislogged materials, corrupted job records. This is a safety issue, not a style preference.
- **Orange (#FF6B00) is for actions ONLY** — If it's orange, it does something when you tap it. Nothing else gets this color. One action color means every orange element screams "TAP ME." Everything else is structure. Everything else is information. The action color is sacred. Enforce this with extreme prejudice.
- **ALL-CAPS for authority** — Headers, labels, status indicators use uppercase.
- **Cold, precise aesthetic** — No rounded-corner friendly vibes. No cartoon illustrations. No congratulatory animations. No confetti. No "Great job!" popups. The tech finished the job, the system logged it, move on. This is a tool, not a toy.
- **High contrast** — Must be readable in direct sunlight on a phone screen.
- **No unnecessary UI chrome** — Every pixel must earn its place. If it doesn't help the tech do their job, remove it.

**Why this matters:** Most FSM apps look like they were designed by someone who's never left a WeWork. Friendly illustrations, pastel gradients, cartoon mascots. Field techs see that and think "this isn't for me." ASTRA's aesthetic signals respect. It says: this is YOUR tool, built for YOUR context. Don't dilute that.

---

## THE COST INTELLIGENCE FLYWHEEL

Understand this because it's the business model and the architectural north star:

```
Tech logs job with materials at an address
        ↓
Data feeds into estimator's historical knowledge
        ↓
Next estimate at that address (or similar address) is more accurate
        ↓
More accurate estimates = better margins for the shop
        ↓
Shop logs more jobs because the tool is earning them money
        ↓
More jobs = more data = even better estimates
        ↓
(Repeat forever. Compounding. Defensible. Irreplicable.)
```

**Year 1:** System learns from 100 jobs. Rough but useful.
**Year 3:** System has address-level history across dozens of properties. Estimates are dialed in.
**Year 5:** 500+ jobs, 50+ properties. The data is bulletproof. No competitor can replicate it because they don't have the history.

**The address is the entity that matters.** Not the customer. Customers move. The property stays. The wiring stays. The panel stays. Everything rolls up to the address — `property_id` is a foreign key on tickets AND estimates. This is the insight the entire product is built around.

**Every feature you build must protect this flywheel.** If a feature risks data integrity (double-counted materials, orphaned estimates, corrupted address history), it doesn't ship. The data is the moat.

---

## SECURITY MODEL — THE SYNC FILTER IS THE SECURITY

This is critical and must be understood precisely:

Data isolation is NOT a UI concern. It's not "hide the menu item." It's not "gray out the button." It's not "filter the list view." **The data literally never reaches the device.**

The sync query determines what data a device receives:

```sql
-- Tech gets ONLY this:
WHERE (assigned_to = current_user_id AND status = 'active')
   OR (created_by = current_user_id AND status = 'pending_approval')

-- Supervisor gets this:
WHERE account_id = current_account_id
```

A tech cannot access other techs' work because it doesn't exist on their phone. Not hidden. Not filtered. Not there. You cannot access what was never downloaded. **The sync filter IS the security model.**

When you audit the current codebase, note everywhere that sync currently pulls ALL data — those are the points that need to become role-filtered in Phase 1.

---

## KNOWN BUGS (Documented, Not Yet Fixed)

1. **Pricebook save button** — Throws an error on click but data persists anyway. Either the button wiring is wrong or there's an IndexedDB/Supabase catch issue. Needs console investigation.

2. **Estimates don't sync to Supabase** — The `saveEstimate()` function writes locally but doesn't push to cloud. Needs the same sync pattern used for jobs (queue + retry).

---

## FIRST MISSION: ORIENT AND AUDIT

Before you write a single line of code, do the following:

### Step 1: Read the entire codebase
It's one HTML file. Read all of it. Understand the structure. Map the major sections: HTML structure, CSS, JavaScript modules/functions, IndexedDB operations, Supabase integration, service worker registration.

### Step 2: Document what you find
Create a brief audit report covering:
- **File structure** — How is the single file organized? Sections, comment blocks, logical groupings.
- **Data model** — What IndexedDB object stores exist? What's the schema for each? What are the key fields?
- **Core functions** — Map the major function groups: estimator engine, job CRUD, material catalog, address/property management, sync logic.
- **Supabase integration** — What tables does it talk to? What's the sync pattern? Where does auth currently stand (if anywhere)?
- **Service worker** — What's cached? What's the update strategy?
- **UI patterns** — How are views/pages managed? Is it SPA-style with show/hide? Hash routing? How do modals work?
- **State management** — How does data flow from IndexedDB to the UI and back? Any in-memory caches?
- **Google Maps integration** — How is it initialized? What API features are used?
- **The estimator** — How does recalc() work? Where does the price book live? How do materials flow into estimates? This is the most important system in the app — map it thoroughly.

### Step 3: Identify risks and multi-user readiness
Flag anything that looks fragile, inconsistent, or will need to change for multi-user. Specifically:
- Hardcoded single-user assumptions
- Global state that would break with multiple users
- Sync logic that assumes one device / one user
- Missing error handling on critical paths (especially sync failures — these should be silent retries, never user-facing errors)
- Data integrity gaps that could poison the cost intelligence flywheel
- Places where the sync currently pulls ALL data (future role-filter points)
- Any place where a network failure would block the user instead of gracefully degrading

### Step 4: Report back
Give a clear, structured summary. Don't fix anything yet. Just tell me what you see.

---

## MULTI-USER ARCHITECTURE (Reference Only — DO NOT BUILD YET)

This section is here so you understand where the project is headed. It informs your audit — you should be looking for code that will need to change to support this.

### Roles
| Role | Data Scope | Creates Tickets As | Can Approve | Manages Users |
|------|-----------|-------------------|------------|---------------|
| Tech | Own work + own pending | `pending_approval` | No | No |
| Supervisor | All account data | `active` | Yes | No |
| Admin | All account data | `active` | Yes | Yes |

### Checkout Semantics (No Concurrent Editing)
**Prevent conflicts by making conflicts impossible.**

One tech owns a ticket at a time. Lock on edit, release on save or 30-minute timeout. Supervisor can force-unlock. Write protection enforced at the database level:

```sql
UPDATE tickets SET ...
WHERE id = ticket_id AND locked_by = current_user_id
```

If lock doesn't match, write fails. Not "here's a merge dialog." Just: no. The database is the bouncer and it does not care about feelings. This eliminates merge conflicts entirely, which is correct because field reality is: one person is responsible for one job.

### Two Creation Paths
1. **Tech Discovery (Reactive)** — Tech finds work on-site ("builder says rewire the garage while you're here"), creates ticket as `pending_approval`. Supervisor reviews later. Tech is reporting work that happened, not asking permission.
2. **Supervisor Dispatch (Proactive)** — Supervisor plans the week, creates ticket as `active`, assigns to tech. No approval needed. Supervisor's tickets are gospel.

Both paths feed the estimator. Both affect material rollup. Both improve cost intelligence. Both are legitimate. Both coexist. No forced workflows.

### Approval Pipeline
```
pending_approval → [Approve] → active (3 seconds or less for supervisor)
                 → [Request Changes] → stays pending (tech re-edits)
                 → [Reject] → archived
```

### Material Deduplication
Two tickets at same address + same day = potential double-count. System detects overlapping materials (fuzzy match on code + category), flags for supervisor. Supervisor chooses: remove, combine, or keep separate. Materials only feed cost intelligence if `deduplicated = true`. Without this, the estimator is garbage. This is Phase 3 for a reason — it protects everything.

### Supabase Schema (Target)
Core tables: `accounts`, `users`, `properties`, `tickets`, `estimates`, `materials`. Full schema with all columns and relationships is in the vision document (ASTRA_Complete_Vision.md).

---

## PHILOSOPHY

**"Software as a weapon. Optimized for the operator."**

The field tech's experience matters more than the admin dashboard. Simplicity over features. Speed over animation. Correctness over cleverness.

The estimator is the product. Everything else is infrastructure that feeds it. Cost intelligence compounds — every job logged makes the next estimate more accurate. That compounding data is the moat. That data is defensible. Competitors can't replicate it because they don't have the history.

This is a buy-once tool ($20K per shop, no subscription). It needs to be so good that electricians tell each other about it without being asked. "My buddy uses it." "Where'd he get it?" "I don't know. Some guy." Word of mouth is the only growth channel. Ship quality that earns that trust.

**The app should be so fast and so reliable that the tech forgets it's software. It's just the thing they use. Like a good tool — you don't think about it. It just works.**

---

## RULES OF ENGAGEMENT

1. **Don't add dependencies.** Not even "just one small library." No.
2. **Don't refactor what works.** The estimator works. Jobs work. Materials work. Don't reorganize working code for aesthetic reasons.
3. **Ask before changing architecture.** If something seems like it needs restructuring, flag it. Don't just do it.
4. **Test offline.** Every change you make must work with airplane mode on. If it doesn't work offline, it doesn't ship.
5. **Respect the design language.** 48px targets. Orange for actions only. High contrast. Military precision. No friendly UI. No confetti.
6. **Local is truth.** If you're writing sync logic, local state wins. Always. Network failure = sync delay, not outage.
7. **Comment your intent.** This codebase will be maintained by someone who thinks in electrical systems, not computer science abstractions. Write comments that explain WHY, not just what.
8. **Protect the flywheel.** Every feature must protect cost intelligence data integrity. If it risks poisoning the estimator, it doesn't ship.
9. **Three-second rule.** Any supervisor action (approving, rejecting, reviewing) must complete in three seconds or less. If the workflow takes longer, it won't get used.
10. **Graceful degradation only.** Network issues are silent. Sync retries are patient. The user never sees an error because the cloud is unreachable. The app works. The sync catches up later.

---

## CONTACTS & CONTEXT

- **Creator/Architect:** Robert — electrical background, built the entire vision and architecture. Knows the field reality. Defer to his judgment on workflow decisions. If a product question arises that isn't answered in this document or the vision doc, ask him.
- **Execution tool:** Claude Code — that's you. You execute. You don't override architectural decisions.
- **Design authority:** The vision document (ASTRA_Complete_Vision.md) is the source of truth for all product decisions.

---

*Now go read the codebase. All of it. Then tell me what you see.*
