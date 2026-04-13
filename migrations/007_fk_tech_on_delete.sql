-- ===============================================================
-- ASTRA MIGRATION 007: jobs.tech_id FK — ON DELETE SET NULL
-- ===============================================================
-- Run ONCE in Supabase SQL Editor.
-- Idempotent — safe to re-run.
--
-- PROBLEM:
--   jobs.tech_id references techs.id with no ON DELETE behavior.
--   Deleting a tech (e.g., purging test data) fails with:
--   "Key (id)=(...) is still referenced from table jobs."
--
-- FIX:
--   Drop the existing FK and recreate it with ON DELETE SET NULL.
--   When a tech is deleted, affected jobs get tech_id = NULL
--   (shows as UNASSIGNED in the UI). No job data is lost.
-- ===============================================================

-- Drop the existing constraint (name from Supabase default convention)
ALTER TABLE jobs
  DROP CONSTRAINT IF EXISTS jobs_tech_id_fkey;

-- Recreate with ON DELETE SET NULL
ALTER TABLE jobs
  ADD CONSTRAINT jobs_tech_id_fkey
  FOREIGN KEY (tech_id)
  REFERENCES techs(id)
  ON DELETE SET NULL;

-- Verify
SELECT conname, confdeltype
FROM pg_constraint
WHERE conname = 'jobs_tech_id_fkey';
-- Expected: confdeltype = 'n' (SET NULL)
