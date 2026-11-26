import type { FeaturedMusic } from "@bafle/domain/Catalog/MusicCatalog.external";
import * as Array from "effect/Array";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import type { HomeData } from "../model.ts";
import {
  PAGE_SECTIONS_CLASS,
  type Presence,
  QUIET_LINE_CLASS,
  pageAttributes,
  PAGE_IDS,
  pageTitleView,
} from "../view/layout.ts";
import { pageDataView } from "../view/pageData.ts";
import { shelfPlaceholderView } from "../view/placeholder.ts";
import {
  albumTile,
  artistTile,
  maybeShelfView,
  playlistTile,
  type TilesOpening,
} from "../view/shelf.ts";

// VIEW

const PAGE_ID = PAGE_IDS.Home;
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

const shelvesView = (
  featured: FeaturedMusic,
  presence: Presence,
  { isAlbumOpening, isArtistOpening, isPlaylistOpening }: TilesOpening,
  h: HtmlBuilder<Message>,
): Html =>
  Array.match(
    Array.getSomes([
      maybeShelfView(
        "home-editors-picks",
        EDITORS_PICKS,
        "Square",
        Array.map(featured.albums, albumTile(isAlbumOpening, presence)),
        h,
        "AtHead",
      ),
      maybeShelfView(
        "home-top-playlists",
        TOP_PLAYLISTS,
        "Square",
        Array.map(featured.playlists, playlistTile(isPlaylistOpening, presence)),
        h,
        "AtHead",
      ),
      maybeShelfView(
        "home-top-artists",
        TOP_ARTISTS,
        "Round",
        Array.map(featured.artists, artistTile(isArtistOpening, presence)),
        h,
      ),
    ]),
    {
      onEmpty: () =>
        h.p([h.Class(QUIET_LINE_CLASS)], ["The catalog has nothing to recommend right now."]),
      onNonEmpty: (shelves) => h.div([h.Class(PAGE_SECTIONS_CLASS)], shelves),
    },
  );

export const view = (
  home: HomeData,
  presence: Presence,
  opening: TilesOpening,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(pageAttributes(PAGE_ID, presence, h), [
    pageTitleView(PAGE_ID, TITLE, h),
    h.div(
      [h.AriaBusy(AsyncData.isPending(home))],
      [
        pageDataView(
          home,
          TITLE,
          () => placeholderView(h),
          (featured) => shelvesView(featured, presence, opening, h),
          h,
        ),
      ],
    ),
  ]);
