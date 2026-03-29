# CLAUDE_PERMISSIONS — Profile 2–3 Cheat Sheet
*Load for: approval pipeline work, role-based features, checkout locking, supervisor UI, multi-user tasks.*
*Token budget: ~2,000–5,000. Load alongside CLAUDE_UX for any approval-related UI work.*
*Step 5 is the primary consumer of this cheat sheet.*

---

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

**Three-second rule:** Supervisor approval must complete in ≤3 taps, ≤3 seconds. If the supervisor experience is clunky, they'll ignore the queue and the entire multi-user model collapses.

**Checkout locking (Step 5):**
- Lock on edit: locked_by + locked_at written to record
- Release on save or 30-minute timeout
- Supervisor can force-unlock (nulls locked_by directly via RLS — no separate policy)
- DB write protection: WHERE locked_by = current_user_id (lock mismatch = write fails)
- UI: your ticket = edit, someone else's = read-only + "Locked by [Name]", supervisor = "Take Over"

**Locked architecture decisions — NON-NEGOTIABLE:**
1. Lock state = columns on jobs table (locked_by, locked_at) — NOT a separate table.
2. Approval queue = filtered view on existing job list + nav badge — NOT a new screen.
3. Address pull = unfiltered within account — job pull enforces scope.
4. Force-unlock = supervisor nulls locked_by directly via RLS — no separate policy.

**Sync filtering by role (Step 5):**
- Tech: WHERE (assigned_to = user AND status = 'active') OR (created_by = user AND status = 'pending_approval')
- Supervisor/Admin: WHERE account_id = current_account_id
- RLS auto-filters realtime subscriptions when auth is active
