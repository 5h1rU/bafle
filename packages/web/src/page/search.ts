import type { ArtistSummary } from "@bafle/domain/Catalog/Artist";
import type { TrackSummary } from "@bafle/domain/Catalog/Track";
import { Button, Input } from "@foldkit/ui";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import { type Html, type HtmlBuilder, inertHtml as ih } from "foldkit/html";
import { SEARCH_FIELD_BOX_ATTRIBUTE, SEARCH_FIELD_ID } from "../command.ts";
import { Message } from "../message.ts";
import { type SearchAnswer, type SearchData, hasSearchAnswer } from "../model.ts";
import { artistRouter } from "../route.ts";
import {
  VEIL_CLASS,
  artworkFlightRules,
  flightAttributes,
  pictureFlightStyle,
} from "../view/artwork.ts";
import { failureView } from "../view/feedback.ts";
import { closeIcon, openIcon, searchIcon } from "../view/icon.ts";
import {
  PAGE_IDS,
  type Presence,
  SECTION_HEADING_CLASS,
  TILE_ATTRIBUTES,
  pageAttributes,
  pageTitleIdOf,
} from "../view/layout.ts";
import {
  FAILED_WORDS,
  type TileState,
  type TileStates,
  albumTile,
  artistTile,
  failureOverView,
  maybeShelfView,
  playlistTile,
  recordStateOf,
  recordView,
  sleeveClass,
  washView,
} from "../view/shelf.ts";
import {
  type TrackListContext,
  type TrackSection,
  maybeTrackSectionView,
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
 * Where the field stands: in the middle of the page while nothing has been
 * found, and at the page's head once the catalog has answered. It is derived
 * from what the page holds, never stored (`hasSearchAnswer`), and everything
 * on the page that goes by it is drawn from it here.
 */
type FieldPlace = "Centered" | "Docked";

// THE MARK AND THE NAME

// They stand over the middle of the page, where the field is while nothing
// has been found: the page is as high as the screen, so half of it is half
// the screen. When the field goes to the page's head they give way on a
// narrow page; on a wide one the name alone then heads the page, as every
// section's does. They are gone in the first third of the field's way and
// come back once it is most of the way down.
//
// NOTE: on a wide page the name is one piece in two places, and a piece
// cannot travel between a place it is laid out in and one it is not. So it
// goes at once and comes where it now stands, late, when the field has all
// but got there.
const INTRO_CLASS =
  "pointer-events-none absolute inset-x-5 bottom-[calc(50%+2.625rem)] grid justify-items-center gap-3 md:inset-x-10 motion-safe:transition-opacity motion-safe:duration-128 motion-safe:ease-linear search-wide:motion-safe:transition-none";

const INTRO_PLACES: Readonly<Record<FieldPlace, string>> = {
  Centered: "motion-safe:delay-216 search-wide:motion-safe:animate-search-intro-comes",
  Docked:
    "opacity-0 search-wide:pointer-events-auto search-wide:static search-wide:flex search-wide:min-h-11 search-wide:items-center search-wide:opacity-100 search-wide:motion-safe:animate-search-name-comes",
};

const introView = (place: FieldPlace, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(clsx(INTRO_CLASS, INTRO_PLACES[place]))],
    [
      markView(clsx("h-19 w-14", { "search-wide:hidden": place === "Docked" })),
      h.h1(
        [
          h.Id(pageTitleIdOf(PAGE_ID)),
          h.Class(
            clsx("text-[3.25rem]/[1.06] font-bold tracking-[-0.054em]", {
              "search-wide:text-3xl search-wide:tracking-tight": place === "Docked",
            }),
          ),
        ],
        [TITLE],
      ),
    ],
  );

// THE FIELD

// Narrow, it is laid out at the head of the page, where it stands once
// something was found, and is drawn down in the middle until then: only what
// is drawn moves, so nothing under it is laid out again on the way. At the
// head it stays as the page scrolls under it, so another search is always in
// reach: three quarters of a rem from the top, counted from inside the page's
// padding. What scrolls under it is not seen round it: the page's colour is
// behind it, to the edges of the screen, and ends softly under it.
//
// Wide, it is placed by the page and not laid out in it, so that it can go
// from the middle to the far end of the head, and from one size to the other,
// without anything else being laid out again on the way. Both places are
// counted from the page's edges, its padding included.
const BAR_CLASS =
  "sticky -top-5 z-5 md:-top-7 motion-safe:transition-transform motion-safe:duration-400 motion-safe:ease-in-out search-wide:absolute search-wide:translate-none search-wide:motion-safe:transition-[top,right,width]";

