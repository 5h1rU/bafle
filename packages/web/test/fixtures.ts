import { AlbumId, type AlbumSummary } from "@bafle/domain/Catalog/Album";
import { AlbumNotFound } from "@bafle/domain/Catalog/AlbumNotFound.rejection";
import { ArtistId, type ArtistSummary } from "@bafle/domain/Catalog/Artist";
import { ArtistNotFound } from "@bafle/domain/Catalog/ArtistNotFound.rejection";
import { CatalogUnavailable } from "@bafle/domain/Catalog/CatalogUnavailable.rejection";
import type { Album } from "@bafle/domain/Catalog/FullAlbum";
import type { Artist } from "@bafle/domain/Catalog/FullArtist";
import type { Genre } from "@bafle/domain/Catalog/FullGenre";
import type { Playlist } from "@bafle/domain/Catalog/FullPlaylist";
import type { Station } from "@bafle/domain/Catalog/FullStation";
import { GenreId, type GenreSummary } from "@bafle/domain/Catalog/Genre";
import { GenreNotFound } from "@bafle/domain/Catalog/GenreNotFound.rejection";
import type {
  FeaturedMusic,
  MusicGenres,
  RadioStations,
  SearchResults,
  TrendingMusic,
} from "@bafle/domain/Catalog/MusicCatalog.external";
import { PlaylistId, type PlaylistSummary } from "@bafle/domain/Catalog/Playlist";
import { PlaylistNotFound } from "@bafle/domain/Catalog/PlaylistNotFound.rejection";
import { StationId, type StationSummary } from "@bafle/domain/Catalog/Station";
import { StationNotFound } from "@bafle/domain/Catalog/StationNotFound.rejection";
import { type Track, TrackId, type TrackSummary } from "@bafle/domain/Catalog/Track";
import { TrackNotFound } from "@bafle/domain/Catalog/TrackNotFound.rejection";
import * as DomainFoldkit from "@alchemy.run/domain/Foldkit";
import { Menu } from "@foldkit/ui";
import * as Option from "effect/Option";
import { UrlRequest } from "foldkit/navigation";
import { Mount, type SceneStep, scene as foldkitScene } from "foldkit/scene";
import { type Url, fromString } from "foldkit/url";
import { Catalog } from "../src/catalog.ts";
import { init, update } from "../src/main.ts";
import { PaintSystemBar } from "../src/command.ts";
import { Message, type PlayOrigin } from "../src/message.ts";
import { Awaiting, type ListedSection, type Model } from "../src/model.ts";
import { HoldDockMotion } from "../src/mount.ts";
import * as Player from "../src/player/index.ts";
import type { PlayerAction } from "../src/player/moreMenu.ts";
import * as Rows from "../src/rows/index.ts";
import type { RowAction } from "../src/rows/index.ts";

// CATALOG

const artwork = (name: string) => ({
  small: `https://img.test/${name}/small.jpg`,
  medium: `https://img.test/${name}/medium.jpg`,
  large: `https://img.test/${name}/large.jpg`,
  placeholder: null,
});

export const artist: ArtistSummary = {
  id: ArtistId.make("ar-1"),
  name: "Daft Punk",
  picture: artwork("ar-1"),
};

export const album: AlbumSummary = {
  id: AlbumId.make("al-1"),
  title: "Discovery",
  artist: { id: artist.id, name: artist.name },
  cover: artwork("al-1"),
  explicit: false,
};

export const track: TrackSummary = {
  id: TrackId.make("tr-1"),
  title: "Harder, Better, Faster, Stronger",
  artist: { id: artist.id, name: artist.name },
  album: { id: album.id, title: album.title, cover: album.cover },
  durationSeconds: 224,
  previewUrl: "https://audio.test/tr-1.mp3",
  explicit: false,
};

