import { AlbumId } from "@bafle/domain/Catalog/Album";
import { ArtistId } from "@bafle/domain/Catalog/Artist";
import { GenreId } from "@bafle/domain/Catalog/Genre";
import { PlaylistId } from "@bafle/domain/Catalog/Playlist";
import { StationId } from "@bafle/domain/Catalog/Station";
import { TrackId } from "@bafle/domain/Catalog/Track";
import * as Array from "effect/Array";
import { pipe } from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { AsyncData } from "foldkit";
import { expect, test } from "vitest";
import { init, update } from "../src/main.ts";
import { Message, type PlayOrigin } from "../src/message.ts";
import {
  addressOf,
  albumData,
  artistData,
  Awaiting,
  canShow,
  genreData,
  isPlayerExpanded,
  isPlayersTrack,
  maybeHeadedFor,
  type Model,
  playlistData,
  type Row,
  stationData,
  trackData,
  wayBack,
} from "../src/model.ts";
import type { EnginePhase } from "../src/player/audioEngine.ts";
import * as Player from "../src/player/index.ts";
import {
  AppRoute,
  isSamePage,
  isSameRoute,
  searchRouter,
  urlToAppRoute,
} from "../src/route.ts";
import {
  album,
  albumPath,
  arrived,
  artist,
  artistPath,
  changedUrl,
  choseFromRow,
  clickedLink,
  explicitTrack,
  fullAlbum,
  fullArtist,
  fullGenre,
  fullPlaylist,
  fullStation,
  fullTrack,
  genre,
  genrePath,
  playlist,
  playlistPath,
  reply,
  station,
  stationPath,
  track,
  trackPath,
  url,
} from "./fixtures.ts";

// The stories pin each rule on a sequence chosen by hand. This walks thousands of sequences nobody
// chose: the listener navigates, opens tracks, goes back, types and retries at random while replies
// and pauses arrive late, early, or after their request was abandoned. After every step the Model
// must still be one the rules allow. The walks are seeded, so a failure names a sequence that
// fails again.
//
// The listener also plays tracks while all of that goes on: taps rows and the track page's control,
// pauses, skips, goes back, retries. Every order the app gives the engine is answered the way an
// engine might, with reports that arrive in any order, late, after the listener has asked for
// something else, or never. Three more things are held after every step: the app never says a
// track is sounding unless the engine said so in answer to the latest order, the current track
// changes only by the listener's choice or by the track before it ending, and playing and
// navigating never reach into each other.
//
// Albums are walked too: opened from a row's menu, where the list is held and the row speaks for
// what became of it, and from a shelf's tile, where the album's page does; played from, opened a
// song from, and gone back from.
//
// So are artists and playlists, which are only ever opened from a shelf's tile: found, failed and
// missing, played from, gone on from to an album or a song, and gone back from.
//
// So are the Genres and Radio sections, and the genres and stations their tiles lead to: found,
// failed and missing, played from, gone on from to a song, an album, an artist or a playlist, and
// gone back from.
//
// The browser's history is walked along with the app: a page chosen by a link pushes an entry when
// it takes the screen, typing rewrites one, Back, Forward and the history menu move through them.
// That is what the app's own picture of the history is held against, what a page's back control
// must never lead out of, and what must never gain an entry for a page that was not shown.

const WALKS = 3000;
// NOTE: a launched app asks for the other sections ahead of the listener, and each of those
// replies is a step of the walk: the walks are that much longer, so that they still get as far.
const STEPS_PER_WALK = 28;

const MISSING_TRACK_ID = TrackId.make("tr-404");

const TRACK_PATHS: Array.NonEmptyReadonlyArray<string> = [
  trackPath(track.id),
  trackPath(explicitTrack.id),
  // A row can outlive its track: the list was loaded before the catalog withdrew it.
  trackPath(MISSING_TRACK_ID),
];
/** The album of the lists' second track: the catalog has withdrawn it, and a row still leads to it. */
const MISSING_ALBUM_ID: AlbumId = explicitTrack.album.id;

const ALBUM_PATHS: Array.NonEmptyReadonlyArray<string> = [
  albumPath(album.id),
  albumPath(album.id),
  albumPath(MISSING_ALBUM_ID),
];
/** An artist and a playlist the catalog has withdrawn: a shelf loaded before that still leads to each. */
const MISSING_ARTIST_ID = ArtistId.make("ar-404");
const MISSING_PLAYLIST_ID = PlaylistId.make("pl-404");

const ARTIST_PATHS: Array.NonEmptyReadonlyArray<string> = [
  artistPath(artist.id),
  artistPath(artist.id),
  artistPath(MISSING_ARTIST_ID),
];
const PLAYLIST_PATHS: Array.NonEmptyReadonlyArray<string> = [
  playlistPath(playlist.id),
  playlistPath(playlist.id),
  playlistPath(MISSING_PLAYLIST_ID),
];
/** A genre and a station the catalog has withdrawn: a section loaded before that still leads to each. */
const MISSING_GENRE_ID = GenreId.make("ge-404");
const MISSING_STATION_ID = StationId.make("st-404");

const GENRE_PATHS: Array.NonEmptyReadonlyArray<string> = [
  genrePath(genre.id),
  genrePath(genre.id),
  genrePath(MISSING_GENRE_ID),
];
const STATION_PATHS: Array.NonEmptyReadonlyArray<string> = [
  stationPath(station.id),
  stationPath(station.id),
  stationPath(MISSING_STATION_ID),
];
/** The two sections the menu gained: each leads to pages of its own kind. */
const NEW_SECTION_LINKS: Array.NonEmptyReadonlyArray<string> = ["/genres", "/radio"];
const PATHS: Array.NonEmptyReadonlyArray<string> = [
  "/",
  "/new",
  "/search",
  "/search?q=a",
  "/search?q=ab",
  "/search?q=a+",
  "/nowhere",
  ...TRACK_PATHS,
  ...ALBUM_PATHS,
  ...ARTIST_PATHS,
  ...PLAYLIST_PATHS,
  ...NEW_SECTION_LINKS,
];

/** The rows a list has: the tracks of the lists, the second on the album that is gone. */
const ROW_TRACK_IDS: Array.NonEmptyReadonlyArray<TrackId> = [track.id, explicitTrack.id];
const LINKS: Array.NonEmptyReadonlyArray<string> = ["/", "/new", "/search", "/", "/new", "/nowhere"];
const FIELD_TEXTS: Array.NonEmptyReadonlyArray<string> = ["", "a", "ab", "a ", " ", "b"];

/** What a row can be tapped for: the tracks of the lists, and one no list has. */
const PLAYABLE_IDS: Array.NonEmptyReadonlyArray<TrackId> = [
  track.id,
  explicitTrack.id,
  track.id,
  explicitTrack.id,
  MISSING_TRACK_ID,
];

/** What moves an expanded player on to another track, or back. */
const EXPANDED_CONTROLS: Array.NonEmptyReadonlyArray<Player.Message> = [
  Player.Message.ClickedNext(),
  Player.Message.ClickedPrevious(),
];

const PLAYER_CONTROLS: Array.NonEmptyReadonlyArray<Player.Message> = [
  Player.Message.ClickedPause(),
  Player.Message.ClickedPlay(),
  Player.Message.ClickedNext(),
  Player.Message.ClickedPrevious(),
  Player.Message.ClickedTryAgain(),
  Player.Message.ClickedPause(),
  Player.Message.ClickedPlay(),
];

/** The browser's history for this tab since the app loaded: the paths, and which one is current. */
type History = Readonly<{ entries: ReadonlyArray<string>; index: number }>;

type Walk = Readonly<{
  model: Model;
  history: History;
  /** URL changes the browser has made and the app has not heard of yet. They arrive in order. */
  urlChanges: ReadonlyArray<Message>;
  /** Replies and pauses on their way. They arrive in any order, or never. */
  replies: ReadonlyArray<Message>;
  /** The orders in answer to which the engine has said, and the app has heard, that it sounds. */
  soundingSaidFor: ReadonlyArray<number>;
  seed: number;
  trace: ReadonlyArray<string>;
  violations: ReadonlyArray<string>;
}>;

const nextSeed = (seed: number): number => (seed * 1664525 + 1013904223) % 4294967296;

const pick = <A>(items: Array.NonEmptyReadonlyArray<A>, seed: number): A =>
  Option.getOrElse(Array.get(items, seed % items.length), () => Array.headNonEmpty(items));

type Issued = NonNullable<ReturnType<typeof update>["commands"]>[number];

