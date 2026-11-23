import * as Array from "effect/Array";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AsyncData } from "foldkit";
import { expect, test } from "vitest";
import { init, update } from "../src/main.ts";
import { Message } from "../src/message.ts";
import { canShow, type Model } from "../src/model.ts";
import { AppRoute, isSameRoute, searchRouter } from "../src/route.ts";
import { arrived, changedUrl, clickedLink, reply, url } from "./fixtures.ts";

// The stories pin each rule on a sequence chosen by hand. This walks thousands of sequences nobody
// chose: the listener navigates, types and retries at random while replies and pauses arrive late,
// early, or after their request was abandoned. After every step the Model must still be one the
// rules allow. The walks are seeded, so a failure names a sequence that fails again.

const WALKS = 3000;
const STEPS_PER_WALK = 16;

const PATHS: Array.NonEmptyReadonlyArray<string> = [
  "/",
  "/new",
  "/search",
  "/search?q=a",
  "/search?q=ab",
  "/search?q=a+",
  "/nowhere",
];
const LINKS: Array.NonEmptyReadonlyArray<string> = ["/", "/new", "/search"];
const FIELD_TEXTS: Array.NonEmptyReadonlyArray<string> = ["", "a", "ab", "a ", " ", "b"];

type Walk = Readonly<{
  model: Model;
  /** Messages on their way: replies, pauses, and the URL changes that Commands cause. */
  inFlight: ReadonlyArray<Message>;
  seed: number;
  trace: ReadonlyArray<string>;
  violations: ReadonlyArray<string>;
}>;

const nextSeed = (seed: number): number => (seed * 1664525 + 1013904223) % 4294967296;

const pick = <A>(items: Array.NonEmptyReadonlyArray<A>, seed: number): A =>
  Option.getOrElse(Array.get(items, seed % items.length), () => Array.headNonEmpty(items));

type Issued = NonNullable<ReturnType<typeof update>["commands"]>[number];

const hasRequestId = Schema.is(Schema.Struct({ requestId: Schema.String }));
const hasPauseId = Schema.is(Schema.Struct({ pauseId: Schema.String }));
const hasUrl = Schema.is(Schema.Struct({ url: Schema.String }));
const hasMaybeTerm = Schema.is(Schema.Struct({ maybeTerm: Schema.Option(Schema.String) }));

/** The Message a Command sends back when it runs, for the Commands whose Message changes the Model. */
const outcomeOf = (command: Issued, isAnswered: boolean): Option.Option<Message> => {
  const { name, args } = command;
  if (name === "HomeFeed" && hasRequestId(args)) {
    const { requestId } = args;
    return Option.some(arrived(isAnswered ? reply.home(requestId) : reply.homeRefused(requestId)));
  }
  if (name === "NewMusic" && hasRequestId(args)) {
    const { requestId } = args;
    return Option.some(
      arrived(isAnswered ? reply.newMusic(requestId) : reply.newMusicRefused(requestId)),
    );
  }
  if (name === "CatalogSearch" && hasRequestId(args)) {
    const { requestId } = args;
    return Option.some(
      arrived(isAnswered ? reply.search(requestId) : reply.searchRefused(requestId)),
    );
  }
  if (name === "WaitForTypingPause" && hasPauseId(args)) {
    return Option.some(Message.CompletedWaitForTypingPause({ pauseId: args.pauseId }));
  }
  if (name === "NavigateInternal" && hasUrl(args)) {
    // A link's URL is absolute, Try again's is a path: either way, where the address bar ends up.
    const target = new URL(args.url, "https://bafle.test");
    return Option.some(changedUrl(target.pathname + target.search));
  }
  if (name === "ReplaceSearchTerm" && hasMaybeTerm(args)) {
    return Option.some(changedUrl(searchRouter({ maybeTerm: args.maybeTerm })));
  }
  return Option.none();
};

type PageName = "home" | "newMusic" | "search";

const pendingPages = (model: Model): ReadonlyArray<PageName> =>
  Array.getSomes([
    Option.liftPredicate<PageName>("home", () => AsyncData.isPending(model.home)),
    Option.liftPredicate<PageName>("newMusic", () => AsyncData.isPending(model.newMusic)),
    Option.liftPredicate<PageName>("search", () => AsyncData.isPending(model.search)),
  ]);

const pageOf = (route: AppRoute): Option.Option<PageName> =>
  AppRoute.match<Option.Option<PageName>>(route, {
    Home: () => Option.some("home"),
    New: () => Option.some("newMusic"),
    Search: () => Option.some("search"),
    NotFound: () => Option.none(),
  });

