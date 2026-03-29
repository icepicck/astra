# CLAUDE_ESTIMATES — Profile 2 Cheat Sheet
*Load for: estimator bugs, intelligence engine changes, price book work, Phase B/D features.*
*Token budget: ~2,000–4,000. Load with astra-estimates.js source.*
*FLYWHEEL TRIPWIRE: Named functions below are hard-gated. See ASTRA_CONTEXT_STRATEGY.md for rules.*

---

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
