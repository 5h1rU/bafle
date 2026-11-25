import type { MusicGenres } from "@bafle/domain/Catalog/MusicCatalog.external";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import type { GenreListData } from "../model.ts";
import {
  type Presence,
  QUIET_LINE_CLASS,
  pageAttributes,
  PAGE_IDS,
  pageTitleIdOf,
  pageTitleView,
} from "../view/layout.ts";
import { pageDataView } from "../view/pageData.ts";
import { tileGridPlaceholderView } from "../view/placeholder.ts";
import { genreTile, type IsGenreOpening, maybeTileGridView } from "../view/shelf.ts";

// VIEW

const PAGE_ID = PAGE_IDS.Genres;
const TITLE = "Genres";

/** Genres before the catalog has answered: blocks where the tiles will be, in the grid they will stand in. */
const placeholderView = (h: HtmlBuilder<Message>): Html => tileGridPlaceholderView("Square", h);

/**
 * Every genre as a tile, in the catalog's order. The page shows nothing
 * else, so its title names the grid. Each tile leads to its genre's page.
 */
const gridView = (
  all: MusicGenres,
  presence: Presence,
  isGenreOpening: IsGenreOpening,
  h: HtmlBuilder<Message>,
): Html =>
  Option.match(
    maybeTileGridView(
      pageTitleIdOf(PAGE_ID),
      "Square",
      Array.map(all.genres, genreTile(isGenreOpening, presence)),
      h,
    ),
    {
      onNone: () => h.p([h.Class(QUIET_LINE_CLASS)], ["The catalog lists no genres right now."]),
      onSome: (grid) => grid,
    },
  );

export const view = (
  genreList: GenreListData,
  presence: Presence,
  isGenreOpening: IsGenreOpening,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(pageAttributes(PAGE_ID, presence, h), [
    pageTitleView(PAGE_ID, TITLE, h),
    h.div(
      [h.AriaBusy(AsyncData.isPending(genreList))],
      [
        pageDataView(
          genreList,
          TITLE,
          () => placeholderView(h),
          (all) => gridView(all, presence, isGenreOpening, h),
          h,
        ),
      ],
    ),
  ]);
