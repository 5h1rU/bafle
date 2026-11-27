import type { ArtistSummary } from "@bafle/domain/Catalog/Artist";
import type { Track, TrackId } from "@bafle/domain/Catalog/Track";
import { Button } from "@foldkit/ui";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as DateTime from "effect/DateTime";
import * as Match from "effect/Match";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import { Message } from "../message.ts";
import type { TrackData } from "../model.ts";
import { isPlayable, type QueuePlace, type TrackStatus } from "../player/model.ts";
import { type AppRoute, homeRouter } from "../route.ts";
import { artworkView, coverView } from "../view/artwork.ts";
import { pillButtonView } from "../view/control.ts";
import {
  checkIcon,
  pauseIcon,
  playIcon,
  retryIcon,
  spinnerIcon,
} from "../view/icon.ts";
import { PAGE_IDS, PAGE_TITLE_CLASS, pageTitleIdOf } from "../view/layout.ts";
import { saidView } from "../view/feedback.ts";
import { ACTION_LOOKS, type ActionLook } from "../view/menu.ts";
import {
  type DetailKind,
  detailPageView,
  detailTitleOf,
  GONE,
  pageDataView,
} from "../view/page.ts";
import { BLOCK_CLASS } from "../view/placeholder.ts";
import { formatDuration } from "../view/time.ts";
import { explicitMarkerView } from "../view/trackList.ts";

// VIEW

const KIND: DetailKind = {
  pageId: PAGE_IDS.Track,
  name: "Song",
  notAvailable: "This song is not available",
  gone: GONE,
};

/** What a track's page is called: the track's title once the catalog has told it. */
export const titleOf = (track: TrackData): string =>
  detailTitleOf(KIND, track, (found) => found.title);

/** The cover beside the rest where the page has the room, above it where it has not. */
// NOTE: the room is the page's own, not the screen's (`@container` on what
// holds this): on a desktop's screen the queue opens beside the page and
// takes room from it, and a rule that went by the screen would lay the page
// out for a width it no longer has, the words in what the cover left.
const LAYOUT_CLASS =
  "grid max-w-5xl gap-6 @xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] @xl:gap-10 @[44rem]:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]";

const COVER_COLUMN_CLASS = "mx-auto w-full max-w-sm @xl:max-w-none";

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

/** What the page's control shows: what a press will do, and a spinner while a start is slow. */
const playControlFace = (status: TrackStatus): Readonly<{ icon: Html; words: string }> =>
  Match.value(status).pipe(
    Match.withReturnType<Readonly<{ icon: Html; words: string }>>(),
    Match.whenOr("Sounding", "Waiting", () => ({ icon: pauseIcon("size-5"), words: "Pause" })),
    Match.when("Starting", () => ({
      icon: spinnerIcon("size-5 animate-spin motion-reduce:animate-pulse"),
      words: "Starting…",
    })),
    Match.when("Failed", () => ({ icon: retryIcon("size-5"), words: "Try again" })),
    Match.whenOr("Elsewhere", "Chosen", "Paused", "Stopped", () => ({
      icon: playIcon("size-5"),
      words: "Play",
    })),
    Match.exhaustive,
  );

/**
 * What a track's page needs to know of the queue: whether its track can be
 * put in it, which is once something else is playing, and whether it has
 * just been, and where.
 */
export type Queueing = Readonly<{
  isOffered: boolean;
  maybeQueued: Option.Option<QueuePlace>;
}>;

/** What each of the two is called, as a row's menu calls it, and what it says once done. */
const QUEUE_LOOKS: Readonly<Record<QueuePlace, ActionLook & Readonly<{ done: string }>>> = {
  Next: { ...ACTION_LOOKS.PlayNext, done: "Plays next" },
  Last: { ...ACTION_LOOKS.AddToQueue, done: "Added to the queue" },
};

/**
 * One of the page's two ways to put its track in the queue: right after the
 * current track, or after all the rest. It is what a row's menu offers for
 * its track. Pressed, it shows for a moment that it was done.
 */
const queueControlView = (
  track: Track,
  place: QueuePlace,
  maybeQueued: Option.Option<QueuePlace>,
  h: HtmlBuilder<Message>,
): Html => {
  const look = QUEUE_LOOKS[place];
  const isDone = Option.contains(maybeQueued, place);

  return pillButtonView(
    {
      look: "Outlined",
      size: "Tall",
      content: [
        isDone ? checkIcon("size-5 text-accent") : look.icon("size-5 text-muted"),
        isDone ? look.done : look.label,
      ],
      onClick: Message.ClickedQueueTrack({ trackId: track.id, place }),
      attributes: [h.AriaLabel(`${look.label}: ${track.title}`)],
    },
    h,
  );
};

/**
 * The page's own control for its track. While the player holds the track it
 * is that track's control: it shows what the player is doing and a press
 * stops the sound or brings it back. Beside it, once something else is
 * playing, are the two ways to put the track in the queue. A track with
 * nothing to play has no control, and the page says why.
 */
