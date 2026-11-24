import { Input } from "@foldkit/ui";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import { SEARCH_FIELD_ID } from "../command.ts";
import { Message } from "../message.ts";
import type { SearchAnswer, SearchData } from "../model.ts";
import { searchIcon } from "../view/icon.ts";
import {
  PAGE_SECTIONS_CLASS,
  QUIET_LINE_CLASS,
  pageAttributes,
  PAGE_IDS,
  pageTitleView,
} from "../view/layout.ts";
import { pageDataView } from "../view/pageData.ts";
import { headingPlaceholderView, trackListPlaceholderView } from "../view/placeholder.ts";
import {
  albumTile,
  artistTile,
  maybeShelfView,
  playlistTile,
  type TilesOpening,
} from "../view/shelf.ts";
import { type TrackListContext, maybeTrackSectionView } from "../view/trackList.ts";

// VIEW

const PAGE_ID = PAGE_IDS.Search;
const TITLE = "Search";

const fieldView = (fieldText: string, h: HtmlBuilder<Message>): Html =>
  Input.view(
    {
      id: SEARCH_FIELD_ID,
      type: "search",
      value: fieldText,
      placeholder: "Artists, songs, albums, playlists",
      onInput: (value) => Message.UpdatedSearchField({ value }),
      toView: (attributes) =>
        h.search(
          [h.Class("relative mt-6 max-w-xl")],
          [
            h.label([...attributes.label, h.Class("sr-only")], ["Search the catalog"]),
            searchIcon(
              "pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted",
            ),
            h.input([
              ...attributes.input,
              h.Autocomplete("off"),
              h.Spellcheck(false),
              // A phone keyboard would capitalize and "correct" artist names.
              h.Autocapitalize("off"),
              h.Autocorrect("off"),
              h.EnterKeyHint("search"),
              h.Class(
                "w-full rounded-full border border-line bg-panel py-3 pr-5 pl-12 text-base placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              ),
            ]),
          ],
        ),
    },
    h,
  );

const promptView = (h: HtmlBuilder<Message>): Html =>
  h.p([h.Class(QUIET_LINE_CLASS)], ["Type to search for artists, albums, songs and playlists."]);

/** The first results on their way: a heading-sized block over rows, never an empty area. */
const placeholderView = (h: HtmlBuilder<Message>): Html =>
  h.div([h.Class("mt-8 max-w-3xl")], [headingPlaceholderView(h), trackListPlaceholderView(h)]);

/** What was found, a group per kind, and only the kinds that found something. */
const answerView = (
  answer: SearchAnswer,
  context: TrackListContext,
  { isAlbumOpening, isArtistOpening, isPlaylistOpening }: TilesOpening,
  h: HtmlBuilder<Message>,
): Html =>
  Array.match(
    Array.getSomes([
      maybeShelfView(
        "search-artists",
        "Artists",
        "Round",
        Array.map(answer.results.artists, artistTile(isArtistOpening, context.presence)),
        h,
      ),
      maybeShelfView(
        "search-albums",
        "Albums",
        "Square",
        Array.map(answer.results.albums, albumTile(isAlbumOpening, context.presence)),
        h,
      ),
      maybeTrackSectionView(
        "search-songs",
        "Songs",
        "Unranked",
        answer.results.tracks,
        context,
        h,
      ),
      maybeShelfView(
        "search-playlists",
        "Playlists",
        "Square",
        Array.map(answer.results.playlists, playlistTile(isPlaylistOpening, context.presence)),
        h,
      ),
    ]),
    {
      // The term the answer is for: while a newer term loads, the field already says something else.
      onEmpty: () => h.p([h.Class(QUIET_LINE_CLASS)], [`No results for “${answer.term}”`]),
      onNonEmpty: (groups) => h.div([h.Class(PAGE_SECTIONS_CLASS)], groups),
    },
  );

const hasResults = (answer: SearchAnswer): boolean => {
  const groups: ReadonlyArray<ReadonlyArray<unknown>> = [
    answer.results.artists,
    answer.results.albums,
    answer.results.tracks,
    answer.results.playlists,
  ];
  return Array.some(groups, Array.isReadonlyArrayNonEmpty);
};

/** Said to assistive technology when an answer arrives: nothing else on the page tells it one did. */
const outcome = (search: SearchData): string =>
  Option.match(AsyncData.getData(search), {
    onNone: () => "",
    onSome: (answer) =>
      hasResults(answer)
        ? `Results for “${answer.term}”`
        : `Nothing found for “${answer.term}”`,
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
        clsx("transition-opacity duration-150 motion-reduce:transition-none", {
          "opacity-60": isOutOfDate,
        }),
      ),
    ],
    [
      h.p([h.Role("status"), h.Class("sr-only")], [outcome(search)]),
      pageDataView(
        search,
        TITLE,
        () => placeholderView(h),
        (answer) => answerView(answer, context, opening, h),
        h,
      ),
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
  h.div(pageAttributes(PAGE_ID, context.presence, h), [
    pageTitleView(PAGE_ID, TITLE, h),
    fieldView(
      Option.getOrElse(maybeFieldText, () => ""),
      h,
    ),
    Option.match(maybeSearchedTerm, {
      onNone: () => promptView(h),
      onSome: (searchedTerm) => resultsView(search, searchedTerm, context, opening, h),
    }),
  ]);
