import type { ArtistSummary } from "@bafle/domain/Catalog/Artist";
import type { TrackSummary } from "@bafle/domain/Catalog/Track";
import { Button, Input } from "@foldkit/ui";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import { type Html, type HtmlBuilder, inertHtml as ih } from "foldkit/html";
import { SEARCH_FIELD_BOX_CLASS, SEARCH_FIELD_ID } from "../command.ts";
import { Message } from "../message.ts";
import { hasSearchAnswer, type SearchAnswer, type SearchData } from "../model.ts";
import { artistRouter } from "../route.ts";
import {
  artistPictureTransitionStyle,
  artworkFlightRules,
  flightAttributes,
} from "../view/artwork.ts";
import { failureView } from "../view/feedback.ts";
import { closeIcon, openIcon, searchIcon } from "../view/icon.ts";
import {
  ARTIST_TILE_ATTRIBUTE,
  PAGE_IDS,
  type Presence,
  SECTION_HEADING_CLASS,
  pageAttributes,
  pageTitleIdOf,
} from "../view/layout.ts";
import {
  albumTile,
  artistTile,
  maybeShelfView,
  playlistTile,
  SHELF_ROW_CLASS,
  type ShelfLook,
  type TilesOpening,
} from "../view/shelf.ts";
import { type TrackListContext, type TrackSpread, trackListView } from "../view/trackList.ts";
import "./search.css";

// VIEW

const PAGE_ID = PAGE_IDS.Search;
const TITLE = "Search";

/**
 * The songs listed beside the artist found first, on a wide page: as many
 * rows as the artist's card is high. The rest are listed further down.
 */
const SONGS_AT_HEAD = 4;

/** Bafle's mark, in the colour of the words it stands with. */
const markView = (className: string): Html =>
  ih.svg(
    [
      ih.AriaHidden(true),
      ih.Class(className),
      ih.Xmlns("http://www.w3.org/2000/svg"),
      ih.Fill("currentColor"),
      ih.ViewBox("0 0 196 266"),
    ],
    [
      ih.path([
        ih.FillRule("evenodd"),
        ih.D(
          "M15 0h166a15 15 0 0 1 15 15v236a15 15 0 0 1-15 15H15a15 15 0 0 1-15-15V15A15 15 0 0 1 15 0Z M69 53a29 29 0 1 0 58 0a29 29 0 1 0-58 0Z M85 53a13 13 0 1 0 26 0a13 13 0 1 0-26 0Z M19 174a79 79 0 1 0 158 0a79 79 0 1 0-158 0Z M64 174a34 34 0 1 0 68 0a34 34 0 1 0-68 0Z",
        ),
      ]),
    ],
  );

/**
 * What the page opens on: the mark over the page's name, over the field in
 * the middle of the screen. When the field goes to the page's head they give
 * way on a narrow page; on a wide one the name alone then heads the page, as
 * every section's does (`search.css`).
 */
const introView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("search-intro")],
    [markView("search-mark"), h.h1([h.Id(pageTitleIdOf(PAGE_ID)), h.Class("search-title")], [TITLE])],
  );

const clearView = (h: HtmlBuilder<Message>): Html =>
  Button.view(
    {
      onClick: Message.ClickedClearSearch(),
      toView: (attributes) =>
        h.button(
          [...attributes.button, h.AriaLabel("Clear search"), h.Class("search-clear")],
          [h.span([h.Class("search-clear-disc")], [closeIcon("size-3")])],
        ),
    },
    h,
  );

/**
 * The field, with the control that empties it once there is something in
 * it. Escape empties it too. Its magnifier breathes for as long as the
 * catalog is being asked: while the first answer is on its way nothing else
 * on the page says so.
 */
const fieldView = (fieldText: string, isListening: boolean, h: HtmlBuilder<Message>): Html =>
  Input.view(
    {
      id: SEARCH_FIELD_ID,
      type: "search",
      value: fieldText,
      placeholder: "Artists, songs, albums, playlists",
      onInput: (value) => Message.UpdatedSearchField({ value }),
      toView: (attributes) =>
        h.search(
          [h.Class("search-bar")],
          [
            h.label([...attributes.label, h.Class("sr-only")], ["Search the catalog"]),
            h.div(
              [h.Class(SEARCH_FIELD_BOX_CLASS)],
              [
                searchIcon(clsx("size-5 shrink-0", { "search-listens": isListening })),
                h.input([
                  ...attributes.input,
                  h.Autocomplete("off"),
                  h.Spellcheck(false),
                  // A phone keyboard would capitalize and "correct" artist names.
                  h.Autocapitalize("off"),
                  h.Autocorrect("off"),
                  h.EnterKeyHint("search"),
                  h.OnKeyDownPreventDefault((key) =>
                    key === "Escape" && fieldText !== ""
                      ? Option.some(Message.PressedEscapeInSearch())
                      : Option.none(),
                  ),
                ]),
                fieldText === "" ? h.empty : clearView(h),
              ],
            ),
          ],
        ),
    },
    h,
  );

