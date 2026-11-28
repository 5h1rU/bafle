import type { FeaturedMusic } from "@bafle/domain/Catalog/MusicCatalog.external";
import type { Popover } from "@foldkit/ui";
import * as Array from "effect/Array";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import type { HomeData } from "../model.ts";
import { aboutView } from "../view/about.ts";
import { PAGE_IDS, PAGE_SECTIONS_CLASS, type Presence } from "../view/layout.ts";
import { sectionPageView, sectionsView } from "../view/page.ts";
import { shelfPlaceholderView } from "../view/placeholder.ts";
import {
  type TilesOpening,
  albumTile,
  artistTile,
  maybeShelfView,
  playlistTile,
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
  sectionsView(
    [
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
    ],
    "The catalog has nothing to recommend right now.",
    h,
  );

export const view = (
  home: HomeData,
  presence: Presence,
  opening: TilesOpening,
  about: Popover.Model,
  h: HtmlBuilder<Message>,
): Html =>
  sectionPageView(
    // NOTE: Home is where the app says who made it, on a narrow screen: a
    // control at the far end of its title's row (`view/about.ts`).
    { pageId: PAGE_ID, title: TITLE, presence, data: home, beside: aboutView(about, h) },
    () => placeholderView(h),
    (featured) => shelvesView(featured, presence, opening, h),
    h,
  );
