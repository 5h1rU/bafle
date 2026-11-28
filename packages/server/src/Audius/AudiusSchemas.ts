import * as Schema from "effect/Schema";

/**
 * Audius's answers, as far as Bafle reads them. Everything else Audius sends
 * is dropped here, so it can never leak into the model.
 *
 * Every thing Audius has carries two ids: a short hash (`id`) and the number
 * it hashes (`track_id`, `playlist_id`, `user_id`). Its paths take either,
 * and an album a track is on is named by its number alone, so Bafle reads
 * the numbers everywhere.
 */

/** One picture at the three sizes Audius draws it. Audius leaves a size out, or the whole picture, when it has none. */
export const AudiusPicture = Schema.optional(
  Schema.NullOr(
    Schema.Struct({
      "150x150": Schema.optional(Schema.NullOr(Schema.String)),
      "480x480": Schema.optional(Schema.NullOr(Schema.String)),
      "1000x1000": Schema.optional(Schema.NullOr(Schema.String)),
    }),
  ),
);
export type AudiusPicture = typeof AudiusPicture.Type;

export const AudiusUser = Schema.Struct({
  user_id: Schema.Number,
  name: Schema.String,
  profile_picture: AudiusPicture,
});
export type AudiusUser = typeof AudiusUser.Type;

export const AudiusTrack = Schema.Struct({
  track_id: Schema.Number,
  title: Schema.String,
  duration: Schema.Number,
  artwork: AudiusPicture,
  user: AudiusUser,
  release_date: Schema.optional(Schema.NullOr(Schema.String)),
  /** The album the track is on, when it is on one. */
  album_backlink: Schema.optional(
    Schema.NullOr(Schema.Struct({ playlist_id: Schema.Number, playlist_name: Schema.String })),
  ),
  /** Whether anyone may stream it. Audius leaves it out of older answers. */
  is_streamable: Schema.optional(Schema.NullOr(Schema.Boolean)),
  /** What the listener asking may do with it: a track sold or kept for followers is not streamed to everyone. */
  access: Schema.optional(Schema.NullOr(Schema.Struct({ stream: Schema.Boolean }))),
  /** An excerpt of a track that is not streamed to everyone, when its artist made one. */
  preview_cid: Schema.optional(Schema.NullOr(Schema.String)),
  /** `explicit`, or something milder, or nothing, as the artist said on upload. */
  parental_warning_type: Schema.optional(Schema.NullOr(Schema.String)),
});
export type AudiusTrack = typeof AudiusTrack.Type;

/** A playlist or an album, which to Audius are one thing told apart by `is_album`. */
export const AudiusPlaylist = Schema.Struct({
  playlist_id: Schema.Number,
  playlist_name: Schema.String,
  is_album: Schema.Boolean,
  artwork: AudiusPicture,
  user: AudiusUser,
  track_count: Schema.optional(Schema.NullOr(Schema.Number)),
  release_date: Schema.optional(Schema.NullOr(Schema.String)),
  parental_warning_type: Schema.optional(Schema.NullOr(Schema.String)),
});
export type AudiusPlaylist = typeof AudiusPlaylist.Type;

/** One of Audius's genres, with how many tracks are filed under it. */
export const AudiusGenreCount = Schema.Struct({ name: Schema.String });
export type AudiusGenreCount = typeof AudiusGenreCount.Type;

/** What Audius found for a search, a list of each kind. */
export const AudiusSearch = Schema.Struct({
  tracks: Schema.optional(Schema.NullOr(Schema.Array(AudiusTrack))),
  albums: Schema.optional(Schema.NullOr(Schema.Array(AudiusPlaylist))),
  users: Schema.optional(Schema.NullOr(Schema.Array(AudiusUser))),
  playlists: Schema.optional(Schema.NullOr(Schema.Array(AudiusPlaylist))),
});
export type AudiusSearch = typeof AudiusSearch.Type;

/** Every answer of Audius's wraps what was asked for in `data`. */
export const dataOf = <Data extends Schema.Top>(data: Data) => Schema.Struct({ data });

/** A list of Audius's. */
export const listOf = <Item extends Schema.Top>(item: Item) => dataOf(Schema.Array(item));
