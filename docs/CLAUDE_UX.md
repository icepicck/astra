# CLAUDE_UX — Mandatory for Any User-Visible Change
*Load alongside whatever profile applies when the output renders on screen (HTML, CSS, toast, label, anything visible).*
*Always pair with the task's primary cheat sheet. This is additive, not standalone.*

---

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
- The "holy shit" moment: first time the estimator surfaces historical data. Every design decision should accelerate the path to this moment.

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
