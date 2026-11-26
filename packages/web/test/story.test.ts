import { TrackId } from "@bafle/domain/Catalog/Track";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import { Command, given, message, model, story } from "foldkit/story";
import { modifyFields } from "foldkit/struct";
import { describe, expect, test } from "vitest";
import { Catalog } from "../src/catalog.ts";
import {
  FocusPage,
  FocusSearchField,
  FocusTrackRow,
  NavigateBack,
  NavigateInternal,
  PaintSystemBar,
  ReplaceSearchTerm,
  LetGoOfSearchField,
  ScrollPageToTop,
  ShowSearchFromTop,
  TurnRow,
  WaitForTypingPause,
} from "../src/command.ts";
import { init, update } from "../src/main.ts";
import { Message } from "../src/message.ts";
import {
  addressOf,
  Awaiting,
  maybeHeadedFor,
  maybeStaleError,
  HomeData,
  type Model,
  NewMusicData,
  SearchData,
  TrackData,
  trackData,
  wayBack,
} from "../src/model.ts";
import { AppRoute } from "../src/route.ts";
import { PAGE_IDS } from "../src/view/layout.ts";
import {
  after,
  aheadUnanswered,
  barPainted,
  answered,
  arrived,
  awaitedId,
  bareTrack,
  changedUrl,
  chose,
  choseFromRow,
  clickedLink,
  explicitTrack,
  featured,
  featuredLater,
  found,
  foundMore,
  fullTrack,
  leavingHomeForNew,
  nextId,
  onHome,
  onNew,
  onSearch,
  onTrack,
  opened,
  openingTrack,
  reply,
  track,
  trackPath,
  trending,
  url,
} from "./fixtures.ts";

const searchFor = (term: string) => AppRoute.Search({ maybeTerm: Option.some(term) });
const trackRoute = AppRoute.Track({ trackId: track.id });
const explicitTrackRoute = AppRoute.Track({ trackId: explicitTrack.id });

/** What a result of `init` or `update` asks the runtime to do, as name and args. */
const asked = (result: ReturnType<typeof init>) =>
  (result.commands ?? []).map((command) => [command.name, command.args]);

/**
 * What the app asked of the browser's history over these Messages, Commands
 * unrun: a request left unanswered is one whose reply never came.
 */
const historyMoves = (
  start: Model,
  ...messages: ReadonlyArray<Message>
): ReadonlyArray<ReadonlyArray<unknown>> =>
  messages.reduce(
    (soFar, sent) => {
      const outcome = update(soFar.model, sent);
      return {
        model: outcome.model,
        moves: [
          ...soFar.moves,
          ...asked(outcome).filter(([name]) =>
            ["NavigateInternal", "NavigateBack", "ReplaceSearchTerm"].includes(String(name)),
          ),
        ],
      };
    },
    { model: start, moves: [] as ReadonlyArray<ReadonlyArray<unknown>> },
  ).moves;

describe("rule 4: the first paint is never blank", () => {
  test("a fresh load puts the destination on screen at once, loading, and asks for its data", () => {
    const opening = init(url("/"));

    expect(opening.model.route).toEqual(AppRoute.Home());
    expect(opening.model.home).toEqual(HomeData.Loading());
    expect(asked(opening)).toEqual([["HomeFeed", { input: {}, requestId: "page:0" }]]);
  });

  test("a shared link to New or to a search loads that page, not Home", () => {
    const openingNew = init(url("/new"));
    expect(openingNew.model.route).toEqual(AppRoute.New());
    expect(openingNew.model.newMusic).toEqual(NewMusicData.Loading());
    expect(asked(openingNew)).toEqual([["NewMusic", { input: {}, requestId: "page:0" }]]);

    const openingSearch = init(url("/search?q=daft"));
    expect(openingSearch.model.route).toEqual(searchFor("daft"));
    expect(openingSearch.model.search).toEqual(SearchData.Loading());
    // A link is not typing: the query goes out at once, with no pause to wait for.
    expect(asked(openingSearch)).toEqual([
      ["CatalogSearch", { input: { term: "daft" }, requestId: "page:0" }],
      ["FocusSearchField", undefined],
    ]);
  });

  test("pages that need nothing from the catalog are complete on the first paint", () => {
    const openingSearch = init(url("/search"));
    expect(openingSearch.model.awaiting).toEqual(Awaiting.Nothing());
    // Launched as it opens, so the sections start being asked for ahead of the listener.
    expect(asked(openingSearch)).toEqual([
      ["FocusSearchField", undefined],
      ["HomeFeed", { input: {}, requestId: "page:0" }],
      ["PaintSystemBar", undefined],
    ]);

    const openingNowhere = init(url("/nowhere"));
    expect(openingNowhere.model.route).toEqual(AppRoute.NotFound({ path: "/nowhere" }));
    expect(asked(openingNowhere)).toEqual([
      ["HomeFeed", { input: {}, requestId: "page:0" }],
      ["PaintSystemBar", undefined],
    ]);
  });

  test("placeholders are not worth holding: a link's page takes their place, and the URL with it", () =>
    story(
      update,
      given(opened("/")),
      message(clickedLink("/new")),
      model((model) => {
        expect(model.route).toEqual(AppRoute.New());
        expect(model.newMusic).toEqual(NewMusicData.Loading());
        expect(model.home).toEqual(HomeData.Idle());
      }),
      // The screen changed, so the URL does: Home's placeholders were shown, and are behind it.
      Command.expectExact(
        NavigateInternal({ url: "/new" }),
        Catalog.NewMusic({ input: {}, requestId: nextId(opened("/")) }),
      ),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [Catalog.NewMusic, reply.newMusic(nextId(opened("/")))],
        barPainted,
        ...aheadUnanswered(2, "Home", "Genres", "Radio"),
      ),
      model((model) => expect(model.newMusic).toEqual(NewMusicData.Success({ data: trending }))),
    ));

  test("nor are they when the browser goes elsewhere: Back from a first paint shows the other page's", () =>
    story(
      update,
      given(opened("/")),
      message(changedUrl("/new")),
      model((model) => {
        expect(model.route).toEqual(AppRoute.New());
        expect(model.newMusic).toEqual(NewMusicData.Loading());
        expect(model.home).toEqual(HomeData.Idle());
      }),
      Command.resolveAll(
        [Catalog.NewMusic, reply.newMusic(nextId(opened("/")))],
        barPainted,
        ...aheadUnanswered(2, "Home", "Genres", "Radio"),
      ),
    ));
});

describe("the mark the page opened with stands until the first page has something to show", () => {
  test("a fresh load is launching: its page is placeholders still", () => {
    expect(opened("/").launch).toBe("Launching");
    expect(opened("/new").launch).toBe("Launching");
    expect(opened("/search?q=daft").launch).toBe("Launching");
    expect(opened(trackPath(track.id)).launch).toBe("Launching");
  });

  test("what the catalog says of the first page launches the app", () => {
    expect(onHome.launch).toBe("Launched");
    expect(onSearch.launch).toBe("Launched");
  });

  test("so does a failure: it is said on the page, and the mark is not left over it", () => {
    expect(answered(opened("/"), reply.homeRefused).launch).toBe("Launched");
    expect(answered(opened("/"), reply.homeLost).launch).toBe("Launched");
  });

  test("a page that needs nothing from the catalog is launched as it opens", () => {
    expect(opened("/search").launch).toBe("Launched");
    expect(opened("/nowhere").launch).toBe("Launched");
  });

  test("the page that launches it is the one on screen, whichever was asked for first", () => {
    const leftForNew = chose(opened("/"), "/new");
    expect(leftForNew.route).toEqual(AppRoute.New());
    expect(leftForNew.launch).toBe("Launching");
    expect(answered(leftForNew, reply.newMusic).launch).toBe("Launched");
  });

  test("launched is for good: a first search waits in the app, under no mark", () => {
    const typing = after(
      opened("/search"),
      Message.UpdatedSearchField({ value: "daft" }),
      changedUrl("/search?q=daft"),
    );
    expect(typing.route).toEqual(searchFor("daft"));
    expect(typing.search).toEqual(SearchData.Loading());
    expect(typing.launch).toBe("Launched");
  });
});

