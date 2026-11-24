import type { TrackSummary } from "@bafle/domain/Catalog/Track";
import { Button, Slider } from "@foldkit/ui";
import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { Submodel } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import {
  nextIcon,
  noteIcon,
  pauseIcon,
  playIcon,
  previousIcon,
  retryIcon,
  spinnerIcon,
} from "../view/icon.ts";
import { coverTransitionName } from "../view/artwork.ts";
import { formatDuration } from "../view/time.ts";
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
  wantsToSound,
} from "./model.ts";

// VIEW

/**
 * What the shell lends the island: its own way to the expanded player, a
 * link like any other, around the island's words for the track.
 */
export type ViewInputs = Readonly<{
  toTrackPageLink: (track: TrackSummary, content: ReadonlyArray<Html>) => Html;
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
}>;

export const PLAYER_ID = "player";

const CONTROL_CLASS =
  "relative inline-flex shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** A glyph arrives by growing into place: small, quick, and still under reduced motion. */
const GLYPH_CLASS =
  "flex size-6 transition-[opacity,scale] duration-150 ease-out starting:scale-50 starting:opacity-0 motion-reduce:transition-none";

/**
 * The pause glyph, fainter while it is only a wish. Each glyph is an element
 * made by its own view function, so changing from one to another puts a new
 * element in the document and its arrival is seen.
 */
const pauseGlyphView = (isConfirmed: boolean, h: HtmlBuilder<Message>): Html =>
  h.span(
    [h.DataAttribute("glyph", isConfirmed ? "pause" : "pause-wished"), h.Class(clsx(GLYPH_CLASS, { "opacity-50": !isConfirmed }))],
    [pauseIcon("size-full")],
  );

const playGlyphView = (h: HtmlBuilder<Message>): Html =>
  h.span([h.DataAttribute("glyph", "play"), h.Class(GLYPH_CLASS)], [playIcon("size-full")]);

const retryGlyphView = (h: HtmlBuilder<Message>): Html =>
  h.span([h.DataAttribute("glyph", "retry"), h.Class(GLYPH_CLASS)], [retryIcon("size-full")]);

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
const mainGlyphView = (playback: Playback, h: HtmlBuilder<Message>): Html => {
  if (wantsToSound(playback)) {
    return pauseGlyphView(isUnderWay(playback), h);
  }
  return Playback.guards.Failed(playback) ? retryGlyphView(h) : playGlyphView(h);
};

/**
 * The one control that starts and stops the sound. It shows what a press
 * will do, and around that, what is happening: nothing for sound, a turning
 * mark for a slow start, a breathing one for a stall, a ring when the system
 * stopped the sound and a press is what brings it back.
 */
