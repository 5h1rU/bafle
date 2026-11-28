import * as Duration from "effect/Duration";
import * as Equal from "effect/Equal";
import * as Option from "effect/Option";
import type { Update } from "foldkit";
import { modifyFields } from "foldkit/struct";
import { RESTS_FOR, STARTS_AFTER, Travel, WaitToTravel, passDuration } from "./command.ts";
import { Message } from "./message.ts";
import { type Model, init } from "./model.ts";

// UPDATE

type UpdateReturn = Update.Return<Model, Message>;

/** The line as it is held, or the very same Model when nothing of it changes. */
const kept = (model: Model, next: Model): Model => (Equal.equals(model, next) ? model : next);

/**
 * The line was measured again. What follows depends on what changed.
 *
 * Only its place: what holds it grew or narrowed under it. A pass goes as
 * far as the line is long, whatever the width of its place, so whatever is
 * under way, a wait or a pass, goes on undisturbed.
 *
 * It fits now, in the middle of a pass: it ends that pass, and stands for
 * good when it is over. Stopping it where it is would be a jump.
 *
 * Anything else, a line of another length or one that has started or
 * stopped fitting while it stood: it stands, and if it does not fit, the
 * wait before its first pass starts over.
 */
const measured = (
  model: Model,
  placePixels: number,
  maybeTravelPixels: Option.Option<number>,
): UpdateReturn => {
  const isMidPass = model.phase !== "Standing";

  if (Option.isNone(maybeTravelPixels) && isMidPass) {
    return {
      model: kept(
        model,
        modifyFields(model, { placePixels: () => placePixels, phase: () => "Finishing" }),
      ),
    };
  }
  if (Equal.equals(model.maybeTravelPixels, maybeTravelPixels)) {
    return {
      model: kept(
        model,
        modifyFields(model, {
          placePixels: () => placePixels,
          phase: (phase) => (phase === "Finishing" ? "Travelling" : phase),
        }),
      ),
    };
  }
  const run = model.run + 1;
  return {
    model: { run, placePixels, maybeTravelPixels, phase: "Standing" },
    commands: Option.match(maybeTravelPixels, {
      onNone: () => [],
      onSome: () => [WaitToTravel({ run, milliseconds: Duration.toMillis(STARTS_AFTER) })],
    }),
  };
};

/** A wait or a pass counts only for the run it was started for, and only for a line that does not fit. */
const forRun = (
  model: Model,
  run: number,
  act: (model: Model, travelPixels: number) => UpdateReturn,
): UpdateReturn =>
  run === model.run
    ? Option.match(model.maybeTravelPixels, {
        onNone: () => ({ model }),
        onSome: (travelPixels) => act(model, travelPixels),
      })
    : { model };

const startPass = (model: Model, travelPixels: number): UpdateReturn => ({
  model: modifyFields(model, { phase: () => "Travelling" }),
  commands: [
    Travel({ run: model.run, milliseconds: Duration.toMillis(passDuration(travelPixels)) }),
  ],
});

/**
 * A pass is over. The line stands and waits for the next; one that came to
 * fit while it travelled has made its last, and stands unmeasured against
 * no wait: the run is closed.
 */
const rest = (model: Model): UpdateReturn =>
  model.phase === "Finishing"
    ? {
        model: {
          run: model.run + 1,
          placePixels: model.placePixels,
          maybeTravelPixels: Option.none(),
          phase: "Standing",
        },
      }
    : {
        model: modifyFields(model, { phase: () => "Standing" }),
        commands: [WaitToTravel({ run: model.run, milliseconds: Duration.toMillis(RESTS_FOR) })],
      };

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    Measured: ({ placePixels, maybeTravelPixels }) =>
      measured(model, placePixels, maybeTravelPixels),
    CompletedWaitToTravel: ({ run }) => forRun(model, run, startPass),
    CompletedTravel: ({ run }) => forRun(model, run, rest),
  });

/**
 * The words have become other words: the line stands still again, as a line
 * does before anything is said of it, in a new run. Whatever wait or pass
 * was under way for the words before is not this line's any more.
 */
export const restart = (model: Model): UpdateReturn => ({
  model: modifyFields(init(), { run: () => model.run + 1 }),
});
