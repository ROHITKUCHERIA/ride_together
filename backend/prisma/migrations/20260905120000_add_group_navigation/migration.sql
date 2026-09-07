-- Phase 3 — Group navigation.
-- Adds the shared trip destination provenance columns, navigation status
-- enums, and the lightweight per-rider NavigationSession table.

-- AlterTable (trips)
ALTER TABLE "trips"
    ADD COLUMN "destination_set_by" UUID,
    ADD COLUMN "destination_set_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "trips_destination_set_by_idx" ON "trips"("destination_set_by");

-- AddForeignKey (destination_set_by -> users.id, SetNull on user delete)
ALTER TABLE "trips"
    ADD CONSTRAINT "trips_destination_set_by_fkey" FOREIGN KEY ("destination_set_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "NavigationMode" AS ENUM ('PERSONAL', 'GROUP');

-- CreateEnum
CREATE TYPE "NavigationStatus" AS ENUM ('IDLE', 'NAVIGATING', 'OFF_ROUTE', 'REROUTING', 'ARRIVED', 'GPS_LOST', 'OFFLINE');

-- CreateTable
CREATE TABLE "navigation_sessions" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mode" "NavigationMode" NOT NULL DEFAULT 'GROUP',
    "status" "NavigationStatus" NOT NULL DEFAULT 'NAVIGATING',
    "destination_latitude" DOUBLE PRECISION,
    "destination_longitude" DOUBLE PRECISION,
    "destination_name" TEXT,
    "distance_remaining_meters" DOUBLE PRECISION,
    "eta_epoch_ms" DOUBLE PRECISION,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "last_updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "navigation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "navigation_sessions_trip_id_user_id_key" ON "navigation_sessions"("trip_id", "user_id");

-- CreateIndex
CREATE INDEX "navigation_sessions_trip_id_idx" ON "navigation_sessions"("trip_id");

-- CreateIndex
CREATE INDEX "navigation_sessions_user_id_idx" ON "navigation_sessions"("user_id");

-- CreateIndex
CREATE INDEX "navigation_sessions_last_updated_at_idx" ON "navigation_sessions"("last_updated_at");

-- AddForeignKey
ALTER TABLE "navigation_sessions"
    ADD CONSTRAINT "navigation_sessions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "navigation_sessions"
    ADD CONSTRAINT "navigation_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;