export const explicitTrack: TrackSummary = {
  id: TrackId.make("tr-2"),
  title: "Technologic",
  artist: { id: artist.id, name: artist.name },
  album: { id: AlbumId.make("al-2"), title: "Human After All", cover: null },
  durationSeconds: 245,
  previewUrl: "https://audio.test/tr-2.mp3",
  explicit: true,
};

/** A track the catalog lists and has nothing to play for. */
export const silentTrack: TrackSummary = {
  id: TrackId.make("tr-3"),
  title: "Veridis Quo",
  artist: { id: artist.id, name: artist.name },
  album: { id: album.id, title: album.title, cover: album.cover },
  durationSeconds: 345,
  previewUrl: null,
  explicit: false,
};

/** Credited on the track beside its main artist; the catalog has no picture of them. */
export const guest: ArtistSummary = {
  id: ArtistId.make("ar-2"),
  name: "Romanthony",
  picture: null,
};

/** The first track, as its own page shows it. */
export const fullTrack: Track = {
  ...track,
  artists: [artist, guest],
  releaseDate: "2001-03-12",
  trackNumber: 4,
};

/** The explicit track in full, with nothing the catalog could leave out. */
export const bareTrack: Track = {
  ...explicitTrack,
  artists: [artist],
  releaseDate: null,
  trackNumber: null,
};

export const trackPath = (trackId: TrackId): string => `/track/${trackId}`;

/** The album's opening track: on no chart, so only the album's own page lists it. */
export const albumOpener: TrackSummary = {
  ...track,
  id: TrackId.make("tr-4"),
  title: "One More Time",
  durationSeconds: 320,
  previewUrl: "https://audio.test/tr-4.mp3",
};

/** The first album, as its own page shows it: three tracks, the last with nothing to play. */
export const fullAlbum: Album = {
  ...album,
  tracks: [albumOpener, track, silentTrack],
  releaseDate: "2001-03-07",
};

export const albumPath = (albumId: AlbumId): string => `/album/${albumId}`;

export const playlist: PlaylistSummary = {
  id: PlaylistId.make("pl-1"),
  title: "French Touch",
  curator: "Bafle Editors",
  picture: null,
  trackCount: 50,
};

/**
 * The first artist, as their own page shows them: two tracks played most,
 * each on an album of its own, and one album out.
 */
export const fullArtist: Artist = {
  ...artist,
  topTracks: [track, explicitTrack],
  albums: [album],
};

export const artistPath = (artistId: ArtistId): string => `/artist/${artistId}`;

/** The playlist, as its own page shows it: three tracks, the last with nothing to play. */
export const fullPlaylist: Playlist = {
  id: playlist.id,
  title: playlist.title,
  curator: playlist.curator,
  picture: playlist.picture,
  tracks: [explicitTrack, track, silentTrack],
};

export const playlistPath = (playlistId: PlaylistId): string => `/playlist/${playlistId}`;

export const genre: GenreSummary = {
  id: GenreId.make("ge-1"),
  name: "Electro",
  picture: null,
};

/** A second genre, with a picture. */
export const otherGenre: GenreSummary = {
  id: GenreId.make("ge-2"),
  name: "Dance",
  picture: artwork("ge-2"),
};

export const allGenres: MusicGenres = { genres: [genre, otherGenre] };

/**
 * The first genre, as its own page shows it: two tracks played most, each on
 * an album of its own, and one album, one artist and one playlist.
 */
export const fullGenre: Genre = {
  ...genre,
  topTracks: [track, explicitTrack],
  albums: [album],
  artists: [artist],
  playlists: [playlist],
};

export const genrePath = (genreId: GenreId): string => `/genre/${genreId}`;

export const station: StationSummary = {
  id: StationId.make("st-1"),
  title: "French House",
  picture: null,
};

/** A second station, with a picture, under another genre. */
export const otherStation: StationSummary = {
  id: StationId.make("st-2"),
  title: "Club Classics",
  picture: artwork("st-2"),
};

export const allStations: RadioStations = {
  groups: [
    { genre: { id: genre.id, name: genre.name }, stations: [station] },
    { genre: { id: otherGenre.id, name: otherGenre.name }, stations: [otherStation] },
  ],
};

