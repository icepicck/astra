# ASTRA Bug Report — 2026-04-12

**Source:** Live preview session, full app tour while authenticated
**Method:** Preview tool + source code cross-reference
**Files reviewed:** `app.js`, `astra-estimates.js`, `index.html`, `seed_intelligence.json`

---

## CRITICAL — Flywheel Risk

### BUG-01: Job type lists are not canonical — three different lists in production

**Impact:** The cost intelligence flywheel breaks when a job type logged on a ticket doesn't match the job type used in an estimate. No cross-linking = no predictions.

**Files:**
- `index.html:1274–1280` — Create Ticket chip group
- `astra-estimates.js:468` — Estimate Builder `JOB_TYPES` constant
- Real job data in IDB — contains "WHOLE HOME REWIRE" which appears in neither

**Create Ticket chips (index.html:1274–1280):**
```
PANEL UPGRADE, EV CHARGER, SERVICE CALL, ROUGH-IN,
FIXTURE INSTALL, TRENCHING, TRIM
```

**Estimate Builder JOB_TYPES (astra-estimates.js:468):**
```javascript
const JOB_TYPES = ['SERVICE CALL','PANEL UPGRADE','EV CHARGER','ROUGH-IN',
  'TRIM-OUT','TROUBLESHOOT','GENERATOR','REWIRE','LIGHTING','GENERAL'];
```

**Diff:**
- In Create, missing from Estimates: `FIXTURE INSTALL`, `TRENCHING`, `TRIM`
- In Estimates, missing from Create: `TRIM-OUT`, `TROUBLESHOOT`, `GENERATOR`, `REWIRE`, `LIGHTING`, `GENERAL`
- In real job data, missing from both: `WHOLE HOME REWIRE`

**Fix:** Define one canonical array (e.g., in `app.js` on `window.Astra`) and reference it in both `index.html` (chip render) and `astra-estimates.js`. Agree on the final list first — Robert has the call on which job types belong.

---

### BUG-02: Seed intelligence job types don't match UI labels — cold-start predictions are dead

**Impact:** On a fresh install with no job history, the seed data should provide baseline material suggestions. It can't because the matching is an exact string comparison and the names don't match.

**File:** `astra-estimates.js:852`
```javascript
var match = seed.jobTypes.find(function(s) { return s.jobType === jobType; });
```

**Seed job type names (`seed_intelligence.json:7–104`):**
```
"Panel Swap", "Service Upgrade", "Outlet Install", "Switch Install",
"Ceiling Fan", "GFCI Install", "Dedicated Circuit", "Smoke Detector"
```

**UI chip labels:** `PANEL UPGRADE`, `EV CHARGER`, `SERVICE CALL`, `ROUGH-IN`, etc.

Zero overlap. Seed data never fires.

**Fix (two options — pick one):**
1. Update `seed_intelligence.json` job type names to exactly match the canonical chip list from BUG-01.
2. Make the lookup case-insensitive and fuzzy — but this is messier and hides the underlying naming chaos.

Option 1 is correct. Fix BUG-01 first to establish canonical names, then update the seed file.

---

## MEDIUM — UI / Functional

### BUG-03: "HOME HOME" doubled label in sidebar

**Impact:** Cosmetic but visible to user every time sidebar opens.

**File:** `app.js:1047–1051`

```javascript
function updateSidebarActive() {
  // ...
  var homeItem = document.querySelector('.sidebar-item[data-screen="screen-jobs"]');
  if (homeItem) {
    var label = homeItem.childNodes[homeItem.childNodes.length - 1]; // BUG HERE
    if (label && label.nodeType === 3) label.textContent = (role === 'tech') ? ' MY JOBS' : ' HOME';
  }
}
```

**Root cause:** The button's HTML structure is:
```html
<button class="sidebar-item" data-screen="screen-jobs" ...>
  <span class="sidebar-icon">...</span> HOME
  <span class="approval-badge" ...></span>
</button>
```

`childNodes[last]` is the trailing whitespace text node `"\n  "` after the `approval-badge` span — not the " HOME" label node. It passes the `nodeType === 3` check and gets overwritten with `" HOME"`, creating a second text node alongside the original static " HOME" in the HTML.

**Fix:** Wrap the label text in a `<span>` and target it by ID or class:

