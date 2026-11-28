import { clsx } from "clsx";
import * as Option from "effect/Option";
import { Submodel } from "foldkit";
import { PIXELS_PER_SECOND } from "./command.ts";
import type { Message } from "./message.ts";
import type { Model } from "./model.ts";
import { LINE_ATTRIBUTE, Measure, WORDS_ATTRIBUTE } from "./mount.ts";

// VIEW

/**
 * What a line is drawn with: its words, the name it goes by where it
 * stands (said on it, for whoever looks for this line among others), and
 * how its words look.
 */
export type ViewInputs = Readonly<{
  name: string;
  words: string;
  className: string;
}>;

/**
 * Where the line is, and how it gets there. Standing, it is where it
 * begins, at once. Travelling, it goes one pass's way at the line's speed:
 * the transition is as long as the Command that says when the pass is over.
 */
const lineStyle = (model: Model): Record<string, string> =>
  Option.match(model.phase === "Standing" ? Option.none() : model.maybeTravelPixels, {
    onNone: () => ({ transform: "translateX(0)", transition: "none" }),
    onSome: (travelPixels) => ({
      transform: `translateX(${-travelPixels}px)`,
      transition: `transform ${Math.round((travelPixels / PIXELS_PER_SECOND) * 1000)}ms linear`,
    }),
  });

// NOTE: the line comes in from under the edge of what stands before it and
// fades there, so its place reaches a little under that edge; a line that
// does not fit fades at the far end too. Under reduced motion the line keeps
// still, whatever the view says of where it is.
const PLACE_CLASS = "-ml-2 overflow-hidden pl-2 whitespace-nowrap";

const EDGES = {
  Lead: "mask-[linear-gradient(to_right,transparent,black_0.5rem)]",
  Both: "mask-[linear-gradient(to_right,transparent,black_0.5rem,black_calc(100%-1rem),transparent)]",
} as const;

/**
 * A line of words in its place. One that fits is just its words. One that
 * does not waits, then travels across its place once, its copy following it
 * in, until the copy stands where the words began; then it waits again. The
 * words that reach an end of the place fade there.
 */
export const view = Submodel.defineView<Model, Message, ViewInputs>((model, viewInputs, h) => {
  const isOverflowing = Option.isSome(model.maybeTravelPixels);

  return h.div(
    [
      h.DataAttribute("marquee", viewInputs.name),
      h.DataAttribute("phase", model.phase),
      ...(isOverflowing ? [h.DataAttribute("overflowing", "")] : []),
      h.Class(clsx(PLACE_CLASS, isOverflowing ? EDGES.Both : EDGES.Lead, viewInputs.className)),
      h.OnMount(Measure()),
    ],
    [
      h.div(
        [
          h.DataAttribute(LINE_ATTRIBUTE, ""),
          h.Class(
            "inline-flex gap-10 will-change-transform motion-reduce:transform-none! motion-reduce:transition-none!",
          ),
          h.Style(lineStyle(model)),
        ],
        [
          h.span([h.DataAttribute(WORDS_ATTRIBUTE, "")], [viewInputs.words]),
          ...(isOverflowing ? [h.span([h.AriaHidden(true)], [viewInputs.words])] : []),
        ],
      ),
    ],
  );
});
