import type { Station } from "@bafle/domain/Catalog/FullStation";
import type { StationId } from "@bafle/domain/Catalog/Station";
import { clsx } from "clsx";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import type { StationData } from "../model.ts";
import { stationPictureView } from "../view/artwork.ts";
import {
  PAGE_IDS,
  PAGE_SECTIONS_CLASS,
  PAGE_TITLE_CLASS,
  QUIET_LINE_CLASS,
  pageAttributes,
  pageTitleIdOf,
  pageTitleView,
} from "../view/layout.ts";
import { pageDataView } from "../view/pageData.ts";
import { BLOCK_CLASS } from "../view/placeholder.ts";
import {
  maybeTrackSectionView,
  type TrackListContext,
  type TrackSection,
  trackSectionPlaceholderView,
} from "../view/trackList.ts";

// VIEW

const PAGE_ID = PAGE_IDS.Station;
const TITLE = "Station";
const SONGS = "Songs";
const NOT_AVAILABLE = "This station is not available";

/** Its songs, in its own order: they are what the page is. */
const SONGS_SECTION: TrackSection = {
  id: "station-songs",
  title: SONGS,
  order: "Unranked",
  spread: "Single",
};

/** What a station's page is called: the station's title once the catalog has told it. */
export const titleOf = (station: StationData): string =>
  Option.match(AsyncData.getData(station), {
    onNone: () => TITLE,
    onSome: Option.match({ onNone: () => NOT_AVAILABLE, onSome: (found) => found.title }),
  });

/** The picture beside the station's title, at the head of the page. */
const HEAD_CLASS = "flex max-w-3xl items-end gap-5 md:gap-7";

const PICTURE_CLASS = "w-28 shrink-0 sm:w-40 md:w-48";

/**
 * The page before the catalog has answered: a block for the picture beside
 * lines for the title, what it is and the song count, then rows under the
 * list's title, which never depends on the catalog.
 */
const placeholderView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      h.div(
        [h.AriaHidden(true), h.Class(HEAD_CLASS)],
        [
          h.div([h.Class(clsx(BLOCK_CLASS, PICTURE_CLASS, "aspect-square rounded-xl"))]),
          h.div(
            [h.Class("min-w-0 flex-1")],
            [
              h.div([h.Class(clsx(BLOCK_CLASS, "h-9 w-4/5 rounded"))]),
              h.div([h.Class(clsx(BLOCK_CLASS, "mt-3 h-6 w-2/5 rounded"))]),
              h.div([h.Class(clsx(BLOCK_CLASS, "mt-3 h-4 w-20 rounded"))]),
            ],
          ),
        ],
      ),
      h.div(
        [h.Class(PAGE_SECTIONS_CLASS)],
        [
          trackSectionPlaceholderView(SONGS_SECTION, h),
        ],
      ),
    ],
  );

const songCount = (station: Station): string =>
  station.tracks.length === 1 ? "1 song" : `${station.tracks.length} songs`;

const headView = (station: Station, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(HEAD_CLASS)],
    [
      h.div(
        [h.Class(PICTURE_CLASS)],
        [stationPictureView(station.id, Option.fromNullishOr(station.picture), h)],
      ),
      h.div(
        [h.Class("min-w-0")],
        [
          h.h1([h.Id(pageTitleIdOf(PAGE_ID)), h.Class(PAGE_TITLE_CLASS)], [station.title]),
          h.p([h.Class("mt-1 text-lg text-muted")], [TITLE]),
          h.p([h.Class("mt-2 text-sm text-muted tabular-nums")], [songCount(station)]),
        ],
      ),
    ],
  );

/**
 * The station, and the songs it plays now in the order it plays them. Each
 * row plays, and the station's list is then the queue.
 */
const foundView = (station: Station, context: TrackListContext, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      headView(station, h),
      Option.match(
        maybeTrackSectionView(SONGS_SECTION, station.tracks, context, h),
        {
          onNone: () =>
            h.p([h.Class(QUIET_LINE_CLASS)], ["The catalog lists no songs for this station."]),
          onSome: (songs) => h.div([h.Class(PAGE_SECTIONS_CLASS)], [songs]),
        },
      ),
    ],
  );

/**
 * The catalog has no such station. That will not change, so there is
 * nothing to try again: the page says so.
 */
const notAvailableView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("max-w-md")],
    [
      pageTitleView(PAGE_ID, NOT_AVAILABLE, h),
      h.p(
        [h.Class("mt-4 text-muted")],
        ["The catalog no longer has it, or the link to it is wrong."],
      ),
    ],
  );

/**
 * The page's title while there is no station to take it from. Loading, the
 * placeholders stand for it on screen and it is only said; after a failure
 * it heads the message.
 */
const untitledView = (station: StationData, h: HtmlBuilder<Message>): Html =>
  AsyncData.matchData(station, {
    onEmpty: () => h.h1([h.Id(pageTitleIdOf(PAGE_ID)), h.Class("sr-only")], [TITLE]),
    onFailure: () => pageTitleView(PAGE_ID, TITLE, h),
    onData: () => h.empty,
  });

/**
 * The root is keyed by the station: another station is another page, which
 * starts at its top with its own pictures. The page is a list, so it is kept
 * behind a page reached from it, as a section is: `context.presence` says
 * whether it is on screen.
 */
export const view = (
  stationId: StationId,
  station: StationData,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed("div")(stationId, pageAttributes(PAGE_ID, context.presence, h), [
    h.div(
      [h.AriaBusy(AsyncData.isPending(station))],
      [
        untitledView(station, h),
        pageDataView(
          station,
          TITLE,
          () => placeholderView(h),
          Option.match({
            onNone: () => notAvailableView(h),
            onSome: (found) => foundView(found, context, h),
          }),
          h,
        ),
      ],
    ),
  ]);
