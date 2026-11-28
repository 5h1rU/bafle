import { expect, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { pipe } from "effect/Function";
import * as TestClock from "effect/testing/TestClock";
import { afterEach, beforeEach, vi } from "vitest";
import { PICTURE_WAIT, preparePictures } from "../src/command.ts";
import * as Timing from "../src/timing.ts";

// What the listener waits through is written to the browser's User Timing by the Tracer the app
// names, and by no other: a wait is a span, and the Commands that open one know nothing of where
// it is written.

const written = () =>
  performance
    .getEntriesByType("measure")
    .map((measure) => [measure.name, "detail" in measure ? measure.detail : undefined]);

beforeEach(() => {
  performance.clearMeasures();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A browser in which a picture's decoding ends when the test says so. */
const picturesThat = (decode: () => Promise<void>) =>
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      decode = decode;
    },
  );

it.effect(
  "a wait is written as it ends, after the Command it was part of, with what was said of it",
  () =>
    Effect.gen(function* () {
      yield* pipe(
        Effect.annotateCurrentSpan({ reply: "SucceededAlbumDetail" }),
        Timing.asWait("catalog"),
        Effect.withSpan("AlbumDetail"),
        Effect.provide(Timing.layer),
      );

      expect(written()).toEqual([
        [
          "AlbumDetail: catalog",
          {
            reply: "SucceededAlbumDetail",
            devtools: {
              dataType: "track-entry",
              track: "Bafle",
              properties: [["reply", "SucceededAlbumDetail"]],
            },
          },
        ],
      ]);
    }),
);

it.effect("only waits are written: a Command's own span, and any other, is not", () =>
  Effect.gen(function* () {
    yield* pipe(Effect.void, Effect.withSpan("ScrollPageToTop"), Effect.provide(Timing.layer));

    expect(written()).toEqual([]);
  }),
);

it.effect("under another Tracer a wait is a span like any other, and nothing is written", () =>
  Effect.gen(function* () {
    yield* pipe(Effect.void, Timing.asWait("catalog"));

    expect(written()).toEqual([]);
  }),
);

it.effect(
  "the wait for a page's first pictures says how many they were and that they were ready",
  () =>
    Effect.gen(function* () {
      picturesThat(() => Promise.resolve());

      yield* pipe(
        preparePictures(["https://img.test/a", "https://img.test/b"]),
        Effect.provide(Timing.layer),
      );

      expect(written()).toMatchObject([["pictures", { pictures: 2, ended: "Ready" }]]);
    }),
);

it.effect("a wait for pictures that ran out says so", () =>
  Effect.gen(function* () {
    picturesThat(() => new Promise<void>(() => {}));

    const waiting = yield* Effect.forkChild(
      pipe(preparePictures(["https://img.test/a"]), Effect.provide(Timing.layer)),
    );
    yield* TestClock.adjust(PICTURE_WAIT);
    yield* Fiber.join(waiting);

    expect(written()).toMatchObject([["pictures", { pictures: 1, ended: "RanOut" }]]);
    expect(Duration.toMillis(PICTURE_WAIT)).toBe(300);
  }),
);
