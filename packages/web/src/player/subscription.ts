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

/** What one of the system's controls says when it is used, if it says anything the player can act on. */
type MediaAction = readonly [
  action: MediaSessionAction,
  said: (details: MediaSessionActionDetails) => Option.Option<Message>,
];

const pressed =
  (key: MediaKey) =>
  (): Option.Option<Message> =>
    Option.some(Message.PressedMediaKey({ key }));

/**
 * The system's own controls for a player, and what each says. Its bar for
 * the sound says where it was moved to; a browser that hands over no place
 * has said nothing.
 */
export const MEDIA_ACTIONS: ReadonlyArray<MediaAction> = [
  ["play", pressed("Play")],
  ["pause", pressed("Pause")],
  ["nexttrack", pressed("Next")],
  ["previoustrack", pressed("Previous")],
  [
    "seekto",
    ({ seekTime }) =>
      Option.map(Option.fromNullishOr(seekTime), (positionSeconds) =>
        Message.MovedMediaPosition({ positionSeconds }),
      ),
  ],
];

// NOTE: each control is handed over by itself. A browser that does not know
// one of them refuses it by throwing, and the others are still to be heard.
const hear = (
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null,
): Effect.Effect<void> =>
  Effect.ignore(Effect.try(() => navigator.mediaSession.setActionHandler(action, handler)));

const hasMediaSession = (): boolean => "mediaSession" in navigator;

/**
 * The play, pause, next and previous of a lock screen, a headset or a
 * keyboard, and the place its bar for the sound is moved to, as the browser
 * hands them over. A browser without the Media Session API hands over
 * nothing.
 */
// NOTE: where the sound is, how long it is and whether it sounds are not
// told to the system: with nothing said, a browser reads them off the audio
// element itself, which is the engine's and the only thing that knows.
export const mediaKeys = Stream.callback<Message>((queue) =>
  Effect.acquireRelease(
    Effect.when(
      Effect.forEach(
        MEDIA_ACTIONS,
        ([action, said]) =>
          hear(action, (details) => {
            const maybeMessage = said(details);
            if (Option.isSome(maybeMessage)) {
              Queue.offerUnsafe(queue, maybeMessage.value);
            }
          }),
        { discard: true },
      ),
      Effect.sync(hasMediaSession),
    ),
    () =>
      Effect.when(
        Effect.forEach(MEDIA_ACTIONS, ([action]) => hear(action, null), { discard: true }),
        Effect.sync(hasMediaSession),
      ),
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
