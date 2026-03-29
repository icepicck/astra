# Step 5 Anchor — Multi-User

## Status: Ready to start. Fresh session.

## Architecture Decisions (Locked)
1. Lock state = columns on jobs table
2. Approval queue = filtered view on job list + nav badge
3. Address pull = unfiltered within account (job pull enforces scope)
4. Force-unlock = supervisor nulls locked_by via RLS

## Phase Order
A. Schema migration → B. Sync filtering → C. Checkout locking → D. Approval pipeline → E. Cache + polish

## Defects
D6+D7, D13, D10, D25, D26

## Critical Flag
Backfill `created_by`/`assigned_to` on existing jobs — plan before execute. Wrong backfill silently hides jobs from tech views with no error.

## Context to Load
- CLAUDE_lean.md (supreme authority)
- ASTRA_CONTEXT_STRATEGY_RATIFIED.md (routing)
- ASTRA_CODE_REVIEW_ADDENDUM.md (D25, D26 details)
- SESSION_REPORT_2026-03-29.md (what just shipped)
