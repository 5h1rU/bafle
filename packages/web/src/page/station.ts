import type { Station } from "@bafle/domain/Catalog/FullStation";
import type { StationId } from "@bafle/domain/Catalog/Station";
import * as Option from "effect/Option";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import type { StationData } from "../model.ts";
import { headPictureOf } from "../view/artwork.ts";
import { PAGE_IDS, PAGE_SECTIONS_CLASS } from "../view/layout.ts";
import {
  type DetailKind,
  detailHeadPlaceholderView,
  detailHeadView,
  detailPageView,
  detailTitleOf,
  GONE,
  sectionsView,
  songCount,
} from "../view/page.ts";
import {
  maybeTrackSectionView,
  type TrackListContext,
  type TrackSection,
  trackSectionPlaceholderView,
} from "../view/trackList.ts";

// VIEW

const KIND: DetailKind = {
  pageId: PAGE_IDS.Station,
  name: "Station",
  notAvailable: "This station is not available",
  gone: GONE,
};

/** The songs it plays now, in the order it plays them: they are what the page is. */
const SONGS: TrackSection = {
  id: "station-songs",
  title: "Songs",
  order: "Unranked",
  spread: "Single",
};

/** What a station's page is called: the station's title once the catalog has told it. */
export const titleOf = (station: StationData): string =>
  detailTitleOf(KIND, station, (found) => found.title);

/**
 * The page before the catalog has answered: a block for the picture beside
 * lines for the title, what it is and the song count, then rows under the
 * list's title, which never depends on the catalog.
 */
const placeholderView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      detailHeadPlaceholderView({ shape: "Square", hasFacts: true }, h),
      h.div([h.Class(PAGE_SECTIONS_CLASS)], [trackSectionPlaceholderView(SONGS, h)]),
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
      detailHeadView(
        {
          kind: KIND,
          picture: headPictureOf("Station", station.id, Option.fromNullishOr(station.picture), h),
          title: station.title,
          facts: { whose: KIND.name, count: songCount(station.tracks.length) },
        },
        h,
      ),
      sectionsView(
        [maybeTrackSectionView(SONGS, station.tracks, context, h)],
        "The catalog lists no songs for this station.",
        h,
      ),
    ],
  );

/**
 * The page is a list, so it is kept behind a page reached from it, as a
 * section is: `context.presence` says whether it is on screen.
 */
export const view = (
  stationId: StationId,
  station: StationData,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html =>
  detailPageView(
    { kind: KIND, key: stationId, presence: context.presence, data: station },
    () => placeholderView(h),
    (found) => foundView(found, context, h),
    h,
  );