const hasRequestId = Schema.is(Schema.Struct({ requestId: Schema.String }));
const hasTrackInput = Schema.is(
  Schema.Struct({ requestId: Schema.String, input: Schema.Struct({ trackId: TrackId }) }),
);
const hasAlbumInput = Schema.is(
  Schema.Struct({ requestId: Schema.String, input: Schema.Struct({ albumId: AlbumId }) }),
);
const hasArtistInput = Schema.is(
  Schema.Struct({ requestId: Schema.String, input: Schema.Struct({ artistId: ArtistId }) }),
);
const hasPlaylistInput = Schema.is(
  Schema.Struct({ requestId: Schema.String, input: Schema.Struct({ playlistId: PlaylistId }) }),
);
const hasGenreInput = Schema.is(
  Schema.Struct({ requestId: Schema.String, input: Schema.Struct({ genreId: GenreId }) }),
);
const hasStationInput = Schema.is(
  Schema.Struct({ requestId: Schema.String, input: Schema.Struct({ stationId: StationId }) }),
);
const hasPauseId = Schema.is(Schema.Struct({ pauseId: Schema.String }));
const hasUrl = Schema.is(Schema.Struct({ url: Schema.String }));
const hasTrackId = Schema.is(Schema.Struct({ trackId: TrackId }));
const hasOrder = Schema.is(Schema.Struct({ order: Schema.Number }));
const hasOrderAndTrack = Schema.is(Schema.Struct({ order: Schema.Number, trackId: TrackId }));

/** A Message of the player's, as the app receives it. */
const player = (message: Player.Message): Message => Message.GotPlayerMessage({ message });

/** The engine's word, in answer to an order. */
const said = (
  order: number,
  phase: EnginePhase,
  positionSeconds: number,
  isSeeking: boolean = false,
): Message =>
  player(
    Player.Message.UpdatedEngineStatus({
      report: {
        order,
        phase,
        positionSeconds,
        // The length is read with the first data: an engine waiting at the very start has none yet.
        maybeDurationSeconds:
          phase === "Waiting" && positionSeconds === 0 ? Option.none() : Option.some(30),
        bufferedSeconds: positionSeconds,
        isSeeking,
      },
    }),
  );

/** The orders the app gives the engine, and the rest of what only the player may ask for. */
const PLAYER_COMMANDS: ReadonlyArray<string> = [
  "StartPlayback",
  "ResumePlayback",
  "PausePlayback",
  "SeekPlayback",
  "WaitBeforeShowingActivity",
  "RefreshSource",
  "PublishNowPlaying",
];

const ENGINE_ORDERS: ReadonlyArray<string> = [
  "StartPlayback",
  "ResumePlayback",
  "PausePlayback",
  "SeekPlayback",
];

/**
 * What an engine might say in answer to an order. It is all put in the same
 * bag as the catalog's replies, to arrive in any order or never: an engine
 * that says a track ended before it says it sounds is one the app must survive.
 */
const engineAnswers = (command: Issued, seed: number): ReadonlyArray<Message> => {
  const { name, args } = command;
  if (!hasOrder(args)) {
    return [];
  }
  const { order } = args;
  const roll = seed % 8;
  if (name === "StartPlayback" || name === "ResumePlayback") {
    const refusal =
      name === "StartPlayback"
        ? Player.Message.CompletedStartPlayback({ order, outcome: "Refused" })
        : Player.Message.CompletedResumePlayback({ order, outcome: "Refused" });
    if (roll === 0) {
      return [player(refusal), said(order, "Paused", 0)];
    }
    if (roll === 1) {
      return [said(order, "Waiting", 0), said(order, "Failed", 0)];
    }
    if (roll === 2) {
      return [said(order, "Waiting", 0)];
    }
    return [
      said(order, "Waiting", 0),
      said(order, "Sounding", 0),
      said(order, "Sounding", 5),
      ...(roll === 3 ? [said(order, "Waiting", 5), said(order, "Paused", 6)] : []),
      // A source that goes bad under way, after it has sounded.
      ...(roll === 4 ? [said(order, "Failed", 5)] : []),
      ...(roll > 5 ? [said(order, "Ended", 30)] : []),
    ];
  }
  if (name === "PausePlayback") {
    return [said(order, "Paused", 5)];
  }
  if (name === "SeekPlayback") {
    return [
      said(order, "Waiting", 9, true),
      said(order, roll < 2 ? "Paused" : "Sounding", 9),
    ];
  }
  if (name === "WaitBeforeShowingActivity") {
    return [player(Player.Message.CompletedWaitBeforeShowingActivity({ order }))];
  }
  if (name === "RefreshSource" && hasOrderAndTrack(args)) {
    return [
      player(
        roll % 2 === 0
          ? Player.Message.FailedRefreshSource({ order })
          : Player.Message.SucceededRefreshSource({
              order,
              track: {
                ...fullTrack,
                id: args.trackId,
                previewUrl: `https://audio.test/fresh-${order}.mp3`,
              },
            }),
      ),
    ];
  }
  return [];
};
const hasMaybeTerm = Schema.is(Schema.Struct({ maybeTerm: Schema.Option(Schema.String) }));

/**
 * How a request ends, when it ends at all. `TimedOut` is the Command giving up after its ten
 * seconds: it reports what a lost reply reports.
 */
type Fate = "Answered" | "Refused" | "TimedOut";

/** About one request in three fails, half of those by never being answered. */
const fateOf = (seed: number): Fate => {
  const roll = seed % 6;
  if (roll === 0) {
    return "Refused";
  }
  return roll === 3 ? "TimedOut" : "Answered";
};

/** The reply or the pause a Command sends back when it runs. */
const replyTo = (command: Issued, fate: Fate): Option.Option<Message> => {
  const { name, args } = command;
  if (name === "HomeFeed" && hasRequestId(args)) {
    const { requestId } = args;
    return Option.some(
      arrived(
        { Answered: reply.home, Refused: reply.homeRefused, TimedOut: reply.homeLost }[fate](
          requestId,
        ),
      ),
    );
  }
  if (name === "NewMusic" && hasRequestId(args)) {
    const { requestId } = args;
    return Option.some(
      arrived(
        {
          Answered: reply.newMusic,
          Refused: reply.newMusicRefused,
          TimedOut: reply.newMusicLost,
        }[fate](requestId),
      ),
    );
  }
  if (name === "CatalogSearch" && hasRequestId(args)) {
    const { requestId } = args;
    return Option.some(
      arrived(
        { Answered: reply.search, Refused: reply.searchRefused, TimedOut: reply.searchLost }[fate](
          requestId,
        ),
      ),
    );
  }
  if (name === "TrackDetail" && hasTrackInput(args)) {
    const { requestId, input } = args;
    if (fate === "Refused") {
      return Option.some(arrived(reply.trackRefused(requestId)));
    }
    if (fate === "TimedOut") {
      return Option.some(arrived(reply.trackLost(requestId)));
    }
    return Option.some(
      arrived(
        input.trackId === MISSING_TRACK_ID
          ? reply.trackMissing(requestId, input.trackId)
          : reply.track(requestId, { ...fullTrack, id: input.trackId }),
      ),
    );
  }
  if (name === "AlbumDetail" && hasAlbumInput(args)) {
    const { requestId, input } = args;
    if (fate === "Refused") {
      return Option.some(arrived(reply.albumRefused(requestId)));
    }
    if (fate === "TimedOut") {
      return Option.some(arrived(reply.albumLost(requestId)));
    }
    return Option.some(
      arrived(
        input.albumId === MISSING_ALBUM_ID
          ? reply.albumMissing(requestId, input.albumId)
          : reply.album(requestId, { ...fullAlbum, id: input.albumId }),
      ),
    );
  }
  if (name === "ArtistDetail" && hasArtistInput(args)) {
    const { requestId, input } = args;
    if (fate === "Refused") {
      return Option.some(arrived(reply.artistRefused(requestId)));
    }
    if (fate === "TimedOut") {
      return Option.some(arrived(reply.artistLost(requestId)));
    }
    return Option.some(
      arrived(
        input.artistId === MISSING_ARTIST_ID
          ? reply.artistMissing(requestId, input.artistId)
          : reply.artist(requestId, { ...fullArtist, id: input.artistId }),
      ),
    );
  }
  if (name === "PlaylistDetail" && hasPlaylistInput(args)) {
    const { requestId, input } = args;
    if (fate === "Refused") {
      return Option.some(arrived(reply.playlistRefused(requestId)));
    }
    if (fate === "TimedOut") {
      return Option.some(arrived(reply.playlistLost(requestId)));
    }
    return Option.some(
      arrived(
        input.playlistId === MISSING_PLAYLIST_ID
          ? reply.playlistMissing(requestId, input.playlistId)
          : reply.playlist(requestId, { ...fullPlaylist, id: input.playlistId }),
      ),
    );
  }
  if (name === "GenreList" && hasRequestId(args)) {
    const { requestId } = args;
    return Option.some(
      arrived(
        { Answered: reply.genres, Refused: reply.genresRefused, TimedOut: reply.genresLost }[fate](
          requestId,
        ),
      ),
    );
  }
  if (name === "StationList" && hasRequestId(args)) {
    const { requestId } = args;
    return Option.some(
      arrived(
        { Answered: reply.radio, Refused: reply.radioRefused, TimedOut: reply.radioLost }[fate](
          requestId,
        ),
      ),
    );
  }
  if (name === "GenreDetail" && hasGenreInput(args)) {
    const { requestId, input } = args;
    if (fate === "Refused") {
      return Option.some(arrived(reply.genreRefused(requestId)));
    }
    if (fate === "TimedOut") {
      return Option.some(arrived(reply.genreLost(requestId)));
    }
    return Option.some(
      arrived(
        input.genreId === MISSING_GENRE_ID
          ? reply.genreMissing(requestId, input.genreId)
          : reply.genre(requestId, { ...fullGenre, id: input.genreId }),
      ),
    );
  }
  if (name === "StationDetail" && hasStationInput(args)) {
    const { requestId, input } = args;
    if (fate === "Refused") {
      return Option.some(arrived(reply.stationRefused(requestId)));
    }
    if (fate === "TimedOut") {
      return Option.some(arrived(reply.stationLost(requestId)));
    }
    return Option.some(
      arrived(
        input.stationId === MISSING_STATION_ID
          ? reply.stationMissing(requestId, input.stationId)
          : reply.station(requestId, { ...fullStation, id: input.stationId }),
      ),
    );
  }
  if (name === "WaitForTypingPause" && hasPauseId(args)) {
    return Option.some(Message.CompletedWaitForTypingPause({ pauseId: args.pauseId }));
  }
  return Option.none();
};

