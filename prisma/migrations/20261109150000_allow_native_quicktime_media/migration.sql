-- Source only: review and accept before applying to any hosted environment.
-- Expo Camera records an actual QuickTime (.mov) container on iOS. Preserve its
-- truthful MIME type without changing bucket privacy, size limits or policies.
-- NULL already means unrestricted MIME types and must stay NULL.
BEGIN;

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'video/quicktime')
WHERE id = 'listings-media'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('video/quicktime' = ANY (allowed_mime_types));

COMMIT;
