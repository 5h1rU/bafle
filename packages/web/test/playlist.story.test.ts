import { PlaylistId } from "@bafle/domain/Catalog/Playlist";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import { describe, expect, test } from "vitest";
import { init, update } from "../src/main.ts";
import { Message } from "../src/message.ts";
import {
  Awaiting,
  type Model,
  PlaylistData,
  maybeAlbumIdInDocument,
  maybePlaylistIdInDocument,
  playlistData,
  wayBack,
} from "../src/model.ts";
import * as Player from "../src/player/index.ts";
import { AppRoute, isSamePage, routeToUrl, urlToAppRoute } from "../src/route.ts";
import { PAGE_IDS } from "../src/view/layout.ts";
import {
  after,
  album,
  albumPath,
  answered,
  arrived,
  awaitedId,
  changedUrl,
  chose,
  choseFromRow,
  clickedLink,
  explicitTrack,
  foundMore,
  fullPlaylist,
  onHome,
  onPlaylist,
  opened,
  openingPlaylistFromTile,
  playlist,
  playlistPath,
  reply,
  track,
  trackPath,
  url,
} from "./fixtures.ts";

const playlistRoute = AppRoute.Playlist({ playlistId: playlist.id });
const otherPlaylistId = PlaylistId.make("pl-9");

/** What a result of `init` or `update` asks the runtime to do, as name and args. */
const asked = (result: ReturnType<typeof init>) =>
  (result.commands ?? []).map((command) => [command.name, command.args]);

const names = (result: ReturnType<typeof init>): ReadonlyArray<string> =>
  (result.commands ?? []).map((command) => command.name);

const session = (model: Model): Player.Session => Option.getOrThrow(model.player.maybeSession);

describe("the playlist's route", () => {
  test("a playlist's address is its own, and leads back to it", () => {
    expect(urlToAppRoute(url(playlistPath(playlist.id)))).toEqual(playlistRoute);
    expect(routeToUrl(playlistRoute)).toBe("/playlist/pl-1");
  });

  test("every playlist has a page of its own", () => {
    expect(isSamePage(playlistRoute, AppRoute.Playlist({ playlistId: playlist.id }))).toBe(true);
    expect(isSamePage(playlistRoute, AppRoute.Playlist({ playlistId: otherPlaylistId }))).toBe(
      false,
    );
    expect(isSamePage(playlistRoute, AppRoute.Album({ albumId: album.id }))).toBe(false);
  });
});

describe("a playlist reached by its address", () => {
  test("it is on screen at once, loading, and its data is asked for", () => {
    const opening = init(url(playlistPath(playlist.id)));

    expect(opening.model.route).toEqual(playlistRoute);
    expect(playlistData(opening.model, playlist.id)).toEqual(PlaylistData.Loading());
    expect(asked(opening)).toEqual([
      ["PlaylistDetail", { input: { playlistId: playlist.id }, requestId: "page:0" }],
    ]);
  });

  test("the reply settles under the playlist's id: the playlist, a failure, or that there is none", () => {
    const loading = opened(playlistPath(playlist.id));

    expect(playlistData(answered(loading, reply.playlist), playlist.id)).toEqual(
      PlaylistData.Success({ data: Option.some(fullPlaylist) }),
    );
    expect(playlistData(answered(loading, reply.playlistRefused), playlist.id)).toEqual(
      PlaylistData.Failure({ error: "CatalogUnavailable" }),
    );
    expect(playlistData(answered(loading, reply.playlistLost), playlist.id)).toEqual(
      PlaylistData.Failure({ error: "Unreachable" }),
    );
    expect(playlistData(answered(loading, reply.playlistMissing), playlist.id)).toEqual(
      PlaylistData.Success({ data: Option.none() }),
    );
  });

  test("Try again loads the page where it stands, and a playlist known to be missing is not asked for again", () => {
    const failed = answered(opened(playlistPath(playlist.id)), reply.playlistRefused);
    const retried = update(failed, Message.ClickedTryAgain());
    expect(names(retried)).toEqual(["PlaylistDetail", "FocusPage"]);
    expect(names(retried)).not.toContain("NavigateInternal");

    const missing = answered(opened(playlistPath(playlist.id)), reply.playlistMissing);
    expect(names(update(missing, clickedLink(playlistPath(playlist.id))))).not.toContain(
      "PlaylistDetail",
    );
  });
});

