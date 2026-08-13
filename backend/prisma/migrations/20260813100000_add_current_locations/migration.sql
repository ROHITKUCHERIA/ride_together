-- CurrentLocation: the rider's single most-recent position per trip.
-- The PostGIS geography column is added here (raw SQL) and exposed to Prisma
-- as Unsupported("geography") so the schema stays in sync.

-- CreateTable
CREATE TABLE "current_locations" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "location_geo" geography(Point, 4326),
    "last_updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "current_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "current_locations_trip_id_user_id_key" ON "current_locations"("trip_id", "user_id");

-- CreateIndex
CREATE INDEX "current_locations_trip_id_idx" ON "current_locations"("trip_id");

-- CreateIndex
CREATE INDEX "current_locations_user_id_idx" ON "current_locations"("user_id");

-- CreateIndex
CREATE INDEX "current_locations_last_updated_at_idx" ON "current_locations"("last_updated_at");

-- AddForeignKey
ALTER TABLE "current_locations" ADD CONSTRAINT "current_locations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "current_locations" ADD CONSTRAINT "current_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Coordinate bounds + sensor sanity (raw SQL; not expressible in Prisma).
ALTER TABLE "current_locations" ADD CONSTRAINT "current_locations_latitude_range_check"
  CHECK ("latitude" >= -90 AND "latitude" <= 90);

ALTER TABLE "current_locations" ADD CONSTRAINT "current_locations_longitude_range_check"
  CHECK ("longitude" >= -180 AND "longitude" <= 180);

ALTER TABLE "current_locations" ADD CONSTRAINT "current_locations_accuracy_non_negative_check"
  CHECK ("accuracy" >= 0);

ALTER TABLE "current_locations" ADD CONSTRAINT "current_locations_speed_non_negative_check"
  CHECK ("speed" IS NULL OR "speed" >= 0);

ALTER TABLE "current_locations" ADD CONSTRAINT "current_locations_heading_range_check"
  CHECK ("heading" IS NULL OR ("heading" >= 0 AND "heading" <= 360));
