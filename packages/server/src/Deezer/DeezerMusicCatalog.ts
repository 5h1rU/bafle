import { AlbumNotFound } from "@bafle/domain/Catalog/AlbumNotFound.rejection";
import { ArtistNotFound } from "@bafle/domain/Catalog/ArtistNotFound.rejection";
import { CatalogUnavailable } from "@bafle/domain/Catalog/CatalogUnavailable.rejection";
import { MusicCatalog } from "@bafle/domain/Catalog/MusicCatalog.external";
import { PlaylistNotFound } from "@bafle/domain/Catalog/PlaylistNotFound.rejection";
import { TrackNotFound } from "@bafle/domain/Catalog/TrackNotFound.rejection";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Schema from "effect/Schema";
import {
  DEEZER_NO_DATA,
  DeezerAlbum,
  DeezerAlbumPage,
  DeezerAlbumTrack,
  DeezerArtist,
  DeezerArtistAlbum,
  DeezerPlaylist,
  DeezerPlaylistPage,
  DeezerRefusal,
  DeezerTrack,
  DeezerTrackPage,
  listOf,
  pageOf,
} from "./DeezerSchemas.ts";
import {
  toAlbum,
  toArtist,
  toFullAlbum,
  toFullArtist,
  toFullPlaylist,
  toFullTrack,
  toPlaylist,
  toTrack,
} from "./translate.ts";

/** Deezer's public API. It needs no key for the catalog. */
export const DEEZER_API = "https://api.deezer.com";

/** How many items a shelf on Home or New holds. */
export const SHELF_SIZE = 20;

/** How many items of a list that is read whole are asked for at a time: the most Deezer hands over. */
export const PAGE_SIZE = 100;

/** How many of an artist's albums their page shelves: Deezer lists singles among them, by the hundred. */
export const ARTIST_ALBUMS = 50;

/**
 * The music catalog, read from Deezer. The only code that knows Deezer: its
 * paths, its field names, and that it has no feed of new releases, so
 * `trending` reads its charts.
 *
 * Whatever goes wrong (the network, a status, a quota, an answer in a shape
 * Bafle does not expect) is logged here and reaches the model as
 * `CatalogUnavailable`.
 */
