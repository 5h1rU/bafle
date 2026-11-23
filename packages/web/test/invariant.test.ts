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
import { Message } from "../src/message.ts";
import {
  addressOf,
  Awaiting,
  canShow,
  maybeHeadedFor,
  type Model,
  trackData,
  wayBack,
} from "../src/model.ts";
import {
  AppRoute,
  isSamePage,
  isSameRoute,
  searchRouter,
  urlToAppRoute,
} from "../src/route.ts";
import {
  arrived,
  changedUrl,
  clickedLink,
  explicitTrack,
  fullTrack,
  reply,
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
// The browser's history is walked along with the app: a page chosen by a link pushes an entry when
// it takes the screen, typing rewrites one, Back, Forward and the history menu move through them.
// That is what the app's own picture of the history is held against, what a page's back control
// must never lead out of, and what must never gain an entry for a page that was not shown.

const WALKS = 3000;
const STEPS_PER_WALK = 24;

const MISSING_TRACK_ID = TrackId.make("tr-404");

const TRACK_PATHS: Array.NonEmptyReadonlyArray<string> = [
  trackPath(track.id),
  trackPath(explicitTrack.id),
  // A row can outlive its track: the list was loaded before the catalog withdrew it.
  trackPath(MISSING_TRACK_ID),
];
const PATHS: Array.NonEmptyReadonlyArray<string> = [
  "/",
  "/new",
  "/search",
  "/search?q=a",
  "/search?q=ab",
  "/search?q=a+",
  "/nowhere",
  ...TRACK_PATHS,
];
const LINKS: Array.NonEmptyReadonlyArray<string> = ["/", "/new", "/search", "/", "/new", "/nowhere"];
const FIELD_TEXTS: Array.NonEmptyReadonlyArray<string> = ["", "a", "ab", "a ", " ", "b"];

/** The browser's history for this tab since the app loaded: the paths, and which one is current. */
type History = Readonly<{ entries: ReadonlyArray<string>; index: number }>;

type Walk = Readonly<{
  model: Model;
  history: History;
  /** URL changes the browser has made and the app has not heard of yet. They arrive in order. */
  urlChanges: ReadonlyArray<Message>;
  /** Replies and pauses on their way. They arrive in any order, or never. */
  replies: ReadonlyArray<Message>;
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
const hasPauseId = Schema.is(Schema.Struct({ pauseId: Schema.String }));
const hasUrl = Schema.is(Schema.Struct({ url: Schema.String }));
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

type PageName = "home" | "newMusic" | "search" | "track";

const pendingTrackIds = (model: Model): ReadonlyArray<TrackId> =>
  pipe(
    HashMap.toEntries(model.tracks),
    Array.filter(([, data]) => AsyncData.isPending(data)),
    Array.map(([trackId]) => trackId),
  );

const pendingPages = (model: Model): ReadonlyArray<PageName> =>
  Array.getSomes([
    Option.liftPredicate<PageName>("home", () => AsyncData.isPending(model.home)),
    Option.liftPredicate<PageName>("newMusic", () => AsyncData.isPending(model.newMusic)),
    Option.liftPredicate<PageName>("search", () => AsyncData.isPending(model.search)),
    Option.liftPredicate<PageName>("track", () =>
      Array.isReadonlyArrayNonEmpty(pendingTrackIds(model)),
    ),
  ]);

const pageOf = (route: AppRoute): Option.Option<PageName> =>
  AppRoute.match<Option.Option<PageName>>(route, {
    Home: () => Option.some("home"),
    New: () => Option.some("newMusic"),
    Search: () => Option.some("search"),
    Track: () => Option.some("track"),
    NotFound: () => Option.none(),
  });

/** The page a reply is awaited for: the one the app is heading for, else the one on screen. */
const awaitedRoute = (model: Model): AppRoute => Option.getOrElse(maybeHeadedFor(model), () => model.route);

/** Whether the page on screen is one that offers Try again: its last load or refresh failed. */
const showsTryAgain = (model: Model): boolean =>
  AppRoute.match(model.route, {
    Home: () => AsyncData.hasError(model.home),
    New: () => AsyncData.hasError(model.newMusic),
    Search: () => AsyncData.hasError(model.search),
    Track: ({ trackId }) => AsyncData.hasError(trackData(model, trackId)),
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

/** What the rules allow of any Model, whatever happened before it. Returns the rules it breaks. */
const broken = (model: Model): ReadonlyArray<string> => {
  const pending = pendingPages(model);
  const awaited = awaitedRoute(model);
  const maybeDestination = maybeHeadedFor(model);
  const rules: ReadonlyArray<readonly [rule: string, holds: boolean]> = [
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
      "a pending intention is never for the page on screen",
      !Option.exists(maybeDestination, (route) => isSamePage(route, model.route)),
    ],
    [
      "a page is waited for only while the screen has something to show and the page has nothing",
      !Option.exists(
        maybeDestination,
        (route) => !canShow(model, model.route) || canShow(model, route),
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
    return {
      label: "clicks Try again on a row",
      message: Message.ClickedTryAgainOnTrack({ trackId: pick(failed, choice) }),
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
  const sent = Array.getSomes(
    Array.map(commands, (command, index) => replyTo(command, fateOf(nextSeed(seed + index)))),
  );
  const isSettled = Array.isReadonlyArrayEmpty(moved.urlChanges);

  return {
    model: outcome.model,
    history: moved.history,
    urlChanges: moved.urlChanges,
    replies: Array.appendAll(happened.replies, sent),
    seed: nextSeed(nextSeed(seed)),
    trace,
    violations: Array.appendAll(
      walk.violations,
      Array.map(
        [
          ...broken(outcome.model),
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
    seed,
    trace: [`opens ${path}`],
    violations: [...broken(opening.model), ...astray(opening.model, history)],
  };
  return Array.reduce(Array.makeBy(STEPS_PER_WALK, () => step), start, (walk, advance) =>
    advance(walk),
  );
};

const walks = Array.map(Array.makeBy(WALKS, (index) => index + 1), walkFrom);

test("no sequence of navigating, opening tracks, going back, typing and late replies breaks the rules", () => {
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
  expect(reaching("clicks Try again on a row")).toBeGreaterThan(WALKS / 100);
  expect(reaching("FailedTrackDetail")).toBeGreaterThan(WALKS / 20);
  // Pages chosen by a link did take the screen, and the URL with them.
  expect(reaching("pushes /track/")).toBeGreaterThan(WALKS / 20);
  expect(reaching("pushes /new")).toBeGreaterThan(WALKS / 10);
  // A request nobody answered: the Command's timeout, reported as a lost reply.
  expect(reaching('"failure":{"_tag":"Unknown"}')).toBeGreaterThan(WALKS / 10);
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