describe("A1 and A2: a link is an intention, and the URL moves when the screen does", () => {
  test("pressing a link records the intention and asks for the data: the URL is left alone", () =>
    story(
      update,
      given(onHome),
      message(clickedLink("/new")),
      model((model) => {
        // Home is still the page on screen, whole, and still where the URL is.
        expect(model.route).toEqual(AppRoute.Home());
        expect(addressOf(model)).toEqual(AppRoute.Home());
        expect(model.home).toEqual(HomeData.Success({ data: featured }));
        expect(model.awaiting).toEqual(
          Awaiting.Intention({ requestId: nextId(onHome), route: AppRoute.New() }),
        );
        expect(model.newMusic).toEqual(NewMusicData.Loading());
        expect(model.trail).toEqual(onHome.trail);
      }),
      // The only Command asks the catalog. Nothing is asked of the history.
      Command.expectExact(Catalog.NewMusic({ input: {}, requestId: nextId(onHome) })),
      Command.resolve(Catalog.NewMusic, reply.newMusic(nextId(onHome))),
      model((model) => {
        expect(model.route).toEqual(AppRoute.New());
        expect(model.newMusic).toEqual(NewMusicData.Success({ data: trending }));
        expect(model.awaiting).toEqual(Awaiting.Nothing());
        expect(model.trail).toEqual([AppRoute.Home()]);
      }),
      // The page took the screen, so the URL is pushed: once.
      Command.expectExact(NavigateInternal({ url: "/new" })),
      Command.resolve(NavigateInternal, Message.CompletedNavigateInternal()),
    ));

  test("the URL change the app asked for is not a new navigation: nothing loads, nothing moves", () => {
    const arrivedOnNew = after(
      leavingHomeForNew,
      arrived(reply.newMusic(awaitedId(leavingHomeForNew))),
    );

    story(
      update,
      given(arrivedOnNew),
      message(changedUrl("/new")),
      model((model) => {
        expect(model).toEqual(modifyFields(arrivedOnNew, { maybeAskedRoute: () => Option.none() }));
        expect(model).toEqual(onNew);
      }),
      Command.expectNone(),
    );
  });

  test("a search reached by a link from another page waits like any page, and asks without a pause", () =>
    story(
      update,
      given(onHome),
      message(clickedLink("/search?q=daft")),
      model((model) => {
        expect(model.route).toEqual(AppRoute.Home());
        expect(model.search).toEqual(SearchData.Loading());
      }),
      Command.expectExact(
        Catalog.CatalogSearch({ input: { term: "daft" }, requestId: nextId(onHome) }),
      ),
      Command.resolve(Catalog.CatalogSearch, reply.search(nextId(onHome))),
      model((model) => {
        expect(model.route).toEqual(searchFor("daft"));
        expect(model.search).toEqual(SearchData.Success({ data: { term: "daft", results: found } }));
      }),
      // The field takes the focus when the page opens.
      Command.expectExact(NavigateInternal({ url: "/search?q=daft" }), FocusSearchField()),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusSearchField, Message.CompletedFocusSearchField()],
      ),
    ));

  test("a page that needs nothing from the catalog takes the screen, and the URL, at once", () =>
    story(
      update,
      given(onHome),
      message(clickedLink("/search")),
      model((model) => {
        expect(model.route).toEqual(AppRoute.Search({ maybeTerm: Option.none() }));
        expect(model.awaiting).toEqual(Awaiting.Nothing());
      }),
      Command.expectExact(NavigateInternal({ url: "/search" }), FocusSearchField()),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusSearchField, Message.CompletedFocusSearchField()],
      ),
      message(clickedLink("/nowhere")),
      model((model) => expect(model.route).toEqual(AppRoute.NotFound({ path: "/nowhere" }))),
      Command.expectExact(NavigateInternal({ url: "/nowhere" })),
      Command.resolve(NavigateInternal, Message.CompletedNavigateInternal()),
    ));

  test("a track that has never loaded keeps the list on screen until its page can be shown", () =>
    story(
      update,
      given(onNew),
      message(clickedLink(trackPath(track.id))),
      model((model) => {
        // New is still the page on screen, whole: its data is untouched and nothing of it is pending.
        expect(model.route).toEqual(AppRoute.New());
        expect(model.newMusic).toEqual(NewMusicData.Success({ data: trending }));
        // The row of the track being opened is the one that says so.
        expect(maybeHeadedFor(model)).toEqual(Option.some(trackRoute));
        expect(trackData(model, track.id)).toEqual(TrackData.Loading());
      }),
      Command.expectExact(
        Catalog.TrackDetail({ input: { trackId: track.id }, requestId: nextId(onNew) }),
      ),
      Command.resolve(Catalog.TrackDetail, reply.track(nextId(onNew))),
      model((model) => {
        expect(model.route).toEqual(trackRoute);
        expect(maybeHeadedFor(model)).toEqual(Option.none());
        expect(trackData(model, track.id)).toEqual(
          TrackData.Success({ data: Option.some(fullTrack) }),
        );
        expect(model.awaiting).toEqual(Awaiting.Nothing());
      }),
      // The row that held the focus is behind the page now: the page takes it.
      Command.expectExact(
        NavigateInternal({ url: trackPath(track.id) }),
        FocusPage({ pageId: PAGE_IDS.Track }),
      ),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
    ));

  test("the list behind a track keeps its data: nothing is asked for it again", () => {
    expect(onTrack.newMusic).toEqual(NewMusicData.Success({ data: trending }));
    expect(onTrack.home).toEqual(HomeData.Success({ data: featured }));
  });
});

describe("A3: a page the Model holds takes the screen at once", () => {
  test("it commits at once and refreshes behind the page", () =>
    story(
      update,
      given(onNew),
      message(clickedLink("/")),
      model((model) => {
        expect(model.route).toEqual(AppRoute.Home());
        expect(model.home).toEqual(HomeData.Refreshing({ data: featured }));
        expect(model.awaiting).toEqual(Awaiting.Reply({ requestId: nextId(onNew) }));
      }),
      Command.expectExact(
        NavigateInternal({ url: "/" }),
        Catalog.HomeFeed({ input: {}, requestId: nextId(onNew) }),
      ),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [Catalog.HomeFeed, reply.home(nextId(onNew), featuredLater)],
      ),
      model((model) => expect(model.home).toEqual(HomeData.Success({ data: featuredLater }))),
    ));

  // The listener opened the track and went back to New, whose refresh has arrived.
  const backOnNew = answered(after(onTrack, changedUrl("/new")), reply.newMusic);

  test("a track already opened swaps at once from what is held, and refreshes behind it", () =>
    story(
      update,
      given(backOnNew),
      message(clickedLink(trackPath(track.id))),
      model((model) => {
        expect(model.route).toEqual(trackRoute);
        // No row ever says it is loading: the page is already there.
        expect(trackData(model, track.id)).toEqual(
          TrackData.Refreshing({ data: Option.some(fullTrack) }),
        );
      }),
      Command.expectExact(
        NavigateInternal({ url: trackPath(track.id) }),
        Catalog.TrackDetail({ input: { trackId: track.id }, requestId: nextId(backOnNew) }),
        FocusPage({ pageId: PAGE_IDS.Track }),
      ),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
        [Catalog.TrackDetail, reply.track(nextId(backOnNew), { ...fullTrack, trackNumber: 5 })],
      ),
      model((model) =>
        expect(trackData(model, track.id)).toEqual(
          TrackData.Success({ data: Option.some({ ...fullTrack, trackNumber: 5 }) }),
        ),
      ),
    ));

  test("each track is held under its own id", () => {
    const onSecond = answered(
      chose(backOnNew, trackPath(explicitTrack.id)),
      (requestId) => reply.track(requestId, bareTrack),
      trackPath(explicitTrack.id),
    );

    expect(trackData(onSecond, track.id)).toEqual(
      TrackData.Success({ data: Option.some(fullTrack) }),
    );
    expect(trackData(onSecond, explicitTrack.id)).toEqual(
      TrackData.Success({ data: Option.some(bareTrack) }),
    );
    expect(HashMap.size(onSecond.tracks)).toBe(2);
  });

  test("a search already answered for the same term comes back at once", () => {
    // The listener searched, went Home, and now comes back to the same search.
    const onHomeAfterSearch = answered(chose(onSearch, "/"), reply.home, "/");

    story(
      update,
      given(onHomeAfterSearch),
      message(clickedLink("/search?q=daft")),
      model((model) => {
        expect(model.route).toEqual(searchFor("daft"));
        expect(model.search).toEqual(
          SearchData.Refreshing({ data: { term: "daft", results: found } }),
        );
      }),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusSearchField, Message.CompletedFocusSearchField()],
        [Catalog.CatalogSearch, reply.search(nextId(onHomeAfterSearch), foundMore)],
      ),
      model((model) =>
        expect(model.search).toEqual(
          SearchData.Success({ data: { term: "daft", results: foundMore } }),
        ),
      ),
    );
  });

  test("a search for another term than the one answered loads like a first visit", () => {
    const onHomeAfterSearch = answered(chose(onSearch, "/"), reply.home, "/");

    story(
      update,
      given(onHomeAfterSearch),
      message(clickedLink("/search?q=justice")),
      model((model) => {
        expect(model.route).toEqual(AppRoute.Home());
        expect(model.search).toEqual(SearchData.Loading());
      }),
      Command.resolve(Catalog.CatalogSearch, reply.search(nextId(onHomeAfterSearch), foundMore)),
      model((model) => expect(model.route).toEqual(searchFor("justice"))),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusSearchField, Message.CompletedFocusSearchField()],
      ),
    );
  });

  test("choosing the page already on screen refreshes it in place and leaves the history alone", () =>
    story(
      update,
      given(onHome),
      message(clickedLink("/")),
      model((model) => {
        expect(model.route).toEqual(AppRoute.Home());
        expect(model.home).toEqual(HomeData.Refreshing({ data: featured }));
      }),
      // As a tab bar does: the item of the page already on screen takes it to its top.
      Command.expectExact(
        Catalog.HomeFeed({ input: {}, requestId: nextId(onHome) }),
        ScrollPageToTop({ pageId: PAGE_IDS.Home }),
      ),
      Command.resolve(ScrollPageToTop, Message.CompletedScrollPageToTop()),
      Command.resolve(Catalog.HomeFeed, reply.home(nextId(onHome))),
    ));

  test("choosing another page shows it as it was left: nothing scrolls it", () =>
    story(
      update,
      given(onNew),
      message(clickedLink("/")),
      Command.expectExact(
        NavigateInternal({ url: "/" }),
        Catalog.HomeFeed({ input: {}, requestId: nextId(onNew) }),
      ),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [Catalog.HomeFeed, reply.home(nextId(onNew))],
      ),
    ));
});

