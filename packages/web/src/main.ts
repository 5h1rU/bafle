import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import type { AlbumId } from "@bafle/domain/Catalog/Album";
import type { ArtistId } from "@bafle/domain/Catalog/Artist";
import type { Album } from "@bafle/domain/Catalog/FullAlbum";
import type { Artist } from "@bafle/domain/Catalog/FullArtist";
import type { Genre } from "@bafle/domain/Catalog/FullGenre";
import type { Playlist } from "@bafle/domain/Catalog/FullPlaylist";
import type { Station } from "@bafle/domain/Catalog/FullStation";
import type { GenreId } from "@bafle/domain/Catalog/Genre";
import type {
  FeaturedMusic,
  MusicGenres,
  RadioStations,
  TrendingMusic,
} from "@bafle/domain/Catalog/MusicCatalog.external";
import type { PlaylistId } from "@bafle/domain/Catalog/Playlist";
import type { StationId } from "@bafle/domain/Catalog/Station";
import type { Track, TrackId, TrackSummary } from "@bafle/domain/Catalog/Track";
import * as Array from "effect/Array";
import { identity, pipe } from "effect/Function";
import * as HashMap from "effect/HashMap";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as String from "effect/String";
import { Menu } from "@foldkit/ui";
import { AsyncData, type Runtime, Update } from "foldkit";
import { UrlRequest } from "foldkit/navigation";
import { modifyFields } from "foldkit/struct";
import type { Url } from "foldkit/url";
import {
  Catalog,
  type CatalogClient,
  type LoadError,
  toAlbumOutcome,
  toArtistOutcome,
  toGenreOutcome,
  toLoadError,
  toPlaylistOutcome,
  toStationOutcome,
  toTrackOutcome,
} from "./catalog.ts";
import {
  askAlbumDetail,
  askArtistDetail,
  askCatalogSearch,
  askGenreDetail,
  askGenreList,
  askHomeFeed,
  askNewMusic,
  askPlaylistDetail,
  askStationDetail,
  askStationList,
  askTrackDetail,
  FocusAlbumTile,
  FocusArtistTile,
  FocusGenreTile,
  FocusNavigation,
  FocusPage,
  FocusPlaylistTile,
  FocusSearchField,
  FocusStationTile,
  FocusTrackRow,
  LoadExternal,
  NavigateBack,
  NavigateInternal,
  ReplaceSearchTerm,
  ReplaceTrackUrl,
  type Request,
  ScrollPageToTop,
  WaitForTypingPause,
  WaitToClearRowDone,
} from "./command.ts";
import { Message, type InputMethod, type PlayOrigin } from "./message.ts";
import {
  addressOf,
  albumData,
  artistData,
  Awaiting,
  canShow,
  type Entrance,
  genreData,
  maybeAlbumIdInDocument,
  maybeArtistIdInDocument,
  maybeGenreIdInDocument,
  maybeHeadedFor,
  maybePlaylistIdInDocument,
  maybeStationIdInDocument,
  isKnownMissing,
  isLoaded,
  initialPlayerSheet,
  isPlayerExpanded,
  isPlayersPage,
  isPlayersTrack,
  Model,
  type Navigation,
  playlistData,
  type SearchAnswer,
  stationData,
  trackData,
  wayBackOn,
} from "./model.ts";
import type { AudioEngine } from "./player/audioEngine.ts";
import * as Player from "./player/index.ts";
import * as Sheet from "./sheet/index.ts";
import {
  AppRoute,
  isSamePage,
  isSameRoute,
  routeToUrl,
  searchedTerm,
  urlToAppRoute,
} from "./route.ts";
import { type RowAction, RowMenu, type RowRef, rowMenuId, rowMenuIn } from "./rowMenu.ts";
import type { Screen } from "./screen.ts";
import { CHOOSE_TRACK, coverTransitionName, routeArtwork } from "./view/artwork.ts";
import { pageIdOf } from "./view/layout.ts";

/** What the app's Commands and Subscriptions need from the runtime. */
export type Services = CatalogClient | AudioEngine;

type UpdateReturn = Update.Return<Model, Message, Services>;
type Step = Update.Step<Model, Message, Services>;

// PAGE DATA

type PageData<A> = AsyncData.AsyncData<A, LoadError>;

/** Where one page keeps what the catalog told it. */
type Page<A> = Readonly<{
  read: (model: Model) => PageData<A>;
  write: (model: Model, next: PageData<A>) => Model;
}>;

const homePage: Page<FeaturedMusic> = {
  read: (model) => model.home,
  write: (model, nextHome) => modifyFields(model, { home: () => nextHome }),
};

const newMusicPage: Page<TrendingMusic> = {
  read: (model) => model.newMusic,
  write: (model, nextNewMusic) => modifyFields(model, { newMusic: () => nextNewMusic }),
};

const genreListPage: Page<MusicGenres> = {
  read: (model) => model.genreList,
  write: (model, nextGenreList) => modifyFields(model, { genreList: () => nextGenreList }),
};

const stationListPage: Page<RadioStations> = {
  read: (model) => model.stationList,
  write: (model, nextStationList) =>
    modifyFields(model, { stationList: () => nextStationList }),
};

const searchPage: Page<SearchAnswer> = {
  read: (model) => model.search,
  write: (model, nextSearch) => modifyFields(model, { search: () => nextSearch }),
};

/** What one of many pages of a kind holds, under its id. Nothing held is no entry. */
const heldUnder =
  <Id, A>(id: Id, next: PageData<A>) =>
  (held: HashMap.HashMap<Id, PageData<A>>): HashMap.HashMap<Id, PageData<A>> =>
    AsyncData.isIdle(next) ? HashMap.remove(held, id) : HashMap.set(held, id, next);

/** A track's page keeps what the catalog told it under the track's id. */
const trackPage = (trackId: TrackId): Page<Option.Option<Track>> => ({
  read: (model) => trackData(model, trackId),
  write: (model, nextTrack) => modifyFields(model, { tracks: heldUnder(trackId, nextTrack) }),
});

/** An album's page keeps what the catalog told it under the album's id. */
const albumPage = (albumId: AlbumId): Page<Option.Option<Album>> => ({
  read: (model) => albumData(model, albumId),
  write: (model, nextAlbum) => modifyFields(model, { albums: heldUnder(albumId, nextAlbum) }),
});

/** An artist's page keeps what the catalog told it under the artist's id. */
const artistPage = (artistId: ArtistId): Page<Option.Option<Artist>> => ({
  read: (model) => artistData(model, artistId),
  write: (model, nextArtist) =>
    modifyFields(model, { artists: heldUnder(artistId, nextArtist) }),
});

/** A playlist's page keeps what the catalog told it under the playlist's id. */
const playlistPage = (playlistId: PlaylistId): Page<Option.Option<Playlist>> => ({
  read: (model) => playlistData(model, playlistId),
  write: (model, nextPlaylist) =>
    modifyFields(model, { playlists: heldUnder(playlistId, nextPlaylist) }),
});

/** A genre's page keeps what the catalog told it under the genre's id. */
const genrePage = (genreId: GenreId): Page<Option.Option<Genre>> => ({
  read: (model) => genreData(model, genreId),
  write: (model, nextGenre) => modifyFields(model, { genres: heldUnder(genreId, nextGenre) }),
});

/** A station's page keeps what the catalog told it under the station's id. */
const stationPage = (stationId: StationId): Page<Option.Option<Station>> => ({
  read: (model) => stationData(model, stationId),
  write: (model, nextStation) =>
    modifyFields(model, { stations: heldUnder(stationId, nextStation) }),
});

/** Loading for the first time, or again over what is already held. */
const markPending = <A>(data: PageData<A>): PageData<A> =>
  Option.getOrElse(AsyncData.revalidateOrLoad(data), () => data);

/** Stop waiting for a reply that was abandoned: what the page held, it still holds. */
const standDown = <A>(data: PageData<A>): PageData<A> =>
  AsyncData.match(data, {
    onIdle: () => data,
    onLoading: () => AsyncData.Idle(),
    onRefreshing: (held) => AsyncData.Success({ data: held }),
    onFailure: () => data,
    onStale: () => data,
    onSuccess: () => data,
  });

const forgetAnswer = (model: Model): Model => searchPage.write(model, AsyncData.Idle());

/** The answer the page holds is one more the app has seen: it is kept under its term. */
const rememberAnswer = (model: Model): Model =>
  Option.match(AsyncData.getData(model.search), {
    onNone: () => model,
    onSome: ({ term, results }) =>
      Option.contains(HashMap.get(model.searched, term), results)
        ? model
        : modifyFields(model, { searched: HashMap.set(term, results) }),
  });

/**
 * Put on the page what an earlier search for this term found, if there was
 * one. The page then has that list to show at once, as the listener left
 * it, and what the catalog says now replaces it when it comes.
 */
const recallAnswerFor =
  (term: string) =>
  (model: Model): Option.Option<Model> =>
    Option.map(HashMap.get(model.searched, term), (results) =>
      searchPage.write(model, AsyncData.Success({ data: { term, results } })),
    );

