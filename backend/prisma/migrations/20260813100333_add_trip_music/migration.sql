-- DropForeignKey
ALTER TABLE "refresh_tokens" DROP CONSTRAINT "refresh_tokens_replaced_by_id_fkey";

-- CreateTable
CREATE TABLE "songs" (
    "id" UUID NOT NULL,
    "youtube_video_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channel_title" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "songs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_songs" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "song_id" UUID NOT NULL,
    "added_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_songs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "songs_youtube_video_id_key" ON "songs"("youtube_video_id");

-- CreateIndex
CREATE INDEX "songs_title_idx" ON "songs"("title");

-- CreateIndex
CREATE INDEX "trip_songs_trip_id_idx" ON "trip_songs"("trip_id");

-- CreateIndex
CREATE INDEX "trip_songs_song_id_idx" ON "trip_songs"("song_id");

-- CreateIndex
CREATE INDEX "trip_songs_added_by_user_id_idx" ON "trip_songs"("added_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_songs_trip_id_song_id_key" ON "trip_songs"("trip_id", "song_id");

-- AddForeignKey
ALTER TABLE "trip_songs" ADD CONSTRAINT "trip_songs_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_songs" ADD CONSTRAINT "trip_songs_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "songs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_songs" ADD CONSTRAINT "trip_songs_added_by_user_id_fkey" FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