type Moved = Readonly<{ history: History; violations: ReadonlyArray<string> }>;

/** What a Command does to the browser's history when it runs, which is at once. */
const moveHistory = (history: History, command: Issued): Option.Option<Moved> => {
  const { name, args } = command;
  if (name === "NavigateInternal" && hasUrl(args)) {
    // A link's URL is absolute, Try again's is a path: either way, where the address bar ends up.
    const target = new URL(args.url, "https://bafle.test");
    return Option.some({
      history: {
        entries: Array.append(
          Array.take(history.entries, history.index + 1),
          target.pathname + target.search,
        ),
        index: history.index + 1,
      },
      violations: [],
    });
  }
  if (name === "ReplaceSearchTerm" && hasMaybeTerm(args)) {
    return Option.some({
      history: {
        entries: Array.map(history.entries, (path, index) =>
          index === history.index ? searchRouter({ maybeTerm: args.maybeTerm }) : path,
        ),
        index: history.index,
      },
      violations: [],
    });
  }
  if (name === "ReplaceTrackUrl" && hasTrackId(args)) {
    return Option.some({
      history: {
        entries: Array.map(history.entries, (path, index) =>
          index === history.index ? trackPath(args.trackId) : path,
        ),
        index: history.index,
      },
      violations: [],
    });
  }
  if (name === "NavigateBack") {
    return Option.some(
      history.index > 0
        ? { history: { entries: history.entries, index: history.index - 1 }, violations: [] }
        : { history, violations: ["a page's back control led out of the app"] },
    );
  }
  return Option.none();
};

const currentPath = (history: History): string =>
  Option.getOrElse(Array.get(history.entries, history.index), () => "/");

type PageName =
  | "home"
  | "newMusic"
  | "genreList"
  | "stationList"
  | "search"
  | "track"
  | "album"
  | "artist"
  | "playlist"
  | "genre"
  | "station";

const pendingTrackIds = (model: Model): ReadonlyArray<TrackId> =>
  pipe(
    HashMap.toEntries(model.tracks),
    Array.filter(([, data]) => AsyncData.isPending(data)),
    Array.map(([trackId]) => trackId),
  );

const pendingAlbumIds = (model: Model): ReadonlyArray<AlbumId> =>
  pipe(
    HashMap.toEntries(model.albums),
    Array.filter(([, data]) => AsyncData.isPending(data)),
    Array.map(([albumId]) => albumId),
  );

const pendingArtistIds = (model: Model): ReadonlyArray<ArtistId> =>
  pipe(
    HashMap.toEntries(model.artists),
    Array.filter(([, data]) => AsyncData.isPending(data)),
    Array.map(([artistId]) => artistId),
  );

const pendingPlaylistIds = (model: Model): ReadonlyArray<PlaylistId> =>
  pipe(
    HashMap.toEntries(model.playlists),
    Array.filter(([, data]) => AsyncData.isPending(data)),
    Array.map(([playlistId]) => playlistId),
  );

const pendingGenreIds = (model: Model): ReadonlyArray<GenreId> =>
  pipe(
    HashMap.toEntries(model.genres),
    Array.filter(([, data]) => AsyncData.isPending(data)),
    Array.map(([genreId]) => genreId),
  );

const pendingStationIds = (model: Model): ReadonlyArray<StationId> =>
  pipe(
    HashMap.toEntries(model.stations),
    Array.filter(([, data]) => AsyncData.isPending(data)),
    Array.map(([stationId]) => stationId),
  );

const pendingPages = (model: Model): ReadonlyArray<PageName> =>
  Array.getSomes([
    Option.liftPredicate<PageName>("home", () => AsyncData.isPending(model.home)),
    Option.liftPredicate<PageName>("newMusic", () => AsyncData.isPending(model.newMusic)),
    Option.liftPredicate<PageName>("genreList", () => AsyncData.isPending(model.genreList)),
    Option.liftPredicate<PageName>("stationList", () => AsyncData.isPending(model.stationList)),
    Option.liftPredicate<PageName>("genre", () =>
      Array.isReadonlyArrayNonEmpty(pendingGenreIds(model)),
    ),
    Option.liftPredicate<PageName>("station", () =>
      Array.isReadonlyArrayNonEmpty(pendingStationIds(model)),
    ),
    Option.liftPredicate<PageName>("search", () => AsyncData.isPending(model.search)),
    Option.liftPredicate<PageName>("track", () =>
      Array.isReadonlyArrayNonEmpty(pendingTrackIds(model)),
    ),
    Option.liftPredicate<PageName>("album", () =>
      Array.isReadonlyArrayNonEmpty(pendingAlbumIds(model)),
    ),
    Option.liftPredicate<PageName>("artist", () =>
      Array.isReadonlyArrayNonEmpty(pendingArtistIds(model)),
    ),
    Option.liftPredicate<PageName>("playlist", () =>
      Array.isReadonlyArrayNonEmpty(pendingPlaylistIds(model)),
    ),
  ]);

const pageOf = (route: AppRoute): Option.Option<PageName> =>
  AppRoute.match<Option.Option<PageName>>(route, {
    Home: () => Option.some("home"),
    New: () => Option.some("newMusic"),
    Genres: () => Option.some("genreList"),
    Radio: () => Option.some("stationList"),
    Search: () => Option.some("search"),
    Track: () => Option.some("track"),
    Album: () => Option.some("album"),
    Artist: () => Option.some("artist"),
    Playlist: () => Option.some("playlist"),
    Genre: () => Option.some("genre"),
    Station: () => Option.some("station"),
    NotFound: () => Option.none(),
  });

/** The page a reply is awaited for: the one the app is heading for, else the one on screen. */
const awaitedRoute = (model: Model): AppRoute => Option.getOrElse(maybeHeadedFor(model), () => model.route);

/** Whether the page on screen is one that offers Try again: its last load or refresh failed. */
const showsTryAgain = (model: Model): boolean =>
  AppRoute.match(model.route, {
    Home: () => AsyncData.hasError(model.home),
    New: () => AsyncData.hasError(model.newMusic),
    Genres: () => AsyncData.hasError(model.genreList),
    Radio: () => AsyncData.hasError(model.stationList),
    Search: () => AsyncData.hasError(model.search),
    Track: ({ trackId }) => AsyncData.hasError(trackData(model, trackId)),
    Album: ({ albumId }) => AsyncData.hasError(albumData(model, albumId)),
    Artist: ({ artistId }) => AsyncData.hasError(artistData(model, artistId)),
    Playlist: ({ playlistId }) => AsyncData.hasError(playlistData(model, playlistId)),
    Genre: ({ genreId }) => AsyncData.hasError(genreData(model, genreId)),
    Station: ({ stationId }) => AsyncData.hasError(stationData(model, stationId)),
    NotFound: () => false,
  });

/** Whether the page on screen lists tracks, each row a link to its page. */
const listsTracks = (model: Model): boolean =>
  AppRoute.matchOrElse(
    model.route,
    {
      New: () => AsyncData.hasData(model.newMusic),
      Search: () => AsyncData.hasData(model.search),
    },
    () => false,
  );

