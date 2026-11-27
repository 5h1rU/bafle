import type { TrackSummary } from "@bafle/domain/Catalog/Track";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import type { Attribute, Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import { artworkFlightRules, coverTransitionName, type PictureLoading } from "./artwork.ts";
import { COLUMN_ROWS_AT_ONCE, ROWS_AT_ONCE } from "./firstPictures.ts";
import { SECTION_HEADING_CLASS } from "./layout.ts";
import {
  type RowLead,
  type TrackListContext,
  trackRowPlaceholderView,
  trackRowView,
} from "./trackRow.ts";
import { TURNING_ROW_CLASS, turningRowIdOf, turningView } from "./turning.ts";

export { explicitMarkerView, type RowLead, type TrackListContext } from "./trackRow.ts";

// A LIST OF SONGS

// Every list of songs in the app is drawn here, whatever page it is on: a
// chart, an artist's top songs, the songs of an album, a playlist or a
// station, what a search found. A page says what its list is (`TrackList`,
// or `TrackSection` when the list stands under a title of its own) and hands
// over the tracks; how the rows are laid out, in one column or in several,
// is the list's, and so is what stands in its place before the tracks are
// known. The rows are `trackRow.ts`.

/** Ranked lists number their rows: the order is the catalog's chart. */
export type TrackOrder = "Ranked" | "Unranked";

/**
 * How a list uses the room it is given. `Single` is one column of a width
 * that reads well, however wide the page, and as long as the list is.
 * `Columns` takes the page's width and, where it is wide, is never taller
 * than a few rows: the list is laid out in columns of `ROWS_IN_COLUMN` at
 * most, as many as it takes, the first rows down the first and the next
 * down the one after, so a chart still reads from its top. The columns
 * stand in a row that goes on sideways and snaps, as a shelf does, two of
 * them seen at once. Where the list is narrow, on a phone, it is one column
 * of all its rows.
 *
 * Top songs are `Columns` wherever they are listed, on New, on an artist's
 * page and on a genre's: a chart is one thing, and looks one way. So are
 * the songs a search found, past the few that stand beside the artist. The
 * songs of an album, a playlist or a station are `Single`: they are what
 * the page is, and nothing stands under them to be reached.
 */
export type TrackSpread = "Single" | "Columns";

/**
 * A list of songs, as its page describes it. `labelledBy` is the id of the
 * heading that names it. `lead` is what each row leads with: a cover, unless
 * the page says the list is one album's songs, which lead with their number.
 */
export type TrackList = Readonly<{
  labelledBy: string;
  order: TrackOrder;
  spread: TrackSpread;
  lead?: RowLead;
}>;

/**
 * A list of songs under a title of its own. `place` is where the section
 * stands on a page that lays its sections out itself (Search's), and
 * nothing else: the section's width is its spread's to say.
 */
export type TrackSection = Readonly<{
  id: string;
  title: string;
  order: TrackOrder;
  spread: TrackSpread;
  place?: string;
}>;

/** The most rows a column holds: what an artist's ten top songs come to in two. */
export const ROWS_IN_COLUMN = 5;

const columnsOf = (count: number): number => Math.ceil(count / ROWS_IN_COLUMN);

/**
 * How many rows each column of a list holds. The columns are as even as
 * they can be: eight songs are four and four, not five and three.
 */
const rowsInColumnOf = (count: number): number => Math.ceil(count / columnsOf(count));

// NOTE: the row of columns reaches the page's edges and is padded back in
// by as much, as a shelf's row is, so what is scrolled is cut off at the
// edge of the page and not at the edge of its text. Where each column
// stands is the list's own: wide enough for two columns of rows, it is laid
// out in columns of as many rows as it says (`--rows`), the first rows down
// the first column and the next down the one after, so it still reads from
// its top, and each column comes to rest at the row's leading edge.
const COLUMNS_CLASS =
  "-mx-5 mt-2 flex snap-x snap-mandatory scroll-px-5 flex-col overflow-x-auto overscroll-x-contain px-5 pb-3 md:-mx-10 md:scroll-px-10 md:px-10 @2xl:grid @2xl:grid-flow-col @2xl:grid-rows-[repeat(var(--rows),auto)] @2xl:gap-x-10 @2xl:*:snap-start";

// NOTE: two columns are seen. When there are more, each is a little
// narrower, so that the next one shows at the edge and says there is more
// that way; a list that is all in view has nothing to show there, and its
// columns take all the width.
const COLUMNS_WIDTH_CLASS = {
  AllInView: "@2xl:auto-cols-[calc((100%-2.5rem)/2)]",
  MoreBeyond: "@2xl:auto-cols-[calc((100%-5.5rem)/2)]",
} as const;

/** What a list in columns says of itself to the style sheet: how many rows a column holds, and how many columns there are. */
const columnsAttributes = (
  count: number,
  h: HtmlBuilder<Message>,
  className: string,
): ReadonlyArray<Attribute<Message>> => [
  h.Style({ "--rows": String(rowsInColumnOf(count)) }),
  h.DataAttribute("columns", String(columnsOf(count))),
  h.Class(
    clsx(
      COLUMNS_CLASS,
      columnsOf(count) > 2 ? COLUMNS_WIDTH_CLASS.MoreBeyond : COLUMNS_WIDTH_CLASS.AllInView,
      className,
    ),
  ),
];

/**
 * What a section that holds a list is, for the list's sake. A list in
 * columns goes by its own width, so its section is what that width is
 * measured on (a container); a list in one column is kept to a
 * width that reads well.
 */
const SECTION_CLASS: Readonly<Record<TrackSpread, string>> = {
  Single: "max-w-3xl",
  Columns: "@container",
};

/**
 * The first rows of a list are what its page opens with: their thumbnails
 * are drawn at once, and the reply for the page waits for them
 * (`firstPicturesOf`). A list in columns opens with the two columns a wide
 * page shows.
 */
const rowLoading = (spread: TrackSpread, index: number): PictureLoading =>
  index < (spread === "Columns" ? COLUMN_ROWS_AT_ONCE : ROWS_AT_ONCE) ? "AtOnce" : "WhenNear";

/**
 * The list alone, for a page that draws the section it stands in (an
 * album's, whose list is what the page is). Each row plays its track, and
 * the list is then the queue.
 */
export const trackListView = (
  { labelledBy, order, spread, lead = "Cover" }: TrackList,
  tracks: Array.NonEmptyReadonlyArray<TrackSummary>,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => {
  const rowsInColumn = rowsInColumnOf(tracks.length);
  const isColumnHead = (index: number): boolean =>
    spread === "Columns" && index > 0 && index < tracks.length && index % rowsInColumn === 0;
  // A ranked list is an ordered one: the order is the catalog's chart.
  const listOf = order === "Ranked" ? h.ol : h.ul;
  const list = listOf(
    [
      h.Role("list"),
      h.AriaLabelledBy(labelledBy),
      ...(spread === "Columns"
        ? [h.Id(turningRowIdOf(labelledBy)), ...columnsAttributes(tracks.length, h, TURNING_ROW_CLASS)]
        : [h.Class(lead === "Number" ? "mt-1" : "mt-2")]),
    ],
    Array.map(tracks, (track, index) =>
      trackRowView(
        {
          track,
          maybePosition: order === "Ranked" ? Option.some(index + 1) : Option.none(),
          lead,
          loading: rowLoading(spread, index),
          isColumnHead: isColumnHead(index),
          isColumnFoot: isColumnHead(index + 1),
        },
        context,
        h,
      ),
    ),
  );

  return [
    // A row's cover travels to its track's page and to the player; a row that leads with a number has none.
    context.presence === "OnScreen" && lead === "Cover"
      ? artworkFlightRules(tracks.map((track) => coverTransitionName(track.id)), h)
      : h.empty,
    // NOTE: a list in columns goes on sideways, so where there is a pointer
    // it is turned by its two arrows, as a shelf is.
    spread === "Columns" ? turningView(labelledBy, "Rows", list, h) : list,
  ];
};

/** A titled list of tracks, or nothing when there are none: a title over no rows says less than no title. */
export const maybeTrackSectionView = (
  { id, title, order, spread, place }: TrackSection,
  tracks: ReadonlyArray<TrackSummary>,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Option.Option<Html> =>
  Array.match(tracks, {
    onEmpty: () => Option.none(),
    onNonEmpty: (listed) =>
      Option.some(
        h.section(
          [h.Class(clsx(place, SECTION_CLASS[spread]))],
          [
            h.h2([h.Id(id), h.Class(SECTION_HEADING_CLASS)], [title]),
            ...trackListView({ labelledBy: id, order, spread }, listed, context, h),
          ],
        ),
      ),
  });

// BEFORE THE TRACKS ARE KNOWN

const PLACEHOLDER_ROWS = 8;

/** The two columns a wide page shows of a list in columns; a narrow one shows their rows in one column. */
const PLACEHOLDER_COLUMNS = 2;

/**
 * Rows the size of rows of songs, for a list whose tracks are on their way:
 * laid out as the list will be, and not to be scrolled.
 */
export const trackListPlaceholderView = (spread: TrackSpread, h: HtmlBuilder<Message>): Html =>
  spread === "Columns"
    ? h.div(
        [
          h.AriaHidden(true),
          ...columnsAttributes(ROWS_IN_COLUMN * PLACEHOLDER_COLUMNS, h, "overflow-x-hidden"),
        ],
        Array.makeBy(ROWS_IN_COLUMN * PLACEHOLDER_COLUMNS, () => trackRowPlaceholderView(h)),
      )
    : h.div(
        [h.AriaHidden(true), h.Class("mt-2")],
        Array.makeBy(PLACEHOLDER_ROWS, () => trackRowPlaceholderView(h)),
      );

/**
 * A section before its tracks are known: the real title, since that never
 * depends on the catalog, over rows in the shape the list will have.
 */
export const trackSectionPlaceholderView = (
  { title, spread, place }: Pick<TrackSection, "title" | "spread" | "place">,
  h: HtmlBuilder<Message>,
): Html =>
  h.section(
    [h.Class(clsx(place, SECTION_CLASS[spread]))],
    [h.h2([h.Class(SECTION_HEADING_CLASS)], [title]), trackListPlaceholderView(spread, h)],
  );
