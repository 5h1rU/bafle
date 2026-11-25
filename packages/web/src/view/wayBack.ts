import { Button } from "@foldkit/ui";
import type { Html, HtmlBuilder } from "foldkit/html";
import { Message } from "../message.ts";
import { homeRouter } from "../route.ts";
import { backIcon } from "./icon.ts";

// VIEW

const WAY_BACK_CLASS =
  "-ml-2 inline-flex h-10 cursor-pointer items-center gap-1 rounded-full pr-4 pl-2 text-sm font-semibold text-accent hover:bg-accent-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-accent-wash";

/**
 * The way out of a page that is no section: a track's, an album's, an
 * artist's, a playlist's, a genre's, a station's. When the app knows of a
 * page behind it, it goes back to it through the browser's history, so that
 * page is found as it was left and the history gains no entry. On a direct
 * link there is nothing behind, and it is a plain link to Home.
 */
export const wayBackView = (hasWayBack: boolean, h: HtmlBuilder<Message>): Html =>
  hasWayBack
    ? Button.view(
        {
          onClick: Message.ClickedBack(),
          toView: (attributes) =>
            h.button(
              [...attributes.button, h.Class(WAY_BACK_CLASS)],
              [backIcon("size-5"), "Back"],
            ),
        },
        h,
      )
    : h.a([h.Href(homeRouter()), h.Class(WAY_BACK_CLASS)], [backIcon("size-5"), "Home"]);