/** The tracks whose rows offer Try again: those that failed to open. Every list has every track. */
const failedTrackIds = (model: Model): ReadonlyArray<TrackId> =>
  pipe(
    HashMap.toEntries(model.tracks),
    Array.filter(([, data]) => AsyncData.isFailure(data)),
    Array.map(([trackId]) => trackId),
  );

/** Whether the page on screen shelves albums, each tile a link to its page. */
const shelvesAlbums = (model: Model): boolean =>
  AppRoute.matchOrElse(
    model.route,
    {
      Home: () => AsyncData.hasData(model.home),
      New: () => AsyncData.hasData(model.newMusic),
      Search: () => AsyncData.hasData(model.search),
    },
    () => false,
  );

/** Whether the page on screen is an album's, with its rows. */
const listsAlbum = (model: Model): boolean =>
  model.route._tag === "Album" &&
  Option.exists(AsyncData.getData(albumData(model, model.route.albumId)), Option.isSome);

/** Whether the page on screen shelves artists and playlists, each tile a link to its page. */
const shelvesArtistsAndPlaylists = (model: Model): boolean =>
  AppRoute.matchOrElse(
    model.route,
    {
      Home: () => AsyncData.hasData(model.home),
      Search: () => AsyncData.hasData(model.search),
    },
    () => false,
  );

/** Whether the page on screen is an artist's, with their rows and their shelf. */
const listsArtist = (model: Model): boolean =>
  model.route._tag === "Artist" &&
  Option.exists(AsyncData.getData(artistData(model, model.route.artistId)), Option.isSome);

/** Whether the page on screen is a playlist's, with its rows. */
const listsPlaylist = (model: Model): boolean =>
  model.route._tag === "Playlist" &&
  Option.exists(AsyncData.getData(playlistData(model, model.route.playlistId)), Option.isSome);

/** Whether the page on screen is a genre's, with its rows and its shelves. */
const listsGenre = (model: Model): boolean =>
  model.route._tag === "Genre" &&
  Option.exists(AsyncData.getData(genreData(model, model.route.genreId)), Option.isSome);

/** Whether the page on screen is a station's, with its rows. */
const listsStation = (model: Model): boolean =>
  model.route._tag === "Station" &&
  Option.exists(AsyncData.getData(stationData(model, model.route.stationId)), Option.isSome);

/** The rows of the list on screen that offer Try again for their album: it failed to open from them. */
const failedAlbumRows = (model: Model): ReadonlyArray<Row> =>
  pipe(
    HashMap.toEntries(model.albumRows),
    Array.filter(
      ([albumId, row]) =>
        row.from === model.route._tag && AsyncData.isFailure(albumData(model, albumId)),
    ),
    Array.map(([, row]) => row),
  );

/** What the rules allow of any Model, whatever happened before it. Returns the rules it breaks. */
const broken = (model: Model): ReadonlyArray<string> => {
  const pending = pendingPages(model);
  const awaited = awaitedRoute(model);
  const maybeDestination = maybeHeadedFor(model);
  const rules: ReadonlyArray<readonly [rule: string, holds: boolean]> = [
    [
      "nothing is asked for ahead of the listener before the first page has the screen",
      model.launch === "Launched" ||
        (Option.isNone(model.ahead.maybeAsked) && Array.isReadonlyArrayEmpty(model.ahead.toAsk)),
    ],
    [
      "a page is pending exactly when something is awaited",
      Array.isReadonlyArrayNonEmpty(pending) === (model.awaiting._tag !== "Nothing"),
    ],
    [
      "only the page awaited is ever pending",
      Array.every(pending, (page) => Option.contains(pageOf(awaited), page)),
    ],
    [
      "the only track ever pending is the one the listener is opening or looking at",
      Array.every(
        pendingTrackIds(model),
        (trackId) => awaited._tag === "Track" && awaited.trackId === trackId,
      ),
    ],
    [
      "a track with nothing held and nothing asked has no entry",
      Array.every(HashMap.toValues(model.tracks), (data) => !AsyncData.isIdle(data)),
    ],
    [
      "a track known to be missing is never asked for again",
      Array.every(
        HashMap.toValues(model.tracks),
        (data) =>
          !AsyncData.isPending(data) || !Option.exists(AsyncData.getData(data), Option.isNone),
      ),
    ],
    [
      "the only album ever pending is the one the listener is opening or looking at",
      Array.every(
        pendingAlbumIds(model),
        (albumId) => awaited._tag === "Album" && awaited.albumId === albumId,
      ),
    ],
    [
      "an album with nothing held and nothing asked has no entry",
      Array.every(HashMap.toValues(model.albums), (data) => !AsyncData.isIdle(data)),
    ],
    [
      "an album known to be missing is never asked for again",
      Array.every(
        HashMap.toValues(model.albums),
        (data) =>
          !AsyncData.isPending(data) || !Option.exists(AsyncData.getData(data), Option.isNone),
      ),
    ],
    [
      "the only artist ever pending is the one the listener is opening or looking at",
      Array.every(
        pendingArtistIds(model),
        (artistId) => awaited._tag === "Artist" && awaited.artistId === artistId,
      ),
    ],
    [
      "an artist with nothing held and nothing asked has no entry",
      Array.every(HashMap.toValues(model.artists), (data) => !AsyncData.isIdle(data)),
    ],
    [
      "an artist known to be missing is never asked for again",
      Array.every(
        HashMap.toValues(model.artists),
        (data) =>
          !AsyncData.isPending(data) || !Option.exists(AsyncData.getData(data), Option.isNone),
      ),
    ],
    [
      "the only playlist ever pending is the one the listener is opening or looking at",
      Array.every(
        pendingPlaylistIds(model),
        (playlistId) => awaited._tag === "Playlist" && awaited.playlistId === playlistId,
      ),
    ],
    [
      "a playlist with nothing held and nothing asked has no entry",
      Array.every(HashMap.toValues(model.playlists), (data) => !AsyncData.isIdle(data)),
    ],
    [
      "a playlist known to be missing is never asked for again",
      Array.every(
        HashMap.toValues(model.playlists),
        (data) =>
          !AsyncData.isPending(data) || !Option.exists(AsyncData.getData(data), Option.isNone),
      ),
    ],
    [
      "the only genre ever pending is the one the listener is opening or looking at",
      Array.every(
        pendingGenreIds(model),
        (genreId) => awaited._tag === "Genre" && awaited.genreId === genreId,
      ),
    ],
    [
      "a genre with nothing held and nothing asked has no entry",
      Array.every(HashMap.toValues(model.genres), (data) => !AsyncData.isIdle(data)),
    ],
    [
      "a genre known to be missing is never asked for again",
      Array.every(
        HashMap.toValues(model.genres),
        (data) =>
          !AsyncData.isPending(data) || !Option.exists(AsyncData.getData(data), Option.isNone),
      ),
    ],
    [
      "the only station ever pending is the one the listener is opening or looking at",
      Array.every(
        pendingStationIds(model),
        (stationId) => awaited._tag === "Station" && awaited.stationId === stationId,
      ),
    ],
    [
      "a station with nothing held and nothing asked has no entry",
      Array.every(HashMap.toValues(model.stations), (data) => !AsyncData.isIdle(data)),
    ],
    [
      "a station known to be missing is never asked for again",
      Array.every(
        HashMap.toValues(model.stations),
        (data) =>
          !AsyncData.isPending(data) || !Option.exists(AsyncData.getData(data), Option.isNone),
      ),
    ],
    [
      "a pending intention is never for the page on screen",
      !Option.exists(maybeDestination, (route) => isSamePage(route, model.route)),
    ],
    [
      "a page is waited for only while the screen has something to show and the page has nothing",
      // A track's page being waited for when its track becomes the current one goes on being
      // waited for: the listener asked for it before it was the player's, and the reply is on its way.
      !Option.exists(
        maybeDestination,
        (route) =>
          !isPlayersTrack(model, route) &&
          (!canShow(model, model.route) || canShow(model, route)),
      ),
    ],
    [
      "the URL is ahead of the screen only for a page the browser went to",
      model.awaiting._tag === "Arrival" || isSameRoute(addressOf(model), model.route),
    ],
    [
      "a typing pause is only awaited on Search",
      model.awaiting._tag !== "TypingPause" || model.route._tag === "Search",
    ],
  ];
  return pipe(
    rules,
    Array.filter(([, holds]) => !holds),
    Array.map(([rule]) => rule),
  );
};

/**
 * What must be true of the Model against the browser's history, once the app
 * has heard of every URL change: the URL is where the app takes it to be,
 * which is the page on screen unless the browser went elsewhere and that page
 * is loading, and it claims a way back only if this visit left a page behind.
 */
