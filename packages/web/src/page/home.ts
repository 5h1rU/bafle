import type { FeaturedMusic } from "@bafle/domain/Catalog/MusicCatalog.external";
import * as Array from "effect/Array";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import type { HomeData } from "../model.ts";
import {
  PAGE_SECTIONS_CLASS,
  QUIET_LINE_CLASS,
  pageAttributes,
  pageTitleView,
} from "../view/layout.ts";
import { pageDataView } from "../view/pageData.ts";
import { shelfPlaceholderView } from "../view/placeholder.ts";
import { albumTile, artistTile, maybeShelfView, playlistTile } from "../view/shelf.ts";

// VIEW

const TITLE = "Home";
const EDITORS_PICKS = "Editors' picks";
const TOP_PLAYLISTS = "Top playlists";
const TOP_ARTISTS = "Top artists";

/** Home before the catalog has answered: its three shelves, titled, with blocks for tiles. */
const placeholderView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(PAGE_SECTIONS_CLASS)],
    [
      shelfPlaceholderView(EDITORS_PICKS, "Square", h),
      shelfPlaceholderView(TOP_PLAYLISTS, "Square", h),
      shelfPlaceholderView(TOP_ARTISTS, "Round", h),
    ],
  );

const shelvesView = (featured: FeaturedMusic, h: HtmlBuilder<Message>): Html =>
  Array.match(
    Array.getSomes([
      maybeShelfView(
        "home-editors-picks",
        EDITORS_PICKS,
        "Square",
        Array.map(featured.albums, albumTile),
        h,
      ),
      maybeShelfView(
        "home-top-playlists",
        TOP_PLAYLISTS,
        "Square",
        Array.map(featured.playlists, playlistTile),
        h,
      ),
      maybeShelfView(
        "home-top-artists",
        TOP_ARTISTS,
        "Round",
        Array.map(featured.artists, artistTile),
        h,
      ),
    ]),
    {
      onEmpty: () =>
        h.p([h.Class(QUIET_LINE_CLASS)], ["The catalog has nothing to recommend right now."]),
      onNonEmpty: (shelves) => h.div([h.Class(PAGE_SECTIONS_CLASS)], shelves),
    },
  );

export const view = (home: HomeData, h: HtmlBuilder<Message>): Html =>
  h.div(pageAttributes(h), [
    pageTitleView(TITLE, h),
    h.div(
      [h.AriaBusy(AsyncData.isPending(home))],
      [
        pageDataView(
          home,
          TITLE,
          () => placeholderView(h),
          (featured) => shelvesView(featured, h),
          h,
        ),
      ],
    ),
  ]);
