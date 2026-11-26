import { StationId } from "@bafle/domain/Catalog/Station";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import { describe, expect, test } from "vitest";
import { init, update } from "../src/main.ts";
import { Message } from "../src/message.ts";
import {
  Awaiting,
  maybeAlbumIdInDocument,
  maybeStationIdInDocument,
  type Model,
  StationData,
  stationData,
  StationListData,
  wayBack,
} from "../src/model.ts";
import * as Player from "../src/player/index.ts";
import { AppRoute, isSamePage, routeToUrl, urlToAppRoute } from "../src/route.ts";
import { PAGE_IDS } from "../src/view/layout.ts";
import {
  after,
  album,
  albumPath,
  allStations,
  answered,
  arrived,
  awaitedId,
  changedUrl,
  chose,
  choseFromRow,
  clickedLink,
  explicitTrack,
  fullStation,
  onHome,
  onRadio,
  onStation,
  opened,
  openingStationFromTile,
  reply,
  station,
  stationPath,
  track,
  trackPath,
  url,
} from "./fixtures.ts";

const radioRoute = AppRoute.Radio();
const stationRoute = AppRoute.Station({ stationId: station.id });
const otherStationId = StationId.make("st-9");

/** What a result of `init` or `update` asks the runtime to do, as name and args. */
const asked = (result: ReturnType<typeof init>) =>
  (result.commands ?? []).map((command) => [command.name, command.args]);

const names = (result: ReturnType<typeof init>): ReadonlyArray<string> =>
  (result.commands ?? []).map((command) => command.name);

const session = (model: Model): Player.Session => Option.getOrThrow(model.player.maybeSession);

/** Home still on screen; the listener chose Radio from the menu, which has never loaded. */
const leavingHomeForRadio: Model = chose(onHome, "/radio");

describe("the routes of Radio and of a station", () => {
  test("the section's address is its own, and so is each station's", () => {
    expect(urlToAppRoute(url("/radio"))).toEqual(radioRoute);
    expect(routeToUrl(radioRoute)).toBe("/radio");
    expect(urlToAppRoute(url(stationPath(station.id)))).toEqual(stationRoute);
    expect(routeToUrl(stationRoute)).toBe("/station/st-1");
  });

  test("the section is one page, and every station has a page of its own", () => {
    expect(isSamePage(radioRoute, AppRoute.Radio())).toBe(true);
    expect(isSamePage(radioRoute, stationRoute)).toBe(false);
    expect(isSamePage(stationRoute, AppRoute.Station({ stationId: station.id }))).toBe(true);
    expect(isSamePage(stationRoute, AppRoute.Station({ stationId: otherStationId }))).toBe(false);
  });
});

