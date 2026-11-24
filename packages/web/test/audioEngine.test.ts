import { ListenerApi } from "@bafle/domain/ListenerApi.api";
import { expect, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";
import { REPLY_TIMEOUT } from "../src/catalog.ts";
import { AudioEngine, type EngineReport } from "../src/player/audioEngine.ts";
import * as HtmlAudioEngine from "../src/player/htmlAudioEngine.ts";
import * as Player from "../src/player/index.ts";
import { track } from "./fixtures.ts";

const { Message } = Player;

// The stories give the player the engine's reports as Messages and never run an order. These run
// both sides of that seam: the engine over a media element, which has to report what is true
// whatever order the element's events arrive in, and the Commands, which have to reach the
// engine at once and bring back what it said.

/** What a media element lets the engine read, settable from a test. */
type Stub = {
  paused: boolean;
  ended: boolean;
  seeking: boolean;
  readyState: number;
  currentTime: number;
  duration: number;
  error: { code: number } | null;
  bufferedEnd: number;
  /** How the next `play()` ends: the browser's answer to being asked to sound. */
  playResult: () => Promise<void>;
  played: number;
};

/**
 * A media element whose state a test sets by hand and whose events it fires
 * by hand: what a browser does on its own schedule, done on the test's.
 */
const stubElement = () => {
  const stub: Stub = {
    paused: true,
    ended: false,
    seeking: false,
    readyState: 0,
    currentTime: 0,
    duration: Number.NaN,
    error: null,
    bufferedEnd: 0,
    playResult: () => Promise.resolve(),
    played: 0,
  };
  const element = document.createElement("audio");
  const read = <Key extends keyof Stub>(key: Key) => ({ configurable: true, get: () => stub[key] });
  Object.defineProperties(element, {
    paused: read("paused"),
    ended: read("ended"),
    seeking: read("seeking"),
    readyState: read("readyState"),
    duration: read("duration"),
    error: read("error"),
    currentTime: {
      configurable: true,
      get: () => stub.currentTime,
      set: (value: number) => {
        stub.currentTime = value;
        stub.seeking = true;
      },
    },
    buffered: {
      configurable: true,
      get: () => ({ length: 1, start: () => 0, end: () => stub.bufferedEnd }),
    },
    play: {
      configurable: true,
      value: () => {
        stub.played += 1;
        const result = stub.playResult();
        // As a browser does: a refusal leaves the element paused, anything else unpauses it.
        result.then(
          () => {},
          () => {},
        );
        if (stub.playResult !== refusing) {
          stub.paused = false;
        }
        return result;
      },
    },
    pause: {
      configurable: true,
      value: () => {
        stub.paused = true;
      },
    },
  });
  const fire = (type: string) => element.dispatchEvent(new Event(type));
  return { element, stub, fire };
};

const named = (name: string) => Object.assign(new Error(name), { name });
const refusing = () => Promise.reject(named("NotAllowedError"));

/** Everything the engine says while a test runs, in order. */
const listening = (engine: typeof AudioEngine.Service) =>
  Effect.gen(function* () {
    const heard: Array<EngineReport> = [];
    yield* Effect.forkScoped(
      Stream.runForEach(engine.reports, (report) => Effect.sync(() => heard.push(report))),
    );
    yield* Effect.yieldNow;
    return heard;
  });

const phases = (heard: ReadonlyArray<EngineReport>) =>
  heard.map((report) => `${report.order}:${report.phase}`);

it.effect("whoever starts listening hears where things stand, not only what changes next", () =>
  Effect.gen(function* () {
    const { element } = stubElement();
    const heard = yield* listening(HtmlAudioEngine.make(element));

    expect(phases(heard)).toEqual(["0:Idle"]);
  }),
);

it.effect("an order is carried out the moment it is taken: the sound is asked for with nothing awaited first", () =>
  Effect.gen(function* () {
    const { element, stub } = stubElement();
    const engine = HtmlAudioEngine.make(element);

    const starting = yield* Effect.forkChild(
      engine.start({ order: 1, source: "https://audio.test/a.mp3", positionSeconds: 0 }),
      { startImmediately: true },
    );
    // Before anything else has had a turn: this is what keeps the sound inside the listener's tap.
    expect(stub.played).toBe(1);
    expect(element.src).toBe("https://audio.test/a.mp3");
    expect(yield* Fiber.join(starting)).toBe("Sounding");
  }),
);

it.effect("what it reports is stamped with the last order it took, and is what is true of the element", () =>
  Effect.gen(function* () {
    const { element, stub, fire } = stubElement();
    const engine = HtmlAudioEngine.make(element);
    const heard = yield* listening(engine);

    yield* engine.start({ order: 1, source: "https://audio.test/a.mp3", positionSeconds: 0 });
    stub.readyState = 4;
    stub.duration = 30.4;
    stub.bufferedEnd = 12.9;
    fire("playing");
    yield* engine.pause(2);
    yield* Effect.yieldNow;

    // Anything the element said while the first order was being carried out carries the number
    // before it, and the player drops it: an order's own number is only on what answers it.
    const answers = heard.filter((report) => report.order > 0);
    expect(phases(answers)).toEqual(["1:Waiting", "1:Sounding", "2:Paused"]);
    expect(answers[1]).toEqual({
      order: 1,
      phase: "Sounding",
      positionSeconds: 0,
      maybeDurationSeconds: Option.some(30.4),
      bufferedSeconds: 12,
      isSeeking: false,
    });
  }),
);

it.effect("an event is a prompt to look, not a fact: a late `pause` after play is not reported as paused", () =>
  Effect.gen(function* () {
    const { element, stub, fire } = stubElement();
    const engine = HtmlAudioEngine.make(element);
    yield* engine.start({ order: 1, source: "https://audio.test/a.mp3", positionSeconds: 0 });
    stub.readyState = 4;
    const heard = yield* listening(engine);

    yield* engine.pause(2);
    // The listener presses play before the element's `pause` event has been delivered.
    yield* engine.resume(3);
    fire("pause");
    fire("playing");
    yield* Effect.yieldNow;

    expect(phases(heard)).toEqual(["1:Sounding", "2:Paused", "3:Sounding"]);
  }),
);

it.effect("progress is reported when the second changes, not each time the clock runs", () =>
  Effect.gen(function* () {
    const { element, stub, fire } = stubElement();
    const engine = HtmlAudioEngine.make(element);
    yield* engine.start({ order: 1, source: "https://audio.test/a.mp3", positionSeconds: 0 });
    stub.readyState = 4;
    fire("playing");
    const heard = yield* listening(engine);

    [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].forEach((time) => {
      stub.currentTime = time;
      stub.seeking = false;
      fire("timeupdate");
    });
    yield* Effect.yieldNow;

    expect(heard.map((report) => report.positionSeconds)).toEqual([0, 1, 2]);
  }),
);

it.effect("the end, a failure and a move to another position are read from the element", () =>
  Effect.gen(function* () {
    const { element, stub, fire } = stubElement();
    const engine = HtmlAudioEngine.make(element);
    yield* engine.start({ order: 1, source: "https://audio.test/a.mp3", positionSeconds: 0 });
    stub.readyState = 4;
    const heard = yield* listening(engine);

    yield* engine.seek(2, 20);
    stub.seeking = false;
    fire("seeked");
    stub.ended = true;
    stub.paused = true;
    // The element pauses itself as it ends: the end is what is reported, not a pause.
    fire("pause");
    fire("ended");
    stub.ended = false;
    stub.error = { code: 4 };
    fire("error");
    yield* Effect.yieldNow;

    expect(heard.map((report) => `${report.phase}@${report.positionSeconds}${report.isSeeking ? "~" : ""}`)).toEqual([
      "Sounding@0",
      "Waiting@20~",
      "Sounding@20",
      "Ended@20",
      "Failed@20",
    ]);
  }),
);

it.effect("the system's refusal, a newer order and a source that will not play are told apart", () =>
  Effect.gen(function* () {
    const { element, stub } = stubElement();
    const engine = HtmlAudioEngine.make(element);

    stub.playResult = refusing;
    expect(yield* engine.start({ order: 1, source: "https://audio.test/a.mp3", positionSeconds: 0 })).toBe(
      "Refused",
    );
    stub.playResult = () => Promise.reject(named("AbortError"));
    expect(yield* engine.resume(2)).toBe("Superseded");
    stub.playResult = () => Promise.reject(named("NotSupportedError"));
    expect(yield* engine.resume(3)).toBe("Unplayable");
  }),
);

it.effect("a start from a position puts the element there before it sounds", () =>
  Effect.gen(function* () {
    const { element, stub } = stubElement();
    const engine = HtmlAudioEngine.make(element);

    yield* engine.start({ order: 1, source: "https://audio.test/a.mp3", positionSeconds: 12 });
    expect(stub.currentTime).toBe(12);
  }),
);

// COMMANDS

/** An engine that does nothing and remembers what it was asked. */
const recordingEngine = (outcome: "Sounding" | "Refused" = "Sounding") => {
  const orders: Array<ReadonlyArray<unknown>> = [];
  const layer = Layer.succeed(AudioEngine, {
    start: (order) => Effect.sync(() => (orders.push(["start", order]), outcome)),
    resume: (order) => Effect.sync(() => (orders.push(["resume", order]), outcome)),
    pause: (order) => Effect.sync(() => void orders.push(["pause", order])),
    seek: (order, positionSeconds) => Effect.sync(() => void orders.push(["seek", order, positionSeconds])),
    reports: Stream.never,
  });
  return { orders, layer };
};

it.effect("each order reaches the engine with its number, and brings back what the engine said", () => {
  const engine = recordingEngine("Refused");

  return Effect.gen(function* () {
    expect(
      yield* Player.StartPlayback({ order: 4, source: "https://audio.test/a.mp3", positionSeconds: 0 })
        .effect,
    ).toEqual(Message.CompletedStartPlayback({ order: 4, outcome: "Refused" }));
    expect(yield* Player.ResumePlayback({ order: 5 }).effect).toEqual(
      Message.CompletedResumePlayback({ order: 5, outcome: "Refused" }),
    );
    expect(yield* Player.PausePlayback({ order: 6 }).effect).toEqual(Message.CompletedPausePlayback());
    expect(yield* Player.SeekPlayback({ order: 7, positionSeconds: 21 }).effect).toEqual(
      Message.CompletedSeekPlayback(),
    );
    expect(engine.orders).toEqual([
      ["start", { order: 4, source: "https://audio.test/a.mp3", positionSeconds: 0 }],
      ["resume", 5],
      ["pause", 6],
      ["seek", 7, 21],
    ]);
  }).pipe(Effect.provide(engine.layer));
});

it.effect("activity is shown after 400 ms of waiting, and not a moment sooner", () =>
  Effect.gen(function* () {
    expect(Duration.toMillis(Player.SHOW_ACTIVITY_AFTER)).toBe(400);

    const waiting = yield* Effect.forkChild(Player.WaitBeforeShowingActivity({ order: 3 }).effect);
    yield* TestClock.adjust(Duration.millis(399));
    expect(waiting.pollUnsafe()).toBeUndefined();

    yield* TestClock.adjust(Duration.millis(1));
    expect(yield* Fiber.join(waiting)).toEqual(
      Message.CompletedWaitBeforeShowingActivity({ order: 3 }),
    );
  }),
);

it.effect("asking the catalog for a fresh source gives up like any other query, as a failure", () => {
  const hung = ListenerApi.layerClientHttp("https://bafle.test/api").pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(
      Layer.succeed(FetchHttpClient.Fetch, () => new Promise<Response>(() => {})),
    ),
  );

  return Effect.gen(function* () {
    const asking = yield* Effect.forkChild(
      Player.RefreshSource({ order: 2, trackId: track.id }).effect,
    );
    yield* TestClock.adjust(REPLY_TIMEOUT);
    expect(yield* Fiber.join(asking)).toEqual(Message.FailedRefreshSource({ order: 2 }));
  }).pipe(Effect.provide(hung));
});
