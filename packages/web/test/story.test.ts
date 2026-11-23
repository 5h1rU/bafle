import * as Option from "effect/Option";
import { Command, given, message, model, story } from "foldkit/story";
import { toString as urlToString } from "foldkit/url";
import { describe, expect, test } from "vitest";
import { Catalog } from "../src/catalog.ts";
import {
  FocusPage,
  FocusSearchField,
  NavigateInternal,
  ReplaceSearchTerm,
  WaitForTypingPause,
} from "../src/command.ts";
import { init, update } from "../src/main.ts";
import { Message } from "../src/message.ts";
import { Awaiting, HomeData, NewMusicData, SearchData } from "../src/model.ts";
import { AppRoute } from "../src/route.ts";
import {
  after,
  arrived,
  awaitedId,
  changedUrl,
  clickedLink,
  featured,
  featuredLater,
  found,
  foundMore,
  leavingHomeForNew,
  nextId,
  onHome,
  onNew,
  onSearch,
  opened,
  reply,
  trending,
  url,
} from "./fixtures.ts";

const searchFor = (term: string) => AppRoute.Search({ maybeTerm: Option.some(term) });

/** What a result of `init` or `update` asks the runtime to do, as name and args. */
const asked = (result: ReturnType<typeof init>) =>
  (result.commands ?? []).map((command) => [command.name, command.args]);

describe("rule 4: the first paint is never blank", () => {
  test("a fresh load puts the destination on screen at once, loading, and asks for its data", () => {
    const opening = init(url("/"));

    expect(opening.model.displayed).toEqual(AppRoute.Home());
    expect(opening.model.home).toEqual(HomeData.Loading());
    expect(asked(opening)).toEqual([["HomeFeed", { input: {}, requestId: "page:0" }]]);
  });

  test("a shared link to New or to a search loads that page, not Home", () => {
    const openingNew = init(url("/new"));
    expect(openingNew.model.displayed).toEqual(AppRoute.New());
    expect(openingNew.model.newMusic).toEqual(NewMusicData.Loading());
    expect(asked(openingNew)).toEqual([["NewMusic", { input: {}, requestId: "page:0" }]]);

    const openingSearch = init(url("/search?q=daft"));
    expect(openingSearch.model.displayed).toEqual(searchFor("daft"));
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
    expect(asked(openingSearch)).toEqual([["FocusSearchField", undefined]]);

    const openingNowhere = init(url("/nowhere"));
    expect(openingNowhere.model.displayed).toEqual(AppRoute.NotFound({ path: "/nowhere" }));
    expect(asked(openingNowhere)).toEqual([]);
  });

  test("placeholders are not worth holding: the next destination's take their place", () =>
    story(
      update,
      given(opened("/")),
      message(changedUrl("/new")),
      model((model) => {
        expect(model.displayed).toEqual(AppRoute.New());
        expect(model.newMusic).toEqual(NewMusicData.Loading());
        expect(model.home).toEqual(HomeData.Idle());
      }),
      Command.resolve(Catalog.NewMusic, reply.newMusic(nextId(opened("/")))),
      model((model) => expect(model.newMusic).toEqual(NewMusicData.Success({ data: trending }))),
    ));
});

