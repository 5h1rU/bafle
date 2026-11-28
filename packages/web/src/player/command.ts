import { TrackId } from "@bafle/domain/Catalog/Track";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command, Dom, Render } from "foldkit";
import { Catalog, REPLY_TIMEOUT } from "../catalog.ts";
import { AudioEngine } from "./audioEngine.ts";
import { Message } from "./message.ts";
import { QUEUE_CONTROL_ID } from "./model.ts";

// COMMAND

/**
 * How long a start may take before the interface says it is waiting. A start
 * that sounds sooner shows no activity at all: a spinner that flashes for a
 * tenth of a second says something went slowly when nothing did.
 */
export const SHOW_ACTIVITY_AFTER = Duration.millis(400);

/**
 * NOTE: the engine's `start` is the first thing this does. The runtime runs a
 * Command in a microtask of the event that caused it, which is still inside
 * the listener's tap as a phone counts it; anything awaited before `start`
 * would put the sound outside it, and the phone would refuse.
 */
export const StartPlayback = Command.define("StartPlayback", {
  args: { order: Schema.Int, source: Schema.String, positionSeconds: Schema.Number },
  messages: [Message.CompletedStartPlayback],
  execute: ({ order, source, positionSeconds }) =>
    Effect.gen(function* () {
      const engine = yield* AudioEngine;
      const outcome = yield* engine.start({ order, source, positionSeconds });
      return Message.CompletedStartPlayback({ order, outcome });
    }),
});

export const ResumePlayback = Command.define("ResumePlayback", {
  args: { order: Schema.Int },
  messages: [Message.CompletedResumePlayback],
  execute: ({ order }) =>
    Effect.gen(function* () {
      const engine = yield* AudioEngine;
      const outcome = yield* engine.resume(order);
      return Message.CompletedResumePlayback({ order, outcome });
    }),
});

export const PausePlayback = Command.define("PausePlayback", {
  args: { order: Schema.Int },
  messages: [Message.CompletedPausePlayback],
  execute: ({ order }) =>
    Effect.gen(function* () {
      const engine = yield* AudioEngine;
      yield* engine.pause(order);
      return Message.CompletedPausePlayback();
    }),
});

export const SeekPlayback = Command.define("SeekPlayback", {
  args: { order: Schema.Int, positionSeconds: Schema.Number },
  messages: [Message.CompletedSeekPlayback],
  execute: ({ order, positionSeconds }) =>
    Effect.gen(function* () {
      const engine = yield* AudioEngine;
      yield* engine.seek(order, positionSeconds);
      return Message.CompletedSeekPlayback();
    }),
});

export const WaitBeforeShowingActivity = Command.define("WaitBeforeShowingActivity", {
  args: { order: Schema.Int },
  messages: [Message.CompletedWaitBeforeShowingActivity],
  execute: ({ order }) =>
    Effect.sleep(SHOW_ACTIVITY_AFTER).pipe(
      Effect.as(Message.CompletedWaitBeforeShowingActivity({ order })),
    ),
});

export const RefreshSource = Command.define("RefreshSource", {
  args: { order: Schema.Int, trackId: TrackId },
  messages: [Message.SucceededRefreshSource, Message.FailedRefreshSource],
  execute: ({ order, trackId }) =>
    Catalog.TrackDetail({ input: { trackId }, requestId: `source:${order}` }).effect.pipe(
      Effect.map((reply) =>
        Match.value(reply).pipe(
          Match.tagsExhaustive({
            SucceededTrackDetail: ({ result }) =>
              Message.SucceededRefreshSource({ order, track: result }),
            FailedTrackDetail: () => Message.FailedRefreshSource({ order }),
          }),
        ),
      ),
      Effect.timeoutOrElse({
        duration: REPLY_TIMEOUT,
        orElse: () => Effect.succeed(Message.FailedRefreshSource({ order })),
      }),
    ),
});

/**
 * Tell the system what is playing, for the lock screen and for a headset's
 * display. A browser without the Media Session API is told nothing, and one
 * that will not take what it is told is left as it was: the sound does not
 * depend on it.
 */
export const PublishNowPlaying = Command.define("PublishNowPlaying", {
  args: {
    title: Schema.String,
    artist: Schema.String,
    album: Schema.String,
    maybeArtworkUrl: Schema.Option(Schema.String),
  },
  messages: [Message.CompletedPublishNowPlaying],
  execute: ({ title, artist, album, maybeArtworkUrl }) =>
    Effect.try(() => {
      if ("mediaSession" in navigator && typeof MediaMetadata !== "undefined") {
        navigator.mediaSession.metadata = new MediaMetadata({
          title,
          artist,
          album,
          artwork: Option.match(maybeArtworkUrl, {
            onNone: () => [],
            onSome: (src) => [{ src }],
          }),
        });
      }
    }).pipe(Effect.ignore, Effect.as(Message.CompletedPublishNowPlaying())),
});

/**
 * The expanded player's sheet, by what it is in the document: the piece that
 * scrolls is the one piece inside it.
 */
const SHEET_CONTENT_SELECTOR = '[data-layout="expanded"] > *';

/**
 * Puts what is in the expanded player's sheet back at its top, once the face
 * it has turned to is drawn. The two faces are of different lengths and
 * share the one box that scrolls: a face would otherwise be shown from where
 * the other was left, and the song's with its cover off the screen.
 */
export const ShowFaceFromTop = Command.define("ShowFaceFromTop", {
  messages: [Message.CompletedShowFaceFromTop],
  execute: Effect.gen(function* () {
    yield* Render.afterCommit;
    yield* Effect.sync(() =>
      document.querySelector(SHEET_CONTENT_SELECTOR)?.scrollTo({ top: 0, behavior: "instant" }),
    );
    return Message.CompletedShowFaceFromTop();
  }),
});

/**
 * Gives the focus to the island's control for the queue, once the column it
 * opened is closed by the column's own control: what held the focus went
 * with the column.
 */
export const FocusQueueControl = Command.define("FocusQueueControl", {
  messages: [Message.CompletedFocusQueueControl],
  execute: Dom.focus(`#${QUEUE_CONTROL_ID}`, { preventScroll: true }).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedFocusQueueControl()),
  ),
});
