import type { Html, HtmlBuilder } from "foldkit/html";
import { ISLAND_LIGHTS_ATTRIBUTE, LIGHT_LENGTH } from "./islandLight.ts";
import type { Message } from "./message.ts";
import type { IslandLight } from "./model.ts";
import { ISLAND_OUTLINE_ATTRIBUTE, StartIslandLight } from "./mount.ts";

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
// is in island.css under the `island-` names.

// The light is made of two things. The glow is a short, wide stroke in a
// layer of its own that is blurred, so it has no edge and spills to both
// sides of the outline. The beam is thin and lies on the outline itself: the
// same stroke laid many times over one stretch, each time shorter and each
// ending at the head, so that it is brightest at the head and thins out
// behind with no gradient, which a stroke cannot have along its length; and
// over its head a few strokes that are almost white. Lengths are in
// hundredths of the whole outline.

const TAIL_LAYERS = 10;

type Stroke = Readonly<{ kind: string; length: number; behind: number }>;

const stroke = (kind: string, length: number, behind = 0): Stroke => ({ kind, length, behind });

const BEAM: ReadonlyArray<Stroke> = [
  ...Array.from({ length: TAIL_LAYERS }, (_, layer) =>
    stroke("island-light-tail", LIGHT_LENGTH * (1 - layer / TAIL_LAYERS) ** 1.6),
  ),
  stroke("island-light-head island-light-head-faint", LIGHT_LENGTH * 0.2),
  stroke("island-light-head", LIGHT_LENGTH * 0.11),
  stroke("island-light-head", LIGHT_LENGTH * 0.05),
];

// The glow is widest about the head and reaches a little ahead of it.
const GLOW: ReadonlyArray<Stroke> = [
  stroke("island-light-glow island-light-glow-far", LIGHT_LENGTH * 0.8, -LIGHT_LENGTH * 0.04),
  stroke("island-light-glow island-light-glow-near", LIGHT_LENGTH * 0.32, -LIGHT_LENGTH * 0.04),
];

const round = (value: number): string => String(Math.round(value * 1000) / 1000);

/** A path along the island's outline. Where it goes is written to it by `DrawIslandFigure`. */
const outlineView = (className: string, h: HtmlBuilder<Message>): Html =>
  h.path([h.DataAttribute(ISLAND_OUTLINE_ATTRIBUTE, ""), h.Class(className)]);

/** One stroke of the light, ending `behind` the head, and setting out from where that puts it. */
const strokeView = ({ kind, length, behind }: Stroke, h: HtmlBuilder<Message>): Html =>
  h.path([
    h.DataAttribute(ISLAND_OUTLINE_ATTRIBUTE, ""),
    h.Class(`island-light-stroke ${kind}`),
    h.PathLength("100"),
    h.StrokeDasharray(`${round(length)} ${round(100 - length)}`),
    h.Style({ "--sets-out": round(length + behind - LIGHT_LENGTH) }),
  ]);

const layerView = (
  className: string,
  children: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html => h.svg([h.AriaHidden(true), h.Class(className)], children);

const shadowView = (h: HtmlBuilder<Message>): Html =>
  layerView("island-layer island-shadow", [outlineView("island-body", h)], h);

/**
 * The figure, and over it near the cover a blurred copy of the cover that
 * fades into the figure's own colour. The copy is cut to the outline.
 */
const figureView = (maybeCover: string | undefined, h: HtmlBuilder<Message>): Html =>
  layerView(
    "island-layer island-figure",
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
      outlineView("island-body", h),
      h.g(
        [h.ClipPath("url(#island-within)")],
        [
          h.g(
            [h.Mask("url(#island-fade)")],
            maybeCover === undefined
              ? []
              : [
                  h.image([
                    h.Class("island-tint"),
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
  );

/**
 * The light. What it does is the Model's to say, and shows as how bright it
 * is; its animations are set going or held, as it enters the document, by
 * the Mount `StartIslandLight`.
 */
const lightsView = (light: IslandLight, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.DataAttribute(ISLAND_LIGHTS_ATTRIBUTE, ""),
      h.DataAttribute("light", light),
      h.Class("island-layer island-lights"),
      h.OnMount(StartIslandLight({ initialLight: light })),
    ],
    [
      layerView(
        "island-layer island-light-soft",
        GLOW.map((glow) => strokeView(glow, h)),
        h,
      ),
      layerView(
        "island-layer",
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
