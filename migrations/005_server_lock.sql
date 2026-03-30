-- ═══════════════════════════════════════════
-- ASTRA Migration 005: Server-side Lock Enforcement
-- Resolves: SEC-019, BUG-026 (clock skew)
-- ═══════════════════════════════════════════

-- acquire_lock: Atomically acquire a job lock
-- Returns true if lock acquired, false if held by someone else
CREATE OR REPLACE FUNCTION acquire_lock(p_job_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_locked_by uuid;
  v_locked_at timestamptz;
BEGIN
  -- Lock the row to prevent concurrent updates
  SELECT locked_by, locked_at INTO v_locked_by, v_locked_at
  FROM jobs WHERE id = p_job_id AND account_id = get_my_account_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false; -- Job doesn't exist or wrong account
  END IF;

  -- Allow lock if: unlocked, already ours, or stale (>30 min)
  IF v_locked_by IS NULL
     OR v_locked_by = p_user_id
     OR v_locked_at < now() - interval '30 minutes' THEN
    UPDATE jobs SET locked_by = p_user_id, locked_at = now()
    WHERE id = p_job_id AND account_id = get_my_account_id();
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- release_lock: Release a job lock (only if we hold it)
CREATE OR REPLACE FUNCTION release_lock(p_job_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE jobs SET locked_by = NULL, locked_at = NULL
  WHERE id = p_job_id
    AND account_id = get_my_account_id()
    AND locked_by = p_user_id;
END;
$$;
