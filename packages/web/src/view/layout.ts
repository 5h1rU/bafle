import type { Attribute, Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";

// VIEW

export const PAGE_ID = "page";

export const PAGE_TITLE_ID = "page-title";

export const PAGE_SECTIONS_CLASS = "mt-8 flex flex-col gap-10";

export const SECTION_HEADING_CLASS = "text-xl font-semibold tracking-tight";

export const QUIET_LINE_CLASS = "mt-8 text-muted";

/**
 * What every page's root element carries. Each page builds its own root with
 * these, rather than sharing one wrapper, so that a page swap replaces the
 * element: the new page then starts at its top, not where the last one was
 * scrolled to. The root is the scrolling box, so it takes keyboard focus and
 * is named by the page's title: arrow keys and Space scroll it.
 */
export const pageAttributes = (h: HtmlBuilder<Message>): ReadonlyArray<Attribute<Message>> => [
  h.Id(PAGE_ID),
  h.Role("region"),
  h.AriaLabelledBy(PAGE_TITLE_ID),
  h.Tabindex(0),
  h.Class(
    "h-full overflow-y-auto px-5 pt-8 pb-12 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:px-10 md:pt-10",
  ),
];

export const pageTitleView = (title: string, h: HtmlBuilder<Message>): Html =>
  h.h1([h.Id(PAGE_TITLE_ID), h.Class("text-3xl font-bold tracking-tight")], [title]);
