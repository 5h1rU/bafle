import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { LoadError } from "../catalog.ts";
import type { Message } from "../message.ts";
import { failureView } from "./feedback.ts";
import {
  PAGE_SECTIONS_CLASS,
  PAGE_TITLE_CLASS,
  type PageEdges,
  type Presence,
  QUIET_LINE_CLASS,
  pageAttributes,
  pageTitleIdOf,
  pageTitleView,
} from "./layout.ts";
import { BLOCK_CLASS } from "./placeholder.ts";

// PAGES

// The app has two kinds of page, and each kind is drawn in one frame. A
// section (Home, New, Genres, Radio) is a title over what the catalog said
// for it. A page of one thing (a track, an album, an artist, a playlist, a
// genre, a station) is that thing, which the catalog may not have at all.
// Whatever the page, what it shows goes by what it holds: placeholders in
// its shape while there is nothing yet, the failure when there is nothing
// to show, and otherwise the content. A page says only what is its own.

/** What a page shows for each state of its data. */
export const pageDataView = <A>(
  data: AsyncData.AsyncData<A, LoadError>,
  what: string,
  toPlaceholder: () => Html,
  toContent: (held: A) => Html,
  h: HtmlBuilder<Message>,
): Html =>
  AsyncData.matchData(data, {
    onEmpty: toPlaceholder,
    onFailure: (error) => failureView(what, error, h),
    // NOTE: what is held is shown as it is, whether fresh, refreshing, or
    // left over from a refresh that failed. That a refresh failed is said
    // over the page, by the shell (`staleBannerView`), and not in it.
    onData: toContent,
  });

/**
 * A page's sections, one under another. A section the catalog had nothing
 * for is not there, since a title over nothing says less than no title; when
 * it had nothing for any of them the page says so, in one quiet line.
 */
export const sectionsView = (
  maybeSections: ReadonlyArray<Option.Option<Html>>,
  nothing: string,
  h: HtmlBuilder<Message>,
): Html =>
  Array.match(Array.getSomes(maybeSections), {
    onEmpty: () => h.p([h.Class(QUIET_LINE_CLASS)], [nothing]),
    onNonEmpty: (sections) => h.div([h.Class(PAGE_SECTIONS_CLASS)], sections),
  });

// A SECTION'S PAGE

/**
 * A section: its title, which never depends on the catalog, over what the
 * catalog said for it. `beside` is what stands at the far end of the title's
 * row, on the one section that has something there.
 */
export const sectionPageView = <A>(
  page: Readonly<{
    pageId: string;
    title: string;
    presence: Presence;
    data: AsyncData.AsyncData<A, LoadError>;
    beside?: Html;
  }>,
  toPlaceholder: () => Html,
  toContent: (held: A) => Html,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(pageAttributes(page.pageId, page.presence, h), [
    page.beside === undefined
      ? pageTitleView(page.pageId, page.title, h)
      : h.div(
          [h.Class("flex items-center justify-between gap-4")],
          [pageTitleView(page.pageId, page.title, h), page.beside],
        ),
    h.div(
      [h.AriaBusy(AsyncData.isPending(page.data))],
      [pageDataView(page.data, page.title, toPlaceholder, toContent, h)],
    ),
  ]);

// THE PAGE OF ONE THING

/**
 * What kind of thing a page is the page of, in the words the page uses when
 * it has no thing to speak of: what it is called until the catalog has told
 * its title, what it says when the catalog has no such thing, and why, as
 * far as the app can tell.
 */
export type DetailKind = Readonly<{
  pageId: string;
  name: string;
  notAvailable: string;
  gone: string;
}>;

/** What most things are said to be when the catalog has none: an artist is "them". */
export const GONE = "The catalog no longer has it, or the link to it is wrong.";

/** The catalog's reply for one thing: the thing, or that it has none such. */
type DetailData<A> = AsyncData.AsyncData<Option.Option<A>, LoadError>;

/** What a page of one thing is called: the thing's own title once the catalog has told it. */
export const detailTitleOf = <A>(
  kind: DetailKind,
  data: DetailData<A>,
  toTitle: (found: A) => string,
): string =>
  Option.match(AsyncData.getData(data), {
    onNone: () => kind.name,
    onSome: Option.match({ onNone: () => kind.notAvailable, onSome: toTitle }),
  });

/**
 * The catalog has no such thing. That will not change, so there is nothing
 * to try again: the page says so.
 */
const notAvailableView = (kind: DetailKind, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("max-w-md")],
    [
      pageTitleView(kind.pageId, kind.notAvailable, h),
      h.p([h.Class("mt-4 text-muted")], [kind.gone]),
    ],
  );

