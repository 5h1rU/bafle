import { AlbumNotFound } from "@bafle/domain/Catalog/AlbumNotFound.rejection";
import { ArtistNotFound } from "@bafle/domain/Catalog/ArtistNotFound.rejection";
import { CatalogUnavailable } from "@bafle/domain/Catalog/CatalogUnavailable.rejection";
import { GenreNotFound } from "@bafle/domain/Catalog/GenreNotFound.rejection";
import {
  FeaturedMusic,
  MusicCatalog,
  MusicGenres,
  RadioStations,
  TrendingMusic,
} from "@bafle/domain/Catalog/MusicCatalog.external";
import { PlaylistNotFound } from "@bafle/domain/Catalog/PlaylistNotFound.rejection";
import { StationNotFound } from "@bafle/domain/Catalog/StationNotFound.rejection";
import { TrackNotFound } from "@bafle/domain/Catalog/TrackNotFound.rejection";
import * as Array from "effect/Array";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Schema from "effect/Schema";
import {
  DEEZER_ALL_GENRES,
  DEEZER_NO_DATA,
  DeezerAlbum,
  DeezerAlbumPage,
  DeezerAlbumTrack,
  DeezerArtist,
  DeezerArtistAlbum,
  DeezerChart,
  DeezerGenre,
  DeezerPlaylist,
  DeezerPlaylistPage,
  DeezerRadio,
  DeezerRadioGenre,
  DeezerRefusal,
  DeezerTrack,
  DeezerTrackPage,
  listOf,
  pageOf,
} from "./DeezerSchemas.ts";
import { KeptReplies } from "../Kept/KeptReplies.ts";
import { artworksIn, withPlaceholders } from "../Placeholder/artworks.ts";
import { PicturePlaceholders } from "../Placeholder/PicturePlaceholders.ts";
import {
  likenessSourceOf,
  toAlbum,
  toArtist,
  toFullAlbum,
  toFullArtist,
  toFullGenre,
  toFullPlaylist,
  toFullStation,
  toFullTrack,
  toGenre,
  toPlaylist,
  toStationGroups,
  toTrack,
} from "./translate.ts";

/** Deezer's public API. It needs no key for the catalog. */
export const DEEZER_API = "https://api.deezer.com";

/** How many items a shelf on Home or New holds, and a shelf of what is popular in a genre. */
export const SHELF_SIZE = 20;

/** How many items of a list that is read whole are asked for at a time: the most Deezer hands over. */
export const PAGE_SIZE = 100;

/** How many of an artist's albums their page shelves: Deezer lists singles among them, by the hundred. */
export const ARTIST_ALBUMS = 50;

/**
 * How long a list that is the same for every listener is handed over as it
 * was last told, without asking Deezer: what it recommends for Home, its
 * genres and its stations. Its editors and its charts change a few times a
 * day at most, and every visit asks for them.
 */
export const LISTS_FRESH_FOR = Duration.minutes(30);

/**
 * How long such a list is still shown once it is no longer fresh, while
 * Deezer is asked behind it. These lists carry no audio, so an old one is
 * only old: it is what a listener is shown when Deezer cannot be asked.
 */
export const LISTS_KEPT_FOR = Duration.days(1);

/**
 * How long the address of a song's audio works for, once Deezer has handed
 * it over: it signs each to expire a quarter of an hour later.
 */
export const AUDIO_ADDRESS_LASTS = Duration.minutes(15);

/**
 * How long what is played most is handed over without asking Deezer. Its
 * songs carry their audio, so this list is kept far less long than the
 * others, and never as long as an address lasts.
 */
export const TRENDING_FRESH_FOR = Duration.minutes(5);

/**
 * How long what is played most is still shown while Deezer is asked behind
 * it. An address handed over this late has five minutes left: a song whose
 * address has run out is asked for again by the player, as one played from
 * a page left open is.
 */
