import { IsUUID } from 'class-validator';

/**
 * Add-a-song-to-playlist payload. Only the shared Song id is accepted — the
 * song already exists in the Song table (from the Trip Music Library flow), so
 * no YouTube metadata is sent or trusted from the client.
 */
export class AddPlaylistSongDto {
  @IsUUID('4')
  songId!: string;
}