const astray = (model: Model, history: History): ReadonlyArray<string> => {
  const rules: ReadonlyArray<readonly [rule: string, holds: boolean]> = [
    [
      "the app knows where the browser's URL is",
      isSameRoute(addressOf(model), urlToAppRoute(url(currentPath(history)))),
    ],
    [
      "the app knows of pages behind only when the history has them",
      Array.isReadonlyArrayEmpty(model.trail) || history.index > 0,
    ],
    [
      "a way back is offered only when the history has a page to go back to",
      Option.isNone(wayBack(model)) || history.index > 0,
    ],
    [
      "what the app asked of the history is forgotten once the URL has changed",
      Option.isNone(model.maybeAskedRoute),
    ],
  ];
  return pipe(
    rules,
    Array.filter(([, holds]) => !holds),
    Array.map(([rule]) => rule),
  );
};

/**
 * What the app may ask of the history in one step. An entry is only ever
 * pushed for the page that is on screen as it is pushed, and one at a time;
 * and a pending intention, a tap with no reply yet, never pushes the page it
 * is for.
 */
const trespassing = (model: Model, commands: ReadonlyArray<Issued>): ReadonlyArray<string> => {
  const pushed = Array.filterMap(commands, ({ name, args }) =>
    name === "NavigateInternal" && hasUrl(args)
      ? Result.succeed(urlToAppRoute(url(args.url)))
      : Result.failVoid,
  );
  const rules: ReadonlyArray<readonly [rule: string, holds: boolean]> = [
    [
      // The same page, not the same route: Search typed into is still Search.
      "the history only gains an entry for the page on screen",
      Array.every(pushed, (route) => isSamePage(route, model.route)),
    ],
    ["the history gains one entry at a time", pushed.length <= 1],
    [
      "typing rewrites the entry only while Search is on screen",
      model.route._tag === "Search" ||
        !Array.some(commands, ({ name }) => name === "ReplaceSearchTerm"),
    ],
  ];
  return pipe(
    rules,
    Array.filter(([, holds]) => !holds),
    Array.map(([rule]) => rule),
  );
};

const playbackOf = (model: Model): Option.Option<Player.Playback> =>
  Option.map(model.player.maybeSession, (session) => session.playback);

/** The order a report answers, when the Message is the engine's word. */
const reportOf = (message: Message) =>
  message._tag === "GotPlayerMessage" && message.message._tag === "UpdatedEngineStatus"
    ? Option.some(message.message.report)
    : Option.none();

const isPlaying = (message: Message): boolean =>
  message._tag === "GotPlayerMessage" || message._tag === "ClickedPlayTrack";

/** The Messages by which the listener puts another track in the player. */
const isListenersChoice = (message: Message): boolean =>
  message._tag === "ClickedPlayTrack" ||
  (message._tag === "GotPlayerMessage" &&
    ["ClickedNext", "ClickedPrevious", "PressedMediaKey"].includes(message.message._tag));

/**
 * What must be true of the player after any step, whatever came before:
 * what it holds, and what it claims of the sound against what the engine has
 * said in answer to the latest order.
 */
const mistaken = (model: Model, soundingSaidFor: ReadonlyArray<number>): ReadonlyArray<string> =>
  Option.match(model.player.maybeSession, {
    onNone: () => (model.player.lastOrder === 0 ? [] : ["orders were given with nothing to play"]),
    onSome: (session) => {
      const others = [...session.earlier, ...session.later];
      const rules: ReadonlyArray<readonly [rule: string, holds: boolean]> = [
        [
          "the interface never shows sounding without the engine having said so since the last order",
          !Player.Playback.guards.Sounding(session.playback) ||
            soundingSaidFor.includes(model.player.lastOrder),
        ],
        [
          "at most one track is current: the queue around it never holds it again",
          Array.every(others, (queued) => queued.id !== session.current.id),
        ],
        [
          "everything in the queue has something to play",
          Array.every([session.current, ...others], Player.isPlayable),
        ],
        [
          "the listener seeks only once the engine has read the length",
          Player.Seek.guards.Settled(session.seek) || Option.isSome(session.maybeDurationSeconds),
        ],
      ];
      return pipe(
        rules,
        Array.filter(([, holds]) => !holds),
        Array.map(([rule]) => rule),
      );
    },
  });

/**
 * What one step may do to the player, and what playing may do to the rest:
 * read from the Model before it, the Message, the Model after it and the
 * Commands it issued.
 */
const overstepping = (
  before: Model,
  message: Message,
  after: Model,
  commands: ReadonlyArray<Issued>,
): ReadonlyArray<string> => {
  const issued = Array.map(commands, ({ name }) => name);
  const orders = Array.filter(commands, ({ name }) => ENGINE_ORDERS.includes(name));
  const currentBefore = Option.getOrUndefined(Player.maybeCurrentTrackId(before.player));
  const currentAfter = Option.getOrUndefined(Player.maybeCurrentTrackId(after.player));
  const maybeReport = reportOf(message);
  const isStale = Option.exists(maybeReport, (report) => report.order !== before.player.lastOrder);
  const rules: ReadonlyArray<readonly [rule: string, holds: boolean]> = [
    [
      "navigation never issues an engine order, nor touches the player",
      isPlaying(message) ||
        (after.player === before.player &&
          !Array.some(issued, (name) => PLAYER_COMMANDS.includes(name))),
    ],
    [
      "playing moves the screen only to keep an expanded player on the track it holds",
      !isPlaying(message) ||
        after.route === before.route ||
        (isPlayerExpanded(before) && isPlayerExpanded(after)),
    ],
    [
      "playing never adds a history entry, and rewrites one only for an expanded player",
      !isPlaying(message) ||
        (!Array.some(issued, (name) => name === "NavigateInternal" || name === "NavigateBack") &&
          (isPlayerExpanded(before) || !Array.some(issued, (name) => name === "ReplaceTrackUrl"))),
    ],
    [
      "an expanded player stays expanded whatever track it goes on to, unless the browser has moved on",
      !isPlaying(message) ||
        !isPlayerExpanded(before) ||
        isPlayerExpanded(after) ||
        Option.isNone(after.player.maybeSession),
    ],
    [
      "playing leaves the lists as they were, and the page the listener is waiting for",
      !isPlaying(message) ||
        (after.trail === before.trail &&
          after.newMusic === before.newMusic &&
          after.home === before.home &&
          (after.awaiting === before.awaiting || isPlayerExpanded(before))),
    ],
    [
      "opening the player takes the screen at once, adds exactly one entry and asks the engine nothing",
      !(
        message._tag === "ClickedLink" &&
        message.request._tag === "Internal" &&
        isPlayersTrack(before, urlToAppRoute(message.request.url)) &&
        !isPlayerExpanded(before)
      ) ||
        (isPlayerExpanded(after) &&
          Array.filter(issued, (name) => name === "NavigateInternal").length === 1 &&
          !Array.some(issued, (name) => PLAYER_COMMANDS.includes(name))),
    ],
    [
      "what the engine says of an earlier order changes nothing",
      !isStale || (after === before && Array.isReadonlyArrayEmpty(commands)),
    ],
    [
      "every order given to the engine carries the latest number, and one step gives at most one",
      orders.length <= 1 &&
        Array.every(
          orders,
          ({ args }) =>
            hasOrder(args) &&
            args.order === after.player.lastOrder &&
            args.order === before.player.lastOrder + 1,
        ),
    ],
    [
      "the order number moves only with an order to the engine",
      after.player.lastOrder === before.player.lastOrder + orders.length,
    ],
    [
      // Not a failure, not a refusal, not a stall: the queue never moves on by itself past a track that did not play.
      "the current track changes only by the listener's choice, or by the one before it ending",
      currentAfter === currentBefore ||
        isListenersChoice(message) ||
        Option.exists(
          maybeReport,
          (report) => report.phase === "Ended" && report.order === before.player.lastOrder,
        ),
    ],
    [
      "the player, once there, is never taken away",
      Option.isNone(before.player.maybeSession) || Option.isSome(after.player.maybeSession),
    ],
  ];
  return pipe(
    rules,
    Array.filter(([, holds]) => !holds),
    Array.map(([rule]) => rule),
  );
};

type Happening = Readonly<{
  label: string;
  message: Message;
  history: History;
  urlChanges: ReadonlyArray<Message>;
  replies: ReadonlyArray<Message>;
}>;

