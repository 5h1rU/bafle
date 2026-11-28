import { AlbumId } from "@bafle/domain/Catalog/Album";
import type { TrendingMusic } from "@bafle/domain/Catalog/MusicCatalog.external";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import { describe, expect, test } from "vitest";
import { init, update } from "../src/main.ts";
import { Message } from "../src/message.ts";
import {
  AlbumData,
  Awaiting,
  type Model,
  albumData,
  maybeAlbumIdInDocument,
  wayBack,
} from "../src/model.ts";
import * as Player from "../src/player/index.ts";
import { AppRoute, isSamePage, routeToUrl, urlToAppRoute } from "../src/route.ts";
import * as Rows from "../src/rows/index.ts";
import { PAGE_IDS } from "../src/view/layout.ts";
import {
  after,
  album,
  albumOpener,
  albumPath,
  answered,
  arrived,
  awaitedId,
  changedUrl,
  chose,
  choseFromRow,
  clickedLink,
  explicitTrack,
  fullAlbum,
  leavingHomeForNew,
  onAlbum,
  onHome,
  onNew,
  opened,
  openingAlbumFromRow,
  openingAlbumFromTile,
  pressedMore,
  reply,
  silentTrack,
  track,
  trackPath,
  url,
} from "./fixtures.ts";

const albumRoute = AppRoute.Album({ albumId: album.id });
const otherAlbumId = explicitTrack.album.id;

/** What a result of `init` or `update` asks the runtime to do, as name and args. */
const asked = (result: ReturnType<typeof init>) =>
  (result.commands ?? []).map((command) => [command.name, command.args]);

const names = (result: ReturnType<typeof init>): ReadonlyArray<string> =>
  (result.commands ?? []).map((command) => command.name);

const session = (model: Model): Player.Session => Option.getOrThrow(model.player.maybeSession);

describe("the album's route", () => {
  test("an album's address is its own, and leads back to it", () => {
    expect(urlToAppRoute(url(albumPath(album.id)))).toEqual(albumRoute);
    expect(routeToUrl(albumRoute)).toBe("/album/al-1");
  });

  test("every album has a page of its own", () => {
    expect(isSamePage(albumRoute, AppRoute.Album({ albumId: album.id }))).toBe(true);
    expect(isSamePage(albumRoute, AppRoute.Album({ albumId: otherAlbumId }))).toBe(false);
    expect(isSamePage(albumRoute, AppRoute.Track({ trackId: track.id }))).toBe(false);
  });
});

describe("an album reached by its address", () => {
  test("it is on screen at once, loading, and its data is asked for", () => {
    const opening = init(url(albumPath(album.id)));

    expect(opening.model.route).toEqual(albumRoute);
    expect(albumData(opening.model, album.id)).toEqual(AlbumData.Loading());
    expect(asked(opening)).toEqual([
      ["AlbumDetail", { input: { albumId: album.id }, requestId: "page:0" }],
    ]);
  });

  test("the reply settles under the album's id: the album, a failure, or that there is none", () => {
    const loading = opened(albumPath(album.id));

    expect(albumData(answered(loading, reply.album), album.id)).toEqual(
      AlbumData.Success({ data: Option.some(fullAlbum) }),
    );
    expect(albumData(answered(loading, reply.albumRefused), album.id)).toEqual(
      AlbumData.Failure({ error: "CatalogUnavailable" }),
    );
    expect(albumData(answered(loading, reply.albumLost), album.id)).toEqual(
      AlbumData.Failure({ error: "Unreachable" }),
    );
    expect(albumData(answered(loading, reply.albumMissing), album.id)).toEqual(
      AlbumData.Success({ data: Option.none() }),
    );
  });

  test("Try again loads the page where it stands, and an album known to be missing is not asked for again", () => {
    const failed = answered(opened(albumPath(album.id)), reply.albumRefused);
    const retried = update(failed, Message.ClickedTryAgain());
    expect(names(retried)).toEqual(["AlbumDetail", "FocusPage"]);
    expect(names(retried)).not.toContain("NavigateInternal");

    const missing = answered(opened(albumPath(album.id)), reply.albumMissing);
    expect(names(update(missing, clickedLink(albumPath(album.id))))).not.toContain("AlbumDetail");
  });
});

