import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import { homeRouter } from "../route.ts";
import { PAGE_IDS, pageAttributes, pageTitleView } from "../view/layout.ts";

// VIEW

const PAGE_ID = PAGE_IDS.NotFound;

export const TITLE = "Page not found";

export const view = (path: string, h: HtmlBuilder<Message>): Html =>
  h.div(pageAttributes(PAGE_ID, "OnScreen", h), [
    pageTitleView(PAGE_ID, TITLE, h),
    h.p([h.Class("mt-4 break-all text-muted")], [`Nothing lives at ${path}.`]),
    h.a(
      [
        h.Href(homeRouter()),
        h.Class(
          "mt-6 inline-block rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        ),
      ],
      ["Go to Home"],
    ),
  ]);
