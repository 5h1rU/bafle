import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import { AudioEngine, type EnginePhase, type EngineReport, type StartOutcome } from "./audioEngine.ts";

// HTML AUDIO ENGINE

/** `HTMLMediaElement.HAVE_FUTURE_DATA`: enough is held to go on from the position. */
const HAVE_FUTURE_DATA = 3;

/**
 * The element events after which what the engine knows may have changed.
 * None is trusted for what it is called: each only prompts another look at
 * the element. A `pause` still queued when the listener presses play again
 * finds an element that is not paused, and is reported as what is true.
 */
const PROMPTS: ReadonlyArray<string> = [
  "playing",
  "waiting",
  "stalled",
  "canplay",
  "pause",
  "ended",
  "error",
  "seeking",
  "seeked",
  "durationchange",
  "loadedmetadata",
  "progress",
  "timeupdate",
];

const phaseOf = (element: HTMLMediaElement): EnginePhase => {
  if (element.error !== null) {
    return "Failed";
  }
  if (element.currentSrc === "" && element.src === "") {
    return "Idle";
  }
  if (element.ended) {
    return "Ended";
  }
  if (element.paused) {
    return "Paused";
  }
  return element.readyState >= HAVE_FUTURE_DATA && !element.seeking ? "Sounding" : "Waiting";
};

/** The end of the stretch of data that holds the position: what can sound without a wait. */
const bufferedUntil = (element: HTMLMediaElement): number => {
  const { buffered, currentTime } = element;
  const holding = Array.from({ length: buffered.length }, (_, index) => index).find(
    (index) => buffered.start(index) <= currentTime && currentTime <= buffered.end(index),
  );
  return holding === undefined ? currentTime : buffered.end(holding);
};

/**
 * Whole seconds: the engine's clock runs several times a second, and the
 * interface has nothing new to say until the second changes.
 */
const read = (element: HTMLMediaElement, order: number): EngineReport => ({
  order,
  phase: phaseOf(element),
  positionSeconds: Math.floor(element.currentTime),
  maybeDurationSeconds: Number.isFinite(element.duration)
    ? Option.some(element.duration)
    : Option.none(),
  bufferedSeconds: Math.floor(bufferedUntil(element)),
  isSeeking: element.seeking,
});

const isSameReport = (one: EngineReport, other: EngineReport): boolean =>
  one.order === other.order &&
  one.phase === other.phase &&
  one.positionSeconds === other.positionSeconds &&
  one.bufferedSeconds === other.bufferedSeconds &&
  one.isSeeking === other.isSeeking &&
  Equal.equals(one.maybeDurationSeconds, other.maybeDurationSeconds);

const outcomeOf = (error: unknown): StartOutcome => {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError") {
    return "Refused";
  }
  return name === "AbortError" ? "Superseded" : "Unplayable";
};

type Engine = typeof AudioEngine.Service;

/**
 * The engine over one media element. The element is the caller's: it is made
 * once and never replaced, because a phone lets sound start only from the
 * listener's own tap, and an element that a tap has started stays allowed to
 * go on to the next track by itself.
 */
/**
 * An engine on an element, with the way to let go of the element when the
 * engine is done with: the sound stopped, and nothing listening to it.
 */
export const makeWithRelease = (
  element: HTMLMediaElement,
): Readonly<{ engine: Engine; release: Effect.Effect<void> }> => {
  const listeners = new Set<(report: EngineReport) => void>();
  const state: { order: number; maybeLastSaid: Option.Option<EngineReport> } = {
    order: 0,
    maybeLastSaid: Option.none(),
  };

  const say = (): void => {
    const report = read(element, state.order);
    if (Option.exists(state.maybeLastSaid, (last) => isSameReport(last, report))) {
      return;
    }
    state.maybeLastSaid = Option.some(report);
    listeners.forEach((listener) => listener(report));
  };

  PROMPTS.forEach((prompt) => element.addEventListener(prompt, say));

  /**
   * Take an order. It counts as taken once it is carried out: whatever the
   * element says while it is being carried out is still said of the order
   * before, and from here on what is said is said in answer to this one.
   */
  const obey = (order: number, act: () => void): Effect.Effect<void> =>
    Effect.sync(() => {
      act();
      state.order = order;
      say();
    });

  /**
   * NOTE: `play()` is called in the same turn the order is taken, with
   * nothing awaited before it. A phone allows sound only while the tap that
   * asked for it is still being handled.
   */
  const sound = (order: number, prepare: () => void): Effect.Effect<StartOutcome> =>
    Effect.callback<StartOutcome>((resume) => {
      prepare();
      const sounding = element.play();
      state.order = order;
      say();
      sounding.then(
        () => resume(Effect.succeed("Sounding")),
        (error: unknown) => resume(Effect.succeed(outcomeOf(error))),
      );
    });

  const engine: Engine = {
    start: ({ order, source, positionSeconds }) =>
      sound(order, () => {
        element.src = source;
        if (positionSeconds > 0) {
          element.currentTime = positionSeconds;
        }
      }),
    resume: (order) => sound(order, () => {}),
    pause: (order) => obey(order, () => element.pause()),
    seek: (order, positionSeconds) =>
      obey(order, () => {
        element.currentTime = positionSeconds;
      }),
    // NOTE: whoever starts listening is told where things stand before
    // anything changes. The player starts listening after its first order
    // is given, and a failure that fast would otherwise never be heard.
    reports: Stream.callback<EngineReport>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const listener = (report: EngineReport): void => {
            Queue.offerUnsafe(queue, report);
          };
          listeners.add(listener);
          listener(read(element, state.order));
          return listener;
        }),
        (listener) => Effect.sync(() => listeners.delete(listener)),
      ).pipe(Effect.flatMap(() => Effect.never)),
    ),
  };

  const release = Effect.sync(() => {
    element.pause();
    PROMPTS.forEach((prompt) => element.removeEventListener(prompt, say));
    listeners.clear();
  });

  return { engine, release };
};

/** An engine on an element that outlives it: a test's, which is thrown away with the test. */
export const make = (element: HTMLMediaElement): Engine => makeWithRelease(element).engine;

/**
 * One audio element for the life of the page. It is never in the document:
 * no page can rebuild it. The element is the Layer's to let go of: when the
 * runtime that was given the engine ends, the sound stops and the element
 * is left with nothing listening to it, instead of playing on with thirteen
 * listeners nobody will ever hear from.
 */
export const layer: Layer.Layer<AudioEngine> = Layer.effect(
  AudioEngine,
  Effect.map(
    Effect.acquireRelease(
      Effect.sync(() => {
        const element = new Audio();
        element.preload = "auto";
        return makeWithRelease(element);
      }),
      ({ release }) => release,
    ),
    ({ engine }) => engine,
  ),
);