/** The first station, as its own page shows it: three songs, the last with nothing to play. */
export const fullStation: Station = {
  ...station,
  tracks: [explicitTrack, track, silentTrack],
};

export const stationPath = (stationId: StationId): string => `/station/${stationId}`;

export const featured: FeaturedMusic = {
  albums: [album],
  playlists: [playlist],
  artists: [artist],
};

/** What Home shows after a refresh brought something new. */
export const featuredLater: FeaturedMusic = {
  albums: [{ ...album, id: AlbumId.make("al-3"), title: "Random Access Memories" }],
  playlists: [playlist],
  artists: [artist],
};

export const trending: TrendingMusic = { tracks: [track, explicitTrack], albums: [album] };

/** A search that found every kind but playlists. */
export const found: SearchResults = {
  tracks: [track],
  albums: [album],
  artists: [artist],
  playlists: [],
};

export const foundMore: SearchResults = {
  tracks: [explicitTrack],
  albums: [],
  artists: [artist],
  playlists: [playlist],
};

export const nothingFound: SearchResults = { tracks: [], albums: [], artists: [], playlists: [] };

// MESSAGES

export const url = (path: string): Url => Option.getOrThrow(fromString(`https://bafle.test${path}`));

/** The browser's address changed. Sent on its own, it is the listener going Back or Forward. */
export const changedUrl = (path: string): Message => Message.ChangedUrl({ url: url(path) });

/** The listener pressed a link. */
export const clickedLink = (path: string): Message =>
  Message.ClickedLink({ request: UrlRequest.Internal({ url: url(path) }) });

/** The listener pressed the control at the end of a row: its menu opens, or closes. */
export const pressedMore = (from: PlayOrigin, trackId: TrackId): Message =>
  Message.GotRowsMessage({
    message: Rows.Message.GotMenuMessage({
      rowId: { from, trackId },
      message: Menu.Message.ClickedButton(),
    }),
  });

/** The listener chose one of the things a row's menu offers. */
export const choseFromRow = (from: PlayOrigin, trackId: TrackId, action: RowAction): Message =>
  Message.GotRowsMessage({
    message: Rows.Message.GotMenuMessage({
      rowId: { from, trackId },
      message: Menu.Message.SelectedItem({ index: 0, item: action }),
    }),
  });

/** The listener chose one of the things the expanded player's menu offers. */
export const choseFromPlayer = (action: PlayerAction): Message =>
  Message.GotPlayerMessage({
    message: Player.Message.GotMoreMenuMessage({
      message: Menu.Message.SelectedItem({ index: 0, item: action }),
    }),
  });

type QueryFailure = (typeof Catalog.Message.FailedHomeFeed.Type)["failure"];

/** The catalog's provider is down: the Api's own, typed refusal. */
const refused: QueryFailure = { _tag: "Rejected", rejection: new CatalogUnavailable() };

/**
 * The reply never made it back, or none came in time: all the client can say
 * is that it does not know.
 */
const lost: QueryFailure = { _tag: "Unknown" };

