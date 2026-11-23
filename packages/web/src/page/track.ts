import type { ArtistSummary } from "@bafle/domain/Catalog/Artist";
import type { Track, TrackId } from "@bafle/domain/Catalog/Track";
import { Button } from "@foldkit/ui";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as DateTime from "effect/DateTime";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import { Message } from "../message.ts";
import type { TrackData } from "../model.ts";
import { type AppRoute, homeRouter } from "../route.ts";
import { artworkView, coverView } from "../view/artwork.ts";
import { backIcon } from "../view/icon.ts";
import {
  PAGE_IDS,
  PAGE_TITLE_CLASS,
  pageAttributes,
  pageTitleIdOf,
  pageTitleView,
} from "../view/layout.ts";
import { pageDataView } from "../view/pageData.ts";
import { BLOCK_CLASS } from "../view/placeholder.ts";
import { explicitMarkerView, formatDuration } from "../view/trackList.ts";

// VIEW

const PAGE_ID = PAGE_IDS.Track;
const TITLE = "Song";
const NOT_AVAILABLE = "This song is not available";

/** What a track's page is called: the track's title once the catalog has told it. */
export const titleOf = (track: TrackData): string =>
  Option.match(AsyncData.getData(track), {
    onNone: () => TITLE,
    onSome: Option.match({ onNone: () => NOT_AVAILABLE, onSome: (found) => found.title }),
  });

const WAY_BACK_CLASS =
  "-ml-2 inline-flex h-10 cursor-pointer items-center gap-1 rounded-full pr-4 pl-2 text-sm font-semibold text-accent hover:bg-accent-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-accent-wash";

/**
 * The way out of the page. When the app knows the page the listener came
 * from, it goes back to it through the browser's history, so that page is
 * found as it was left and the history gains no entry. On a direct link
 * there is nothing behind, and it is a plain link to Home.
 */
const wayBackView = (maybeWayBack: Option.Option<AppRoute>, h: HtmlBuilder<Message>): Html =>
  Option.match(maybeWayBack, {
    onNone: () =>
      h.a([h.Href(homeRouter()), h.Class(WAY_BACK_CLASS)], [backIcon("size-5"), "Home"]),
    onSome: () =>
      Button.view(
        {
          onClick: Message.ClickedBack(),
          toView: (attributes) =>
            h.button(
              [...attributes.button, h.Class(WAY_BACK_CLASS)],
              [backIcon("size-5"), "Back"],
            ),
        },
        h,
      ),
  });

/** The cover beside the rest on a wide screen, above it on a narrow one. */
const LAYOUT_CLASS =
  "grid max-w-5xl gap-6 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-10 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]";

const COVER_COLUMN_CLASS = "mx-auto w-full max-w-sm md:max-w-none";

/** The page before the catalog has answered: a block for the cover, lines for the title and the facts. */
const placeholderView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.AriaHidden(true), h.Class(LAYOUT_CLASS)],
    [
      h.div(
        [h.Class(COVER_COLUMN_CLASS)],
        [h.div([h.Class(clsx(BLOCK_CLASS, "aspect-square rounded-2xl"))])],
      ),
      h.div(
        [],
        [
          h.div([h.Class(clsx(BLOCK_CLASS, "h-9 w-4/5 rounded"))]),
          h.div([h.Class(clsx(BLOCK_CLASS, "mt-3 h-6 w-2/5 rounded"))]),
          h.div(
            [h.Class("mt-6 flex items-center gap-3")],
            [
              h.div([h.Class(clsx(BLOCK_CLASS, "size-10 rounded-full"))]),
              h.div([h.Class(clsx(BLOCK_CLASS, "h-4 w-32 rounded"))]),
            ],
          ),
          h.div([h.Class(clsx(BLOCK_CLASS, "mt-8 h-4 w-40 rounded"))]),
          h.div([h.Class(clsx(BLOCK_CLASS, "mt-3 h-4 w-52 rounded"))]),
          h.div([h.Class(clsx(BLOCK_CLASS, "mt-3 h-4 w-36 rounded"))]),
        ],
      ),
    ],
  );

const artistView = (artist: ArtistSummary, h: HtmlBuilder<Message>): Html =>
  h.keyed("li")(
    artist.id,
    [h.Class("flex items-center gap-3")],
    [
      h.div(
        [h.Class("w-10 shrink-0")],
        [artworkView(Option.fromNullishOr(artist.picture), "Round", "small", h)],
      ),
      h.span([h.Class("min-w-0 truncate font-medium")], [artist.name]),
    ],
  );

