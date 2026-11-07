-- A hold can fund one rental once. This allocates a collected liability; no payout is asserted.
BEGIN;
ALTER TABLE public."Booking" ADD COLUMN "hold_credit_kobo" bigint NOT NULL DEFAULT 0;
ALTER TABLE public."Booking" DROP CONSTRAINT "Booking_status_check";
ALTER TABLE public."Booking" ADD CONSTRAINT "Booking_status_check" CHECK (status IN ('requested','awaiting_payment','confirmed','completed','cancelled','expired','disputed','converted'));
ALTER TABLE public."Booking" ADD CONSTRAINT "Booking_hold_credit_check" CHECK (
  hold_credit_kobo >= 0 AND hold_credit_kobo <= amount_kobo AND (hold_credit_kobo = 0 OR kind = 'rental') AND (status <> 'converted' OR kind = 'hold')
);

CREATE TABLE public."HoldCreditAllocation" (
  id text NOT NULL PRIMARY KEY,
  hold_booking_id text NOT NULL UNIQUE REFERENCES public."Booking"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  rental_booking_id text NOT NULL UNIQUE REFERENCES public."Booking"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  amount_kobo bigint NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT "HoldCreditAllocation_amount_check" CHECK (amount_kobo > 0 AND currency = 'NGN' AND hold_booking_id <> rental_booking_id)
);
ALTER TABLE public."HoldCreditAllocation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."HoldCreditAllocation" FROM anon, authenticated;
CREATE TRIGGER "HoldCreditAllocation_append_only" BEFORE UPDATE OR DELETE ON public."HoldCreditAllocation"
  FOR EACH ROW EXECUTE FUNCTION public.rentral_deny_audit_mutation();

CREATE FUNCTION public.rentral_validate_hold_credit_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE source public."Booking"; target public."Booking";
BEGIN
  SELECT * INTO source FROM public."Booking" WHERE id = NEW.hold_booking_id;
  SELECT * INTO target FROM public."Booking" WHERE id = NEW.rental_booking_id;
  IF source.kind <> 'hold' OR source.status <> 'converted' OR source.settlement_status <> 'unsettled' OR
     source.expires_at IS NULL OR source.expires_at <= clock_timestamp() OR target.status <> 'requested' OR target.kind <> 'rental' OR
     source.listing_id <> target.listing_id OR source.seeker_id <> target.seeker_id OR source.lister_id <> target.lister_id OR
     source.starts_at <> target.starts_at OR source.ends_at <> target.ends_at OR source.currency <> target.currency OR
     NEW.currency <> source.currency OR NEW.amount_kobo <> source.amount_kobo OR NEW.amount_kobo > target.amount_kobo OR
     EXISTS (SELECT 1 FROM public."PaymentIntent" WHERE booking_id=source.id AND status='requires_review') OR
     (SELECT count(*) FROM public."PaymentIntent" WHERE booking_id=source.id AND status='succeeded') <> 1 OR
     NOT EXISTS (
       SELECT 1 FROM public."PaymentIntent" p JOIN public."LedgerTransaction" t ON t.payment_id=p.id
       WHERE p.booking_id=source.id AND p.kind='booking' AND p.status='succeeded' AND p.paid_at IS NOT NULL AND
         p.user_id=source.seeker_id AND p.amount_kobo=NEW.amount_kobo AND p.currency=NEW.currency AND t.kind='provider_collection'
     ) THEN RAISE EXCEPTION 'Holding credit requires an unexpired paid matching hold' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rentral_validate_hold_credit_insert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "HoldCreditAllocation_verified_source" BEFORE INSERT ON public."HoldCreditAllocation"
  FOR EACH ROW EXECUTE FUNCTION public.rentral_validate_hold_credit_insert();

