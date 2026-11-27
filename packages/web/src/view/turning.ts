import { clsx } from "clsx";
import type { Html, HtmlBuilder } from "foldkit/html";
import { Message } from "../message.ts";
import type { TurnWay } from "../turn.ts";
import { backIcon, forwardIcon } from "./icon.ts";

// VIEW

/** The id of the row that goes on sideways under a heading: what its arrows turn. */
export const turningRowIdOf = (headingId: string): string => `${headingId}-row`;

/**
 * What a row that goes on sideways is made of: tiles, whose pictures the
 * arrows stand beside; tiles three across, each a third of the row; or rows
 * of a list in columns, which they stand beside the middle of.
 */
export type TurningOf = "Tiles" | "Thirds" | "Rows";

/**
 * A row that goes on sideways draws its scrollbar thin, in the colour of the
 * lines; where there is a pointer to press the arrows with, it has none.
 * `turning-row` is what the style sheet reads the row's scroll by.
 */
export const TURNING_ROW_CLASS =
  "turning-row [scrollbar-color:var(--color-line)_transparent] [scrollbar-width:thin] fine-pointer:[scrollbar-width:none] fine-pointer:[&::-webkit-scrollbar]:hidden";

/**
 * The box an arrow stands in, at one end of the row. It is drawn only where
 * there is a pointer to press the arrow with, and comes when the pointer is
 * over the row.
 */
const PLACE_CLASS =
  "pointer-events-none absolute z-2 hidden items-center opacity-0 transition-opacity duration-150 group-hover/turning:opacity-100";

// NOTE: beside a shelf's tiles the arrows stand at the height of the
// pictures' middle, whatever is written under them: each is placed in a box
// as high as a tile is wide. Beside a list in columns they stand at the
// middle of its rows.
//
// A shelf of three across is a grid where Search's page is wide, and a list
// in columns is one column where it is narrow: neither has anything to turn
// there. Where a browser cannot read the scroll the arrows would still come
// under the pointer, so there they are not drawn at all.
const PLACES: Readonly<Record<TurningOf, string>> = {
  Tiles: "top-1 aspect-square w-36 fine-pointer:grid sm:w-40",
  Thirds: "top-1 aspect-square w-[calc((100%-1.5rem)/3)] fine-pointer:not-search-wide:grid",
  Rows: "top-0 bottom-3 w-8 fine-pointer:@2xl:grid",
};

// NOTE: in the page's margin where it is wide enough to hold them, and over
// the row's edge where it is not.
const WAYS: Readonly<Record<TurnWay, string>> = {
  Back: "-left-4 justify-items-start md:-left-9",
  Onward: "-right-4 justify-items-end md:-right-9",
};

/** The arrow. `turning-arrow` is what the style sheet takes away when there is no more its way (turning.css). */
const ARROW_CLASS =
  "turning-arrow pointer-events-auto grid size-8 cursor-pointer place-items-center rounded-full bg-canvas/88 text-ink shadow-[0_0_0_1px_var(--color-line),var(--island-shadow)] backdrop-blur-md transition-[background-color,scale] duration-150 hover:bg-canvas active:scale-92";

const ARROW_LABELS: Readonly<Record<TurnWay, string>> = {
  Back: "Show earlier",
  Onward: "Show more",
};

// NOTE: an arrow is out of the order of focus. Every piece of the row is in
// it already, and the focus going from one to the next turns the row by
// itself: the arrows are for a pointer, which has no other way to turn a
// row with a wheel that only goes up and down.
const arrowView = (
  rowId: string,
  of: TurningOf,
  way: TurnWay,
  h: HtmlBuilder<Message>,
): Html =>
  h.span(
    [
      h.DataAttribute("way", way === "Back" ? "back" : "onward"),
      h.Class(clsx(PLACE_CLASS, PLACES[of], WAYS[way])),
    ],
    [
      h.button(
        [
          h.Type("button"),
          h.Tabindex(-1),
          h.AriaLabel(ARROW_LABELS[way]),
          h.AriaControls(rowId),
          h.OnClick(Message.ClickedTurnRow({ rowId, way })),
          h.Class(ARROW_CLASS),
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
 * it off the row's own scroll (`turning` in turning.css). On a screen that
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
    [h.Class("turning group/turning relative")],
    [row, arrowView(rowId, of, "Back", h), arrowView(rowId, of, "Onward", h)],
  );
};