/** The catalog has the track or the album, and the app holds it. */
const isHeld = <A>(data: PageData<Option.Option<A>>): boolean =>
  Option.exists(AsyncData.getData(data), Option.isSome);

// UPDATE

/** What a request is awaited as: how its reply will be recognised, and what it is for. */
type Expecting = (requestId: string) => Awaiting;

const forTheScreen: Expecting = (requestId) => Awaiting.Reply({ requestId });

const forIntention =
  (route: AppRoute, input: InputMethod): Expecting =>
  (requestId) =>
    Awaiting.Intention({ requestId, route, ...(input === "Keyboard" && { viaKeyboard: true }) });

const forArrival =
  (route: AppRoute, entrance: Entrance, input: InputMethod): Expecting =>
  (requestId) =>
    Awaiting.Arrival({ requestId, route, entrance, ...(input === "Keyboard" && { viaKeyboard: true }) });

const maybeAwaitedRequestId = (awaiting: Awaiting): Option.Option<string> =>
  Awaiting.match(awaiting, {
    Nothing: () => Option.none(),
    TypingPause: () => Option.none(),
    Reply: ({ requestId }) => Option.some(requestId),
    Intention: ({ requestId }) => Option.some(requestId),
    Arrival: ({ requestId }) => Option.some(requestId),
  });

const isAwaitingPause = (awaiting: Awaiting, pauseId: string): boolean =>
  Awaiting.matchOrElse(
    awaiting,
    { TypingPause: (pause) => pause.pauseId === pauseId },
    () => false,
  );

/** The page a reply is about: the one the app is heading for, else the one on screen. */
const awaitedRoute = (model: Model): AppRoute => Option.getOrElse(maybeHeadedFor(model), () => model.route);

/** Search opens with its field focused, ready to be typed into. */
const focusSearchFieldOnSearch: Step = (model) =>
  model.route._tag === "Search" ? { model, commands: [FocusSearchField()] } : { model };

/** The sections: the pages the navigation leads to. */
const isSection = (route: AppRoute): boolean =>
  route._tag === "Home" ||
  route._tag === "New" ||
  route._tag === "Genres" ||
  route._tag === "Radio" ||
  route._tag === "Search";

/**
 * The pages an album is opened from: a section, an artist's page, a
 * playlist's, a genre's, a station's. Each has rows whose menu asks for an
 * album, or a shelf of them.
 */
const leadsToAlbums = (route: AppRoute): boolean =>
  isSection(route) ||
  route._tag === "Artist" ||
  route._tag === "Playlist" ||
  route._tag === "Genre" ||
  route._tag === "Station";

/** The pages an artist or a playlist is opened from: a section, or a genre's page. Each shelves them. */
const leadsToArtistsAndPlaylists = (route: AppRoute): boolean =>
  isSection(route) || route._tag === "Genre";

/**
 * What takes the focus when another page takes the screen. Back from a track
 * it is the row that opened it, so the list is as the listener left it, down
 * to where the keyboard was. Back from an album it is what opened the album:
 * the row whose menu it was asked from, else its tile on a shelf. Back from
 * an artist or a playlist it is the tile, the only way to either, and so it
 * is back from a genre, on Genres, and from a station, on Radio. A track's
 * page takes it itself, and so does an album's, an artist's, a playlist's, a
 * genre's and a station's: what held it is now behind the page. Search gives
 * it to its field.
 */
const focusOn = (model: Model, entered: AppRoute, entrance: Entrance) => {
  const left = model.route;
  const pageId = pageIdOf(entered);
  if (entrance === "Returning" && left._tag === "Track" && entered._tag !== "Track") {
    return [FocusTrackRow({ pageId, trackId: left.trackId })];
  }
  if (entrance === "Returning" && left._tag === "Album" && leadsToAlbums(entered)) {
    return Option.match(HashMap.get(model.albumRows, left.albumId), {
      onNone: () => [FocusAlbumTile({ pageId, albumId: left.albumId })],
      onSome: (row) => [FocusTrackRow({ pageId, trackId: row.trackId })],
    });
  }
  if (entrance === "Returning" && left._tag === "Artist" && leadsToArtistsAndPlaylists(entered)) {
    return [FocusArtistTile({ pageId, artistId: left.artistId })];
  }
  if (
    entrance === "Returning" &&
    left._tag === "Playlist" &&
    leadsToArtistsAndPlaylists(entered)
  ) {
    return [FocusPlaylistTile({ pageId, playlistId: left.playlistId })];
  }
  if (entrance === "Returning" && left._tag === "Genre" && entered._tag === "Genres") {
    return [FocusGenreTile({ pageId, genreId: left.genreId })];
  }
  if (entrance === "Returning" && left._tag === "Station" && entered._tag === "Radio") {
    return [FocusStationTile({ pageId, stationId: left.stationId })];
  }
  return AppRoute.matchOrElse(
    entered,
    {
      Search: () => [FocusSearchField()],
      Track: () => [FocusPage({ pageId })],
      Album: () => [FocusPage({ pageId })],
      Artist: () => [FocusPage({ pageId })],
      Playlist: () => [FocusPage({ pageId })],
      Genre: () => [FocusPage({ pageId })],
      Station: () => [FocusPage({ pageId })],
    },
    () => [],
  );
};

/** Send a query and await its reply. Any earlier request stops being the one awaited. */
const send = (model: Model, ask: Request, expecting: Expecting): UpdateReturn => {
  const allocation = DomainFoldkit.next(model.requestIds);
  return {
    model: modifyFields(model, {
      requestIds: () => allocation.commandIds,
      awaiting: () => expecting(allocation.commandId),
    }),
    commands: [ask(allocation.commandId)],
  };
};

/** Load a page for the first time, or refresh it over what it holds. */
const requestPage = <A>(
  model: Model,
  page: Page<A>,
  ask: Request,
  expecting: Expecting,
): UpdateReturn =>
  send(page.write(model, markPending(page.read(model))), ask, expecting);

/** Ask the catalog for what a route shows. */
const load =
  (route: AppRoute, expecting: Expecting): Step =>
  (model) =>
    AppRoute.match<UpdateReturn>(route, {
      Home: () => requestPage(model, homePage, askHomeFeed, expecting),
      New: () => requestPage(model, newMusicPage, askNewMusic, expecting),
      Genres: () => requestPage(model, genreListPage, askGenreList, expecting),
      Radio: () => requestPage(model, stationListPage, askStationList, expecting),
      Search: () =>
        Option.match(searchedTerm(route), {
          onNone: () => ({ model }),
          onSome: (term) => requestPage(model, searchPage, askCatalogSearch(term), expecting),
        }),
      Track: ({ trackId }) => {
        const page = trackPage(trackId);
        return isKnownMissing(page.read(model))
          ? { model }
          : requestPage(model, page, askTrackDetail(trackId), expecting);
      },
      Album: ({ albumId }) => {
        const page = albumPage(albumId);
        return isKnownMissing(page.read(model))
          ? { model }
          : requestPage(model, page, askAlbumDetail(albumId), expecting);
      },
      Artist: ({ artistId }) => {
        const page = artistPage(artistId);
        return isKnownMissing(page.read(model))
          ? { model }
          : requestPage(model, page, askArtistDetail(artistId), expecting);
      },
      Playlist: ({ playlistId }) => {
        const page = playlistPage(playlistId);
        return isKnownMissing(page.read(model))
          ? { model }
          : requestPage(model, page, askPlaylistDetail(playlistId), expecting);
      },
      Genre: ({ genreId }) => {
        const page = genrePage(genreId);
        return isKnownMissing(page.read(model))
          ? { model }
          : requestPage(model, page, askGenreDetail(genreId), expecting);
      },
      // NOTE: a station is not asked for again once its songs are held. A
      // catalog deals a station's songs afresh each time it is asked, so the
      // refresh every other page gets behind its screen would put another
      // list under the listener: the row they played would be gone, and Back
      // to the station would not find it as it was left (navigation rule 9).
      Station: ({ stationId }) => {
        const page = stationPage(stationId);
        return isKnownMissing(page.read(model)) || isHeld(page.read(model))
          ? { model }
          : requestPage(model, page, askStationDetail(stationId), expecting);
      },
      NotFound: () => ({ model }),
    });

/** Keep the results on screen, marked as out of date, and ask once the typing pauses. */
const waitForTypingPause: Step = (model) => {
  const allocation = DomainFoldkit.next(model.requestIds);
  return {
    model: modifyFields(model, {
      requestIds: () => allocation.commandIds,
      awaiting: () => Awaiting.TypingPause({ pauseId: allocation.commandId }),
      search: markPending,
    }),
    commands: [WaitForTypingPause({ pauseId: allocation.commandId })],
  };
};

/**
 * Search is already on screen, so its URL changed because the listener
 * typed: it waits for a pause instead of asking on every letter. A blank
 * field asks nothing and goes back to the prompt.
 */
