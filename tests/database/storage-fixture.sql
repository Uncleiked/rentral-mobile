-- Minimal local model of Storage's RLS surface. Never run on a shared database.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
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
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('listings-media', '11111111-1111-4111-8111-111111111111/folder/video.mp4'),
  ('listings-media', '22222222-2222-4222-8222-222222222222/folder/poster.jpg'),
  ('profile-avatars', 'public-avatar.jpg');