describe("rule 1: hold, then swap", () => {
  test("a link only asks for the URL to change", () =>
    story(
      update,
      given(onHome),
      message(clickedLink("/new")),
      model((model) => expect(model).toEqual(onHome)),
      Command.expectExact(NavigateInternal({ url: urlToString(url("/new")) })),
      Command.resolve(NavigateInternal, Message.CompletedNavigateInternal()),
    ));

  test("the page on screen stays until the destination's data arrives, then it swaps", () =>
    story(
      update,
      given(onHome),
      message(changedUrl("/new")),
      model((model) => {
        expect(model.route).toEqual(AppRoute.New());
        expect(model.displayed).toEqual(AppRoute.Home());
        expect(model.home).toEqual(HomeData.Success({ data: featured }));
        expect(model.newMusic).toEqual(NewMusicData.Loading());
      }),
      Command.expectExact(Catalog.NewMusic({ input: {}, requestId: nextId(onHome) })),
      Command.resolve(Catalog.NewMusic, reply.newMusic(nextId(onHome))),
      model((model) => {
        expect(model.displayed).toEqual(AppRoute.New());
        expect(model.newMusic).toEqual(NewMusicData.Success({ data: trending }));
        expect(model.awaiting).toEqual(Awaiting.Nothing());
      }),
    ));

  test("a search reached from another page holds that page too, and asks without a pause", () =>
    story(
      update,
      given(onHome),
      message(changedUrl("/search?q=daft")),
      model((model) => {
        expect(model.displayed).toEqual(AppRoute.Home());
        expect(model.search).toEqual(SearchData.Loading());
      }),
      Command.expectExact(
        Catalog.CatalogSearch({ input: { term: "daft" }, requestId: nextId(onHome) }),
      ),
      Command.resolve(Catalog.CatalogSearch, reply.search(nextId(onHome))),
      model((model) => {
        expect(model.displayed).toEqual(searchFor("daft"));
        expect(model.search).toEqual(SearchData.Success({ data: { term: "daft", results: found } }));
      }),
      // The field takes the focus when the page opens.
      Command.resolve(FocusSearchField, Message.CompletedFocusSearchField()),
    ));

  test("a page that needs nothing from the catalog swaps in at once", () =>
    story(
      update,
      given(onHome),
      message(changedUrl("/search")),
      model((model) => expect(model.displayed).toEqual(AppRoute.Search({ maybeTerm: Option.none() }))),
      Command.resolve(FocusSearchField, Message.CompletedFocusSearchField()),
      message(changedUrl("/nowhere")),
      model((model) => expect(model.displayed).toEqual(AppRoute.NotFound({ path: "/nowhere" }))),
    ));
});

describe("rule 2: latest wins", () => {
  // Home is on screen; New was chosen and is loading; then the listener chose Home again.
  const backOnHome = after(leavingHomeForNew, changedUrl("/"));

  test("choosing another destination abandons the pending one", () => {
    expect(backOnHome.route).toEqual(AppRoute.Home());
    expect(backOnHome.newMusic).toEqual(NewMusicData.Idle());
    expect(backOnHome.awaiting).toEqual(Awaiting.Reply({ requestId: nextId(leavingHomeForNew) }));
  });

  test("the abandoned request's reply is dropped when it arrives", () =>
    story(
      update,
      given(backOnHome),
      message(arrived(reply.newMusic(awaitedId(leavingHomeForNew)))),
      model((model) => expect(model).toEqual(backOnHome)),
      message(arrived(reply.newMusicRefused(awaitedId(leavingHomeForNew)))),
      model((model) => expect(model).toEqual(backOnHome)),
    ));

  test("an older request for the same page does not stand in for the newer one", () => {
    // New was chosen, left, and chosen again: two requests for the same page.
    const leavingAgain = after(backOnHome, changedUrl("/new"));

    story(
      update,
      given(leavingAgain),
      message(arrived(reply.newMusic(awaitedId(leavingHomeForNew)))),
      model((model) => {
        expect(model.newMusic).toEqual(NewMusicData.Loading());
        expect(model.displayed).toEqual(AppRoute.Home());
      }),
      message(arrived(reply.newMusic(awaitedId(leavingAgain)))),
      model((model) => expect(model.displayed).toEqual(AppRoute.New())),
    );
  });

  test("choosing the pending destination again asks again, and only the new reply counts", () => {
    const insisting = after(leavingHomeForNew, clickedLink("/new"));
    expect(insisting.awaiting).toEqual(Awaiting.Reply({ requestId: nextId(leavingHomeForNew) }));

    story(
      update,
      given(leavingHomeForNew),
      message(clickedLink("/new")),
      // No navigation: the URL is already the destination's. Only the request is renewed.
      Command.expectExact(Catalog.NewMusic({ input: {}, requestId: awaitedId(insisting) })),
      Command.resolve(Catalog.NewMusic, reply.newMusic(awaitedId(leavingHomeForNew))),
      model((model) => {
        expect(model.displayed).toEqual(AppRoute.Home());
        expect(model.newMusic).toEqual(NewMusicData.Loading());
      }),
      message(arrived(reply.newMusic(awaitedId(insisting)))),
      model((model) => expect(model.displayed).toEqual(AppRoute.New())),
    );
  });

  test("typing in a search held on screen makes Search the destination again", () => {
    // Search is on screen with results; the listener chose Home, which has never loaded.
    const leavingSearchForHome = after(onSearch, changedUrl("/"));
    expect(leavingSearchForHome.displayed).toEqual(searchFor("daft"));

    story(
      update,
      given(leavingSearchForHome),
      // The field is still there to type into. Its URL takes the place of the abandoned one.
      message(Message.UpdatedSearchField({ value: "daft punk" })),
      Command.resolve(ReplaceSearchTerm, Message.CompletedReplaceSearchTerm()),
      message(changedUrl("/search?q=daft+punk")),
      model((model) => {
        expect(model.displayed).toEqual(searchFor("daft punk"));
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
        expect(model.displayed).toEqual(searchFor("daft punk"));
        expect(model.search).toEqual(
          SearchData.Success({ data: { term: "daft punk", results: foundMore } }),
        );
      }),
    );
  });

  test("a reply to the request still awaited is taken after a late one was dropped", () =>
    story(
      update,
      given(backOnHome),
      message(arrived(reply.newMusic(awaitedId(leavingHomeForNew)))),
      message(arrived(reply.home(awaitedId(backOnHome), featuredLater))),
      model((model) => {
        expect(model.home).toEqual(HomeData.Success({ data: featuredLater }));
        expect(model.newMusic).toEqual(NewMusicData.Idle());
        expect(model.displayed).toEqual(AppRoute.Home());
      }),
    ));
});

