import type { TrackSummary } from "@bafle/domain/Catalog/Track";
import { Button, type Menu, Slider } from "@foldkit/ui";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { Submodel } from "foldkit";
import { type ChildAttribute, childAttributes, type Html, type HtmlBuilder } from "foldkit/html";
import type { Screen } from "../screen.ts";
import {
  albumIcon,
  detailsIcon,
  moreIcon,
  nextIcon,
  noteIcon,
  pauseIcon,
  playIcon,
  previousIcon,
  retryIcon,
  spinnerIcon,
} from "../view/icon.ts";
import { coverTransitionName, artworkFlightRules } from "../view/artwork.ts";
import { MENU_CLASS, MENU_ITEM_CLASS } from "../view/trackList.ts";
import { formatDuration } from "../view/time.ts";
import { islandFigureView } from "./islandFigure.ts";
import { Message } from "./message.ts";
import {
  hasLater,
  isShowingActivity,
  isUnderWay,
  type Model,
  Playback,
  Seek,
  type Session,
  shownPositionSeconds,
  type TitleMarquee,
  wantsToSound,
} from "./model.ts";
import {
  DrawIslandFigure,
  FollowIslandPress,
  ISLAND_TAIL_ATTRIBUTE,
  MeasureTitle,
  TITLE_LINE_ATTRIBUTE,
  TITLE_WORDS_ATTRIBUTE,
} from "./mount.ts";
import { TITLE_PIXELS_PER_SECOND } from "./command.ts";
import { MoreMenu, type PlayerAction } from "./moreMenu.ts";
import {
  islandQueueButtonView,
  queueButtonView,
  queueColumnView as queueColumnOf,
  queuePanelView,
} from "./queue.ts";
import "./player.css";

// VIEW

/**
 * What the shell lends the island: its own way to the expanded player, a
 * link like any other, around the island's words for the track.
 */
export type ViewInputs = Readonly<{
  toTrackPageLink: (track: TrackSummary, content: ReadonlyArray<Html>) => Html;
  /**
   * Whether the island is drawn under the expanded player's sheet, which is
   * on its way off the screen. It is then a picture of the island to come:
   * out of reach, and with no name in a view transition, since the player on
   * the sheet is the one that carries the names.
   */
  isUnderSheet: boolean;
  /**
   * What the screen is. On a desktop's the island does not expand: its words
   * are no link, and it has controls of its own for what the expanded player
   * would have held, the queue, the menu and Previous.
   */
  screen: Screen;
  /** Whether a page chosen from the island's menu, the album's or the song's, is on its way. */
  isPageOpening: boolean;
}>;

/**
 * What the shell lends the expanded player: the id its title goes by on the
 * page, the way back to the island, and what the catalog knows of the track.
 * The player draws the track from what its queue holds and waits for none of
 * these.
 */
export type ExpandedViewInputs = Readonly<{
  titleId: string;
  toCollapseControl: () => Html;
  toDetail: (track: TrackSummary) => Html;
  /** Whether the album's page, chosen from the player's menu, is on its way. */
  isAlbumOpening: boolean;
  /**
   * The expanded player is drawn on a sheet, which the listener can swipe
   * away. The sheet is the shell's (`sheet/`): these are what it asks the
   * player to put on the piece that travels and on the one piece inside it,
   * and whether all of the sheet is on screen. The player knows no more of
   * it than that.
   */
  sheetAttributes: ReadonlyArray<ChildAttribute>;
  contentAttributes: ReadonlyArray<ChildAttribute>;
  isSheetWhole: boolean;
}>;

export const PLAYER_ID = "player";

const CONTROL_CLASS =
  "relative inline-flex shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** A glyph arrives by growing into place: small, quick, and still under reduced motion. */
const GLYPH_CLASS =
  "flex transition-[opacity,scale] duration-150 ease-out starting:scale-50 starting:opacity-0 motion-reduce:transition-none";

/**
 * The pause glyph, fainter while it is only a wish. Each glyph is an element
 * made by its own view function, so changing from one to another puts a new
 * element in the document and its arrival is seen.
 */
const pauseGlyphView = (isConfirmed: boolean, sizeClass: string, h: HtmlBuilder<Message>): Html =>
  h.span(
    [
      h.DataAttribute("glyph", isConfirmed ? "pause" : "pause-wished"),
      h.Class(clsx(GLYPH_CLASS, sizeClass, { "opacity-50": !isConfirmed })),
    ],
    [pauseIcon("size-full")],
  );

const playGlyphView = (sizeClass: string, h: HtmlBuilder<Message>): Html =>
  h.span([h.DataAttribute("glyph", "play"), h.Class(clsx(GLYPH_CLASS, sizeClass))], [playIcon("size-full")]);

const retryGlyphView = (sizeClass: string, h: HtmlBuilder<Message>): Html =>
  h.span([h.DataAttribute("glyph", "retry"), h.Class(clsx(GLYPH_CLASS, sizeClass))], [retryIcon("size-full")]);

/** Turning: the engine was asked to sound and has not answered for long enough to say so. */
const startingMarkView = (h: HtmlBuilder<Message>): Html =>
  h.span(
    [h.DataAttribute("activity", "starting"), h.Class("absolute inset-0")],
    [spinnerIcon("size-full animate-spin motion-reduce:animate-pulse")],
  );

/** Breathing, not turning: it was sounding, and is waiting for more of the track. */
const waitingMarkView = (h: HtmlBuilder<Message>): Html =>
  h.span([
    h.AriaHidden(true),
    h.DataAttribute("activity", "waiting"),
    h.Class(
      "absolute inset-0 animate-ping rounded-full border-2 border-accent motion-reduce:animate-pulse",
    ),
  ]);

const activityMarkView = (playback: Playback, h: HtmlBuilder<Message>): Html => {
  if (isShowingActivity(playback)) {
    return startingMarkView(h);
  }
  return Playback.guards.Waiting(playback) ? waitingMarkView(h) : h.empty;
};

