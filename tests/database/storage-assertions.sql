DO $$ BEGIN
  IF (SELECT public FROM storage.buckets WHERE id = 'listings-media') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Bucket must be private';
  END IF;
  IF (SELECT public FROM storage.buckets WHERE id = 'compliance-docs') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Existing compliance bucket must be made private';
  END IF;
END $$;

SET ROLE anon;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'listings-media') THEN
    RAISE EXCEPTION 'Anonymous access to originals';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'compliance-docs') THEN
    RAISE EXCEPTION 'Legacy policy exposed anonymous compliance documents';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'profile-avatars') THEN
    RAISE EXCEPTION 'Unrelated bucket policy was changed';
  END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id = 'listings-media') <> 1 THEN
    RAISE EXCEPTION 'Owner must see only their original';
  END IF;
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id = 'compliance-docs') <> 1 THEN
    RAISE EXCEPTION 'Owner must see only their compliance document';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE '22222222%') THEN
    RAISE EXCEPTION 'Cross-owner access';
  END IF;
END $$;

INSERT INTO storage.objects (bucket_id, name)
VALUES ('listings-media', '11111111-1111-4111-8111-111111111111/folder/new.mp4');
INSERT INTO storage.objects (bucket_id, name)
VALUES ('compliance-docs', '11111111-1111-4111-8111-111111111111/folder/new.pdf');
DO $$ BEGIN
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('listings-media', '22222222-2222-4222-8222-222222222222/folder/stolen.mp4');
    RAISE EXCEPTION 'Cross-owner upload unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('compliance-docs', '22222222-2222-4222-8222-222222222222/folder/stolen.pdf');
    RAISE EXCEPTION 'Cross-owner compliance upload unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
DELETE FROM storage.objects WHERE name = '11111111-1111-4111-8111-111111111111/folder/new.mp4';
DELETE FROM storage.objects WHERE name = '11111111-1111-4111-8111-111111111111/folder/new.pdf';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE '%/new.mp4') THEN
    RAISE EXCEPTION 'Own failed-upload cleanup must remain possible';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE '%/new.pdf') THEN
    RAISE EXCEPTION 'Own compliance failed-upload cleanup must remain possible';
  END IF;
END $$;
RESET ROLE;