describe("rule 3: revisits are instant", () => {
  test("a page that holds data swaps in at once and refreshes behind it", () =>
    story(
      update,
      given(onNew),
      message(changedUrl("/")),
      model((model) => {
        expect(model.displayed).toEqual(AppRoute.Home());
        expect(model.home).toEqual(HomeData.Refreshing({ data: featured }));
      }),
      Command.expectExact(Catalog.HomeFeed({ input: {}, requestId: nextId(onNew) })),
      Command.resolve(Catalog.HomeFeed, reply.home(nextId(onNew), featuredLater)),
      model((model) => expect(model.home).toEqual(HomeData.Success({ data: featuredLater }))),
    ));

  test("a search already answered for the same term comes back at once", () => {
    // The listener searched, went Home, and now comes back to the same search.
    const leavingSearchForHome = after(onSearch, changedUrl("/"));
    const onHomeAfterSearch = after(
      leavingSearchForHome,
      arrived(reply.home(awaitedId(leavingSearchForHome))),
    );

    story(
      update,
      given(onHomeAfterSearch),
      message(changedUrl("/search?q=daft")),
      model((model) => {
        expect(model.displayed).toEqual(searchFor("daft"));
        expect(model.search).toEqual(
          SearchData.Refreshing({ data: { term: "daft", results: found } }),
        );
      }),
      Command.resolve(FocusSearchField, Message.CompletedFocusSearchField()),
      Command.resolve(Catalog.CatalogSearch, reply.search(nextId(onHomeAfterSearch), foundMore)),
      model((model) =>
        expect(model.search).toEqual(
          SearchData.Success({ data: { term: "daft", results: foundMore } }),
        ),
      ),
    );
  });

  test("a search for another term than the one answered loads like a first visit", () => {
    const leavingSearchForHome = after(onSearch, changedUrl("/"));
    const onHomeAfterSearch = after(
      leavingSearchForHome,
      arrived(reply.home(awaitedId(leavingSearchForHome))),
    );

    story(
      update,
      given(onHomeAfterSearch),
      message(changedUrl("/search?q=justice")),
      model((model) => {
        expect(model.displayed).toEqual(AppRoute.Home());
        expect(model.search).toEqual(SearchData.Loading());
      }),
      Command.resolve(Catalog.CatalogSearch, reply.search(nextId(onHomeAfterSearch), foundMore)),
      model((model) => expect(model.displayed).toEqual(searchFor("justice"))),
      Command.resolve(FocusSearchField, Message.CompletedFocusSearchField()),
    );
  });

  test("choosing the page already on screen refreshes it in place and leaves the history alone", () =>
    story(
      update,
      given(onHome),
      message(clickedLink("/")),
      model((model) => {
        expect(model.displayed).toEqual(AppRoute.Home());
        expect(model.home).toEqual(HomeData.Refreshing({ data: featured }));
      }),
      Command.expectExact(Catalog.HomeFeed({ input: {}, requestId: nextId(onHome) })),
      Command.resolve(Catalog.HomeFeed, reply.home(nextId(onHome))),
    ));
});