/**
 * The page's title while there is no thing to take it from. Loading, the
 * placeholders stand for it on screen and it is only said; after a failure
 * it heads the message.
 */
const untitledView = <A>(kind: DetailKind, data: DetailData<A>, h: HtmlBuilder<Message>): Html =>
  AsyncData.matchData(data, {
    onEmpty: () => h.h1([h.Id(pageTitleIdOf(kind.pageId)), h.Class("sr-only")], [kind.name]),
    onFailure: () => pageTitleView(kind.pageId, kind.name, h),
    onData: () => h.empty,
  });

/**
 * The page of one thing. The root is keyed by the thing: another one is
 * another page, which starts at its top with its own pictures. `edges` and
 * `bodyClass` are for a page whose own layout needs them (an album's head
 * reaches the screen's edges; a track's page goes by its own width).
 */
export const detailPageView = <A>(
  page: Readonly<{
    kind: DetailKind;
    key: string;
    presence: Presence;
    data: DetailData<A>;
    edges?: PageEdges;
    bodyClass?: string;
  }>,
  toPlaceholder: () => Html,
  toFound: (found: A) => Html,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed("div")(
    page.key,
    pageAttributes(page.kind.pageId, page.presence, h, page.edges),
    [
      h.div(
        [
          h.AriaBusy(AsyncData.isPending(page.data)),
          ...(page.bodyClass === undefined ? [] : [h.Class(page.bodyClass)]),
        ],
        [
          untitledView(page.kind, page.data, h),
          pageDataView(
            page.data,
            page.kind.name,
            toPlaceholder,
            Option.match({ onNone: () => notAvailableView(page.kind, h), onSome: toFound }),
            h,
          ),
        ],
      ),
    ],
  );

// THE HEAD OF A PAGE OF ONE THING

/**
 * What stands beside the picture at a page's head: the thing's title alone,
 * or the title over two facts, what the thing is or whose it is, and how
 * many songs it has. With facts the words stand at the picture's foot; a
 * title alone stands at its middle.
 */
type HeadFacts = Readonly<{ whose: string; count: string }>;

const HEAD_CLASS = "flex max-w-3xl gap-5 md:gap-7";

const HEAD_PICTURE_CLASS = "w-28 shrink-0 sm:w-40 md:w-48";

const headClass = (hasFacts: boolean): string =>
  clsx(HEAD_CLASS, hasFacts ? "items-end" : "items-center");

/** The picture beside the thing's title, at the head of its page. The title is the page's. */
export const detailHeadView = (
  head: Readonly<{ kind: DetailKind; picture: Html; title: string; facts?: HeadFacts }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class(headClass(head.facts !== undefined))],
    [
      h.div([h.Class(HEAD_PICTURE_CLASS)], [head.picture]),
      h.div(
        [h.Class("min-w-0")],
        [
          h.h1([h.Id(pageTitleIdOf(head.kind.pageId)), h.Class(PAGE_TITLE_CLASS)], [head.title]),
          ...(head.facts === undefined
            ? []
            : [
                h.p([h.Class("mt-1 text-lg text-muted")], [head.facts.whose]),
                h.p([h.Class("mt-2 text-sm text-muted tabular-nums")], [head.facts.count]),
              ]),
        ],
      ),
    ],
  );

/**
 * The head before the catalog has answered: a block for the picture, in the
 * picture's shape, beside a line for the title and, where the head will have
 * them, lines for its facts.
 */
export const detailHeadPlaceholderView = (
  head: Readonly<{ shape: "Round" | "Square"; hasFacts: boolean }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.AriaHidden(true), h.Class(headClass(head.hasFacts))],
    [
      h.div([
        h.Class(
          clsx(BLOCK_CLASS, HEAD_PICTURE_CLASS, "aspect-square", {
            "rounded-full": head.shape === "Round",
            "rounded-xl": head.shape === "Square",
          }),
        ),
      ]),
      h.div(
        [h.Class("min-w-0 flex-1")],
        head.hasFacts
          ? [
              h.div([h.Class(clsx(BLOCK_CLASS, "h-9 w-4/5 rounded"))]),
              h.div([h.Class(clsx(BLOCK_CLASS, "mt-3 h-6 w-2/5 rounded"))]),
              h.div([h.Class(clsx(BLOCK_CLASS, "mt-3 h-4 w-20 rounded"))]),
            ]
          : [h.div([h.Class(clsx(BLOCK_CLASS, "h-9 w-3/5 rounded"))])],
      ),
    ],
  );

/** How many songs, in words: "1 song", "12 songs". */
export const songCount = (count: number): string => `${count} ${count === 1 ? "song" : "songs"}`;