export const TRENDING_KEPT_FOR = Duration.minutes(10);

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
    const placeholders = yield* PicturePlaceholders;
    const replies = yield* KeptReplies;

    /**
     * A reply with the likeness of each of its pictures that is known
     * (`placeholder` on `Artwork`), so that the app draws it where the picture
     * goes until the picture comes. A reply never fails for want of one.
     */
    const pictured = <Reply>(reply: Reply) =>
      placeholders
        .likenesses(
          artworksIn(reply).flatMap((artwork) => {
            const source = likenessSourceOf(artwork);
            return source === null ? [] : [{ key: artwork.small, source }];
          }),
        )
        .pipe(Effect.map((likenesses) => withPlaceholders(reply, likenesses)));

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
      const from = (
        got: Items,
      ): Effect.Effect<Items, CatalogUnavailable, Item["DecodingServices"]> =>
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

    /**
     * Whether an id can be one of Deezer's: a number, and not zero. Deezer
     * keeps zero for all genres at once, which is no genre, and has no
     * station under it.
     */
    const isOneOfDeezers = (id: string): boolean => /^\d+$/.test(id) && Number(id) !== 0;

    /**
     * The lists that are the same for every listener, each kept once Deezer
     * has answered (`KeptReplies`): a visit is answered from what is kept, and
     * Deezer is asked behind it when that is no longer fresh. A failure is
     * not kept: the next visit asks again.
     *
     * NOTE: they are kept in Workers KV and not in the Cache API, which does
     * nothing on a workers.dev address, where the Api is served.
     */
    const featured = yield* replies.keep(
      {
        name: "featured",
        reply: FeaturedMusic,
        freshFor: LISTS_FRESH_FOR,
        keptFor: LISTS_KEPT_FOR,
      },
      Effect.all(
        {
          albums: list("/editorial/0/selection", DeezerAlbum).pipe(Effect.map(Array.map(toAlbum))),
          playlists: list("/chart/0/playlists", DeezerPlaylist, { limit: SHELF_SIZE }).pipe(
            Effect.map(Array.map(toPlaylist)),
          ),
          artists: list("/chart/0/artists", DeezerArtist, { limit: SHELF_SIZE }).pipe(
            Effect.map(Array.map(toArtist)),
          ),
        },
        together,
      ),
    );

    const trending = yield* replies.keep(
      {
        name: "trending",
        reply: TrendingMusic,
        freshFor: TRENDING_FRESH_FOR,
        keptFor: TRENDING_KEPT_FOR,
      },
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
    );

    const genres = yield* replies.keep(
      { name: "genres", reply: MusicGenres, freshFor: LISTS_FRESH_FOR, keptFor: LISTS_KEPT_FOR },
      list("/genre", DeezerGenre).pipe(
        Effect.map((all) => ({
          genres: all.filter((genre) => genre.id !== DEEZER_ALL_GENRES).map(toGenre),
        })),
      ),
    );

    const stations = yield* replies.keep(
      {
        name: "stations",
        reply: RadioStations,
        freshFor: LISTS_FRESH_FOR,
        keptFor: LISTS_KEPT_FOR,
      },
      list("/radio/genres", DeezerRadioGenre).pipe(
        Effect.map((groups) => ({ groups: toStationGroups(groups) })),
      ),
    );

    const catalog = {
      featured: () => featured,
      trending: () => trending,
      search: ({ term, limit }: { readonly term: string; readonly limit: number }) =>
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
        const tracks = isWhole
          ? first
          : yield* whole(`/playlist/${playlistId}/tracks`, DeezerTrack);
        return toFullPlaylist(answer, tracks);
      }),
      genres: () => genres,
      genre: Effect.fn(function* ({ genreId, topTracks }) {
        // As with a track: an id that is no number was never one of Deezer's.
        if (!isOneOfDeezers(genreId)) return yield* new GenreNotFound({ genreId });
        const answer = yield* read(`/genre/${genreId}`, Schema.Union([DeezerRefusal, DeezerGenre]));
        if ("error" in answer) {
          if (answer.error.code === DEEZER_NO_DATA) return yield* new GenreNotFound({ genreId });
          yield* Effect.logWarning(`Deezer refused /genre/${genreId}`, answer.error);
          return yield* new CatalogUnavailable();
        }
        // The genre is one of Deezer's: only now is its chart asked for.
        // Deezer answers a chart for any id at all, so the chart alone would
        // never tell a genre it does not have. One answer carries every
        // kind, so it is asked for the most that any of them needs.
        const chart = yield* read(`/chart/${genreId}`, DeezerChart, {
          limit: Math.max(topTracks, SHELF_SIZE),
        });
        return toFullGenre(answer, chart, topTracks, SHELF_SIZE);
      }),
      stations: () => stations,
      station: Effect.fn(function* ({ stationId, tracks }) {
        // As with a track: an id that is no number was never one of Deezer's.
        if (!isOneOfDeezers(stationId)) return yield* new StationNotFound({ stationId });
        const answer = yield* read(
          `/radio/${stationId}`,
          Schema.Union([DeezerRefusal, DeezerRadio]),
        );
        if ("error" in answer) {
          if (answer.error.code === DEEZER_NO_DATA) {
            return yield* new StationNotFound({ stationId });
          }
          yield* Effect.logWarning(`Deezer refused /radio/${stationId}`, answer.error);
          return yield* new CatalogUnavailable();
        }
        // A station has no end, so its list has no count and no pages: as
        // many songs as were asked for are dealt, and that is the list.
        const playing = yield* list(`/radio/${stationId}/tracks`, DeezerTrack, { limit: tracks });
        return toFullStation(answer, playing);
      }),
    };

    // NOTE: the likenesses are added to each reply as it leaves, and not to
    // what is kept: a list is kept for a while, and the likenesses worked
    // out meanwhile reach it on the next visit.
    return {
      featured: () => catalog.featured().pipe(Effect.flatMap(pictured)),
      trending: () => catalog.trending().pipe(Effect.flatMap(pictured)),
      search: (args) => catalog.search(args).pipe(Effect.flatMap(pictured)),
      track: (args) => catalog.track(args).pipe(Effect.flatMap(pictured)),
      album: (args) => catalog.album(args).pipe(Effect.flatMap(pictured)),
      artist: (args) => catalog.artist(args).pipe(Effect.flatMap(pictured)),
      playlist: (args) => catalog.playlist(args).pipe(Effect.flatMap(pictured)),
      genres: () => catalog.genres().pipe(Effect.flatMap(pictured)),
      genre: (args) => catalog.genre(args).pipe(Effect.flatMap(pictured)),
      stations: () => catalog.stations().pipe(Effect.flatMap(pictured)),
      station: (args) => catalog.station(args).pipe(Effect.flatMap(pictured)),
    };
  }),
);
