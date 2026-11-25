import * as Schema from "effect/Schema";
import { Artwork } from "./Artwork.ts";

/** A genre's id in the catalog. Opaque: only the catalog that issued it can read it. */
export const GenreId = Schema.String.pipe(Schema.brand("GenreId"));
export type GenreId = typeof GenreId.Type;

/** The genre something is filed under: enough to name it and link to it. */
export const GenreLabel = Schema.Struct({ id: GenreId, name: Schema.String });
export type GenreLabel = typeof GenreLabel.Type;

/** A genre as a tile shows it. */
export const GenreSummary = Schema.Struct({
  id: GenreId,
  name: Schema.String,
  picture: Schema.NullOr(Artwork),
});
export type GenreSummary = typeof GenreSummary.Type;
