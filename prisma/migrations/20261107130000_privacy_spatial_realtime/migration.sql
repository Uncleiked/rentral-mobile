BEGIN;
ALTER TABLE public."Notification" ADD COLUMN dedupe_key TEXT UNIQUE,
  ADD COLUMN email_status TEXT NOT NULL DEFAULT 'pending';
CREATE TABLE public."MarketEvent" (
  id TEXT PRIMARY KEY, subject_hash TEXT NOT NULL, event_type TEXT NOT NULL,
  category TEXT NOT NULL, intent TEXT NOT NULL, neighborhood TEXT NOT NULL,
  budget_band TEXT NOT NULL, bedrooms INTEGER, dedupe_key TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketEvent_category_check" CHECK (category IN ('house','car','boat')),
  CONSTRAINT "MarketEvent_intent_check" CHECK (intent IN ('rent','buy','squat','shortlet')),
  CONSTRAINT "MarketEvent_type_check" CHECK (event_type IN ('search','detail','checkout')),
  CONSTRAINT "MarketEvent_bedrooms_check" CHECK (bedrooms IS NULL OR bedrooms BETWEEN 0 AND 30)
);
CREATE INDEX "MarketEvent_createdAt_category_neighborhood_idx" ON public."MarketEvent" ("createdAt",category,neighborhood);
CREATE INDEX "MarketEvent_subject_hash_createdAt_idx" ON public."MarketEvent" (subject_hash,"createdAt");
ALTER TABLE public."MarketEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."MarketEvent" FROM PUBLIC, anon, authenticated;

CREATE TABLE public."ListingVerification" (
  listing_id TEXT PRIMARY KEY REFERENCES public."Listing"(id) ON DELETE RESTRICT,
  address_hash TEXT NOT NULL, spatial_status TEXT NOT NULL DEFAULT 'pending',
  distance_meters DOUBLE PRECISION, checked_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ListingVerification_state_check" CHECK (spatial_status IN ('pending','matched','mismatch','unavailable')),
  CONSTRAINT "ListingVerification_distance_check" CHECK (distance_meters IS NULL OR distance_meters >= 0)
);
ALTER TABLE public."ListingVerification" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."ListingVerification" FROM PUBLIC, anon, authenticated;

-- Only these two domain tables have browser reads, for membership-scoped Realtime.
GRANT SELECT ON public."Conversation", public."Message" TO authenticated;
CREATE POLICY "rentral_conversation_members" ON public."Conversation" FOR SELECT TO authenticated
USING ((SELECT auth.uid())::text IN (seeker_id,lister_id));
CREATE POLICY "rentral_message_members" ON public."Message" FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public."Conversation" c WHERE c.id = conversation_id
  AND (SELECT auth.uid())::text IN (c.seeker_id,c.lister_id)));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='Message'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public."Message"; END IF;
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    CREATE POLICY "rentral_private_conversation_read" ON realtime.messages FOR SELECT TO authenticated
      USING (realtime.topic() LIKE 'rentral:conversation:%' AND EXISTS (
        SELECT 1 FROM public."Conversation" c WHERE c.id=split_part(realtime.topic(),':',3)
        AND (SELECT auth.uid())::text IN (c.seeker_id,c.lister_id)));
    CREATE POLICY "rentral_private_conversation_write" ON realtime.messages FOR INSERT TO authenticated
      WITH CHECK (realtime.topic() LIKE 'rentral:conversation:%' AND EXISTS (
        SELECT 1 FROM public."Conversation" c WHERE c.id=split_part(realtime.topic(),':',3)
        AND (SELECT auth.uid())::text IN (c.seeker_id,c.lister_id)));
    -- Bound legacy permissive policies as well as policies installed above.
    CREATE POLICY "rentral_private_conversation_read_boundary" ON realtime.messages AS RESTRICTIVE FOR SELECT TO authenticated
      USING (realtime.topic() NOT LIKE 'rentral:conversation:%' OR EXISTS (
        SELECT 1 FROM public."Conversation" c WHERE c.id=split_part(realtime.topic(),':',3)
        AND (SELECT auth.uid())::text IN (c.seeker_id,c.lister_id)));
    CREATE POLICY "rentral_private_conversation_write_boundary" ON realtime.messages AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (realtime.topic() NOT LIKE 'rentral:conversation:%' OR EXISTS (
        SELECT 1 FROM public."Conversation" c WHERE c.id=split_part(realtime.topic(),':',3)
        AND (SELECT auth.uid())::text IN (c.seeker_id,c.lister_id)));
  END IF;
END $$;

-- Protect committed uploads even when the object owner has DELETE permission.
CREATE SCHEMA IF NOT EXISTS rentral_private;
REVOKE ALL ON SCHEMA rentral_private FROM PUBLIC, anon, authenticated;
CREATE FUNCTION rentral_private.protect_referenced_upload() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.bucket_id IN ('listings-media','compliance-docs') AND (
    EXISTS (SELECT 1 FROM public."Listing" l WHERE
      (OLD.bucket_id='listings-media' AND (l.video_path=OLD.name OR l.poster_path=OLD.name)) OR
      (OLD.bucket_id='compliance-docs' AND l.document_path=OLD.name)) OR
    (OLD.bucket_id='listings-media' AND EXISTS (SELECT 1 FROM public."MediaAsset" m WHERE m.source_path=OLD.name))
  ) THEN RAISE EXCEPTION 'Referenced listing uploads cannot be deleted or moved' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION rentral_private.protect_referenced_upload() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER rentral_protect_upload_delete BEFORE DELETE ON storage.objects
FOR EACH ROW EXECUTE FUNCTION rentral_private.protect_referenced_upload();
CREATE TRIGGER rentral_protect_upload_move BEFORE UPDATE OF name,bucket_id ON storage.objects
FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name OR OLD.bucket_id IS DISTINCT FROM NEW.bucket_id)
EXECUTE FUNCTION rentral_private.protect_referenced_upload();
COMMIT;
