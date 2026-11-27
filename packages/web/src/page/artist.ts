import type { ArtistId } from "@bafle/domain/Catalog/Artist";
import type { Artist } from "@bafle/domain/Catalog/FullArtist";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";
import type { ArtistData } from "../model.ts";
import { artistPictureView } from "../view/artwork.ts";
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
import { BLOCK_CLASS, shelfPlaceholderView } from "../view/placeholder.ts";
import { albumTile, type IsAlbumOpening, maybeShelfView } from "../view/shelf.ts";
import {
  maybeTrackSectionView,
  type TrackListContext,
  type TrackSection,
  trackSectionPlaceholderView,
} from "../view/trackList.ts";

// VIEW

const PAGE_ID = PAGE_IDS.Artist;
const TITLE = "Artist";
const TOP_SONGS = "Top songs";
const ALBUMS = "Albums";
const NOT_AVAILABLE = "This artist is not available";

/** Their most played songs, in order: a chart, laid out as every chart is. */
const TOP_SONGS_SECTION: TrackSection = {
  id: "artist-top-songs",
  title: TOP_SONGS,
  order: "Ranked",
  spread: "Columns",
};

/** What an artist's page is called: the artist's name once the catalog has told it. */
export const titleOf = (artist: ArtistData): string =>
  Option.match(AsyncData.getData(artist), {
    onNone: () => TITLE,
    onSome: Option.match({ onNone: () => NOT_AVAILABLE, onSome: (found) => found.name }),
  });

/** The picture beside the artist's name, at the head of the page. */
const HEAD_CLASS = "flex max-w-3xl items-center gap-5 md:gap-7";

const PICTURE_CLASS = "w-28 shrink-0 sm:w-40 md:w-48";

/**
 * The page before the catalog has answered: a round block for the picture
 * beside a line for the name, then rows and tiles under the titles of the
 * list and the shelf, which never depend on the catalog.
 */
const placeholderView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      h.div(
        [h.AriaHidden(true), h.Class(HEAD_CLASS)],
        [
          h.div([h.Class(clsx(BLOCK_CLASS, PICTURE_CLASS, "aspect-square rounded-full"))]),
          h.div(
            [h.Class("min-w-0 flex-1")],
            [h.div([h.Class(clsx(BLOCK_CLASS, "h-9 w-3/5 rounded"))])],
          ),
        ],
      ),
      h.div(
        [h.Class(PAGE_SECTIONS_CLASS)],
        [
          trackSectionPlaceholderView(TOP_SONGS_SECTION, h),
          shelfPlaceholderView(ALBUMS, "Square", h),
        ],
      ),
    ],
  );

const headView = (artist: Artist, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(HEAD_CLASS)],
    [
      h.div(
        [h.Class(PICTURE_CLASS)],
        [artistPictureView(artist.id, Option.fromNullishOr(artist.picture), h)],
      ),
      h.div(
        [h.Class("min-w-0")],
        [h.h1([h.Id(pageTitleIdOf(PAGE_ID)), h.Class(PAGE_TITLE_CLASS)], [artist.name])],
      ),
    ],
  );

/**
 * The artist, their most played songs in order, numbered, and their albums
 * on a shelf. Each row plays, and those songs are then the queue; each tile
 * leads to its album's page.
 */
const foundView = (
  artist: Artist,
  context: TrackListContext,
  isAlbumOpening: IsAlbumOpening,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [],
    [
      headView(artist, h),
      Array.match(
        Array.getSomes([
          maybeTrackSectionView(TOP_SONGS_SECTION, artist.topTracks, context, h),
          maybeShelfView(
            "artist-albums",
            ALBUMS,
            "Square",
            Array.map(artist.albums, albumTile(isAlbumOpening, context.presence)),
            h,
          ),
        ]),
        {
          onEmpty: () =>
            h.p(
              [h.Class(QUIET_LINE_CLASS)],
              ["The catalog lists no songs or albums for this artist."],
            ),
          onNonEmpty: (sections) => h.div([h.Class(PAGE_SECTIONS_CLASS)], sections),
        },
      ),
    ],
  );

/**
 * The catalog has no such artist. That will not change, so there is nothing
 * to try again: the page says so.
 */
const notAvailableView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("max-w-md")],
    [
      pageTitleView(PAGE_ID, NOT_AVAILABLE, h),
      h.p(
        [h.Class("mt-4 text-muted")],
        ["The catalog no longer has them, or the link to them is wrong."],
      ),
    ],
  );

/**
 * The page's title while there is no artist to take it from. Loading, the
 * placeholders stand for it on screen and it is only said; after a failure
 * it heads the message.
 */
const untitledView = (artist: ArtistData, h: HtmlBuilder<Message>): Html =>
  AsyncData.matchData(artist, {
    onEmpty: () => h.h1([h.Id(pageTitleIdOf(PAGE_ID)), h.Class("sr-only")], [TITLE]),
    onFailure: () => pageTitleView(PAGE_ID, TITLE, h),
    onData: () => h.empty,
  });

/**
 * The root is keyed by the artist: another artist is another page, which
 * starts at its top with its own pictures. The page is a list and a shelf,
 * so it is kept behind a page reached from it, as a section is:
 * `context.presence` says whether it is on screen.
 */
export const view = (
  artistId: ArtistId,
  artist: ArtistData,
  context: TrackListContext,
  isAlbumOpening: IsAlbumOpening,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed("div")(artistId, pageAttributes(PAGE_ID, context.presence, h), [
    h.div(
      [h.AriaBusy(AsyncData.isPending(artist))],
      [
        untitledView(artist, h),
        pageDataView(
          artist,
          TITLE,
          () => placeholderView(h),
          Option.match({
            onNone: () => notAvailableView(h),
            onSome: (found) => foundView(found, context, isAlbumOpening, h),
          }),
          h,
        ),
      ],
    ),
  ]);