/** What a press of the main control asks for, in the words that name the control. */
const mainAction = (playback: Playback): Readonly<{ name: string; message: Message }> => {
  if (wantsToSound(playback)) {
    return { name: "Pause", message: Message.ClickedPause() };
  }
  return Playback.guards.Failed(playback)
    ? { name: "Try again", message: Message.ClickedTryAgain() }
    : { name: "Play", message: Message.ClickedPlay() };
};

/** Solid only on the engine's word: a wish to sound is drawn fainter than sound. */
const mainGlyphView = (playback: Playback, sizeClass: string, h: HtmlBuilder<Message>): Html => {
  if (wantsToSound(playback)) {
    return pauseGlyphView(isUnderWay(playback), sizeClass, h);
  }
  return Playback.guards.Failed(playback) ? retryGlyphView(sizeClass, h) : playGlyphView(sizeClass, h);
};

/**
 * The main control's colours, the size of its glyph, and the ring it wears
 * when the system stopped the sound. It is one control in the island's two
 * sizes, and has the one colour in both.
 */
type MainControlLook = Readonly<{ disc: string; glyph: string; stopped: string }>;

// NOTE: on the sheet the control is 84 across and its glyph half of that.
// `player-main` is what presses it in under a finger (player.css).
const ON_SHEET: MainControlLook = {
  disc: "player-main bg-island-control text-on-island-control hover:brightness-110",
  glyph: "size-[2.625rem]",
  stopped: "ring-2 ring-island-light ring-offset-2 ring-offset-canvas",
};

// NOTE: on the island the ring has to fit in the rim of island around the
// control, which is three pixels wide: one of gap and two of ring.
const ON_ISLAND: MainControlLook = {
  disc: "bg-island-control text-on-island-control hover:brightness-110",
  glyph: "size-6",
  stopped: "ring-2 ring-island-light ring-offset-1 ring-offset-island",
};

/**
 * The one control that starts and stops the sound. It shows what a press
 * will do, and around that, what is happening: nothing for sound, a turning
 * mark for a slow start, a breathing one for a stall, a ring when the system
 * stopped the sound and a press is what brings it back.
 */
const mainControlView = (
  session: Session,
  sizeClass: string,
  look: MainControlLook,
  h: HtmlBuilder<Message>,
): Html => {
  const { playback, current } = session;
  const action = mainAction(playback);

  return Button.view(
    {
      onClick: action.message,
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.AriaLabel(`${action.name}: ${current.title}`),
            h.AriaBusy(isShowingActivity(playback)),
            h.DataAttribute("playback", playback._tag),
            h.Class(
              clsx(CONTROL_CLASS, sizeClass, look.disc, {
                [look.stopped]: Playback.guards.Stopped(playback),
              }),
            ),
          ],
          [mainGlyphView(playback, look.glyph, h), activityMarkView(playback, h)],
        ),
    },
    h,
  );
};

const stepControlView = (
  label: string,
  message: Message,
  isEnabled: boolean,
  icon: Html,
  lookClass: string,
  h: HtmlBuilder<Message>,
): Html =>
  Button.view(
    {
      onClick: message,
      isDisabled: !isEnabled,
      toView: (attributes) =>
        h.button(
          [
            ...attributes.button,
            h.AriaLabel(label),
            h.Class(
              clsx(CONTROL_CLASS, lookClass, {
                "cursor-default opacity-40 hover:bg-transparent active:bg-transparent": !isEnabled,
              }),
            ),
          ],
          [icon],
        ),
    },
    h,
  );

/** Where Previous leads: the track before, or the start of this one when it is the first. */
const previousLabel = (session: Session): string =>
  Option.match(Array.last(session.earlier), {
    onNone: () => `Back to the start: ${session.current.title}`,
    onSome: (track) => `Previous track: ${track.title}`,
  });

const nextLabel = (session: Session): string =>
  Option.match(Array.head(session.later), {
    onNone: () => "Next track",
    onSome: (track) => `Next track: ${track.title}`,
  });

/**
 * The cover the row handed over. The picture is the rendition the row had
 * already drawn, so it is there at once. A track of its own element: another
 * track's cover is another picture, not this one with its source changed.
 */
const coverView = (
  track: TrackSummary,
  sizeClass: string,
  rendition: "small" | "large",
  h: HtmlBuilder<Message>,
  isNamed = true,
): Html =>
  h.keyed("div")(
    track.id,
    [
      h.DataAttribute("cover", ""),
      h.Class(clsx(sizeClass, "catalog-art relative shrink-0 overflow-hidden bg-tile")),
      ...(isNamed ? [h.DataAttribute("flight", coverTransitionName(track.id))] : []),
      h.Style({
        viewTransitionName: isNamed ? coverTransitionName(track.id) : "none",
        viewTransitionClass: "track-cover island-cover",
      }),
    ],
    Option.match(Option.fromNullishOr(track.album.cover), {
      onNone: () => [
        h.div(
          [h.Class("flex size-full items-center justify-center text-muted")],
          [noteIcon("size-2/5")],
        ),
      ],
      // NOTE: the small rendition is the one the row and the island have
      // already drawn, so it is there at once; the large one is drawn over
      // it when it arrives, and the cover is never an empty box on the way.
      onSome: (cover) => [
        h.img([
          h.Decoding("sync"),
          h.Src(cover.small),
          h.Alt(""),
          h.Class("absolute inset-0 size-full object-cover"),
        ]),
        ...(rendition === "large"
          ? [
              h.img([
                h.Decoding("async"),
                h.Src(cover.large),
                h.Alt(""),
                h.Class("absolute inset-0 size-full object-cover"),
              ]),
            ]
          : []),
      ],
    }),
  );

/**
 * The island's words for the two states a control alone cannot explain, cut
 * to what a capsule has room for. The whole sentence is said to assistive
 * technology, and stands in the expanded player.
 */
