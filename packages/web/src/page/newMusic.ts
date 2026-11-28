import type { TrendingMusic } from "@bafle/domain/Catalog/MusicCatalog.external";
import * as Array from "effect/Array";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import type { NewMusicData } from "../model.ts";
import { PAGE_IDS, PAGE_SECTIONS_CLASS } from "../view/layout.ts";
import { sectionPageView, sectionsView } from "../view/page.ts";
import { shelfPlaceholderView } from "../view/placeholder.ts";
import { type AlbumTileState, albumTile, maybeShelfView } from "../view/shelf.ts";
import {
  type TrackListContext,
  type TrackSection,
  maybeTrackSectionView,
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
  albumState: AlbumTileState,
  h: HtmlBuilder<Message>,
): Html =>
  sectionsView(
    [
      maybeTrackSectionView(TOP_SONGS_SECTION, trending.tracks, context, h),
      maybeShelfView(
        "new-top-albums",
        TOP_ALBUMS,
        "Square",
        Array.map(trending.albums, albumTile(albumState, context.presence)),
        h,
      ),
    ],
    "The catalog has no charts right now.",
    h,
  );

export const view = (
  newMusic: NewMusicData,
  context: TrackListContext,
  albumState: AlbumTileState,
  h: HtmlBuilder<Message>,
): Html =>
  sectionPageView(
    { pageId: PAGE_ID, title: TITLE, presence: context.presence, data: newMusic },
    () => placeholderView(h),
    (trending) => chartsView(trending, context, albumState, h),
    h,
  );
