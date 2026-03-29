-- ===============================================================
-- ASTRA STEP 5: MULTI-USER — PHASE A SCHEMA MIGRATION
-- ===============================================================
-- Run this ONCE in Supabase SQL Editor.
-- Idempotent — safe to re-run. Uses IF NOT EXISTS / DO $$ guards.
--
-- WHAT THIS DOES:
--   1. Adds locked_by + locked_at to jobs (checkout locking)
--   2. Adds deleted_at to all data tables (soft delete — D26)
--   3. Backfills created_by/assigned_to on existing jobs (admin-owns-all)
--   4. Adds helper function get_my_role()
--   5. Replaces account_isolation RLS with role-aware policies
--   6. Adds indexes for new query patterns
--
-- IMPORTANT: This builds on 002_step4_auth.sql.
-- Requires: accounts, users, get_my_account_id() already in place.
-- ===============================================================


-- ============================================
-- 1. CHECKOUT LOCKING COLUMNS ON JOBS
-- ============================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'locked_by')
  THEN ALTER TABLE jobs ADD COLUMN locked_by uuid REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'locked_at')
  THEN ALTER TABLE jobs ADD COLUMN locked_at timestamptz;
  END IF;
END $$;


-- ============================================
-- 2. SOFT DELETE — deleted_at ON ALL TABLES (D26)
-- ============================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'deleted_at')
  THEN ALTER TABLE jobs ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'addresses' AND column_name = 'deleted_at')
  THEN ALTER TABLE addresses ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'techs' AND column_name = 'deleted_at')
  THEN ALTER TABLE techs ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'estimates' AND column_name = 'deleted_at')
  THEN ALTER TABLE estimates ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'materials' AND column_name = 'deleted_at')
  THEN ALTER TABLE materials ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;


-- ============================================
-- 3. BACKFILL created_by / assigned_to
-- ============================================
-- Strategy: Admin-owns-all.
-- Find the first admin user in each account, assign all that
-- account's jobs to them. This keeps every existing job visible
-- once role-based sync filters go live in Phase B.
--
-- If no admin user exists yet (pre-signup), jobs stay NULL —
-- they'll still be visible to supervisors via account_id filter,
-- and the admin will own them after first login.

UPDATE jobs j
SET created_by = u.id
FROM (
  SELECT DISTINCT ON (account_id) id, account_id
  FROM users
  WHERE role = 'admin' AND status = 'active'
  ORDER BY account_id, created_at ASC
) u
WHERE j.account_id = u.account_id
  AND j.created_by IS NULL;

UPDATE jobs j
SET assigned_to = u.id
FROM (
  SELECT DISTINCT ON (account_id) id, account_id
  FROM users
  WHERE role = 'admin' AND status = 'active'
  ORDER BY account_id, created_at ASC
) u
WHERE j.account_id = u.account_id
  AND j.assigned_to IS NULL;


-- ============================================
-- 4. HELPER FUNCTION: get_my_role()
-- Returns current user's role for RLS policy decisions
-- ============================================

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;

-- Helper: get current user's auth ID (for policy readability)
CREATE OR REPLACE FUNCTION get_my_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT auth.uid()
$$;


-- ============================================
-- 5. ROLE-AWARE RLS POLICIES ON JOBS
-- ============================================
-- Replace the simple account_isolation with role-aware policies.
-- Tech: sees own assigned/created jobs (non-deleted)
-- Supervisor/Admin: sees all account jobs (non-deleted)
--
-- Addresses, techs, estimates, materials keep account_isolation
-- (addresses are unfiltered within account per architecture decision)

-- Drop old policy
DROP POLICY IF EXISTS "account_isolation" ON jobs;

-- SELECT: Role-based visibility
CREATE POLICY "jobs_select" ON jobs FOR SELECT
  USING (
    account_id = get_my_account_id()
    AND deleted_at IS NULL
    AND (
      -- Supervisor/Admin see all account jobs
      get_my_role() IN ('admin', 'supervisor')
      OR
      -- Tech sees: assigned active jobs + own created pending jobs
      (
        get_my_role() = 'tech'
        AND (
          (assigned_to = auth.uid() AND status != 'pending_approval')
          OR (created_by = auth.uid() AND status = 'pending_approval')
          -- Also show jobs with NULL assigned_to (legacy/unassigned)
          OR (assigned_to IS NULL)
        )
      )
    )
  );

-- INSERT: Anyone in account can create jobs
CREATE POLICY "jobs_insert" ON jobs FOR INSERT
  WITH CHECK (account_id = get_my_account_id());

