import { clsx } from "clsx";
import type { Attribute, Html, HtmlBuilder } from "foldkit/html";
import { ISLAND_LIGHTS_ATTRIBUTE, LIGHT_LENGTH } from "./islandLight.ts";
import type { Message } from "./message.ts";
import type { IslandLight } from "./model.ts";
import { ISLAND_LAYER_ATTRIBUTE, ISLAND_OUTLINE_ATTRIBUTE, StartIslandLight } from "./mount.ts";

// VIEW

// What the island is drawn on: one figure whose outline runs round the
// cover, the body, the swell under the main control and the tail that holds
// Next. It is three layers. The shadow is the figure once more, under the
// figure. The figure itself takes the cover's colours near the cover. The
// light lies over the island's pieces, so it is seen all the way round,
// across the rim of the cover too.
//
// None of the paths here says where it goes. The outline depends on how wide
// the island is in the document at that moment, so the Mount
// `DrawIslandFigure` writes it to every path marked as an outline, in the
// frame the width changes. How the layers look, and how the light travels,
// is drawn here; the names its shadow and its light travel under in a view
// transition are in island.css.

// The light is made of two things. The glow is a short, wide stroke in a
// layer of its own that is blurred, so it has no edge and spills to both
// sides of the outline. The beam is thin and lies on the outline itself: the
// same stroke laid many times over one stretch, each time shorter and each
// ending at the head, so that it is brightest at the head and thins out
// behind with no gradient, which a stroke cannot have along its length; and
// over its head a few strokes that are almost white. Lengths are in
// hundredths of the whole outline.

const TAIL_LAYERS = 10;

/** What a stroke of the light is: a part of the beam, or of the glow round it. */
type StrokeKind = "Tail" | "HeadFaint" | "Head" | "GlowFar" | "GlowNear";

const STROKE_KINDS: Readonly<Record<StrokeKind, string>> = {
  Tail: "stroke-island-light stroke-2 [stroke-opacity:0.24]",
  HeadFaint: "stroke-island-light-head stroke-2 [stroke-opacity:0.3]",
  Head: "stroke-island-light-head stroke-2 [stroke-opacity:0.6]",
  GlowFar: "stroke-island-light stroke-7 [stroke-opacity:0.5]",
  GlowNear: "stroke-island-light stroke-7 [stroke-opacity:0.9]",
};

// NOTE: where a stroke sets out from is a length, not a bare number. An
// offset takes either, but a browser does not animate from a number to a
// length: it went from the one to the other in a step each second, and the
// light stood still and jumped. Two lengths it does.
const STROKE_CLASS =
  "fill-none [stroke-dashoffset:calc(var(--sets-out)*1px)] [stroke-linecap:round] motion-safe:animate-island-light-travel";

type Stroke = Readonly<{ kind: StrokeKind; length: number; behind: number }>;

const stroke = (kind: StrokeKind, length: number, behind = 0): Stroke => ({ kind, length, behind });

const BEAM: ReadonlyArray<Stroke> = [
  ...Array.from({ length: TAIL_LAYERS }, (_, layer) =>
    stroke("Tail", LIGHT_LENGTH * (1 - layer / TAIL_LAYERS) ** 1.6),
  ),
  stroke("HeadFaint", LIGHT_LENGTH * 0.2),
  stroke("Head", LIGHT_LENGTH * 0.11),
  stroke("Head", LIGHT_LENGTH * 0.05),
];

// The glow is widest about the head and reaches a little ahead of it.
const GLOW: ReadonlyArray<Stroke> = [
  stroke("GlowFar", LIGHT_LENGTH * 0.8, -LIGHT_LENGTH * 0.04),
  stroke("GlowNear", LIGHT_LENGTH * 0.32, -LIGHT_LENGTH * 0.04),
];

const round = (value: number): string => String(Math.round(value * 1000) / 1000);

/** A path along the island's outline. Where it goes is written to it by `DrawIslandFigure`. */
const outlineView = (className: string, h: HtmlBuilder<Message>): Html =>
  h.path([h.DataAttribute(ISLAND_OUTLINE_ATTRIBUTE, ""), h.Class(className)]);

/** One stroke of the light, ending `behind` the head, and setting out from where that puts it. */
const strokeView = ({ kind, length, behind }: Stroke, h: HtmlBuilder<Message>): Html =>
  h.path([
    h.DataAttribute(ISLAND_OUTLINE_ATTRIBUTE, ""),
    h.Class(clsx(STROKE_CLASS, STROKE_KINDS[kind])),
    h.PathLength("100"),
    h.StrokeDasharray(`${round(length)} ${round(100 - length)}`),
    h.Style({ "--sets-out": round(length + behind - LIGHT_LENGTH) }),
  ]);

/** A layer the size of the island, drawn past its box where the figure stands out of it. */
const LAYER_CLASS = "pointer-events-none absolute top-0 left-0 size-full overflow-visible";