const BAR_PLACES: Readonly<Record<FieldPlace, string>> = {
  Centered:
    "translate-y-[calc(50dvh-3.75rem)] md:translate-y-[calc(50dvh-4.25rem)] search-wide:top-[calc(50dvh-1.75rem)] search-wide:right-[calc(50%-18rem)] search-wide:w-144",
  Docked:
    "before:pointer-events-none before:absolute before:-inset-x-5 before:-top-3 before:-bottom-4 before:-z-1 before:bg-linear-to-b/srgb before:from-canvas before:from-78% before:to-transparent md:before:-inset-x-10 search-wide:top-8 search-wide:right-5 search-wide:w-100 search-wide:before:content-none md:search-wide:top-10 md:search-wide:right-10",
};

// NOTE: the field takes the focus as its page arrives, so a ring round it
// would be there on every visit. It is drawn for the keys alone (`keyboard`).
const FIELD_CLASS =
  "mx-auto flex h-14 max-w-164 items-center gap-3 rounded-[1.75rem] border border-field-line bg-field px-4.25 text-muted transition-[border-color] duration-150 focus-within:border-muted keyboard:focus-within:outline-2 keyboard:focus-within:outline-offset-2 keyboard:focus-within:outline-accent search-wide:max-w-none search-wide:motion-safe:transition-[border-color,height,padding,border-radius,font-size] search-wide:motion-safe:duration-[150ms,400ms,400ms,400ms,400ms] search-wide:motion-safe:ease-in-out";

/** At the head of a wide page the field is smaller and squarer, as the design draws it. */
const FIELD_PLACES: Readonly<Record<FieldPlace, string>> = {
  Centered: "",
  Docked: "search-wide:h-11 search-wide:rounded-xl search-wide:px-3.5 search-wide:text-15",
};

// NOTE: the field has a control of its own to empty it, so the browser's is
// not drawn.
const INPUT_CLASS =
  "h-full min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-ink outline-none placeholder:text-muted placeholder:opacity-100 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:hidden [&::-webkit-search-decoration]:appearance-none";

/** The control that empties the field: it answers a press over a finger's width, and shows a smaller disc. */
const clearView = (h: HtmlBuilder<Message>): Html =>
  Button.view(
    {
      onClick: Message.ClickedClearSearch(),
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.AriaLabel("Clear search"),
            h.Class(
              "-mr-3 grid size-11 flex-none cursor-pointer touch-manipulation place-items-center rounded-full text-ink focus-ring-inset-4",
            ),
          ],
          [
            h.span(
              [h.Class("grid size-5 place-items-center rounded-full bg-field-disc")],
              [closeIcon("size-3")],
            ),
          ],
        ),
    },
    h,
  );

/**
 * The field, with the control that empties it once there is something in
 * it. Escape empties it too. Its magnifier breathes for as long as the
 * catalog is being asked, as a destination's icon does while its page is on
 * its way: while the first answer is on its way nothing else on the page
 * says so.
 */
const fieldView = (
  fieldText: string,
  isListening: boolean,
  place: FieldPlace,
  h: HtmlBuilder<Message>,
): Html =>
  Input.view(
    {
      id: SEARCH_FIELD_ID,
      type: "search",
      value: fieldText,
      placeholder: "Artists, songs, albums, playlists",
      onInput: (value) => Message.UpdatedSearchField({ value }),
      toView: (attributes) =>
        h.search(
          [h.Class(clsx(BAR_CLASS, BAR_PLACES[place]))],
          [
            h.label([...attributes.label, h.Class("sr-only")], ["Search the catalog"]),
            h.div(
              [
                h.DataAttribute(SEARCH_FIELD_BOX_ATTRIBUTE, ""),
                ...(isListening ? [h.DataAttribute("listening", "")] : []),
                h.Class(clsx(FIELD_CLASS, FIELD_PLACES[place])),
              ],
              [
                searchIcon(clsx("size-5 shrink-0", { "motion-safe:animate-breathe": isListening })),
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
                  h.Class(INPUT_CLASS),
                ]),
                fieldText === "" ? h.empty : clearView(h),
              ],
            ),
          ],
        ),
    },
    h,
  );

// NOTE: the card is the night under the artist's portrait, which fills it,
// with their name in white over its foot, under the veil an album's head has.
const CARD_CLASS =
  "relative isolate grid min-h-41.5 min-w-0 flex-1 content-end overflow-hidden rounded-[inherit] bg-night p-5.5 text-on-night aspect-11/4 after:-z-1 search-wide:min-h-48.75";