const maybeShortNotice = (playback: Playback): Option.Option<string> =>
  Playback.matchOrElse<Option.Option<string>>(
    playback,
    {
      Stopped: ({ cause }) =>
        Option.some(cause === "Refused" ? "Press play to start" : "Stopped. Press play"),
      Failed: () => Option.some("Could not be played"),
    },
    () => Option.none(),
  );

/**
 * Where the title's line is, and how it gets there. Standing, it is where it
 * begins, at once. Travelling, it goes one pass's way at the title's speed:
 * the transition is as long as the Command that says when the pass is over.
 */
const titleLineStyle = (title: TitleMarquee): Record<string, string> =>
  Option.match(title.phase === "Standing" ? Option.none() : title.maybeTravelPixels, {
    onNone: () => ({ transform: "translateX(0)", transition: "none" }),
    onSome: (travelPixels) => ({
      transform: `translateX(${-travelPixels}px)`,
      transition: `transform ${Math.round((travelPixels / TITLE_PIXELS_PER_SECOND) * 1000)}ms linear`,
    }),
  });

/**
 * The island's title. One that fits is just its words. One that does not
 * waits, then travels across its place once, its copy following it in, until
 * the copy stands where the words began; then it waits again. The words that
 * reach an end of the place fade there.
 *
 * Whether it fits is a matter of pixels, known only in the document: the
 * Mount `MeasureTitle` tells the Model, and from there the waits and the
 * passes are the Model's (`title`), kept in time by Commands.
 */
const titleView = (trackTitle: string, title: TitleMarquee, h: HtmlBuilder<Message>): Html => {
  const isOverflowing = Option.isSome(title.maybeTravelPixels);

  return h.div(
    [
      h.DataAttribute("title", title.phase),
      ...(isOverflowing ? [h.DataAttribute("overflowing", "")] : []),
      h.Class("island-title text-[0.9375rem] leading-tight font-bold"),
      h.OnMount(MeasureTitle()),
    ],
    [
      h.div(
        [
          h.DataAttribute(TITLE_LINE_ATTRIBUTE, ""),
          h.Class("island-title-line"),
          h.Style(titleLineStyle(title)),
        ],
        [
          h.span([h.DataAttribute(TITLE_WORDS_ATTRIBUTE, "")], [trackTitle]),
          ...(isOverflowing ? [h.span([h.AriaHidden(true)], [trackTitle])] : []),
        ],
      ),
    ],
  );
};

/**
 * The words arrive with a short fade when the track changes; the island
 * itself stays where it is. Under the title stands the artist, or what
 * happened to the sound when that needs saying.
 */