/** The listener does something. They only act on what they see: every URL change has landed. */
const acting = (walk: Walk, seed: number): Happening => {
  const roll = seed % 100;
  const choice = nextSeed(seed);
  const unchanged = { history: walk.history, urlChanges: walk.urlChanges, replies: walk.replies };
  const clicks = (path: string): Happening => ({
    label: `clicks link ${path}`,
    message: clickedLink(path),
    ...unchanged,
  });
  // The browser's history menu jumps over entries. One jump is left out: onto a page the same
  // as the nearest one the app knows behind. All the app hears is the URL, which is then what
  // Back would have given it, so it cannot tell the two apart.
  const jumps = Array.filter(
    Array.makeBy(walk.history.entries.length, (index) => index),
    (index) =>
      Math.abs(index - walk.history.index) > 1 &&
      !Option.exists(Array.last(walk.model.trail), (nearest) =>
        isSameRoute(
          nearest,
          urlToAppRoute(url(Option.getOrElse(Array.get(walk.history.entries, index), () => "/"))),
        ),
      ),
  );

  const playRoll = nextSeed(choice) % 100;
  const playChoice = nextSeed(nextSeed(choice));
  if (playRoll < 12 && Option.isSome(walk.model.player.maybeSession)) {
    const control = pick(PLAYER_CONTROLS, playChoice);
    return {
      label: `presses the player's ${control._tag}`,
      message: player(control),
      ...unchanged,
    };
  }
  const maybePlaying = Player.maybeCurrentTrackId(walk.model.player);
  if (playRoll >= 30 && playRoll < 42 && Option.isSome(maybePlaying) && !isPlayerExpanded(walk.model)) {
    return {
      label: "presses the island to open the player",
      message: clickedLink(trackPath(maybePlaying.value)),
      ...unchanged,
    };
  }
  if (playRoll >= 30 && playRoll < 65 && isPlayerExpanded(walk.model)) {
    const control = pick(EXPANDED_CONTROLS, playChoice);
    return {
      label: `presses the expanded player's ${control._tag}`,
      message: player(control),
      ...unchanged,
    };
  }
  if (playRoll < 30 && listsTracks(walk.model)) {
    const from: PlayOrigin = walk.model.route._tag === "Search" ? "Search" : "New";
    return {
      label: "taps a row to play",
      message: Message.ClickedPlayTrack({ trackId: pick(PLAYABLE_IDS, playChoice), from }),
      ...unchanged,
    };
  }
  if (playRoll < 30 && walk.model.route._tag === "Track") {
    return {
      label: "presses Play on the track's page",
      message: Message.ClickedPlayTrack({ trackId: walk.model.route.trackId, from: "Track" }),
      ...unchanged,
    };
  }

  const albumRoll = nextSeed(playChoice) % 100;
  const albumChoice = nextSeed(nextSeed(playChoice));
  if (albumRoll < 10 && listsTracks(walk.model)) {
    const from: PlayOrigin = walk.model.route._tag === "Search" ? "Search" : "New";
    return {
      label: "chooses Go to album on a row",
      message: choseFromRow(from, pick(ROW_TRACK_IDS, albumChoice), "OpenAlbum"),
      ...unchanged,
    };
  }
  if (albumRoll < 16 && shelvesAlbums(walk.model)) {
    return clicks(pick(ALBUM_PATHS, albumChoice));
  }
  const failedAlbums = failedAlbumRows(walk.model);
  if (albumRoll < 70 && Array.isReadonlyArrayNonEmpty(failedAlbums)) {
    const row = pick(failedAlbums, albumChoice);
    return {
      label: "presses Go to album again on the row that failed",
      message: choseFromRow(row.from, row.trackId, "OpenAlbum"),
      ...unchanged,
    };
  }
  if (albumRoll < 25 && listsAlbum(walk.model)) {
    return {
      label: "taps a row of the album to play",
      message: Message.ClickedPlayTrack({ trackId: pick(PLAYABLE_IDS, albumChoice), from: "Album" }),
      ...unchanged,
    };
  }
  if (albumRoll < 40 && listsAlbum(walk.model)) {
    return {
      label: "chooses Song details on a row of the album",
      message: choseFromRow("Album", track.id, "OpenSong"),
      ...unchanged,
    };
  }
  if (albumRoll < 60 && walk.model.route._tag === "Album") {
    // The page's own way back, as a track's page has it.
    return Option.isSome(wayBack(walk.model))
      ? { label: "clicks the album page's Back", message: Message.ClickedBack(), ...unchanged }
      : clicks("/");
  }

  const shelfRoll = nextSeed(albumChoice) % 100;
  const shelfChoice = nextSeed(nextSeed(albumChoice));
  if (shelfRoll < 6 && shelvesArtistsAndPlaylists(walk.model)) {
    return clicks(pick(ARTIST_PATHS, shelfChoice));
  }
  if (shelfRoll < 12 && shelvesArtistsAndPlaylists(walk.model)) {
    return clicks(pick(PLAYLIST_PATHS, shelfChoice));
  }
  if (shelfRoll < 25 && (listsArtist(walk.model) || listsPlaylist(walk.model))) {
    const from: PlayOrigin = walk.model.route._tag === "Artist" ? "Artist" : "Playlist";
    return {
      label: `taps a row of the ${from === "Artist" ? "artist" : "playlist"} to play`,
      message: Message.ClickedPlayTrack({ trackId: pick(PLAYABLE_IDS, shelfChoice), from }),
      ...unchanged,
    };
  }
  if (shelfRoll < 37 && (listsArtist(walk.model) || listsPlaylist(walk.model))) {
    const from: PlayOrigin = walk.model.route._tag === "Artist" ? "Artist" : "Playlist";
    return {
      label: `chooses Go to album on a row of the ${from === "Artist" ? "artist" : "playlist"}`,
      message: choseFromRow(from, pick(ROW_TRACK_IDS, shelfChoice), "OpenAlbum"),
      ...unchanged,
    };
  }
  if (shelfRoll < 47 && listsArtist(walk.model)) {
    // The artist's own shelf: its tiles lead to albums as any shelf's do.
    return clicks(pick(ALBUM_PATHS, shelfChoice));
  }
  if (shelfRoll < 47 && listsPlaylist(walk.model)) {
    return {
      label: "chooses Song details on a row of the playlist",
      message: choseFromRow("Playlist", track.id, "OpenSong"),
      ...unchanged,
    };
  }
  if (shelfRoll < 65 && (walk.model.route._tag === "Artist" || walk.model.route._tag === "Playlist")) {
    // The page's own way back, as a track's page has it.
    return Option.isSome(wayBack(walk.model))
      ? {
          label: `clicks the ${walk.model.route._tag === "Artist" ? "artist" : "playlist"} page's Back`,
          message: Message.ClickedBack(),
          ...unchanged,
        }
      : clicks("/");
  }

  const genreRoll = nextSeed(shelfChoice) % 100;
  const genreChoice = nextSeed(nextSeed(shelfChoice));
  if (genreRoll < 5) {
    // The menu's two other sections, chosen from wherever the listener is.
    return clicks(pick(NEW_SECTION_LINKS, genreChoice));
  }
  if (genreRoll < 85 && walk.model.route._tag === "Genres" && AsyncData.hasData(walk.model.genreList)) {
    return clicks(pick(GENRE_PATHS, genreChoice));
  }
  if (genreRoll < 85 && walk.model.route._tag === "Radio" && AsyncData.hasData(walk.model.stationList)) {
    return clicks(pick(STATION_PATHS, genreChoice));
  }
  if (genreRoll < 30 && (listsGenre(walk.model) || listsStation(walk.model))) {
    const from: PlayOrigin = walk.model.route._tag === "Genre" ? "Genre" : "Station";
    return {
      label: `taps a row of the ${from === "Genre" ? "genre" : "station"} to play`,
      message: Message.ClickedPlayTrack({ trackId: pick(PLAYABLE_IDS, genreChoice), from }),
      ...unchanged,
    };
  }
  if (genreRoll < 50 && (listsGenre(walk.model) || listsStation(walk.model))) {
    const from: PlayOrigin = walk.model.route._tag === "Genre" ? "Genre" : "Station";
    return {
      label: `chooses Go to album on a row of the ${from === "Genre" ? "genre" : "station"}`,
      message: choseFromRow(from, pick(ROW_TRACK_IDS, genreChoice), "OpenAlbum"),
      ...unchanged,
    };
  }
  if (genreRoll < 68 && listsGenre(walk.model)) {
    // The genre's own shelves: their tiles lead to albums, artists and playlists as any shelf's do.
    return clicks(
      pick([...ALBUM_PATHS, ...ARTIST_PATHS, ...PLAYLIST_PATHS], genreChoice),
    );
  }
  if (genreRoll < 68 && listsStation(walk.model)) {
    return {
      label: "chooses Song details on a row of the station",
      message: choseFromRow("Station", track.id, "OpenSong"),
      ...unchanged,
    };
  }
  if (genreRoll < 85 && (walk.model.route._tag === "Genre" || walk.model.route._tag === "Station")) {
    // The page's own way back, as a track's page has it.
    return Option.isSome(wayBack(walk.model))
      ? {
          label: `clicks the ${walk.model.route._tag === "Genre" ? "genre" : "station"} page's Back`,
          message: Message.ClickedBack(),
          ...unchanged,
        }
      : clicks("/");
  }

  if (roll < 12 && walk.history.index > 0) {
    const history = { entries: walk.history.entries, index: walk.history.index - 1 };
    return {
      label: `presses the browser's Back to ${currentPath(history)}`,
      message: changedUrl(currentPath(history)),
      history,
      urlChanges: [],
      replies: walk.replies,
    };
  }
  if (roll < 20 && walk.history.index < walk.history.entries.length - 1) {
    const history = { entries: walk.history.entries, index: walk.history.index + 1 };
    return {
      label: `presses the browser's Forward to ${currentPath(history)}`,
      message: changedUrl(currentPath(history)),
      history,
      urlChanges: [],
      replies: walk.replies,
    };
  }
  if (roll < 24 && Array.isReadonlyArrayNonEmpty(jumps)) {
    const history = { entries: walk.history.entries, index: pick(jumps, choice) };
    return {
      label: `jumps through the browser's history to ${currentPath(history)}`,
      message: changedUrl(currentPath(history)),
      history,
      urlChanges: [],
      replies: walk.replies,
    };
  }
  const failed = failedTrackIds(walk.model);
  if (roll < 34 && listsTracks(walk.model) && Array.isReadonlyArrayNonEmpty(failed)) {
    const from: PlayOrigin = walk.model.route._tag === "Search" ? "Search" : "New";
    return {
      label: "presses Song details again on the row that failed",
      message: choseFromRow(from, pick(failed, choice), "OpenSong"),
      ...unchanged,
    };
  }
  if (roll < 45 && listsTracks(walk.model)) {
    return clicks(pick(TRACK_PATHS, choice));
  }
  if (roll < 60 && walk.model.route._tag === "Track") {
    // The page's own way back: a button when the app knows of a page behind, else a link Home.
    return Option.isSome(wayBack(walk.model))
      ? { label: "clicks the page's Back", message: Message.ClickedBack(), ...unchanged }
      : clicks("/");
  }
  if (roll < 75 && walk.model.route._tag === "Search") {
    const text = pick(FIELD_TEXTS, choice);
    return {
      label: `types "${text}"`,
      message: Message.UpdatedSearchField({ value: text }),
      ...unchanged,
    };
  }
  if (roll < 85 && showsTryAgain(walk.model)) {
    return { label: "clicks Try again", message: Message.ClickedTryAgain(), ...unchanged };
  }
  return clicks(pick(LINKS, choice));
};