/**
 * One of the three layers the island's pieces stand on and under: each is
 * marked, since the island's width is brought to its new one by script, from
 * its left end (`dockResizeMotion` in mount.ts).
 */
const STANDING_LAYER_CLASS = clsx(LAYER_CLASS, "origin-left");

const layerView = (
  className: string,
  children: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
  attributes: ReadonlyArray<Attribute<Message>> = [],
): Html => h.svg([h.AriaHidden(true), ...attributes, h.Class(className)], children);

// NOTE: the shadow is the figure once more, under the figure. It is a layer
// of its own so that it can be a picture of its own in a view transition
// (`island-shadow` in island.css).
const shadowView = (h: HtmlBuilder<Message>): Html =>
  layerView(
    clsx("island-shadow -z-2 drop-shadow-(--island-shadow)", STANDING_LAYER_CLASS),
    [outlineView("fill-island", h)],
    h,
    [h.DataAttribute(ISLAND_LAYER_ATTRIBUTE, "")],
  );

/**
 * The figure, and over it near the cover a blurred copy of the cover that
 * fades into the figure's own colour. The copy is cut to the outline.
 */
const figureView = (maybeCover: string | undefined, h: HtmlBuilder<Message>): Html =>
  layerView(
    clsx("-z-1", STANDING_LAYER_CLASS),
    [
      h.defs(
        [],
        [
          h.clipPath([h.Id("island-within")], [outlineView("", h)]),
          h.linearGradient(
            [
              h.Id("island-fading"),
              h.GradientUnits("userSpaceOnUse"),
              h.X1("44"),
              h.Y1("0"),
              h.X2("132"),
              h.Y2("0"),
            ],
            [
              h.stop([h.Offset("0"), h.StopColor("#fff")]),
              h.stop([h.Offset("1"), h.StopColor("#000")]),
            ],
          ),
          h.mask(
            [
              h.Id("island-fade"),
              h.MaskUnits("userSpaceOnUse"),
              h.X("-20"),
              h.Y("-40"),
              h.Width("200"),
              h.Height("124"),
            ],
            [
              h.rect([
                h.X("-20"),
                h.Y("-40"),
                h.Width("200"),
                h.Height("124"),
                h.Fill("url(#island-fading)"),
              ]),
            ],
          ),
          h.filter(
            [
              h.Id("island-blur"),
              h.FilterUnits("userSpaceOnUse"),
              h.X("-80"),
              h.Y("-110"),
              h.Width("320"),
              h.Height("264"),
            ],
            [h.feGaussianBlur([h.Attribute("stdDeviation", "16")])],
          ),
        ],
      ),
      outlineView("fill-island", h),
      h.g(
        [h.ClipPath("url(#island-within)")],
        [
          h.g(
            [h.Mask("url(#island-fade)")],
            maybeCover === undefined
              ? []
              : [
                  h.image([
                    // The cover's colours, near the cover, as bright as they are.
                    h.Class("opacity-85"),
                    // NOTE: an attribute, not a property: an SVG image has no `href`
                    // property that the attribute follows.
                    h.Attribute("href", maybeCover),
                    h.X("-40"),
                    h.Y("-68"),
                    h.Width("180"),
                    h.Height("180"),
                    h.PreserveAspectRatio("xMidYMid slice"),
                    h.Filter("url(#island-blur)"),
                  ]),
                ],
          ),
        ],
      ),
    ],
    h,
    [h.DataAttribute(ISLAND_LAYER_ATTRIBUTE, "")],
  );

/** How bright the light is: dark until there has been sound, bright while it travels, an ember at rest. */
const LIGHTS: Readonly<Record<IslandLight, string>> = {
  Dark: "opacity-0",
  Resting: "opacity-30",
  Travelling: "opacity-100",
};

/**
 * The light. What it does is the Model's to say, and shows as how bright it
 * is; its animations are set going or held, as it enters the document, by
 * the Mount `StartIslandLight`.
 */
const lightsView = (light: IslandLight, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.DataAttribute(ISLAND_LIGHTS_ATTRIBUTE, ""),
      h.DataAttribute(ISLAND_LAYER_ATTRIBUTE, ""),
      h.DataAttribute("light", light),
      h.Class(
        clsx(
          "island-lights z-1 transition-opacity duration-1400 ease-[ease-in-out]",
          STANDING_LAYER_CLASS,
          LIGHTS[light],
        ),
      ),
      h.OnMount(StartIslandLight({ initialLight: light })),
    ],
    [
      // The glow is blurred as a whole, so it has no edge.
      layerView(
        clsx(LAYER_CLASS, "blur-[3px]"),
        GLOW.map((glow) => strokeView(glow, h)),
        h,
      ),
      layerView(
        LAYER_CLASS,
        BEAM.map((beam) => strokeView(beam, h)),
        h,
      ),
    ],
  );

/** The three layers the island's pieces stand on and under. */
export const islandFigureView = (
  maybeCover: string | undefined,
  light: IslandLight,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [shadowView(h), figureView(maybeCover, h), lightsView(light, h)];