const trackWordsView = (
  session: Session,
  title: TitleMarquee,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => {
  const track = session.current;

  return [
    h.keyed("span")(
      track.id,
      [
        h.Class(
          "island-words block min-w-0 transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none",
        ),
      ],
      [
        titleView(track.title, title, h),
        Option.match(maybeShortNotice(session.playback), {
          onNone: () =>
            h.span(
              [h.Class("mt-0.5 block truncate text-xs leading-tight tracking-wide text-island-muted")],
              [track.artist.name],
            ),
          onSome: (notice) =>
            h.span(
              [
                h.DataAttribute("notice", ""),
                h.Class("mt-0.5 block truncate text-xs leading-tight text-island-light"),
              ],
              [notice],
            ),
        }),
      ],
    ),
  ];
};

// NOTE: a time has a box of a fixed size that lays out nothing outside
// itself (`contain`). The elapsed time changes once a second while there is
// sound, and it is the one thing in the player whose change is a change of
// layout. The player is drawn in a box that scrolls and snaps (`sheet/`),
// and a browser that lays such a box out again may put it back on the place
// it last rested at, which under a swipe is the sheet whole: a tick of the
// clock must not reach that box.
const TIME_CLASS =
  "h-4 w-11 shrink-0 overflow-hidden text-xs leading-4 font-[550] tabular-nums [contain:strict]";

/** What is left of the track to play, as the listener reads it: counted down. */
const formatRemaining = (seconds: number): string => `−${formatDuration(Math.max(0, seconds))}`;

const fractionOfDuration = (seconds: number, duration: number): number =>
  Math.max(0, Math.min(1, seconds / duration));

/**
 * How the progress bar is drawn in each of the two places it has: the rail
 * it runs on, the dot that is moved along it, and how much around the dot
 * answers a press.
 */
type SeekLook = Readonly<{ rail: string; dot: string; reach: string }>;

const SEEK_ON_SHEET: SeekLook = { rail: "bg-player-rail", dot: "size-3 bg-ink", reach: "size-11" };

// NOTE: on the island the bar stands between the track's words and the
// controls, and the room round its dot is a pointer's, not a finger's: a
// finger's width would reach over the control beside the bar's end.
const SEEK_ON_ISLAND: SeekLook = {
  rail: "bg-on-island/20",
  dot: "size-2.5 bg-on-island",
  reach: "size-6",
};

/**
 * The slider's own markup. The bar is thin and its target is not: the track
 * answers a press well above and below it, and the thumb is a finger wide
 * around a small dot. Behind the part played lies the part the engine holds.
 */
const seekBarView = (
  attributes: Slider.SliderAttributes,
  session: Session,
  durationSeconds: number,
  look: SeekLook,
  h: HtmlBuilder<Message>,
): Html => {
  const isWish = !Seek.guards.Settled(session.seek);
  const played = fractionOfDuration(shownPositionSeconds(session), durationSeconds);
  const glides = Playback.guards.Sounding(session.playback) &&
    Seek.guards.Settled(session.seek) && !session.seek.justJumped;
  const glide = glides
    ? "motion-safe:transition-transform motion-safe:duration-1000 motion-safe:ease-linear"
    : "transition-none";

  return h.div(
    [
      ...attributes.root,
      h.DataAttribute("seek", session.seek._tag),
      h.Class("group/seek relative flex h-11 w-full touch-none items-center"),
    ],
    [
      h.div(
        [
          ...attributes.track,
          h.Class(
            clsx(
              "[container-type:inline-size] h-1 w-full cursor-pointer rounded-full before:absolute before:inset-x-0 before:-inset-y-5 before:content-['']",
              look.rail,
            ),
          ),
        ],
        [
          h.div([
            h.DataAttribute("buffered", ""),
            h.Class(
              "pointer-events-none absolute inset-0 origin-left rounded-full bg-muted/40 motion-safe:transition-transform motion-safe:duration-300",
            ),
            h.Style({ transform: `scaleX(${fractionOfDuration(session.bufferedSeconds, durationSeconds)})` }),
          ]),
          h.div([
            ...attributes.filledTrack,
            h.Style({ transform: `scaleX(${played})` }),
            h.Class(
              clsx(
                "absolute inset-0 origin-left pointer-events-none rounded-full bg-island-control",
                glide,
                { "opacity-50": isWish },
              ),
            ),
          ]),
          h.div(
            [
              ...attributes.thumb,
              // cqw is relative to the track; 50% is half the thumb's own hit area.
              h.Style({ transform: `translateX(calc(${played * 100}cqw - 50%))` }),
              h.Class(
                clsx(
                  "group/thumb absolute left-0 top-1/2 flex touch-none -translate-y-1/2 cursor-grab items-center justify-center rounded-full outline-none group-data-dragging/seek:cursor-grabbing",
                  look.reach,
                  glide,
                ),
              ),
            ],
            [
              h.span([
                h.Class(
                  clsx(
                    "rounded-full shadow group-focus-visible/thumb:outline-2 group-focus-visible/thumb:outline-offset-2 group-focus-visible/thumb:outline-accent group-data-dragging/seek:scale-125",
                    look.dot,
                    { "opacity-60": isWish },
                  ),
                ),
              ]),
            ],
          ),
        ],
      ),
    ],
  );
};

// NOTE: the bar is four pixels of a place forty-four high, which is what a
// finger needs. The place is drawn in over the pieces around it, so that
// the bar stands seven pixels under the cover and the times ten under the
// bar, as they are drawn, and the block is thirty-nine high.
const PROGRESS_CLASS = "-mt-[13px] h-[3.25rem]";
const TIMES_CLASS = "-mt-[10px] flex justify-between";

/**
 * The progress bar is a slider: dragged, pressed, or moved with the keys.
 * While the listener is seeking, the bar and the time stand where they want
 * to be and are drawn as a wish until the engine says the sound is there.
 */
const progressView = (session: Session, durationSeconds: number, h: HtmlBuilder<Message>): Html => {
  const shownSeconds = shownPositionSeconds(session);
  const isWish = !Seek.guards.Settled(session.seek);

  return h.div(
    [h.Class(PROGRESS_CLASS)],
    [
      h.submodel({
        slotId: "seek",
        model: session.seekSlider,
        view: Slider.view,
        viewInputs: {
          value: Math.min(shownSeconds, durationSeconds),
          ariaLabel: `Seek: ${session.current.title}`,
          formatValue: (value) => `${formatDuration(value)} of ${formatDuration(durationSeconds)}`,
          toView: (attributes) =>
            seekBarView(attributes, session, durationSeconds, SEEK_ON_SHEET, h),
        },
        toParentMessage: (message) => Message.GotSeekSliderMessage({ message }),
      }),
      h.div(
        [h.Class(TIMES_CLASS)],
        [
          h.span(
            [
              h.DataAttribute("elapsed", isWish ? "wish" : "fact"),
              h.Class(
                clsx(TIME_CLASS, "text-left", {
                  "text-accent": isWish,
                  "text-player-time": !isWish,
                  "animate-pulse motion-reduce:animate-none":
                    Seek.guards.Seeking(session.seek) || Playback.guards.Waiting(session.playback),
                }),
              ),
            ],
            [formatDuration(shownSeconds)],
          ),
          h.span(
            [h.DataAttribute("remaining", ""), h.Class(clsx(TIME_CLASS, "text-right text-player-time"))],
            [formatRemaining(durationSeconds - shownSeconds)],
          ),
        ],
      ),
    ],
  );
};

/** Before the engine has read the audio's length there is no bar to move along: an empty one stands for it. */
const progressPlaceholderView = (session: Session, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(PROGRESS_CLASS)],
    [
      h.div(
        [h.AriaHidden(true), h.Class("flex h-11 items-center")],
        [
          h.div([
            h.Class(
              clsx("h-1 w-full rounded-full bg-player-rail", {
                "animate-pulse motion-reduce:animate-none": Playback.guards.Starting(session.playback),
              }),
            ),
          ]),
        ],
      ),
      h.div(
        [h.Class(TIMES_CLASS)],
        [
          h.span([h.Class(clsx(TIME_CLASS, "text-left text-player-time"))], [formatDuration(session.positionSeconds)]),
          h.span([h.AriaHidden(true), h.Class(clsx(TIME_CLASS, "text-right text-player-time"))], ["–:––"]),
        ],
      ),
    ],
  );

/** What the island says in words: only the two states a control alone cannot explain. */
const maybeNotice = (playback: Playback): Option.Option<string> =>
  Playback.matchOrElse<Option.Option<string>>(
    playback,
    {
      Stopped: ({ cause }) =>
        Option.some(
          cause === "Refused"
            ? "Your browser did not let the sound start. Press play."
            : "The sound was stopped. Press play to go on.",
        ),
      Failed: () => Option.some("This song could not be played."),
    },
    () => Option.none(),
  );

/**
 * Said to assistive technology when the state changes, and only then: the
 * words name the track and the state, never the position, so a second of
 * progress changes nothing here.
 */
