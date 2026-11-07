-- Applied after platform_domains. No migration is automatically deployed.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

ALTER TABLE public."Booking"
  ADD CONSTRAINT "Booking_period_check" CHECK ("ends_at" > "starts_at"),
  ADD CONSTRAINT "Booking_participants_check" CHECK ("seeker_id" <> "lister_id"),
  ADD CONSTRAINT "Booking_amount_check" CHECK ("amount_kobo" > 0 AND "currency" = 'NGN'),
  ADD CONSTRAINT "Booking_kind_check" CHECK ("kind" IN ('inspection','rental','hold')),
  ADD CONSTRAINT "Booking_status_check" CHECK ("status" IN ('requested','awaiting_payment','confirmed','completed','cancelled','expired','disputed')),
  ADD CONSTRAINT "Booking_settlement_check" CHECK ("settlement_status" IN ('unsettled','pending','released','refunded','requires_review')),
  ADD CONSTRAINT "Booking_no_overlapping_rentals" EXCLUDE USING gist (
    "listing_id" extensions.gist_text_ops WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("kind" IN ('rental','hold') AND "status" IN ('awaiting_payment','confirmed'));

ALTER TABLE public."PaymentIntent"
  ADD CONSTRAINT "PaymentIntent_amount_check" CHECK ("amount_kobo" > 0 AND "currency" = 'NGN'),
  ADD CONSTRAINT "PaymentIntent_target_check" CHECK (("kind" = 'booking' AND "booking_id" IS NOT NULL) OR ("kind" = 'listing_fee' AND "listing_id" IS NOT NULL)),
  ADD CONSTRAINT "PaymentIntent_provider_check" CHECK ("provider" = 'paystack'),
  ADD CONSTRAINT "PaymentIntent_status_check" CHECK ("status" IN ('created','initializing','pending','uncertain','succeeded','requires_review','failed','refunded'));
ALTER TABLE public."Conversation" ADD CONSTRAINT "Conversation_participants_check" CHECK ("seeker_id" <> "lister_id");
ALTER TABLE public."Message" ADD CONSTRAINT "Message_body_check" CHECK (length("body") <= 4000 AND (length(btrim("body")) > 0 OR "shared_listing_id" IS NOT NULL));
ALTER TABLE public."Review" ADD CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5 AND "author_id" <> "subject_id"), ADD CONSTRAINT "Review_comment_check" CHECK (length("comment") BETWEEN 1 AND 2000);
ALTER TABLE public."Dispute" ADD CONSTRAINT "Dispute_reason_check" CHECK (length("reason") BETWEEN 10 AND 4000);
ALTER TABLE public."LedgerEntry" ADD CONSTRAINT "LedgerEntry_amount_check" CHECK ("amount_kobo" > 0 AND "currency" = 'NGN'), ADD CONSTRAINT "LedgerEntry_direction_check" CHECK ("direction" IN ('debit','credit'));

-- Prisma performs authorized server queries. No raw Data API reads are allowed.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['SavedListing','Booking','PaymentIntent','PaymentEvent','LedgerTransaction','LedgerEntry','Conversation','Message','Review','Dispute','Notification','AdminAudit','DocumentReview','Renewal'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
  END LOOP;
END $$;

-- Balanced accounting is enforced at commit, after both entries are inserted.
CREATE FUNCTION public.rentral_check_ledger_balance() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE transaction_key text; debit_total numeric; credit_total numeric; entry_count integer; transaction_currency text;
BEGIN
  IF TG_TABLE_NAME = 'LedgerTransaction' THEN transaction_key := NEW.id;
  ELSE transaction_key := NEW.transaction_id;
  END IF;
  SELECT t.currency INTO transaction_currency FROM public."LedgerTransaction" t WHERE t.id = transaction_key;
  SELECT count(*), coalesce(sum(CASE WHEN direction='debit' THEN amount_kobo ELSE 0 END),0), coalesce(sum(CASE WHEN direction='credit' THEN amount_kobo ELSE 0 END),0)
  INTO entry_count, debit_total, credit_total FROM public."LedgerEntry" WHERE transaction_id = transaction_key;
  IF entry_count < 2 OR debit_total <> credit_total OR EXISTS (SELECT 1 FROM public."LedgerEntry" WHERE transaction_id = transaction_key AND currency <> transaction_currency) THEN
    RAISE EXCEPTION 'Ledger transaction must balance in one currency' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rentral_check_ledger_balance() FROM PUBLIC, anon, authenticated;
CREATE CONSTRAINT TRIGGER "LedgerTransaction_balanced" AFTER INSERT ON public."LedgerTransaction" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.rentral_check_ledger_balance();
CREATE CONSTRAINT TRIGGER "LedgerEntry_balanced" AFTER INSERT ON public."LedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.rentral_check_ledger_balance();

CREATE FUNCTION public.rentral_deny_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN RAISE EXCEPTION 'Financial and administrative audit records are append-only' USING ERRCODE='23514'; END $$;
REVOKE ALL ON FUNCTION public.rentral_deny_audit_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "LedgerTransaction_append_only" BEFORE UPDATE OR DELETE ON public."LedgerTransaction" FOR EACH ROW EXECUTE FUNCTION public.rentral_deny_audit_mutation();
CREATE TRIGGER "LedgerEntry_append_only" BEFORE UPDATE OR DELETE ON public."LedgerEntry" FOR EACH ROW EXECUTE FUNCTION public.rentral_deny_audit_mutation();
CREATE TRIGGER "AdminAudit_append_only" BEFORE UPDATE OR DELETE ON public."AdminAudit" FOR EACH ROW EXECUTE FUNCTION public.rentral_deny_audit_mutation();

-- Existing ledger transactions cannot gain new entries in a later transaction.
CREATE FUNCTION public.rentral_guard_ledger_entry_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE parent_xid text;
BEGIN
  SELECT xmin::text INTO parent_xid FROM public."LedgerTransaction" WHERE id = NEW.transaction_id;
  IF parent_xid IS NULL OR parent_xid <> ((pg_current_xact_id()::text)::numeric % 4294967296)::text THEN
    RAISE EXCEPTION 'Entries must be created with their ledger transaction' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rentral_guard_ledger_entry_insert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "LedgerEntry_same_transaction" BEFORE INSERT ON public."LedgerEntry" FOR EACH ROW EXECUTE FUNCTION public.rentral_guard_ledger_entry_insert();
COMMIT;
