-- ═══════════════════════════════════════════════════════════════
-- Migration 004: Supabase Storage for Media Blob Sync (Step 7A)
-- Requires: get_my_account_id() from migration 002
-- ═══════════════════════════════════════════════════════════════

-- 1. Create private storage bucket for job media
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-media', 'job-media', false)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS policies on storage.objects scoped by account_id
-- Path schema: {account_id}/{media_id}
-- First folder segment = account_id, enforced via get_my_account_id()

-- SELECT: users can only read their own account's media
CREATE POLICY "account_media_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'job-media'
  AND (storage.foldername(name))[1] = get_my_account_id()::text
);

-- INSERT: users can only upload to their own account's folder
CREATE POLICY "account_media_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'job-media'
  AND (storage.foldername(name))[1] = get_my_account_id()::text
);

-- UPDATE: users can only update their own account's media
CREATE POLICY "account_media_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'job-media'
  AND (storage.foldername(name))[1] = get_my_account_id()::text
);

-- DELETE: users can only delete their own account's media
CREATE POLICY "account_media_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'job-media'
  AND (storage.foldername(name))[1] = get_my_account_id()::text
);