const announcement = (session: Session): string => {
  const { title } = session.current;
  const artistName = session.current.artist.name;
  return Playback.match(session.playback, {
    Acknowledged: () => "",
    Starting: () => `Loading ${title}`,
    Recovering: () => `Loading ${title}`,
    Sounding: () => `Now playing: ${title} by ${artistName}`,
    Waiting: () => `Waiting for more of ${title}`,
    Paused: () => `Paused: ${title}`,
    Stopped: ({ cause }) =>
      cause === "Refused"
        ? `Your browser did not let ${title} start. Press play.`
        : `${title} was stopped. Press play to go on.`,
    Failed: () => `${title} could not be played.`,
  });
};

const STEP_ON_SHEET_CLASS = "player-step size-12 text-ink";
const STEP_GLYPH_CLASS = "size-[2.3125rem]";

const stepsView = (session: Session, className: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Role("group"), h.AriaLabel("Playback"), h.Class(className)],
    [
      stepControlView(
        previousLabel(session),
        Message.ClickedPrevious(),
        true,
        previousIcon(STEP_GLYPH_CLASS),
        STEP_ON_SHEET_CLASS,
        h,
      ),
      mainControlView(session, "size-[5.25rem]", ON_SHEET, h),
      stepControlView(
        nextLabel(session),
        Message.ClickedNext(),
        hasLater(session),
        nextIcon(STEP_GLYPH_CLASS),
        STEP_ON_SHEET_CLASS,
        h,
      ),
    ],
  );

/**
 * The island's controls: the one that starts and stops the sound, in the
 * swell of the island, and Next in the tail past it while there is room. In
 * the row with the navigation's circle and Search the island is narrower:
 * the tail is drawn in, and the swell is the island's end. Previous, and the
 * progress bar, are the expanded player's.
 */
// NOTE: drawn in, the tail has no width and Next lies under the main
// control. Next is held to the tail's far end, so as the tail is drawn in it
// travels left with that end and goes in under the control, and comes out
// from under it the same way. The island's own right edge moves with the
// tail (see `islandView`), so the control itself stays where it is while
// this happens. The tail's width is the one thing the island's shape reads
// from the document besides the island's own: see `DrawIslandFigure` in `mount.ts`.
const TAIL_CLASS =
  "dock-island-next flex h-9 w-[2.125rem] shrink-0 items-center justify-end minimized:pointer-events-none minimized:w-0";

const NEXT_IN_ISLAND_CLASS =
  "h-9 w-[2.125rem] shrink-0 pr-1 text-on-island hover:bg-on-island/10 active:bg-on-island/10 minimized:invisible minimized:opacity-0";

// NOTE: the swell is 54 pixels across and the body 44: the control's place
// stands out of the row by five above and below, and the control sits in it
// with three of island all round. It is drawn over Next.
const SWELL_CLASS = "relative z-10 -my-[5px] flex size-[3.375rem] shrink-0 items-center justify-center";

// NOTE: on a desktop's screen the island does not expand, so Previous, which
// is otherwise the expanded player's, stands in the island's body, before
// the swell (and the progress bar before that: `islandProgressView`). The swell and the tail are where they were: the outline is
// drawn from the island's width and the tail's, and neither changes.
//
// It is Next's own box the other way round, hard against the swell as the
// tail is: the two glyphs then stand the same distance from the main
// control, one on each side of it.
const PREVIOUS_IN_ISLAND_CLASS =
  "h-9 w-[2.125rem] shrink-0 pl-1 text-on-island hover:bg-on-island/10 active:bg-on-island/10";

const islandControlsView = (
  session: Session,
  hasPrevious: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Role("group"), h.AriaLabel("Playback"), h.Class("flex shrink-0 items-center")],
    [
      hasPrevious
        ? stepControlView(
            previousLabel(session),
            Message.ClickedPrevious(),
            true,
            previousIcon("size-5"),
            PREVIOUS_IN_ISLAND_CLASS,
            h,
          )
        : h.empty,
      h.div([h.Class(SWELL_CLASS)], [mainControlView(session, "size-12", ON_ISLAND, h)]),
      h.div(
        [h.DataAttribute(ISLAND_TAIL_ATTRIBUTE, ""), h.Class(TAIL_CLASS)],
        [
          stepControlView(
            nextLabel(session),
            Message.ClickedNext(),
            hasLater(session),
            nextIcon("size-5"),
            NEXT_IN_ISLAND_CLASS,
            h,
          ),
        ],
      ),
    ],
  );

/** The line under the controls: the progress bar, or the words of a state a control cannot explain. */
const progressOrNoticeView = (session: Session, h: HtmlBuilder<Message>): Html =>
  Option.match(maybeNotice(session.playback), {
    onSome: (notice) => h.p([h.Class("flex h-[2.4375rem] items-center text-sm text-muted")], [notice]),
    onNone: () =>
      Option.match(session.maybeDurationSeconds, {
        onNone: () => progressPlaceholderView(session, h),
        onSome: (durationSeconds) => progressView(session, durationSeconds, h),
      }),
  });

const announcementView = (session: Session, h: HtmlBuilder<Message>): Html =>
  h.p([h.Role("status"), h.Class("sr-only")], [announcement(session)]);

/**
 * The island: one figure over the foot of the page, light on the light page
 * and dark on the dark one. The cover is a disc at its left end and
 * stands out a little above and below; the body curves up to meet it. The
 * main control sits in a swell at the other end, and Next in a tail past
 * it. The figure takes the cover's colours near the cover, and while there
 * is sound a light travels its whole outline.
 *
 * On a narrow screen it stands above the navigation while that is whole, and
 * comes down into the navigation's row, between its circle and Search, when
 * the menu has drawn back: the shell says which in `data-navigation`, and
 * the island moves. Its body keeps its height on the way.
 */
// The shell places the island. Its outline follows the settled width and
// tail, while the controls and figure travel on their own transforms.
/** The island's words where they are no link: laid out as the link lays them out. */
const ISLAND_WORDS_CLASS = "island-words-place flex h-full min-w-0 items-center gap-2.5 pr-2";

const ISLAND_TIME_CLASS = clsx(TIME_CLASS, "island-time");

