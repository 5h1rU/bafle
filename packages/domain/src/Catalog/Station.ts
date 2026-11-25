import * as Schema from "effect/Schema";
import { Artwork } from "./Artwork.ts";
import { GenreLabel } from "./Genre.ts";

/** A station's id in the catalog. Opaque: only the catalog that issued it can read it. */
export const StationId = Schema.String.pipe(Schema.brand("StationId"));
export type StationId = typeof StationId.Type;

/** A station as a shelf shows it: a run of songs the catalog keeps going around one idea. */
export const StationSummary = Schema.Struct({
  id: StationId,
  title: Schema.String,
  picture: Schema.NullOr(Artwork),
});
export type StationSummary = typeof StationSummary.Type;

/** The stations of one genre, under the genre they belong to, as the catalog orders them. */
export const StationGroup = Schema.Struct({
  genre: GenreLabel,
  stations: Schema.Array(StationSummary),
});
export type StationGroup = typeof StationGroup.Type;
