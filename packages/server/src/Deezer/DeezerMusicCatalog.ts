import { CatalogUnavailable } from "@bafle/domain/Catalog/CatalogUnavailable.rejection";
import { MusicCatalog } from "@bafle/domain/Catalog/MusicCatalog.external";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import type * as Schema from "effect/Schema";
import {
  DeezerAlbum,
  DeezerArtist,
  DeezerPlaylist,
  DeezerTrack,
  listOf,
} from "./DeezerSchemas.ts";
import { toAlbum, toArtist, toPlaylist, toTrack } from "./translate.ts";

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

    /** One of Deezer's lists, decoded. */
    const list = <Item extends Schema.Top>(
      path: string,
      item: Item,
      urlParams: Record<string, string | number> = {},
    ) =>
      client.get(`${DEEZER_API}${path}`, { urlParams, acceptJson: true }).pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap(HttpClientResponse.schemaBodyJson(listOf(item))),
        Effect.map((answer) => answer.data),
        Effect.timeout("8 seconds"),
        Effect.tapError((error) => Effect.logWarning(`Deezer could not answer ${path}`, error)),
        Effect.mapError(() => new CatalogUnavailable()),
      );

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
    };
  }),
);
