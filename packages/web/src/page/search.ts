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
  pictureFlightStyle,
  artworkFlightRules,
  flightAttributes,
} from "../view/artwork.ts";
import { failureView } from "../view/feedback.ts";
import { closeIcon, openIcon, searchIcon } from "../view/icon.ts";
import {
  TILE_ATTRIBUTES,
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
  type TilesOpening,
} from "../view/shelf.ts";
import {
  maybeTrackSectionView,
  type TrackListContext,
  type TrackSection,
} from "../view/trackList.ts";
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
// NOTE: the card is the night under the artist's portrait, which fills it,
// with their name in white over its foot. `search-top-card` is what the
// style sheet moves aside while the artist's page is on its way (search.css).
const CARD_CLASS =
  "relative isolate grid min-h-41.5 min-w-0 flex-1 content-end overflow-hidden rounded-[inherit] bg-night p-5.5 text-on-night aspect-11/4 @min-[40rem]/search:min-h-48.75";

const topResultView = (
  artist: ArtistSummary,
  isOpening: boolean,
  presence: Presence,
  h: HtmlBuilder<Message>,
): Html => {
  const maybePicture = Option.fromNullishOr(artist.picture);
  const flightStyle = pictureFlightStyle("Artist", artist.id, presence);

  return h.section(
    [h.Class("search-top flex flex-col")],
    [
      artworkFlightRules(Option.toArray(Option.fromNullishOr(flightStyle.viewTransitionName)), h),
      h.h2([h.Class(clsx(SECTION_HEADING_CLASS, "sr-only @min-[40rem]/search:not-sr-only"))], ["Top result"]),
      h.a(
        [
          h.Href(artistRouter({ artistId: artist.id })),
          h.AriaBusy(isOpening),
          h.DataAttribute(TILE_ATTRIBUTES.Artist, artist.id),
          ...(isOpening ? [h.DataAttribute("opening", "")] : []),
          h.Class(
            "relative isolate flex flex-1 touch-manipulation rounded-[1.0625rem] focus-ring @min-[40rem]/search:mt-3 @min-[40rem]/search:rounded-xl",
          ),
        ],
        [
          h.span([h.AriaHidden(true), h.Class("tile-record search-top-record")]),
          h.span(
            [h.Class(clsx("tile-sleeve search-top-card artwork-with-caption", CARD_CLASS))],
            [
              Option.match(maybePicture, {
                onNone: () => h.empty,
                onSome: (picture) =>
                  h.span(
                    [
                      h.AriaHidden(true),
                      h.Class("catalog-art absolute inset-0 -z-2"),
                      ...flightAttributes(flightStyle, h),
                    ],
                    [
                      h.img([
                        h.Loading("eager"),
                        h.Fetchpriority("high"),
                        h.Decoding("sync"),
                        h.Src(picture.large),
                        h.Alt(""),
                        // A portrait's face is in its upper part: that is what a wide card keeps.
                        h.Class("size-full object-cover object-[center_30%]"),
                      ]),
                    ],
                  ),
              }),
              h.span([h.Class("text-13 font-demi text-on-night/80")], ["Artist"]),
              h.span(
                [
                  h.Class(
                    "max-w-[78%] text-4xl/[1.08] font-bold tracking-[-0.045em] text-balance wrap-anywhere @min-[40rem]/search:max-w-[68%] @min-[40rem]/search:text-[3.0625rem] @min-[40rem]/search:tracking-[-0.047em]",
                  ),
                ],
                [artist.name],
              ),
              // NOTE: the way in, drawn on a wide page as the design draws
              // it. Narrow, the whole card is plainly that.
              h.span(
                [
                  h.AriaHidden(true),
                  h.Class(
                    "absolute right-4 bottom-4 hidden size-8.5 place-items-center rounded-full border border-on-night/32 bg-night/65 @min-[40rem]/search:grid",
                  ),
                ],
                [openIcon("size-4")],
              ),
            ],
          ),
        ],
      ),
    ],
  );
};

/**
 * The songs found. Beside an artist's card there is room for a few, so the
 * first few are listed there and the rest further down, under a heading of
 * their own, in columns that go on sideways as top songs do. With no artist
 * to stand beside, the songs are one list in columns. `place` says where
 * each stands on the page (`search.css`).
 */
const SONGS_BESIDE_ARTIST: TrackSection = {
  id: "search-songs",
  title: "Songs",
  order: "Unranked",
  spread: "Single",
  place: "search-songs",
};

const MORE_SONGS: TrackSection = {
  id: "search-more-songs",
  title: "More songs",
  order: "Unranked",
  spread: "Columns",
  place: "search-more-songs",
};

const ALL_SONGS: TrackSection = {
  id: "search-songs",
  title: "Songs",
  order: "Unranked",
  spread: "Columns",
  place: "search-all-songs",
};

const songSectionsView = (
  tracks: ReadonlyArray<TrackSummary>,
  isBesideArtist: boolean,
  context: TrackListContext,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => {
  const maybeSection = (section: TrackSection, listed: ReadonlyArray<TrackSummary>) =>
    maybeTrackSectionView(section, listed, context, h);

  return Array.getSomes(
    isBesideArtist
      ? [
          maybeSection(SONGS_BESIDE_ARTIST, Array.take(tracks, SONGS_AT_HEAD)),
          maybeSection(MORE_SONGS, Array.drop(tracks, SONGS_AT_HEAD)),
        ]
      : [maybeSection(ALL_SONGS, tracks)],
  );
};

// NOTE: the albums are a shelf wherever they are found, with the tiles, the
// links and the records of one. How the shelf is laid out is this page's
// own: three across (`ShelfLayout`).

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
            "ThreeAcross",
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
        clsx(
          "search-results mt-(--search-gap) transition-opacity duration-150 motion-reduce:transition-none @min-[40rem]/search:mt-6",
          {
            "opacity-60": isOutOfDate,
          },
        ),
      ),
    ],
    [
      AsyncData.matchData(search, {
        onEmpty: () => h.empty,
        onFailure: (error) => failureView(TITLE, error, h),
        onData: (answer) =>
          hasResults(answer)
            ? foundView(answer, context, opening, h)
            : h.p(
                [
                  h.Class(
                    "text-center text-[0.875rem] text-pretty text-muted @min-[40rem]/search:mt-8 @min-[40rem]/search:text-start @min-[40rem]/search:text-[1rem]",
                  ),
                ],
                [noResults(answer)],
              ),
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