/** The catalog's replies as the Api client reports them, before the app wraps them. */
export const reply = {
  home: (requestId: string, result: FeaturedMusic = featured) =>
    Catalog.Message.SucceededHomeFeed({ requestId, result }),
  homeRefused: (requestId: string) =>
    Catalog.Message.FailedHomeFeed({ requestId, failure: refused }),
  homeLost: (requestId: string) => Catalog.Message.FailedHomeFeed({ requestId, failure: lost }),
  newMusic: (requestId: string, result: TrendingMusic = trending) =>
    Catalog.Message.SucceededNewMusic({ requestId, result }),
  newMusicRefused: (requestId: string) =>
    Catalog.Message.FailedNewMusic({ requestId, failure: refused }),
  newMusicLost: (requestId: string) =>
    Catalog.Message.FailedNewMusic({ requestId, failure: lost }),
  search: (requestId: string, result: SearchResults = found) =>
    Catalog.Message.SucceededCatalogSearch({ requestId, result }),
  searchRefused: (requestId: string) =>
    Catalog.Message.FailedCatalogSearch({ requestId, failure: refused }),
  searchLost: (requestId: string) =>
    Catalog.Message.FailedCatalogSearch({ requestId, failure: lost }),
  track: (requestId: string, result: Track = fullTrack) =>
    Catalog.Message.SucceededTrackDetail({ requestId, result }),
  /** The catalog has no such track: its other typed refusal, and a final one. */
  trackMissing: (requestId: string, trackId: TrackId = track.id) =>
    Catalog.Message.FailedTrackDetail({
      requestId,
      failure: { _tag: "Rejected", rejection: new TrackNotFound({ trackId }) },
    }),
  trackRefused: (requestId: string) =>
    Catalog.Message.FailedTrackDetail({ requestId, failure: refused }),
  trackLost: (requestId: string) =>
    Catalog.Message.FailedTrackDetail({ requestId, failure: lost }),
  album: (requestId: string, result: Album = fullAlbum) =>
    Catalog.Message.SucceededAlbumDetail({ requestId, result }),
  /** The catalog has no such album: a final refusal, as for a track. */
  albumMissing: (requestId: string, albumId: AlbumId = album.id) =>
    Catalog.Message.FailedAlbumDetail({
      requestId,
      failure: { _tag: "Rejected", rejection: new AlbumNotFound({ albumId }) },
    }),
  albumRefused: (requestId: string) =>
    Catalog.Message.FailedAlbumDetail({ requestId, failure: refused }),
  albumLost: (requestId: string) =>
    Catalog.Message.FailedAlbumDetail({ requestId, failure: lost }),
  artist: (requestId: string, result: Artist = fullArtist) =>
    Catalog.Message.SucceededArtistDetail({ requestId, result }),
  /** The catalog has no such artist: a final refusal, as for a track. */
  artistMissing: (requestId: string, artistId: ArtistId = artist.id) =>
    Catalog.Message.FailedArtistDetail({
      requestId,
      failure: { _tag: "Rejected", rejection: new ArtistNotFound({ artistId }) },
    }),
  artistRefused: (requestId: string) =>
    Catalog.Message.FailedArtistDetail({ requestId, failure: refused }),
  artistLost: (requestId: string) =>
    Catalog.Message.FailedArtistDetail({ requestId, failure: lost }),
  playlist: (requestId: string, result: Playlist = fullPlaylist) =>
    Catalog.Message.SucceededPlaylistDetail({ requestId, result }),
  /** The catalog has no such playlist: a final refusal, as for a track. */
  playlistMissing: (requestId: string, playlistId: PlaylistId = playlist.id) =>
    Catalog.Message.FailedPlaylistDetail({
      requestId,
      failure: { _tag: "Rejected", rejection: new PlaylistNotFound({ playlistId }) },
    }),
  playlistRefused: (requestId: string) =>
    Catalog.Message.FailedPlaylistDetail({ requestId, failure: refused }),
  playlistLost: (requestId: string) =>
    Catalog.Message.FailedPlaylistDetail({ requestId, failure: lost }),
  genres: (requestId: string, result: MusicGenres = allGenres) =>
    Catalog.Message.SucceededGenreList({ requestId, result }),
  genresRefused: (requestId: string) =>
    Catalog.Message.FailedGenreList({ requestId, failure: refused }),
  genresLost: (requestId: string) => Catalog.Message.FailedGenreList({ requestId, failure: lost }),
  genre: (requestId: string, result: Genre = fullGenre) =>
    Catalog.Message.SucceededGenreDetail({ requestId, result }),
  /** The catalog has no such genre: a final refusal, as for a track. */
  genreMissing: (requestId: string, genreId: GenreId = genre.id) =>
    Catalog.Message.FailedGenreDetail({
      requestId,
      failure: { _tag: "Rejected", rejection: new GenreNotFound({ genreId }) },
    }),
  genreRefused: (requestId: string) =>
    Catalog.Message.FailedGenreDetail({ requestId, failure: refused }),
  genreLost: (requestId: string) =>
    Catalog.Message.FailedGenreDetail({ requestId, failure: lost }),
  radio: (requestId: string, result: RadioStations = allStations) =>
    Catalog.Message.SucceededStationList({ requestId, result }),
  radioRefused: (requestId: string) =>
    Catalog.Message.FailedStationList({ requestId, failure: refused }),
  radioLost: (requestId: string) =>
    Catalog.Message.FailedStationList({ requestId, failure: lost }),
  station: (requestId: string, result: Station = fullStation) =>
    Catalog.Message.SucceededStationDetail({ requestId, result }),
  /** The catalog has no such station: a final refusal, as for a track. */
  stationMissing: (requestId: string, stationId: StationId = station.id) =>
    Catalog.Message.FailedStationDetail({
      requestId,
      failure: { _tag: "Rejected", rejection: new StationNotFound({ stationId }) },
    }),
  stationRefused: (requestId: string) =>
    Catalog.Message.FailedStationDetail({ requestId, failure: refused }),
  stationLost: (requestId: string) =>
    Catalog.Message.FailedStationDetail({ requestId, failure: lost }),
};

