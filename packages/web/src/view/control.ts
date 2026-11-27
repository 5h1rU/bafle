import { Button } from "@foldkit/ui";
import { clsx } from "clsx";
import type { Attribute, Html, HtmlBuilder } from "foldkit/html";

// CONTROLS

// What the app's controls look like, said once. A control is drawn by one of
// two kinds: a mark alone, or a pill with words. Each kind has a few looks,
// named by where the control stands, and a look is a whole class list: a view
// names the look and adds nothing that would undo it. The one thing a view
// may add is where the control stands among its neighbours (a margin), which
// no look says.
//
// The ring a control shows once the keys have brought the focus to it is the
// style sheet's (`focus-ring` in styles.css): every look has it.

/**
 * Where a control that is a mark alone stands.
 *
 * - `OnPage`: at the end of a row, or of a page's title. It answers a press
 *   over the whole of its place, a finger wide, and lights a smaller circle
 *   within it: what stands beside it is hard against that place, and a
 *   circle the size of the place would touch it.
 * - `OnSheet`: under the expanded player's controls. Lit while what it opens
 *   is open.
 * - `OnIsland`: on the island of a desktop's screen, before its transport.
 *   Smaller and squarer than the three that play, so those stay the ones
 *   seen first. Lit while what it opens is open.
 * - `OnPanel`: at the head of a panel, on a disc of its own: what closes it.
 * - `OnNotice`: at the end of a notice, with no ground until a pointer is on it.
 */
export type IconControlLook = "OnPage" | "OnSheet" | "OnIsland" | "OnPanel" | "OnNotice";

const ICON_CONTROL_CLASS = "flex cursor-pointer items-center justify-center";

const ICON_CONTROL_LOOKS: Readonly<Record<IconControlLook, string>> = {
  // NOTE: the circle is a piece of its own behind the mark (`before`).
  OnPage:
    "relative isolate size-11 shrink-0 touch-manipulation rounded-full text-muted before:absolute before:inset-1.5 before:-z-10 before:rounded-full before:content-[''] hover:text-ink hover:before:bg-panel focus-ring-inset active:before:bg-tile data-[open]:text-ink data-[open]:before:bg-tile",
  // NOTE: lit as what it opens comes, and unlit at once when that is closed:
  // a control that took its time to go out read as one still open.
  OnSheet:
    "size-11 touch-manipulation rounded-full text-muted focus-ring active:bg-tile data-lit:bg-accent-wash data-lit:text-accent data-lit:transition-[background-color,color] data-lit:duration-120",
  OnIsland:
    "size-8.5 rounded-[0.625rem] text-island-muted transition-[background-color,color] duration-120 hover:bg-on-island/10 hover:text-on-island focus-ring active:bg-on-island/10 active:text-on-island data-lit:bg-on-island/15 data-lit:text-on-island",
  OnPanel:
    "size-8 rounded-full bg-tile text-muted transition-[color] duration-120 hover:text-ink focus-ring",
  OnNotice: "size-8 shrink-0 rounded-full text-muted hover:bg-tile hover:text-ink focus-ring",
};

/**
 * The class list of a control that is a mark alone, for a component that
 * draws its own button and asks only for its look (a menu, a popover).
 */
export const iconControlClass = (look: IconControlLook): string =>
  clsx(ICON_CONTROL_CLASS, ICON_CONTROL_LOOKS[look]);

/**
 * A control that is a mark alone, named for whoever cannot see the mark.
 * `content` is the mark, and whatever is said beside it without being seen;
 * `attributes` are what else the control says of itself: what it opens, that
 * it is lit, the id the focus is given back by.
 */
export const iconButtonView = <Message>(
  config: Readonly<{
    look: IconControlLook;
    label: string;
    content: ReadonlyArray<Html>;
    onClick: Message;
    attributes?: ReadonlyArray<Attribute<Message>>;
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  Button.view(
    {
      onClick: config.onClick,
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.AriaLabel(config.label),
            ...(config.attributes ?? []),
            h.Class(iconControlClass(config.look)),
          ],
          config.content,
        ),
    },
    h,
  );

/**
 * How a pill with words is drawn: filled with the accent, for the one thing
 * a place is for; outlined, for what else can be done there; or as words
 * alone, underlined, where there is no room for a pill.
 */
export type PillLook = "Filled" | "Outlined" | "Words";

/** How much room a pill takes: as tall as a finger is wide, with a mark before its words, or only as tall as its words need. */
export type PillSize = "Tall" | "Short";

const PILL_CLASS = "cursor-pointer rounded-full text-sm font-semibold";

const PILL_LOOKS: Readonly<Record<PillLook, string>> = {
  Filled: "bg-accent text-on-accent hover:opacity-90 focus-ring",
  Outlined: "border border-line text-ink hover:bg-panel focus-ring active:bg-tile",
  Words: "text-accent underline underline-offset-2 hover:no-underline focus-ring",
};

const PILL_SIZES: Readonly<Record<PillSize, Readonly<Record<PillLook, string>>>> = {
  Tall: {
    Filled: "inline-flex h-11 min-w-28 touch-manipulation items-center justify-center gap-2 px-5",
    Outlined: "inline-flex h-11 touch-manipulation items-center justify-center gap-2 px-4",
    Words: "inline-flex h-11 touch-manipulation items-center justify-center gap-2 px-2",
  },
  Short: {
    Filled: "px-4 py-2",
    Outlined: "px-4 py-2",
    Words: "shrink-0 px-2 py-1.5 whitespace-nowrap",
  },
};

/** The class list of a pill, for what is a pill and not a button: a link that looks like one. */
export const pillClass = (look: PillLook, size: PillSize): string =>
  clsx(PILL_CLASS, PILL_SIZES[size][look], PILL_LOOKS[look]);

/**
 * A pill with words, and a mark before them where it has one. `place` is
 * where it stands among its neighbours, which is the view's to say: a margin
 * and nothing else.
 */
export const pillButtonView = <Message>(
  config: Readonly<{
    look: PillLook;
    size: PillSize;
    content: ReadonlyArray<Html | string>;
    onClick: Message;
    place?: string;
    attributes?: ReadonlyArray<Attribute<Message>>;
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  Button.view(
    {
      onClick: config.onClick,
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            ...(config.attributes ?? []),
            h.Class(clsx(config.place, pillClass(config.look, config.size))),
          ],
          config.content,
        ),
    },
    h,
  );
