-- Run only against the labelled, synthetic PostGIS fixture after platform-seed.sql.
-- All changes are rolled back; no provider or external environment is involved.
BEGIN;
INSERT INTO auth.users(id,email) VALUES ('44444444-4444-4444-8444-444444444444','safety-second-staff@rentral.example.test');
UPDATE public."User" SET username='test_safety_reviewer',kyc_verified=true WHERE id='44444444-4444-4444-8444-444444444444';
INSERT INTO public."Dispute"(id,booking_id,opened_by,reason,"updatedAt") VALUES
('safety-fixture-report','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Synthetic report of a material mismatch in an asset.',now());
DO $$ BEGIN
  IF has_table_privilege('anon','public."SafetyNotice"','SELECT') OR has_table_privilege('authenticated','public."SafetyNotice"','SELECT') OR has_table_privilege('authenticated','public."SafetyAppeal"','SELECT') THEN RAISE EXCEPTION 'Safety records exposed through the Data API'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public."SafetyNotice"'::regclass) OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public."SafetyAppeal"'::regclass) THEN RAISE EXCEPTION 'Safety RLS missing'; END IF;
  BEGIN
    INSERT INTO public."SafetyNotice"(id,subject_id,dispute_id,issued_by,category,private_reason,"updatedAt") VALUES
    ('safety-bad-subject','33333333-3333-4333-8333-333333333333','safety-fixture-report','44444444-4444-4444-8444-444444444444','misrepresentation','Synthetic reviewed evidence for the test only.',now());
    RAISE EXCEPTION 'An unrelated account received a notice';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public."SafetyNotice"(id,subject_id,dispute_id,issued_by,category,private_reason,"updatedAt") VALUES
    ('safety-bad-issuer','11111111-1111-4111-8111-111111111111','safety-fixture-report','22222222-2222-4222-8222-222222222222','misrepresentation','Synthetic reviewed evidence for the test only.',now());
    RAISE EXCEPTION 'A participant reviewed their own report';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
INSERT INTO public."SafetyNotice"(id,subject_id,dispute_id,issued_by,category,private_reason,"updatedAt") VALUES
('safety-fixture-notice','11111111-1111-4111-8111-111111111111','safety-fixture-report','33333333-3333-4333-8333-333333333333','misrepresentation','Synthetic reviewed evidence for the test only.',now());
DO $$ BEGIN
  BEGIN
    INSERT INTO public."SafetyNotice"(id,subject_id,dispute_id,issued_by,category,private_reason,"updatedAt") VALUES
    ('safety-duplicate-notice','11111111-1111-4111-8111-111111111111','safety-fixture-report','33333333-3333-4333-8333-333333333333','other','Synthetic reviewed evidence for the test only.',now());
    RAISE EXCEPTION 'Duplicate safety notice allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN UPDATE public."SafetyNotice" SET private_reason='Replacement of an immutable human finding.' WHERE id='safety-fixture-notice'; RAISE EXCEPTION 'Notice evidence was rewritten'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public."SafetyNotice" SET status='removed',removed_at=now() WHERE id='safety-fixture-notice'; RAISE EXCEPTION 'Notice removed without appeal decision'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public."SafetyAppeal"(id,notice_id,appellant_id,statement,"updatedAt") VALUES
    ('safety-bad-appellant','safety-fixture-notice','22222222-2222-4222-8222-222222222222','Synthetic appeal belonging to another account.',now());
    RAISE EXCEPTION 'Another account appealed a notice';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
INSERT INTO public."SafetyAppeal"(id,notice_id,appellant_id,statement,"updatedAt") VALUES
('safety-fixture-appeal','safety-fixture-notice','11111111-1111-4111-8111-111111111111','Synthetic appeal disputing this safety finding.',now());
DO $$ BEGIN
  BEGIN
    UPDATE public."SafetyAppeal" SET status='upheld',decided_by='44444444-4444-4444-8444-444444444444',decision_reason=NULL,decided_at=now() WHERE id='safety-fixture-appeal';
    RAISE EXCEPTION 'Decision without a reason allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public."SafetyAppeal"(id,notice_id,appellant_id,statement,"updatedAt") VALUES
    ('safety-duplicate-appeal','safety-fixture-notice','11111111-1111-4111-8111-111111111111','Synthetic duplicate appeal to test serialization.',now());
    RAISE EXCEPTION 'Duplicate appeal allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    UPDATE public."SafetyAppeal" SET status='removed',decided_by='33333333-3333-4333-8333-333333333333',decision_reason='Synthetic appeal decision by the original reviewer.',decided_at=now() WHERE id='safety-fixture-appeal';
    RAISE EXCEPTION 'Original issuer decided their own appeal';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public."SafetyAppeal" SET status='removed',decided_by='22222222-2222-4222-8222-222222222222',decision_reason='Synthetic appeal decision by a booking participant.',decided_at=now() WHERE id='safety-fixture-appeal';
    RAISE EXCEPTION 'Booking participant decided appeal';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
UPDATE public."SafetyAppeal" SET status='removed',decided_by='44444444-4444-4444-8444-444444444444',decision_reason='Synthetic independent review accepting the appeal.',decided_at=now() WHERE id='safety-fixture-appeal';
UPDATE public."SafetyNotice" SET status='removed',removed_at=now() WHERE id='safety-fixture-notice';
DO $$ BEGIN
  BEGIN UPDATE public."SafetyAppeal" SET decision_reason='Attempt to rewrite a completed safety decision.' WHERE id='safety-fixture-appeal'; RAISE EXCEPTION 'Final appeal decision rewritten'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public."SafetyNotice" SET status='active',removed_at=NULL WHERE id='safety-fixture-notice'; RAISE EXCEPTION 'Removed finding reactivated'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN DELETE FROM public."SafetyAppeal" WHERE id='safety-fixture-appeal'; RAISE EXCEPTION 'Appeal history deleted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN DELETE FROM public."SafetyNotice" WHERE id='safety-fixture-notice'; RAISE EXCEPTION 'Safety notice history deleted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ROLLBACK;
SELECT 'Safety notice participant, privacy, independence and history checks passed';
