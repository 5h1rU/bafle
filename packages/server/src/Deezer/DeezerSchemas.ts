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

/** A track as an album lists it: Deezer does not always repeat the album on each one. */
export const DeezerAlbumTrack = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  duration: Schema.Number,
  preview: Image,
  explicit_lyrics: Schema.optional(Schema.NullOr(Schema.Boolean)),
  artist: DeezerArtistRef,
});
export type DeezerAlbumTrack = typeof DeezerAlbumTrack.Type;

/**
 * One album asked for by id: a tile's fields, the date, and its tracks. Only
 * the first of a long album's tracks come with it: `nb_tracks` says how many
 * there are in all.
 */
export const DeezerAlbumPage = Schema.Struct({
  ...DeezerAlbum.fields,
  release_date: Schema.optional(Schema.NullOr(Schema.String)),
  nb_tracks: Schema.optional(Schema.NullOr(Schema.Number)),
  tracks: Schema.optional(Schema.NullOr(Schema.Struct({ data: Schema.Array(DeezerAlbumTrack) }))),
});
export type DeezerAlbumPage = typeof DeezerAlbumPage.Type;

/** An album as Deezer lists it under its artist: it leaves the artist off each one. */
export const DeezerArtistAlbum = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  cover_medium: Image,
  cover_big: Image,
  cover_xl: Image,
  explicit_lyrics: Schema.optional(Schema.NullOr(Schema.Boolean)),
});
export type DeezerArtistAlbum = typeof DeezerArtistAlbum.Type;

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
 * One playlist asked for by id: a tile's fields, and its tracks. Deezer names
 * who keeps it `creator` here and `user` in a list. Only the first of a long
 * playlist's tracks come with it: `nb_tracks` says how many there are in all.
 */
export const DeezerPlaylistPage = Schema.Struct({
  ...DeezerPlaylist.fields,
  creator: Schema.optional(Schema.NullOr(Schema.Struct({ name: Schema.String }))),
  tracks: Schema.optional(Schema.NullOr(Schema.Struct({ data: Schema.Array(DeezerTrack) }))),
});
export type DeezerPlaylistPage = typeof DeezerPlaylistPage.Type;

/** A genre, in a list or asked for by id: Deezer sends the same of it either way. */
export const DeezerGenre = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  picture_medium: Image,
  picture_big: Image,
  picture_xl: Image,
});
export type DeezerGenre = typeof DeezerGenre.Type;

/** The genre Deezer lists first: all of them at once, which is no genre. */
export const DEEZER_ALL_GENRES = 0;

/** A station, which Deezer calls a radio, in a list or asked for by id. */
export const DeezerRadio = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  picture_medium: Image,
  picture_big: Image,
  picture_xl: Image,
});
export type DeezerRadio = typeof DeezerRadio.Type;

/** The stations of one genre: the genre's id and its name, which Deezer calls `title` here, and its radios. */
export const DeezerRadioGenre = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  radios: Schema.Array(DeezerRadio),
});
export type DeezerRadioGenre = typeof DeezerRadioGenre.Type;

/**
 * Every list Deezer answers with is wrapped in `data`. A refusal (a quota, a
 * bad parameter) arrives with status 200 and an `error` field instead, so it
 * fails this schema, as it should.
 */
export const listOf = <Item extends Schema.Top>(item: Item) =>
  Schema.Struct({ data: Schema.Array(item) });

/**
 * A list that Deezer hands over a page at a time: `total` says how many items
 * there are in all, and `next` is there for as long as a page follows.
 */
export const pageOf = <Item extends Schema.Top>(item: Item) =>
  Schema.Struct({
    data: Schema.Array(item),
    total: Schema.optional(Schema.NullOr(Schema.Number)),
    next: Schema.optional(Schema.NullOr(Schema.String)),
  });

/**
 * What is played most in one genre, every kind in one answer. Deezer sends
 * podcasts too, which Bafle does not read, and a kind it has nothing for can
 * be left out.
 */
export const DeezerChart = Schema.Struct({
  tracks: Schema.optional(Schema.NullOr(listOf(DeezerTrack))),
  albums: Schema.optional(Schema.NullOr(listOf(DeezerAlbum))),
  artists: Schema.optional(Schema.NullOr(listOf(DeezerArtist))),
  playlists: Schema.optional(Schema.NullOr(listOf(DeezerPlaylist))),
});
export type DeezerChart = typeof DeezerChart.Type;
