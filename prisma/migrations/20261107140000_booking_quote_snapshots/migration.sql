-- Retain the server-calculated line items accepted with the original request.
ALTER TABLE public."Booking" ADD COLUMN "pricing_snapshot" JSONB;
