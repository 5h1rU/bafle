import { CatalogUnavailable } from "@bafle/domain/Catalog/CatalogUnavailable.rejection";
import { MusicCatalog } from "@bafle/domain/Catalog/MusicCatalog.external";
import { TrackNotFound } from "@bafle/domain/Catalog/TrackNotFound.rejection";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Schema from "effect/Schema";
import {
  DEEZER_NO_DATA,
  DeezerAlbum,
  DeezerArtist,
  DeezerPlaylist,
  DeezerRefusal,
  DeezerTrack,
  DeezerTrackPage,
  listOf,
} from "./DeezerSchemas.ts";
import { toAlbum, toArtist, toFullTrack, toPlaylist, toTrack } from "./translate.ts";

/** Deezer's public API. It needs no key for the catalog. */
export const DEEZER_API = "https://api.deezer.com";

/** How many items a shelf on Home or New holds. */
export const SHELF_SIZE = 20;

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
    };
  }),
);