// NOTE: a term searched for before shows what was found for it at once,
// whether the listener typed it again or went Back to it within Search. The
// catalog is still asked only after the pause, so typing through terms
// already seen asks no more than typing through new ones.
const followTyping: Step = (model) =>
  Option.match(searchedTerm(model.route), {
    onNone: () => ({ model: forgetAnswer(model) }),
    onSome: (term) => waitForTypingPause(Option.getOrElse(recallAnswerFor(term)(model), () => model)),
  });

/**
 * A search reached from another page starts from an answer for its own term:
 * the one on hand, or the one an earlier search for that term found. Any
 * other answer is for something else, and is taken off the page.
 */
const keepAnswerOnlyFor =
  (route: AppRoute) =>
  (model: Model): Model =>
    route._tag !== "Search"
      ? model
      : Option.match(searchedTerm(route), {
          onNone: () => forgetAnswer(model),
          onSome: (term) =>
            isLoaded(model, route)
              ? model
              : Option.getOrElse(recallAnswerFor(term)(model), () => forgetAnswer(model)),
        });

/**
 * Whether a page can take the screen without a wait: the Model holds what it
 * shows, or the screen only holds placeholders, which is nothing worth
 * holding. The page of the track the player holds is a third case, on a
 * compact screen: it is the player expanded, drawn from what the queue
 * already holds, so it takes the screen at once and what the catalog adds
 * fills in place.
 */
const needsNoWait = (model: Model, route: AppRoute): boolean =>
  isLoaded(model, route) || !canShow(model, model.route) || isPlayersPage(model, route);

/**
 * Stop waiting for every track, or every album, artist, playlist, genre or
 * station: at most one was being asked for, and only it changes.
 */
const standDownEach = <Id, A>(
  held: HashMap.HashMap<Id, PageData<A>>,
): HashMap.HashMap<Id, PageData<A>> =>
  pipe(
    held,
    HashMap.map((data) => standDown(data)),
    HashMap.filter((data) => !AsyncData.isIdle(data)),
  );

/**
 * The listener did something else, so whatever was awaited is abandoned
 * without a trace: its page goes back to what it held, a row that was
 * loading is a plain row again, and its reply, if it still comes, matches
 * nothing.
 */
const abandon = (model: Model): Model =>
  modifyFields(model, {
    awaiting: () => Awaiting.Nothing(),
    home: standDown,
    newMusic: standDown,
    genreList: standDown,
    stationList: standDown,
    search: standDown,
    tracks: standDownEach,
    albums: standDownEach,
    artists: standDownEach,
    playlists: standDownEach,
    genres: standDownEach,
    stations: standDownEach,
  });

const withNavigation =
  (navigation: Navigation) =>
  (model: Model): Model =>
    model.navigation === navigation ? model : modifyFields(model, { navigation: () => navigation });

/**
 * How the navigation stands as a page takes the screen. A section the
 * listener chose shows it whole: they have just used it, and the page starts
 * at its top. A page they went back to finds it as they left it, and a
 * track's page leaves it alone, so that closing the track puts everything
 * back where it was.
 */
const navigationOnEntering =
  (route: AppRoute, entrance: Entrance) =>
  (model: Model): Model =>
    entrance === "Arriving" && isSection(route) ? withNavigation("Open")(model) : model;

/**
 * No row's menu is open any more. One may be when a page takes the screen:
 * a menu a page was chosen from stays open until the page arrives. It goes
 * with the page it was on, so there is nothing to give the focus back to.
 */
const withRowMenusClosed = (model: Model): Model =>
  HashMap.isEmpty(model.rowMenus) ? model : modifyFields(model, { rowMenus: () => HashMap.empty() });

/**
 * The player that takes the screen finds its sheet as a sheet is before the
 * document has said anything of it: what was said of the last one, that it
 * was swiped away, is not true of this one.
 */
// NOTE: this is done as the player opens and not as it closes. What the
// sheet said last is what tells a player that was swiped away from one that
// was closed (see `viewTransition`), and it has to outlive the close to do so.
const withPlayerSheetAnew = (model: Model): Model =>
  !isPlayerExpanded(model) || model.playerSheet === initialPlayerSheet
    ? model
    : modifyFields(model, { playerSheet: () => initialPlayerSheet });

/** A page takes the screen. The focus follows, unless the screen only moved within the page. */
const showPage =
  (route: AppRoute, entrance: Entrance): Step =>
  (model) => {
    const shown = modifyFields(model, { route: () => route });
    return isSamePage(model.route, route)
      ? { model: shown }
      : {
          model: navigationOnEntering(route, entrance)(withPlayerSheetAnew(withRowMenusClosed(shown))),
          commands: focusOn(model, route, entrance),
        };
  };

/** Ask the browser for a new history entry, and note it: its `ChangedUrl` is the app's own. */
const moveUrlTo =
  (route: AppRoute): Step =>
  (model) => ({
    model: modifyFields(model, { maybeAskedRoute: () => Option.some(route) }),
    commands: [NavigateInternal({ url: routeToUrl(route) })],
  });

/**
 * A page chosen by a link takes the screen, and only now does the URL move:
 * one new history entry, for a page that is shown. Behind it is the entry
 * the URL was at. The URL change this asks for comes back as a `ChangedUrl`
 * for the page already on screen, which changes nothing: see `arriveAt`.
 */
const commit =
  (route: AppRoute, behind: AppRoute): Step =>
  (model) =>
    Update.combine(modifyFields(model, { trail: Array.append(behind) }), [
      showPage(route, "Arriving"),
      moveUrlTo(route),
    ]);

/**
 * Whether a page chosen by a link can take the screen. A section does so
 * with its content or with its failure, since a navigation item has no room
 * to state one. A track does so only with the track itself: one that failed
 * to open, or that the catalog does not have, says so on its row. So does an
 * album asked from a row's menu. One chosen from a shelf is as a section is:
 * a tile has no room to state a failure either, so its page takes the screen
 * with what there is to say. An artist, a playlist, a genre and a station
 * are only ever chosen from a tile, so theirs always does.
 */
const canCommit = (model: Model, route: AppRoute): boolean =>
  AppRoute.matchOrElse(
    route,
    {
      Track: ({ trackId }) => isHeld(trackData(model, trackId)),
      Album: ({ albumId }) =>
        HashMap.has(model.albumRows, albumId)
          ? isHeld(albumData(model, albumId))
          : canShow(model, route),
    },
    () => canShow(model, route),
  );

/**
 * How the URL came to be a route's. The app only hears that it changed, so
 * it tells the cases apart by what it knows: the change it asked for itself,
 * and the page it left by a link to get where it was.
 */
type UrlChangeCause = "Asked" | "Back" | "Unplaced";

// NOTE: a jump through the browser's history menu onto a page the same as the
// nearest of the trail reads as Back: the URL is all the app is told. The
// trail then names pages that are not behind the current one.
const causeOfUrlChange = (model: Model, route: AppRoute): UrlChangeCause => {
  if (Option.exists(model.maybeAskedRoute, (asked) => isSameRoute(asked, route))) {
    return "Asked";
  }
  return Option.exists(Array.last(model.trail), (nearest) => isSameRoute(nearest, route))
    ? "Back"
    : "Unplaced";
};

type Trail = Model["trail"];

/**
 * Keep the trail true to the browser's history. The app's own changes need
 * nothing here: a page chosen by a link put the entry it left on the trail
 * as it took the screen, and typing in Search rewrites its own entry and
 * moves nothing. Going back to the nearest page of the trail takes it off.
 * Any other move, Forward or a jump, lands somewhere the app cannot place, so
 * it forgets the trail rather than trust it: a way back that leads nowhere
 * is worse than none.
 */
const retraceTrail = (cause: UrlChangeCause): ((trail: Trail) => Trail) =>
  Match.value(cause).pipe(
    Match.withReturnType<(trail: Trail) => Trail>(),
    Match.when("Asked", () => identity),
    Match.when("Back", () => Array.dropRight(1)),
    Match.when("Unplaced", () => () => []),
    Match.exhaustive,
  );

const retrace =
  (cause: UrlChangeCause) =>
  (model: Model): Model =>
    modifyFields(model, {
      maybeAskedRoute: () => Option.none(),
      trail: retraceTrail(cause),
    });

/**
 * The browser is already at a route: the URL moved first, so only the screen
 * can be held. A page the Model holds takes it at once and refreshes behind
 * it; any other holds the page on screen until its reply comes. Two cases do
 * not wait: a change within the page on screen (typing in Search), and a
 * screen that only holds placeholders, which is nothing worth holding.
 */
const enterByUrl =
  (route: AppRoute, entrance: Entrance): Step =>
  (model) => {
    if (isSamePage(route, model.route)) {
      return Update.combine(model, [
        showPage(route, entrance),
        route._tag === "Search" ? followTyping : load(route, forTheScreen),
      ]);
    }
    const prepared = keepAnswerOnlyFor(route)(model);
    return needsNoWait(prepared, route)
      ? Update.combine(prepared, [showPage(route, entrance), load(route, forTheScreen)])
      : load(route, forArrival(route, entrance, model.inputMethod))(prepared);
  };

/**
 * The browser says where the URL is. Where the app already takes it to be,
 * there is nothing to do: a page chosen by a link moved the URL as it took
 * the screen, and this is that change coming back. Anywhere else, the
 * listener went Back or Forward, or typed in Search, and whatever was awaited
 * belonged to another destination: it is abandoned.
 */
