import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { afterEach } from "vitest";
import * as Player from "../src/player/index.ts";
import { mediaKeys } from "../src/player/subscription.ts";

const { Message } = Player;

// The system's own controls for a player, a lock screen's or a headset's, reach the player as
// Messages. These run the seam itself: what a browser hands over, and what the player hears of it.

type Handlers = Map<MediaSessionAction, MediaSessionActionHandler | null>;

/** A browser whose Media Session keeps what it is handed, and refuses the controls named. */
const browserWith = (refused: ReadonlyArray<MediaSessionAction> = []): Handlers => {
  const handlers: Handlers = new Map();
  Object.defineProperty(navigator, "mediaSession", {
    configurable: true,
    value: {
      setActionHandler: (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
        if (refused.includes(action)) {
          throw new TypeError(`The provided value '${action}' is not a valid enum value`);
        }
        handlers.set(action, handler);
      },
    },
  });
  return handlers;
};

afterEach(() => {
  Reflect.deleteProperty(navigator, "mediaSession");
});

/** Everything the player hears of the system's controls while a test runs, in order. */
const listening = Effect.gen(function* () {
  const heard: Array<Player.Message> = [];
  yield* Effect.forkScoped(
    Stream.runForEach(mediaKeys, (message) => Effect.sync(() => heard.push(message))),
  );
  yield* Effect.yieldNow;
  return heard;
});

it.effect(
  "the system's bar for the sound says where it was moved to, and its keys which was pressed",
  () =>
    Effect.gen(function* () {
      const handlers = browserWith();
      const heard = yield* listening;

      handlers.get("seekto")?.({ action: "seekto", seekTime: 21.5 });
      handlers.get("pause")?.({ action: "pause" });
      yield* Effect.yieldNow;

      expect(heard).toEqual([
        Message.MovedMediaPosition({ positionSeconds: 21.5 }),
        Message.PressedMediaKey({ key: "Pause" }),
      ]);
    }),
);

it.effect("a bar moved with no place handed over says nothing", () =>
  Effect.gen(function* () {
    const handlers = browserWith();
    const heard = yield* listening;

    handlers.get("seekto")?.({ action: "seekto" });
    yield* Effect.yieldNow;

    expect(heard).toEqual([]);
  }),
);

it.effect("a browser that refuses one control still hands over the others", () =>
  Effect.gen(function* () {
    const handlers = browserWith(["seekto"]);
    const heard = yield* listening;

    expect(handlers.has("seekto")).toBe(false);
    handlers.get("nexttrack")?.({ action: "nexttrack" });
    yield* Effect.yieldNow;

    expect(heard).toEqual([Message.PressedMediaKey({ key: "Next" })]);
  }),
);

it.effect("the controls are handed back when nobody listens any more", () =>
  Effect.gen(function* () {
    const handlers = browserWith();
    yield* Effect.scoped(listening);
    yield* Effect.yieldNow;

    expect([...handlers.values()]).toEqual([null, null, null, null, null]);
  }),
);

it.effect("a browser with no Media Session hands over nothing, and nothing fails", () =>
  Effect.gen(function* () {
    const heard = yield* listening;

    expect(heard).toEqual([]);
  }),
);
