import * as Option from "effect/Option";
import { Command, given, message, model, story } from "foldkit/story";
import { describe, expect, test } from "vitest";
import { Catalog } from "../src/catalog.ts";
import { FocusPage, NavigateInternal } from "../src/command.ts";
import { update } from "../src/main.ts";
import { Message } from "../src/message.ts";
import {
  Awaiting,
  GenreListData,
  HomeData,
  type Model,
  NewMusicData,
  StationListData,
} from "../src/model.ts";
import { AppRoute } from "../src/route.ts";
import {
  after,
  aheadUnanswered,
  allGenres,
  allStations,
  answered,
  arrived,
  awaitedId,
  chose,
  clickedLink,
  featured,
  nextId,
  onHome,
  opened,
  reply,
  trending,
} from "./fixtures.ts";

/** The id of the request out for the section being asked for ahead. */
const aheadId = (model: Model): string =>
  Option.match(model.ahead.maybeAsked, {
    onNone: () => {
      throw new Error("This Model asks for nothing ahead");
    },
    onSome: ({ requestId }) => requestId,
  });

/** The reply to the section being asked for ahead arrives. */
const answeredAhead = (
  model: Model,
  answer: (requestId: string) => typeof Catalog.Message.Type,
): Model => after(model, arrived(answer(aheadId(model))));

/** Home on screen, and every other section held, asked for ahead of the listener. */
const allHeld: Model = answeredAhead(
  answeredAhead(answeredAhead(onHome, reply.newMusic), reply.genres),
  reply.radio,
);

describe("the other sections are asked for once the first page has the screen", () => {
  test("nothing is asked ahead while the first page is still placeholders", () => {
    const opening = opened("/");
    expect(opening.launch).toBe("Launching");
    expect(opening.ahead).toEqual({ maybeAsked: Option.none(), toAsk: [] });
  });

  test("the first page's reply launches the app, and the first section it does not hold is asked for", () => {
    const opening = opened("/");

    story(
      update,
      given(opening),
      message(arrived(reply.home(awaitedId(opening)))),
      model((launched) => {
        expect(launched.launch).toBe("Launched");
        expect(launched.ahead).toEqual({
          maybeAsked: Option.some({ requestId: nextId(opening), section: "New" }),
          toAsk: ["Genres", "Radio"],
        });
        // Asking ahead is no intention: nothing is awaited, and the section says nothing of it.
        expect(launched.awaiting).toEqual(Awaiting.Nothing());
        expect(launched.newMusic).toEqual(NewMusicData.Idle());
      }),
      // One at a time: the others wait for this one's reply.
      Command.expectExact(Catalog.NewMusic({ input: {}, requestId: nextId(opening) })),
      Command.resolveAll(...aheadUnanswered(1, "New", "Genres", "Radio")),
    );
  });

  test("a direct link to another page asks for every section, Home first", () => {
    const launched = answered(opened("/genres"), reply.genres);
    expect(launched.ahead).toEqual({
      maybeAsked: Option.some({ requestId: "page:1", section: "Home" }),
      toAsk: ["New", "Radio"],
    });
  });

  test("a first page that could not be asked asks for nothing more of a catalog that did not answer", () => {
    const failed = answered(opened("/"), reply.homeLost);
    expect(failed.launch).toBe("Launched");
    expect(failed.ahead).toEqual({ maybeAsked: Option.none(), toAsk: [] });
  });
});

describe("what was asked for ahead is held, and nothing on screen moves for it", () => {
  test("the reply is held, the page on screen stays, and the next section is asked for", () =>
    story(
      update,
      given(onHome),
      message(arrived(reply.newMusic(aheadId(onHome)))),
      model((held) => {
        expect(held.newMusic).toEqual(NewMusicData.Success({ data: trending }));
        expect(held.route).toEqual(AppRoute.Home());
        expect(held.awaiting).toEqual(Awaiting.Nothing());
        expect(held.maybeAskedRoute).toEqual(Option.none());
        expect(held.ahead).toEqual({
          maybeAsked: Option.some({ requestId: nextId(onHome), section: "Genres" }),
          toAsk: ["Radio"],
        });
      }),
      // No page took the screen: the history is not touched, and no focus moves.
      Command.expectExact(Catalog.GenreList({ input: {}, requestId: nextId(onHome) })),
      Command.resolveAll(...aheadUnanswered(2, "Genres", "Radio")),
    ));

  test("when the last one is held, nothing more is asked", () => {
    expect(allHeld.newMusic).toEqual(NewMusicData.Success({ data: trending }));
    expect(allHeld.genreList).toEqual(GenreListData.Success({ data: allGenres }));
    expect(allHeld.stationList).toEqual(StationListData.Success({ data: allStations }));
    expect(allHeld.home).toEqual(HomeData.Success({ data: featured }));
    expect(allHeld.ahead).toEqual({ maybeAsked: Option.none(), toAsk: [] });
  });

  test("a section held this way takes the screen as it is chosen, and refreshes behind the page", () =>
    story(
      update,
      given(allHeld),
      message(clickedLink("/radio")),
      model((chosen) => {
        expect(chosen.route).toEqual(AppRoute.Radio());
        expect(chosen.stationList).toEqual(StationListData.Refreshing({ data: allStations }));
        expect(chosen.awaiting).toEqual(Awaiting.Reply({ requestId: nextId(allHeld) }));
      }),
      Command.expectExact(
        NavigateInternal({ url: "/radio" }),
        Catalog.StationList({ input: {}, requestId: nextId(allHeld) }),
      ),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [Catalog.StationList, reply.radio(nextId(allHeld))],
      ),
    ));
});