/** A reply as `update` receives it. A late reply is sent this way: its Command is long gone. */
export const arrived = (message: typeof Catalog.Message.Type): Message =>
  Message.GotCatalogMessage({ message });

// MODELS

/** The id the next request or typing pause started from this Model will carry. */
export const nextId = (model: Model): string => DomainFoldkit.next(model.requestIds).commandId;

/** The id of the request or pause this Model is waiting for. */
export const awaitedId = (model: Model): string =>
  Awaiting.match(model.awaiting, {
    Nothing: () => {
      throw new Error("This Model awaits nothing");
    },
    TypingPause: ({ pauseId }) => pauseId,
    Reply: ({ requestId }) => requestId,
    Intention: ({ requestId }) => requestId,
    Arrival: ({ requestId }) => requestId,
  });

/** The Model after these Messages, Commands unrun: for setting a test's starting point. */
export const after = (model: Model, ...messages: ReadonlyArray<Message>): Model =>
  messages.reduce((current, message) => update(current, message).model, model);

/**
 * What a test that launches the app answers the sections asked for ahead
 * with, when it is not about them: nobody answers any, which is said nowhere
 * and leaves every section as the test set it. `first` is the number of the
 * first of those requests; `sections` are the ones asked for, in order.
 */
export const aheadUnanswered = (first: number, ...sections: ReadonlyArray<ListedSection>) =>
  sections.map((section, index) => {
    const requestId = `page:${first + index}`;
    switch (section) {
      case "Home":
        return [Catalog.HomeFeed, reply.homeLost(requestId)] as const;
      case "New":
        return [Catalog.NewMusic, reply.newMusicLost(requestId)] as const;
      case "Genres":
        return [Catalog.GenreList, reply.genresLost(requestId)] as const;
      case "Radio":
        return [Catalog.StationList, reply.radioLost(requestId)] as const;
    }
  });

/**
 * What a test that launches the app answers the Command of the launch with:
 * the bar a phone draws over the app was given the ground of its pages.
 */
export const barPainted = [PaintSystemBar, Message.CompletedPaintSystemBar()] as const;

/** The app as a fresh page load leaves it, before any reply. */
export const opened = (path: string): Model => init(url(path)).model;

/** The listener pressed a link. Whether the URL moves now or when the page arrives is the app's call. */
export const chose = (model: Model, path: string): Model => after(model, clickedLink(path));

/**
 * The reply awaited arrives. When it lets a page chosen by a link take the
 * screen, the app moves the URL, and that change comes back: here it does.
 */
