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
import { Message, type PlayOrigin } from "../src/message.ts";
import {
  addressOf,
  Awaiting,
  canShow,
  maybeHeadedFor,
  type Model,
  trackData,
  wayBack,
} from "../src/model.ts";
import type { EnginePhase } from "../src/player/audioEngine.ts";
import * as Player from "../src/player/index.ts";
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
// The listener also plays tracks while all of that goes on: taps rows and the track page's control,
// pauses, skips, goes back, retries. Every order the app gives the engine is answered the way an
// engine might, with reports that arrive in any order, late, after the listener has asked for
// something else, or never. Three more things are held after every step: the app never says a
// track is sounding unless the engine said so in answer to the latest order, the current track
// changes only by the listener's choice or by the track before it ending, and playing and
// navigating never reach into each other.
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

/** What a row can be tapped for: the tracks of the lists, and one no list has. */
const PLAYABLE_IDS: Array.NonEmptyReadonlyArray<TrackId> = [
  track.id,
  explicitTrack.id,
  track.id,
  explicitTrack.id,
  MISSING_TRACK_ID,
];

const PLAYER_CONTROLS: Array.NonEmptyReadonlyArray<Player.Message> = [
  Player.Message.ClickedPause(),
  Player.Message.ClickedPlay(),
  Player.Message.ClickedNext(),
  Player.Message.ClickedPrevious(),
  Player.Message.ClickedTryAgain(),
  Player.Message.ClickedPause(),
  Player.Message.ClickedPlay(),
];

/** The browser's history for this tab since the app loaded: the paths, and which one is current. */
type History = Readonly<{ entries: ReadonlyArray<string>; index: number }>;

