import type { Html, HtmlBuilder } from "foldkit/html";
import { Message } from "../message.ts";
import type { TurnWay } from "../turn.ts";
import { backIcon, forwardIcon } from "./icon.ts";

// VIEW

/** The id of the row that goes on sideways under a heading: what its arrows turn. */
export const turningRowIdOf = (headingId: string): string => `${headingId}-row`;

/**
 * What a row that goes on sideways is made of: tiles, whose pictures the
 * arrows stand beside, or rows of a list in columns, which they stand
 * beside the middle of.
 */
export type TurningOf = "Tiles" | "Rows";

const ARROW_LABELS: Readonly<Record<TurnWay, string>> = {
  Back: "Show earlier",
  Onward: "Show more",
};

// NOTE: an arrow is out of the order of focus. Every piece of the row is in
// it already, and the focus going from one to the next turns the row by
// itself: the arrows are for a pointer, which has no other way to turn a
// row with a wheel that only goes up and down.
const arrowView = (rowId: string, way: TurnWay, h: HtmlBuilder<Message>): Html =>
  h.span(
    [h.DataAttribute("way", way === "Back" ? "back" : "onward"), h.Class("turning-place")],
    [
      h.button(
        [
          h.Type("button"),
          h.Tabindex(-1),
          h.AriaLabel(ARROW_LABELS[way]),
          h.AriaControls(rowId),
          h.OnClick(Message.ClickedTurnRow({ rowId, way })),
          h.Class("turning-arrow"),
        ],
        [way === "Back" ? backIcon("size-5") : forwardIcon("size-5")],
      ),
    ],
  );

/**
 * A row that goes on sideways, with the two arrows that turn it a screenful
 * at a time where there is a pointer to press them with. They are drawn
 * only there, come when the pointer is over the row, and each is gone when
 * there is no more its way: all of that is the style sheet's, which reads
 * it off the row's own scroll (`turning` in styles.css). On a screen that
 * is touched there are none, and the row is swiped.
 */
export const turningView = (
  headingId: string,
  of: TurningOf,
  row: Html,
  h: HtmlBuilder<Message>,
): Html => {
  const rowId = turningRowIdOf(headingId);

  return h.div(
    [h.DataAttribute("turning", of === "Tiles" ? "tiles" : "rows"), h.Class("turning")],
    [row, arrowView(rowId, "Back", h), arrowView(rowId, "Onward", h)],
  );
};