const arriveAt =
  (route: AppRoute): Step =>
  (model) => {
    const cause = causeOfUrlChange(model, route);
    const retraced = retrace(cause)(model);
    return isSameRoute(route, addressOf(model))
      ? { model: retraced }
      : enterByUrl(route, cause === "Back" ? "Returning" : "Arriving")(abandon(retraced));
  };

/**
 * The listener's next choice leaves the page on screen where it is, so the
 * URL has to be that page's again. It is not when a page reached by Back or
 * Forward was still loading: the page on screen, which the listener is acting
 * from, gets the entry after that one.
 */
const bringUrlToScreen =
  (abandoned: Awaiting): Step =>
  (model) =>
    Awaiting.matchOrElse<UpdateReturn>(
      abandoned,
      {
        Arrival: ({ route }) =>
          moveUrlTo(model.route)(modifyFields(model, { trail: Array.append(route) })),
      },
      () => ({ model }),
    );

/** Give up whatever was awaited, and stay on the page on screen. */
const returnToScreen: Step = (model) => bringUrlToScreen(model.awaiting)(abandon(model));

/**
 * The page on screen loads again where it stands, and the history is left
 * alone. Choosing it twice is still the latest choice, so a request already
 * out for it is abandoned for a new one.
 */
const reload: Step = (model) =>
  Update.combine(model, [
    returnToScreen,
    (stepModel) => load(stepModel.route, forTheScreen)(stepModel),
  ]);

/**
 * Head for a page chosen by a link. One the Model holds takes the screen at
 * once and refreshes behind it, and so does any page when the screen only
 * holds placeholders. Otherwise the intention is recorded and the query sent:
 * the page on screen stays, the URL stays, and the reply decides the rest.
 */
const headFor =
  (route: AppRoute): Step =>
  (model) => {
    const freed = keepAnswerOnlyFor(route)(abandon(model));
    return needsNoWait(freed, route)
      ? Update.combine(freed, [commit(route, addressOf(model)), load(route, forTheScreen)])
      : Update.combine(freed, [
          bringUrlToScreen(model.awaiting),
          load(route, forIntention(route, model.inputMethod)),
        ]);
  };

/**
 * A link asked for a route. The latest choice wins: whatever was awaited is
 * abandoned first. A track the catalog is known not to have is no longer
 * something to open, so asking for it changes nothing.
 */
const follow =
  (route: AppRoute): Step =>
  (model) => {
    if (
      route._tag === "Track" &&
      isKnownMissing(trackData(model, route.trackId)) &&
      !isPlayersTrack(model, route)
    ) {
      return { model };
    }
    return isSameRoute(route, model.route) ? reload(model) : headFor(route)(model);
  };

/** Choosing the page already on screen asks for its top, as a tab bar does. */
const scrollToTopWhenChosenAgain =
  (route: AppRoute): Step =>
  (model) =>
    isSameRoute(route, model.route)
      ? { model, commands: [ScrollPageToTop({ pageId: pageIdOf(route) })] }
      : { model };

const focusPage: Step = (model) => ({
  model,
  commands: [FocusPage({ pageId: pageIdOf(model.route) })],
});

/** What held the focus in a row is about to go: the row itself takes it. */
const focusTrackRow =
  (trackId: TrackId): Step =>
  (model) => ({
    model,
    commands: [FocusTrackRow({ pageId: pageIdOf(model.route), trackId })],
  });

/**
 * The reply to an intention has been settled into the Model. A page that can
 * take the screen does, and the URL with it. A track that cannot stays where
 * its row is, with what the catalog said: the list, the URL and the history
 * are as they were, and the same goes for an album asked from a row. A row
 * that turns out to be for a track or an album the catalog does not have
 * stops offering it, and what goes from a row's control can take the focus
 * with it: the row is given it back.
 */
// NOTE: a page asked for from the island's menu has no row to stay behind
// (`onPage`): it takes the screen with whatever there is to say of it, as a
// page chosen from a tile does.
const commitIfOpenable =
  (route: AppRoute, onPage: boolean): Step =>
  (model) => {
    if (canCommit(model, route) || (onPage && canShow(model, route))) {
      return commit(route, model.route)(model);
    }
    return AppRoute.matchOrElse<UpdateReturn>(
      route,
      {
        Track: ({ trackId }) =>
          isKnownMissing(trackData(model, trackId)) ? focusTrackRow(trackId)(model) : { model },
        Album: ({ albumId }) =>
          isKnownMissing(albumData(model, albumId))
            ? Option.match(HashMap.get(model.albumRows, albumId), {
                onNone: () => ({ model }),
                onSome: (row) => focusTrackRow(row.trackId)(model),
              })
            : { model },
      },
      () => ({ model }),
    );
  };

/**
 * A reply counts only if it answers the request awaited. It settles its
 * page: data replaces what was held, a failure keeps it. Then the screen
 * follows, for a page that was being waited for.
 */
const receive = <A>(
  model: Model,
  page: Page<A>,
  requestId: string,
  outcome: Result.Result<A, LoadError>,
): UpdateReturn => {
  if (!Option.contains(maybeAwaitedRequestId(model.awaiting), requestId)) {
    return { model };
  }
  const settled = modifyFields(page.write(model, AsyncData.settle(page.read(model), outcome)), {
    awaiting: () => Awaiting.Nothing(),
    // NOTE: a notice the listener put away was about an earlier failure.
    // The catalog failing to answer again is news, and is said again.
    staleNotice: (staleNotice) => (Result.isFailure(outcome) ? "Open" : staleNotice),
  });
  return Awaiting.matchOrElse<UpdateReturn>(
    model.awaiting,
    {
      Intention: ({ route, onPage }) => commitIfOpenable(route, onPage === true)(settled),
      Arrival: ({ route, entrance }) => showPage(route, entrance)(settled),
    },
    () => ({ model: settled }),
  );
};

/** A reply about a track is about the one awaited: the one being opened, else the one on screen. */
const receiveTrack = (
  model: Model,
  requestId: string,
  outcome: Result.Result<Option.Option<Track>, LoadError>,
): UpdateReturn =>
  AppRoute.matchOrElse<UpdateReturn>(
    awaitedRoute(model),
    { Track: ({ trackId }) => receive(model, trackPage(trackId), requestId, outcome) },
    () => ({ model }),
  );

/** A reply about an artist is about the one awaited, as a reply about a track is. */
const receiveArtist = (
  model: Model,
  requestId: string,
  outcome: Result.Result<Option.Option<Artist>, LoadError>,
): UpdateReturn =>
  AppRoute.matchOrElse<UpdateReturn>(
    awaitedRoute(model),
    { Artist: ({ artistId }) => receive(model, artistPage(artistId), requestId, outcome) },
    () => ({ model }),
  );

/** A reply about a playlist is about the one awaited, as a reply about a track is. */
const receivePlaylist = (
  model: Model,
  requestId: string,
  outcome: Result.Result<Option.Option<Playlist>, LoadError>,
): UpdateReturn =>
  AppRoute.matchOrElse<UpdateReturn>(
    awaitedRoute(model),
    {
      Playlist: ({ playlistId }) =>
        receive(model, playlistPage(playlistId), requestId, outcome),
    },
    () => ({ model }),
  );

/** A reply about a genre is about the one awaited, as a reply about a track is. */
const receiveGenre = (
  model: Model,
  requestId: string,
  outcome: Result.Result<Option.Option<Genre>, LoadError>,
): UpdateReturn =>
  AppRoute.matchOrElse<UpdateReturn>(
    awaitedRoute(model),
    { Genre: ({ genreId }) => receive(model, genrePage(genreId), requestId, outcome) },
    () => ({ model }),
  );

/** A reply about a station is about the one awaited, as a reply about a track is. */
const receiveStation = (
  model: Model,
  requestId: string,
  outcome: Result.Result<Option.Option<Station>, LoadError>,
): UpdateReturn =>
  AppRoute.matchOrElse<UpdateReturn>(
    awaitedRoute(model),
    { Station: ({ stationId }) => receive(model, stationPage(stationId), requestId, outcome) },
    () => ({ model }),
  );

/** A reply about an album is about the one awaited, as a reply about a track is. */
const receiveAlbum = (
  model: Model,
  requestId: string,
  outcome: Result.Result<Option.Option<Album>, LoadError>,
): UpdateReturn =>
  AppRoute.matchOrElse<UpdateReturn>(
    awaitedRoute(model),
    { Album: ({ albumId }) => receive(model, albumPage(albumId), requestId, outcome) },
    () => ({ model }),
  );