/**
 * The progress of the sound on the island of a desktop's screen, where the
 * player does not expand and the bar has no sheet to stand on: between the
 * track's words and the controls, with the time played before it and the
 * time left after it. It is the same slider as the expanded player's, and
 * does what that one does: dragged, pressed, or moved with the keys, the bar
 * and the time stand where the listener wants to be, as a wish, until the
 * engine says the sound is there. Before the engine has read the audio's
 * length there is no bar to move along, and an empty one stands for it.
 */
const islandProgressView = (session: Session, h: HtmlBuilder<Message>): Html => {
  const shownSeconds = shownPositionSeconds(session);
  const isWish = !Seek.guards.Settled(session.seek);

  return h.div(
    [h.Class("island-progress")],
    Option.match(session.maybeDurationSeconds, {
      onNone: () => [
        h.span(
          [h.Class(clsx(ISLAND_TIME_CLASS, "text-right text-island-muted"))],
          [formatDuration(session.positionSeconds)],
        ),
        h.div(
          [h.AriaHidden(true), h.Class("flex h-11 min-w-0 flex-1 items-center")],
          [
            h.div([
              h.Class(
                clsx("h-1 w-full rounded-full", SEEK_ON_ISLAND.rail, {
                  "animate-pulse motion-reduce:animate-none": Playback.guards.Starting(
                    session.playback,
                  ),
                }),
              ),
            ]),
          ],
        ),
        h.span(
          [h.AriaHidden(true), h.Class(clsx(ISLAND_TIME_CLASS, "text-left text-island-muted"))],
          ["–:––"],
        ),
      ],
      onSome: (durationSeconds) => [
        h.span(
          [
            h.DataAttribute("elapsed", isWish ? "wish" : "fact"),
            h.Class(
              clsx(ISLAND_TIME_CLASS, "text-right", {
                "text-accent": isWish,
                "text-island-muted": !isWish,
                "animate-pulse motion-reduce:animate-none":
                  Seek.guards.Seeking(session.seek) || Playback.guards.Waiting(session.playback),
              }),
            ),
          ],
          [formatDuration(shownSeconds)],
        ),
        h.div(
          [h.Class("min-w-0 flex-1")],
          [
            h.submodel({
              slotId: "seek",
              model: session.seekSlider,
              view: Slider.view,
              viewInputs: {
                value: Math.min(shownSeconds, durationSeconds),
                ariaLabel: `Seek: ${session.current.title}`,
                formatValue: (value) =>
                  `${formatDuration(value)} of ${formatDuration(durationSeconds)}`,
                toView: (attributes) =>
                  seekBarView(attributes, session, durationSeconds, SEEK_ON_ISLAND, h),
              },
              toParentMessage: (message) => Message.GotSeekSliderMessage({ message }),
            }),
          ],
        ),
        h.span(
          [
            h.DataAttribute("remaining", ""),
            h.Class(clsx(ISLAND_TIME_CLASS, "text-left text-island-muted")),
          ],
          [formatRemaining(durationSeconds - shownSeconds)],
        ),
      ],
    }),
  );
};

/**
 * What the island has of its own on a desktop's screen, before its
 * transport: the way to the queue, which opens beside the page, and the menu
 * of what else can be done with the track, which on a compact screen stands
 * under the expanded player's controls.
 */
const islandExtrasView = (
  model: Model,
  session: Session,
  viewInputs: ViewInputs,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class("island-extras")],
    [
      islandQueueButtonView(model, session, h),
      moreMenuView(
        session,
        {
          items: ["OpenAlbum", "SongDetails"],
          isPageOpening: viewInputs.isPageOpening,
          buttonClassName: "island-action",
          glyphClassName: "size-5",
          placement: "top-end",
        },
        h,
      ),
    ],
  );

const islandView = (
  model: Model,
  session: Session,
  viewInputs: ViewInputs,
  h: HtmlBuilder<Message>,
): Html => {
  const { current, playback } = session;
  const { isUnderSheet } = viewInputs;
  const isDesktop = viewInputs.screen === "Desktop";
  const words = [
    coverView(current, "-my-[3px] size-[3.125rem] rounded-full", "small", h, !isUnderSheet),
    ...trackWordsView(session, model.title, h),
  ];

  // NOTE: under the sheet the island gives up its id and its names: the
  // player on the sheet has them, and two pieces by one name end a view
  // transition before it starts. `data-under-sheet` takes the names of its
  // light and its shadow too (styles.css).
  return h.section(
    [
      ...(isUnderSheet ? [h.DataAttribute("under-sheet", "")] : [h.Id(PLAYER_ID)]),
      h.AriaLabel("Player"),
      h.Inert(isUnderSheet),
      h.DataAttribute("layout", "island"),
      h.DataAttribute("playback", playback._tag),
      h.OnMount(DrawIslandFigure()),
      h.Class(
        clsx(
          "dock-island absolute right-5 bottom-[5.125rem] left-5 z-30 flex h-11 items-center text-on-island md:right-6 md:bottom-[max(1rem,env(safe-area-inset-bottom))] md:left-6 md:mx-auto md:max-w-2xl",
          {
            "[view-transition-name:player]": !isUnderSheet,
            // What the island holds on a desktop's screen is laid out by
            // the island's own width (player.css).
            "island-on-desktop": isDesktop,
          },
        ),
      ),
    ],
    [
      h.div([h.OnMount(FollowIslandPress()), h.Class("island-surface relative isolate flex size-full items-center")], [
        ...islandFigureView(current.album.cover?.small, model.light, h),
        // NOTE: on a compact screen the words are the way to the expanded
        // player. On a desktop's there is no expanded player to lead to, and
        // they are only words: the track's page is in the island's menu.
        isDesktop
          ? h.div([h.Class(ISLAND_WORDS_CLASS)], words)
          : viewInputs.toTrackPageLink(current, words),
        isDesktop ? islandProgressView(session, h) : h.empty,
        isDesktop ? islandExtrasView(model, session, viewInputs, h) : h.empty,
        islandControlsView(session, isDesktop, h),
      ]),
      announcementView(session, h),
      artworkFlightRules([coverTransitionName(current.id)], h),
    ],
  );
};

