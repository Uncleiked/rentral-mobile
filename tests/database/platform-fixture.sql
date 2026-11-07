-- Test-only Supabase surfaces. Use only in the labelled isolated Docker database.
CREATE SCHEMA extensions;
CREATE EXTENSION postgis WITH SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public, extensions TO anon, authenticated;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text NOT NULL, raw_app_meta_data jsonb NOT NULL DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;

CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, bucket_id text NOT NULL, name text NOT NULL);
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon, authenticated;
GRANT USAGE ON SEQUENCE storage.objects_id_seq TO authenticated;
-- Deliberately simulate legacy broad policies to exercise restrictive boundaries.
CREATE POLICY "fixture_legacy_broad_storage_reads" ON storage.objects FOR SELECT TO anon,authenticated USING (true);
CREATE POLICY "fixture_owner_storage_move" ON storage.objects FOR UPDATE TO authenticated USING ((storage.foldername(name))[1]=(SELECT auth.uid())::text) WITH CHECK ((storage.foldername(name))[1]=(SELECT auth.uid())::text);
-- Exercise the upgrade path: the original bucket migration must not silently
-- preserve an existing public compliance bucket after the hardening migration.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('compliance-docs','compliance-docs',true,10485760,ARRAY['application/pdf','image/jpeg','image/png']);

CREATE SCHEMA realtime;
CREATE TABLE realtime.messages (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, topic text, extension text, payload jsonb);
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('realtime.topic', true),'') $$;
GRANT USAGE ON SCHEMA realtime TO authenticated;
GRANT SELECT,INSERT ON realtime.messages TO authenticated;
GRANT USAGE ON SEQUENCE realtime.messages_id_seq TO authenticated;
CREATE POLICY "fixture_legacy_broad_realtime_read" ON realtime.messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "fixture_legacy_broad_realtime_write" ON realtime.messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE PUBLICATION supabase_realtime;