const receiveCatalogMessage = (model: Model, message: typeof Catalog.Message.Type): UpdateReturn =>
  Catalog.Message.match<UpdateReturn>(message, {
    SucceededHomeFeed: ({ requestId, result }) =>
      receive(model, homePage, requestId, Result.succeed(result)),
    FailedHomeFeed: ({ requestId, failure }) =>
      receive(model, homePage, requestId, Result.fail(toLoadError(failure))),
    SucceededNewMusic: ({ requestId, result }) =>
      receive(model, newMusicPage, requestId, Result.succeed(result)),
    FailedNewMusic: ({ requestId, failure }) =>
      receive(model, newMusicPage, requestId, Result.fail(toLoadError(failure))),
    SucceededCatalogSearch: ({ requestId, result }) =>
      Option.match(searchedTerm(awaitedRoute(model)), {
        onNone: () => ({ model }),
        onSome: (term) => {
          const received = receive(
            model,
            searchPage,
            requestId,
            Result.succeed({ term, results: result }),
          );
          return { ...received, model: rememberAnswer(received.model) };
        },
      }),
    FailedCatalogSearch: ({ requestId, failure }) =>
      receive(model, searchPage, requestId, Result.fail(toLoadError(failure))),
    SucceededTrackDetail: ({ requestId, result }) =>
      receiveTrack(model, requestId, Result.succeed(Option.some(result))),
    FailedTrackDetail: ({ requestId, failure }) =>
      receiveTrack(model, requestId, toTrackOutcome(failure)),
    SucceededAlbumDetail: ({ requestId, result }) =>
      receiveAlbum(model, requestId, Result.succeed(Option.some(result))),
    FailedAlbumDetail: ({ requestId, failure }) =>
      receiveAlbum(model, requestId, toAlbumOutcome(failure)),
    SucceededArtistDetail: ({ requestId, result }) =>
      receiveArtist(model, requestId, Result.succeed(Option.some(result))),
    FailedArtistDetail: ({ requestId, failure }) =>
      receiveArtist(model, requestId, toArtistOutcome(failure)),
    SucceededPlaylistDetail: ({ requestId, result }) =>
      receivePlaylist(model, requestId, Result.succeed(Option.some(result))),
    FailedPlaylistDetail: ({ requestId, failure }) =>
      receivePlaylist(model, requestId, toPlaylistOutcome(failure)),
    SucceededGenreList: ({ requestId, result }) =>
      receive(model, genreListPage, requestId, Result.succeed(result)),
    FailedGenreList: ({ requestId, failure }) =>
      receive(model, genreListPage, requestId, Result.fail(toLoadError(failure))),
    SucceededGenreDetail: ({ requestId, result }) =>
      receiveGenre(model, requestId, Result.succeed(Option.some(result))),
    FailedGenreDetail: ({ requestId, failure }) =>
      receiveGenre(model, requestId, toGenreOutcome(failure)),
    SucceededStationList: ({ requestId, result }) =>
      receive(model, stationListPage, requestId, Result.succeed(result)),
    FailedStationList: ({ requestId, failure }) =>
      receive(model, stationListPage, requestId, Result.fail(toLoadError(failure))),
    SucceededStationDetail: ({ requestId, result }) =>
      receiveStation(model, requestId, Result.succeed(Option.some(result))),
    FailedStationDetail: ({ requestId, failure }) =>
      receiveStation(model, requestId, toStationOutcome(failure)),
  });

/**
 * Typing goes through the URL: the current history entry is rewritten, so the
 * field's text survives a reload and Back never walks a term back letter by
 * letter. The entry is Search's own, except while a page reached by Back or
 * Forward is still loading: then the current entry is that page's, and Search
 * is given a new one after it instead of rewriting it.
 */
const rewriteSearchTerm =
  (maybeTerm: Option.Option<string>): Step =>
  (model) => {
    const route = AppRoute.Search({ maybeTerm });
    return Awaiting.matchOrElse<UpdateReturn>(
      model.awaiting,
      {
        Arrival: (awaited) =>
          moveUrlTo(route)(
            modifyFields(abandon(model), { trail: Array.append(awaited.route) }),
          ),
      },
      () => ({
        model: modifyFields(model, { maybeAskedRoute: () => Option.some(route) }),
        commands: [ReplaceSearchTerm({ maybeTerm })],
      }),
    );
  };

// PLAYER

const readPlayer = (model: Model) => Option.some(model.player);

/** A player left as it was leaves the Model as it was: nothing is drawn again for it. */
const writePlayer = (model: Model, nextPlayer: Player.Model): Model =>
  nextPlayer === model.player ? model : modifyFields(model, { player: () => nextPlayer });

const toGotPlayerMessage = (message: Player.Message): Message =>
  Message.GotPlayerMessage({ message });

const foldPlayer = Update.foldChild({
  update: Player.update,
  read: readPlayer,
  write: writePlayer,
  toParentMessage: toGotPlayerMessage,
});

const foldPlayerChoice = Update.foldChild({
  update: Player.choose,
  read: readPlayer,
  write: writePlayer,
  toParentMessage: toGotPlayerMessage,
});

const foldPlayerCollapse = Update.foldChildStep({
  update: Player.collapse,
  read: readPlayer,
  write: writePlayer,
  toParentMessage: toGotPlayerMessage,
});

const foldPlayerQueue = Update.foldChild({
  update: Player.enqueue,
  read: readPlayer,
  write: writePlayer,
  toParentMessage: toGotPlayerMessage,
});

// PLAYER SHEET

/**
 * The way out of the expanded player, whoever asks for it: back through the
 * browser's history to the page it was opened over when the app knows of
 * one, and to Home when the player's page was reached directly. It is what
 * the player's close control does.
 */
const closePlayer: Step = (model) =>
  Option.match(wayBackOn(model.trail), {
    onNone: () => follow(AppRoute.Home())(model),
    onSome: () => ({ model, commands: [NavigateBack()] }),
  });

/**
 * The sheet is off the screen, swiped away by the listener: what was behind
 * it is what they see, and it has to be the page on screen at once. With a
 * page behind in the history, that page is the one the sheet uncovered. With
 * none, the player's page having been reached directly, there was nothing
 * under the sheet: Home takes the screen without a wait, in placeholders
 * until its answer comes, since an empty screen is nothing to hold.
 */
const leavePlayer: Step = (model) =>
  Option.match(wayBackOn(model.trail), {
    onNone: () =>
      Update.combine(abandon(model), [
        commit(AppRoute.Home(), addressOf(model)),
        load(AppRoute.Home(), forTheScreen),
        // What held the focus left with the sheet.
        focusPage,
      ]),
    onSome: () => ({ model, commands: [NavigateBack()] }),
  });

// NOTE: the sheet says three things, and each closes the player. Swiped off
// the screen (`Left`), there is nothing left to see go: `viewTransition`
// reads that from the sheet's reach and asks for no transition. Asked to go
// with Escape (`RequestedClose`), its origin survives the history callback
// so the keyboard dismisses the sheet immediately.
const foldPlayerSheet = Update.foldChild({
  update: Sheet.update,
  read: (model: Model) => Option.some(model.playerSheet),
  write: (model: Model, nextSheet: Sheet.Model): Model =>
    nextSheet === model.playerSheet ? model : modifyFields(model, { playerSheet: () => nextSheet }),
  toParentMessage: (message: Sheet.Message): Message =>
    Message.GotPlayerSheetMessage({ message }),
  foldOutMessage: (said: Sheet.OutMessage): Step =>
    Sheet.OutMessage.match<Step>(said, {
      Left: () => leavePlayer,
      // Let go of on its way down, the sheet is taken from where it is: the
      // player closes as its handle closes it, and is seen to draw back into
      // its island from there, instead of sliding on off the foot of the
      // screen past an island it has nothing to do with.
      Leaving: () => closePlayer,
      RequestedClose: () => (model) =>
        model.playerSheet.dismissedByKeyboard ? leavePlayer(model) : closePlayer(model),
    }),
});

/** The tracks of the album whose page is in the document: the list its rows are drawn from. */
const albumTracksInDocument = (model: Model): ReadonlyArray<TrackSummary> =>
  pipe(
    maybeAlbumIdInDocument(model.route, model.trail),
    Option.flatMap((albumId) => Option.flatten(AsyncData.getData(albumData(model, albumId)))),
    Option.match({ onNone: () => [], onSome: (album) => album.tracks }),
  );

/** The most played tracks of the artist whose page is in the document: the list its rows are drawn from. */
const artistTopTracksInDocument = (model: Model): ReadonlyArray<TrackSummary> =>
  pipe(
    maybeArtistIdInDocument(model.route, model.trail),
    Option.flatMap((artistId) => Option.flatten(AsyncData.getData(artistData(model, artistId)))),
    Option.match({ onNone: () => [], onSome: (artist) => artist.topTracks }),
  );

/** The tracks of the playlist whose page is in the document: the list its rows are drawn from. */
const playlistTracksInDocument = (model: Model): ReadonlyArray<TrackSummary> =>
  pipe(
    maybePlaylistIdInDocument(model.route, model.trail),
    Option.flatMap((playlistId) =>
      Option.flatten(AsyncData.getData(playlistData(model, playlistId))),
    ),
    Option.match({ onNone: () => [], onSome: (playlist) => playlist.tracks }),
  );

