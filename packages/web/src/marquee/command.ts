import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Command } from "foldkit";
import { Message } from "./message.ts";

// COMMAND

// The line's times and speed were read off the app the island is modelled
// on, frame by frame: a title starts to move about three and a half seconds
// after its place last changed, and crosses it at about 45 points a second.
// The wait between two passes is five seconds.

/** How long a line stands before its first pass. */
export const STARTS_AFTER = Duration.millis(3500);

/** How long a line stands between one pass and the next. */
export const RESTS_FOR = Duration.seconds(5);

export const PIXELS_PER_SECOND = 45;

/** How long one pass takes: the way it goes, at the line's speed. */
export const passDuration = (travelPixels: number): Duration.Duration =>
  Duration.millis((travelPixels / PIXELS_PER_SECOND) * 1000);

/** The line stands for a while before it travels: before its first pass, and between passes. */
export const WaitToTravel = Command.define("WaitToTravel", {
  args: { run: Schema.Int, milliseconds: Schema.Number },
  messages: [Message.CompletedWaitToTravel],
  execute: ({ run, milliseconds }) =>
    Effect.sleep(Duration.millis(milliseconds)).pipe(
      Effect.as(Message.CompletedWaitToTravel({ run })),
    ),
});

/**
 * One pass of the line. The view moves it, with a transition as long as
 * this; the Command is the clock that says when the pass is over.
 */
export const Travel = Command.define("Travel", {
  args: { run: Schema.Int, milliseconds: Schema.Number },
  messages: [Message.CompletedTravel],
  execute: ({ run, milliseconds }) =>
    Effect.sleep(Duration.millis(milliseconds)).pipe(Effect.as(Message.CompletedTravel({ run }))),
});