/**
 * The artist found first, on a card of their own: their picture, their
 * name, and the way to their page. The picture is the one that goes there,
 * as a tile's does, and the card is marked as their tile is, so the focus is
 * given back to it. While their page is on its way the card says so as a
 * tile does: it is a sleeve, which moves a little aside, and its record
 * comes part of the way out from behind it and turns (`search.css`).
 */
const topResultView = (
  artist: ArtistSummary,
  isOpening: boolean,
  presence: Presence,
  h: HtmlBuilder<Message>,
): Html => {
  const maybePicture = Option.fromNullishOr(artist.picture);
  const flightStyle = artistPictureTransitionStyle(artist.id, presence);

  return h.section(
    [h.Class("search-top")],
    [
      artworkFlightRules(Option.toArray(Option.fromNullishOr(flightStyle.viewTransitionName)), h),
      h.h2([h.Class(clsx(SECTION_HEADING_CLASS, "search-top-heading"))], ["Top result"]),
      h.a(
        [
          h.Href(artistRouter({ artistId: artist.id })),
          h.AriaBusy(isOpening),
          h.DataAttribute(ARTIST_TILE_ATTRIBUTE, artist.id),
          ...(isOpening ? [h.DataAttribute("opening", "")] : []),
          h.Class("search-top-link"),
        ],
        [
          h.span([h.AriaHidden(true), h.Class("tile-record search-top-record")]),
          h.span(
            [h.Class("tile-sleeve search-top-card artwork-with-caption")],
            [
              Option.match(maybePicture, {
                onNone: () => h.empty,
                onSome: (picture) =>
                  h.span(
                    [
                      h.AriaHidden(true),
                      h.Class("search-top-art catalog-art"),
                      ...flightAttributes(flightStyle, h),
                    ],
                    [
                      h.img([
                        h.Loading("eager"),
                        h.Fetchpriority("high"),
                        h.Decoding("sync"),
                        h.Src(picture.large),
                        h.Alt(""),
                      ]),
                    ],
                  ),
              }),
              h.span([h.Class("search-top-kind")], ["Artist"]),
              h.span([h.Class("search-top-name")], [artist.name]),
              h.span([h.AriaHidden(true), h.Class("search-top-go")], [openIcon("size-4")]),
            ],
          ),
        ],
      ),
    ],
  );
};

/** A titled list of the songs found, or of some of them. */
const songsView = (
  id: string,
  title: string,
  className: string,
  spread: TrackSpread,
  tracks: Array.NonEmptyReadonlyArray<TrackSummary>,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): Html =>
  h.section(
    [h.Class(className)],
    [
      h.h2([h.Id(id), h.Class(SECTION_HEADING_CLASS)], [title]),
      ...trackListView(id, "Unranked", spread, tracks, context, h),
    ],
  );

/**
 * The songs found. Beside an artist's card there is room for a few, so the
 * first few are listed there and the rest further down, across the page; on
 * a narrow page the two lists stand one right under the other and read as
 * one. With no artist to stand beside, the songs are one list across the
 * page.
 */
