import * as Option from "effect/Option";
import { Submodel } from "foldkit";
import { type ChildAttribute, type Html, childAttributes } from "foldkit/html";
import {
  type FollowsBetween,
  contentStyles,
  endMarkStyles,
  followsSwipeStyles,
  overlayStyles,
  scrollerStyles,
  sheetStyles,
  stageStyles,
  startMarkStyles,
  stopStyles,
  stopsStyles,
  swipeOf,
} from "./geometry.ts";
import { Message } from "./message.ts";
import type { Model } from "./model.ts";
import {
  CONTENT_ATTRIBUTE,
  FollowSheet,
  OVERLAY_ATTRIBUTE,
  STOP_ATTRIBUTE,
  scrollerId,
} from "./mount.ts";

// VIEW

/** Keyframes that follow the swipe, written from the sheet gone to the sheet whole. */
export type FollowsSwipe = Readonly<{ keyframes: string; between?: FollowsBetween }>;

/**
 * What the sheet's owner is handed to draw the sheet with.
 *
 * - `sheet`: attributes for the sheet itself, the piece that travels. It
 *   carries an inline style: give it classes, and no style of its own.
 * - `content`: attributes for what is in the sheet, one element that fills
 *   it. It is what the document watches to say how much of the sheet is on
 *   screen. It carries an inline style too.
 * - `stops`: to be drawn in the sheet, as children of it. Empty for a sheet
 *   with no stops.
 * - `closeControl`: attributes for a control of the owner's that asks for the
 *   sheet to go.
 * - `isWhole`: whether all of the sheet is on screen. What is in a sheet
 *   should scroll only then: short of whole, a swipe on it moves the sheet.
 */
export type RenderInfo = Readonly<{
  sheet: ReadonlyArray<ChildAttribute>;
  content: ReadonlyArray<ChildAttribute>;
  stops: ReadonlyArray<Html>;
  closeControl: ReadonlyArray<ChildAttribute>;
  isWhole: boolean;
}>;

export type ViewInputs = Readonly<{
  /** Draws the sheet. Everything around it is drawn here. */
  toView: (render: RenderInfo) => Html;
  /**
   * Places short of whole where the sheet comes to rest, each given as how
   * much of the sheet is then seen: any CSS length, a share being of the
   * sheet. The sheet opens to the first.
   */
  stops?: ReadonlyArray<string>;
  /**
   * Whether the sheet is drawn on past its edge, so that a scroll stretched
   * beyond the sheet's whole place shows more sheet and not what is behind it.
   */
  continuesPastEdge?: boolean;
  /** Keyframes for the sheet itself to follow the swipe with. */
  sheetFollows?: FollowsSwipe;
  /** Keyframes for the backdrop: how it comes as the sheet does. */
  backdropFollows?: FollowsSwipe;
  /** For the piece the sheet is drawn in: its place in the page, its name, its focus. */
  overlayAttributes?: ReadonlyArray<ChildAttribute>;
  backdropClassName?: string;
  /** For the stage the sheet stands on: what room is left around the sheet. */
  stageClassName?: string;
}>;

/**
 * A sheet: a piece that comes over the page from an edge, and that the
 * listener sends back by swiping it there. The swipe is the browser's own
 * scroll (see `geometry.ts`). This draws the box that scrolls and what the
 * scroll needs, and asks the owner for the sheet.
 *
 * It does not keep the focus in, nor hold what is behind it still: whether
 * the page behind is to be reached is its owner's to say, with `inert`.
 */
export const view = Submodel.defineView<Model, Message, ViewInputs>((model, viewInputs, h) => {
  const { id, edge, entrance, reach } = model;
  const {
    toView,
    stops = [],
    continuesPastEdge = false,
    sheetFollows,
    backdropFollows,
    overlayAttributes = [],
    backdropClassName = "",
    stageClassName = "",
  } = viewInputs;
  const swipe = swipeOf(edge);
  const follows = (maybeFollows: FollowsSwipe | undefined): Record<string, string> =>
    maybeFollows === undefined
      ? {}
      : followsSwipeStyles(id, swipe, maybeFollows.keyframes, stops, maybeFollows.between);

  const stopsView: ReadonlyArray<Html> =
    stops.length === 0
      ? []
      : [
          h.div(
            [h.Style(stopsStyles(edge, continuesPastEdge))],
            stops.map((shown) =>
              h.div([h.DataAttribute(STOP_ATTRIBUTE, ""), h.Style(stopStyles(shown, swipe))]),
            ),
          ),
        ];

  return h.div(
    [
      h.Id(id),
      h.DataAttribute(OVERLAY_ATTRIBUTE, ""),
      h.DataAttribute("edge", edge),
      h.DataAttribute("reach", reach),
      h.Style(overlayStyles(id)),
      h.OnKeyDownPreventDefault((key) =>
        key === "Escape" ? Option.some(Message.PressedEscape()) : Option.none(),
      ),
      ...overlayAttributes,
    ],
    [
      h.div([
        h.Class(backdropClassName),
        h.Style({ position: "absolute", inset: "0", ...follows(backdropFollows) }),
      ]),
      h.div(
        [
          h.Id(scrollerId(id)),
          h.Style(scrollerStyles(swipe)),
          h.OnMount(FollowSheet({ initialEdge: edge, initialEntrance: entrance })),
        ],
        [
          h.div([h.Style(startMarkStyles(swipe))]),
          h.div(
            [h.Class(stageClassName), h.Style(stageStyles(edge))],
            [
              toView({
                sheet: childAttributes([
                  h.Style({ ...sheetStyles(edge, continuesPastEdge), ...follows(sheetFollows) }),
                ]),
                content: childAttributes([
                  h.DataAttribute(CONTENT_ATTRIBUTE, ""),
                  h.Style(contentStyles(id, swipe)),
                ]),
                stops: stopsView,
                closeControl: childAttributes([
                  h.Type("button"),
                  h.OnClick(Message.ClickedClose()),
                ]),
                isWhole: reach === "Whole",
              }),
            ],
          ),
          h.div([h.Style(endMarkStyles(swipe))]),
        ],
      ),
    ],
  );
});
