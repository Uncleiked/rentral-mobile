-- Additive: no changes to User auto-projections or previously applied migrations.
ALTER TABLE public."WebhookLog"
  ADD COLUMN "event_created_at" timestamptz(3),
  ADD COLUMN "metadata_synced_at" timestamptz(3);

CREATE INDEX "WebhookLog_session_id_event_created_at_idx"
  ON public."WebhookLog" ("session_id", "event_created_at" DESC);

-- Establish a baseline only from authenticated historical session events whose
-- vendor, session, workflow and session kind match the user's current attempt.
-- Superseded/mixed workflow receipts must never become ordering markers.
WITH eligible AS (
  SELECT w."id", w."raw_body"::jsonb AS body
  FROM public."WebhookLog" w JOIN public."User" u
    ON u."didit_session_id" = w."session_id"
  WHERE w."processed_at" IS NOT NULL
    AND w."webhook_type" IN ('status.updated', 'data.updated')
    AND w."raw_body"::jsonb->>'vendor_data' = u."id"
    AND w."raw_body"::jsonb->>'workflow_id' = u."didit_workflow_id"
    AND ((u."verification_kind" = 'kyb' AND w."raw_body"::jsonb->>'session_kind' = 'business')
      OR (u."verification_kind" = 'kyc' AND COALESCE(w."raw_body"::jsonb->>'session_kind', 'user') = 'user'))
)
UPDATE public."WebhookLog" w SET "event_created_at" =
  CASE WHEN jsonb_typeof(e.body->'created_at') = 'number'
    AND e.body->>'created_at' ~ '^[0-9]{1,12}$'
    THEN to_timestamp((e.body->>'created_at')::double precision) ELSE NULL END
FROM eligible e WHERE w."id" = e."id";

-- Existing KYC decisions are preserved. Reconcile existing accounts with the
-- current provider decision at cutover: the old receiver could already have
-- applied an older verdict last. No historical payload is republished or trusted
-- as an independent ownership/identity audit.
-- Retain the existing private-table/RLS grants; no browser permissions are added.