/**
 * The artist found first, on a card of their own: their picture, their
 * name, and the way to their page. The picture is the one that goes there,
 * as a tile's does, and the card is marked as their tile is, so the focus is
 * given back to it. While their page is on its way the card says so as a
 * tile does: it is a sleeve, which moves a little aside, and its record
 * comes part of the way out past its far end and turns (`recordView`).
 * `isAlone` is whether no songs stand beside it on a wide page: it then
 * keeps to a width of its own and does not take the page's.
 */
const topResultView = (
  artist: ArtistSummary,
  state: TileState,
  isAlone: boolean,
  presence: Presence,
  h: HtmlBuilder<Message>,
): Html => {
  const maybePicture = Option.fromNullishOr(artist.picture);
  const flightStyle = pictureFlightStyle("Artist", artist.id, presence);
  const record = recordStateOf(state);

  return h.section(
    [h.Class(clsx("flex flex-col", PLACES.Top, { "search-wide:max-w-160": isAlone }))],
    [
      artworkFlightRules(Option.toArray(Option.fromNullishOr(flightStyle.viewTransitionName)), h),
      h.h2(
        [h.Class(clsx(SECTION_HEADING_CLASS, "sr-only search-wide:not-sr-only"))],
        ["Top result"],
      ),
      h.a(
        [
          h.Href(artistRouter({ artistId: artist.id })),
          h.AriaBusy(state === "Opening"),
          h.DataAttribute(TILE_ATTRIBUTES.Artist, artist.id),
          ...(state === "Opening" ? [h.DataAttribute("opening", "")] : []),
          h.Class(
            "relative isolate flex flex-1 touch-manipulation rounded-[1.0625rem] focus-ring search-wide:mt-3 search-wide:rounded-xl",
          ),
        ],
        [
          recordView(record, "Card", h),
          h.span(
            [
              h.DataAttribute("sleeve", ""),
              h.Class(clsx(CARD_CLASS, VEIL_CLASS, sleeveClass(record, "Card"))),
            ],
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
                    "max-w-[78%] text-4xl/[1.08] font-bold tracking-[-0.045em] text-balance wrap-anywhere search-wide:max-w-[68%] search-wide:text-[3.0625rem] search-wide:tracking-[-0.047em]",
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
                    "absolute right-4 bottom-4 hidden size-8.5 place-items-center rounded-full border border-on-night/32 bg-night/65 search-wide:grid",
                  ),
                ],
                [openIcon("size-4")],
              ),
              washView(state, "Card", h),
            ],
          ),
          state === "Failed" ? failureOverView("Card", h) : h.empty,
          state === "Failed" ? h.span([h.Class("sr-only")], [FAILED_WORDS]) : h.empty,
        ],
      ),
    ],
  );
};

// WHERE EACH THING FOUND STANDS

// Narrow, one thing under another: the artist, the albums, the songs, then
// the rest. The songs come before the albums in the document, where they are
// read beside the artist on a wide page, so their order on a narrow one is
// said. Wide, the artist stands beside the first songs, and everything else
// goes across the page.
const FOUND_CLASS =
  "flex flex-col gap-7 *:min-w-0 search-wide:grid search-wide:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] search-wide:gap-x-7 search-wide:gap-y-8";

const PLACES = {
  Top: "order-1 search-wide:order-none search-wide:col-[1]",
  Albums: "order-2 search-wide:order-none search-wide:col-span-full",
  SongsBesideArtist: "order-3 search-wide:order-none search-wide:col-[2]",
  AllSongs: "order-3 search-wide:order-none search-wide:col-span-full",
  MoreSongs: "order-4 search-wide:order-none search-wide:col-span-full",
  Artists: "order-5 search-wide:order-none search-wide:col-span-full",
  Playlists: "order-6 search-wide:order-none search-wide:col-span-full",
} as const;

/**
 * The songs found. Beside an artist's card there is room for a few, so the
 * first few are listed there and the rest further down, under a heading of
 * their own, in columns that go on sideways as top songs do. With no artist
 * to stand beside, the songs are one list in columns. `place` says where
 * each stands on the page.
 */
const SONGS_BESIDE_ARTIST: TrackSection = {
  id: "search-songs",
  title: "Songs",
  order: "Unranked",
  spread: "Single",
  place: PLACES.SongsBesideArtist,
};

