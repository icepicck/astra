-- ═══════════════════════════════════════════
-- ASTRA Migration 006: Tier 3 Security Hardening
-- ═══════════════════════════════════════════

-- SEC-017: Document get_my_account_id() trust boundary
-- This function runs on every RLS evaluation. It relies on:
-- 1. PK index on users(id) — exists by default in Supabase
-- 2. auth.uid() being set by PostgREST from JWT
-- Performance: Single index lookup per request. Acceptable for current scale.
-- If scaling to 10k+ concurrent users, consider SET config approach for session-level caching.

-- SEC-018: Restrict tech RLS — techs should NOT see unassigned jobs
-- Previously: techs could see jobs where assigned_to IS NULL (all unassigned jobs)
-- Now: techs only see jobs they're assigned to or created

-- Drop the existing tech SELECT policy and recreate without IS NULL
DROP POLICY IF EXISTS "tech_select_own_jobs" ON jobs;

CREATE POLICY "tech_select_own_jobs" ON jobs
  FOR SELECT USING (
    account_id = get_my_account_id()
    AND deleted_at IS NULL
    AND (
      -- Supervisors and admins see all account jobs
      get_my_role() IN ('supervisor', 'admin', 'owner')
      OR
      -- Techs see only their assigned or created jobs
      (get_my_role() = 'tech' AND (assigned_to = auth.uid() OR created_by = auth.uid()))
    )
  );
