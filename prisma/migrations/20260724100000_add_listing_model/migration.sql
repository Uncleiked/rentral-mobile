-- Listings (build-plan Item 06 logic phase).
--
-- hardware_coordinates uses PostGIS geography(Point, 4326) so the future
-- ST_DWithin handshake math (architecture.md) works without a backfill. The
-- column is nullable because Prisma cannot write Unsupported types — the
-- saveListing server action sets it via raw SQL in the same transaction as
-- the insert, so no committed listing exists without coordinates.

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "lister_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "text_address" TEXT NOT NULL,
    "base_rent_amount" DECIMAL(12,2) NOT NULL,
    "asset_metadata" JSONB NOT NULL,
    "video_path" TEXT NOT NULL,
    "poster_path" TEXT,
    "document_path" TEXT NOT NULL,
    "listing_status" TEXT NOT NULL DEFAULT 'pending_verification',
    "hardware_coordinates" extensions.geography(Point, 4326),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Listing_lister_id_createdAt_idx" ON "Listing"("lister_id", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_lister_id_fkey" FOREIGN KEY ("lister_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma-only table: mirror the harden_rls_on_app_tables treatment.
-- Deny-by-default RLS + revoked grants keep the Data API (PostgREST) out;
-- Prisma's postgres role bypasses RLS.
ALTER TABLE public."Listing" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."Listing" FROM anon, authenticated;
