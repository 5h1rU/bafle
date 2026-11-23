import * as Schema from "effect/Schema";
import { Artwork } from "./Artwork.ts";

/** A playlist's id in the catalog. Opaque: only the catalog that issued it can read it. */
export const PlaylistId = Schema.String.pipe(Schema.brand("PlaylistId"));
export type PlaylistId = typeof PlaylistId.Type;

/** A playlist as a shelf or a result list shows it. */
export const PlaylistSummary = Schema.Struct({
  id: PlaylistId,
  title: Schema.String,
  /** Who keeps the playlist: an editor or a listener. */
  curator: Schema.String,
  picture: Schema.NullOr(Artwork),
  trackCount: Schema.Int,
});
export type PlaylistSummary = typeof PlaylistSummary.Type;
