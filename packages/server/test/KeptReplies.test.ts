import { expect, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import { ASKED_AGAIN_AFTER, type Keeping, keptRepliesOver } from "../src/Kept/KeptReplies.ts";

const Chart = Schema.Struct({ songs: Schema.Array(Schema.String) });
type Chart = typeof Chart.Type;

const keeping: Keeping<Chart> = {
  name: "chart",
  reply: Chart,
  freshFor: Duration.minutes(5),
  keptFor: Duration.minutes(30),
};

/**
 * A store in memory that every isolate made over it shares, as KV is shared.
 * Work behind a reply is set aside, as a request sets it aside, until
 * `afterTheReply` does it.
 */
const world = () => {
  const texts = new Map<string, string>();
  const waiting: Array<Effect.Effect<void>> = [];
  let reads = 0;
  const isolate = () =>
    keptRepliesOver({
      read: (name) =>
        Effect.sync(() => {
          reads += 1;
          return Option.fromNullishOr(texts.get(name));
        }),
      write: (name, text) => Effect.sync(() => void texts.set(name, text)),
      behind: (work) => Effect.sync(() => void waiting.push(work as Effect.Effect<void>)),
    });
  return {
    texts,
    isolate,
    reads: () => reads,
    waitingCount: () => waiting.length,
    afterTheReply: Effect.suspend(() =>
      Effect.forEach(waiting.splice(0), (work) => work, { discard: true }),
    ),
  };
};

/** A catalog that answers with the chart it was last given, and counts how often it is asked. */
const catalog = (first: Chart) => {
  let chart = first;
  let fails = false;
  let asked = 0;
  return {
    asked: () => asked,
    says: (next: Chart) => void (chart = next),
    isDown: (down: boolean) => void (fails = down),
    ask: Effect.suspend(() => {
      asked += 1;
      return fails ? Effect.fail("Unavailable" as const) : Effect.succeed(chart);
    }),
  };
};

const monday: Chart = { songs: ["One More Time"] };
const tuesday: Chart = { songs: ["Aerodynamic"] };

it.effect("a fresh reply is handed over without asking the catalog or the store again", () =>
  Effect.gen(function* () {
    const { isolate, reads, afterTheReply } = world();
    const deezer = catalog(monday);
    const chart = yield* isolate().keep(keeping, deezer.ask);

    expect(yield* chart).toEqual(monday);
    yield* afterTheReply;
    const readsForTheFirst = reads();

    yield* TestClock.adjust(Duration.minutes(4));
    deezer.says(tuesday);
    expect(yield* chart).toEqual(monday);
    expect(deezer.asked()).toBe(1);
    expect(reads()).toBe(readsForTheFirst);
  }),
);

it.effect("the first visit does not wait for the store to keep what the catalog said", () =>
  Effect.gen(function* () {
    const { isolate, texts, afterTheReply } = world();
    const chart = yield* isolate().keep(keeping, catalog(monday).ask);

    expect(yield* chart).toEqual(monday);
    expect(texts.size).toBe(0);
    yield* afterTheReply;
    expect(texts.size).toBe(1);
  }),
);

it.effect("another isolate answers from what the first one kept", () =>
  Effect.gen(function* () {
    const { isolate, afterTheReply } = world();
    const deezer = catalog(monday);
    const here = yield* isolate().keep(keeping, deezer.ask);
    yield* here;
    yield* afterTheReply;

    const there = yield* isolate().keep(keeping, deezer.ask);
    expect(yield* there).toEqual(monday);
    expect(deezer.asked()).toBe(1);
  }),
);

it.effect("a reply no longer fresh is handed over at once, and the catalog is asked behind it", () =>
  Effect.gen(function* () {
    const { isolate, afterTheReply } = world();
    const deezer = catalog(monday);
    const chart = yield* isolate().keep(keeping, deezer.ask);
    yield* chart;
    yield* afterTheReply;

    yield* TestClock.adjust(Duration.minutes(6));
    deezer.says(tuesday);
    expect(yield* chart).toEqual(monday);
    expect(deezer.asked()).toBe(1);

    yield* afterTheReply;
    expect(deezer.asked()).toBe(2);
    expect(yield* chart).toEqual(tuesday);
    expect(deezer.asked()).toBe(2);
  }),
);

it.effect("visits that arrive while the catalog is asked behind a reply do not ask it again", () =>
  Effect.gen(function* () {
    const { isolate, waitingCount, afterTheReply } = world();
    const deezer = catalog(monday);
    const chart = yield* isolate().keep(keeping, deezer.ask);
    yield* chart;
    yield* afterTheReply;

    yield* TestClock.adjust(Duration.minutes(6));
    yield* chart;
    yield* chart;
    yield* chart;
    expect(waitingCount()).toBe(1);
  }),
);

it.effect("a catalog that cannot be asked leaves the kept reply on show, and is asked again later", () =>
  Effect.gen(function* () {
    const { isolate, afterTheReply } = world();
    const deezer = catalog(monday);
    const chart = yield* isolate().keep(keeping, deezer.ask);
    yield* chart;
    yield* afterTheReply;

    yield* TestClock.adjust(Duration.minutes(6));
    deezer.isDown(true);
    expect(yield* chart).toEqual(monday);
    yield* afterTheReply;
    expect(deezer.asked()).toBe(2);

    // Not on the very next visit: the catalog has just failed to answer.
    expect(yield* chart).toEqual(monday);
    yield* afterTheReply;
    expect(deezer.asked()).toBe(2);

    yield* TestClock.adjust(ASKED_AGAIN_AFTER);
    deezer.isDown(false);
    deezer.says(tuesday);
    expect(yield* chart).toEqual(monday);
    yield* afterTheReply;
    expect(yield* chart).toEqual(tuesday);
  }),
);

it.effect("a reply too old to show is not shown: the visit waits for the catalog", () =>
  Effect.gen(function* () {
    const { isolate, afterTheReply } = world();
    const deezer = catalog(monday);
    const chart = yield* isolate().keep(keeping, deezer.ask);
    yield* chart;
    yield* afterTheReply;

    yield* TestClock.adjust(Duration.minutes(31));
    deezer.says(tuesday);
    expect(yield* chart).toEqual(tuesday);
  }),
);

it.effect("a failure is not kept, and reaches the visit that had nothing to show", () =>
  Effect.gen(function* () {
    const { isolate, texts, afterTheReply } = world();
    const deezer = catalog(monday);
    deezer.isDown(true);
    const chart = yield* isolate().keep(keeping, deezer.ask);

    expect(yield* Effect.flip(chart)).toBe("Unavailable");
    yield* afterTheReply;
    expect(texts.size).toBe(0);

    deezer.isDown(false);
    expect(yield* chart).toEqual(monday);
  }),
);

it.effect("a reply kept in another shape is asked for again and written over", () =>
  Effect.gen(function* () {
    const { isolate, texts, afterTheReply } = world();
    texts.set("chart", JSON.stringify({ keptAt: 0, reply: { tracks: ["One More Time"] } }));
    const deezer = catalog(tuesday);
    const chart = yield* isolate().keep(keeping, deezer.ask);

    expect(yield* chart).toEqual(tuesday);
    yield* afterTheReply;
    expect(JSON.parse(texts.get("chart") ?? "{}").reply).toEqual(tuesday);
  }),
);