/** The most played tracks of the genre whose page is in the document: the list its rows are drawn from. */
const genreTopTracksInDocument = (model: Model): ReadonlyArray<TrackSummary> =>
  pipe(
    maybeGenreIdInDocument(model.route, model.trail),
    Option.flatMap((genreId) => Option.flatten(AsyncData.getData(genreData(model, genreId)))),
    Option.match({ onNone: () => [], onSome: (genre) => genre.topTracks }),
  );

/** The songs of the station whose page is in the document: the list its rows are drawn from. */
const stationTracksInDocument = (model: Model): ReadonlyArray<TrackSummary> =>
  pipe(
    maybeStationIdInDocument(model.route, model.trail),
    Option.flatMap((stationId) => Option.flatten(AsyncData.getData(stationData(model, stationId)))),
    Option.match({ onNone: () => [], onSome: (station) => station.tracks }),
  );

/**
 * The list a track was played from, as the page it is on holds it: what
 * plays after it. A track played from its own page is a list of one, and
 * one played from its album's page is followed by the rest of the album.
 * From an artist's page it is their most played tracks, from a playlist's
 * the playlist, from a genre's the tracks played most in it, and from a
 * station's the songs the station lists.
 */
const listPlayedFrom = (
  model: Model,
  from: PlayOrigin,
  trackId: TrackId,
): ReadonlyArray<TrackSummary> =>
  Match.value(from).pipe(
    Match.withReturnType<ReadonlyArray<TrackSummary>>(),
    Match.when("New", () =>
      Option.match(AsyncData.getData(model.newMusic), {
        onNone: () => [],
        onSome: (trending) => trending.tracks,
      }),
    ),
    Match.when("Search", () =>
      Option.match(AsyncData.getData(model.search), {
        onNone: () => [],
        onSome: (answer) => answer.results.tracks,
      }),
    ),
    Match.when("Track", () =>
      Array.fromOption(Option.flatten(AsyncData.getData(trackData(model, trackId)))),
    ),
    Match.when("Album", () => albumTracksInDocument(model)),
    Match.when("Artist", () => artistTopTracksInDocument(model)),
    Match.when("Playlist", () => playlistTracksInDocument(model)),
    Match.when("Genre", () => genreTopTracksInDocument(model)),
    Match.when("Station", () => stationTracksInDocument(model)),
    Match.exhaustive,
  );

/**
 * The player was expanded and has gone on to another track: the screen and
 * the URL follow it, and what the catalog knows of the new track is asked
 * for. The history entry is rewritten, not added to, so Back still closes
 * the player. Two things already under way are left alone: a page the
 * listener chose and is waiting for keeps being waited for, and where the
 * browser has already moved the URL to a page still loading, that URL is not
 * this page's to rewrite.
 */
const followTrack =
  (trackId: TrackId): Step =>
  (model) => {
    const route = AppRoute.Track({ trackId });
    const shown = modifyFields(model, { route: () => route });
    return Awaiting.match<UpdateReturn>(model.awaiting, {
      // NOTE: the page the browser went to, still loading, can be this very
      // one: the URL is already its own, and the reply awaited is from then
      // on a reply for the page on screen.
      Arrival: (awaited) =>
        isSamePage(awaited.route, route)
          ? { model: modifyFields(shown, { awaiting: () => forTheScreen(awaited.requestId) }) }
          : { model: shown },
      // NOTE: a page the listener is waiting for that turns out to be this
      // very one has arrived by another way: its reply must not add an entry.
      Intention: (awaited) =>
        isSamePage(awaited.route, route)
          ? Update.combine(abandon(shown), [rewriteUrlFor(route), load(route, forTheScreen)])
          : rewriteUrlFor(route)(shown),
      TypingPause: () => rewriteUrlFor(route)(shown),
      Nothing: () => Update.combine(shown, [rewriteUrlFor(route), load(route, forTheScreen)]),
      Reply: () =>
        Update.combine(abandon(shown), [rewriteUrlFor(route), load(route, forTheScreen)]),
    });
  };

const rewriteUrlFor =
  (route: Extract<AppRoute, { _tag: "Track" }>): Step =>
  (model) => ({
    model: modifyFields(model, { maybeAskedRoute: () => Option.some(route) }),
    commands: [ReplaceTrackUrl({ trackId: route.trackId })],
  });

/**
 * After the player has had a Message: an expanded player that now holds
 * another track takes the screen and the URL with it. It is told from the
 * Model before and the Model after, not from the Message, so it holds for a
 * press of Next and for a track that follows by itself alike.
 */
const keepUpWithPlayer =
  (before: Model): Step =>
  (model) =>
    isPlayerExpanded(before) && !isPlayerExpanded(model)
      ? Option.match(Player.maybeCurrentTrackId(model.player), {
          onNone: () => ({ model }),
          onSome: (trackId) => followTrack(trackId)(model),
        })
      : { model };

// ROW MENU

/**
 * A row's control shows that its track was queued, for as long as
 * `WaitToClearRowDone` waits. A player that is as it was queued nothing, and
 * nothing is shown.
 */
const showQueued =
  (before: Player.Model, row: RowRef, place: Player.QueuePlace): Step =>
  (model) => {
    if (model.player === before) {
      return { model };
    }
    const turn = model.rowDone.turn + 1;
    return {
      model: modifyFields(model, {
        rowDone: () => ({ turn, maybeRow: Option.some({ ...row, place }) }),
      }),
      commands: [WaitToClearRowDone({ turn })],
    };
  };

/** The track of a row, as the page it is listed on holds it. */
const maybeTrackOfRow = (model: Model, row: RowRef): Option.Option<TrackSummary> =>
  Array.findFirst(
    listPlayedFrom(model, row.from, row.trackId),
    (track) => track.id === row.trackId,
  );

/** The track of a row goes into the queue. */
const queueFromRow =
  (row: RowRef, place: Player.QueuePlace): Step =>
  (model) =>
    Option.match(maybeTrackOfRow(model, row), {
      onNone: () => ({ model }),
      onSome: (track) =>
        Update.combine(model, [
          foldPlayerQueue({ track, place }),
          showQueued(model.player, row, place),
        ]),
    });

/**
 * A row asks for the page of its track's album. It is followed as a link to
 * the page would be, and the row is noted as the one that asked: of all the
 * rows the album is on, it is the one that says the album is opening, or
 * that it could not be. An album the catalog is known not to have is no
 * longer something to open, so asking for it changes nothing.
 */
const openAlbumFromRow =
  (row: RowRef): Step =>
  (model) =>
    Option.match(maybeTrackOfRow(model, row), {
      onNone: () => ({ model }),
      onSome: (track) =>
        isKnownMissing(albumData(model, track.album.id))
          ? { model }
          : follow(AppRoute.Album({ albumId: track.album.id }))(
              modifyFields(model, { albumRows: HashMap.set(track.album.id, row) }),
            ),
    });

/**
 * An album chosen by a link was not asked from a row: no row speaks for it,
 * whatever one said of it before.
 */
const forgetAlbumRow =
  (route: AppRoute): Step =>
  (model) => ({
    model:
      route._tag === "Album" && HashMap.has(model.albumRows, route.albumId)
        ? modifyFields(model, { albumRows: HashMap.remove(route.albumId) })
        : model,
  });

/**
 * What was chosen from a row's menu. Opening the song is the row's way to
 * its track's page, and opening the album its way to the album's: each is
 * followed as a link to the page would be, so the page on screen is held and
 * the row says that it is opening.
 */
const chooseFromRow = (row: RowRef, action: RowAction): Step =>
  Match.value(action).pipe(
    Match.withReturnType<Step>(),
    Match.when("PlayNext", () => queueFromRow(row, "Next")),
    Match.when("AddToQueue", () => queueFromRow(row, "Last")),
    Match.when("OpenAlbum", () => openAlbumFromRow(row)),
    Match.when("OpenSong", () => follow(AppRoute.Track({ trackId: row.trackId }))),
    Match.exhaustive,
  );

/** The page a Message of a row's menu chooses, when it chooses one: the song's, or its album's. */
const maybePageChosen = (message: Menu.Message): Option.Option<"OpenSong" | "OpenAlbum"> =>
  message._tag === "SelectedItem" && (message.item === "OpenSong" || message.item === "OpenAlbum")
    ? Option.some(message.item)
    : Option.none();

const foldRowMenu = Update.foldChildAt({
  update: RowMenu.update,
  readAt: (model: Model, row: RowRef) => {
    const menu = rowMenuIn(model.rowMenus, row);
    return Option.some(modifyFields(menu, { isAnimated: () => model.inputMethod === "Pointer" }));
  },
  writeAt: (model: Model, row: RowRef, nextMenu: Menu.Model) =>
    modifyFields(model, { rowMenus: HashMap.set(rowMenuId(row), nextMenu) }),
  toParentMessage: (row: RowRef, message: Menu.Message): Message =>
    Message.GotRowMenuMessage({ ...row, message }),
  foldOutMessage: (row: RowRef) => (chosen: Menu.OutMessage<RowAction>) =>
    chooseFromRow(row, chosen.value),
});

