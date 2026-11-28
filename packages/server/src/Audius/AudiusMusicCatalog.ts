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
import * as Config from "effect/Config";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Random from "effect/Random";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { KeptReplies } from "../Kept/KeptReplies.ts";
import {
  AudiusGenreCount,
  AudiusPlaylist,
  AudiusSearch,
  AudiusTrack,
  AudiusUser,
  dataOf,
  listOf,
} from "./AudiusSchemas.ts";
import {
  AUDIUS_API,
  type AudiusGenre,
  genreOf,
  genresByCount,
  stationOf,
  toAlbum,
  toArtist,
  toFullAlbum,
  toFullArtist,
  toFullPlaylist,
  toFullSingle,
  toFullStation,
  toFullTrack,
  toGenre,
  toPlaylist,
  toStationGroup,
  toTrack,
  trackOfSingle,
} from "./translate.ts";

/** How many items a shelf on Home or New holds, and a shelf of what is popular in a genre. */
export const SHELF_SIZE = 20;

/** How many of an artist's albums and singles their page shelves. */
export const ARTIST_ALBUMS = 50;

/**
 * How many of Audius's genres Genres shows, and Radio has stations for: those
 * with the most music filed under them. Each is one question to Audius for
 * its picture, and a Worker on the free plan may ask 50 things while it
 * answers one request.
 */
export const GENRES_SHOWN = 24;

/** How many of what is played most in a genre a station deals its songs from. */
export const STATION_DEALS_FROM = 100;

/** How many of a genre's tracks are asked for its picture and its stations': one for each station. */
const COVERS = 3;

/**
 * How long a list that is the same for every listener is handed over as it
 * was last told, without asking Audius: what it recommends for Home, its
 * genres and its stations. What Audius counts as played most changes over
 * hours, and every visit asks for them.
 */
export const LISTS_FRESH_FOR = Duration.minutes(30);

/**
 * How long such a list is still shown once it is no longer fresh, while
 * Audius is asked behind it. Its songs' audio is played from addresses that
 * never run out (`audioOf` in `translate.ts`), so an old list is only old:
 * it is what a listener is shown when Audius cannot be asked.
 */
export const LISTS_KEPT_FOR = Duration.days(1);

/** How long what is played most is handed over without asking Audius. */
export const TRENDING_FRESH_FOR = Duration.minutes(10);

/**
 * The bearer token of Bafle's app on Audius (audius.co/settings, Create App),
 * which every question to its API carries. Read without one, Audius refuses
 * a burst of questions; with one, it answers ten a second.
 *
 * It is read from the environment: from `.env` at the root of the repository
 * when the stack is deployed or run with `alchemy dev`, and Alchemy binds it
 * to the Worker as a secret.
 */
export const AUDIUS_BEARER_TOKEN = Config.Redacted("AUDIUS_BEARER_TOKEN");

/**
 * The music catalog, read from Audius. The only code that knows Audius: its
 * paths, its field names, that an album is one of its playlists, and that it
 * has no stations, so Bafle's are what is played most in a genre, dealt
 * afresh (`stationOf` in `translate.ts`).
 *
 * Whatever goes wrong (the network, a status, a quota, an answer in a shape
 * Bafle does not expect) is logged here and reaches the model as
 * `CatalogUnavailable`.
 */