describe("rule 5: failures are stated in place", () => {
  const failedNew = after(
    leavingHomeForNew,
    arrived(reply.newMusicRefused(awaitedId(leavingHomeForNew))),
  );

  test("a first load that fails leaves the page on screen with the failure", () =>
    story(
      update,
      given(opened("/")),
      message(arrived(reply.homeRefused(awaitedId(opened("/"))))),
      model((model) => {
        expect(model.displayed).toEqual(AppRoute.Home());
        expect(model.home).toEqual(HomeData.Failure({ error: "CatalogUnavailable" }));
      }),
    ));

  test("a destination that fails with nothing to show still takes the screen, to say so", () => {
    expect(failedNew.displayed).toEqual(AppRoute.New());
    expect(failedNew.newMusic).toEqual(NewMusicData.Failure({ error: "CatalogUnavailable" }));
  });

  test("a reply lost on the way is a failure too", () =>
    story(
      update,
      given(opened("/")),
      message(arrived(reply.homeLost(awaitedId(opened("/"))))),
      model((model) => expect(model.home).toEqual(HomeData.Failure({ error: "Unreachable" }))),
    ));

  test("Try again loads the failed page in place", () =>
    story(
      update,
      given(failedNew),
      message(Message.ClickedTryAgain()),
      model((model) => {
        expect(model.displayed).toEqual(AppRoute.New());
        expect(model.newMusic).toEqual(NewMusicData.Loading());
      }),
      // The button is about to go, so focus moves to the page it acted on.
      Command.expectExact(
        Catalog.NewMusic({ input: {}, requestId: nextId(failedNew) }),
        FocusPage(),
      ),
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      Command.resolve(Catalog.NewMusic, reply.newMusic(nextId(failedNew))),
      model((model) => expect(model.newMusic).toEqual(NewMusicData.Success({ data: trending }))),
    ));

  test("a refresh that fails keeps the data on screen and notes the failure", () => {
    const refreshingHome = after(onNew, changedUrl("/"));

    story(
      update,
      given(refreshingHome),
      message(arrived(reply.homeRefused(awaitedId(refreshingHome)))),
      model((model) => {
        expect(model.displayed).toEqual(AppRoute.Home());
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

  test("Try again on a page held while another loads goes back to it", () => {
    // Home failed and is on screen; the listener chose New, which is loading behind it.
    const failedHome = after(opened("/"), arrived(reply.homeRefused(awaitedId(opened("/")))));
    const leavingFailedHome = after(failedHome, changedUrl("/new"));
    expect(leavingFailedHome.displayed).toEqual(AppRoute.Home());

    story(
      update,
      given(leavingFailedHome),
      message(Message.ClickedTryAgain()),
      Command.expectExact(NavigateInternal({ url: "/" }), FocusPage()),
      Command.resolveAll(
        [NavigateInternal, Message.CompletedNavigateInternal()],
        [FocusPage, Message.CompletedFocusPage()],
      ),
    );
  });

  test("Try again on a search that failed asks at once: a retry is not typing", () => {
    const firstPaint = opened("/search?q=daft");
    const failedSearch = after(firstPaint, arrived(reply.searchRefused(awaitedId(firstPaint))));
    expect(failedSearch.search).toEqual(SearchData.Failure({ error: "CatalogUnavailable" }));

    story(
      update,
      given(failedSearch),
      message(Message.ClickedTryAgain()),
      model((model) => expect(model.search).toEqual(SearchData.Loading())),
      Command.expectExact(
        Catalog.CatalogSearch({ input: { term: "daft" }, requestId: nextId(failedSearch) }),
        FocusPage(),
      ),
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      Command.resolve(Catalog.CatalogSearch, reply.search(nextId(failedSearch))),
      model((model) =>
        expect(model.search).toEqual(SearchData.Success({ data: { term: "daft", results: found } })),
      ),
    );
  });

  test("Try again behind results that outlived a failed search keeps them and asks at once", () => {
    const typedMore = after(onSearch, changedUrl("/search?q=daft+punk"));
    const askedForMore = after(
      typedMore,
      Message.CompletedWaitForTypingPause({ pauseId: awaitedId(typedMore) }),
    );
    const staleSearch = after(askedForMore, arrived(reply.searchRefused(awaitedId(askedForMore))));

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
        FocusPage(),
      ),
      Command.resolve(FocusPage, Message.CompletedFocusPage()),
      Command.resolve(Catalog.CatalogSearch, reply.search(nextId(staleSearch), foundMore)),
    );
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
      model((model) => expect(model).toEqual(onSearch)),
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
        expect(model.displayed).toEqual(searchFor("daft punk"));
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
    ));

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
