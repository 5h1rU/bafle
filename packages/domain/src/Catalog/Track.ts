import * as Schema from "effect/Schema";
import { AlbumId } from "./Album.ts";
import { ArtistCredit } from "./Artist.ts";
import { Artwork } from "./Artwork.ts";

/** A track's id in the catalog. Opaque: only the catalog that issued it can read it. */
export const TrackId = Schema.String.pipe(Schema.brand("TrackId"));
export type TrackId = typeof TrackId.Type;

/** A track as a list row shows it, with the album it is on. */
export const TrackSummary = Schema.Struct({
  id: TrackId,
  title: Schema.String,
  artist: ArtistCredit,
  album: Schema.Struct({
    id: AlbumId,
    title: Schema.String,
    cover: Schema.NullOr(Artwork),
  }),
  durationSeconds: Schema.Int,
  /** A short excerpt anyone may play, when the catalog offers one. It can expire: ask again before playing. */
  previewUrl: Schema.NullOr(Schema.String),
  explicit: Schema.Boolean,
});
export type TrackSummary = typeof TrackSummary.Type;