describe("a playlist chosen from a shelf", () => {
  test("the page it was chosen on is held, and the URL stays", () => {
    const chosen = update(onHome, clickedLink(playlistPath(playlist.id)));

    expect(chosen.model.route).toEqual(AppRoute.Home());
    expect(chosen.model.awaiting).toMatchObject({ _tag: "Intention", route: playlistRoute });
    expect(playlistData(chosen.model, playlist.id)).toEqual(PlaylistData.Loading());
    expect(names(chosen)).toEqual(["PlaylistDetail"]);
  });

  test("when the playlist arrives its page takes the screen, the URL and the focus, with the shelf behind it", () => {
    const arriving = update(
      openingPlaylistFromTile,
      arrived(reply.playlist(awaitedId(openingPlaylistFromTile))),
    );

    expect(arriving.model.route).toEqual(playlistRoute);
    expect(arriving.model.awaiting).toEqual(Awaiting.Nothing());
    expect(wayBack(arriving.model)).toEqual(Option.some(AppRoute.Home()));
    expect(asked(arriving)).toEqual([
      ["FocusPage", { pageId: PAGE_IDS.Playlist }],
      ["NavigateInternal", { url: "/playlist/pl-1" }],
    ]);
  });

  test("a tile has no room to state a failure: the playlist's page takes the screen and says it", () => {
    const failing = update(
      openingPlaylistFromTile,
      arrived(reply.playlistRefused(awaitedId(openingPlaylistFromTile))),
    );

    expect(failing.model.route).toEqual(playlistRoute);
    expect(playlistData(failing.model, playlist.id)).toEqual(
      PlaylistData.Failure({ error: "CatalogUnavailable" }),
    );
    expect(names(failing)).toContain("NavigateInternal");
    expect(wayBack(failing.model)).toEqual(Option.some(AppRoute.Home()));
  });

  test("so does the page of a playlist the catalog does not have", () => {
    const missing = update(
      openingPlaylistFromTile,
      arrived(reply.playlistMissing(awaitedId(openingPlaylistFromTile))),
    );

    expect(missing.model.route).toEqual(playlistRoute);
    expect(playlistData(missing.model, playlist.id)).toEqual(
      PlaylistData.Success({ data: Option.none() }),
    );
    expect(names(missing)).toContain("NavigateInternal");
  });

  test("the latest intention wins: another choice abandons the playlist without a trace", () => {
    const elsewhere = after(openingPlaylistFromTile, clickedLink("/new"));

    expect(elsewhere.route).toEqual(AppRoute.Home());
    expect(HashMap.has(elsewhere.playlists, playlist.id)).toBe(false);
    // Its reply, if it still comes, matches nothing.
    const late = update(elsewhere, arrived(reply.playlist(awaitedId(openingPlaylistFromTile))));
    expect(late.model.playlists).toBe(elsewhere.playlists);
    expect(late.model.route).toEqual(AppRoute.Home());
    expect(names(late)).not.toContain("NavigateInternal");
  });

  test("a playlist already held opens at once and refreshes behind its page", () => {
    const backOnHome = after(onPlaylist, changedUrl("/"));
    const again = update(backOnHome, clickedLink(playlistPath(playlist.id)));

    expect(again.model.route).toEqual(playlistRoute);
    expect(playlistData(again.model, playlist.id)).toEqual(
      PlaylistData.Refreshing({ data: Option.some(fullPlaylist) }),
    );
    expect(names(again)).toContain("NavigateInternal");
    expect(names(again)).toContain("PlaylistDetail");
  });
});

describe("back from a playlist", () => {
  test("the focus goes to the tile it was chosen from", () => {
    const back = update(onPlaylist, changedUrl("/"));

    expect(back.model.route).toEqual(AppRoute.Home());
    expect(asked(back)).toContainEqual([
      "FocusPlaylistTile",
      { pageId: PAGE_IDS.Home, playlistId: playlist.id },
    ]);
  });

  test("on Search too, where the tile takes it and not the field", () => {
    const onSearchWithPlaylists = answered(opened("/search?q=touch"), (id) =>
      reply.search(id, foundMore),
    );
    const onPlaylistFromSearch = answered(
      chose(onSearchWithPlaylists, playlistPath(playlist.id)),
      reply.playlist,
      playlistPath(playlist.id),
    );
    const back = update(onPlaylistFromSearch, changedUrl("/search?q=touch"));

    expect(back.model.route._tag).toBe("Search");
    expect(asked(back)).toContainEqual([
      "FocusPlaylistTile",
      { pageId: PAGE_IDS.Search, playlistId: playlist.id },
    ]);
    expect(names(back)).not.toContain("FocusSearchField");
  });
});

describe("playing from the playlist's page", () => {
  const tapped = Message.ClickedPlayTrack({ trackId: explicitTrack.id, from: "Playlist" });

  test("the playlist becomes the queue: what follows is the rest of it that has something to play", () => {
    const playing = after(onPlaylist, tapped);

    expect(session(playing).current.id).toBe(explicitTrack.id);
    expect(session(playing).later.map((queued) => queued.id)).toEqual([track.id]);
  });

  test("playing is no navigation: the page, the URL and the history are as they were", () => {
    const playing = update(onPlaylist, tapped);

    expect(playing.model.route).toEqual(onPlaylist.route);
    expect(playing.model.trail).toEqual(onPlaylist.trail);
    expect(names(playing)).not.toContain("NavigateInternal");
  });

  test("a row of the playlist queues its track as a row of any list does", () => {
    const queued = after(
      after(onPlaylist, Message.ClickedPlayTrack({ trackId: track.id, from: "Playlist" })),
      choseFromRow("Playlist", explicitTrack.id, "AddToQueue"),
    );

    expect(session(queued).later.map((waiting) => waiting.id)).toEqual([explicitTrack.id]);
    expect(queued.rows.done.maybeRow).toEqual(
      Option.some({ from: "Playlist", trackId: explicitTrack.id, place: "Last" }),
    );
  });
});