describe("a section that could not be asked for ahead says so nowhere", () => {
  test("it is left as it was, no notice is raised, and the next one is asked for", () => {
    const dismissed = after(onHome, Message.ClickedDismissStaleNotice());

    story(
      update,
      given(dismissed),
      message(arrived(reply.newMusicLost(aheadId(dismissed)))),
      model((unanswered) => {
        expect(unanswered.newMusic).toEqual(NewMusicData.Idle());
        expect(unanswered.staleNotice).toBe("Dismissed");
        expect(unanswered.route).toEqual(AppRoute.Home());
        expect(unanswered.ahead).toEqual({
          maybeAsked: Option.some({ requestId: nextId(dismissed), section: "Genres" }),
          toAsk: ["Radio"],
        });
      }),
      Command.resolveAll(...aheadUnanswered(2, "Genres", "Radio")),
    );
  });

  test("chosen later, it is asked for as a section never asked for is: the page on screen is held", () => {
    const unanswered = answeredAhead(onHome, reply.newMusicLost);
    const choosing = chose(unanswered, "/new");

    expect(choosing.route).toEqual(AppRoute.Home());
    expect(choosing.newMusic).toEqual(NewMusicData.Loading());
    expect(choosing.awaiting).toMatchObject({ _tag: "Intention", route: AppRoute.New() });
  });
});

describe("the listener goes before what is asked ahead", () => {
  test("a section chosen while it is on its way takes the screen with the reply that was ahead of them", () => {
    const choosing = chose(onHome, "/new");
    expect(choosing.awaiting).toMatchObject({ _tag: "Intention", route: AppRoute.New() });

    story(
      update,
      given(choosing),
      message(arrived(reply.newMusic(aheadId(choosing)))),
      model((shown) => {
        expect(shown.route).toEqual(AppRoute.New());
        expect(shown.newMusic).toEqual(NewMusicData.Success({ data: trending }));
        expect(shown.awaiting).toEqual(Awaiting.Nothing());
      }),
      Command.expectHas(NavigateInternal({ url: "/new" })),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
        ...aheadUnanswered(3, "Genres", "Radio"),
      ),
      // Their own request is answered after: it is awaited no longer, and changes nothing.
      message(arrived(reply.newMusic(awaitedId(choosing), { ...trending, albums: [] }))),
      model((shown) => expect(shown.newMusic).toEqual(NewMusicData.Success({ data: trending }))),
      Command.expectNone(),
    );
  });

  test("a section they loaded themselves is not written over by the reply that was ahead", () => {
    const shown = answered(chose(onHome, "/new"), reply.newMusic, "/new");
    const late = after(shown, arrived(reply.newMusic(aheadId(shown), { ...trending, albums: [] })));

    expect(late.newMusic).toEqual(NewMusicData.Success({ data: trending }));
    expect(late.route).toEqual(AppRoute.New());
    // What was ahead is answered, and the sections that follow are asked for.
    expect(late.ahead.maybeAsked).toEqual(
      Option.some({ requestId: nextId(shown), section: "Genres" }),
    );
  });

  test("a failure ahead of a section they are waiting for is not theirs: their own request still answers", () => {
    const choosing = chose(onHome, "/new");
    const unanswered = after(choosing, arrived(reply.newMusicLost(aheadId(choosing))));

    expect(unanswered.route).toEqual(AppRoute.Home());
    expect(unanswered.newMusic).toEqual(NewMusicData.Loading());
    expect(unanswered.awaiting).toEqual(choosing.awaiting);

    const shown = answered(unanswered, reply.newMusic, "/new");
    expect(shown.route).toEqual(AppRoute.New());
  });

  test("a section they loaded meanwhile is not asked for again when its turn comes", () => {
    // Genres is chosen and shown while New is still on its way.
    const onGenres = answered(chose(onHome, "/genres"), reply.genres, "/genres");
    const held = answeredAhead(onGenres, reply.newMusic);

    expect(held.ahead).toEqual({
      maybeAsked: Option.some({ requestId: nextId(onGenres), section: "Radio" }),
      toAsk: [],
    });
  });
});
