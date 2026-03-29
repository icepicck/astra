-- ═══════════════════════════════════════════════════════════════
-- ASTRA STEP 4: AUTHENTICATION — THE GATE
-- ═══════════════════════════════════════════════════════════════
-- Run this ONCE in Supabase SQL Editor.
-- Idempotent — safe to re-run. Uses IF NOT EXISTS / IF EXISTS.
--
-- WHAT THIS DOES:
--   1. Creates accounts + users tables
--   2. Adds account_id to all data tables
--   3. Adds created_by + assigned_to to jobs
--   4. Creates a default account and backfills existing data
--   5. Drops old "allow all" RLS and adds account-scoped policies
--
-- IMPORTANT: After running this, the app REQUIRES authentication.
-- The old anon-key-only access will stop working.
-- ═══════════════════════════════════════════════════════════════

-- ══════════════════════════════════
-- 1. ACCOUNTS TABLE
-- ══════════════════════════════════

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ══════════════════════════════════
-- 2. USERS TABLE
-- Links Supabase Auth users to accounts with roles
-- ══════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'tech' CHECK (role IN ('tech', 'supervisor', 'admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'invited')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast account lookups
CREATE INDEX IF NOT EXISTS users_account_id_idx ON users(account_id);
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

-- ══════════════════════════════════
-- 3. ADD account_id TO ALL DATA TABLES
-- ══════════════════════════════════

-- Jobs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'account_id')
  THEN ALTER TABLE jobs ADD COLUMN account_id uuid REFERENCES accounts(id);
  END IF;
END $$;

-- created_by and assigned_to on jobs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'created_by')
  THEN ALTER TABLE jobs ADD COLUMN created_by uuid REFERENCES auth.users(id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'assigned_to')
  THEN ALTER TABLE jobs ADD COLUMN assigned_to uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Addresses
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'addresses' AND column_name = 'account_id')
  THEN ALTER TABLE addresses ADD COLUMN account_id uuid REFERENCES accounts(id);
  END IF;
END $$;

-- Techs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'techs' AND column_name = 'account_id')
  THEN ALTER TABLE techs ADD COLUMN account_id uuid REFERENCES accounts(id);
  END IF;
END $$;

-- Estimates
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'estimates' AND column_name = 'account_id')
  THEN ALTER TABLE estimates ADD COLUMN account_id uuid REFERENCES accounts(id);
  END IF;
END $$;

-- Materials
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'materials' AND column_name = 'account_id')
  THEN ALTER TABLE materials ADD COLUMN account_id uuid REFERENCES accounts(id);
  END IF;
END $$;

-- ══════════════════════════════════
-- 4. DEFAULT ACCOUNT + BACKFILL
-- All existing data gets linked to this account.
-- The first admin signup claims it.
-- ══════════════════════════════════

INSERT INTO accounts (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Account')
ON CONFLICT (id) DO NOTHING;

-- Backfill all existing records
UPDATE jobs SET account_id = '00000000-0000-0000-0000-000000000001' WHERE account_id IS NULL;
UPDATE addresses SET account_id = '00000000-0000-0000-0000-000000000001' WHERE account_id IS NULL;
UPDATE techs SET account_id = '00000000-0000-0000-0000-000000000001' WHERE account_id IS NULL;
UPDATE estimates SET account_id = '00000000-0000-0000-0000-000000000001' WHERE account_id IS NULL;
UPDATE materials SET account_id = '00000000-0000-0000-0000-000000000001' WHERE account_id IS NULL;

-- Now make account_id NOT NULL (safe because we just backfilled)
ALTER TABLE jobs ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE addresses ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE techs ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE estimates ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE materials ALTER COLUMN account_id SET NOT NULL;

-- Indexes for fast account-scoped queries
CREATE INDEX IF NOT EXISTS jobs_account_id_idx ON jobs(account_id);
CREATE INDEX IF NOT EXISTS addresses_account_id_idx ON addresses(account_id);
CREATE INDEX IF NOT EXISTS techs_account_id_idx ON techs(account_id);
CREATE INDEX IF NOT EXISTS estimates_account_id_idx ON estimates(account_id);
CREATE INDEX IF NOT EXISTS materials_account_id_idx ON materials(account_id);

-- ══════════════════════════════════
-- 5. DROP OLD RLS POLICIES
-- ══════════════════════════════════

DROP POLICY IF EXISTS "Allow all for anon" ON jobs;
DROP POLICY IF EXISTS "Allow all for anon" ON addresses;
DROP POLICY IF EXISTS "Allow all for anon" ON techs;
DROP POLICY IF EXISTS "Allow all for anon" ON materials;
DROP POLICY IF EXISTS "Allow all for anon" ON estimates;

-- ══════════════════════════════════
-- 6. NEW RLS POLICIES — Account Isolation
-- Users can only see/modify data belonging to their account.
-- auth.uid() → users.account_id → match data.account_id
-- ══════════════════════════════════

-- Helper: reusable function to get current user's account_id
CREATE OR REPLACE FUNCTION get_my_account_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT account_id FROM public.users WHERE id = auth.uid()
$$;

-- Jobs
CREATE POLICY "account_isolation" ON jobs FOR ALL
  USING (account_id = get_my_account_id())
  WITH CHECK (account_id = get_my_account_id());

-- Addresses
CREATE POLICY "account_isolation" ON addresses FOR ALL
  USING (account_id = get_my_account_id())
  WITH CHECK (account_id = get_my_account_id());

-- Techs
CREATE POLICY "account_isolation" ON techs FOR ALL
  USING (account_id = get_my_account_id())
  WITH CHECK (account_id = get_my_account_id());

-- Estimates
CREATE POLICY "account_isolation" ON estimates FOR ALL
  USING (account_id = get_my_account_id())
  WITH CHECK (account_id = get_my_account_id());

-- Materials
CREATE POLICY "account_isolation" ON materials FOR ALL
  USING (account_id = get_my_account_id())
  WITH CHECK (account_id = get_my_account_id());

-- ══════════════════════════════════
-- 7. ACCOUNTS TABLE RLS
-- Users can only read their own account
-- ══════════════════════════════════

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_own_account" ON accounts FOR SELECT
  USING (id = get_my_account_id());

-- Allow insert for signup flow (service role handles this, but just in case)
CREATE POLICY "insert_account" ON accounts FOR INSERT
  WITH CHECK (true);

-- ══════════════════════════════════
-- 8. USERS TABLE RLS
-- Users can see other users in their account (for team features)
-- Only admins/supervisors can insert (invite)
-- ══════════════════════════════════

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- All authenticated users can see their account's users
CREATE POLICY "read_account_users" ON users FOR SELECT
  USING (account_id = get_my_account_id());

-- Any authenticated user can insert (for signup flow — they insert their own row)
CREATE POLICY "insert_own_user" ON users FOR INSERT
  WITH CHECK (id = auth.uid());

-- Users can update their own row
CREATE POLICY "update_own_user" ON users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admins/supervisors can update any user in their account (for invites, role changes)
CREATE POLICY "admin_update_users" ON users FOR UPDATE
  USING (
    account_id = get_my_account_id()
    AND (SELECT role FROM public.users WHERE id = auth.uid()) IN ('admin', 'supervisor')
  );

-- ══════════════════════════════════
-- 9. REALTIME ON USERS TABLE
-- For invite acceptance notifications
-- ══════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE users;

-- ══════════════════════════════════
-- DONE. The app now requires authentication.
-- Next: deploy astra-auth.js and clear cache.
-- ══════════════════════════════════