describe("Go to album, from a row's menu", () => {
  const row = { from: "New", trackId: track.id } as const;

  test("it is followed as a link is: the list is held, the URL stays, and the row is noted as the one that asked", () => {
    const chosen = update(
      after(onNew, pressedMore("New", track.id)),
      choseFromRow("New", track.id, "OpenAlbum"),
    );

    // The menu stays open while the album is on its way: its item says so.
    expect(Rows.menuOf(chosen.model.rows, row).isOpen).toBe(true);
    expect(chosen.model.route).toEqual(AppRoute.New());
    expect(chosen.model.awaiting).toMatchObject({ _tag: "Intention", route: albumRoute });
    expect(albumData(chosen.model, album.id)).toEqual(AlbumData.Loading());
    expect(HashMap.get(chosen.model.albumRows, album.id)).toEqual(Option.some(row));
    expect(names(chosen)).toContain("AlbumDetail");
    expect(names(chosen)).not.toContain("NavigateInternal");
  });

  test("when the album arrives its page takes the screen, the URL and the focus, with the list behind it", () => {
    const arriving = update(
      openingAlbumFromRow,
      arrived(reply.album(awaitedId(openingAlbumFromRow))),
    );

    expect(arriving.model.route).toEqual(albumRoute);
    expect(arriving.model.awaiting).toEqual(Awaiting.Nothing());
    expect(wayBack(arriving.model)).toEqual(Option.some(AppRoute.New()));
    expect(asked(arriving)).toEqual([
      ["FocusPage", { pageId: PAGE_IDS.Album }],
      ["NavigateInternal", { url: "/album/al-1" }],
    ]);
  });

  test("an album that fails to open leaves the list, the URL and the history as they were", () => {
    const failing = update(
      openingAlbumFromRow,
      arrived(reply.albumRefused(awaitedId(openingAlbumFromRow))),
    );

    expect(failing.model.route).toEqual(AppRoute.New());
    expect(failing.model.awaiting).toEqual(Awaiting.Nothing());
    expect(failing.model.trail).toEqual(onNew.trail);
    expect(albumData(failing.model, album.id)).toEqual(
      AlbumData.Failure({ error: "CatalogUnavailable" }),
    );
    expect(asked(failing)).toEqual([]);
  });

  test("the item of the row's menu, pressed again, asks again in place", () => {
    const failed = answered(openingAlbumFromRow, reply.albumRefused);
    const retried = update(failed, choseFromRow(row.from, row.trackId, "OpenAlbum"));

    expect(retried.model.route).toEqual(AppRoute.New());
    expect(retried.model.awaiting).toMatchObject({ _tag: "Intention", route: albumRoute });
    expect(albumData(retried.model, album.id)).toEqual(AlbumData.Loading());
    expect(asked(retried)).toEqual([
      ["AlbumDetail", { input: { albumId: album.id }, requestId: "page:4" }],
    ]);
  });

  test("an album the catalog does not have stays where its row is, for good", () => {
    const missing = update(
      openingAlbumFromRow,
      arrived(reply.albumMissing(awaitedId(openingAlbumFromRow))),
    );

    expect(missing.model.route).toEqual(AppRoute.New());
    expect(albumData(missing.model, album.id)).toEqual(AlbumData.Success({ data: Option.none() }));
    // What was chosen is no longer to be pressed in the row's menu: the row is given the focus back.
    expect(asked(missing)).toEqual([
      ["FocusTrackRow", { pageId: PAGE_IDS.New, trackId: track.id }],
    ]);

    // Asking for it again, by a Message that was already on its way, changes nothing.
    const again = update(missing.model, choseFromRow(row.from, row.trackId, "OpenAlbum"));
    expect(again.model.awaiting).toEqual(Awaiting.Nothing());
    expect(again.model.route).toEqual(AppRoute.New());
    expect(names(again)).not.toContain("AlbumDetail");
  });

  test("the latest intention wins: another choice abandons the album without a trace", () => {
    const elsewhere = after(openingAlbumFromRow, clickedLink("/"));

    expect(elsewhere.route).toEqual(AppRoute.Home());
    expect(HashMap.has(elsewhere.albums, album.id)).toBe(false);
    // Its reply, if it still comes, matches nothing.
    const late = update(elsewhere, arrived(reply.album(awaitedId(openingAlbumFromRow))));
    expect(late.model.albums).toBe(elsewhere.albums);
    expect(late.model.route).toEqual(AppRoute.Home());
    expect(names(late)).not.toContain("NavigateInternal");
  });

  test("another row's album is another question: only the one asked last is loading", () => {
    const other = after(openingAlbumFromRow, choseFromRow("New", explicitTrack.id, "OpenAlbum"));

    expect(HashMap.has(other.albums, album.id)).toBe(false);
    expect(albumData(other, otherAlbumId)).toEqual(AlbumData.Loading());
    expect(HashMap.get(other.albumRows, otherAlbumId)).toEqual(
      Option.some({ from: "New", trackId: explicitTrack.id }),
    );
  });

  test("a row whose album is the same as another's takes the question over", () => {
    const sameAlbum: TrendingMusic = { tracks: [track, silentTrack], albums: [] };
    const onBoth = answered(leavingHomeForNew, (id) => reply.newMusic(id, sameAlbum), "/new");
    const first = after(onBoth, choseFromRow("New", track.id, "OpenAlbum"));
    const second = after(first, choseFromRow("New", silentTrack.id, "OpenAlbum"));

    expect(HashMap.get(second.albumRows, album.id)).toEqual(
      Option.some({ from: "New", trackId: silentTrack.id }),
    );
    expect(albumData(second, album.id)).toEqual(AlbumData.Loading());
  });

  test("an album already held opens at once and refreshes behind its page", () => {
    const backOnNew = after(onAlbum, changedUrl("/new"));
    const again = update(backOnNew, choseFromRow("New", track.id, "OpenAlbum"));

    expect(again.model.route).toEqual(albumRoute);
    expect(albumData(again.model, album.id)).toEqual(
      AlbumData.Refreshing({ data: Option.some(fullAlbum) }),
    );
    expect(names(again)).toContain("NavigateInternal");
    expect(names(again)).toContain("AlbumDetail");
  });
});

