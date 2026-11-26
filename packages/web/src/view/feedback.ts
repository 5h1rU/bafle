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
 * the top of the page, on a piece of its own that takes no room in the page:
 * what is on the page stays where it is when the notice comes, and when the
 * listener puts it away. It offers to try again, and to be put away.
 */
export const staleBannerView = (error: LoadError, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Class(
        "pointer-events-none absolute top-2 right-3 left-3 z-30 flex justify-center md:top-3 md:right-6 md:left-6",
      ),
    ],
    [
      h.div(
        [
          h.DataAttribute("stale-notice", ""),
          h.Class(
            "pointer-events-auto flex max-w-full items-center gap-3 rounded-2xl border border-line bg-panel/90 py-1.5 pr-1.5 pl-4 text-sm shadow-lg backdrop-blur-xl",
          ),
        ],
        [
          h.p(
            [h.Role("status"), h.Class("min-w-0")],
            [`${staleReason(error)} Showing what loaded earlier.`],
          ),
          tryAgainView("shrink-0 text-accent underline underline-offset-2 hover:no-underline", h),
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
