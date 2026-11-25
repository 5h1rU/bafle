import { Button } from "@foldkit/ui";
import type { Html, HtmlBuilder } from "foldkit/html";
import { Message } from "../message.ts";
import { homeRouter } from "../route.ts";
import { backIcon, homeIcon } from "./icon.ts";

// VIEW

// NOTE: the control is a circle with a mark in it and no word: over an
// album's cover there is no room for a word, and the way back is the same
// control on every page. What it does is still said in words, to assistive
// technology, and by its mark to the eye: an arrow where it goes back, a
// house where it leads Home.
const CONTROL_CLASS =
  "pointer-events-auto inline-flex size-10 shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-full border border-line bg-panel/85 text-ink shadow-sm backdrop-blur-xl hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-tile";

/**
 * The control alone, for a page that places it itself: an album's, where it
 * lies over the cover and in the bar the head draws back to.
 *
 * When the app knows of a page behind this one, it goes back to it through
 * the browser's history, so that page is found as it was left and the
 * history gains no entry. On a direct link there is nothing behind, and it
 * is a plain link to Home.
 */
export const wayBackControlView = (hasWayBack: boolean, h: HtmlBuilder<Message>): Html =>
  hasWayBack
    ? Button.view(
        {
          onClick: Message.ClickedBack(),
          toView: (attributes) =>
            h.button(
              [...attributes.button, h.Class(CONTROL_CLASS)],
              [backIcon("size-5"), h.span([h.Class("sr-only")], ["Back"])],
            ),
        },
        h,
      )
    : h.a(
        [h.Href(homeRouter()), h.Class(CONTROL_CLASS)],
        [homeIcon("size-5"), h.span([h.Class("sr-only")], ["Home"])],
      );

// NOTE: the place is as wide as the page and takes no press itself: what
// scrolls under it beside the control is still pressed.
//
// Where it holds is counted from inside the page's own padding at its top,
// not from the edge of the box that scrolls, so the distance is written as
// what is wanted less that padding (`pageAttributes` in layout.ts): half a
// rem from the top on a narrow screen, three quarters on a wide one.
const PLACE_CLASS = "pointer-events-none sticky -top-6 z-10 flex h-10 md:-top-7";

/**
 * The way out of a page that is no section: a track's, an artist's, a
 * playlist's, a genre's, a station's. It stands at the page's top corner and
 * stays there as the page scrolls under it, so the way back is in reach from
 * anywhere in a long list.
 */
export const wayBackView = (hasWayBack: boolean, h: HtmlBuilder<Message>): Html =>
  h.div([h.Class(PLACE_CLASS)], [wayBackControlView(hasWayBack, h)]);