export const AudiusMusicCatalog = MusicCatalog.toLayer(
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const replies = yield* KeptReplies;
    const token = yield* AUDIUS_BEARER_TOKEN;

    type Params = Record<string, string | number | boolean>;

    /** Audius's response to a question, asked as Bafle's app. */
    const ask = (path: string, urlParams: Params) =>
      client.get(`${AUDIUS_API}${path}`, {
        urlParams,
        acceptJson: true,
        headers: { authorization: `Bearer ${Redacted.value(token)}` },
      });

    /**
     * One of Audius's answers, decoded, or null when Audius does not have
     * what was asked for (a 404). Anything else that goes wrong is the
     * catalog being unavailable.
     */
    const find = <Answer extends Schema.Top>(
      path: string,
      answer: Answer,
      urlParams: Params = {},
    ) =>
      ask(path, urlParams).pipe(
        Effect.flatMap((response) =>
          response.status === 404
            ? Effect.succeed(null)
            : HttpClientResponse.filterStatusOk(response).pipe(
                Effect.flatMap(HttpClientResponse.schemaBodyJson(answer)),
              ),
        ),
        Effect.timeout("8 seconds"),
        Effect.tapError((error) => Effect.logWarning(`Audius could not answer ${path}`, error)),
        Effect.mapError(() => new CatalogUnavailable()),
      );

    /** One of Audius's answers, which it always has. Not having it is the catalog being unavailable. */
    const read = <Answer extends Schema.Top>(
      path: string,
      answer: Answer,
      urlParams: Params = {},
    ) =>
      find(path, answer, urlParams).pipe(
        Effect.flatMap((found) =>
          found === null
            ? Effect.logWarning(`Audius has nothing at ${path}`).pipe(
                Effect.andThen(Effect.fail(new CatalogUnavailable())),
              )
            : Effect.succeed(found),
        ),
      );

    /** One of Audius's lists. */
    const list = <Item extends Schema.Top>(path: string, item: Item, urlParams: Params = {}) =>
      read(path, listOf(item), urlParams).pipe(Effect.map((answer) => answer.data));

    /** What is played most in `genre` over `time`, most played first. */
    const playedMost = (genre: AudiusGenre, limit: number, time = "week") =>
      list("/tracks/trending", AudiusTrack, { genre: genre.name, time, limit });

    const together = { concurrency: "unbounded" } as const;

    /**
     * Two at a time, for a list that asks a question for each of its genres,
     * so that it stays under the ten a second Audius answers Bafle's app.
     */
    const fewAtATime = { concurrency: 2 } as const;

    /**
     * Whether an id can be one of Audius's: a number, and not zero. Audius
     * answers any other with a refusal and not with a 404.
     */
    const isOneOfAudiuss = (id: string): boolean => /^\d+$/.test(id) && Number(id) !== 0;

    /** The genres there is the most music in, most first. */
    const mostFiled = list("/genres/popular", AudiusGenreCount, { limit: 100 }).pipe(
      Effect.map((counted) => genresByCount(counted, GENRES_SHOWN)),
    );

    /**
     * The lists that are the same for every listener, each kept once Audius
     * has answered (`KeptReplies`), under names of their own so that what was
     * kept from another catalog is never handed over as Audius's.
     */
    const featured = yield* replies.keep(
      {
        name: "audius:featured",
        reply: FeaturedMusic,
        freshFor: LISTS_FRESH_FOR,
        keptFor: LISTS_KEPT_FOR,
      },
      Effect.all(
        {
          albums: list("/playlists/trending", AudiusPlaylist, {
            type: "album",
            time: "month",
            omit_tracks: true,
            limit: SHELF_SIZE,
          }).pipe(Effect.map(Array.map(toAlbum))),
          playlists: list("/playlists/trending", AudiusPlaylist, {
            type: "playlist",
            time: "week",
            omit_tracks: true,
            limit: SHELF_SIZE,
          }).pipe(Effect.map(Array.map(toPlaylist))),
          artists: list("/users/top", AudiusUser, { limit: SHELF_SIZE }).pipe(
            Effect.map(Array.map(toArtist)),
          ),
        },
        together,
      ),
    );

    const trending = yield* replies.keep(
      {
        name: "audius:trending",
        reply: TrendingMusic,
        freshFor: TRENDING_FRESH_FOR,
        keptFor: LISTS_KEPT_FOR,
      },
      Effect.all(
        {
          tracks: list("/tracks/trending", AudiusTrack, { time: "week", limit: SHELF_SIZE }).pipe(
            Effect.map(Array.map(toTrack)),
          ),
          albums: list("/playlists/trending", AudiusPlaylist, {
            type: "album",
            time: "week",
            omit_tracks: true,
            limit: SHELF_SIZE,
          }).pipe(Effect.map(Array.map(toAlbum))),
        },
        together,
      ),
    );

    const genres = yield* replies.keep(
      {
        name: "audius:genres",
        reply: MusicGenres,
        freshFor: LISTS_FRESH_FOR,
        keptFor: LISTS_KEPT_FOR,
      },
      mostFiled.pipe(
        Effect.flatMap((shown) =>
          Effect.forEach(
            shown,
            (genre) => playedMost(genre, 1).pipe(Effect.map((top) => toGenre(genre, top))),
            fewAtATime,
          ),
        ),
        Effect.map((all) => ({ genres: all })),
      ),
    );

    const stations = yield* replies.keep(
      {
        name: "audius:stations",
        reply: RadioStations,
        freshFor: LISTS_FRESH_FOR,
        keptFor: LISTS_KEPT_FOR,
      },
      mostFiled.pipe(
        Effect.flatMap((shown) =>
          Effect.forEach(
            shown,
            (genre) =>
              playedMost(genre, COVERS).pipe(Effect.map((week) => toStationGroup(genre, week))),
            fewAtATime,
          ),
        ),
        Effect.map((groups) => ({ groups: groups.filter((group) => group !== null) })),
      ),
    );

    /** The tracks of one of Audius's playlists or albums, all of them: Audius lists them in one answer. */
    const tracksOf = (playlistId: string) => list(`/playlists/${playlistId}/tracks`, AudiusTrack);

    /** One of Audius's playlists or albums, or null when it has no such thing. */
    const playlistAt = (playlistId: string) =>
      find(`/playlists/${playlistId}`, listOf(AudiusPlaylist)).pipe(
        Effect.map((found) => found?.data[0] ?? null),
      );

    return {
      featured: () => featured,
      trending: () => trending,
      search: ({ term, limit }) =>
        read("/search/full", dataOf(AudiusSearch), { query: term, kind: "all", limit }).pipe(
          Effect.map(({ data }) => ({
            tracks: (data.tracks ?? []).map(toTrack),
            albums: (data.albums ?? []).map(toAlbum),
            artists: (data.users ?? []).map(toArtist),
            playlists: (data.playlists ?? []).map(toPlaylist),
          })),
        ),
      track: Effect.fn(function* ({ trackId }) {
        // Audius's ids are numbers. Anything else was never one of its tracks,
        // so there is nothing to ask.
        if (!isOneOfAudiuss(trackId)) return yield* new TrackNotFound({ trackId });
        const found = yield* find(`/tracks/${trackId}`, dataOf(AudiusTrack));
        if (found === null) return yield* new TrackNotFound({ trackId });
        return toFullTrack(found.data);
      }),
      album: Effect.fn(function* ({ albumId }) {
        // A track on no album is the album of that track alone.
        const single = trackOfSingle(albumId);
        if (single !== null) {
          if (!isOneOfAudiuss(single)) return yield* new AlbumNotFound({ albumId });
          const found = yield* find(`/tracks/${single}`, dataOf(AudiusTrack));
          if (found === null) return yield* new AlbumNotFound({ albumId });
          return toFullSingle(found.data);
        }
        // As with a track: an id that is no number was never one of Audius's.
        if (!isOneOfAudiuss(albumId)) return yield* new AlbumNotFound({ albumId });
        // To Audius an album is a playlist it calls one: a playlist that is
        // no album is not an album Bafle has.
        const album = yield* playlistAt(albumId);
        if (album === null || !album.is_album) return yield* new AlbumNotFound({ albumId });
        return toFullAlbum(album, yield* tracksOf(albumId));
      }),
      artist: Effect.fn(function* ({ artistId, topTracks }) {
        // As with a track: an id that is no number was never one of Audius's.
        if (!isOneOfAudiuss(artistId)) return yield* new ArtistNotFound({ artistId });
        const found = yield* find(`/users/${artistId}`, dataOf(AudiusUser));
        if (found === null) return yield* new ArtistNotFound({ artistId });
        // The artist is one of Audius's: only now is what is theirs asked for,
        // since Audius answers a user it does not have with empty lists.
        const theirs = yield* Effect.all(
          {
            topTracks: list(`/users/${artistId}/tracks`, AudiusTrack, {
              sort: "plays",
              filter_tracks: "public",
              limit: topTracks,
            }),
            albums: list(`/users/${artistId}/albums`, AudiusPlaylist, { limit: ARTIST_ALBUMS }),
            latest: list(`/users/${artistId}/tracks`, AudiusTrack, {
              sort: "date",
              filter_tracks: "public",
              limit: ARTIST_ALBUMS,
            }),
          },
          together,
        );
        return toFullArtist(
          found.data,
          theirs.topTracks,
          theirs.albums,
          theirs.latest,
          ARTIST_ALBUMS,
        );
      }),
      playlist: Effect.fn(function* ({ playlistId }) {
        // As with a track: an id that is no number was never one of Audius's.
        if (!isOneOfAudiuss(playlistId)) return yield* new PlaylistNotFound({ playlistId });
        const playlist = yield* playlistAt(playlistId);
        if (playlist === null) return yield* new PlaylistNotFound({ playlistId });
        return toFullPlaylist(playlist, yield* tracksOf(playlistId));
      }),
      genres: () => genres,
      genre: Effect.fn(function* ({ genreId, topTracks }) {
        const genre = genreOf(genreId);
        if (genre === undefined) return yield* new GenreNotFound({ genreId });
        const popular = { genre: genre.name, sort_method: "popular", limit: SHELF_SIZE } as const;
        const inIt = yield* Effect.all(
          {
            topTracks: playedMost(genre, topTracks),
            albums: read("/search/full", dataOf(AudiusSearch), { ...popular, kind: "albums" }),
            artists: list("/users/genre/top", AudiusUser, { genre: genre.name, limit: SHELF_SIZE }),
            playlists: list("/playlists/search", AudiusPlaylist, popular),
          },
          together,
        );
        return {
          ...toGenre(genre, inIt.topTracks),
          topTracks: inIt.topTracks.map(toTrack),
          albums: (inIt.albums.data.albums ?? []).map(toAlbum),
          artists: inIt.artists.map(toArtist),
          playlists: inIt.playlists.filter((playlist) => !playlist.is_album).map(toPlaylist),
        };
      }),
      stations: () => stations,
      station: Effect.fn(function* ({ stationId, tracks }) {
        const station = stationOf(stationId);
        if (station === undefined) return yield* new StationNotFound({ stationId });
        const { window, genre } = station;
        // The station is dealt from what is played most over its window, and
        // drawn with the cover its tile has, which is taken from this week's.
        const asked = yield* Effect.all(
          {
            dealsFrom: playedMost(genre, STATION_DEALS_FROM, window.time),
            week: window.id === "week" ? Effect.succeed(null) : playedMost(genre, COVERS, "week"),
          },
          together,
        );
        const dealt = Array.take(yield* Random.shuffle(asked.dealsFrom), tracks);
        return toFullStation(window, genre, asked.week ?? asked.dealsFrom, dealt);
      }),
    };
  }),
);