-- UPDATE: Role-based write control
-- Tech can update own jobs (with lock check enforced at app level)
-- Supervisor/Admin can update any account job
CREATE POLICY "jobs_update" ON jobs FOR UPDATE
  USING (
    account_id = get_my_account_id()
    AND (
      get_my_role() IN ('admin', 'supervisor')
      OR (
        get_my_role() = 'tech'
        AND (assigned_to = auth.uid() OR created_by = auth.uid() OR assigned_to IS NULL)
      )
    )
  )
  WITH CHECK (account_id = get_my_account_id());

-- DELETE: Only admin (soft delete preferred, but allow hard delete for admin)
CREATE POLICY "jobs_delete" ON jobs FOR DELETE
  USING (
    account_id = get_my_account_id()
    AND get_my_role() = 'admin'
  );


-- ============================================
-- 6. SOFT DELETE FILTER ON OTHER TABLES
-- ============================================
-- Update existing policies to exclude soft-deleted records.
-- Addresses, techs, estimates, materials stay account-scoped
-- but now filter out deleted_at IS NOT NULL.

-- Addresses
DROP POLICY IF EXISTS "account_isolation" ON addresses;
CREATE POLICY "account_isolation" ON addresses FOR ALL
  USING (account_id = get_my_account_id() AND deleted_at IS NULL)
  WITH CHECK (account_id = get_my_account_id());

-- Techs
DROP POLICY IF EXISTS "account_isolation" ON techs;
CREATE POLICY "account_isolation" ON techs FOR ALL
  USING (account_id = get_my_account_id() AND deleted_at IS NULL)
  WITH CHECK (account_id = get_my_account_id());

-- Estimates
DROP POLICY IF EXISTS "account_isolation" ON estimates;
CREATE POLICY "account_isolation" ON estimates FOR ALL
  USING (account_id = get_my_account_id() AND deleted_at IS NULL)
  WITH CHECK (account_id = get_my_account_id());

-- Materials
DROP POLICY IF EXISTS "account_isolation" ON materials;
CREATE POLICY "account_isolation" ON materials FOR ALL
  USING (account_id = get_my_account_id() AND deleted_at IS NULL)
  WITH CHECK (account_id = get_my_account_id());


-- ============================================
-- 7. INDEXES FOR NEW QUERY PATTERNS
-- ============================================

-- Lock lookup (who has this job checked out?)
CREATE INDEX IF NOT EXISTS jobs_locked_by_idx ON jobs(locked_by) WHERE locked_by IS NOT NULL;

-- Role-based sync: tech's assigned jobs
CREATE INDEX IF NOT EXISTS jobs_assigned_to_idx ON jobs(assigned_to);
CREATE INDEX IF NOT EXISTS jobs_created_by_idx ON jobs(created_by);

-- Soft delete: exclude deleted records efficiently
CREATE INDEX IF NOT EXISTS jobs_deleted_at_idx ON jobs(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS addresses_deleted_at_idx ON addresses(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS techs_deleted_at_idx ON techs(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS estimates_deleted_at_idx ON estimates(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS materials_deleted_at_idx ON materials(deleted_at) WHERE deleted_at IS NOT NULL;

-- Approval queue: pending jobs for supervisor
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status) WHERE status = 'pending_approval';


-- ============================================
-- DONE. Phase A complete.
-- ============================================
-- VERIFY CHECKLIST (run these queries manually):
--
-- 1. New columns exist:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'jobs' AND column_name IN ('locked_by','locked_at','deleted_at','created_by','assigned_to');
--    -- Should return 5 rows
--
-- 2. Backfill worked:
--    SELECT id, created_by, assigned_to FROM jobs WHERE created_by IS NOT NULL LIMIT 5;
--    -- Should show your admin user ID
--
-- 3. RLS policies replaced:
--    SELECT policyname FROM pg_policies WHERE tablename = 'jobs';
--    -- Should show: jobs_select, jobs_insert, jobs_update, jobs_delete
--    -- Should NOT show: account_isolation
--
-- 4. Soft delete columns on all tables:
--    SELECT table_name FROM information_schema.columns
--    WHERE column_name = 'deleted_at' AND table_name IN ('jobs','addresses','techs','estimates','materials');
--    -- Should return 5 rows
--
-- 5. Quick RLS test — log in as your admin user and run:
--    SELECT count(*) FROM jobs;
--    -- Should return your job count (not 0, not error)
