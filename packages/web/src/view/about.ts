import { Popover } from "@foldkit/ui";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import type { Html, HtmlBuilder } from "foldkit/html";
import {
  AUTHOR,
  AUTHOR_HANDLES,
  AUTHOR_HREFS,
  AUTHOR_PLACES,
  type AuthorPlace,
} from "../about.ts";
import { Message } from "../message.ts";
import { iconControlClass } from "./control.ts";
import { detailsIcon, linkedInIcon, xIcon } from "./icon.ts";
import { MENU_BACKDROP_CLASS, MENU_CLASS } from "./menu.ts";

// VIEW

const MADE_BY = "Made by";

const PLACE_ICONS: Readonly<Record<AuthorPlace, (className: string) => Html>> = {
  X: xIcon,
  LinkedIn: linkedInIcon,
};

/**
 * A link to a place the author is found. It leaves the app, so it opens
 * beside it: the music goes on. What they are called there says nothing of
 * the place to someone who cannot see its mark, so the place is named first,
 * in words that are only heard.
 */
const placeLinkView = (
  place: AuthorPlace,
  className: string,
  content: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  h.a(
    [
      h.Href(AUTHOR_HREFS[place]),
      h.Target("_blank"),
      h.Rel("noopener noreferrer"),
      h.Class(className),
    ],
    [h.span([h.Class("sr-only")], [`${place}: `]), ...content],
  );

// NOTE: a mark answers a press over a place larger than itself, and the
// place is no taller than the name's own line: the credit is two lines set
// close, and no mark makes the second one taller.
const CREDIT_LINK_CLASS =
  "flex size-5 items-center justify-center rounded-md hover:bg-accent-wash hover:text-ink focus-ring-inset";

/**
 * Who made the app, at the foot of the navigation's column: "Made by" on a
 * line of its own and, close under it, the name with the places they are
 * found right after it. The column is only there beside the page: on a
 * narrow screen the navigation floats over the page's foot and has no room
 * for this, and Home's control says it. Here each place is its mark alone, a
 * control to press: what the author is called there is only heard.
 */
export const creditView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("mt-auto hidden pt-6 pl-3 text-muted md:block")],
    [
      h.p([h.Class("text-11 leading-3")], [MADE_BY]),
      h.div(
        [h.Class("flex items-center gap-1")],
        [
          h.p([h.Class("text-xs leading-5 font-medium whitespace-nowrap text-ink")], [AUTHOR]),
          h.ul(
            [h.Role("list"), h.Class("flex shrink-0")],
            Array.map(AUTHOR_PLACES, (place) =>
              h.keyed("li")(
                place,
                [],
                [
                  placeLinkView(
                    place,
                    CREDIT_LINK_CLASS,
                    [
                      h.span([h.Class("sr-only")], [AUTHOR_HANDLES[place]]),
                      PLACE_ICONS[place]("size-3.5 shrink-0"),
                    ],
                    h,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    ],
  );

// NOTE: the control is drawn out past the title's line above and below, and
// to the page's edge, so that the title's row is no taller for it and its
// mark stands where the page's own edge is.
const ABOUT_BUTTON_CLASS = clsx("-my-1 -mr-2.5", iconControlClass("OnPage"));

const ABOUT_BACKDROP_CLASS = clsx(MENU_BACKDROP_CLASS, "md:hidden");

const ABOUT_LINK_CLASS =
  "flex items-center justify-between gap-8 border-t border-line px-4 py-3 hover:bg-panel focus-ring-inset active:bg-tile";

const aboutPanelView = (h: HtmlBuilder<Message>): ReadonlyArray<Html> => [
  h.div(
    [h.Class("px-4 py-3")],
    [
      h.p([h.Class("text-xs text-muted")], [MADE_BY]),
      h.p([h.Class("font-semibold")], [AUTHOR]),
    ],
  ),
  h.ul(
    [h.Role("list")],
    Array.map(AUTHOR_PLACES, (place) =>
      h.keyed("li")(
        place,
        [],
        [
          placeLinkView(
            place,
            ABOUT_LINK_CLASS,
            [
              h.span([], [AUTHOR_HANDLES[place]]),
              PLACE_ICONS[place]("size-4 shrink-0 text-muted"),
            ],
            h,
          ),
        ],
      ),
    ),
  ),
];

/**
 * The control at the head of Home, on a narrow screen: it opens who made the
 * app, in the look of the app's menus. Where the navigation is a column the
 * same words stand at its foot (`creditView`), and this is not drawn.
 */
export const aboutView = (about: Popover.Model, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: about.id,
    model: about,
    view: Popover.view,
    viewInputs: {
      ariaLabel: "About Bafle",
      anchor: { placement: "bottom-end", gap: 4, padding: 12 },
      toView: ({ button, panel, backdrop, isVisible }) =>
        h.div(
          [h.Class("relative md:hidden")],
          [
            h.button([...button, h.Class(ABOUT_BUTTON_CLASS)], [detailsIcon("size-6")]),
            ...(isVisible
              ? [
                  h.div([...backdrop, h.Class(ABOUT_BACKDROP_CLASS)]),
                  h.div([...panel, h.Class(clsx(MENU_CLASS, "md:hidden"))], aboutPanelView(h)),
                ]
              : []),
          ],
        ),
    },
    toParentMessage: (message) => Message.GotAboutMessage({ message }),
  });