type Walk = Readonly<{
  model: Model;
  history: History;
  /** URL changes the browser has made and the app has not heard of yet. They arrive in order. */
  urlChanges: ReadonlyArray<Message>;
  /** Replies and pauses on their way. They arrive in any order, or never. */
  replies: ReadonlyArray<Message>;
  /** The orders in answer to which the engine has said, and the app has heard, that it sounds. */
  soundingSaidFor: ReadonlyArray<number>;
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
const hasOrder = Schema.is(Schema.Struct({ order: Schema.Number }));
const hasOrderAndTrack = Schema.is(Schema.Struct({ order: Schema.Number, trackId: TrackId }));

/** A Message of the player's, as the app receives it. */
const player = (message: Player.Message): Message => Message.GotPlayerMessage({ message });

/** The engine's word, in answer to an order. */
const said = (
  order: number,
  phase: EnginePhase,
  positionSeconds: number,
  isSeeking: boolean = false,
): Message =>
  player(
    Player.Message.UpdatedEngineStatus({
      report: {
        order,
        phase,
        positionSeconds,
        // The length is read with the first data: an engine waiting at the very start has none yet.
        maybeDurationSeconds:
          phase === "Waiting" && positionSeconds === 0 ? Option.none() : Option.some(30),
        bufferedSeconds: positionSeconds,
        isSeeking,
      },
    }),
  );

/** The orders the app gives the engine, and the rest of what only the player may ask for. */
const PLAYER_COMMANDS: ReadonlyArray<string> = [
  "StartPlayback",
  "ResumePlayback",
  "PausePlayback",
  "SeekPlayback",
  "WaitBeforeShowingActivity",
  "RefreshSource",
  "PublishNowPlaying",
];

const ENGINE_ORDERS: ReadonlyArray<string> = [
  "StartPlayback",
  "ResumePlayback",
  "PausePlayback",
  "SeekPlayback",
];

/**
 * What an engine might say in answer to an order. It is all put in the same
 * bag as the catalog's replies, to arrive in any order or never: an engine
 * that says a track ended before it says it sounds is one the app must survive.
 */
const engineAnswers = (command: Issued, seed: number): ReadonlyArray<Message> => {
  const { name, args } = command;
  if (!hasOrder(args)) {
    return [];
  }
  const { order } = args;
  const roll = seed % 8;
  if (name === "StartPlayback" || name === "ResumePlayback") {
    const refusal =
      name === "StartPlayback"
        ? Player.Message.CompletedStartPlayback({ order, outcome: "Refused" })
        : Player.Message.CompletedResumePlayback({ order, outcome: "Refused" });
    if (roll === 0) {
      return [player(refusal), said(order, "Paused", 0)];
    }
    if (roll === 1) {
      return [said(order, "Waiting", 0), said(order, "Failed", 0)];
    }
    if (roll === 2) {
      return [said(order, "Waiting", 0)];
    }
    return [
      said(order, "Waiting", 0),
      said(order, "Sounding", 0),
      said(order, "Sounding", 5),
      ...(roll === 3 ? [said(order, "Waiting", 5), said(order, "Paused", 6)] : []),
      // A source that goes bad under way, after it has sounded.
      ...(roll === 4 ? [said(order, "Failed", 5)] : []),
      ...(roll > 5 ? [said(order, "Ended", 30)] : []),
    ];
  }
  if (name === "PausePlayback") {
    return [said(order, "Paused", 5)];
  }
  if (name === "SeekPlayback") {
    return [
      said(order, "Waiting", 9, true),
      said(order, roll < 2 ? "Paused" : "Sounding", 9),
    ];
  }
  if (name === "WaitBeforeShowingActivity") {
    return [player(Player.Message.CompletedWaitBeforeShowingActivity({ order }))];
  }
  if (name === "RefreshSource" && hasOrderAndTrack(args)) {
    return [
      player(
        roll % 2 === 0
          ? Player.Message.FailedRefreshSource({ order })
          : Player.Message.SucceededRefreshSource({
              order,
              track: {
                ...fullTrack,
                id: args.trackId,
                previewUrl: `https://audio.test/fresh-${order}.mp3`,
              },
            }),
      ),
    ];
  }
  return [];
};
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

const playbackOf = (model: Model): Option.Option<Player.Playback> =>
  Option.map(model.player.maybeSession, (session) => session.playback);

/** The order a report answers, when the Message is the engine's word. */
const reportOf = (message: Message) =>
  message._tag === "GotPlayerMessage" && message.message._tag === "UpdatedEngineStatus"
    ? Option.some(message.message.report)
    : Option.none();

const isPlaying = (message: Message): boolean =>
  message._tag === "GotPlayerMessage" || message._tag === "ClickedPlayTrack";

/** The Messages by which the listener puts another track in the player. */
const isListenersChoice = (message: Message): boolean =>
  message._tag === "ClickedPlayTrack" ||
  (message._tag === "GotPlayerMessage" &&
    ["ClickedNext", "ClickedPrevious", "PressedMediaKey"].includes(message.message._tag));

/**
 * What must be true of the player after any step, whatever came before:
 * what it holds, and what it claims of the sound against what the engine has
 * said in answer to the latest order.
 */
const mistaken = (model: Model, soundingSaidFor: ReadonlyArray<number>): ReadonlyArray<string> =>
  Option.match(model.player.maybeSession, {
    onNone: () => (model.player.lastOrder === 0 ? [] : ["orders were given with nothing to play"]),
    onSome: (session) => {
      const others = [...session.earlier, ...session.later];
      const rules: ReadonlyArray<readonly [rule: string, holds: boolean]> = [
        [
          "the interface never shows sounding without the engine having said so since the last order",
          !Player.Playback.guards.Sounding(session.playback) ||
            soundingSaidFor.includes(model.player.lastOrder),
        ],
        [
          "at most one track is current: the queue around it never holds it again",
          Array.every(others, (queued) => queued.id !== session.current.id),
        ],
        [
          "everything in the queue has something to play",
          Array.every([session.current, ...others], Player.isPlayable),
        ],
        [
          "the listener seeks only once the engine has read the length",
          Player.Seek.guards.Settled(session.seek) || Option.isSome(session.maybeDurationSeconds),
        ],
      ];
      return pipe(
        rules,
        Array.filter(([, holds]) => !holds),
        Array.map(([rule]) => rule),
      );
    },
  });

/**
 * What one step may do to the player, and what playing may do to the rest:
 * read from the Model before it, the Message, the Model after it and the
 * Commands it issued.
 */
const overstepping = (
  before: Model,
  message: Message,
  after: Model,
  commands: ReadonlyArray<Issued>,
): ReadonlyArray<string> => {
  const issued = Array.map(commands, ({ name }) => name);
  const orders = Array.filter(commands, ({ name }) => ENGINE_ORDERS.includes(name));
  const currentBefore = Option.getOrUndefined(Player.maybeCurrentTrackId(before.player));
  const currentAfter = Option.getOrUndefined(Player.maybeCurrentTrackId(after.player));
  const maybeReport = reportOf(message);
  const isStale = Option.exists(maybeReport, (report) => report.order !== before.player.lastOrder);
  const rules: ReadonlyArray<readonly [rule: string, holds: boolean]> = [
    [
      "navigation never issues an engine order, nor touches the player",
      isPlaying(message) ||
        (after.player === before.player &&
          !Array.some(issued, (name) => PLAYER_COMMANDS.includes(name))),
    ],
    [
      "playing never moves the screen, the URL, what is awaited or what the pages hold",
      !isPlaying(message) ||
        (after.route === before.route &&
          after.awaiting === before.awaiting &&
          after.trail === before.trail &&
          after.tracks === before.tracks &&
          after.newMusic === before.newMusic &&
          after.search === before.search &&
          Array.every(issued, (name) => PLAYER_COMMANDS.includes(name))),
    ],
    [
      "what the engine says of an earlier order changes nothing",
      !isStale || (after === before && Array.isReadonlyArrayEmpty(commands)),
    ],
    [
      "every order given to the engine carries the latest number, and one step gives at most one",
      orders.length <= 1 &&
        Array.every(
          orders,
          ({ args }) =>
            hasOrder(args) &&
            args.order === after.player.lastOrder &&
            args.order === before.player.lastOrder + 1,
        ),
    ],
    [
      "the order number moves only with an order to the engine",
      after.player.lastOrder === before.player.lastOrder + orders.length,
    ],
    [
      // Not a failure, not a refusal, not a stall: the queue never moves on by itself past a track that did not play.
      "the current track changes only by the listener's choice, or by the one before it ending",
      currentAfter === currentBefore ||
        isListenersChoice(message) ||
        Option.exists(
          maybeReport,
          (report) => report.phase === "Ended" && report.order === before.player.lastOrder,
        ),
    ],
    [
      "the player, once there, is never taken away",
      Option.isNone(before.player.maybeSession) || Option.isSome(after.player.maybeSession),
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

  const playRoll = nextSeed(choice) % 100;
  const playChoice = nextSeed(nextSeed(choice));
  if (playRoll < 12 && Option.isSome(walk.model.player.maybeSession)) {
    const control = pick(PLAYER_CONTROLS, playChoice);
    return {
      label: `presses the player's ${control._tag}`,
      message: player(control),
      ...unchanged,
    };
  }
  if (playRoll < 30 && listsTracks(walk.model)) {
    const from: PlayOrigin = walk.model.route._tag === "Search" ? "Search" : "New";
    return {
      label: "taps a row to play",
      message: Message.ClickedPlayTrack({ trackId: pick(PLAYABLE_IDS, playChoice), from }),
      ...unchanged,
    };
  }
  if (playRoll < 30 && walk.model.route._tag === "Track") {
    return {
      label: "presses Play on the track's page",
      message: Message.ClickedPlayTrack({ trackId: walk.model.route.trackId, from: "Track" }),
      ...unchanged,
    };
  }

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
  const sent = [
    ...Array.getSomes(
      Array.map(commands, (command, index) => replyTo(command, fateOf(nextSeed(seed + index)))),
    ),
    ...Array.flatMap(commands, (command, index) =>
      engineAnswers(command, nextSeed(nextSeed(seed + index))),
    ),
  ];
  const soundingSaidFor = Option.match(reportOf(happened.message), {
    onNone: () => walk.soundingSaidFor,
    onSome: (report) =>
      report.phase === "Sounding"
        ? Array.append(walk.soundingSaidFor, report.order)
        : walk.soundingSaidFor,
  });
  const isSettled = Array.isReadonlyArrayEmpty(moved.urlChanges);

  return {
    model: outcome.model,
    history: moved.history,
    urlChanges: moved.urlChanges,
    replies: Array.appendAll(happened.replies, sent),
    soundingSaidFor,
    seed: nextSeed(nextSeed(seed)),
    trace,
    violations: Array.appendAll(
      walk.violations,
      Array.map(
        [
          ...broken(outcome.model),
          ...mistaken(outcome.model, soundingSaidFor),
          ...overstepping(walk.model, happened.message, outcome.model, commands),
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
    soundingSaidFor: [],
    seed,
    trace: [`opens ${path}`],
    violations: [...broken(opening.model), ...astray(opening.model, history)],
  };
  return Array.reduce(Array.makeBy(STEPS_PER_WALK, () => step), start, (walk, advance) =>
    advance(walk),
  );
};

const walks = Array.map(Array.makeBy(WALKS, (index) => index + 1), walkFrom);

test("no sequence of navigating, opening tracks, playing, going back, typing and late replies breaks the rules", () => {
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
  // Playing, and everything an engine can answer with, while all of the above goes on.
  expect(reaching("taps a row to play")).toBeGreaterThan(WALKS / 10);
  expect(reaching("presses Play on the track's page")).toBeGreaterThan(WALKS / 50);
  expect(reaching("presses the player's ClickedPause")).toBeGreaterThan(WALKS / 50);
  expect(reaching("presses the player's ClickedNext")).toBeGreaterThan(WALKS / 100);
  expect(reaching("presses the player's ClickedPrevious")).toBeGreaterThan(WALKS / 100);
  expect(reaching('"phase":"Sounding"')).toBeGreaterThan(WALKS / 10);
  expect(reaching('"phase":"Ended"')).toBeGreaterThan(WALKS / 50);
  expect(reaching('"phase":"Failed"')).toBeGreaterThan(WALKS / 50);
  expect(reaching('"outcome":"Refused"')).toBeGreaterThan(WALKS / 100);
  expect(reaching("SucceededRefreshSource")).toBeGreaterThan(WALKS / 200);
  expect(reaching("FailedRefreshSource")).toBeGreaterThan(WALKS / 200);

  // And the walks end in every state the player has a look for.
  const endings = (tag: Player.Playback["_tag"]): number =>
    Array.filter(walks, (walk) =>
      Option.exists(playbackOf(walk.model), (playback) => playback._tag === tag),
    ).length;
  expect(endings("Sounding")).toBeGreaterThan(0);
  expect(endings("Acknowledged")).toBeGreaterThan(0);
  expect(endings("Starting")).toBeGreaterThan(0);
  expect(endings("Waiting")).toBeGreaterThan(0);
  expect(endings("Paused")).toBeGreaterThan(0);
  expect(endings("Stopped")).toBeGreaterThan(0);
  expect(endings("Failed")).toBeGreaterThan(0);
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
