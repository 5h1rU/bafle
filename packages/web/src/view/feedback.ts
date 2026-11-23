import { Button } from "@foldkit/ui";
import { clsx } from "clsx";
import * as Match from "effect/Match";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { LoadError } from "../catalog.ts";
import { Message } from "../message.ts";

// VIEW

const reason = (error: LoadError): string =>
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

/** A refresh failed behind content that is still on screen: a quiet line above it, nothing replaced. */
export const staleNoticeView = (error: LoadError, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Class(
        "mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-panel px-4 py-2 text-sm text-muted",
      ),
    ],
    [
      h.p([h.Role("status")], [`Showing what loaded earlier. ${reason(error)}`]),
      tryAgainView("text-accent underline underline-offset-2 hover:no-underline", h),
    ],
  );