/** The page of the album the track the player holds is on, followed as a link to it would be. */
const openAlbumOfPlayer: Step = (model) =>
  Option.match(Player.maybeCurrentAlbumId(model.player), {
    onNone: () => ({ model }),
    onSome: (albumId) => {
      const route = AppRoute.Album({ albumId });
      return Update.combine(model, [forgetAlbumRow(route), follow(route)]);
    },
  });

/**
 * The page asked for is one no row speaks for: it is to take the screen
 * with whatever there is to say of it, the catalog's failure to answer among
 * that.
 */
const sayOnPage =
  (route: AppRoute): Step =>
  (model) => ({
    model: Awaiting.matchOrElse(
      model.awaiting,
      {
        Intention: (awaited) =>
          isSameRoute(awaited.route, route)
            ? modifyFields(model, {
                awaiting: () =>
                  Awaiting.Intention({
                    requestId: awaited.requestId,
                    route: awaited.route,
                    onPage: true,
                    ...(awaited.viaKeyboard && { viaKeyboard: true as const }),
                  }),
              })
            : model,
      },
      () => model,
    ),
  });

/**
 * The page of the track the player holds, chosen from the island's menu on a
 * desktop's screen, where the player has no face for the song's details. It
 * is followed as a link to the page would be: the page on screen is held and
 * the island's control says the page is on its way.
 */
const openSongOfPlayer: Step = (model) =>
  Option.match(Player.maybeCurrentTrackId(model.player), {
    onNone: () => ({ model }),
    onSome: (trackId) => {
      const route = AppRoute.Track({ trackId });
      return Update.combine(model, [follow(route), sayOnPage(route)]);
    },
  });

const closePlayerMenu: Step = (model) =>
  Player.isMoreMenuOpen(model.player)
    ? foldPlayer(Player.Message.GotMoreMenuMessage({ message: Menu.Message.Closed() }))(model)
    : { model };

/**
 * The screen has become a desktop's, or stopped being one. Nothing moves in
 * the history and no page is asked for: the route is the same route, and
 * only what the player is changes. The page of the track it holds is the
 * player's sheet on a compact screen and that track's own page on a
 * desktop's. A menu of the player's left open is closed: the control it
 * hung from is not there any more.
 */
const changeScreen =
  (screen: Screen): Step =>
  (model) =>
    model.screen === screen
      ? { model }
      : closePlayerMenu(withPlayerSheetAnew(modifyFields(model, { screen: () => screen })));

const respond = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ChangedInputMethod: ({ method }) => ({
      model: modifyFields(model, { inputMethod: () => method }),
    }),

    ChangedScreen: ({ screen }) => changeScreen(screen)(model),

    ClickedLink: ({ request }) =>
      UrlRequest.match<UpdateReturn>(request, {
        Internal: ({ url }) => {
          const route = urlToAppRoute(url);
          return Update.combine(model, [
            forgetAlbumRow(route),
            scrollToTopWhenChosenAgain(route),
            follow(route),
          ]);
        },
        External: ({ href }) => ({ model, commands: [LoadExternal({ href })] }),
      }),

    ChangedUrl: ({ url }) => arriveAt(urlToAppRoute(url))(model),

    ClickedBack: () => ({ model, commands: [NavigateBack()] }),

    ClickedTryAgain: () => Update.combine(model, [reload, focusPage]),

    ClickedDismissStaleNotice: () => ({
      model: modifyFields(model, { staleNotice: () => "Dismissed" }),
    }),

    // NOTE: a track's page is a list of one, and its track is queued as a
    // row's is: the page's control shows that it was done, for a moment.
    ClickedQueueTrack: ({ trackId, place }) => queueFromRow({ from: "Track", trackId }, place)(model),

    UpdatedSearchField: ({ value }) =>
      rewriteSearchTerm(Option.liftPredicate(value, String.isNonEmpty))(model),

    CompletedWaitForTypingPause: ({ pauseId }) =>
      Option.match(searchedTerm(model.route), {
        onNone: () => ({ model }),
        onSome: (term) =>
          isAwaitingPause(model.awaiting, pauseId)
            ? send(model, askCatalogSearch(term), forTheScreen)
            : { model },
      }),

    GotCatalogMessage: ({ message }) => receiveCatalogMessage(model, message),

    // NOTE: the expanded player has no navigation under it on a narrow
    // screen, so scrolling it draws nothing back: the page behind it finds
    // its navigation as it was left.
    // NOTE: the menu draws back to make room: the island comes down into
    // the row it leaves. With nothing played there is no island, and a menu
    // drawn back would leave that row empty for nothing, so it stays whole
    // however far the page is scrolled.
    ScrolledDown: () => ({
      model:
        isPlayerExpanded(model) || !Player.hasSession(model.player)
          ? model
          : withNavigation("Minimized")(model),
    }),

    ScrolledToTop: () => ({
      model: isPlayerExpanded(model) ? model : withNavigation("Open")(model),
    }),

    ClickedShowNavigation: () => ({
      model: withNavigation("Open")(model),
      commands: [FocusNavigation()],
    }),

    // NOTE: playing is no navigation, with one exception. No navigation
    // Message reaches the player, and the player moves the route only while
    // it is expanded, when its page is the page of the track it holds.
    ClickedPlayTrack: ({ trackId, from }) =>
      Update.combine(model, [
        foldPlayerChoice({ trackId, list: listPlayedFrom(model, from, trackId) }),
        keepUpWithPlayer(model),
      ]),

    // NOTE: the album's page, chosen from the player's menu, is followed as
    // a link to it would be: the player is held until the page can take the
    // screen, and then shrinks back to its island over it.
    // NOTE: the song's details are a face of the expanded player, which the
    // player turns to itself. On a desktop's screen there is no such face,
    // and the choice is not handed to the player: its menu is closed, and
    // the track's page is followed as a link to it would be.
    GotPlayerMessage: ({ message }) =>
      model.screen === "Desktop" && Player.isDetailsAsked(message)
        ? Update.combine(model, [closePlayerMenu, openSongOfPlayer])
        : Update.combine(model, [
            foldPlayer(message),
            keepUpWithPlayer(model),
            Player.isAlbumAsked(message) ? openAlbumOfPlayer : (current) => ({ model: current }),
          ]),

    // NOTE: a sheet's word counts only while the player is expanded. One
    // that comes after the player closed, from a sheet on its way out of the
    // document, would otherwise close whatever page came next.
    GotPlayerSheetMessage: ({ message }) =>
      isPlayerExpanded(model) ? foldPlayerSheet(model, message) : { model },

    // NOTE: choosing a page from a row's menu is heard here and not by the
    // menu, which would close on it. The menu stays open while the page is on
    // its way: the item that was chosen says so, and says it if the page
    // fails to open, where a second press tries again. It closes when the
    // page takes the screen.
    GotRowMenuMessage: ({ from, trackId, message }) =>
      Option.match(maybePageChosen(message), {
        onNone: () => foldRowMenu(model, { from, trackId }, message),
        onSome: (action) => chooseFromRow({ from, trackId }, action)(model),
      }),

    CompletedWaitToClearRowDone: ({ turn }) => ({
      model:
        model.rowDone.turn === turn && Option.isSome(model.rowDone.maybeRow)
          ? modifyFields(model, { rowDone: () => ({ turn, maybeRow: Option.none() }) })
          : model,
    }),

    CompletedNavigateInternal: () => ({ model }),
    CompletedNavigateBack: () => ({ model }),
    CompletedLoadExternal: () => ({ model }),
    CompletedReplaceSearchTerm: () => ({ model }),
    CompletedReplaceTrackUrl: () => ({ model }),
    CompletedFocusSearchField: () => ({ model }),
    CompletedFocusPage: () => ({ model }),
    CompletedFocusTrackRow: () => ({ model }),
    CompletedFocusAlbumTile: () => ({ model }),
    CompletedFocusArtistTile: () => ({ model }),
    CompletedFocusPlaylistTile: () => ({ model }),
    CompletedFocusGenreTile: () => ({ model }),
    CompletedFocusStationTile: () => ({ model }),
    CompletedFocusNavigation: () => ({ model }),
    CompletedScrollPageToTop: () => ({ model }),
    CompletedHoldDockMotion: () => ({ model }),
  });

/**
 * The app is launched once the page on screen has more than placeholders to
 * show: what the catalog said of it, or that it could not be asked. Until
 * then the mark the page opened with stands over the placeholders. It is
 * looked at after every Message and not only after the catalog's, since some
 * pages need nothing from the catalog. Launched is for good: a later page
 * that waits, a first search among them, does so in the app.
 */
const launchOnceShown: Step = (model) => ({
  model:
    model.launch === "Launching" && canShow(model, model.route)
      ? modifyFields(model, { launch: () => "Launched" })
      : model,
});

/**
 * On a compact screen the player's menu belongs to the expanded player. Once
 * the player is its island again, by whatever way it got there, a menu left
 * open is closed: opened again, the player is found as a player is opened,
 * with nothing standing over it. On a desktop's screen the menu is the
 * island's own, and stays as the listener left it.
 */
const closePlayerMenuOnceCollapsed: Step = (model) =>
  model.screen === "Compact" && !isPlayerExpanded(model) ? closePlayerMenu(model) : { model };

