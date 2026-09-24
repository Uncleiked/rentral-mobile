BEGIN;

CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "listing_id" TEXT NOT NULL UNIQUE REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "source_path" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "mux_asset_id" TEXT UNIQUE,
  "playback_id" TEXT UNIQUE,
  "duration" DOUBLE PRECISION,
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" BETWEEN 0 AND 5),
  "error_code" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "MediaAsset_status_check" CHECK ("status" IN ('queued', 'submitting', 'uncertain', 'processing', 'ready', 'errored')),
  CONSTRAINT "MediaAsset_ready_check" CHECK (
    "status" <> 'ready' OR ("mux_asset_id" IS NOT NULL AND "playback_id" IS NOT NULL AND "duration" IS NOT NULL AND "duration" > 0 AND "duration" <= 125)
  )
);
CREATE INDEX "MediaAsset_status_updatedAt_idx" ON "MediaAsset"("status", "updatedAt");

CREATE TABLE "MediaWebhookReceipt" (
  "event_id" TEXT NOT NULL PRIMARY KEY,
  "media_id" TEXT NOT NULL REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MediaWebhookReceipt_media_id_idx" ON "MediaWebhookReceipt"("media_id");

ALTER TABLE "MediaAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MediaWebhookReceipt" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "MediaAsset", "MediaWebhookReceipt" FROM anon, authenticated;

COMMIT;