const MORE_SONGS: TrackSection = {
  id: "search-more-songs",
  title: "More songs",
  order: "Unranked",
  spread: "Columns",
  place: PLACES.MoreSongs,
};

const ALL_SONGS: TrackSection = {
  id: "search-songs",
  title: "Songs",
  order: "Unranked",
  spread: "Columns",
  place: PLACES.AllSongs,
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

/**
 * What was found: the artist found first on a card, the songs, the albums,
 * and then the other artists and the playlists on shelves. Only the kinds
 * that found something are there. In the document the songs come before the
 * albums, which is how a wide page reads; a narrow one puts the albums
 * first (`PLACES`). The albums are a shelf as anywhere, laid out this page's
 * own way: three across (`ShelfLayout`).
 */
const foundView = (
  answer: SearchAnswer,
  context: TrackListContext,
  { albumState, artistState, playlistState }: TileStates,
  h: HtmlBuilder<Message>,
): Html => {
  const { albums, artists, playlists, tracks } = answer.results;
  const maybeTopArtist = Array.head(artists);
  const [firstSongs, moreSongs] = Array.splitAt(
    songSectionsView(tracks, Option.isSome(maybeTopArtist), context, h),
    1,
  );
  const place =
    (className: string) =>
    (shelf: Html): Html =>
      h.div([h.Class(className)], [shelf]);

  return h.div(
    [h.Class(FOUND_CLASS)],
    [
      ...Option.match(maybeTopArtist, {
        onNone: () => [],
        onSome: (artist) => [
          topResultView(
            artist,
            artistState(artist.id),
            Array.isReadonlyArrayEmpty(tracks),
            context.presence,
            h,
          ),
        ],
      }),
      ...firstSongs,
      ...Array.getSomes([
        Option.map(
          maybeShelfView(
            "search-albums",
            "Albums",
            "Square",
            Array.map(albums, albumTile(albumState, context.presence)),
            h,
            "AtHead",
            "ThreeAcross",
          ),
          place(PLACES.Albums),
        ),
      ]),
      ...moreSongs,
      ...Array.getSomes([
        Option.map(
          maybeShelfView(
            "search-artists",
            "Artists",
            "Round",
            Array.map(Array.drop(artists, 1), artistTile(artistState, context.presence)),
            h,
          ),
          place(PLACES.Artists),
        ),
        Option.map(
          maybeShelfView(
            "search-playlists",
            "Playlists",
            "Square",
            Array.map(playlists, playlistTile(playlistState, context.presence)),
            h,
          ),
          place(PLACES.Playlists),
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
  tileStates: TileStates,
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
          "mt-7 transition-opacity duration-150 motion-reduce:transition-none motion-safe:animate-search-results-come search-wide:mt-6",
          {
            "opacity-60": isOutOfDate,
          },
        ),
      ),
    ],
    [
      AsyncData.matchData(search, {
        onEmpty: () => h.empty,
        onFailure: (error) => failureView(TITLE, error, "Page", h),
        onData: (answer) =>
          hasResults(answer)
            ? foundView(answer, context, tileStates, h)
            : h.p(
                [
                  h.Class(
                    "text-center text-[0.875rem] text-pretty text-muted search-wide:mt-8 search-wide:text-start search-wide:text-[1rem]",
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
  tileStates: TileStates,
  h: HtmlBuilder<Message>,
): Html => {
  const place: FieldPlace = hasSearchAnswer(maybeSearchedTerm, search) ? "Docked" : "Centered";

  return h.div(
    [
      ...pageAttributes(PAGE_ID, context.presence, h, { container: "search" }),
      // NOTE: said in the document for whoever reads the page from outside it.
      h.DataAttribute("field", place === "Docked" ? "docked" : "centered"),
    ],
    [
      h.div(
        [],
        [
          introView(place, h),
          fieldView(
            Option.getOrElse(maybeFieldText, () => ""),
            Option.isSome(maybeSearchedTerm) && AsyncData.isPending(search),
            place,
            h,
          ),
          // NOTE: the place is the page's and not the results', which are
          // only there once the catalog has answered: it is there before it
          // has anything to say, so that what it says is heard as a change.
          h.p(
            [h.Role("status"), h.DataAttribute("search-outcome", ""), h.Class("sr-only")],
            [outcome(search)],
          ),
          Option.match(
            Option.filter(maybeSearchedTerm, () => place === "Docked"),
            {
              onNone: () => h.empty,
              onSome: (searchedTerm) => resultsView(search, searchedTerm, context, tileStates, h),
            },
          ),
        ],
      ),
    ],
  );
};
