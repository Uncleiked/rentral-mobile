-- Keep identity/property evidence private even when a legacy permissive Storage
-- policy grants unrelated bucket reads. Object keys and owner writes are unchanged.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'compliance-docs') THEN
    RAISE EXCEPTION 'compliance-docs bucket is missing; replay the storage migration first';
  END IF;
END $$;

-- Initial bucket creation uses ON CONFLICT DO NOTHING, so also repair a
-- pre-existing bucket that was mistakenly configured for public delivery.
UPDATE storage.buckets SET public = false WHERE id = 'compliance-docs';

CREATE POLICY "Compliance documents require ownership"
ON storage.objects AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (
  bucket_id <> 'compliance-docs'
  OR (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

COMMIT;
