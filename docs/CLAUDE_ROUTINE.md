# CLAUDE_ROUTINE — Profile 1 Cheat Sheet
*Load for: material catalog adds, UI tweaks, non-logic bug fixes, documentation updates, simple edits.*
*Token budget: ~500–1,000. Do NOT load full CLAUDE.md for this work.*

---

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
- Check FLYWHEEL TRIPWIRES in ASTRA_CONTEXT_STRATEGY.md. If your task intersects, stop — escalate to Profile 2.
- Check SECURITY TRIPWIRES in ASTRA_CONTEXT_STRATEGY.md. If your task intersects, stop — escalate to Profile 2.
- If your change is user-visible, also load /docs/CLAUDE_UX.md.

**NOT a CLAUDE_ROUTINE task — escalate to Profile 2 + CLAUDE_ARCHITECTURE:**
- Job list ordering/sorting bugs (touches cache read layer and render logic in app.js — not a simple tweak)
- Any bug where the fix requires understanding how `_cache` is read or iterated
- Any bug in data mapping, CRUD functions, or IDB read patterns

CLAUDE_ROUTINE is for typos, label changes, catalog adds, and documentation. If the fix touches app.js logic, use CLAUDE_ARCHITECTURE.
