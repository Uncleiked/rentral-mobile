-- Listing drafts (save-at-any-step wizard) + marketplace feed support.
--
-- Draft rows are partial by nature, so the NOT NULLs move off the columns and
-- into a CHECK that only non-draft statuses must satisfy — including
-- hardware_coordinates, which Prisma can't write. Save/post transactions
-- therefore always: write fields while status='draft' → set coordinates via
-- raw SQL → flip status. The CHECK holds after every statement.

ALTER TABLE "Listing"
  ALTER COLUMN "text_address" DROP NOT NULL,
  ALTER COLUMN "base_rent_amount" DROP NOT NULL,
  ALTER COLUMN "asset_metadata" DROP NOT NULL,
  ALTER COLUMN "video_path" DROP NOT NULL,
  ALTER COLUMN "document_path" DROP NOT NULL,
  ALTER COLUMN "listing_status" SET DEFAULT 'draft';

ALTER TABLE "Listing" ADD COLUMN "wizard_step" TEXT;

ALTER TABLE "Listing" ADD CONSTRAINT "Listing_posted_complete_check" CHECK (
  "listing_status" = 'draft' OR (
    "text_address" IS NOT NULL
    AND "base_rent_amount" IS NOT NULL
    AND "asset_metadata" IS NOT NULL
    AND "video_path" IS NOT NULL
    AND "document_path" IS NOT NULL
    AND "hardware_coordinates" IS NOT NULL
  )
);

-- Feed query: newest non-draft listings.
CREATE INDEX "Listing_listing_status_createdAt_idx" ON "Listing"("listing_status", "createdAt" DESC);
