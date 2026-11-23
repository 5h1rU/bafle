import * as Schema from "effect/Schema";

/**
 * Deezer's answers, as far as Bafle reads them. Everything else Deezer sends
 * is dropped here, so it can never leak into the model.
 */

/** An image URL. Deezer leaves it out, null or empty when it has no picture. */
const Image = Schema.optional(Schema.NullOr(Schema.String));

const DeezerArtistRef = Schema.Struct({ id: Schema.Number, name: Schema.String });

export const DeezerArtist = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  picture_medium: Image,
  picture_big: Image,
  picture_xl: Image,
});
export type DeezerArtist = typeof DeezerArtist.Type;

export const DeezerAlbum = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  cover_medium: Image,
  cover_big: Image,
  cover_xl: Image,
  explicit_lyrics: Schema.optional(Schema.NullOr(Schema.Boolean)),
  artist: DeezerArtistRef,
});
export type DeezerAlbum = typeof DeezerAlbum.Type;

export const DeezerTrack = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  duration: Schema.Number,
  preview: Image,
  explicit_lyrics: Schema.optional(Schema.NullOr(Schema.Boolean)),
  artist: DeezerArtistRef,
  album: Schema.Struct({
    id: Schema.Number,
    title: Schema.String,
    cover_medium: Image,
    cover_big: Image,
    cover_xl: Image,
  }),
});
export type DeezerTrack = typeof DeezerTrack.Type;

/** One track asked for by id: a list row's fields, and what only its own page shows. */
export const DeezerTrackPage = Schema.Struct({
  ...DeezerTrack.fields,
  release_date: Schema.optional(Schema.NullOr(Schema.String)),
  track_position: Schema.optional(Schema.NullOr(Schema.Number)),
  /** Everyone credited. Deezer repeats an artist once per role they have. */
  contributors: Schema.optional(Schema.NullOr(Schema.Array(DeezerArtist))),
});
export type DeezerTrackPage = typeof DeezerTrackPage.Type;

/**
 * How Deezer refuses: status 200 and this body. Code 800 is "no data", its
 * way of saying nothing has that id.
 */
export const DeezerRefusal = Schema.Struct({
  error: Schema.Struct({ code: Schema.optional(Schema.Number) }),
});
export const DEEZER_NO_DATA = 800;

export const DeezerPlaylist = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  nb_tracks: Schema.optional(Schema.NullOr(Schema.Number)),
  picture_medium: Image,
  picture_big: Image,
  picture_xl: Image,
  user: Schema.optional(Schema.NullOr(Schema.Struct({ name: Schema.String }))),
});
export type DeezerPlaylist = typeof DeezerPlaylist.Type;

/**
 * Every list Deezer answers with is wrapped in `data`. A refusal (a quota, a
 * bad parameter) arrives with status 200 and an `error` field instead, so it
 * fails this schema, as it should.
 */
export const listOf = <Item extends Schema.Top>(item: Item) =>
  Schema.Struct({ data: Schema.Array(item) });