/** Whether the page on screen is one that offers Try again: its last load or refresh failed. */
const showsTryAgain = (model: Model): boolean =>
  AppRoute.match(model.displayed, {
    Home: () => AsyncData.hasError(model.home),
    New: () => AsyncData.hasError(model.newMusic),
    Search: () => AsyncData.hasError(model.search),
    NotFound: () => false,
  });

/** What the rules allow of any Model, whatever happened before it. Returns the rules it breaks. */
const broken = (model: Model): ReadonlyArray<string> => {
  const pending = pendingPages(model);
  const isHeld = model.displayed._tag !== model.route._tag;
  const rules: ReadonlyArray<readonly [rule: string, holds: boolean]> = [
    [
      "a page is pending exactly when something is awaited",
      Array.isReadonlyArrayNonEmpty(pending) === (model.awaiting._tag !== "Nothing"),
    ],
    [
      "only the destination's page is ever pending",
      Array.every(pending, (page) => Option.contains(pageOf(model.route), page)),
    ],
    [
      "within one page, the screen follows the route at once",
      isHeld || isSameRoute(model.displayed, model.route),
    ],
    [
      "a page is held only while a reply for the destination is awaited",
      !isHeld || model.awaiting._tag === "Reply",
    ],
    [
      "a page is held only if it has something to show and the destination has not",
      !isHeld || (canShow(model, model.displayed) && !canShow(model, model.route)),
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

/** One thing happens: something in flight arrives, in any order, or the listener acts. */
const happening = (walk: Walk, seed: number): readonly [string, Message, ReadonlyArray<Message>] => {
  const roll = seed % 100;
  const choice = nextSeed(seed);

  if (roll < 45 && Array.isReadonlyArrayNonEmpty(walk.inFlight)) {
    const index = choice % walk.inFlight.length;
    return [
      `arrives: ${JSON.stringify(pick(walk.inFlight, index))}`,
      pick(walk.inFlight, index),
      Array.remove(walk.inFlight, index),
    ];
  }
  if (roll < 60) {
    const path = pick(PATHS, choice);
    return [`Back/Forward to ${path}`, changedUrl(path), walk.inFlight];
  }
  if (roll < 78) {
    const path = pick(LINKS, choice);
    return [`clicks link ${path}`, clickedLink(path), walk.inFlight];
  }
  if (roll < 92 && walk.model.displayed._tag === "Search") {
    const text = pick(FIELD_TEXTS, choice);
    return [`types "${text}"`, Message.UpdatedSearchField({ value: text }), walk.inFlight];
  }
  if (showsTryAgain(walk.model)) {
    return ["clicks Try again", Message.ClickedTryAgain(), walk.inFlight];
  }
  const path = pick(LINKS, choice);
  return [`clicks link ${path}`, clickedLink(path), walk.inFlight];
};

const step = (walk: Walk): Walk => {
  const seed = nextSeed(walk.seed);
  const [label, message, stillInFlight] = happening(walk, seed);
  const outcome = update(walk.model, message);
  const trace = Array.append(walk.trace, label);
  // About one request in three fails.
  const issued = Array.getSomes(
    Array.map(outcome.commands ?? [], (command, index) =>
      outcomeOf(command, nextSeed(seed + index) % 3 !== 0),
    ),
  );
  return {
    model: outcome.model,
    inFlight: Array.appendAll(stillInFlight, issued),
    seed: nextSeed(nextSeed(seed)),
    trace,
    violations: Array.appendAll(
      walk.violations,
      Array.map(broken(outcome.model), (rule) => `${rule}\n  after: ${trace.join("\n         ")}`),
    ),
  };
};

const walkFrom = (seed: number): Walk => {
  const path = pick(PATHS, seed);
  const opening = init(url(path));
  const start: Walk = {
    model: opening.model,
    inFlight: Array.getSomes(
      Array.map(opening.commands ?? [], (command) => outcomeOf(command, true)),
    ),
    seed,
    trace: [`opens ${path}`],
    violations: broken(opening.model),
  };
  return Array.reduce(Array.makeBy(STEPS_PER_WALK, () => step), start, (walk, advance) =>
    advance(walk),
  );
};

test("no sequence of navigating, typing, retrying and late replies breaks the rules", () => {
  const violations = Array.flatMap(Array.makeBy(WALKS, (index) => index + 1), (seed) =>
    Array.take(walkFrom(seed).violations, 1),
  );

  expect(Array.take(violations, 3)).toEqual([]);
});