describe("A4: a track that fails to open says so on its row", () => {
  const failedToOpen = answered(openingTrack, reply.trackRefused);

  test("the list stays, the URL stays, and the history is untouched", () =>
    story(
      update,
      given(onNew),
      message(clickedLink(trackPath(track.id))),
      Command.resolve(Catalog.TrackDetail, reply.trackRefused(nextId(onNew))),
      model((model) => {
        expect(model.route).toEqual(AppRoute.New());
        expect(addressOf(model)).toEqual(AppRoute.New());
        expect(model.newMusic).toEqual(NewMusicData.Success({ data: trending }));
        expect(trackData(model, track.id)).toEqual(
          TrackData.Failure({ error: "CatalogUnavailable" }),
        );
        expect(model.awaiting).toEqual(Awaiting.Nothing());
        expect(model.trail).toEqual(onNew.trail);
      }),
      // Nothing takes the screen, so nothing is pushed and no focus moves.
      Command.expectNone(),
    ));

  test("the failure stays on its row while another row is opened, and after", () => {
    const openingAnother = chose(failedToOpen, trackPath(explicitTrack.id));
    expect(trackData(openingAnother, track.id)).toEqual(
      TrackData.Failure({ error: "CatalogUnavailable" }),
    );
    expect(trackData(openingAnother, explicitTrack.id)).toEqual(TrackData.Loading());

    const onAnother = answered(
      openingAnother,
      (requestId) => reply.track(requestId, bareTrack),
      trackPath(explicitTrack.id),
    );
    expect(onAnother.route).toEqual(explicitTrackRoute);
    expect(trackData(onAnother, track.id)).toEqual(
      TrackData.Failure({ error: "CatalogUnavailable" }),
    );
  });

  test("the item of the row's menu, pressed again, asks again in place", () =>
    story(
      update,
      given(failedToOpen),
      message(choseFromRow("New", track.id, "OpenSong")),
      model((model) => {
        expect(model.route).toEqual(AppRoute.New());
        // Loading, and no longer failed: a row is in one state at a time.
        expect(trackData(model, track.id)).toEqual(TrackData.Loading());
        expect(model.awaiting).toEqual(
          Awaiting.Intention({ requestId: nextId(failedToOpen), route: trackRoute }),
        );
      }),
      Command.expectExact(
        Catalog.TrackDetail({ input: { trackId: track.id }, requestId: nextId(failedToOpen) }),
      ),
      Command.resolve(Catalog.TrackDetail, reply.track(nextId(failedToOpen))),
      model((model) => {
        expect(model.route).toEqual(trackRoute);
        expect(model.trail).toEqual([AppRoute.Home(), AppRoute.New()]);
      }),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
    ));

  test("pressing the failed row itself tries again too", () => {
    const retrying = chose(failedToOpen, trackPath(track.id));
    expect(trackData(retrying, track.id)).toEqual(TrackData.Loading());
    expect(retrying.route).toEqual(AppRoute.New());
  });

  test("a retry that fails again says so again, still on its row", () => {
    const failedAgain = answered(
      after(failedToOpen, choseFromRow("New", track.id, "OpenSong")),
      reply.trackLost,
    );
    expect(failedAgain.route).toEqual(AppRoute.New());
    expect(trackData(failedAgain, track.id)).toEqual(TrackData.Failure({ error: "Unreachable" }));
  });

  test("a retry abandoned for another row leaves the first a plain row: it was tried again", () => {
    const retrying = after(failedToOpen, choseFromRow("New", track.id, "OpenSong"));
    const openingAnother = chose(retrying, trackPath(explicitTrack.id));
    expect(HashMap.has(openingAnother.tracks, track.id)).toBe(false);
  });
});

describe("A5: a track the catalog does not have says so on its row, for good", () => {
  const missing = answered(openingTrack, reply.trackMissing);

  test("that is an answer, and it stays on the row: the list, the URL and the history are untouched", () =>
    story(
      update,
      given(onNew),
      message(clickedLink(trackPath(track.id))),
      Command.resolve(Catalog.TrackDetail, reply.trackMissing(nextId(onNew))),
      model((model) => {
        expect(model.route).toEqual(AppRoute.New());
        expect(trackData(model, track.id)).toEqual(TrackData.Success({ data: Option.none() }));
        expect(model.awaiting).toEqual(Awaiting.Nothing());
        expect(model.trail).toEqual(onNew.trail);
      }),
      // Nothing is asked of the history. The row stops being a link, so it is given the focus
      // the link was holding.
      Command.expectExact(FocusTrackRow({ pageId: PAGE_IDS.New, trackId: track.id })),
      Command.resolve(FocusTrackRow, Message.CompletedFocusTrackRow()),
    ));

  test("it is never asked for again: the answer will not change", () =>
    story(
      update,
      given(missing),
      // The row is no longer a link, but nothing else may open the track either.
      message(clickedLink(trackPath(track.id))),
      model((model) => expect(model).toBe(missing)),
      Command.expectNone(),
      // Its item in the row's menu is not to be pressed; were it, nothing would be asked.
      message(choseFromRow("New", track.id, "OpenSong")),
      model((model) => expect(model).toBe(missing)),
      Command.expectNone(),
    ));

  test("other rows open as before", () => {
    const onAnother = answered(
      chose(missing, trackPath(explicitTrack.id)),
      (requestId) => reply.track(requestId, bareTrack),
      trackPath(explicitTrack.id),
    );
    expect(onAnother.route).toEqual(explicitTrackRoute);
    expect(trackData(onAnother, track.id)).toEqual(TrackData.Success({ data: Option.none() }));
  });
});

describe("A6: a request nobody answers is a failure", () => {
  // The Command gives up after ten seconds and reports the reply as lost: see command.test.ts.
  test("on a row, like any other failure to open", () => {
    const unanswered = answered(openingTrack, reply.trackLost);
    expect(unanswered.route).toEqual(AppRoute.New());
    expect(trackData(unanswered, track.id)).toEqual(TrackData.Failure({ error: "Unreachable" }));
    expect(unanswered.awaiting).toEqual(Awaiting.Nothing());
  });

  test("on a first paint, in the page", () =>
    story(
      update,
      given(opened("/")),
      message(arrived(reply.homeLost(awaitedId(opened("/"))))),
      model((model) => {
        expect(model.home).toEqual(HomeData.Failure({ error: "Unreachable" }));
        expect(model.awaiting).toEqual(Awaiting.Nothing());
      }),
      // The page has something of its own to say, so the app is launched: nothing is asked ahead.
      Command.expectExact(PaintSystemBar()),
      Command.resolveAll(barPainted),
    ));
});

