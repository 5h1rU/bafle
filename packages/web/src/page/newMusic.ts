import type { TrendingMusic } from "@bafle/domain/Catalog/MusicCatalog.external";
import * as Array from "effect/Array";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import type { NewMusicData } from "../model.ts";
import {
  PAGE_SECTIONS_CLASS,
  QUIET_LINE_CLASS,
  pageAttributes,
  PAGE_IDS,
  pageTitleView,
} from "../view/layout.ts";
import { pageDataView } from "../view/pageData.ts";
import { shelfPlaceholderView } from "../view/placeholder.ts";
import { albumTile, type IsAlbumOpening, maybeShelfView } from "../view/shelf.ts";
import {
  maybeTrackSectionView,
  type TrackListContext,
  type TrackSection,
  trackSectionPlaceholderView,
} from "../view/trackList.ts";

// VIEW

const PAGE_ID = PAGE_IDS.New;
const TITLE = "New";
const TOP_SONGS = "Top songs";
const TOP_ALBUMS = "Top albums";

/** What is played most, in order: the catalog's chart. */
const TOP_SONGS_SECTION: TrackSection = {
  id: "new-top-songs",
  title: TOP_SONGS,
  order: "Ranked",
  spread: "Columns",
};

/** New before the catalog has answered: a list of rows under its title, then a shelf. */
const placeholderView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(PAGE_SECTIONS_CLASS)],
    [
      trackSectionPlaceholderView(TOP_SONGS_SECTION, h),
      shelfPlaceholderView(TOP_ALBUMS, "Square", h),
    ],
  );

const chartsView = (
  trending: TrendingMusic,
  context: TrackListContext,
  isAlbumOpening: IsAlbumOpening,
  h: HtmlBuilder<Message>,
): Html =>
  Array.match(
    Array.getSomes([
      maybeTrackSectionView(TOP_SONGS_SECTION, trending.tracks, context, h),
      maybeShelfView(
        "new-top-albums",
        TOP_ALBUMS,
        "Square",
        Array.map(trending.albums, albumTile(isAlbumOpening, context.presence)),
        h,
      ),
    ]),
    {
      onEmpty: () => h.p([h.Class(QUIET_LINE_CLASS)], ["The catalog has no charts right now."]),
      onNonEmpty: (charts) => h.div([h.Class(PAGE_SECTIONS_CLASS)], charts),
    },
  );

export const view = (
  newMusic: NewMusicData,
  context: TrackListContext,
  isAlbumOpening: IsAlbumOpening,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(pageAttributes(PAGE_ID, context.presence, h), [
    pageTitleView(PAGE_ID, TITLE, h),
    h.div(
      [h.AriaBusy(AsyncData.isPending(newMusic))],
      [
        pageDataView(
          newMusic,
          TITLE,
          () => placeholderView(h),
          (trending) => chartsView(trending, context, isAlbumOpening, h),
          h,
        ),
      ],
    ),
  ]);