const playControlView = (
  track: Track,
  status: TrackStatus,
  queueing: Queueing,
  h: HtmlBuilder<Message>,
): Html => {
  if (!isPlayable(track)) {
    return h.p([h.Class("mt-6 text-sm text-muted")], ["This song has no audio to play."]);
  }
  const face = playControlFace(status);

  return h.div(
    [h.Class("mt-6 flex flex-wrap items-center gap-x-4 gap-y-2")],
    [
      pillButtonView(
        {
          look: "Filled",
          size: "Tall",
          content: [face.icon, face.words],
          onClick: Message.ClickedPlayTrack({ trackId: track.id, from: "Track" }),
          attributes: [h.AriaLabel(`${face.words}: ${track.title}`), h.AriaBusy(status === "Starting")],
        },
        h,
      ),
      ...(queueing.isOffered && status === "Elsewhere"
        ? [
            queueControlView(track, "Next", queueing.maybeQueued, h),
            queueControlView(track, "Last", queueing.maybeQueued, h),
          ]
        : []),
      status === "Failed"
        ? h.p([h.Class("text-sm text-muted")], ["This song could not be played."])
        : h.empty,
      // Said to assistive technology: the control's own words change, and a
      // change of name is not always read out.
      saidView(
        Option.match(queueing.maybeQueued, {
          onNone: () => "",
          onSome: (place) => `${QUEUE_LOOKS[place].done}.`,
        }),
        h,
      ),
    ],
  );
};

/** Who is credited on the track, and what the catalog knows of it. */
const creditsView = (track: Track, h: HtmlBuilder<Message>): ReadonlyArray<Html> => [
  h.ul(
    [h.Role("list"), h.AriaLabel("Artists"), h.Class("mt-6 flex flex-col gap-3")],
    Array.map(track.artists, (artist) => artistView(artist, h)),
  ),
  h.dl(
    [h.Class("mt-8 flex flex-col gap-2 text-sm")],
    Array.map(factsOf(track, h), (fact) => factView(fact, h)),
  ),
];

const foundView = (
  track: Track,
  status: TrackStatus,
  queueing: Queueing,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class(LAYOUT_CLASS)],
    [
      h.div(
        [h.Class(COVER_COLUMN_CLASS)],
        [
          coverView(
            track.id,
            Option.fromNullishOr(track.album.cover),
            status !== "Elsewhere",
            h,
          ),
        ],
      ),
      h.div(
        [h.Class("min-w-0")],
        [
          h.h1(
            [h.Id(pageTitleIdOf(KIND.pageId)), h.Class(PAGE_TITLE_CLASS)],
            [track.title, track.explicit ? explicitMarkerView(h) : h.empty],
          ),
          h.p([h.Class("mt-1 text-lg text-muted")], [track.album.title]),
          playControlView(track, status, queueing, h),
          ...creditsView(track, h),
        ],
      ),
    ],
  );

/**
 * A track's page goes by its own width, not the screen's (`@container`):
 * the queue opens beside it.
 */
export const view = (
  trackId: TrackId,
  track: TrackData,
  status: TrackStatus,
  queueing: Queueing,
  h: HtmlBuilder<Message>,
): Html =>
  detailPageView(
    { kind: KIND, key: trackId, presence: "OnScreen", data: track, bodyClass: "@container" },
    () => placeholderView(h),
    (found) => foundView(found, status, queueing, h),
    h,
  );

// EXPANDED PLAYER

// NOTE: the look of the handle is the player's (`player-grabber` in
// player/player.css), which says where on the sheet it stands.
const COLLAPSE_CLASS = "player-grabber";

/** The handle a sheet is closed by: a short bar at the very top of it. */
const grabberView = (h: HtmlBuilder<Message>): Html =>
  h.span([h.AriaHidden(true), h.Class("player-grabber-line")]);

/**
 * The way out of the expanded player: it shrinks back into the island over
 * the page it was opened from. It is the handle at the top of the sheet,
 * which says that the sheet is swiped down to close it, and is itself a
 * control for whoever does not swipe. It goes back through the browser's
 * history when the app knows of a page behind, so that page is found as it
 * was left and the history gains no entry, and is a plain link to Home when
 * the player's page was reached directly.
 */
export const collapseControlView = (
  maybeWayBack: Option.Option<AppRoute>,
  h: HtmlBuilder<Message>,
): Html =>
  Option.match(maybeWayBack, {
    onNone: () =>
      h.a(
        [h.Href(homeRouter()), h.AriaLabel("Close the player"), h.Class(COLLAPSE_CLASS)],
        [grabberView(h)],
      ),
    onSome: () =>
      Button.view(
        {
          onClick: Message.ClickedBack(),
          toView: (attributes) =>
            h.button(
              [...attributes.button, h.AriaLabel("Close the player"), h.Class(COLLAPSE_CLASS)],
              [grabberView(h)],
            ),
        },
        h,
      ),
  });

/** Lines the size of the detail to come: an album, two artists, three facts. */
const detailPlaceholderView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.AriaHidden(true)],
    [
      h.div([h.Class(clsx(BLOCK_CLASS, "h-5 w-2/5 rounded"))]),
      h.div([h.Class(clsx(BLOCK_CLASS, "mt-6 h-10 w-3/5 rounded-full"))]),
      h.div([h.Class(clsx(BLOCK_CLASS, "mt-8 h-4 w-40 rounded"))]),
      h.div([h.Class(clsx(BLOCK_CLASS, "mt-3 h-4 w-52 rounded"))]),
    ],
  );

/**
 * What the catalog knows of the track in the player, under the player's own
 * controls. The player never waits for it: it shows the track from what the
 * queue holds, and this part fills in when the catalog answers, fails in its
 * own place with a way to try again, or says the catalog has no more to say.
 */
export const expandedDetailView = (track: TrackData, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.AriaBusy(AsyncData.isPending(track)), h.DataAttribute("detail", track._tag)],
    [
      pageDataView(
        track,
        "The song's details",
        () => detailPlaceholderView(h),
        Option.match({
          onNone: () =>
            h.p([h.Class("text-sm text-muted")], ["The catalog has nothing more about this song."]),
          onSome: (found) =>
            h.div(
              [],
              [
                h.p([h.Class("text-lg text-muted")], [found.album.title]),
                ...creditsView(found, h),
              ],
            ),
        }),
        h,
      ),
    ],
  );