describe("an album chosen from a shelf", () => {
  test("the page it was chosen on is held, and no row speaks for it", () => {
    const chosen = update(onHome, clickedLink(albumPath(album.id)));

    expect(chosen.model.route).toEqual(AppRoute.Home());
    expect(chosen.model.awaiting).toMatchObject({ _tag: "Intention", route: albumRoute });
    expect(HashMap.has(chosen.model.albumRows, album.id)).toBe(false);
    expect(names(chosen)).toEqual(["AlbumDetail"]);
  });

  test("a tile has no room to state a failure: the album's page takes the screen and says it", () => {
    const failing = update(
      openingAlbumFromTile,
      arrived(reply.albumRefused(awaitedId(openingAlbumFromTile))),
    );

    expect(failing.model.route).toEqual(albumRoute);
    expect(albumData(failing.model, album.id)).toEqual(
      AlbumData.Failure({ error: "CatalogUnavailable" }),
    );
    expect(names(failing)).toContain("NavigateInternal");
    expect(wayBack(failing.model)).toEqual(Option.some(AppRoute.Home()));
  });

  test("so does the page of an album the catalog does not have", () => {
    const missing = update(
      openingAlbumFromTile,
      arrived(reply.albumMissing(awaitedId(openingAlbumFromTile))),
    );

    expect(missing.model.route).toEqual(albumRoute);
    expect(names(missing)).toContain("NavigateInternal");
  });

  test("a tile chosen after a row failed to open the album takes the question from the row", () => {
    const failedFromRow = answered(openingAlbumFromRow, reply.albumRefused);
    const fromTile = chose(failedFromRow, albumPath(album.id));

    expect(HashMap.has(fromTile.albumRows, album.id)).toBe(false);
    expect(fromTile.route).toEqual(AppRoute.New());
    // This time the failure has nowhere on the list to be said: the page says it.
    expect(answered(fromTile, reply.albumRefused, albumPath(album.id)).route).toEqual(albumRoute);
  });
});

