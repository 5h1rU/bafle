import * as Schema from "effect/Schema";

/** The page a track was played from: its list there is what plays after it. */
export const PlayOrigin = Schema.Literals([
  "New",
  "Search",
  "Track",
  "Album",
  "Artist",
  "Playlist",
  "Genre",
  "Station",
]);
export type PlayOrigin = typeof PlayOrigin.Type;
