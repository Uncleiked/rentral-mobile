-- Add onboarding completion state for Didit KYC/KYB and public usernames.
CREATE TABLE IF NOT EXISTS public."User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "kyc_verified" BOOLEAN NOT NULL DEFAULT false,
  "account_type" TEXT,
  "verifiedDocument" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON public."User"("email");

ALTER TABLE public."User"
ADD COLUMN IF NOT EXISTS "username" TEXT,
ADD COLUMN IF NOT EXISTS "verification_status" TEXT NOT NULL DEFAULT 'unverified',
ADD COLUMN IF NOT EXISTS "verification_kind" TEXT,
ADD COLUMN IF NOT EXISTS "didit_session_id" TEXT,
ADD COLUMN IF NOT EXISTS "didit_workflow_id" TEXT,
ADD COLUMN IF NOT EXISTS "didit_decision" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON public."User"("username");

CREATE TABLE IF NOT EXISTS public."WebhookLog" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "webhook_type" TEXT NOT NULL,
  "status" TEXT,
  "session_id" TEXT,
  "raw_body" TEXT NOT NULL,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebhookLog_event_id_key" ON public."WebhookLog"("event_id");
