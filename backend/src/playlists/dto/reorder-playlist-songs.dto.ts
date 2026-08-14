import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

/**
 * Reorder payload. `songIds` is the *full* desired order of the playlist's
 * Song ids (must match the current set exactly). Positions are recomputed
 * server-side so duplicate/missing ids can never corrupt ordering.
 */
export class ReorderPlaylistSongsDto {
  @IsArray()
  @ArrayUnique({ message: 'songIds must not contain duplicates' })
  @IsUUID('4', { each: true, message: 'songIds must be valid uuids' })
  songIds!: string[];
}
