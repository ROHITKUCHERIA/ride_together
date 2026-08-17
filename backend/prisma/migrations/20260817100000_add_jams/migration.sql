-- CreateEnum
CREATE TYPE "JamStatus" AS ENUM ('ACTIVE', 'ENDED', 'DELETED');

-- CreateTable
CREATE TABLE "jam_sessions" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "host_user_id" UUID NOT NULL,
    "current_song_id" UUID,
    "status" "JamStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_playing" BOOLEAN NOT NULL DEFAULT false,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state_version" INTEGER NOT NULL DEFAULT 0,
    "host_last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "jam_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jam_participants" (
    "id" UUID NOT NULL,
    "jam_session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jam_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jam_sessions_trip_id_status_idx" ON "jam_sessions"("trip_id", "status");

-- CreateIndex
CREATE INDEX "jam_sessions_host_user_id_idx" ON "jam_sessions"("host_user_id");

-- CreateIndex
CREATE INDEX "jam_participants_jam_session_id_idx" ON "jam_participants"("jam_session_id");

-- CreateIndex
CREATE INDEX "jam_participants_user_id_idx" ON "jam_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "jam_participants_jam_session_id_user_id_key" ON "jam_participants"("jam_session_id", "user_id");

-- One active jam per trip (DB-level backstop; the app logic returns the
-- existing active jam on a duplicate create attempt).
CREATE UNIQUE INDEX "jam_sessions_one_active_jam_per_trip" ON "jam_sessions"("trip_id") WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "jam_sessions" ADD CONSTRAINT "jam_sessions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jam_sessions" ADD CONSTRAINT "jam_sessions_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jam_sessions" ADD CONSTRAINT "jam_sessions_current_song_id_fkey" FOREIGN KEY ("current_song_id") REFERENCES "songs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jam_participants" ADD CONSTRAINT "jam_participants_jam_session_id_fkey" FOREIGN KEY ("jam_session_id") REFERENCES "jam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jam_participants" ADD CONSTRAINT "jam_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;