describe("Radio is a section", () => {
  test("reached by its address, it is on screen at once, loading, and its data is asked for", () => {
    const opening = init(url("/radio"));

    expect(opening.model.route).toEqual(radioRoute);
    expect(opening.model.stationList).toEqual(StationListData.Loading());
    expect(asked(opening)).toEqual([["StationList", { input: {}, requestId: "page:0" }]]);
  });

  test("the reply settles as the stations, or as a failure", () => {
    const loading = opened("/radio");

    expect(answered(loading, reply.radio).stationList).toEqual(
      StationListData.Success({ data: allStations }),
    );
    expect(answered(loading, reply.radioRefused).stationList).toEqual(
      StationListData.Failure({ error: "CatalogUnavailable" }),
    );
    expect(answered(loading, reply.radioLost).stationList).toEqual(
      StationListData.Failure({ error: "Unreachable" }),
    );
  });

  test("chosen from the menu, the page on screen is held and the URL stays", () => {
    const chosen = update(onHome, clickedLink("/radio"));

    expect(chosen.model.route).toEqual(AppRoute.Home());
    expect(chosen.model.awaiting).toMatchObject({ _tag: "Intention", route: radioRoute });
    expect(chosen.model.stationList).toEqual(StationListData.Loading());
    expect(names(chosen)).toEqual(["StationList"]);
  });

  test("when the stations arrive the section takes the screen and the URL", () => {
    const arriving = update(
      leavingHomeForRadio,
      arrived(reply.radio(awaitedId(leavingHomeForRadio))),
    );

    expect(arriving.model.route).toEqual(radioRoute);
    expect(arriving.model.awaiting).toEqual(Awaiting.Nothing());
    expect(wayBack(arriving.model)).toEqual(Option.some(AppRoute.Home()));
    expect(asked(arriving)).toEqual([["NavigateInternal", { url: "/radio" }]]);
  });

  test("a navigation item has no room to state a failure: the section takes the screen and says it", () => {
    const failing = update(
      leavingHomeForRadio,
      arrived(reply.radioLost(awaitedId(leavingHomeForRadio))),
    );

    expect(failing.model.route).toEqual(radioRoute);
    expect(failing.model.stationList).toEqual(StationListData.Failure({ error: "Unreachable" }));
    expect(names(failing)).toContain("NavigateInternal");

    const retried = update(failing.model, Message.ClickedTryAgain());
    expect(names(retried)).toEqual(["StationList", "FocusPage"]);
  });

  test("the latest intention wins: another choice abandons it without a trace", () => {
    const elsewhere = after(leavingHomeForRadio, clickedLink("/genres"));

    expect(elsewhere.stationList).toEqual(StationListData.Idle());
    expect(elsewhere.awaiting).toMatchObject({ _tag: "Intention", route: AppRoute.Genres() });
    const late = update(elsewhere, arrived(reply.radio(awaitedId(leavingHomeForRadio))));
    expect(late.model.stationList).toEqual(StationListData.Idle());
    expect(late.model.route).toEqual(AppRoute.Home());
  });

  test("once loaded it opens at once and refreshes behind its page", () => {
    const onRadioFromHome = answered(leavingHomeForRadio, reply.radio, "/radio");
    const backOnHome = after(onRadioFromHome, changedUrl("/"));
    const again = update(backOnHome, clickedLink("/radio"));

    expect(again.model.route).toEqual(radioRoute);
    expect(again.model.stationList).toEqual(StationListData.Refreshing({ data: allStations }));
    expect(names(again)).toEqual(["NavigateInternal", "StationList"]);
  });

  test("chosen again while it is on screen, it goes to its top and loads where it stands", () => {
    const again = update(onRadio, clickedLink("/radio"));

    expect(again.model.route).toEqual(radioRoute);
    expect(asked(again)).toContainEqual(["ScrollPageToTop", { pageId: PAGE_IDS.Radio }]);
    expect(names(again)).toContain("StationList");
    expect(names(again)).not.toContain("NavigateInternal");
  });
});

describe("a station reached by its address", () => {
  test("it is on screen at once, loading, and its data is asked for", () => {
    const opening = init(url(stationPath(station.id)));

    expect(opening.model.route).toEqual(stationRoute);
    expect(stationData(opening.model, station.id)).toEqual(StationData.Loading());
    expect(asked(opening)).toEqual([
      ["StationDetail", { input: { stationId: station.id }, requestId: "page:0" }],
    ]);
  });

  test("the reply settles under the station's id: the station, a failure, or that there is none", () => {
    const loading = opened(stationPath(station.id));

    expect(stationData(answered(loading, reply.station), station.id)).toEqual(
      StationData.Success({ data: Option.some(fullStation) }),
    );
    expect(stationData(answered(loading, reply.stationRefused), station.id)).toEqual(
      StationData.Failure({ error: "CatalogUnavailable" }),
    );
    expect(stationData(answered(loading, reply.stationLost), station.id)).toEqual(
      StationData.Failure({ error: "Unreachable" }),
    );
    expect(stationData(answered(loading, reply.stationMissing), station.id)).toEqual(
      StationData.Success({ data: Option.none() }),
    );
  });

  test("Try again loads the page where it stands, and a station known to be missing is not asked for again", () => {
    const failed = answered(opened(stationPath(station.id)), reply.stationRefused);
    const retried = update(failed, Message.ClickedTryAgain());
    expect(names(retried)).toEqual(["StationDetail", "FocusPage"]);
    expect(names(retried)).not.toContain("NavigateInternal");

    const missing = answered(opened(stationPath(station.id)), reply.stationMissing);
    expect(names(update(missing, clickedLink(stationPath(station.id))))).not.toContain(
      "StationDetail",
    );
  });
});

