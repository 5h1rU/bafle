import { DragAndDrop, Slider } from "@foldkit/ui";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { Subscription } from "foldkit";
import { AudioEngine } from "./audioEngine.ts";
import { type MediaKey, Message } from "./message.ts";
import type { Model } from "./model.ts";

// SUBSCRIPTION

/** The system's own controls for a player, and the key each stands for. */
const MEDIA_ACTIONS: ReadonlyArray<readonly [MediaSessionAction, MediaKey]> = [
  ["play", "Play"],
  ["pause", "Pause"],
  ["nexttrack", "Next"],
  ["previoustrack", "Previous"],
];

/**
 * The play, pause, next and previous of a lock screen, a headset or a
 * keyboard, as the browser hands them over. A browser without the Media
 * Session API hands over nothing.
 */
const mediaKeys = Stream.callback<Message>((queue) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      if (!("mediaSession" in navigator)) {
        return;
      }
      MEDIA_ACTIONS.forEach(([action, key]) =>
        navigator.mediaSession.setActionHandler(action, () => {
          Queue.offerUnsafe(queue, Message.PressedMediaKey({ key }));
        }),
      );
    }),
    () =>
      Effect.sync(() => {
        if (!("mediaSession" in navigator)) {
          return;
        }
        MEDIA_ACTIONS.forEach(([action]) => navigator.mediaSession.setActionHandler(action, null));
      }),
  ).pipe(Effect.flatMap(() => Effect.never)),
);

/**
 * The engine is listened to from the first track played, and from then on:
 * its reports are the only way the Model learns what is sounding.
 */
const engineSubscriptions = Subscription.make<Model, Message, AudioEngine>()((entry) => ({
  engineReports: entry(
    { hasSession: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ hasSession: Option.isSome(model.maybeSession) }),
      dependenciesToStream: ({ hasSession }) =>
        Stream.when(
          Stream.unwrap(
            Effect.gen(function* () {
              const engine = yield* AudioEngine;
              return Stream.map(engine.reports, (report) => Message.UpdatedEngineStatus({ report }));
            }),
          ),
          Effect.sync(() => hasSession),
        ),
    },
  ),
  mediaKeys: entry(
    { hasSession: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ hasSession: Option.isSome(model.maybeSession) }),
      dependenciesToStream: ({ hasSession }) =>
        Stream.when(
          mediaKeys,
          Effect.sync(() => hasSession),
        ),
    },
  ),
}));

/** Dragging the progress bar is followed on the whole document: the pointer leaves the bar. */
const seekSliderSubscriptions = Subscription.lift({
  seekPointer: Slider.subscriptions.dragPointer,
  seekEscape: Slider.subscriptions.dragEscape,
})<Model, Message>({
  read: (model) => Option.map(model.maybeSession, (session) => session.seekSlider),
  toParentMessage: (message) => Message.GotSeekSliderMessage({ message }),
});

/**
 * A song of the queue taken up by its handle is carried over the whole
 * document, and one moved with the keys is moved by keys heard there.
 */
const queueDragSubscriptions = Subscription.lift(DragAndDrop.subscriptions)<Model, Message>({
  read: (model) => Option.map(model.maybeSession, (session) => session.queueDrag),
  toParentMessage: (message) => Message.GotQueueDragMessage({ message }),
});

export const subscriptions = Subscription.aggregate(
  engineSubscriptions,
  seekSliderSubscriptions,
  queueDragSubscriptions,
);