describe("the playlist's page behind a page reached from it", () => {
  /** A song of the playlist opened from the playlist's own row: the playlist is behind its page. */
  const onSongFromPlaylist = answered(
    after(onPlaylist, choseFromRow("Playlist", track.id, "OpenSong")),
    reply.track,
    trackPath(track.id),
  );

  /** The album of one of its songs, asked from that song's row. */
  const onAlbumFromPlaylist = answered(
    after(onPlaylist, choseFromRow("Playlist", track.id, "OpenAlbum")),
    reply.album,
    albumPath(album.id),
  );

  test("the playlist on screen is the one in the document", () => {
    expect(maybePlaylistIdInDocument(onPlaylist.route, onPlaylist.trail)).toEqual(
      Option.some(playlist.id),
    );
    expect(maybePlaylistIdInDocument(onHome.route, onHome.trail)).toEqual(Option.none());
  });

  test("behind a song opened from it, the playlist stays in the document, and comes back with the focus on its row", () => {
    expect(onSongFromPlaylist.route).toEqual(AppRoute.Track({ trackId: track.id }));
    expect(maybePlaylistIdInDocument(onSongFromPlaylist.route, onSongFromPlaylist.trail)).toEqual(
      Option.some(playlist.id),
    );

    const back = update(onSongFromPlaylist, changedUrl(playlistPath(playlist.id)));
    expect(back.model.route).toEqual(playlistRoute);
    expect(asked(back)).toContainEqual([
      "FocusTrackRow",
      { pageId: PAGE_IDS.Playlist, trackId: track.id },
    ]);
  });

  test("Go to album on one of its rows holds the playlist, and the row is noted as the one that asked", () => {
    const chosen = update(onPlaylist, choseFromRow("Playlist", track.id, "OpenAlbum"));

    expect(chosen.model.route).toEqual(playlistRoute);
    expect(chosen.model.awaiting).toMatchObject({
      _tag: "Intention",
      route: AppRoute.Album({ albumId: album.id }),
    });
    expect(HashMap.get(chosen.model.albumRows, album.id)).toEqual(
      Option.some({ from: "Playlist", trackId: track.id }),
    );
    expect(names(chosen)).toEqual(["AlbumDetail"]);
  });

  test("behind an album asked from one of its rows, the playlist is kept, and the album comes back to that row", () => {
    expect(onAlbumFromPlaylist.route).toEqual(AppRoute.Album({ albumId: album.id }));
    expect(maybePlaylistIdInDocument(onAlbumFromPlaylist.route, onAlbumFromPlaylist.trail)).toEqual(
      Option.some(playlist.id),
    );

    const back = update(onAlbumFromPlaylist, changedUrl(playlistPath(playlist.id)));
    expect(back.model.route).toEqual(playlistRoute);
    expect(asked(back)).toContainEqual([
      "FocusTrackRow",
      { pageId: PAGE_IDS.Playlist, trackId: track.id },
    ]);
  });

  test("two pages on, the playlist and the album between are both kept", () => {
    const onSongFromAlbum = answered(
      after(onAlbumFromPlaylist, choseFromRow("Album", track.id, "OpenSong")),
      reply.track,
      trackPath(track.id),
    );

    expect(maybePlaylistIdInDocument(onSongFromAlbum.route, onSongFromAlbum.trail)).toEqual(
      Option.some(playlist.id),
    );
    expect(maybeAlbumIdInDocument(onSongFromAlbum.route, onSongFromAlbum.trail)).toEqual(
      Option.some(album.id),
    );
  });

  test("a playlist left for good is in the document no longer", () => {
    const backOnHome = after(onPlaylist, changedUrl("/"));
    expect(maybePlaylistIdInDocument(backOnHome.route, backOnHome.trail)).toEqual(Option.none());
  });

  test("another playlist chosen takes the one place there is", () => {
    const onOther = answered(
      chose(after(onSongFromPlaylist, clickedLink("/")), playlistPath(otherPlaylistId)),
      (id) => reply.playlist(id, { ...fullPlaylist, id: otherPlaylistId }),
      playlistPath(otherPlaylistId),
    );
    expect(maybePlaylistIdInDocument(onOther.route, onOther.trail)).toEqual(
      Option.some(otherPlaylistId),
    );
  });
});