const songSectionsView = (
  tracks: ReadonlyArray<TrackSummary>,
  isBesideArtist: boolean,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => {
  const list = (
    id: string,
    title: string,
    className: string,
    spread: TrackSpread,
    listed: ReadonlyArray<TrackSummary>,
  ): ReadonlyArray<Html> =>
    Array.match(listed, {
      onEmpty: () => [],
      onNonEmpty: (songs) => [songsView(id, title, className, spread, songs, context, h)],
    });

  return isBesideArtist
    ? [
        ...list("search-songs", "Songs", "search-songs", "Single", Array.take(tracks, SONGS_AT_HEAD)),
        ...list(
          "search-more-songs",
          "More songs",
          "search-more-songs track-columns-place",
          "Columns",
          Array.drop(tracks, SONGS_AT_HEAD),
        ),
      ]
    : list("search-songs", "Songs", "search-all-songs track-columns-place", "Columns", tracks);
};

// NOTE: the albums are a shelf wherever they are found, with the tiles, the
// links and the records of one. How the shelf is laid out is this page's:
// three across in a row that goes on sideways, or a grid on a wide page.
const ALBUMS_LOOK: ShelfLook = {
  row: clsx(SHELF_ROW_CLASS, "search-albums"),
  tile: "search-album",
};

/**
 * What was found: the artist found first on a card, the songs, the albums,
 * and then the other artists and the playlists on shelves. Only the kinds
 * that found something are there. In the document the songs come before the
 * albums, which is how a wide page reads; a narrow one puts the albums
 * first (`search.css`).
 */
const foundView = (
  answer: SearchAnswer,
  context: TrackListContext,
  { isAlbumOpening, isArtistOpening, isPlaylistOpening }: TilesOpening,
  h: HtmlBuilder<Message>,
): Html => {
  const { albums, artists, playlists, tracks } = answer.results;
  const maybeTopArtist = Array.head(artists);
  const [firstSongs, moreSongs] = Array.splitAt(
    songSectionsView(tracks, Option.isSome(maybeTopArtist), context, h),
    1,
  );
  const place = (className: string) => (shelf: Html): Html => h.div([h.Class(className)], [shelf]);

  return h.div(
    [h.Class("search-found")],
    [
      ...Option.match(maybeTopArtist, {
        onNone: () => [],
        onSome: (artist) => [
          topResultView(artist, isArtistOpening(artist.id), context.presence, h),
        ],
      }),
      ...firstSongs,
      ...Array.getSomes([
        Option.map(
          maybeShelfView(
            "search-albums",
            "Albums",
            "Square",
            Array.map(albums, albumTile(isAlbumOpening, context.presence)),
            h,
            "AtHead",
            ALBUMS_LOOK,
          ),
          place("search-albums-place"),
        ),
      ]),
      ...moreSongs,
      ...Array.getSomes([
        Option.map(
          maybeShelfView(
            "search-artists",
            "Artists",
            "Round",
            Array.map(Array.drop(artists, 1), artistTile(isArtistOpening, context.presence)),
            h,
          ),
          place("search-artists-place"),
        ),
        Option.map(
          maybeShelfView(
            "search-playlists",
            "Playlists",
            "Square",
            Array.map(playlists, playlistTile(isPlaylistOpening, context.presence)),
            h,
          ),
          place("search-playlists-place"),
        ),
      ]),
    ],
  );
};

const hasResults = (answer: SearchAnswer): boolean => {
  const groups: ReadonlyArray<ReadonlyArray<unknown>> = [
    answer.results.artists,
    answer.results.albums,
    answer.results.tracks,
    answer.results.playlists,
  ];
  return Array.some(groups, Array.isReadonlyArrayNonEmpty);
};

// The term the answer is for: while a newer term loads, the field already says something else.
const noResults = (answer: SearchAnswer): string => `No results for “${answer.term}”`;

/** Said to assistive technology when an answer arrives: nothing else on the page tells it one did. */
const outcome = (search: SearchData): string =>
  Option.match(AsyncData.getData(search), {
    onNone: () => "",
    onSome: (answer) => (hasResults(answer) ? `Results for “${answer.term}”` : noResults(answer)),
  });

const resultsView = (
  search: SearchData,
  searchedTerm: string,
  context: TrackListContext,
  opening: TilesOpening,
  h: HtmlBuilder<Message>,
): Html => {
  // Out of date as soon as the field asks for something else, whether or not the new query is out yet.
  const isOutOfDate = Option.exists(
    AsyncData.getData(search),
    (answer) => answer.term !== searchedTerm,
  );

  return h.section(
    [
      h.AriaLabel("Results"),
      h.AriaBusy(AsyncData.isPending(search)),
      h.Class(
        // Dimmed, not removed: still readable, visibly not the answer to what the field says.
        clsx("search-results transition-opacity duration-150 motion-reduce:transition-none", {
          "opacity-60": isOutOfDate,
        }),
      ),
    ],
    [
      AsyncData.matchData(search, {
        onEmpty: () => h.empty,
        onFailure: (error) => failureView(TITLE, error, h),
        onData: (answer) =>
          hasResults(answer)
            ? foundView(answer, context, opening, h)
            : h.p([h.Class("search-none")], [noResults(answer)]),
      }),
    ],
  );
};

/**
 * `maybeFieldText` is what the listener typed, as the URL holds it;
 * `maybeSearchedTerm` is the same without the spaces around it, absent when
 * there is nothing to look for.
 */
export const view = (
  maybeFieldText: Option.Option<string>,
  maybeSearchedTerm: Option.Option<string>,
  search: SearchData,
  context: TrackListContext,
  opening: TilesOpening,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      ...pageAttributes(PAGE_ID, context.presence, h),
      // NOTE: read by the style sheet, which draws the field in the middle
      // of the page or at its head, and moves it from one to the other.
      h.DataAttribute("field", hasSearchAnswer(maybeSearchedTerm, search) ? "docked" : "centered"),
    ],
    [
      h.div(
        [h.Class("search-layout")],
        [
          introView(h),
          fieldView(
            Option.getOrElse(maybeFieldText, () => ""),
            Option.isSome(maybeSearchedTerm) && AsyncData.isPending(search),
            h,
          ),
          // NOTE: the place is the page's and not the results', which are
          // only there once the catalog has answered: it is there before it
          // has anything to say, so that what it says is heard as a change.
          h.p([h.Role("status"), h.Class("search-outcome sr-only")], [outcome(search)]),
          Option.match(Option.filter(maybeSearchedTerm, () => hasSearchAnswer(maybeSearchedTerm, search)), {
            onNone: () => h.empty,
            onSome: (searchedTerm) => resultsView(search, searchedTerm, context, opening, h),
          }),
        ],
      ),
    ],
  );