describe("A7: the latest choice wins, without a trace", () => {
  const lateReplies = [
    arrived(reply.track(awaitedId(openingTrack))),
    arrived(reply.trackRefused(awaitedId(openingTrack))),
    arrived(reply.trackMissing(awaitedId(openingTrack))),
  ];

  test("another row replaces the intention: the first is a plain row again, and its reply is dropped", () => {
    const openingAnother = chose(openingTrack, trackPath(explicitTrack.id));
    expect(openingAnother.awaiting).toEqual(
      Awaiting.Intention({ requestId: nextId(openingTrack), route: explicitTrackRoute }),
    );
    // Nothing is left of the first: not loading, and not failed either.
    expect(HashMap.has(openingAnother.tracks, track.id)).toBe(false);
    expect(openingAnother.route).toEqual(AppRoute.New());
    expect(openingAnother.trail).toEqual(onNew.trail);

    story(
      update,
      given(openingAnother),
      ...lateReplies.flatMap((late) => [
        message(late),
        model((model: Model) => expect(model).toBe(openingAnother)),
        Command.expectNone(),
      ]),
      message(arrived(reply.track(awaitedId(openingAnother), bareTrack))),
      model((model) => expect(model.route).toEqual(explicitTrackRoute)),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
    );
  });

  test("a navigation item replaces it too", () => {
    const wentHome = chose(openingTrack, "/");
    expect(wentHome.route).toEqual(AppRoute.Home());
    expect(HashMap.has(wentHome.tracks, track.id)).toBe(false);

    story(
      update,
      given(wentHome),
      ...lateReplies.flatMap((late) => [
        message(late),
        model((model: Model) => expect(model).toBe(wentHome)),
      ]),
    );
  });

  test("a URL change the app did not ask for abandons it: Back leaves the list for the page behind", () => {
    const wentBack = after(openingTrack, changedUrl("/"));
    expect(wentBack.route).toEqual(AppRoute.Home());
    expect(maybeHeadedFor(wentBack)).toEqual(Option.none());
    expect(HashMap.has(wentBack.tracks, track.id)).toBe(false);

    story(
      update,
      given(wentBack),
      ...lateReplies.flatMap((late) => [
        message(late),
        model((model: Model) => expect(model).toBe(wentBack)),
      ]),
    );
  });

  test("choosing the pending destination again asks again, and only the new reply counts", () => {
    const insisting = chose(leavingHomeForNew, "/new");
    expect(insisting.awaiting).toEqual(
      Awaiting.Intention({ requestId: nextId(leavingHomeForNew), route: AppRoute.New() }),
    );

    story(
      update,
      given(leavingHomeForNew),
      message(clickedLink("/new")),
      // Still no navigation: only the request is renewed. Nothing scrolls: its page is not on screen.
      Command.expectExact(Catalog.NewMusic({ input: {}, requestId: awaitedId(insisting) })),
      Command.resolve(Catalog.NewMusic, reply.newMusic(awaitedId(leavingHomeForNew))),
      model((model) => {
        expect(model.route).toEqual(AppRoute.Home());
        expect(model.newMusic).toEqual(NewMusicData.Loading());
      }),
      message(arrived(reply.newMusic(awaitedId(insisting)))),
      model((model) => expect(model.route).toEqual(AppRoute.New())),
      Command.resolve(NavigateInternal, Message.CompletedNavigateInternal()),
    );
  });

  test("choosing the page on screen gives up the pending one and stays", () => {
    const stayed = chose(leavingHomeForNew, "/");
    expect(stayed.route).toEqual(AppRoute.Home());
    expect(stayed.newMusic).toEqual(NewMusicData.Idle());
    expect(stayed.awaiting).toEqual(Awaiting.Reply({ requestId: nextId(leavingHomeForNew) }));

    story(
      update,
      given(stayed),
      message(arrived(reply.newMusic(awaitedId(leavingHomeForNew)))),
      model((model) => expect(model).toBe(stayed)),
      message(arrived(reply.home(awaitedId(stayed), featuredLater))),
      model((model) => {
        expect(model.home).toEqual(HomeData.Success({ data: featuredLater }));
        expect(model.newMusic).toEqual(NewMusicData.Idle());
        expect(model.route).toEqual(AppRoute.Home());
      }),
    );
  });

  test("typing in the search on screen abandons a pending intention", () => {
    // Search is on screen with results; the listener chose Home, which has never loaded.
    const leavingSearchForHome = chose(onSearch, "/");
    expect(leavingSearchForHome.route).toEqual(searchFor("daft"));

    story(
      update,
      given(leavingSearchForHome),
      // The field is still there to type into.
      message(Message.UpdatedSearchField({ value: "daft punk" })),
      Command.resolve(ReplaceSearchTerm, Message.CompletedReplaceSearchTerm()),
      message(changedUrl("/search?q=daft+punk")),
      model((model) => {
        expect(model.route).toEqual(searchFor("daft punk"));
        expect(model.home).toEqual(HomeData.Idle());
        expect(model.awaiting).toEqual(
          Awaiting.TypingPause({ pauseId: nextId(leavingSearchForHome) }),
        );
      }),
      Command.resolve(
        WaitForTypingPause,
        Message.CompletedWaitForTypingPause({ pauseId: nextId(leavingSearchForHome) }),
      ),
      Command.resolve(
        Catalog.CatalogSearch,
        reply.search(
          nextId(after(leavingSearchForHome, changedUrl("/search?q=daft+punk"))),
          foundMore,
        ),
      ),
      // Home's reply arrives after all: nobody is waiting for it any more.
      message(arrived(reply.home(awaitedId(leavingSearchForHome)))),
      model((model) => {
        expect(model.home).toEqual(HomeData.Idle());
        expect(model.route).toEqual(searchFor("daft punk"));
        expect(model.search).toEqual(
          SearchData.Success({ data: { term: "daft punk", results: foundMore } }),
        );
      }),
    );
  });
});

describe("A8: a section commits like any page, and states its failure on its own page", () => {
  const failedNew = answered(leavingHomeForNew, reply.newMusicRefused, "/new");

  test("a section that fails with nothing to show takes the screen to say so, and the URL moves then", () =>
    story(
      update,
      given(onHome),
      message(clickedLink("/new")),
      Command.resolve(Catalog.NewMusic, reply.newMusicRefused(nextId(onHome))),
      model((model) => {
        expect(model.route).toEqual(AppRoute.New());
        expect(model.newMusic).toEqual(NewMusicData.Failure({ error: "CatalogUnavailable" }));
        expect(model.trail).toEqual([AppRoute.Home()]);
      }),
      // The screen changed, so the URL does.
      Command.expectExact(NavigateInternal({ url: "/new" })),
      Command.resolve(NavigateInternal, Message.CompletedNavigateInternal()),
    ));

  test("a first load that fails leaves the page on screen with the failure", () =>
    story(
      update,
      given(opened("/")),
      message(arrived(reply.homeRefused(awaitedId(opened("/"))))),
      model((model) => {
        expect(model.route).toEqual(AppRoute.Home());
        expect(model.home).toEqual(HomeData.Failure({ error: "CatalogUnavailable" }));
      }),
      Command.resolveAll(barPainted),
    ));

  test("Try again loads the failed page in place", () =>
    story(
      update,
      given(failedNew),
      message(Message.ClickedTryAgain()),
      model((model) => {
        expect(model.route).toEqual(AppRoute.New());
        expect(model.newMusic).toEqual(NewMusicData.Loading());
      }),
      // The button is about to go, so focus moves to the page it acted on. The history is left alone.
      Command.expectExact(
        Catalog.NewMusic({ input: {}, requestId: nextId(failedNew) }),
        FocusPage({ pageId: PAGE_IDS.New }),
      ),
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      Command.resolve(Catalog.NewMusic, reply.newMusic(nextId(failedNew))),
      model((model) => expect(model.newMusic).toEqual(NewMusicData.Success({ data: trending }))),
    ));

  test("a refresh that fails keeps the data on screen and notes the failure", () => {
    const refreshingHome = chose(onNew, "/");

    story(
      update,
      given(refreshingHome),
      message(arrived(reply.homeRefused(awaitedId(refreshingHome)))),
      model((model) => {
        expect(model.route).toEqual(AppRoute.Home());
        expect(model.home).toEqual(
          HomeData.Stale({ error: "CatalogUnavailable", data: featured }),
        );
      }),
      message(Message.ClickedTryAgain()),
      model((model) => expect(model.home).toEqual(HomeData.Refreshing({ data: featured }))),
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      Command.resolve(Catalog.HomeFeed, reply.home(nextId(refreshingHome), featuredLater)),
      model((model) => expect(model.home).toEqual(HomeData.Success({ data: featuredLater }))),
    );
  });

  test("Try again on a search that failed asks at once: a retry is not typing", () => {
    const failedSearch = answered(opened("/search?q=daft"), reply.searchRefused);
    expect(failedSearch.search).toEqual(SearchData.Failure({ error: "CatalogUnavailable" }));

    story(
      update,
      given(failedSearch),
      message(Message.ClickedTryAgain()),
      model((model) => expect(model.search).toEqual(SearchData.Loading())),
      Command.expectExact(
        Catalog.CatalogSearch({ input: { term: "daft" }, requestId: nextId(failedSearch) }),
        FocusPage({ pageId: PAGE_IDS.Search }),
      ),
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      Command.resolve(Catalog.CatalogSearch, reply.search(nextId(failedSearch))),
      model((model) =>
        expect(model.search).toEqual(SearchData.Success({ data: { term: "daft", results: found } })),
      ),
      Command.resolve(ShowSearchFromTop, Message.CompletedShowSearchFromTop()),
    );
  });

  test("Try again behind results that outlived a failed search keeps them and asks at once", () => {
    const typedMore = after(onSearch, changedUrl("/search?q=daft+punk"));
    const askedForMore = after(
      typedMore,
      Message.CompletedWaitForTypingPause({ pauseId: awaitedId(typedMore) }),
    );
    const staleSearch = answered(askedForMore, reply.searchRefused);

    story(
      update,
      given(staleSearch),
      message(Message.ClickedTryAgain()),
      model((model) =>
        expect(model.search).toEqual(
          SearchData.Refreshing({ data: { term: "daft", results: found } }),
        ),
      ),
      Command.expectExact(
        Catalog.CatalogSearch({ input: { term: "daft punk" }, requestId: nextId(staleSearch) }),
        FocusPage({ pageId: PAGE_IDS.Search }),
      ),
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      Command.resolve(Catalog.CatalogSearch, reply.search(nextId(staleSearch), foundMore)),
    );
  });
});

