-- Profile records contain private contact and identity details. Like User and
-- Listing, these are accessed via authenticated server actions using Prisma.
BEGIN;

ALTER TABLE public."IndividualProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OrganizationProfile" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."IndividualProfile" FROM anon, authenticated;
REVOKE ALL ON public."OrganizationProfile" FROM anon, authenticated;

-- Pin name resolution for the privileged signup trigger and remove direct RPC
-- access. Auth's INSERT trigger remains able to execute this function.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public."User" (id, email, kyc_verified, verification_status, "updatedAt")
  VALUES (NEW.id, NEW.email, false, 'unverified', now())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMIT;