/**
 * One thing happens. A URL change the browser has made reaches the app before
 * anything else can; otherwise a reply or a pause arrives, in any order, or
 * the listener acts.
 */
const happening = (walk: Walk, seed: number): Happening => {
  if (Array.isReadonlyArrayNonEmpty(walk.urlChanges)) {
    return {
      label: `the URL changes: ${JSON.stringify(Array.headNonEmpty(walk.urlChanges))}`,
      message: Array.headNonEmpty(walk.urlChanges),
      history: walk.history,
      urlChanges: Array.tailNonEmpty(walk.urlChanges),
      replies: walk.replies,
    };
  }
  if (seed % 100 < 40 && Array.isReadonlyArrayNonEmpty(walk.replies)) {
    const index = nextSeed(seed) % walk.replies.length;
    return {
      label: `arrives: ${JSON.stringify(pick(walk.replies, index))}`,
      message: pick(walk.replies, index),
      history: walk.history,
      urlChanges: walk.urlChanges,
      replies: Array.remove(walk.replies, index),
    };
  }
  return acting(walk, nextSeed(nextSeed(seed)));
};

const step = (walk: Walk): Walk => {
  const seed = nextSeed(walk.seed);
  const happened = happening(walk, seed);
  const outcome = update(walk.model, happened.message);
  const commands = outcome.commands ?? [];
  const trace = Array.appendAll(Array.append(walk.trace, happened.label), [
    ...Array.filterMap(commands, ({ name, args }) =>
      name === "NavigateInternal" && hasUrl(args)
        ? Result.succeed(`pushes ${args.url}`)
        : Result.failVoid,
    ),
    ...Array.filterMap(commands, ({ name, args }) =>
      name === "ReplaceTrackUrl" && hasTrackId(args)
        ? Result.succeed(`rewrites the entry for ${trackPath(args.trackId)}`)
        : Result.failVoid,
    ),
  ]);

  // Commands that move the history do so at once, in the order they were issued.
  const moved = Array.reduce(
    commands,
    { history: happened.history, urlChanges: happened.urlChanges, violations: Array.empty<string>() },
    (soFar, command) =>
      Option.match(moveHistory(soFar.history, command), {
        onNone: () => soFar,
        onSome: (move) => ({
          history: move.history,
          urlChanges:
            move.history === soFar.history
              ? soFar.urlChanges
              : Array.append(soFar.urlChanges, changedUrl(currentPath(move.history))),
          violations: Array.appendAll(soFar.violations, move.violations),
        }),
      }),
  );
  const sent = [
    ...Array.getSomes(
      Array.map(commands, (command, index) => replyTo(command, fateOf(nextSeed(seed + index)))),
    ),
    ...Array.flatMap(commands, (command, index) =>
      engineAnswers(command, nextSeed(nextSeed(seed + index))),
    ),
  ];
  const soundingSaidFor = Option.match(reportOf(happened.message), {
    onNone: () => walk.soundingSaidFor,
    onSome: (report) =>
      report.phase === "Sounding"
        ? Array.append(walk.soundingSaidFor, report.order)
        : walk.soundingSaidFor,
  });
  const isSettled = Array.isReadonlyArrayEmpty(moved.urlChanges);

  return {
    model: outcome.model,
    history: moved.history,
    urlChanges: moved.urlChanges,
    replies: Array.appendAll(happened.replies, sent),
    soundingSaidFor,
    seed: nextSeed(nextSeed(seed)),
    trace,
    violations: Array.appendAll(
      walk.violations,
      Array.map(
        [
          ...broken(outcome.model),
          ...mistaken(outcome.model, soundingSaidFor),
          ...overstepping(walk.model, happened.message, outcome.model, commands),
          ...trespassing(outcome.model, commands),
          ...moved.violations,
          ...(isSettled ? astray(outcome.model, moved.history) : []),
        ],
        (rule) => `${rule}\n  after: ${trace.join("\n         ")}`,
      ),
    ),
  };
};

const walkFrom = (seed: number): Walk => {
  const path = pick(PATHS, seed);
  const opening = init(url(path));
  const history = { entries: [path], index: 0 };
  const start: Walk = {
    model: opening.model,
    history,
    urlChanges: [],
    replies: Array.getSomes(
      Array.map(opening.commands ?? [], (command) => replyTo(command, "Answered")),
    ),
    soundingSaidFor: [],
    seed,
    trace: [`opens ${path}`],
    violations: [...broken(opening.model), ...astray(opening.model, history)],
  };
  return Array.reduce(Array.makeBy(STEPS_PER_WALK, () => step), start, (walk, advance) =>
    advance(walk),
  );
};

const walks = Array.map(Array.makeBy(WALKS, (index) => index + 1), walkFrom);

test("no sequence of navigating, opening tracks, playing, going back, typing and late replies breaks the rules", () => {
  const violations = Array.flatMap(walks, (walk) => Array.take(walk.violations, 1));

  expect(Array.take(violations, 3)).toEqual([]);
});

