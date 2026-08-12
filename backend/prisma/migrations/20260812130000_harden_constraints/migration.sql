-- Harden database constraints.
--
-- These constraints cannot be expressed in the Prisma schema, so they live in
-- raw SQL (same pattern as the PostGIS geography column). If a future
-- `prisma migrate dev` attempts to drop them, re-add the statements below.

-- 1) Trips: end_date must not precede start_date.
ALTER TABLE "trips" ADD CONSTRAINT "trips_end_date_after_start_date_check"
  CHECK ("end_date" >= "start_date");

-- 2) Trips: latitude/longitude bounds.
ALTER TABLE "trips" ADD CONSTRAINT "trips_start_latitude_range_check"
  CHECK ("start_latitude" IS NULL OR ("start_latitude" >= -90 AND "start_latitude" <= 90));

ALTER TABLE "trips" ADD CONSTRAINT "trips_start_longitude_range_check"
  CHECK ("start_longitude" IS NULL OR ("start_longitude" >= -180 AND "start_longitude" <= 180));

ALTER TABLE "trips" ADD CONSTRAINT "trips_destination_latitude_range_check"
  CHECK ("destination_latitude" IS NULL OR ("destination_latitude" >= -90 AND "destination_latitude" <= 90));

ALTER TABLE "trips" ADD CONSTRAINT "trips_destination_longitude_range_check"
  CHECK ("destination_longitude" IS NULL OR ("destination_longitude" >= -180 AND "destination_longitude" <= 180));

-- 3) At most one OWNER per trip (DB-level guarantee for ownership transfers).
CREATE UNIQUE INDEX "trip_members_single_owner_trip_idx"
  ON "trip_members"("trip_id") WHERE "role" = 'OWNER';

-- 4) refresh_tokens.replaced_by_id references the replaced session (family chain).
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_id_fkey"
  FOREIGN KEY ("replaced_by_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
