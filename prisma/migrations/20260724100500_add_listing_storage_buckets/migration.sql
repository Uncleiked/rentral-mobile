-- Listing media + compliance document buckets (build-plan Item 06).
--
-- Object paths are `{auth.uid()}/{draftId}/...` — uid-first (not the
-- architecture doc's `listings/{listing_id}/...`) because the client uploads
-- BEFORE the Listing row exists (server actions cap request bodies at 1MB,
-- so video can't ride through the action), and uid-first is what the
-- owner-folder RLS pattern below enforces. See progress-tracker.md.
--
-- listings-media: public bucket — walkthrough videos and poster frames are
-- the public storefront. Writes/deletes are owner-folder-scoped; DELETE lets
-- the client clean up uploads when saveListing fails.
--
-- compliance-docs: private bucket — Title Deeds / CAC documents are read by
-- the owner and the service_role (future Gemini forensic audit) only.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'listings-media',
  'listings-media',
  true,
  209715200, -- 200MB
  ARRAY['video/webm', 'video/mp4', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'compliance-docs',
  'compliance-docs',
  false,
  10485760, -- 10MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access to listing media"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'listings-media');

CREATE POLICY "Users can upload media to their own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'listings-media'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY "Users can delete their own listing media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'listings-media'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY "Users can upload their own compliance docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'compliance-docs'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY "Users can read their own compliance docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'compliance-docs'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE POLICY "Users can delete their own compliance docs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'compliance-docs'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);