describe("a station chosen from a shelf", () => {
  test("Radio is held, and the URL stays", () => {
    const chosen = update(onRadio, clickedLink(stationPath(station.id)));

    expect(chosen.model.route).toEqual(radioRoute);
    expect(chosen.model.awaiting).toMatchObject({ _tag: "Intention", route: stationRoute });
    expect(stationData(chosen.model, station.id)).toEqual(StationData.Loading());
    expect(names(chosen)).toEqual(["StationDetail"]);
  });

  test("when the station arrives its page takes the screen, the URL and the focus, with Radio behind it", () => {
    const arriving = update(
      openingStationFromTile,
      arrived(reply.station(awaitedId(openingStationFromTile))),
    );

    expect(arriving.model.route).toEqual(stationRoute);
    expect(arriving.model.awaiting).toEqual(Awaiting.Nothing());
    expect(wayBack(arriving.model)).toEqual(Option.some(radioRoute));
    expect(asked(arriving)).toEqual([
      ["FocusPage", { pageId: PAGE_IDS.Station }],
      ["NavigateInternal", { url: "/station/st-1" }],
    ]);
  });

  test("a tile has no room to state a failure: the station's page takes the screen and says it", () => {
    const failing = update(
      openingStationFromTile,
      arrived(reply.stationRefused(awaitedId(openingStationFromTile))),
    );

    expect(failing.model.route).toEqual(stationRoute);
    expect(stationData(failing.model, station.id)).toEqual(
      StationData.Failure({ error: "CatalogUnavailable" }),
    );
    expect(names(failing)).toContain("NavigateInternal");
    expect(wayBack(failing.model)).toEqual(Option.some(radioRoute));
  });

  test("so does the page of a station the catalog does not have", () => {
    const missing = update(
      openingStationFromTile,
      arrived(reply.stationMissing(awaitedId(openingStationFromTile))),
    );

    expect(missing.model.route).toEqual(stationRoute);
    expect(stationData(missing.model, station.id)).toEqual(
      StationData.Success({ data: Option.none() }),
    );
    expect(names(missing)).toContain("NavigateInternal");
  });

  test("the latest intention wins: another choice abandons the station without a trace", () => {
    const elsewhere = after(openingStationFromTile, clickedLink("/new"));

    expect(elsewhere.route).toEqual(radioRoute);
    expect(HashMap.has(elsewhere.stations, station.id)).toBe(false);
    // Its reply, if it still comes, matches nothing.
    const late = update(elsewhere, arrived(reply.station(awaitedId(openingStationFromTile))));
    expect(late.model.stations).toBe(elsewhere.stations);
    expect(late.model.route).toEqual(radioRoute);
    expect(names(late)).not.toContain("NavigateInternal");
  });

  test("a station already held opens at once with the songs it was dealt: it is not asked for again", () => {
    const backOnRadio = after(onStation, changedUrl("/radio"));
    const again = update(backOnRadio, clickedLink(stationPath(station.id)));

    expect(again.model.route).toEqual(stationRoute);
    // A catalog deals a station afresh each time: asking again would change the list under the listener.
    expect(stationData(again.model, station.id)).toEqual(
      StationData.Success({ data: Option.some(fullStation) }),
    );
    expect(names(again)).toContain("NavigateInternal");
    expect(names(again)).not.toContain("StationDetail");
  });

  test("Back to a station finds its list as it was left, with nothing asked", () => {
    const onTrackFromStation = after(onStation, clickedLink("/radio"), changedUrl("/radio"));
    const back = update(onTrackFromStation, changedUrl(stationPath(station.id)));

    expect(back.model.route).toEqual(stationRoute);
    expect(stationData(back.model, station.id)).toEqual(
      StationData.Success({ data: Option.some(fullStation) }),
    );
    expect(names(back)).not.toContain("StationDetail");
  });
});

describe("back from a station", () => {
  test("the focus goes to the tile it was chosen from", () => {
    const back = update(onStation, changedUrl("/radio"));

    expect(back.model.route).toEqual(radioRoute);
    expect(asked(back)).toContainEqual([
      "FocusStationTile",
      { pageId: PAGE_IDS.Radio, stationId: station.id },
    ]);
  });
});

