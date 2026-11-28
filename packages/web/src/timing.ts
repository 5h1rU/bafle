import * as Effect from "effect/Effect";
import type * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Tracer from "effect/Tracer";

// TIMING

// What the listener waits through is measured where a browser measures: its
// User Timing, which its own tools draw on their timeline and list in
// `performance.getEntriesByType("measure")`. Nothing is marked by hand. A
// wait is a span, Effect's own way to say that a stretch of work has a name
// and a length, and the Tracer named in `entry.ts` writes each wait down as
// it ends. Under any other Tracer, a test's among them, a wait is a span
// like any other and nothing is written.

const WAIT = "wait:";

/**
 * Names a stretch of a Command as one the listener waits through: `what` is
 * what they wait for. What is known of the wait when it ends is said with
 * `Effect.annotateCurrentSpan` inside it, and is written down with it.
 */
export const asWait = (what: string) => Effect.withSpan(`${WAIT}${what}`);

/** The track of a browser's timeline the waits are drawn on, where it draws tracks by name. */
const TRACK = "Bafle";

/**
 * The name a wait is written under: what was waited for, after the Command
 * it was part of, which Foldkit runs under a span of the Command's own name.
 * So an album's pictures are `AlbumDetail: pictures`.
 */
const nameOf = (span: Tracer.Span): string => {
  const what = span.name.slice(WAIT.length);
  return Option.match(span.parent, {
    onNone: () => what,
    onSome: (parent) => (parent._tag === "Span" ? `${parent.name}: ${what}` : what),
  });
};

// NOTE: `detail.devtools` is how a measure asks Chrome's Performance panel
// for a track of its own and for what to say of the entry. A browser that
// does not know it draws the measure among the others.
const detailOf = (span: Tracer.Span) => ({
  ...Object.fromEntries(span.attributes),
  devtools: {
    dataType: "track-entry",
    track: TRACK,
    properties: [...span.attributes].map(([key, value]) => [key, String(value)]),
  },
});

/**
 * A wait, which writes itself down as it ends. It notes when it began by the
 * browser's own clock for measures, since a span's times are the wall's.
 */
class WaitSpan extends Tracer.NativeSpan {
  // NOTE: a span is made and ended by the runtime as a Command runs, never
  // by `update` or a view: the clock is read where the work is done.
  // oxlint-disable-next-line foldkit/no-impure-call-at-decision-time
  private readonly beganAt = performance.now();

  override end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
    const isEnding = this.status._tag === "Started";
    super.end(endTime, exit);
    if (!isEnding) {
      return;
    }
    // NOTE: a Tracer is called from inside the runtime, where nothing can
    // fail: a browser that will not take the measure is left without it,
    // and the Command it was part of goes on.
    try {
      performance.measure(nameOf(this), {
        start: this.beganAt,
        // oxlint-disable-next-line foldkit/no-impure-call-at-decision-time
        end: performance.now(),
        detail: detailOf(this),
      });
    } catch {
      return;
    }
  }
}

const isWait = (name: string): boolean => name.startsWith(WAIT);

/** Effect's own Tracer, but for the waits, which are written to the browser's User Timing. */
export const tracer: Tracer.Tracer = Tracer.make({
  span: (options) => (isWait(options.name) ? new WaitSpan(options) : new Tracer.NativeSpan(options)),
});

/** The Tracer for the life of the page: named in `entry.ts`, with the rest of what Commands are given. */
export const layer: Layer.Layer<never> = Layer.succeed(Tracer.Tracer, tracer);