export const DeezerMusicCatalog = MusicCatalog.toLayer(
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    /** One of Deezer's answers, decoded. Anything that goes wrong is the catalog being unavailable. */
    const read = <Answer extends Schema.Top>(
      path: string,
      answer: Answer,
      urlParams: Record<string, string | number> = {},
    ) =>
      client.get(`${DEEZER_API}${path}`, { urlParams, acceptJson: true }).pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap(HttpClientResponse.schemaBodyJson(answer)),
        Effect.timeout("8 seconds"),
        Effect.tapError((error) => Effect.logWarning(`Deezer could not answer ${path}`, error)),
        Effect.mapError(() => new CatalogUnavailable()),
      );

    /** One of Deezer's lists. */
    const list = <Item extends Schema.Top>(
      path: string,
      item: Item,
      urlParams: Record<string, string | number> = {},
    ) => read(path, listOf(item), urlParams).pipe(Effect.map((answer) => answer.data));

    /**
     * All of one of Deezer's lists, however many pages it comes in. Each page
     * is asked for from where the one before ended, for as long as Deezer says
     * another follows, and the list is whole only if it then holds as many
     * items as Deezer said there are. Anything less is the catalog being
     * unavailable: a list that held some of them would pass for all of them.
     */
    const whole = <Item extends Schema.Top>(path: string, item: Item) => {
      type Items = ReadonlyArray<Item["Type"]>;
      const from = (got: Items): Effect.Effect<Items, CatalogUnavailable, Item["DecodingServices"]> =>
        read(path, pageOf(item), { index: got.length, limit: PAGE_SIZE }).pipe(
          Effect.flatMap((page) => {
            const items: Items = [...got, ...page.data];
            // A page with nothing on it would be asked for again for ever.
            if (page.next != null && page.data.length > 0) return from(items);
            if (items.length >= (page.total ?? 0)) return Effect.succeed(items);
            return Effect.logWarning(
              `Deezer listed ${items.length} of ${page.total} at ${path}`,
            ).pipe(Effect.andThen(Effect.fail(new CatalogUnavailable())));
          }),
        );
      return from([]);
    };

    const together = { concurrency: "unbounded" } as const;

    return {
      featured: () =>
        Effect.all(
          {
            albums: list("/editorial/0/selection", DeezerAlbum).pipe(
              Effect.map(Array.map(toAlbum)),
            ),
            playlists: list("/chart/0/playlists", DeezerPlaylist, { limit: SHELF_SIZE }).pipe(
              Effect.map(Array.map(toPlaylist)),
            ),
            artists: list("/chart/0/artists", DeezerArtist, { limit: SHELF_SIZE }).pipe(
              Effect.map(Array.map(toArtist)),
            ),
          },
          together,
        ),
      trending: () =>
        Effect.all(
          {
            tracks: list("/chart/0/tracks", DeezerTrack, { limit: SHELF_SIZE }).pipe(
              Effect.map(Array.map(toTrack)),
            ),
            albums: list("/chart/0/albums", DeezerAlbum, { limit: SHELF_SIZE }).pipe(
              Effect.map(Array.map(toAlbum)),
            ),
          },
          together,
        ),
      search: ({ term, limit }) =>
        Effect.all(
          {
            tracks: list("/search/track", DeezerTrack, { q: term, limit }).pipe(
              Effect.map(Array.map(toTrack)),
            ),
            albums: list("/search/album", DeezerAlbum, { q: term, limit }).pipe(
              Effect.map(Array.map(toAlbum)),
            ),
            artists: list("/search/artist", DeezerArtist, { q: term, limit }).pipe(
              Effect.map(Array.map(toArtist)),
            ),
            playlists: list("/search/playlist", DeezerPlaylist, { q: term, limit }).pipe(
              Effect.map(Array.map(toPlaylist)),
            ),
          },
          together,
        ),
      track: Effect.fn(function* ({ trackId }) {
        // Deezer's ids are numbers. Anything else was never one of its tracks,
        // so there is nothing to ask.
        if (!/^\d+$/.test(trackId)) return yield* new TrackNotFound({ trackId });
        // A refusal is tried first: a track's fields can never match it.
        const answer = yield* read(
          `/track/${trackId}`,
          Schema.Union([DeezerRefusal, DeezerTrackPage]),
        );
        if (!("error" in answer)) return toFullTrack(answer);
        if (answer.error.code === DEEZER_NO_DATA) return yield* new TrackNotFound({ trackId });
        yield* Effect.logWarning(`Deezer refused /track/${trackId}`, answer.error);
        return yield* new CatalogUnavailable();
      }),
      album: Effect.fn(function* ({ albumId }) {
        // As with a track: an id that is no number was never one of Deezer's.
        if (!/^\d+$/.test(albumId)) return yield* new AlbumNotFound({ albumId });
        const answer = yield* read(
          `/album/${albumId}`,
          Schema.Union([DeezerRefusal, DeezerAlbumPage]),
        );
        if ("error" in answer) {
          if (answer.error.code === DEEZER_NO_DATA) return yield* new AlbumNotFound({ albumId });
          yield* Effect.logWarning(`Deezer refused /album/${albumId}`, answer.error);
          return yield* new CatalogUnavailable();
        }
        // An album comes with its first tracks only, and says how many it
        // has. Unless that many came with it, all of them are asked for: a
        // page that listed some would pass for whole. So are they when the
        // album does not say how many it has, since nothing then tells
        // whether what came with it is all of it.
        const first = answer.tracks?.data ?? [];
        const isWhole = answer.nb_tracks != null && first.length >= answer.nb_tracks;
        const tracks = isWhole ? first : yield* whole(`/album/${albumId}/tracks`, DeezerAlbumTrack);
        return toFullAlbum(answer, tracks);
      }),
      artist: Effect.fn(function* ({ artistId, topTracks }) {
        // As with a track: an id that is no number was never one of Deezer's.
        if (!/^\d+$/.test(artistId)) return yield* new ArtistNotFound({ artistId });
        const answer = yield* read(
          `/artist/${artistId}`,
          Schema.Union([DeezerRefusal, DeezerArtist]),
        );
        if ("error" in answer) {
          if (answer.error.code === DEEZER_NO_DATA) return yield* new ArtistNotFound({ artistId });
          yield* Effect.logWarning(`Deezer refused /artist/${artistId}`, answer.error);
          return yield* new CatalogUnavailable();
        }
        // The artist is one of Deezer's: only now is what is theirs asked for,
        // so that a missing artist is never mistaken for lists that failed.
        const theirs = yield* Effect.all(
          {
            topTracks: list(`/artist/${artistId}/top`, DeezerTrack, { limit: topTracks }),
            albums: list(`/artist/${artistId}/albums`, DeezerArtistAlbum, {
              limit: ARTIST_ALBUMS,
            }),
          },
          together,
        );
        return toFullArtist(answer, theirs.topTracks, theirs.albums);
      }),
      playlist: Effect.fn(function* ({ playlistId }) {
        // As with a track: an id that is no number was never one of Deezer's.
        if (!/^\d+$/.test(playlistId)) return yield* new PlaylistNotFound({ playlistId });
        const answer = yield* read(
          `/playlist/${playlistId}`,
          Schema.Union([DeezerRefusal, DeezerPlaylistPage]),
        );
        if ("error" in answer) {
          if (answer.error.code === DEEZER_NO_DATA) {
            return yield* new PlaylistNotFound({ playlistId });
          }
          yield* Effect.logWarning(`Deezer refused /playlist/${playlistId}`, answer.error);
          return yield* new CatalogUnavailable();
        }
        // As with an album: unless as many tracks came with the playlist as
        // it says it has, all of them are asked for.
        const first = answer.tracks?.data ?? [];
        const isWhole = answer.nb_tracks != null && first.length >= answer.nb_tracks;
        const tracks = isWhole ? first : yield* whole(`/playlist/${playlistId}/tracks`, DeezerTrack);
        return toFullPlaylist(answer, tracks);
      }),
    };
  }),
);
