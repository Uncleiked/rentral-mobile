-- A dispute does not end possession or release a paid reservation's dates.
BEGIN;
ALTER TABLE public."Booking" DROP CONSTRAINT "Booking_no_overlapping_rentals";
ALTER TABLE public."Booking" ADD CONSTRAINT "Booking_no_overlapping_rentals" EXCLUDE USING gist (
  "listing_id" extensions.gist_text_ops WITH =,
  tstzrange("starts_at", "ends_at", '[)') WITH &&
) WHERE ("kind" IN ('rental','hold') AND "status" IN ('awaiting_payment','confirmed','disputed'));
COMMIT;
