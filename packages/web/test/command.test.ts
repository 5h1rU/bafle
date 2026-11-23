import { expect, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import { ReplaceSearchTerm, TYPING_PAUSE, WaitForTypingPause } from "../src/command.ts";
import { Message } from "../src/message.ts";

// The stories resolve Commands by their Messages and never run them. These run the two whose
// effect is itself a requirement: how typing treats the history, and how long a pause is.

it.effect("typing rewrites the current history entry and the URL holds the term", () =>
  Effect.gen(function* () {
    const entries = history.length;

    yield* ReplaceSearchTerm({ maybeTerm: Option.some("daft punk") }).effect;
    expect(location.pathname + location.search).toBe("/search?q=daft+punk");

    yield* ReplaceSearchTerm({ maybeTerm: Option.none() }).effect;
    expect(location.pathname + location.search).toBe("/search");

    expect(history.length).toBe(entries);
  }),
);

it.effect("a typing pause is about 300 ms, and not a moment less", () =>
  Effect.gen(function* () {
    expect(Duration.toMillis(TYPING_PAUSE)).toBe(300);

    const waiting = yield* Effect.forkChild(WaitForTypingPause({ pauseId: "page:1" }).effect);
    yield* TestClock.adjust(Duration.millis(299));
    expect(waiting.pollUnsafe()).toBeUndefined();

    yield* TestClock.adjust(Duration.millis(1));
    expect(yield* Fiber.join(waiting)).toEqual(
      Message.CompletedWaitForTypingPause({ pauseId: "page:1" }),
    );
  }),
);
