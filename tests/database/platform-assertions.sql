DO $$
DECLARE t text;
BEGIN
  IF (SELECT count(*) FROM public."User") <> 3 THEN RAISE EXCEPTION 'Auth signup trigger did not produce profiles'; END IF;
  IF (SELECT public FROM storage.buckets WHERE id='listings-media') THEN RAISE EXCEPTION 'Original media bucket must be private'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='listings-media' AND file_size_limit=209715200
    AND allowed_mime_types @> ARRAY['video/webm','video/mp4','video/quicktime','image/jpeg']) THEN
    RAISE EXCEPTION 'Native QuickTime support must preserve the bounded existing media formats';
  END IF;
  IF (SELECT public FROM storage.buckets WHERE id='compliance-docs') IS DISTINCT FROM false THEN RAISE EXCEPTION 'Existing compliance bucket must be private'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='Message') THEN RAISE EXCEPTION 'Message publication missing'; END IF;
  FOREACH t IN ARRAY ARRAY['User','IndividualProfile','OrganizationProfile','Listing','Booking','PaymentIntent','PaymentEvent','LedgerTransaction','LedgerEntry','AdminAudit','Notification','MarketEvent','ListingVerification','DocumentReview','Renewal'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=format('public.%I',t)::regclass) THEN RAISE EXCEPTION 'RLS missing: %',t; END IF;
    IF has_table_privilege('authenticated',format('public.%I',t),'SELECT') OR has_table_privilege('anon',format('public.%I',t),'SELECT') THEN RAISE EXCEPTION 'Private table exposed: %',t; END IF;
  END LOOP;
END $$;

SET ROLE anon;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='listings-media') THEN RAISE EXCEPTION 'Legacy policy exposed anonymous originals'; END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='compliance-docs') THEN RAISE EXCEPTION 'Legacy policy exposed anonymous compliance documents'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='profile-avatars') THEN RAISE EXCEPTION 'Compliance boundary hid unrelated public avatars'; END IF;
  BEGIN PERFORM 1 FROM public."PaymentIntent"; RAISE EXCEPTION 'Anonymous financial table read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public."Conversation"; RAISE EXCEPTION 'Anonymous conversation read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
SELECT set_config('realtime.topic','rentral:conversation:cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SET ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM public."Conversation") <> 1 OR (SELECT count(*) FROM public."Message") <> 1 THEN RAISE EXCEPTION 'Participant cannot read own conversation'; END IF;
  IF (SELECT count(*) FROM realtime.messages) <> 1 THEN RAISE EXCEPTION 'Participant cannot read private broadcast'; END IF;
  INSERT INTO realtime.messages(topic,extension,payload) VALUES ('rentral:conversation:cccccccc-cccc-4ccc-8ccc-cccccccccccc','presence','{}');
  BEGIN INSERT INTO public."Message" (id,conversation_id,sender_id,body,client_id) VALUES ('forged','cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','bypass server action','forged'); RAISE EXCEPTION 'Direct chat mutation unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public."Booking"; RAISE EXCEPTION 'Direct private booking reads unexpectedly allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
SET ROLE authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public."Conversation") OR EXISTS (SELECT 1 FROM public."Message") THEN RAISE EXCEPTION 'Cross-participant chat leak'; END IF;
  IF EXISTS (SELECT 1 FROM realtime.messages) THEN RAISE EXCEPTION 'Legacy broad policy exposed private broadcast'; END IF;
  BEGIN INSERT INTO realtime.messages(topic,extension,payload) VALUES ('rentral:conversation:cccccccc-cccc-4ccc-8ccc-cccccccccccc','broadcast','{}'); RAISE EXCEPTION 'Cross-participant broadcast allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id='listings-media') <> 1 THEN RAISE EXCEPTION 'Owner media boundary failed'; END IF;
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id='compliance-docs') <> 1 THEN RAISE EXCEPTION 'Compliance owner boundary failed'; END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='compliance-docs' AND name LIKE '11111111%') THEN RAISE EXCEPTION 'Cross-owner compliance document leak'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SET ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM public."Message") <> 1 THEN RAISE EXCEPTION 'Host membership read failed'; END IF;
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id='compliance-docs') <> 1 THEN RAISE EXCEPTION 'Owner cannot read their referenced compliance document'; END IF;
  INSERT INTO storage.objects (bucket_id,name) VALUES ('compliance-docs','11111111-1111-4111-8111-111111111111/fixture/orphan.pdf');
  BEGIN INSERT INTO storage.objects (bucket_id,name) VALUES ('compliance-docs','33333333-3333-4333-8333-333333333333/fixture/forged.pdf'); RAISE EXCEPTION 'Cross-owner compliance upload allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  DELETE FROM storage.objects WHERE name='11111111-1111-4111-8111-111111111111/fixture/orphan.pdf';
  IF EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE '%orphan.pdf') THEN RAISE EXCEPTION 'Owner compliance orphan cleanup blocked'; END IF;
  BEGIN DELETE FROM storage.objects WHERE name='11111111-1111-4111-8111-111111111111/fixture/video.mp4'; RAISE EXCEPTION 'Committed video deletion allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE storage.objects SET name='11111111-1111-4111-8111-111111111111/fixture/moved.mp4' WHERE name='11111111-1111-4111-8111-111111111111/fixture/video.mp4'; RAISE EXCEPTION 'Committed video move allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN DELETE FROM storage.objects WHERE name='11111111-1111-4111-8111-111111111111/fixture/title.pdf'; RAISE EXCEPTION 'Committed compliance deletion allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE storage.objects SET name='11111111-1111-4111-8111-111111111111/fixture/moved.pdf' WHERE name='11111111-1111-4111-8111-111111111111/fixture/title.pdf'; RAISE EXCEPTION 'Committed compliance move allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
  DELETE FROM storage.objects WHERE name='11111111-1111-4111-8111-111111111111/fixture/orphan.mp4';
  IF EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE '%orphan.mp4') THEN RAISE EXCEPTION 'Uncommitted owner cleanup blocked'; END IF;
