import * as Schema from "effect/Schema";
import { Artwork } from "./Artwork.ts";

/** An artist's id in the catalog. Opaque: only the catalog that issued it can read it. */
export const ArtistId = Schema.String.pipe(Schema.brand("ArtistId"));
export type ArtistId = typeof ArtistId.Type;

/** Who made an album or a track: enough to name them and link to them. */
export const ArtistCredit = Schema.Struct({ id: ArtistId, name: Schema.String });
export type ArtistCredit = typeof ArtistCredit.Type;

/** An artist as a shelf or a result list shows them. */
export const ArtistSummary = Schema.Struct({
  id: ArtistId,
  name: Schema.String,
  picture: Schema.NullOr(Artwork),
});
export type ArtistSummary = typeof ArtistSummary.Type;
