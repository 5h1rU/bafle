import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Schema from "effect/Schema";
import type * as Stream from "effect/Stream";

// AUDIO ENGINE

/**
 * What the engine is doing with the source it holds.
 * `Waiting` is wanting to sound and having nothing to sound with yet: before
 * the first data, after a stall, or while it moves to another position.
 */
export const EnginePhase = Schema.Literals([
  "Idle",
  "Waiting",
  "Sounding",
  "Paused",
  "Ended",
  "Failed",
]);
export type EnginePhase = typeof EnginePhase.Type;

/**
 * Everything the engine knows, said whole each time. A report is the truth
 * at the moment it was made, so reports can be dropped or arrive late and
 * the last one read is still right: nothing has to be pieced together from
 * the order of events.
 */
export const EngineReport = Schema.Struct({
  /**
   * The last order the engine had received when it said this. A report made
   * before the engine heard the listener's latest order is about a wish the
   * listener no longer has.
   */
  order: Schema.Int,
  phase: EnginePhase,
  /** Where the sound was when this was said, to the fraction of a second. */
  positionSeconds: Schema.Number,
  /** The length of the audio itself, once the engine has read it. */
  maybeDurationSeconds: Schema.Option(Schema.Number),
  /** How far the engine holds data without a gap from the position. */
  bufferedSeconds: Schema.Number,
  /** It was asked for another position and is not there yet. */
  isSeeking: Schema.Boolean,
});
export type EngineReport = typeof EngineReport.Type;

/**
 * How asking the engine to sound ended. `Refused` is the system saying no
 * before anything loaded, as a browser does when sound was not started by the
 * listener's own hand. `Superseded` is a newer order taking its place.
 * `Unplayable` is the source itself: the engine's reports say the same.
 */
export const StartOutcome = Schema.Literals(["Sounding", "Refused", "Superseded", "Unplayable"]);
export type StartOutcome = typeof StartOutcome.Type;

/**
 * The one thing that makes sound. The player gives it orders and reads its
 * reports, and knows nothing of what is behind it: an audio element today, a
 * provider's own player tomorrow. Every order carries its number, which the
 * engine stamps on what it reports from then on.
 */
export class AudioEngine extends Context.Service<
  AudioEngine,
  {
    /** Load a source and sound it from a position. Ends when the engine sounds, or will not. */
    readonly start: (order: {
      readonly order: number;
      readonly source: string;
      readonly positionSeconds: number;
    }) => Effect.Effect<StartOutcome>;
    /** Sound again what is loaded. */
    readonly resume: (order: number) => Effect.Effect<StartOutcome>;
    readonly pause: (order: number) => Effect.Effect<void>;
    readonly seek: (order: number, positionSeconds: number) => Effect.Effect<void>;
    /** What the engine knows now, and again each time it changes. */
    readonly reports: Stream.Stream<EngineReport>;
    /**
     * What the engine knows at this moment, asked for and not waited for. Its
     * reports come when the second changes, as late as its clock happens to
     * run; the bar of the sound's progress asks where the sound is at an even
     * pace of its own.
     */
    readonly now: Effect.Effect<EngineReport>;
  }
>()("bafle/AudioEngine") {}

/** Whether two reports say the same, to the fraction of a second. */
export const isSameReport = (one: EngineReport, other: EngineReport): boolean =>
  one.order === other.order &&
  one.phase === other.phase &&
  one.positionSeconds === other.positionSeconds &&
  one.bufferedSeconds === other.bufferedSeconds &&
  one.isSeeking === other.isSeeking &&
  Equal.equals(one.maybeDurationSeconds, other.maybeDurationSeconds);