describe("B: the browser moved the URL first, so only the screen can be held", () => {
  test("Back to a page the Model holds shows it at once and refreshes behind it", () =>
    story(
      update,
      given(onNew),
      message(changedUrl("/")),
      model((model) => {
        expect(model.route).toEqual(AppRoute.Home());
        expect(model.home).toEqual(HomeData.Refreshing({ data: featured }));
      }),
      // The browser moved the URL itself: the app asks nothing of the history.
      Command.expectExact(Catalog.HomeFeed({ input: {}, requestId: nextId(onNew) })),
      Command.resolve(Catalog.HomeFeed, reply.home(nextId(onNew), featuredLater)),
      model((model) => expect(model.home).toEqual(HomeData.Success({ data: featuredLater }))),
    ));

  test("Back or Forward to a page not in the Model holds the screen until it loads", () =>
    story(
      update,
      given(onHome),
      message(changedUrl("/new")),
      model((model) => {
        expect(model.route).toEqual(AppRoute.Home());
        expect(model.home).toEqual(HomeData.Success({ data: featured }));
        // The URL is ahead of the screen, and the app knows it.
        expect(addressOf(model)).toEqual(AppRoute.New());
        expect(model.awaiting).toEqual(
          Awaiting.Arrival({
            requestId: nextId(onHome),
            route: AppRoute.New(),
            entrance: "Arriving",
          }),
        );
        expect(model.newMusic).toEqual(NewMusicData.Loading());
      }),
      Command.expectExact(Catalog.NewMusic({ input: {}, requestId: nextId(onHome) })),
      Command.resolve(Catalog.NewMusic, reply.newMusic(nextId(onHome))),
      model((model) => {
        expect(model.route).toEqual(AppRoute.New());
        expect(model.awaiting).toEqual(Awaiting.Nothing());
      }),
      // The URL was already there: nothing is pushed.
      Command.expectNone(),
    ));

  test("a track reached this way that fails shows the failure in its own page, with Try again", () => {
    const heldForTrack = after(onHome, changedUrl(trackPath(track.id)));
    const refused = answered(heldForTrack, reply.trackRefused);

    story(
      update,
      given(onHome),
      message(changedUrl(trackPath(track.id))),
      Command.resolve(Catalog.TrackDetail, reply.trackRefused(nextId(onHome))),
      model((model) => {
        expect(model.route).toEqual(trackRoute);
        expect(trackData(model, track.id)).toEqual(
          TrackData.Failure({ error: "CatalogUnavailable" }),
        );
      }),
      Command.expectExact(FocusPage({ pageId: PAGE_IDS.Track })),
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      message(Message.ClickedTryAgain()),
      model((model) => {
        expect(model.route).toEqual(trackRoute);
        expect(trackData(model, track.id)).toEqual(TrackData.Loading());
      }),
      Command.expectExact(
        Catalog.TrackDetail({ input: { trackId: track.id }, requestId: nextId(refused) }),
        FocusPage({ pageId: PAGE_IDS.Track }),
      ),
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      Command.resolve(Catalog.TrackDetail, reply.track(nextId(refused))),
      model((model) =>
        expect(trackData(model, track.id)).toEqual(
          TrackData.Success({ data: Option.some(fullTrack) }),
        ),
      ),
    );
  });

  test("a track reached this way that the catalog does not have gets its page, for good", () => {
    const missing = answered(after(onHome, changedUrl(trackPath(track.id))), reply.trackMissing);
    expect(missing.route).toEqual(trackRoute);
    expect(trackData(missing, track.id)).toEqual(TrackData.Success({ data: Option.none() }));

    // Back and Forward to it again: its page at once, and nothing asked.
    const again = after(missing, changedUrl("/"), changedUrl(trackPath(track.id)));
    expect(again.route).toEqual(trackRoute);
    expect(trackData(again, track.id)).toEqual(TrackData.Success({ data: Option.none() }));
  });

  test("a direct link to a track paints its page at once, loading, with its request out", () => {
    const opening = init(url(trackPath(track.id)));

    expect(opening.model.route).toEqual(trackRoute);
    expect(trackData(opening.model, track.id)).toEqual(TrackData.Loading());
    expect(asked(opening)).toEqual([
      ["TrackDetail", { input: { trackId: track.id }, requestId: "page:0" }],
    ]);
  });

  test("its reply fills the page in place, and its failure is stated in it", () => {
    const firstPaint = opened(trackPath(track.id));

    story(
      update,
      given(firstPaint),
      message(arrived(reply.track(awaitedId(firstPaint)))),
      model((model) => {
        expect(model.route).toEqual(trackRoute);
        expect(trackData(model, track.id)).toEqual(
          TrackData.Success({ data: Option.some(fullTrack) }),
        );
      }),
      // Nothing took the screen from anything: no focus moves, nothing is pushed. All that is
      // asked is the first of the sections, ahead of the listener; and the bar over the app
      // takes the ground of its pages.
      Command.expectExact(Catalog.HomeFeed, PaintSystemBar),
      Command.resolveAll(barPainted, ...aheadUnanswered(1, "Home", "New", "Genres", "Radio")),
    );

    const lost = answered(firstPaint, reply.trackLost);
    expect(lost.route).toEqual(trackRoute);
    expect(trackData(lost, track.id)).toEqual(TrackData.Failure({ error: "Unreachable" }));
  });

  test("a refresh that fails keeps the track on screen and notes the failure", () => {
    const refreshing = chose(onTrack, trackPath(track.id));
    expect(trackData(refreshing, track.id)).toEqual(
      TrackData.Refreshing({ data: Option.some(fullTrack) }),
    );

    story(
      update,
      given(refreshing),
      message(arrived(reply.trackRefused(awaitedId(refreshing)))),
      model((model) => {
        expect(model.route).toEqual(trackRoute);
        expect(trackData(model, track.id)).toEqual(
          TrackData.Stale({ error: "CatalogUnavailable", data: Option.some(fullTrack) }),
        );
      }),
    );
  });

  test("a refresh that finds the track gone replaces it: there is no track to keep showing", () => {
    const refreshing = chose(onTrack, trackPath(track.id));

    story(
      update,
      given(refreshing),
      message(arrived(reply.trackMissing(awaitedId(refreshing)))),
      model((model) =>
        expect(trackData(model, track.id)).toEqual(TrackData.Success({ data: Option.none() })),
      ),
    );
  });

  test("a refresh abandoned halfway leaves the track as it was held", () => {
    const refreshing = chose(onTrack, trackPath(track.id));
    const leftAgain = after(refreshing, changedUrl("/new"));
    expect(trackData(leftAgain, track.id)).toEqual(
      TrackData.Success({ data: Option.some(fullTrack) }),
    );
  });

  // Home on screen; the browser went to New, which has never loaded: the URL is ahead of the screen.
  const heldForNew = after(onHome, changedUrl("/new"));

  test("another move through the history gives up the page that was loading", () => {
    const backOnHome = after(heldForNew, changedUrl("/"));
    expect(backOnHome.route).toEqual(AppRoute.Home());
    expect(backOnHome.newMusic).toEqual(NewMusicData.Idle());
    expect(addressOf(backOnHome)).toEqual(AppRoute.Home());

    story(
      update,
      given(backOnHome),
      message(arrived(reply.newMusic(awaitedId(heldForNew)))),
      model((model) => expect(model).toBe(backOnHome)),
    );
  });

  test("a link pressed meanwhile first brings the URL back to the page on screen", () =>
    story(
      update,
      given(heldForNew),
      message(clickedLink("/search?q=daft")),
      model((model) => {
        expect(model.route).toEqual(AppRoute.Home());
        expect(addressOf(model)).toEqual(AppRoute.Home());
        expect(model.newMusic).toEqual(NewMusicData.Idle());
        expect(model.awaiting).toEqual(
          Awaiting.Intention({ requestId: nextId(heldForNew), route: searchFor("daft") }),
        );
        // New's entry is behind the one Home gets back.
        expect(model.trail).toEqual([AppRoute.New()]);
      }),
      // One push, for the page that is on screen. The link's own comes when its page does.
      Command.expectExact(
        NavigateInternal({ url: "/" }),
        Catalog.CatalogSearch({ input: { term: "daft" }, requestId: nextId(heldForNew) }),
      ),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [Catalog.CatalogSearch, reply.search(nextId(heldForNew))],
      ),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusSearchField, Message.CompletedFocusSearchField()],
      ),
    ));

  test("a link to a page that needs no wait goes straight there: one push, never two at once", () =>
    story(
      update,
      given(heldForNew),
      message(clickedLink("/search")),
      model((model) => {
        expect(model.route).toEqual(AppRoute.Search({ maybeTerm: Option.none() }));
        expect(model.trail).toEqual([AppRoute.New()]);
      }),
      Command.expectExact(NavigateInternal({ url: "/search" }), FocusSearchField()),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusSearchField, Message.CompletedFocusSearchField()],
      ),
    ));

  test("typing in a search held for another page gives Search a new entry: that page's is not rewritten", () => {
    // Search is on screen; the browser went to Home, which has never loaded.
    const heldForHome = after(onSearch, changedUrl("/"));
    expect(heldForHome.route).toEqual(searchFor("daft"));
    expect(addressOf(heldForHome)).toEqual(AppRoute.Home());

    story(
      update,
      given(heldForHome),
      message(Message.UpdatedSearchField({ value: "daft punk" })),
      model((model) => {
        expect(model.home).toEqual(HomeData.Idle());
        expect(model.awaiting).toEqual(Awaiting.Nothing());
        expect(model.trail).toEqual([AppRoute.Home()]);
      }),
      // A push, not a rewrite: the current entry is Home's.
      Command.expectExact(NavigateInternal({ url: "/search?q=daft+punk" })),
      Command.resolve(NavigateInternal, Message.CompletedNavigateInternal()),
      message(changedUrl("/search?q=daft+punk")),
      model((model) => {
        expect(model.route).toEqual(searchFor("daft punk"));
        expect(model.trail).toEqual([AppRoute.Home()]);
      }),
      Command.resolve(
        WaitForTypingPause,
        Message.CompletedWaitForTypingPause({ pauseId: nextId(heldForHome) }),
      ),
      Command.resolve(
        Catalog.CatalogSearch,
        reply.search(nextId(after(heldForHome, changedUrl("/search?q=daft+punk"))), foundMore),
      ),
    );
  });

  test("Try again on a page held while another loads brings the URL back to it", () => {
    // Home failed and is on screen; the browser went to New, which is loading behind it.
    const failedHome = answered(opened("/"), reply.homeRefused);
    const leavingFailedHome = after(failedHome, changedUrl("/new"));
    expect(leavingFailedHome.route).toEqual(AppRoute.Home());

    story(
      update,
      given(leavingFailedHome),
      message(Message.ClickedTryAgain()),
      Command.expectExact(
        NavigateInternal({ url: "/" }),
        Catalog.HomeFeed({ input: {}, requestId: nextId(leavingFailedHome) }),
        FocusPage({ pageId: PAGE_IDS.Home }),
      ),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
        [Catalog.HomeFeed, reply.home(nextId(leavingFailedHome))],
      ),
    );
  });
});

