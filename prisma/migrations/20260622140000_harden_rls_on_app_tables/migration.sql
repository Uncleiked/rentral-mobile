-- Harden Data API exposure on Prisma-managed tables.
--
-- "User" and "WebhookLog" are accessed ONLY through Prisma's direct Postgres
-- connection (the `postgres` role, which bypasses RLS). They are never read or
-- written through the Supabase Data API (PostgREST). Tables in the `public`
-- schema are reachable by the `anon`/`authenticated` roles by default, so we:
--   1. Enable RLS (deny-by-default; no policies = no Data API access), and
--   2. Revoke the broad default grants from the public API roles as defense in depth.
--
-- The signup trigger public.handle_new_user() is SECURITY DEFINER and the app's
-- Prisma role bypasses RLS, so application behavior is unchanged.

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WebhookLog" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public."User" FROM anon, authenticated;
REVOKE ALL ON public."WebhookLog" FROM anon, authenticated;
