import * as Schema from "effect/Schema";
import { ArtistCredit } from "./Artist.ts";
import { Artwork } from "./Artwork.ts";

/** An album's id in the catalog. Opaque: only the catalog that issued it can read it. */
export const AlbumId = Schema.String.pipe(Schema.brand("AlbumId"));
export type AlbumId = typeof AlbumId.Type;

/** An album as a shelf or a result list shows it. */
export const AlbumSummary = Schema.Struct({
  id: AlbumId,
  title: Schema.String,
  artist: ArtistCredit,
  cover: Schema.NullOr(Artwork),
  explicit: Schema.Boolean,
});
export type AlbumSummary = typeof AlbumSummary.Type;