CREATE FUNCTION public.rentral_check_hold_credit_binding() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE allocation public."HoldCreditAllocation"; source public."Booking"; target public."Booking";
BEGIN
  IF TG_TABLE_NAME = 'HoldCreditAllocation' THEN
    SELECT * INTO allocation FROM public."HoldCreditAllocation" WHERE id=NEW.id;
  ELSE
    SELECT * INTO allocation FROM public."HoldCreditAllocation" WHERE hold_booking_id=NEW.id OR rental_booking_id=NEW.id;
    IF NOT FOUND THEN
      IF NEW.status='converted' OR NEW.hold_credit_kobo > 0 THEN
        RAISE EXCEPTION 'Converted bookings require a holding credit allocation' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END IF;
  END IF;
  SELECT * INTO source FROM public."Booking" WHERE id=allocation.hold_booking_id;
  SELECT * INTO target FROM public."Booking" WHERE id=allocation.rental_booking_id;
  IF source.kind <> 'hold' OR source.status <> 'converted' OR target.kind <> 'rental' OR
     source.listing_id <> target.listing_id OR source.seeker_id <> target.seeker_id OR source.lister_id <> target.lister_id OR
     source.starts_at <> target.starts_at OR source.ends_at <> target.ends_at OR source.currency <> target.currency OR
     allocation.currency <> source.currency OR allocation.amount_kobo <> source.amount_kobo OR allocation.amount_kobo <> target.hold_credit_kobo OR
     target.pricing_snapshot->>'holdBookingId' IS DISTINCT FROM source.id OR
     target.pricing_snapshot->>'holdCreditKobo' IS DISTINCT FROM allocation.amount_kobo::text OR
     target.pricing_snapshot->>'payableKobo' IS DISTINCT FROM (target.amount_kobo-allocation.amount_kobo)::text OR
     target.pricing_snapshot->>'totalKobo' IS DISTINCT FROM target.amount_kobo::text OR
     (target.status='awaiting_payment' AND (target.expires_at IS NULL OR target.expires_at > source.expires_at)) THEN
    RAISE EXCEPTION 'Holding credit must remain bound to its original rental and quote' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rentral_check_hold_credit_binding() FROM PUBLIC, anon, authenticated;
CREATE CONSTRAINT TRIGGER "HoldCreditAllocation_bound" AFTER INSERT ON public."HoldCreditAllocation"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.rentral_check_hold_credit_binding();
CREATE CONSTRAINT TRIGGER "Booking_hold_credit_bound" AFTER INSERT OR UPDATE ON public."Booking"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.rentral_check_hold_credit_binding();

-- Keep the financial parties, dates, quote and gross total immutable after allocation.
CREATE FUNCTION public.rentral_guard_allocated_booking() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.status='converted' AND OLD.status <> 'converted' AND
    (OLD.kind <> 'hold' OR OLD.status <> 'confirmed' OR OLD.settlement_status <> 'unsettled' OR OLD.expires_at IS NULL OR OLD.expires_at <= clock_timestamp()) THEN
    RAISE EXCEPTION 'Only an active confirmed hold can be converted' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public."HoldCreditAllocation" WHERE hold_booking_id=OLD.id OR rental_booking_id=OLD.id) THEN
    IF (NEW.listing_id,NEW.seeker_id,NEW.lister_id,NEW.kind,NEW.currency,NEW.amount_kobo,NEW.starts_at,NEW.ends_at)
       IS DISTINCT FROM (OLD.listing_id,OLD.seeker_id,OLD.lister_id,OLD.kind,OLD.currency,OLD.amount_kobo,OLD.starts_at,OLD.ends_at) OR
       (OLD.hold_credit_kobo > 0 AND (NEW.hold_credit_kobo IS DISTINCT FROM OLD.hold_credit_kobo OR NEW.pricing_snapshot IS DISTINCT FROM OLD.pricing_snapshot)) OR
       (OLD.status='converted' AND (NEW.status <> 'converted' OR NEW.expires_at IS DISTINCT FROM OLD.expires_at)) THEN
      RAISE EXCEPTION 'Allocated holding credit terms are immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rentral_guard_allocated_booking() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "Booking_allocated_credit_immutable" BEFORE UPDATE ON public."Booking"
  FOR EACH ROW EXECUTE FUNCTION public.rentral_guard_allocated_booking();
COMMIT;