const mainControlView = (session: Session, sizeClass: string, h: HtmlBuilder<Message>): Html => {
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
              clsx(CONTROL_CLASS, sizeClass, "bg-accent text-on-accent hover:opacity-90", {
                "ring-2 ring-accent ring-offset-2 ring-offset-panel": Playback.guards.Stopped(playback),
              }),
            ),
          ],
          [mainGlyphView(playback, h), activityMarkView(playback, h)],
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
  sizeClass: string,
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
              clsx(CONTROL_CLASS, sizeClass, "text-ink hover:bg-tile active:bg-tile", {
                "cursor-default opacity-40 hover:bg-transparent": !isEnabled,
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
): Html =>
  h.keyed("div")(
    track.id,
    [
      h.DataAttribute("cover", ""),
      h.Class(clsx(sizeClass, "relative shrink-0 overflow-hidden bg-tile")),
      h.Style({
        viewTransitionName: coverTransitionName(track.id),
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
 * The words arrive with a short fade when the track changes; the island
 * itself stays where it is. Under the title stands the artist, or what
 * happened to the sound when that needs saying.
 */
const trackWordsView = (session: Session, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const track = session.current;

  return [
    h.keyed("span")(
      track.id,
      [
        h.Class(
          "block min-w-0 transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none",
        ),
      ],
      [
        h.span([h.Class("block truncate text-sm leading-tight font-semibold")], [track.title]),
        Option.match(maybeShortNotice(session.playback), {
          onNone: () =>
            h.span([h.Class("block truncate text-xs leading-tight text-muted")], [track.artist.name]),
          onSome: (notice) =>
            h.span(
              [h.DataAttribute("notice", ""), h.Class("block truncate text-xs leading-tight text-accent")],
              [notice],
            ),
        }),
      ],
    ),
  ];
};

const TIME_CLASS = "w-9 shrink-0 text-xs tabular-nums";

const percent = (part: number, whole: number): string =>
  `${Math.min(100, Math.max(0, (part / whole) * 100))}%`;

/** How the bar is drawn: as a wish while the listener seeks, gliding while the engine sounds. */
type BarLook = Readonly<{ isWish: boolean; glide: string }>;

/**
 * The engine speaks once a second. Between two of its words the bar glides
 * to the last one, and so is never ahead of what the engine has said.
 */
const barLook = (session: Session): BarLook => {
  const isWish = !Seek.guards.Settled(session.seek);
  return {
    isWish,
    glide:
      Playback.guards.Sounding(session.playback) && !isWish
        ? "duration-1000 ease-linear"
        : "duration-150 ease-out",
  };
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
  h: HtmlBuilder<Message>,
): Html => {
  const { isWish, glide } = barLook(session);

  return h.div(
    [
      ...attributes.root,
      h.DataAttribute("seek", session.seek._tag),
      h.Class("group/seek relative flex h-11 min-w-0 flex-1 touch-none items-center"),
    ],
    [
      h.div(
        [
          ...attributes.track,
          h.Class(
            "h-1 w-full cursor-pointer rounded-full bg-tile before:absolute before:inset-x-0 before:-inset-y-5 before:content-['']",
          ),
        ],
        [
          h.div([
            h.DataAttribute("buffered", ""),
            h.Class(
              "pointer-events-none absolute inset-y-0 left-0 rounded-full bg-muted/40 transition-[width] duration-300 motion-reduce:transition-none",
            ),
            h.Style({ width: percent(session.bufferedSeconds, durationSeconds) }),
          ]),
          h.div([
            ...attributes.filledTrack,
            h.Class(
              clsx(
                "rounded-full bg-accent transition-[width,opacity] motion-reduce:transition-none group-data-dragging/seek:transition-none",
                glide,
                { "opacity-50": isWish },
              ),
            ),
          ]),
          h.div(
            [
              ...attributes.thumb,
              h.Class(
                clsx(
                  "group/thumb top-1/2 flex size-11 -translate-y-1/2 cursor-grab items-center justify-center rounded-full outline-none transition-[left] motion-reduce:transition-none group-data-dragging/seek:cursor-grabbing group-data-dragging/seek:transition-none",
                  glide,
                ),
              ),
            ],
            [
              h.span([
                h.Class(
                  clsx(
                    "size-3.5 rounded-full bg-accent shadow group-focus-visible/thumb:outline-2 group-focus-visible/thumb:outline-offset-2 group-focus-visible/thumb:outline-accent group-data-dragging/seek:scale-125",
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

/**
 * The progress bar is a slider: dragged, pressed, or moved with the keys.
 * While the listener is seeking, the bar and the time stand where they want
 * to be and are drawn as a wish until the engine says the sound is there.
 */
const progressView = (session: Session, durationSeconds: number, h: HtmlBuilder<Message>): Html => {
  const shownSeconds = shownPositionSeconds(session);
  const isWish = !Seek.guards.Settled(session.seek);

  return h.div(
    [h.Class("flex h-11 items-center gap-2")],
    [
      h.span(
        [
          h.DataAttribute("elapsed", isWish ? "wish" : "fact"),
          h.Class(
            clsx(TIME_CLASS, "text-left", {
              "text-accent": isWish,
              "text-muted": !isWish,
              "animate-pulse motion-reduce:animate-none":
                Seek.guards.Seeking(session.seek) || Playback.guards.Waiting(session.playback),
            }),
          ),
        ],
        [formatDuration(shownSeconds)],
      ),
      h.submodel({
        slotId: "seek",
        model: session.seekSlider,
        view: Slider.view,
        viewInputs: {
          value: Math.min(shownSeconds, durationSeconds),
          ariaLabel: `Seek: ${session.current.title}`,
          formatValue: (value) => `${formatDuration(value)} of ${formatDuration(durationSeconds)}`,
          toView: (attributes) => seekBarView(attributes, session, durationSeconds, h),
        },
        toParentMessage: (message) => Message.GotSeekSliderMessage({ message }),
      }),
      h.span([h.Class(clsx(TIME_CLASS, "text-right text-muted"))], [formatDuration(durationSeconds)]),
    ],
  );
};

/** Before the engine has read the audio's length there is no bar to move along: an empty one stands for it. */
const progressPlaceholderView = (session: Session, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("flex h-11 items-center gap-2")],
    [
      h.span([h.Class(clsx(TIME_CLASS, "text-left text-muted"))], [formatDuration(session.positionSeconds)]),
      h.div([
        h.AriaHidden(true),
        h.Class(
          clsx("h-1 min-w-0 flex-1 rounded-full bg-tile", {
            "animate-pulse motion-reduce:animate-none": Playback.guards.Starting(session.playback),
          }),
        ),
      ]),
      h.span([h.AriaHidden(true), h.Class(clsx(TIME_CLASS, "text-right text-muted"))], ["–:––"]),
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

const stepsView = (session: Session, className: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Role("group"), h.AriaLabel("Playback"), h.Class(className)],
    [
      stepControlView(
        previousLabel(session),
        Message.ClickedPrevious(),
        true,
        previousIcon("size-5"),
        "size-11",
        h,
      ),
      mainControlView(session, "size-12", h),
      stepControlView(
        nextLabel(session),
        Message.ClickedNext(),
        hasLater(session),
        nextIcon("size-5"),
        "size-11",
        h,
      ),
    ],
  );

/**
 * The island's controls: the one that starts and stops the sound, and Next
 * while there is room for it. In the row with the navigation's circle and
 * Search the island is narrower, and holds the one control. Previous, and
 * the progress bar, are the expanded player's.
 */
const islandControlsView = (session: Session, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Role("group"), h.AriaLabel("Playback"), h.Class("flex shrink-0 items-center gap-0.5")],
    [
      mainControlView(session, "size-9", h),
      stepControlView(
        nextLabel(session),
        Message.ClickedNext(),
        hasLater(session),
        nextIcon("size-5"),
        "size-9 minimized:hidden",
        h,
      ),
    ],
  );

/** The line under the controls: the progress bar, or the words of a state a control cannot explain. */
const progressOrNoticeView = (session: Session, h: HtmlBuilder<Message>): Html =>
  Option.match(maybeNotice(session.playback), {
    onSome: (notice) => h.p([h.Class("flex h-11 items-center text-sm text-muted")], [notice]),
    onNone: () =>
      Option.match(session.maybeDurationSeconds, {
        onNone: () => progressPlaceholderView(session, h),
        onSome: (durationSeconds) => progressView(session, durationSeconds, h),
      }),
  });

const announcementView = (session: Session, h: HtmlBuilder<Message>): Html =>
  h.p([h.Role("status"), h.Class("sr-only")], [announcement(session)]);

/**
 * The island: one capsule over the foot of the page. On a narrow screen it
 * stands above the navigation while that is whole, and comes down into the
 * navigation's row, between its circle and Search, when the menu has drawn
 * back: the shell says which in `data-navigation`, and the island moves.
 */
const islandView = (session: Session, viewInputs: ViewInputs, h: HtmlBuilder<Message>): Html =>
  h.section(
    [
      h.Id(PLAYER_ID),
      h.AriaLabel("Player"),
      h.DataAttribute("layout", "island"),
      h.DataAttribute("playback", session.playback._tag),
      h.Class(
        "absolute inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 flex h-12 items-center gap-2 rounded-full border border-line bg-panel/85 px-1.5 shadow-lg backdrop-blur-xl transition-[left,right,bottom] duration-300 ease-out [view-transition-name:player] minimized:inset-x-17 minimized:bottom-[calc(0.75rem+env(safe-area-inset-bottom))] motion-reduce:transition-none md:inset-x-6 md:bottom-[max(1rem,env(safe-area-inset-bottom))] md:mx-auto md:max-w-2xl",
      ),
    ],
    [
      coverView(session.current, "size-9 rounded-full", "small", h),
      viewInputs.toTrackPageLink(session.current, trackWordsView(session, h)),
      islandControlsView(session, h),
      announcementView(session, h),
    ],
  );

/** Nothing until something is played: the island is no empty frame waiting for a track. */
export const view = Submodel.defineView<Model, Message, ViewInputs>((model, viewInputs, h) =>
  Option.match(model.maybeSession, {
    onNone: () => h.empty,
    onSome: (session) => islandView(session, viewInputs, h),
  }),
);

/**
 * The player grown to the size of a page: the same piece as the island, with
 * the same controls doing the same things, and room for the cover at full
 * size. It carries the island's name in a view transition, and its cover the
 * cover's, so the browser grows the one into the other and shrinks it back.
 * Another track becoming the current one changes its words and its picture
 * where they stand: the sheet does not move.
 */
const sheetView = (
  session: Session,
  viewInputs: ExpandedViewInputs,
  h: HtmlBuilder<Message>,
): Html => {
  const { current } = session;

  return h.section(
    [
      h.Id(PLAYER_ID),
      h.AriaLabel("Player"),
      h.DataAttribute("layout", "expanded"),
      h.DataAttribute("playback", session.playback._tag),
      h.Class(
        "mx-auto flex min-h-full w-full max-w-lg flex-col rounded-t-3xl border-x border-t border-line bg-panel px-6 pb-10 [view-transition-name:player]",
      ),
    ],
    [
      viewInputs.toCollapseControl(),
      h.div(
        [h.Class("mx-auto mt-2 w-full max-w-sm")],
        [coverView(current, "aspect-square w-full rounded-2xl", "large", h)],
      ),
      h.keyed("div")(
        current.id,
        [
          h.Class(
            "mt-6 min-w-0 transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none",
          ),
        ],
        [
          h.h1(
            [h.Id(viewInputs.titleId), h.Class("truncate text-2xl font-bold tracking-tight")],
            [current.title],
          ),
          h.p([h.Class("truncate text-lg text-muted")], [current.artist.name]),
        ],
      ),
      h.div([h.Class("mt-2")], [progressOrNoticeView(session, h)]),
      stepsView(session, "mt-2 flex items-center justify-center gap-6", h),
      h.div([h.Class("mt-8")], [viewInputs.toDetail(current)]),
      announcementView(session, h),
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
