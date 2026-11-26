import { Button } from "@foldkit/ui";
import { clsx } from "clsx";
import * as Match from "effect/Match";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { LoadError } from "../catalog.ts";
import { Message } from "../message.ts";
import { closeIcon } from "./icon.ts";

// VIEW

/** Why the catalog could not be asked, in the listener's words. */
export const reason = (error: LoadError): string =>
  Match.value(error).pipe(
    Match.when("CatalogUnavailable", () => "The music catalog is not answering right now."),
    Match.when("Unreachable", () => "Bafle could not be reached. Check your connection."),
    Match.exhaustive,
  );

const tryAgainView = (className: string, h: HtmlBuilder<Message>): Html =>
  Button.view(
    {
      onClick: Message.ClickedTryAgain(),
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.Class(
              clsx(
                className,
                "cursor-pointer rounded-full text-sm font-semibold",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              ),
            ),
          ],
          ["Try again"],
        ),
    },
    h,
  );

/**
 * A page that could not load and has nothing to show: said where its content
 * would be. Only the words are the alert; the button stays an ordinary control.
 */
export const failureView = (what: string, error: LoadError, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("mt-8 max-w-md rounded-2xl border border-line bg-panel p-6")],
    [
      h.div(
        [h.Role("alert")],
        [
          h.p([h.Class("font-semibold")], [`${what} could not load.`]),
          h.p([h.Class("mt-1 text-sm text-muted")], [reason(error)]),
        ],
      ),
      tryAgainView("mt-4 bg-accent px-4 py-2 text-on-accent hover:opacity-90", h),
    ],
  );

/** Why a page shows what it loaded earlier, in a few words: there is little room over a page. */
const staleReason = (error: LoadError): string =>
  Match.value(error).pipe(
    Match.when("CatalogUnavailable", () => "The catalog is not answering."),
    Match.when("Unreachable", () => "You are offline."),
    Match.exhaustive,
  );

/**
 * A refresh failed behind content that is still on screen. It is said over
 * the foot of the page, on a piece of its own that takes no room in the
 * page: what is on the page stays where it is when the notice comes, and
 * when the listener puts it away. It offers to try again, and to be put away.
 */
// NOTE: it stands at the foot and not at the top. The top of a page is
// where a page keeps what stays as it scrolls, Search's field and the bar an
// album's head draws back to, and a notice there lay over them. At the foot
// it stands clear of the navigation and of the island, in the room every
// page leaves for them (`pageAttributes`): over the island while that is
// above the navigation's row, and lower once it has come down into it.
export const staleBannerView = (error: LoadError, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Class(
        "pointer-events-none absolute right-3 bottom-[5.25rem] left-3 z-30 flex justify-center transition-[bottom] duration-300 group-data-player/shell:bottom-36 minimized:group-data-player/shell:bottom-[5.25rem] motion-reduce:transition-none md:right-6 md:bottom-6 md:left-6 md:group-data-player/shell:bottom-28",
      ),
    ],
    [
      h.div(
        [
          h.DataAttribute("stale-notice", ""),
          h.Class(
            "pointer-events-auto flex max-w-full items-center gap-2 rounded-2xl border border-line bg-panel/90 py-1.5 pr-1.5 pl-4 text-sm shadow-lg backdrop-blur-xl",
          ),
        ],
        [
          h.p(
            [h.Role("status"), h.Class("min-w-0 text-pretty")],
            [`${staleReason(error)} Showing what loaded earlier.`],
          ),
          tryAgainView(
            "shrink-0 px-2 py-1.5 whitespace-nowrap text-accent underline underline-offset-2 hover:no-underline",
            h,
          ),
          Button.view(
            {
              onClick: Message.ClickedDismissStaleNotice(),
              toView: (attributes) =>
                h.button(
                  [
                    ...attributes.button,
                    h.AriaLabel("Dismiss"),
                    h.Class(
                      "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-tile hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    ),
                  ],
                  [closeIcon("size-4")],
                ),
            },
            h,
          ),
        ],
      ),
    ],
  );