/** One thing the catalog knows about a track, under the word that says what it is. */
type Fact = Readonly<{ term: string; detail: Html | string }>;

/** A release date as people write it: `March 12, 2001`. Nothing for a date the catalog garbled. */
const releaseDay = (
  releaseDate: string,
  h: HtmlBuilder<Message>,
): Option.Option<Html> =>
  pipe(
    DateTime.make(releaseDate),
    Option.map(DateTime.formatUtc({ locale: "en-US", dateStyle: "long" })),
    Option.map((written) => h.time([h.Datetime(releaseDate)], [written])),
  );

/** Only what the catalog knows: a fact it lacks is left out, not shown as a blank. */
const factsOf = (track: Track, h: HtmlBuilder<Message>): ReadonlyArray<Fact> =>
  Array.getSomes([
    Option.some<Fact>({ term: "Length", detail: formatDuration(track.durationSeconds) }),
    pipe(
      Option.fromNullishOr(track.releaseDate),
      Option.flatMap((releaseDate) => releaseDay(releaseDate, h)),
      Option.map((day): Fact => ({ term: "Released", detail: day })),
    ),
    pipe(
      Option.fromNullishOr(track.trackNumber),
      Option.map((trackNumber): Fact => ({
        term: "On the album",
        detail: `Track ${trackNumber}`,
      })),
    ),
  ]);

const factView = (fact: Fact, h: HtmlBuilder<Message>): Html =>
  h.keyed("div")(
    fact.term,
    [h.Class("flex gap-4")],
    [
      h.dt([h.Class("w-28 shrink-0 text-muted")], [fact.term]),
      h.dd([h.Class("tabular-nums")], [fact.detail]),
    ],
  );

const foundView = (track: Track, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(LAYOUT_CLASS)],
    [
      h.div(
        [h.Class(COVER_COLUMN_CLASS)],
        [coverView(track.id, Option.fromNullishOr(track.album.cover), h)],
      ),
      h.div(
        [h.Class("min-w-0")],
        [
          h.h1(
            [h.Id(pageTitleIdOf(PAGE_ID)), h.Class(PAGE_TITLE_CLASS)],
            [track.title, track.explicit ? explicitMarkerView(h) : h.empty],
          ),
          h.p([h.Class("mt-1 text-lg text-muted")], [track.album.title]),
          h.ul(
            [h.Role("list"), h.AriaLabel("Artists"), h.Class("mt-6 flex flex-col gap-3")],
            Array.map(track.artists, (artist) => artistView(artist, h)),
          ),
          h.dl(
            [h.Class("mt-8 flex flex-col gap-2 text-sm")],
            Array.map(factsOf(track, h), (fact) => factView(fact, h)),
          ),
        ],
      ),
    ],
  );

/**
 * The catalog has no such track. That will not change, so there is nothing
 * to try again: the page says so, under its way back.
 */
const notAvailableView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("max-w-md")],
    [
      pageTitleView(PAGE_ID, NOT_AVAILABLE, h),
      h.p(
        [h.Class("mt-4 text-muted")],
        ["The catalog no longer has it, or the link to it is wrong."],
      ),
    ],
  );

/**
 * The page's title while there is no track to take it from. Loading, the
 * placeholders stand for it on screen and it is only said; after a failure
 * it heads the message.
 */
const untitledView = (track: TrackData, h: HtmlBuilder<Message>): Html =>
  AsyncData.matchData(track, {
    onEmpty: () => h.h1([h.Id(pageTitleIdOf(PAGE_ID)), h.Class("sr-only")], [TITLE]),
    onFailure: () => pageTitleView(PAGE_ID, TITLE, h),
    onData: () => h.empty,
  });

/**
 * The root is keyed by the track: another track is another page, which
 * starts at its top with its own pictures.
 */
export const view = (
  trackId: TrackId,
  track: TrackData,
  maybeWayBack: Option.Option<AppRoute>,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed("div")(trackId, pageAttributes(PAGE_ID, "OnScreen", h), [
    wayBackView(maybeWayBack, h),
    h.div(
      [h.AriaBusy(AsyncData.isPending(track)), h.Class("mt-4")],
      [
        untitledView(track, h),
        pageDataView(
          track,
          TITLE,
          () => placeholderView(h),
          Option.match({
            onNone: () => notAvailableView(h),
            onSome: (found) => foundView(found, h),
          }),
          h,
        ),
      ],
    ),
  ]);