/** Nothing until something is played: the island is no empty frame waiting for a track. */
export const view = Submodel.defineView<Model, Message, ViewInputs>((model, viewInputs, h) =>
  Option.match(model.maybeSession, {
    onNone: () => h.empty,
    onSome: (session) => islandView(model, session, viewInputs, h),
  }),
);

/**
 * How large a title is drawn. The size the design gives it holds a short
 * title in two lines; a longer one is drawn smaller, so that the lines it is
 * given hold it.
 */
const titleSize = (title: string): "Large" | "Medium" | "Small" => {
  if (title.length <= 14) {
    return "Large";
  }
  return title.length <= 30 ? "Medium" : "Small";
};

/**
 * The head of the song's face: the cover from edge to edge, and the track's
 * title over its foot. Nothing else is over the cover but the sheet's
 * handle, which is the sheet's and not this face's.
 *
 * The cover is drawn twice (see player.css): the one that carries its name
 * in a view transition, and over it the one that stays in the sheet's
 * picture.
 */
const songHeadView = (
  session: Session,
  viewInputs: ExpandedViewInputs,
  h: HtmlBuilder<Message>,
): Html => {
  const { current } = session;

  return h.keyed("header")(
    "song",
    [h.Class("player-head")],
    [
      coverView(current, "player-flight", "large", h),
      h.div([h.AriaHidden(true), h.Class("player-art")], [coverView(current, "", "large", h, false)]),
      // NOTE: keyed by the track, so another track's words are another
      // element; and not by the track's id alone, which is the cover's key.
      h.keyed("div")(
        `${current.id}/words`,
        [h.Class("player-caption")],
        [
          h.h1(
            [
              h.Id(viewInputs.titleId),
              h.DataAttribute("size", titleSize(current.title)),
              h.Class("player-title"),
            ],
            [current.title],
          ),
          h.p([h.Class("player-artist")], [current.artist.name]),
        ],
      ),
    ],
  );
};

/**
 * The head of the other faces, the queue's and the one that says what the
 * catalog knows of the track: the same track, drawn back to a thumbnail
 * beside its title at the very top of the sheet, under the handle, with its
 * cover behind as the air of the place. It is kept low, so that what the
 * face is for has the room: nothing stands over it, not even the face's
 * name, which the lit control under the player's controls and the heading
 * of what is listed already say. Pressed, it leads back to the song.
 */
const faceHeadView = (
  session: Session,
  viewInputs: ExpandedViewInputs,
  h: HtmlBuilder<Message>,
): Html => {
  const { current } = session;
  const isDetails = session.pane === "Details";

  return h.keyed("header")(
    isDetails ? "details" : "queue",
    [h.Class("player-head")],
    [
      Option.match(Option.fromNullishOr(current.album.cover), {
        onNone: () => h.empty,
        onSome: (cover) =>
          h.div(
            [h.AriaHidden(true), h.Class("player-ambience")],
            [h.img([h.Decoding("sync"), h.Src(cover.small), h.Alt("")])],
          ),
      }),
      h.div(
        [h.Class("player-now")],
        [
          coverView(current, "player-thumb", "large", h),
          h.keyed("div")(
            `${current.id}/words`,
            [h.Class("min-w-0")],
            [
              h.h1(
                [
                  h.Id(viewInputs.titleId),
                  h.DataAttribute("size", titleSize(current.title)),
                  h.Class("player-now-title"),
                ],
                [current.title],
              ),
              h.p([h.Class("player-now-artist")], [current.artist.name]),
            ],
          ),
          // NOTE: the way back lies over the whole of the head and is not
          // wrapped round it: a heading has no place inside a button.
          Button.view(
            {
              onClick: isDetails ? Message.ClickedDetails() : Message.ClickedQueue(),
              toView: (attributes) =>
                h.button(
                  [...attributes.button, h.AriaLabel("Back to the song"), h.Class("player-now-return")],
                  [],
                ),
            },
            h,
          ),
        ],
      ),
    ],
  );
};

// NOTE: the menu's backdrop is what hears the press that closes it: a press
// anywhere else, the control that opened it among that. It is drawn in the
// document's body, with the menu, and the player's sheet is drawn over the
// pages at the height a row's backdrop has (`z-40`): at that height the
// sheet lay over the backdrop, and no press reached it. Here it is over the
// sheet and under the menu.
const MORE_BACKDROP_CLASS = "fixed inset-0 z-[45] touch-none";

const MORE_LOOKS: Readonly<Record<PlayerAction, Readonly<{ label: string; icon: (className: string) => Html }>>> = {
  OpenAlbum: { label: "Go to album", icon: albumIcon },
  SongDetails: { label: "Song details", icon: detailsIcon },
};

/**
 * The control, three dots, that opens the menu of what else can be done
 * with the track that is playing: its album's page, and what the catalog
 * knows of it, which is a face of the player and is not offered from that
 * face. While the album's page is on its way the control says so, as a
 * navigation item does: its mark breathes.
 */
// NOTE: the menu is the player's one menu, drawn where the player has its
// controls: under those of the expanded player, or on the island of a
// desktop's screen. `look` is what differs between the two.
type MoreMenuLook = Readonly<{
  items: ReadonlyArray<PlayerAction>;
  /** Whether a page chosen from the menu is on its way: the control's mark breathes. */
  isPageOpening: boolean;
  buttonClassName: string;
  glyphClassName: string;
  placement: "top-start" | "top-end";
}>;

