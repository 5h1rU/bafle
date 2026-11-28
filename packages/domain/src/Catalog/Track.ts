import * as Schema from "effect/Schema";
import { AlbumId } from "./Album.ts";
import { ArtistCredit, ArtistSummary } from "./Artist.ts";
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
  /**
   * What anyone may play of it, when the catalog offers anything: a short
   * excerpt, or the whole track, as the catalog allows. It can expire: ask
   * again before playing.
   */
  previewUrl: Schema.NullOr(Schema.String),
  explicit: Schema.Boolean,
});
export type TrackSummary = typeof TrackSummary.Type;

/**
 * A track as its own page shows it: everything a row has, and what only the
 * page has room for.
 */
export const Track = Schema.Struct({
  ...TrackSummary.fields,
  /** Everyone credited on the track, the main artist first, each once. */
  artists: Schema.Array(ArtistSummary),
  /** The day it came out, as `YYYY-MM-DD`, when the catalog knows it. */
  releaseDate: Schema.NullOr(Schema.String),
  /** Its place on the album, counted from 1, when the catalog knows it. */
  trackNumber: Schema.NullOr(Schema.Int),
});
export type Track = typeof Track.Type;