describe("back from an album", () => {
  test("the focus goes to the row whose menu it was asked from", () => {
    const back = update(onAlbum, changedUrl("/new"));

    expect(back.model.route).toEqual(AppRoute.New());
    expect(asked(back)).toContainEqual([
      "FocusTrackRow",
      { pageId: PAGE_IDS.New, trackId: track.id },
    ]);
  });

  test("or to the tile it was chosen from", () => {
    const onAlbumFromTile = answered(openingAlbumFromTile, reply.album, albumPath(album.id));
    const back = update(onAlbumFromTile, changedUrl("/"));

    expect(back.model.route).toEqual(AppRoute.Home());
    expect(asked(back)).toContainEqual([
      "FocusAlbumTile",
      { pageId: PAGE_IDS.Home, albumId: album.id },
    ]);
  });
});

describe("playing from the album's page", () => {
  const tapped = Message.ClickedPlayTrack({ trackId: albumOpener.id, from: "Album" });

  test("the album becomes the queue: what follows is the rest of it that has something to play", () => {
    const playing = after(onAlbum, tapped);

    expect(session(playing).current.id).toBe(albumOpener.id);
    expect(session(playing).later.map((queued) => queued.id)).toEqual([track.id]);
  });

  test("playing is no navigation: the page, the URL and the history are as they were", () => {
    const playing = update(onAlbum, tapped);

    expect(playing.model.route).toEqual(onAlbum.route);
    expect(playing.model.trail).toEqual(onAlbum.trail);
    expect(names(playing)).not.toContain("NavigateInternal");
  });

  test("a row of the album queues its track as a row of any list does", () => {
    const queued = after(
      after(onAlbum, Message.ClickedPlayTrack({ trackId: track.id, from: "Album" })),
      choseFromRow("Album", albumOpener.id, "AddToQueue"),
    );

    expect(session(queued).later.map((waiting) => waiting.id)).toEqual([albumOpener.id]);
    expect(queued.rows.done.maybeRow).toEqual(
      Option.some({ from: "Album", trackId: albumOpener.id, place: "Last" }),
    );
  });
});

describe("the album's page behind a page reached from it", () => {
  /** A song of the album opened from the album's own row: the album is behind its page. */
  const onSongFromAlbum = answered(
    after(onAlbum, choseFromRow("Album", track.id, "OpenSong")),
    reply.track,
    trackPath(track.id),
  );

  test("the album on screen is the one in the document", () => {
    expect(maybeAlbumIdInDocument(onAlbum.route, onAlbum.trail)).toEqual(Option.some(album.id));
    expect(maybeAlbumIdInDocument(onNew.route, onNew.trail)).toEqual(Option.none());
  });

  test("behind a song opened from it, the album stays in the document, and comes back with the focus on its row", () => {
    expect(onSongFromAlbum.route).toEqual(AppRoute.Track({ trackId: track.id }));
    expect(maybeAlbumIdInDocument(onSongFromAlbum.route, onSongFromAlbum.trail)).toEqual(
      Option.some(album.id),
    );

    const back = update(onSongFromAlbum, changedUrl(albumPath(album.id)));
    expect(back.model.route).toEqual(albumRoute);
    expect(asked(back)).toContainEqual([
      "FocusTrackRow",
      { pageId: PAGE_IDS.Album, trackId: track.id },
    ]);
  });

  test("an album left for good is in the document no longer", () => {
    const backOnNew = after(onAlbum, changedUrl("/new"));
    expect(maybeAlbumIdInDocument(backOnNew.route, backOnNew.trail)).toEqual(Option.none());
  });

  test("another album chosen takes the one place there is", () => {
    const other = AlbumId.make("al-9");
    const onOther = answered(
      chose(after(onSongFromAlbum, clickedLink("/")), albumPath(other)),
      (id) => reply.album(id, { ...fullAlbum, id: other }),
      albumPath(other),
    );
    expect(maybeAlbumIdInDocument(onOther.route, onOther.trail)).toEqual(Option.some(other));
  });
});