END $$;
RESET ROLE;

INSERT INTO public."PaymentEvent" (id,payment_id,event_key,event_type,payload_hash) VALUES ('event1','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','charge.success:fixture','charge.success','hash');
DO $$ BEGIN
  BEGIN INSERT INTO public."PaymentEvent" (id,payment_id,event_key,event_type,payload_hash) VALUES ('event2','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','charge.success:fixture','charge.success','hash'); RAISE EXCEPTION 'Duplicate callback receipt allowed'; EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO public."PaymentIntent" (id,booking_id,user_id,kind,reference,idempotency_key,amount_kobo,customer_email,"updatedAt") VALUES ('duplicate','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','booking','fixture-payment','another-key',300000,'seeker@rentral.example.test',now()); RAISE EXCEPTION 'Duplicate provider reference allowed'; EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;

BEGIN;
INSERT INTO public."LedgerTransaction" (id,payment_id,kind) VALUES ('ledger-balanced','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','provider_collection');
INSERT INTO public."LedgerEntry" (id,transaction_id,account_key,direction,amount_kobo) VALUES
('debit-balanced','ledger-balanced','provider:collections','debit',300000),('credit-balanced','ledger-balanced','customer:unsettled','credit',300000);
COMMIT;
DO $$ BEGIN
  BEGIN UPDATE public."LedgerEntry" SET amount_kobo=1 WHERE id='debit-balanced'; RAISE EXCEPTION 'Ledger mutation allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN DELETE FROM public."LedgerTransaction" WHERE id='ledger-balanced'; RAISE EXCEPTION 'Ledger deletion allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public."LedgerEntry" (id,transaction_id,account_key,direction,amount_kobo) VALUES ('late-entry','ledger-balanced','test','debit',1); RAISE EXCEPTION 'Committed ledger accepted additional entry'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

INSERT INTO public."AdminAudit" (id,actor_id,action,target_type,target_id,reason) VALUES ('audit-1','11111111-1111-4111-8111-111111111111','test','listing','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Synthetic test only');
DO $$ BEGIN
  BEGIN UPDATE public."AdminAudit" SET reason='altered' WHERE id='audit-1'; RAISE EXCEPTION 'Administrative audit mutation allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT 'Platform RLS, storage protection, receipt uniqueness and balanced ledger checks passed';

-- Repeated events from nine people cannot meet a ten-contributor monthly cohort.
INSERT INTO public."MarketEvent" (id,subject_hash,event_type,category,intent,neighborhood,budget_band,dedupe_key)
SELECT 'cohort-'||i,'monthly-subject-'||i,'search','house','rent','yaba','1m-3m','cohort-key-'||i FROM generate_series(1,9) i;
INSERT INTO public."MarketEvent" (id,subject_hash,event_type,category,intent,neighborhood,budget_band,dedupe_key)
SELECT 'repeat-'||i,'monthly-subject-1','search','house','rent','yaba','1m-3m','repeat-key-'||i FROM generate_series(1,15) i;
DO $$ BEGIN
  IF EXISTS (SELECT category,intent,neighborhood,budget_band FROM public."MarketEvent" WHERE "createdAt">=date_trunc('month',now()) GROUP BY category,intent,neighborhood,budget_band HAVING count(DISTINCT subject_hash)>=10) THEN RAISE EXCEPTION 'Small cohort exposed by repeated activity'; END IF;
END $$;
INSERT INTO public."MarketEvent" (id,subject_hash,event_type,category,intent,neighborhood,budget_band,dedupe_key)
VALUES ('tenth-person','monthly-subject-10','search','house','rent','yaba','1m-3m','tenth-key');
INSERT INTO public."MarketEvent" (id,subject_hash,event_type,category,intent,neighborhood,budget_band,dedupe_key,"createdAt")
SELECT 'historical-'||i,'previous-subject-'||i,'search','boat','rent','lekki','under-1m','historical-key-'||i,date_trunc('month',now())-interval '1 day' FROM generate_series(1,20) i;
DO $$ BEGIN
  IF (SELECT count(*) FROM (SELECT category,intent,neighborhood,budget_band FROM public."MarketEvent" WHERE "createdAt">=date_trunc('month',now()) GROUP BY category,intent,neighborhood,budget_band HAVING count(DISTINCT subject_hash)>=10) cohorts) <> 1 THEN RAISE EXCEPTION 'Monthly contributor or historical boundary failed'; END IF;
END $$;
