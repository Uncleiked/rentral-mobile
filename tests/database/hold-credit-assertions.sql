-- Synthetic fixtures, applied only by the task-owned local database harness.
BEGIN;
INSERT INTO public."Booking" (id,listing_id,seeker_id,lister_id,kind,status,starts_at,ends_at,expires_at,amount_kobo,"updatedAt") VALUES
('a727d7b3-2148-43e4-86df-a0717569fec4','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','hold','confirmed','2040-02-01T12:00Z','2040-02-03T12:00Z',now()+interval '1 day',2000000,now()),
('a727d7b3-2148-43e4-86df-a0717569fec5','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','rental','requested','2040-02-01T12:00Z','2040-02-03T12:00Z',null,10000000,now()),
('a727d7b3-2148-43e4-86df-a0717569fec6','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','rental','requested','2040-02-01T12:00Z','2040-02-03T12:00Z',null,10000000,now()),
('a727d7b3-2148-43e4-86df-a0717569fec7','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','rental','requested','2040-02-01T12:00Z','2040-02-03T12:00Z',null,10000000,now());
INSERT INTO public."PaymentIntent" (id,booking_id,user_id,kind,reference,idempotency_key,amount_kobo,customer_email,status,paid_at,"updatedAt") VALUES
('credit-source-payment','a727d7b3-2148-43e4-86df-a0717569fec4','22222222-2222-4222-8222-222222222222','booking','synthetic-credit-reference','synthetic-credit-key',2000000,'seeker@rentral.example.test','succeeded',now(),now());
INSERT INTO public."LedgerTransaction" (id,payment_id,kind) VALUES ('credit-source-ledger','credit-source-payment','provider_collection');
INSERT INTO public."LedgerEntry" (id,transaction_id,account_key,direction,amount_kobo) VALUES
('credit-source-debit','credit-source-ledger','provider:paystack:collections','debit',2000000),
('credit-source-credit','credit-source-ledger','customer:unsettled','credit',2000000);
COMMIT;

BEGIN;
SELECT id FROM public."Listing" WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' FOR UPDATE;
UPDATE public."Booking" SET status='converted' WHERE id='a727d7b3-2148-43e4-86df-a0717569fec4';
DO $$ BEGIN
  BEGIN
    INSERT INTO public."HoldCreditAllocation" (id,hold_booking_id,rental_booking_id,amount_kobo) VALUES ('wrong-renter-credit','a727d7b3-2148-43e4-86df-a0717569fec4','a727d7b3-2148-43e4-86df-a0717569fec7',2000000);
    RAISE EXCEPTION 'Holding credit crossed participant boundary';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public."HoldCreditAllocation" (id,hold_booking_id,rental_booking_id,amount_kobo) VALUES ('wrong-amount-credit','a727d7b3-2148-43e4-86df-a0717569fec4','a727d7b3-2148-43e4-86df-a0717569fec5',1999999);
    RAISE EXCEPTION 'Partial or forged holding credit accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
INSERT INTO public."HoldCreditAllocation" (id,hold_booking_id,rental_booking_id,amount_kobo) VALUES ('synthetic-hold-allocation','a727d7b3-2148-43e4-86df-a0717569fec4','a727d7b3-2148-43e4-86df-a0717569fec5',2000000);
UPDATE public."Booking" SET status='awaiting_payment',hold_credit_kobo=2000000,expires_at=now()+interval '30 minutes',pricing_snapshot='{"period":"day","days":2,"baseKobo":"10000000","fees":[],"totalKobo":"10000000","holdBookingId":"a727d7b3-2148-43e4-86df-a0717569fec4","holdCreditKobo":"2000000","payableKobo":"8000000"}' WHERE id='a727d7b3-2148-43e4-86df-a0717569fec5';
COMMIT;

DO $$ BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public."HoldCreditAllocation"'::regclass) OR
    has_table_privilege('authenticated','public."HoldCreditAllocation"','SELECT') OR has_table_privilege('anon','public."HoldCreditAllocation"','SELECT') THEN
    RAISE EXCEPTION 'Holding allocation table exposed through Data API';
  END IF;
  BEGIN UPDATE public."HoldCreditAllocation" SET amount_kobo=1 WHERE id='synthetic-hold-allocation'; RAISE EXCEPTION 'Holding credit audit mutation allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN DELETE FROM public."HoldCreditAllocation" WHERE id='synthetic-hold-allocation'; RAISE EXCEPTION 'Holding credit audit deletion allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public."Booking" SET hold_credit_kobo=0 WHERE id='a727d7b3-2148-43e4-86df-a0717569fec5'; RAISE EXCEPTION 'Allocated credit reset allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public."Booking" SET status='confirmed' WHERE id='a727d7b3-2148-43e4-86df-a0717569fec4'; RAISE EXCEPTION 'Consumed hold revived'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public."HoldCreditAllocation" (id,hold_booking_id,rental_booking_id,amount_kobo) VALUES ('duplicate-credit','a727d7b3-2148-43e4-86df-a0717569fec4','a727d7b3-2148-43e4-86df-a0717569fec6',2000000);
    RAISE EXCEPTION 'Holding credit allocated twice';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;

-- A cancelled conversion leaves an immutable allocation and reviewable funds.
BEGIN;
UPDATE public."Booking" SET settlement_status='requires_review' WHERE id IN ('a727d7b3-2148-43e4-86df-a0717569fec4','a727d7b3-2148-43e4-86df-a0717569fec5');
UPDATE public."Booking" SET status='cancelled' WHERE id='a727d7b3-2148-43e4-86df-a0717569fec5';
COMMIT;
DO $$ BEGIN
  IF (SELECT count(*) FROM public."HoldCreditAllocation" WHERE id='synthetic-hold-allocation') <> 1 OR
    (SELECT status FROM public."Booking" WHERE id='a727d7b3-2148-43e4-86df-a0717569fec4') <> 'converted' OR
    (SELECT count(*) FROM public."LedgerTransaction" WHERE id LIKE 'credit-%') <> 1 THEN
    RAISE EXCEPTION 'Cancellation recycled credit or invented a provider transaction';
  END IF;
END $$;