describe("the invariant: every history entry the app creates is for a page that was on screen", () => {
  const first = trackPath(track.id);
  const second = trackPath(explicitTrack.id);
  const thirdId = TrackId.make("tr-3");
  const third = trackPath(thirdId);

  test("any number of taps that never receive a reply ask nothing of the history", () => {
    expect(
      historyMoves(
        onNew,
        clickedLink(first),
        clickedLink(second),
        clickedLink(first),
        clickedLink(third),
        clickedLink(third),
      ),
    ).toEqual([]);

    const tapped = after(onNew, clickedLink(first), clickedLink(second), clickedLink(third));
    expect(tapped.route).toEqual(onNew.route);
    expect(addressOf(tapped)).toEqual(addressOf(onNew));
    expect(tapped.trail).toEqual(onNew.trail);
  });

  test("three quick taps followed by one reply add exactly one entry: the page that is shown", () => {
    const tapped = after(onNew, clickedLink(first), clickedLink(second), clickedLink(third));
    const thirdTrack = { ...fullTrack, id: thirdId };

    expect(
      historyMoves(
        onNew,
        clickedLink(first),
        clickedLink(second),
        clickedLink(third),
        // The replies to the first two arrive late, in any order, and the third's last.
        arrived(reply.track(awaitedId(chose(onNew, first)))),
        arrived(reply.track(awaitedId(chose(chose(onNew, first), second)), bareTrack)),
        arrived(reply.track(awaitedId(tapped), thirdTrack)),
        changedUrl(third),
      ),
    ).toEqual([["NavigateInternal", { url: third }]]);

    const shown = answered(tapped, (requestId) => reply.track(requestId, thirdTrack), third);
    expect(shown.route).toEqual(AppRoute.Track({ trackId: thirdTrack.id }));
    // Neither of the tracks never shown left anything behind.
    expect(HashMap.size(shown.tracks)).toBe(1);
    expect(shown.trail).toEqual([AppRoute.Home(), AppRoute.New()]);
  });

  test("Back from a track opened from a list returns to that list in one step", () => {
    expect(wayBack(onTrack)).toEqual(Option.some(AppRoute.New()));

    const back = after(onTrack, changedUrl("/new"));
    expect(back.route).toEqual(AppRoute.New());
    expect(back.trail).toEqual([AppRoute.Home()]);
  });

  test("a tap, then Back before the reply: the list's own entry was the current one, so Back leaves the list", () => {
    expect(historyMoves(onNew, clickedLink(first), changedUrl("/"))).toEqual([]);
  });
});

