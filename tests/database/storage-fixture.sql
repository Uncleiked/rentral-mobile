-- Minimal local model of Storage's RLS surface. Never run on a shared database.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array($1, '/'))[1:array_length(string_to_array($1, '/'), 1) - 1];
$$;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]
);
CREATE TABLE storage.objects (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, bucket_id text, name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA auth, storage TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;
GRANT USAGE ON SEQUENCE storage.objects_id_seq TO authenticated;

-- Simulate a dashboard-added broad read policy: the new restrictive boundary
-- must still prevent someone else's originals from becoming readable.
CREATE POLICY "Legacy broad reads" ON storage.objects FOR SELECT TO anon, authenticated USING (true);
-- Upgrade fixture: the original INSERT ... ON CONFLICT intentionally keeps
-- this public setting until the additive compliance boundary repairs it.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('compliance-docs','compliance-docs',true,10485760,ARRAY['application/pdf','image/jpeg','image/png']);
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('listings-media', '11111111-1111-4111-8111-111111111111/folder/video.mp4'),
  ('listings-media', '22222222-2222-4222-8222-222222222222/folder/poster.jpg'),
  ('compliance-docs', '11111111-1111-4111-8111-111111111111/folder/title.pdf'),
  ('compliance-docs', '22222222-2222-4222-8222-222222222222/folder/title.pdf'),
  ('profile-avatars', 'public-avatar.jpg');