In `index.html:1043`, change:
```html
<span class="sidebar-icon">...</span> HOME
```
to:
```html
<span class="sidebar-icon">...</span><span class="sidebar-label"> HOME</span>
```

In `app.js:1049–1050`, change:
```javascript
var label = homeItem.childNodes[homeItem.childNodes.length - 1];
if (label && label.nodeType === 3) label.textContent = ...
```
to:
```javascript
var label = homeItem.querySelector('.sidebar-label');
if (label) label.textContent = (role === 'tech') ? ' MY JOBS' : ' HOME';
```

---

### BUG-04: FAB overlaps last card on list screens

**Impact:** The last estimate or job card's price/status is obscured by the orange + button. Visible on estimates list — "$2,13..." clipped behind FAB.

**Files:**
- `index.html:214–223` — FAB is `position:fixed; bottom:24px; height:64px`
- `index.html:149–151` — `.screen-body` has `padding:16px` with no FAB-aware bottom clearance

**Fix:** Add FAB clearance to `.screen-body`:
```css
.screen-body {
  flex: 1; overflow-y: auto; padding: 16px;
  padding-bottom: 100px; /* FAB clearance: 64px height + 24px offset + 12px breathing room */
  -webkit-overflow-scrolling: touch;
}
```

Or scope it more tightly to only screens that have a FAB.

---

## LOW — Design Language

### BUG-05: Dashboard ACTIONABLE card uses purple — violates design language

**File:** `app.js:2427–2432`

```javascript
var supervisorCard = isAdminOrSuper ? '<div class="dash-card" style="border:1px solid #6a4c93;">'
  + '<div class="dash-card-title" style="color:#6a4c93;">ACTIONABLE</div>'
  // ...
  + '<button ... style="...border-color:#6a4c93;color:#6a4c93;" ...>VIEW PENDING</button>'
```

`#6a4c93` is purple. CLAUDE.md is explicit: orange (`#FF6B00`) for actions only. The "ACTIONABLE" card is actionable — the button inside navigates to pending approvals. It should use orange or white, not a third accent color.

**Fix:** Replace `#6a4c93` with `#FF6B00` for the card border and button, and `#fff` or `#aaa` for the title label.

---

### BUG-06: "YOUR NOTES" section label uses orange — violates design language

**File:** `app.js:1794`

```javascript
+ '<div style="font-size:10px;color:#FF6B00;font-weight:700;...">YOUR NOTES ...'
```

Orange on a static label, not an action. Design language: orange = actions only.

**Fix:** Change `color:#FF6B00` to `color:#aaa` or `color:#fff` on that label.

---

## DATA / ENVIRONMENT

### BUG-07: Dashboard shows 49 TECHS — test data pollution

**Not a code bug.** The `TECHS` row in the dashboard (`app.js:2430`) calls `loadTechs().length`, which is correct. But the database has 49 tech records from diagnostic/stress test runs.

**Resolution:** Purge test techs from the Supabase `techs` table directly. Should be 1–2 real entries for a solo shop.

---

## SUMMARY TABLE

| ID | Severity | File | Line | Issue |
|----|----------|------|------|-------|
| BUG-01 | **Critical** | `index.html`, `astra-estimates.js` | 1274, 468 | Job type lists inconsistent across Create/Estimates/real data |
| BUG-02 | **Critical** | `astra-estimates.js`, `seed_intelligence.json` | 852, passim | Seed intelligence never fires — job type names don't match |
| BUG-03 | Medium | `app.js`, `index.html` | 1049, 1043 | "HOME HOME" doubled — childNode selector grabs whitespace node |
| BUG-04 | Medium | `index.html` | 150, 214 | FAB overlaps last list card — no padding-bottom clearance |
| BUG-05 | Low | `app.js` | 2427–2432 | Purple `#6a4c93` on dashboard ACTIONABLE card |
| BUG-06 | Low | `app.js` | 1794 | Orange `#FF6B00` on "YOUR NOTES" label — not an action |
| BUG-07 | Data | `migrations/007_fk_tech_on_delete.sql` | — | FK `jobs_tech_id_fkey` had no ON DELETE behavior — blocked tech row deletion. Fixed with `ON DELETE SET NULL`. |

**All 7 bugs resolved. 2026-04-12.**

---

*Generated by preview session audit, 2026-04-12.*