describe("rule 6: search keeps its results while it loads", () => {
  // The listener typed on after "daft": the URL changed, the pause has not passed yet.
  const typedMore = after(onSearch, changedUrl("/search?q=daft+punk"));
  // The pause passed and the query for "daft punk" went out.
  const askedForMore = after(
    typedMore,
    Message.CompletedWaitForTypingPause({ pauseId: awaitedId(typedMore) }),
  );

  test("typing rewrites the URL in place of pushing a history entry per letter", () =>
    story(
      update,
      given(onSearch),
      message(Message.UpdatedSearchField({ value: "daft p" })),
      // Nothing on screen changes yet: the app only notes the rewrite it is asking for.
      model((model) =>
        expect(model).toEqual(
          modifyFields(onSearch, { maybeAskedRoute: () => Option.some(searchFor("daft p")) }),
        ),
      ),
      Command.expectExact(ReplaceSearchTerm({ maybeTerm: Option.some("daft p") })),
      Command.resolve(ReplaceSearchTerm, Message.CompletedReplaceSearchTerm()),
      message(Message.UpdatedSearchField({ value: "" })),
      Command.expectExact(ReplaceSearchTerm({ maybeTerm: Option.none() })),
      Command.resolve(ReplaceSearchTerm, Message.CompletedReplaceSearchTerm()),
    ));

  test("a new term keeps the previous results, marked as loading, and asks after a pause", () =>
    story(
      update,
      given(onSearch),
      message(changedUrl("/search?q=daft+punk")),
      model((model) => {
        expect(model.route).toEqual(searchFor("daft punk"));
        expect(model.search).toEqual(
          SearchData.Refreshing({ data: { term: "daft", results: found } }),
        );
      }),
      // Only the pause is awaited: nothing has been asked of the catalog yet.
      Command.expectExact(WaitForTypingPause({ pauseId: nextId(onSearch) })),
      Command.resolve(
        WaitForTypingPause,
        Message.CompletedWaitForTypingPause({ pauseId: nextId(onSearch) }),
      ),
      Command.expectExact(
        Catalog.CatalogSearch({ input: { term: "daft punk" }, requestId: nextId(typedMore) }),
      ),
      Command.resolve(Catalog.CatalogSearch, reply.search(nextId(typedMore), foundMore)),
      model((model) =>
        expect(model.search).toEqual(
          SearchData.Success({ data: { term: "daft punk", results: foundMore } }),
        ),
      ),
    ));

  test("a term searched for before shows what it found at once, and is asked for again only after the pause", () => {
    // "daft", then "daft punk", answered: both are held, and the page shows the second.
    const onMore = after(askedForMore, arrived(reply.search(awaitedId(askedForMore), foundMore)));
    expect(HashMap.get(onMore.searched, "daft")).toEqual(Option.some(found));
    expect(HashMap.get(onMore.searched, "daft punk")).toEqual(Option.some(foundMore));

    // Back to "daft" within Search, or its letters deleted: either way the URL says "daft" again.
    story(
      update,
      given(onMore),
      message(changedUrl("/search?q=daft")),
      model((model) => {
        expect(model.route).toEqual(searchFor("daft"));
        // Not the list for "daft punk" marked as loading: the list for "daft" itself.
        expect(model.search).toEqual(
          SearchData.Refreshing({ data: { term: "daft", results: found } }),
        );
      }),
      // As with any typing, the catalog hears of it after the pause.
      Command.expectExact(WaitForTypingPause({ pauseId: nextId(onMore) })),
      Command.resolve(
        WaitForTypingPause,
        Message.CompletedWaitForTypingPause({ pauseId: nextId(onMore) }),
      ),
      Command.resolve(
        Catalog.CatalogSearch,
        reply.search(nextId(after(onMore, changedUrl("/search?q=daft")))),
      ),
      model((model) =>
        expect(model.search).toEqual(SearchData.Success({ data: { term: "daft", results: found } })),
      ),
    );
  });

  test("a search that failed is not kept: there is nothing of it to go back to", () => {
    const failed = after(askedForMore, arrived(reply.searchRefused(awaitedId(askedForMore))));
    expect(HashMap.has(failed.searched, "daft punk")).toBe(false);
    expect(HashMap.get(failed.searched, "daft")).toEqual(Option.some(found));
  });

  test("a pause overtaken by more typing asks nothing; only the last one does", () => {
    const typedEvenMore = after(typedMore, changedUrl("/search?q=daft+punk+live"));

    story(
      update,
      given(typedEvenMore),
      message(Message.CompletedWaitForTypingPause({ pauseId: awaitedId(typedMore) })),
      Command.expectNone(),
      message(Message.CompletedWaitForTypingPause({ pauseId: awaitedId(typedEvenMore) })),
      Command.expectExact(
        Catalog.CatalogSearch({
          input: { term: "daft punk live" },
          requestId: nextId(typedEvenMore),
        }),
      ),
      Command.resolve(Catalog.CatalogSearch, reply.search(nextId(typedEvenMore), foundMore)),
    );
  });

  test("a reply for an older term is dropped; the results on screen wait for the latest", () => {
    const typedEvenMore = after(askedForMore, changedUrl("/search?q=daft+punk+live"));

    story(
      update,
      given(typedEvenMore),
      message(arrived(reply.search(awaitedId(askedForMore), foundMore))),
      model((model) =>
        expect(model.search).toEqual(
          SearchData.Refreshing({ data: { term: "daft", results: found } }),
        ),
      ),
    );
  });

  test("a search that fails keeps the previous results and notes the failure", () =>
    story(
      update,
      given(askedForMore),
      message(arrived(reply.searchRefused(awaitedId(askedForMore)))),
      model((model) =>
        expect(model.search).toEqual(
          SearchData.Stale({
            error: "CatalogUnavailable",
            data: { term: "daft", results: found },
          }),
        ),
      ),
    ));

  test("the term is asked without the spaces around it, and a blank one is not asked at all", () =>
    story(
      update,
      given(onSearch),
      message(changedUrl("/search?q=++")),
      model((model) => {
        expect(model.search).toEqual(SearchData.Idle());
        expect(model.awaiting).toEqual(Awaiting.Nothing());
      }),
      Command.expectNone(),
      message(changedUrl("/search?q=+daft+punk+")),
      Command.resolve(
        WaitForTypingPause,
        Message.CompletedWaitForTypingPause({ pauseId: nextId(onSearch) }),
      ),
      Command.expectExact(
        Catalog.CatalogSearch({ input: { term: "daft punk" }, requestId: nextId(typedMore) }),
      ),
      Command.resolve(Catalog.CatalogSearch, reply.search(nextId(typedMore), foundMore)),
      Command.resolve(ShowSearchFromTop, Message.CompletedShowSearchFromTop()),
    ));

  test("the first answer takes the field to the page's head, and the screen is brought back to its top", () => {
    const typedFirst = after(opened("/search"), changedUrl("/search?q=d"));

    story(
      update,
      given(typedFirst),
      message(Message.CompletedWaitForTypingPause({ pauseId: nextId(opened("/search")) })),
      Command.resolve(Catalog.CatalogSearch, reply.search(nextId(typedFirst))),
      Command.expectExact(ShowSearchFromTop()),
      Command.resolve(ShowSearchFromTop, Message.CompletedShowSearchFromTop()),
    );
  });

  test("a drag of the page under the field takes the focus from the field", () =>
    story(
      update,
      given(onSearch),
      message(Message.DraggedSearchPage()),
      Command.expectExact(LetGoOfSearchField()),
      Command.resolve(LetGoOfSearchField, Message.CompletedLetGoOfSearchField()),
    ));

  test("an arrow of a row that goes on sideways turns that row, and the Model is as it was", () =>
    story(
      update,
      given(onSearch),
      message(Message.ClickedTurnRow({ rowId: "search-artists-row", way: "Onward" })),
      model((model) => expect(model).toEqual(onSearch)),
      Command.expectExact(TurnRow({ rowId: "search-artists-row", way: "Onward" })),
      Command.resolve(TurnRow, Message.CompletedTurnRow()),
    ));

  test("what the field held is kept when the listener leaves Search, answered or not", () => {
    const onHomeAfterSearch = answered(chose(onSearch, "/"), reply.home, "/");
    expect(onHomeAfterSearch.maybeSearchText).toEqual(Option.some("daft"));

    // Typed on, with no answer for it yet, and then left.
    const onHomeAfterTyping = answered(chose(typedMore, "/"), reply.home, "/");
    expect(onHomeAfterTyping.maybeSearchText).toEqual(Option.some("daft punk"));

    // Emptied before leaving: there is nothing to come back to.
    const onHomeAfterEmptying = answered(
      chose(after(onSearch, changedUrl("/search")), "/"),
      reply.home,
      "/",
    );
    expect(onHomeAfterEmptying.maybeSearchText).toEqual(Option.none());
  });

  test("clearing the field goes back to the prompt and abandons what was loading", () =>
    story(
      update,
      given(askedForMore),
      message(changedUrl("/search")),
      model((model) => {
        expect(model.search).toEqual(SearchData.Idle());
        expect(model.awaiting).toEqual(Awaiting.Nothing());
      }),
      message(arrived(reply.search(awaitedId(askedForMore), foundMore))),
      model((model) => expect(model.search).toEqual(SearchData.Idle())),
    ));
});

describe("the connection coming back", () => {
  const typedMore = after(onSearch, changedUrl("/search?q=daft+punk"));
  const askedForMore = after(
    typedMore,
    Message.CompletedWaitForTypingPause({ pauseId: awaitedId(typedMore) }),
  );
  /** Search showing what it found earlier, since the catalog could not be reached for the new term. */
  const offline = answered(askedForMore, reply.searchLost);

  test("a page that could not be reached is asked again by itself, and what it says of it goes with the answer", () => {
    expect(maybeStaleError(offline)).toEqual(Option.some("Unreachable"));

    story(
      update,
      given(offline),
      message(Message.RegainedConnection()),
      Command.expectExact(
        Catalog.CatalogSearch({ input: { term: "daft punk" }, requestId: nextId(offline) }),
      ),
      Command.resolve(Catalog.CatalogSearch, reply.search(nextId(offline), foundMore)),
      model((model) => {
        expect(maybeStaleError(model)).toEqual(Option.none());
        expect(model.search).toEqual(
          SearchData.Success({ data: { term: "daft punk", results: foundMore } }),
        );
      }),
    );
  });

  test("a page that is up to date is not asked again, nor one the catalog refused", () => {
    story(update, given(onSearch), message(Message.RegainedConnection()), Command.expectNone());
    story(
      update,
      given(answered(askedForMore, reply.searchRefused)),
      message(Message.RegainedConnection()),
      Command.expectNone(),
    );
  });

  test("a page the listener chose and is waiting for is still waited for", () => {
    const leavingForHome = chose(offline, "/");

    story(
      update,
      given(leavingForHome),
      message(Message.RegainedConnection()),
      Command.expectNone(),
      model((model) => expect(model.awaiting).toEqual(leavingForHome.awaiting)),
    );
  });
});