test("the walks do reach what they are meant to try", () => {
  const traces = Array.map(walks, (walk) => walk.trace.join("\n"));
  const reaching = (what: string): number =>
    Array.filter(traces, (trace) => trace.includes(what)).length;

  // A rule nobody walked into was not checked: these are the moves the rules above are about.
  expect(reaching("clicks link /track/")).toBeGreaterThan(WALKS / 10);
  expect(reaching("clicks the page's Back")).toBeGreaterThan(WALKS / 50);
  expect(reaching("presses the browser's Back")).toBeGreaterThan(WALKS / 10);
  expect(reaching("presses the browser's Forward")).toBeGreaterThan(WALKS / 20);
  expect(reaching("jumps through the browser's history")).toBeGreaterThan(WALKS / 50);
  expect(reaching("SucceededTrackDetail")).toBeGreaterThan(WALKS / 10);
  expect(reaching("TrackNotFound")).toBeGreaterThan(WALKS / 50);
  expect(reaching("types")).toBeGreaterThan(WALKS / 10);
  expect(reaching("clicks Try again")).toBeGreaterThan(WALKS / 50);
  // NOTE: fewer than a hundredth of the walks. The figure it had counted the
  // album's retry with it, whose name began with this one's.
  expect(reaching("presses Song details again on the row that failed")).toBeGreaterThan(WALKS / 300);
  expect(reaching("FailedTrackDetail")).toBeGreaterThan(WALKS / 20);
  // Pages chosen by a link did take the screen, and the URL with them.
  expect(reaching("pushes /track/")).toBeGreaterThan(WALKS / 20);
  expect(reaching("pushes /new")).toBeGreaterThan(WALKS / 10);
  // Albums: asked from a row and from a tile, found, failed, missing, played from and left.
  expect(reaching("chooses Go to album on a row")).toBeGreaterThan(WALKS / 20);
  expect(reaching("clicks link /album/")).toBeGreaterThan(WALKS / 20);
  expect(reaching("SucceededAlbumDetail")).toBeGreaterThan(WALKS / 20);
  expect(reaching("AlbumNotFound")).toBeGreaterThan(WALKS / 50);
  expect(reaching("FailedAlbumDetail")).toBeGreaterThan(WALKS / 20);
  expect(reaching("pushes /album/")).toBeGreaterThan(WALKS / 20);
  expect(reaching("presses Go to album again on the row that failed")).toBeGreaterThan(WALKS / 200);
  expect(reaching("taps a row of the album to play")).toBeGreaterThan(WALKS / 100);
  expect(reaching("chooses Song details on a row of the album")).toBeGreaterThan(WALKS / 100);
  expect(reaching("clicks the album page's Back")).toBeGreaterThan(WALKS / 100);
  // Artists and playlists: chosen from a tile, found, failed, missing, played from, gone on from
  // to an album or a song, and left.
  expect(reaching("clicks link /artist/")).toBeGreaterThan(WALKS / 20);
  expect(reaching("SucceededArtistDetail")).toBeGreaterThan(WALKS / 20);
  expect(reaching("ArtistNotFound")).toBeGreaterThan(WALKS / 50);
  expect(reaching("FailedArtistDetail")).toBeGreaterThan(WALKS / 20);
  expect(reaching("pushes /artist/")).toBeGreaterThan(WALKS / 100);
  expect(reaching("taps a row of the artist to play")).toBeGreaterThan(WALKS / 100);
  expect(reaching("chooses Go to album on a row of the artist")).toBeGreaterThan(WALKS / 100);
  expect(reaching("clicks the artist page's Back")).toBeGreaterThan(WALKS / 200);
  expect(reaching("clicks link /playlist/")).toBeGreaterThan(WALKS / 20);
  expect(reaching("SucceededPlaylistDetail")).toBeGreaterThan(WALKS / 20);
  expect(reaching("PlaylistNotFound")).toBeGreaterThan(WALKS / 50);
  expect(reaching("FailedPlaylistDetail")).toBeGreaterThan(WALKS / 20);
  expect(reaching("pushes /playlist/")).toBeGreaterThan(WALKS / 100);
  expect(reaching("taps a row of the playlist to play")).toBeGreaterThan(WALKS / 100);
  expect(reaching("chooses Go to album on a row of the playlist")).toBeGreaterThan(WALKS / 100);
  expect(reaching("chooses Song details on a row of the playlist")).toBeGreaterThan(WALKS / 100);
  expect(reaching("clicks the playlist page's Back")).toBeGreaterThan(WALKS / 200);
  // Genres and Radio: chosen from the menu, found and failed; and the genres and stations their
  // tiles lead to: found, failed, missing, played from, gone on from to an album or a song, and left.
  expect(reaching("clicks link /genres")).toBeGreaterThan(WALKS / 20);
  expect(reaching("clicks link /radio")).toBeGreaterThan(WALKS / 20);
  expect(reaching("SucceededGenreList")).toBeGreaterThan(WALKS / 20);
  expect(reaching("FailedGenreList")).toBeGreaterThan(WALKS / 50);
  expect(reaching("SucceededStationList")).toBeGreaterThan(WALKS / 20);
  expect(reaching("FailedStationList")).toBeGreaterThan(WALKS / 50);
  expect(reaching("pushes /genres")).toBeGreaterThan(WALKS / 50);
  expect(reaching("pushes /radio")).toBeGreaterThan(WALKS / 50);
  expect(reaching("clicks link /genre/")).toBeGreaterThan(WALKS / 50);
  expect(reaching("SucceededGenreDetail")).toBeGreaterThan(WALKS / 100);
  expect(reaching("GenreNotFound")).toBeGreaterThan(WALKS / 100);
  expect(reaching("FailedGenreDetail")).toBeGreaterThan(WALKS / 100);
  expect(reaching("pushes /genre/")).toBeGreaterThan(WALKS / 100);
  expect(reaching("taps a row of the genre to play")).toBeGreaterThan(WALKS / 300);
  expect(reaching("chooses Go to album on a row of the genre")).toBeGreaterThan(WALKS / 300);
  expect(reaching("clicks the genre page's Back")).toBeGreaterThan(WALKS / 200);
  expect(reaching("clicks link /station/")).toBeGreaterThan(WALKS / 50);
  expect(reaching("SucceededStationDetail")).toBeGreaterThan(WALKS / 100);
  expect(reaching("StationNotFound")).toBeGreaterThan(WALKS / 100);
  expect(reaching("FailedStationDetail")).toBeGreaterThan(WALKS / 100);
  expect(reaching("pushes /station/")).toBeGreaterThan(WALKS / 100);
  expect(reaching("taps a row of the station to play")).toBeGreaterThan(WALKS / 300);
  expect(reaching("chooses Go to album on a row of the station")).toBeGreaterThan(WALKS / 300);
  expect(reaching("chooses Song details on a row of the station")).toBeGreaterThan(WALKS / 300);
  expect(reaching("clicks the station page's Back")).toBeGreaterThan(WALKS / 200);
  // A request nobody answered: the Command's timeout, reported as a lost reply.
  expect(reaching('"failure":{"_tag":"Unknown"}')).toBeGreaterThan(WALKS / 10);
  // Playing, and everything an engine can answer with, while all of the above goes on.
  expect(reaching("taps a row to play")).toBeGreaterThan(WALKS / 10);
  expect(reaching("presses Play on the track's page")).toBeGreaterThan(WALKS / 50);
  expect(reaching("presses the player's ClickedPause")).toBeGreaterThan(WALKS / 50);
  expect(reaching("presses the player's ClickedNext")).toBeGreaterThan(WALKS / 100);
  expect(reaching("presses the player's ClickedPrevious")).toBeGreaterThan(WALKS / 100);
  expect(reaching('"phase":"Sounding"')).toBeGreaterThan(WALKS / 10);
  expect(reaching('"phase":"Ended"')).toBeGreaterThan(WALKS / 50);
  expect(reaching('"phase":"Failed"')).toBeGreaterThan(WALKS / 50);
  expect(reaching('"outcome":"Refused"')).toBeGreaterThan(WALKS / 100);
  expect(reaching("SucceededRefreshSource")).toBeGreaterThan(WALKS / 200);
  expect(reaching("FailedRefreshSource")).toBeGreaterThan(WALKS / 200);
  // The player expanded: opened from the island, and going on to another track while open.
  expect(reaching("presses the island to open the player")).toBeGreaterThan(WALKS / 20);
  expect(reaching("rewrites the entry for /track/")).toBeGreaterThan(WALKS / 100);

  // And the walks end in every state the player has a look for.
  const endings = (tag: Player.Playback["_tag"]): number =>
    Array.filter(walks, (walk) =>
      Option.exists(playbackOf(walk.model), (playback) => playback._tag === tag),
    ).length;
  expect(endings("Sounding")).toBeGreaterThan(0);
  expect(endings("Acknowledged")).toBeGreaterThan(0);
  expect(endings("Starting")).toBeGreaterThan(0);
  expect(endings("Waiting")).toBeGreaterThan(0);
  expect(endings("Paused")).toBeGreaterThan(0);
  expect(endings("Stopped")).toBeGreaterThan(0);
  expect(endings("Failed")).toBeGreaterThan(0);
});

test("taps that never receive a reply leave the history exactly as it was", () => {
  // The same walk from New, taken twice: every reply arrives, and none does.
  const tapping = (model: Model, path: string) => update(model, clickedLink(path));
  const start = Array.reduce(
    [arrived(reply.newMusic("page:0"))],
    init(url("/new")).model,
    (model, message) => update(model, message).model,
  );
  const taps = Array.makeBy(40, (index) => pick(TRACK_PATHS, nextSeed(index)));
  const unanswered = Array.reduce(taps, { model: start, asked: 0 }, (soFar, path) => {
    const outcome = tapping(soFar.model, path);
    return {
      model: outcome.model,
      asked:
        soFar.asked +
        Array.filter(outcome.commands ?? [], (command) =>
          Option.isSome(moveHistory({ entries: ["/new"], index: 0 }, command)),
        ).length,
    };
  });

  expect(unanswered.asked).toBe(0);
  expect(unanswered.model.route).toEqual(start.route);
  expect(addressOf(unanswered.model)).toEqual(start.route);
  expect(unanswered.model.trail).toEqual(start.trail);
  expect(Awaiting.guards.Intention(unanswered.model.awaiting)).toBe(true);
});
