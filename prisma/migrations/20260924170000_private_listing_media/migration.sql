-- Deploy authorized preview routes first. Staging acceptance is required before
-- applying this cutover; previously cached public copies may remain accessible.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'listings-media') THEN
    RAISE EXCEPTION 'listings-media bucket is missing; replay the storage migration first';
  END IF;
END $$;

UPDATE storage.buckets SET public = false WHERE id = 'listings-media';

DROP POLICY IF EXISTS "Public read access to listing media" ON storage.objects;

CREATE POLICY "Owners can read their listing originals"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'listings-media'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

-- Restrictive policies also bound any pre-existing permissive SELECT policy.
-- Other buckets retain their current policies. Visitor playback uses the
-- authorized server signer, never direct table/object access.
CREATE POLICY "Listing originals require ownership"
ON storage.objects AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (
  bucket_id <> 'listings-media'
  OR (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

COMMIT;
