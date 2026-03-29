# Supabase RLS Audit — ASTRA
**Date:** 2026-03-27

## Current State

All tables have RLS enabled with a single permissive policy: `Allow all for anon`.

| Table | RLS Enabled | Policy | Effect |
|-------|------------|--------|--------|
| `jobs` | Yes | `Allow all for anon` — USING (true) WITH CHECK (true) | Anyone with anon key has full CRUD |
| `addresses` | Yes | `Allow all for anon` — USING (true) WITH CHECK (true) | Same |
| `techs` | Yes | `Allow all for anon` — USING (true) WITH CHECK (true) | Same |
| `materials` | Yes | `Allow all for anon` — USING (true) WITH CHECK (true) | Same |
| `estimates` | Yes | `Allow all for anon` — USING (true) WITH CHECK (true) | Same |

## Assessment

For single-operator use (current state), this is correct. The anon key is the only auth mechanism. Tightening RLS without Supabase Auth would lock the app out of its own data.

## What Step 4 (Auth) Needs

When Supabase Auth is added, replace these policies with:

```sql
-- Example for jobs table (repeat pattern for all tables)
DROP POLICY "Allow all for anon" ON jobs;

-- Users can only see their own account's data
CREATE POLICY "account_isolation" ON jobs
  FOR ALL
  USING (account_id = (SELECT account_id FROM users WHERE id = auth.uid()))
  WITH CHECK (account_id = (SELECT account_id FROM users WHERE id = auth.uid()));
```

### Prerequisites for Step 4 RLS:
1. `accounts` table exists
2. `users` table exists with `account_id` FK
3. `account_id` column added to: jobs, addresses, techs, estimates, materials
4. All existing records backfilled with a default account_id
5. Supabase Auth configured (email + password)

## Action Taken

No RLS changes made. Current policies are correct for pre-auth single-operator use. This audit documents the starting point for Step 4.