const moreMenuView = (session: Session, look: MoreMenuLook, h: HtmlBuilder<Message>): Html => {
  const { items } = look;
  const menu: Menu.Model = session.moreMenu;

  return h.submodel({
    slotId: menu.id,
    model: menu,
    view: MoreMenu.view,
    viewInputs: {
      items,
      itemToConfig: (action: PlayerAction) => ({
        className: MENU_ITEM_CLASS,
        content: h.div(
          [h.Class("contents")],
          [h.span([], [MORE_LOOKS[action].label]), MORE_LOOKS[action].icon("size-5 shrink-0 text-muted")],
        ),
      }),
      itemToSearchText: (action: PlayerAction) => MORE_LOOKS[action].label,
      ariaLabel: `More: ${session.current.title}`,
      buttonContent: moreIcon(
        clsx(look.glyphClassName, {
          "nav-breathes motion-reduce:animate-pulse": look.isPageOpening,
        }),
      ),
      buttonClassName: look.buttonClassName,
      // NOTE: lit by the Model's own word that the menu is open, which is
      // taken back the moment it is closed. What the component says on its
      // control (`data-open`, `aria-expanded`) holds for as long as the menu
      // takes to fade away, and a control lit by that stayed lit over a menu
      // that was no longer there.
      buttonAttributes: childAttributes([
        h.AriaBusy(look.isPageOpening),
        ...(menu.isOpen ? [h.DataAttribute("lit", "")] : []),
      ]),
      itemsClassName: MENU_CLASS,
      backdropClassName: MORE_BACKDROP_CLASS,
      anchor: { placement: look.placement, gap: 8, padding: 12 },
    },
    toParentMessage: (message) => Message.GotMoreMenuMessage({ message }),
  });
};

/**
 * What stands under the three controls, on every face: the menu of what else
 * can be done with the track, and the way to the queue and back.
 */
const actionsView = (
  session: Session,
  viewInputs: ExpandedViewInputs,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class("player-actions")],
    [
      moreMenuView(
        session,
        {
          items: session.pane === "Details" ? ["OpenAlbum"] : ["OpenAlbum", "SongDetails"],
          isPageOpening: viewInputs.isAlbumOpening,
          buttonClassName: "player-action",
          glyphClassName: "size-6",
          placement: "top-start",
        },
        h,
      ),
      queueButtonView(session, h),
    ],
  );

/**
 * The player grown to the size of the screen: the same piece as the island,
 * with the same controls doing the same things. It carries the island's name
 * in a view transition, and its cover the cover's, so the browser grows the
 * one into the other and shrinks it back. Another track becoming the current
 * one changes its words and its picture where they stand: the sheet does not
 * move.
 *
 * It has two faces (`pane`): the song's, with the cover at full size, and
 * the queue's, with the songs to come. The deck, the progress and the three
 * controls, is one piece on both, and the style sheet says where it stands.
 */
const sheetView = (
  session: Session,
  viewInputs: ExpandedViewInputs,
  h: HtmlBuilder<Message>,
): Html => {
  const { current } = session;
  const isSong = session.pane === "Artwork";

  return h.section(
    [
      h.Id(PLAYER_ID),
      h.AriaLabel("Player"),
      h.DataAttribute("layout", "expanded"),
      h.DataAttribute("pane", session.pane),
      h.DataAttribute("playback", session.playback._tag),
      // NOTE: `box-content`, because the sheet is given padding past its
      // edge (see `sheetStyles`): its height is then that of what is seen of
      // it, and the padding is more sheet below the screen. It has no border
      // either: a border would make it a pixel taller than its place, and a
      // sheet that does not fit its place is never whole on screen.
      h.Class(
        "player-sheet box-content h-full w-full max-w-lg rounded-t-3xl text-ink [view-transition-name:player]",
      ),
      ...viewInputs.sheetAttributes,
    ],
    [
      // NOTE: the handle is the sheet's, not a face's: it stands at the very
      // top of the sheet whatever face is shown and however far what is in
      // the sheet has been scrolled.
      viewInputs.toCollapseControl(),
      // NOTE: what is in the sheet scrolls only while the sheet is whole.
      // Short of that a swipe on it is the sheet's, and from the top of what
      // is in it a swipe down goes on to the sheet: the scroll is handed on
      // to the box around it, as any scroll that reaches its end is.
      h.div(
        [
          h.Class(
            clsx(
              "relative isolate rounded-t-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
              viewInputs.isSheetWhole ? "overflow-y-auto" : "overflow-hidden",
            ),
          ),
          ...viewInputs.contentAttributes,
        ],
        [
          h.div(
            [h.Class("player-body")],
            [
              isSong ? songHeadView(session, viewInputs, h) : faceHeadView(session, viewInputs, h),
              h.div(
                [h.Class("player-deck")],
                [
                  progressOrNoticeView(session, h),
                  stepsView(session, "player-transport", h),
                  actionsView(session, viewInputs, h),
                ],
              ),
              session.pane === "Details"
                ? h.div(
                    [h.Class("player-details")],
                    [
                      h.h2([h.Class("player-face-heading")], ["Song details"]),
                      viewInputs.toDetail(current),
                    ],
                  )
                : h.empty,
              queuePanelView(session, h),
              announcementView(session, h),
            ],
          ),
        ],
      ),
    ],
  );
};

/** With nothing current there is no player to expand: the shell draws the track's own page instead. */
export const expandedView = Submodel.defineView<Model, Message, ExpandedViewInputs>(
  (model, viewInputs, h) =>
    Option.match(model.maybeSession, {
      onNone: () => h.empty,
      onSome: (session) => sheetView(session, viewInputs, h),
    }),
);

/**
 * The queue beside the page, on a desktop's screen: a column of its own at
 * the far side, opened and closed from the island. Nothing is drawn until it
 * is opened, and nothing while nothing has been played.
 */
export const queueColumnView = Submodel.defineView<Model, Message>((model, h) =>
  Option.match(Option.filter(model.maybeSession, () => model.queueColumn === "Open"), {
    onNone: () => h.empty,
    onSome: (session) => queueColumnOf(session, h),
  }),
);