describe("the page behind", () => {
  test("a track opened from a list knows the list is behind it", () => {
    expect(wayBack(onTrack)).toEqual(Option.some(AppRoute.New()));
  });

  test("a track opened by a direct link has nothing behind it", () => {
    const firstPaint = opened(trackPath(track.id));
    const loaded = answered(firstPaint, reply.track);

    expect(wayBack(firstPaint)).toEqual(Option.none());
    expect(wayBack(loaded)).toEqual(Option.none());
  });

  test("the handle of the expanded player goes back in the history: it changes nothing and pushes nothing", () =>
    story(
      update,
      given(onTrack),
      message(Message.ClickedBack()),
      model((model) => expect(model).toBe(onTrack)),
      Command.expectExact(NavigateBack()),
      Command.resolve(NavigateBack, Message.CompletedNavigateBack()),
    ));

  test("back on the list, it is on screen at once and the focus returns to the row", () =>
    story(
      update,
      given(onTrack),
      message(changedUrl("/new")),
      model((model) => {
        // At once, from what New held: no waiting on the network.
        expect(model.route).toEqual(AppRoute.New());
        expect(model.newMusic).toEqual(NewMusicData.Refreshing({ data: trending }));
        expect(model.trail).toEqual([AppRoute.Home()]);
      }),
      Command.expectExact(
        Catalog.NewMusic({ input: {}, requestId: nextId(onTrack) }),
        FocusTrackRow({ pageId: PAGE_IDS.New, trackId: track.id }),
      ),
      Command.resolve(FocusTrackRow, Message.CompletedFocusTrackRow()),
      Command.resolve(Catalog.NewMusic, reply.newMusic(nextId(onTrack))),
    ));

  test("back on Search, the row takes the focus and the field does not", () => {
    const onTrackFromSearch = answered(
      chose(onSearch, trackPath(track.id)),
      reply.track,
      trackPath(track.id),
    );
    expect(wayBack(onTrackFromSearch)).toEqual(Option.some(searchFor("daft")));

    story(
      update,
      given(onTrackFromSearch),
      message(changedUrl("/search?q=daft")),
      model((model) => {
        expect(model.route).toEqual(searchFor("daft"));
        expect(model.search).toEqual(
          SearchData.Refreshing({ data: { term: "daft", results: found } }),
        );
      }),
      // Focusing the field would scroll the results away and raise a keyboard.
      Command.expectExact(
        Catalog.CatalogSearch({ input: { term: "daft" }, requestId: nextId(onTrackFromSearch) }),
        FocusTrackRow({ pageId: PAGE_IDS.Search, trackId: track.id }),
      ),
      Command.resolve(FocusTrackRow, Message.CompletedFocusTrackRow()),
      Command.resolve(Catalog.CatalogSearch, reply.search(nextId(onTrackFromSearch))),
    );
  });

  // The track was opened from a search for "daft"; on its page the listener
  // searched for something else, and went Back to the track. The search page
  // now holds the second search, and the first is one Back further.
  const afterAnotherSearch = (): Model => {
    const onTrackFromSearch = answered(
      chose(onSearch, trackPath(track.id)),
      reply.track,
      trackPath(track.id),
    );
    const typedElse = after(
      chose(onTrackFromSearch, "/search"),
      changedUrl("/search"),
      Message.UpdatedSearchField({ value: "justice" }),
      changedUrl("/search?q=justice"),
    );
    const askedElse = after(
      typedElse,
      Message.CompletedWaitForTypingPause({ pauseId: awaitedId(typedElse) }),
    );
    const backOnTrack = after(
      answered(askedElse, (requestId) => reply.search(requestId, foundMore)),
      changedUrl(trackPath(track.id)),
    );
    return answered(backOnTrack, reply.track);
  };

  test("back on an earlier search, what it found is still held: the list is there at once, as it was left", () => {
    const backOnTrack = afterAnotherSearch();
    expect(backOnTrack.route).toEqual(trackRoute);
    // The page holds the second search; the first is kept under its term.
    expect(AsyncData.getData(backOnTrack.search)).toEqual(
      Option.some({ term: "justice", results: foundMore }),
    );
    expect(HashMap.get(backOnTrack.searched, "daft")).toEqual(Option.some(found));

    story(
      update,
      given(backOnTrack),
      message(changedUrl("/search?q=daft")),
      // Nothing is waited for: the list takes the screen with what it held, and is asked for again behind it.
      model((model) => {
        expect(model.route).toEqual(searchFor("daft"));
        expect(model.search).toEqual(
          SearchData.Refreshing({ data: { term: "daft", results: found } }),
        );
      }),
      Command.expectExact(
        Catalog.CatalogSearch({ input: { term: "daft" }, requestId: nextId(backOnTrack) }),
        FocusTrackRow({ pageId: PAGE_IDS.Search, trackId: track.id }),
      ),
      Command.resolve(FocusTrackRow, Message.CompletedFocusTrackRow()),
      Command.resolve(Catalog.CatalogSearch, reply.search(nextId(backOnTrack))),
    );
  });

  test("back on a list that has to load again, the row still takes the focus when it comes", () => {
    // A search the app does not hold: here, one whose answer was never kept.
    const backOnTrack = modifyFields(afterAnotherSearch(), { searched: () => HashMap.empty() });

    story(
      update,
      given(backOnTrack),
      message(changedUrl("/search?q=daft")),
      // The search for "daft" has to be asked again: the track's page is held meanwhile.
      model((model) => expect(model.route).toEqual(trackRoute)),
      Command.resolve(Catalog.CatalogSearch, reply.search(nextId(backOnTrack))),
      model((model) => expect(model.route).toEqual(searchFor("daft"))),
      // As when the list is there at once: the row, not the field.
      Command.expectExact(FocusTrackRow({ pageId: PAGE_IDS.Search, trackId: track.id })),
      Command.resolve(FocusTrackRow, Message.CompletedFocusTrackRow()),
    );
  });

  test("leaving a track by a link and coming Back finds its way back intact", () => {
    const wentHome = after(chose(onTrack, "/"), changedUrl("/"));
    expect(wentHome.trail).toEqual([AppRoute.Home(), AppRoute.New(), trackRoute]);

    const backOnTrack = after(wentHome, changedUrl(trackPath(track.id)));
    expect(backOnTrack.route).toEqual(trackRoute);
    expect(wayBack(backOnTrack)).toEqual(Option.some(AppRoute.New()));
  });

  test("while a link followed from a track's page is loading, its way back does not change", () => {
    const direct = answered(opened(trackPath(track.id)), reply.track);
    // New has never loaded, so the track's page stays on screen while it does, and so does the URL.
    const leavingDirect = chose(direct, "/new");
    expect(leavingDirect.route).toEqual(trackRoute);
    expect(wayBack(leavingDirect)).toEqual(Option.none());

    const leavingOpened = chose(onTrack, "/search?q=daft");
    expect(leavingOpened.route).toEqual(trackRoute);
    expect(wayBack(leavingOpened)).toEqual(Option.some(AppRoute.New()));
  });

  test("a URL change the app did not ask for is not taken for a link", () => {
    // Forward into the track after going Back: the app cannot tell this from a jump into
    // history it never saw, so it claims no way back rather than one that may lead nowhere.
    const wentBack = after(onTrack, changedUrl("/new"), changedUrl("/"));
    const wentForward = after(wentBack, changedUrl("/new"), changedUrl(trackPath(track.id)));
    expect(wentForward.route).toEqual(trackRoute);
    expect(wayBack(wentForward)).toEqual(Option.none());

    // Back into a track that was the first page of the visit: nothing was ever behind it.
    const direct = answered(opened(trackPath(track.id)), reply.track);
    const backOnDirect = after(chose(direct, "/search"), changedUrl(trackPath(track.id)));
    expect(wayBack(backOnDirect)).toEqual(Option.none());
  });

  test("typing in Search rewrites its entry and leaves the history around it alone", () => {
    const onBlankSearch = chose(onHome, "/search");
    expect(onBlankSearch.trail).toEqual([AppRoute.Home()]);

    const typed = after(
      onBlankSearch,
      changedUrl("/search"),
      Message.UpdatedSearchField({ value: "d" }),
      changedUrl("/search?q=d"),
      Message.UpdatedSearchField({ value: "da" }),
      changedUrl("/search?q=da"),
    );
    expect(typed.trail).toEqual([AppRoute.Home()]);
    expect(typed.maybeAskedRoute).toEqual(Option.none());
  });

  test("another search reached through the history is not taken for typing", () => {
    // Two searches lie apart in the history; the listener jumps from one to the other.
    const onBlankSearch = chose(onHome, "/search");
    const jumped = after(onBlankSearch, changedUrl("/search?q=daft"));
    expect(jumped.route).toEqual(searchFor("daft"));
    expect(jumped.trail).toEqual([]);
  });

  test("a URL change other than the rewrite asked for is not the typing's", () => {
    const elsewhere = after(
      onSearch,
      Message.UpdatedSearchField({ value: "daft punk" }),
      changedUrl("/new"),
    );
    expect(elsewhere.trail).toEqual([]);
    expect(elsewhere.maybeAskedRoute).toEqual(Option.none());
  });
});