export const answered = (
  model: Model,
  answer: (requestId: string) => typeof Catalog.Message.Type,
  path?: string,
): Model =>
  after(
    model,
    arrived(answer(awaitedId(model))),
    ...(path === undefined ? [] : [changedUrl(path)]),
  );

/** Home on screen with its feed, nothing awaited. */
export const onHome: Model = answered(opened("/"), reply.home);

/** Home still on screen; the listener chose New, which has never loaded. The URL has not moved. */
export const leavingHomeForNew: Model = chose(onHome, "/new");

/** New on screen with its charts, reached from Home by a link: both pages hold data. */
export const onNew: Model = answered(leavingHomeForNew, reply.newMusic, "/new");

/** New still on screen; the listener chose its first track, which has never loaded. */
export const openingTrack: Model = chose(onNew, trackPath(track.id));

/** The first track's page on screen, opened from New: New is behind it, as it was left. */
export const onTrack: Model = answered(openingTrack, reply.track, trackPath(track.id));

/** Search on screen with the results for "daft", reached by a direct link. */
export const onSearch: Model = answered(opened("/search?q=daft"), reply.search);

/** New still on screen; "Go to album" was chosen from the menu of its first row. The album has never loaded. */
export const openingAlbumFromRow: Model = after(onNew, choseFromRow("New", track.id, "OpenAlbum"));

/** The first album's page on screen, opened from that row: New is behind it, as it was left. */
export const onAlbum: Model = answered(openingAlbumFromRow, reply.album, albumPath(album.id));

/** Home still on screen; the listener chose the first album's tile, which has never loaded. */
export const openingAlbumFromTile: Model = chose(onHome, albumPath(album.id));

/** Home still on screen; the listener chose the first artist's tile, who has never loaded. */
export const openingArtistFromTile: Model = chose(onHome, artistPath(artist.id));

/** The first artist's page on screen, opened from that tile: Home is behind it, as it was left. */
export const onArtist: Model = answered(openingArtistFromTile, reply.artist, artistPath(artist.id));

/** Home still on screen; the listener chose the playlist's tile, which has never loaded. */
export const openingPlaylistFromTile: Model = chose(onHome, playlistPath(playlist.id));

/** The playlist's page on screen, opened from that tile: Home is behind it, as it was left. */
export const onPlaylist: Model = answered(
  openingPlaylistFromTile,
  reply.playlist,
  playlistPath(playlist.id),
);

/** Genres on screen with every genre, reached by a direct link: nothing is behind it. */
export const onGenres: Model = answered(opened("/genres"), reply.genres);

/** Genres still on screen; the listener chose the first genre's tile, which has never loaded. */
export const openingGenreFromTile: Model = chose(onGenres, genrePath(genre.id));

/** The first genre's page on screen, opened from that tile: Genres is behind it, as it was left. */
export const onGenre: Model = answered(openingGenreFromTile, reply.genre, genrePath(genre.id));

/** Radio on screen with its stations, reached by a direct link: nothing is behind it. */
export const onRadio: Model = answered(opened("/radio"), reply.radio);

/** Radio still on screen; the listener chose the first station's tile, which has never loaded. */
export const openingStationFromTile: Model = chose(onRadio, stationPath(station.id));

/** The first station's page on screen, opened from that tile: Radio is behind it, as it was left. */
export const onStation: Model = answered(
  openingStationFromTile,
  reply.station,
  stationPath(station.id),
);

// SCENES

/**
 * A scene of the whole app. The shell enters the document with the scene's
 * first step, and the Mount bound to it is answered here, once for every
 * scene: it holds the dock's motion for a frame and tells the Model nothing.
 */
export const scene = (
  app: Parameters<typeof foldkitScene<Model, Message>>[0],
  start: SceneStep<Model, Message, undefined>,
  ...steps: ReadonlyArray<SceneStep<Model, Message, undefined>>
): void =>
  foldkitScene(
    app,
    start,
    Mount.resolveAll([HoldDockMotion, Message.CompletedHoldDockMotion()]),
    ...steps,
  );
