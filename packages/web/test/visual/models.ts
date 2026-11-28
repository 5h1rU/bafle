import * as Option from "effect/Option";
import type { Catalog } from "../../src/catalog.ts";
import { Message } from "../../src/message.ts";
import * as Player from "../../src/player/index.ts";
import {
  after,
  albumPath,
  answered,
  arrived,
  artistPath,
  changedUrl,
  chose,
  choseFromPlayer,
  clickedLink,
  genrePath,
  nextId,
  opened,
  playlistPath,
  reply,
  stationPath,
  trackPath,
} from "../fixtures.ts";
import {
  allGenres,
  allStations,
  featured,
  firstTrack,
  found,
  foundNoArtist,
  fullAlbum,
  fullArtist,
  fullGenre,
  fullPlaylist,
  fullStation,
  fullTrack,
  shortAlbum,
  trending,
} from "./catalog.ts";

// THE APP AS IT IS LOOKED AT

// Each Model here is reached the way the app reaches it: by its own `update`,
// from the Messages a listener and a catalog would send.

type CatalogMessage = typeof Catalog.Message.Type;

/** A reply with the catalog these tests look at, in place of the one the reply is given by default. */
const saying =
  <A>(answer: (requestId: string, result: A) => CatalogMessage, result: A) =>
  (requestId: string): CatalogMessage =>
    answer(requestId, result);

const player = (message: Player.Message): Message => Message.GotPlayerMessage({ message });

// SECTIONS

export const home = answered(opened("/"), saying(reply.home, featured));
export const homeWaiting = opened("/");
export const homeFailed = answered(opened("/"), reply.homeRefused);
export const homeEmpty = answered(
  opened("/"),
  saying(reply.home, { albums: [], playlists: [], artists: [] }),
);

export const newMusic = answered(opened("/new"), saying(reply.newMusic, trending));
export const newWaiting = opened("/new");

export const genres = answered(opened("/genres"), saying(reply.genres, allGenres));
export const genresWaiting = opened("/genres");

export const radio = answered(opened("/radio"), saying(reply.radio, allStations));
export const radioWaiting = opened("/radio");

// SEARCH

export const searchEmpty = opened("/search");
export const searchAsking = opened("/search?q=daft");
export const searchFound = answered(searchAsking, saying(reply.search, found));
export const searchFoundNoArtist = answered(searchAsking, saying(reply.search, foundNoArtist));
export const searchNothing = answered(
  searchAsking,
  saying(reply.search, { tracks: [], albums: [], artists: [], playlists: [] }),
);
export const searchFailed = answered(searchAsking, reply.searchRefused);

// PAGES

const albumId = fullAlbum.id;

export const track = answered(opened(trackPath(firstTrack.id)), saying(reply.track, fullTrack));
export const trackWaiting = opened(trackPath(firstTrack.id));
export const trackMissing = answered(opened(trackPath(firstTrack.id)), reply.trackMissing);

export const album = answered(
  chose(home, albumPath(albumId)),
  saying(reply.album, fullAlbum),
  albumPath(albumId),
);
export const albumWaiting = opened(albumPath(albumId));
export const albumMissing = answered(opened(albumPath(albumId)), reply.albumMissing);
export const albumFailed = answered(opened(albumPath(albumId)), reply.albumRefused);
export const albumOfOneSong = answered(
  opened(albumPath(shortAlbum.id)),
  saying(reply.album, shortAlbum),
);
/** Home with the first album's tile chosen, and its page on its way: the tile's record is out. */
export const albumOpening = chose(home, albumPath(albumId));
/** Home still on screen: the album's tile could not ask for its page, and its record broke. */
export const albumFailedFromTile = answered(albumOpening, reply.albumRefused);

export const artist = answered(opened(artistPath(fullArtist.id)), saying(reply.artist, fullArtist));
export const artistWaiting = opened(artistPath(fullArtist.id));

export const playlist = answered(
  opened(playlistPath(fullPlaylist.id)),
  saying(reply.playlist, fullPlaylist),
);
export const playlistWaiting = opened(playlistPath(fullPlaylist.id));

export const genre = answered(opened(genrePath(fullGenre.id)), saying(reply.genre, fullGenre));
export const genreWaiting = opened(genrePath(fullGenre.id));

export const station = answered(
  opened(stationPath(fullStation.id)),
  saying(reply.station, fullStation),
);
export const stationWaiting = opened(stationPath(fullStation.id));

export const notFound = opened("/nowhere/at/all");

// THE PLAYER

const said = (
  order: number,
  phase: Player.EngineReport["phase"],
  positionSeconds: number,
): Message =>
  player(
    Player.Message.UpdatedEngineStatus({
      report: {
        order,
        phase,
        positionSeconds,
        maybeDurationSeconds: Option.some(214),
        bufferedSeconds: 120,
        isSeeking: false,
      },
    }),
  );

/** New on screen, its first track sounding: the island is there, and the track's row is marked. */
export const sounding = after(
  newMusic,
  Message.ClickedPlayTrack({ trackId: firstTrack.id, from: "New" }),
  said(1, "Sounding", 42),
);

/** The same with the page scrolled down: the navigation drawn back to its circle, the island in its row. */
export const soundingScrolled = after(sounding, Message.ScrolledDown());

/** The island pressed: the player expanded on the track it holds, with what the catalog knows of it. */
export const expanded = after(
  sounding,
  clickedLink(trackPath(firstTrack.id)),
  arrived(reply.track(nextId(sounding), fullTrack)),
  changedUrl(trackPath(firstTrack.id)),
);

export const expandedQueue = after(expanded, player(Player.Message.ClickedQueue()));

export const expandedDetails = after(expanded, choseFromPlayer("SongDetails"));

/** The queue open beside the page, which is where it opens on a desktop's screen. */
export const queueBeside = after(
  sounding,
  Message.ChangedScreen({ screen: "Desktop" }),
  player(Player.Message.GotQueueMessage({ message: Player.Queue.Message.ClickedColumnControl() })),
);

// THE CATALOG NOT ANSWERING

/** Home held, and a refresh behind it that failed: the notice over the page's foot. */
export const homeStale = answered(
  chose(answered(chose(home, "/new"), saying(reply.newMusic, trending), "/new"), "/"),
  reply.homeRefused,
);