describe("playing from the station's page", () => {
  const tapped = Message.ClickedPlayTrack({ trackId: explicitTrack.id, from: "Station" });

  test("the station's list becomes the queue: what follows is the rest of it that has something to play", () => {
    const playing = after(onStation, tapped);

    expect(session(playing).current.id).toBe(explicitTrack.id);
    expect(session(playing).later.map((queued) => queued.id)).toEqual([track.id]);
  });

  test("playing is no navigation: the page, the URL and the history are as they were", () => {
    const playing = update(onStation, tapped);

    expect(playing.model.route).toEqual(onStation.route);
    expect(playing.model.trail).toEqual(onStation.trail);
    expect(names(playing)).not.toContain("NavigateInternal");
  });

  test("a row of the station queues its track as a row of any list does", () => {
    const queued = after(
      after(onStation, Message.ClickedPlayTrack({ trackId: track.id, from: "Station" })),
      choseFromRow("Station", explicitTrack.id, "AddToQueue"),
    );

    expect(session(queued).later.map((waiting) => waiting.id)).toEqual([explicitTrack.id]);
    expect(queued.rowDone.maybeRow).toEqual(
      Option.some({ from: "Station", trackId: explicitTrack.id, place: "Last" }),
    );
  });

  test("the queue is the list the page held when the row was tapped, and coming back to the station asks for no other", () => {
    const playing = after(onStation, tapped);
    const again = update(after(playing, changedUrl("/radio")), clickedLink(stationPath(station.id)));

    // A station is dealt once: its page, and what plays from it, stay as they were.
    expect(names(again)).not.toContain("StationDetail");
    expect(stationData(again.model, station.id)).toEqual(stationData(playing, station.id));
    expect(session(again.model).current.id).toBe(session(playing).current.id);
    expect(session(again.model).later.map((queued) => queued.id)).toEqual(
      session(playing).later.map((queued) => queued.id),
    );
  });
});

describe("the station's page behind a page reached from it", () => {
  /** A song of the station opened from the station's own row: the station is behind its page. */
  const onSongFromStation = answered(
    after(onStation, choseFromRow("Station", track.id, "OpenSong")),
    reply.track,
    trackPath(track.id),
  );

  /** The album of one of its songs, asked from that song's row. */
  const onAlbumFromStation = answered(
    after(onStation, choseFromRow("Station", track.id, "OpenAlbum")),
    reply.album,
    albumPath(album.id),
  );

  test("the station on screen is the one in the document", () => {
    expect(maybeStationIdInDocument(onStation.route, onStation.trail)).toEqual(
      Option.some(station.id),
    );
    expect(maybeStationIdInDocument(onRadio.route, onRadio.trail)).toEqual(Option.none());
  });

  test("behind a song opened from it, the station stays in the document, and comes back with the focus on its row", () => {
    expect(onSongFromStation.route).toEqual(AppRoute.Track({ trackId: track.id }));
    expect(maybeStationIdInDocument(onSongFromStation.route, onSongFromStation.trail)).toEqual(
      Option.some(station.id),
    );

    const back = update(onSongFromStation, changedUrl(stationPath(station.id)));
    expect(back.model.route).toEqual(stationRoute);
    expect(asked(back)).toContainEqual([
      "FocusTrackRow",
      { pageId: PAGE_IDS.Station, trackId: track.id },
    ]);
  });

  test("Go to album on one of its rows holds the station, and the row is noted as the one that asked", () => {
    const chosen = update(onStation, choseFromRow("Station", track.id, "OpenAlbum"));

    expect(chosen.model.route).toEqual(stationRoute);
    expect(chosen.model.awaiting).toMatchObject({
      _tag: "Intention",
      route: AppRoute.Album({ albumId: album.id }),
    });
    expect(HashMap.get(chosen.model.albumRows, album.id)).toEqual(
      Option.some({ from: "Station", trackId: track.id }),
    );
    expect(names(chosen)).toEqual(["AlbumDetail"]);
  });

  test("behind an album asked from one of its rows, the station is kept, and the album comes back to that row", () => {
    expect(onAlbumFromStation.route).toEqual(AppRoute.Album({ albumId: album.id }));
    expect(maybeStationIdInDocument(onAlbumFromStation.route, onAlbumFromStation.trail)).toEqual(
      Option.some(station.id),
    );
    expect(maybeAlbumIdInDocument(onAlbumFromStation.route, onAlbumFromStation.trail)).toEqual(
      Option.some(album.id),
    );

    const back = update(onAlbumFromStation, changedUrl(stationPath(station.id)));
    expect(back.model.route).toEqual(stationRoute);
    expect(asked(back)).toContainEqual([
      "FocusTrackRow",
      { pageId: PAGE_IDS.Station, trackId: track.id },
    ]);
  });

  test("a station left for good is in the document no longer, and another takes the one place there is", () => {
    const backOnRadio = after(onStation, changedUrl("/radio"));
    expect(maybeStationIdInDocument(backOnRadio.route, backOnRadio.trail)).toEqual(Option.none());

    const onOther = answered(
      chose(backOnRadio, stationPath(otherStationId)),
      (id) => reply.station(id, { ...fullStation, id: otherStationId }),
      stationPath(otherStationId),
    );
    expect(maybeStationIdInDocument(onOther.route, onOther.trail)).toEqual(
      Option.some(otherStationId),
    );
  });
});