/**
 * The faces of the expanded player are the expanded player's. Once it is
 * its island again, by whatever way it got there, the face it had turned to
 * is put away with it: opened again, the player shows the song, which is
 * the face the island grows into (`player-opens` in styles.css).
 */
const showSongOnceCollapsed: Step = (model) =>
  isPlayerExpanded(model) || Player.isOnSongFace(model.player)
    ? { model }
    : foldPlayerCollapse(model);

export const update = (model: Model, message: Message) =>
  Update.combine(model, [
    (current) => respond(current, message),
    closePlayerMenuOnceCollapsed,
    showSongOnceCollapsed,
    launchOnceShown,
  ]);

// INIT

/**
 * Nothing has been on screen yet, so there is no page to hold and nothing
 * to abandon: the destination is shown at once, as placeholders in its
 * shape, and asks for its data without waiting for any typing to pause. The
 * mark the page opened with stands over those placeholders until the page
 * has more to show; a page that needs nothing is launched here.
 */
export const init: Runtime.RoutingApplicationInit<Model, Message, void, Services> = (
  url: Url,
) => {
  const route = urlToAppRoute(url);
  return Update.combine(
    Model.make({
      route,
      awaiting: Awaiting.Nothing(),
      // Replies are matched in memory, so the ids only have to differ within this page load.
      requestIds: { session: "page", sent: 0 },
      home: AsyncData.Idle(),
      newMusic: AsyncData.Idle(),
      genreList: AsyncData.Idle(),
      stationList: AsyncData.Idle(),
      search: AsyncData.Idle(),
      searched: HashMap.empty(),
      tracks: HashMap.empty(),
      albums: HashMap.empty(),
      albumRows: HashMap.empty(),
      artists: HashMap.empty(),
      playlists: HashMap.empty(),
      genres: HashMap.empty(),
      stations: HashMap.empty(),
      maybeAskedRoute: Option.none(),
      // A fresh load knows nothing of the history behind it, so no page has a way back yet.
      trail: [],
      navigation: "Open",
      launch: "Launching",
      staleNotice: "Open",
      // NOTE: what the screen is, the document says as the app starts
      // (`screens` in subscription.ts). Until it has, nothing has been
      // played, and the two screens differ only in what the player is.
      screen: "Compact",
      inputMethod: "Pointer",
      rowMenus: HashMap.empty(),
      rowDone: { turn: 0, maybeRow: Option.none() },
      player: Player.init(),
      playerSheet: initialPlayerSheet,
    }),
    [load(route, forTheScreen), focusSearchFieldOnSearch, launchOnceShown],
  );
};

// VIEW TRANSITION

/**
 * What a transition between pages is called. Going from one section to
 * another is a change of place: the page gives way to the other where it
 * stands. Opening a page from a list is a step deeper, and going back to the
 * list a step back: the picture the two share travels between them and,
 * where they share none, the page itself comes over the list from the side
 * and goes back off it (`entry.ts` tells which, since only the document
 * knows whether the picture is there). The second name of an opening or a
 * closing is that picture's.
 */
export const SWITCH_SECTION = "switch-section";
export const OPEN_DETAIL = "open-detail";
export const CLOSE_DETAIL = "close-detail";
/** A page that comes over the one before it, and one that goes back off it. */
export const PUSH_PAGE = "push-page";
export const POP_PAGE = "pop-page";

/** What a transition is called when the island grows into the player, and when the player shrinks back. */
export const PLAYER_OPENS = "player-opens";
export const PLAYER_CLOSES = "player-closes";
/**
 * Said with `PLAYER_CLOSES` when the player was closed from its queue's face
 * or its song's details, where the cover is a thumbnail and travels as one.
 */
export const PLAYER_FACE_CLOSES = "player-face-closes";

/** The expanded player turning to its queue, and back to its song. */
export const PLAYER_QUEUE_OPENS = "player-queue-opens";
export const PLAYER_QUEUE_CLOSES = "player-queue-closes";

/** The queue's column coming in beside the page, on a desktop's screen, and going. */
export const QUEUE_COLUMN_OPENS = "queue-column-opens";
export const QUEUE_COLUMN_CLOSES = "queue-column-closes";

/**
 * A view transition when the page on screen changes, and when the listener
 * puts another track in the player: the first is told by what kind of change
 * it is (see `SWITCH_SECTION` above), the second carries the track's cover
 * from where it was pressed to the island.
 * A track that followed the one before by itself asks for none: nobody
 * tapped, and a transition would hold the page still for a moment under a
 * listener who may be scrolling it.
 * Typing, background refreshes, the engine's reports and the URL catching up
 * with a page already shown repaint plainly. Both are read from the two
 * Models, not from the Message: several Messages can share one frame, and
 * only the last is told. The runtime skips the transition under
 * `prefers-reduced-motion`. Opening the player, closing it, and Back out of
 * it are page changes like any other, so they are covered: the island and
 * the expanded player share a name, and the browser grows one into the other.
 */
export const viewTransition: Runtime.ViewTransitionConfig<Model, Message> = ({
  previousModel,
  model,
}) => {
  const awaited = previousModel.awaiting;
  if (model.inputMethod === "Keyboard" ||
    ((awaited._tag === "Intention" || awaited._tag === "Arrival") &&
      awaited.viaKeyboard && isSameRoute(awaited.route, model.route))) {
    return false;
  }
  // NOTE: a window made wider or narrower is no change the app shows: the
  // player is a sheet on one side of it and an island on the other, and a
  // transition would grow the one out of the other under a hand on the
  // window's edge.
  if (previousModel.screen !== model.screen) {
    return false;
  }
  // NOTE: the queue's column comes in from the side it stands on, and goes
  // back off it. The page beside it changes width in the one frame, and the
  // island goes to its new place with the column.
  const wasQueueBeside = Player.isQueueColumnOpen(previousModel.player);
  const isQueueBeside = Player.isQueueColumnOpen(model.player);
  if (model.screen === "Desktop" && wasQueueBeside !== isQueueBeside) {
    return { types: [isQueueBeside ? QUEUE_COLUMN_OPENS : QUEUE_COLUMN_CLOSES] };
  }
  const wasExpanded = isPlayerExpanded(previousModel);
  const isExpanded = isPlayerExpanded(model);
  // NOTE: an expanded player that goes on to another track changes route,
  // and is the same sheet: its words and its picture change where they stand.
  // Turning to its queue, or back to its song, is seen to happen: the cover
  // travels between its place at the head of the sheet and the thumbnail,
  // and the controls between theirs. The two are told apart by name, as
  // opening and closing are, since the cover lands on a different picture
  // each way.
  if (wasExpanded && isExpanded) {
    return Option.match(Player.maybeTurnedFace(previousModel.player, model.player), {
      onNone: () => false,
      onSome: ({ trackId, toQueue }) => ({
        types: [toQueue ? PLAYER_QUEUE_OPENS : PLAYER_QUEUE_CLOSES, coverTransitionName(trackId)],
      }),
    });
  }
  if (wasExpanded === isExpanded) {
    return Option.match(Player.maybeChosenTrackId(previousModel.player, model.player), {
      onNone: () => {
        if (isSamePage(previousModel.route, model.route)) {
          return false;
        }
        const returning = Option.exists(wayBackOn(previousModel.trail), (route) =>
          isSamePage(route, model.route));
        // NOTE: a section is one of the navigation's own. Going from one to
        // another, in whichever direction and by whichever way, and leaving
        // any page for one by the navigation, is a change of place and not
        // a step deeper or a step back.
        if (isSection(model.route) && (isSection(previousModel.route) || !returning)) {
          return { types: [SWITCH_SECTION] };
        }
        const detail = returning ? previousModel.route : model.route;
        return {
          types: [returning ? CLOSE_DETAIL : OPEN_DETAIL, ...Option.toArray(routeArtwork(detail))],
        };
      },
      onSome: (id) => ({ types: [CHOOSE_TRACK, coverTransitionName(id)] }),
    });
  }
  // NOTE: a sheet the listener swiped off the screen has already gone, and
  // the page behind it is what they see: there is nothing to shrink back
  // into the island, and a transition would bring the sheet back to do it.
  // It is read from the Model as it is now, since the sheet's last word and
  // the page change it caused can reach one frame together.
  if (wasExpanded && (model.playerSheet.reach === "Gone" || model.playerSheet.dismissedByKeyboard)) {
    return false;
  }
  // NOTE: opening and closing the player are told apart by name, since the
  // style sheet has to know which of the two pictures is the island's: it
  // keeps that one where the island stands, at the foot of the box that
  // grows into the sheet, instead of letting it ride the box's top corner
  // up the screen.
  const expanded = isExpanded ? model : previousModel;
  return {
    types: [
      isExpanded ? PLAYER_OPENS : PLAYER_CLOSES,
      ...Option.toArray(routeArtwork(expanded.route)),
      // NOTE: after the cover's name, which is what is read second
      // (`entry.ts`): a track's page always has one.
      ...(isExpanded || Player.isOnSongFace(previousModel.player) ? [] : [PLAYER_FACE_CLOSES]),
    ],
  };
};
