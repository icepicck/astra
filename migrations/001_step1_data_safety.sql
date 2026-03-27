-- ═══════════════════════════════════════════
-- ASTRA MIGRATION 001 — STEP 1: DATA SAFETY
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
-- WHAT THIS DOES:
--   1. Creates the estimates table (D1 — estimate cloud backup)
--   2. Adds material_id column to materials table (D3/D14 — per-material sync)
--   3. Adds estimate_id to jobs table (Phase D — estimate↔ticket linking)
--   4. Enables realtime on estimates
--   5. Adds updated_at trigger on estimates
--
-- SAFE TO RUN MULTIPLE TIMES — all statements use IF NOT EXISTS / IF EXISTS checks
-- ═══════════════════════════════════════════


-- ─────────────────────────────────────────
-- 1. ESTIMATES TABLE (D1)
-- ─────────────────────────────────────────
-- This is the most valuable data in ASTRA and currently has NO cloud backup.
-- Structure mirrors the local IDB estimate object.
-- All money fields are numeric (not text) for future aggregation queries.

CREATE TABLE IF NOT EXISTS estimates (
  id uuid PRIMARY KEY,
  address text DEFAULT '',
  address_id uuid REFERENCES addresses(id),
  customer_name text DEFAULT '',
  customer_phone text DEFAULT '',
  customer_email text DEFAULT '',
  job_type text DEFAULT '',
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'Draft',

  -- Materials stored as JSONB array
  -- Each item: { itemId, name, qty, unit, unitCost, markup }
  materials jsonb DEFAULT '[]',

  -- Labor
  labor_hours numeric DEFAULT 0,
  labor_rate numeric DEFAULT 0,
  labor_total numeric DEFAULT 0,

  -- Adjustments stored as JSONB array
  -- Each item: { name, amount }
  adjustments jsonb DEFAULT '[]',

  -- Computed totals (stored for quick reads, recalculated on edit)
  material_subtotal numeric DEFAULT 0,
  material_markup_total numeric DEFAULT 0,
  overhead_percent numeric DEFAULT 0,
  overhead_amount numeric DEFAULT 0,
  profit_percent numeric DEFAULT 0,
  profit_amount numeric DEFAULT 0,
  permit_fee numeric DEFAULT 0,
  tax_rate numeric DEFAULT 0,
  tax_amount numeric DEFAULT 0,
  grand_total numeric DEFAULT 0,

  -- Metadata
  valid_until date,
  notes text DEFAULT '',
  linked_job_id uuid REFERENCES jobs(id),

  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────
-- 2. MATERIAL_ID ON MATERIALS TABLE (D3 + D14)
-- ─────────────────────────────────────────
-- Currently, materials have no stable local ID for syncing.
-- The existing `id` column is the Supabase row ID (auto-generated UUID).
-- We add `material_id` — the LOCAL UUID that the app generates per material.
-- This lets us UPSERT instead of delete-all/re-insert.
--
-- The combo of (job_id + material_id) is unique — one material per job.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'materials' AND column_name = 'material_id'
  ) THEN
    ALTER TABLE materials ADD COLUMN material_id text DEFAULT '';
  END IF;
END $$;

-- Create unique index so we can upsert on (job_id, material_id)
-- This replaces the destructive delete-all/re-insert pattern
CREATE UNIQUE INDEX IF NOT EXISTS materials_job_material_unique
  ON materials (job_id, material_id);


-- ─────────────────────────────────────────
-- 3. ESTIMATE_ID ON JOBS TABLE (Phase D link)
-- ─────────────────────────────────────────
-- Links a ticket back to the estimate it was created from.
-- Used by the feedback loop (estimated vs actual comparison).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'estimate_id'
  ) THEN
    ALTER TABLE jobs ADD COLUMN estimate_id uuid REFERENCES estimates(id);
  END IF;
END $$;


-- ─────────────────────────────────────────
-- 4. AUTO-UPDATE TRIGGER FOR ESTIMATES
-- ─────────────────────────────────────────
-- Uses the same update_updated_at() function from the original schema.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'estimates_updated_at'
  ) THEN
    CREATE TRIGGER estimates_updated_at BEFORE UPDATE ON estimates
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;


-- ─────────────────────────────────────────
-- 5. RLS — OPEN FOR NOW (matches existing tables)
-- ─────────────────────────────────────────
-- Step 4 (Auth) will replace these with proper account-scoped policies.

ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'estimates' AND policyname = 'Allow all for anon'
  ) THEN
    CREATE POLICY "Allow all for anon" ON estimates FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ─────────────────────────────────────────
-- 6. ENABLE REALTIME ON ESTIMATES
-- ─────────────────────────────────────────
-- So cross-device estimate edits sync in realtime (same as jobs).

ALTER PUBLICATION supabase_realtime ADD TABLE estimates;


-- ═══════════════════════════════════════════
-- DONE. Verify by running:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
--
-- You should see: addresses, estimates, jobs, materials, techs
-- ═══════════════════════════════════════════
