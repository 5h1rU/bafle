import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { Dom, Subscription } from "foldkit";
import { SEARCH_FIELD_BOX_CLASS, SEARCH_FIELD_ID } from "./command.ts";
import { type InputMethod, Message } from "./message.ts";
import type { Model } from "./model.ts";
import * as Player from "./player/index.ts";
import { DESKTOP_QUERY } from "./screen.ts";
import { isPageId, pageIdOf } from "./view/layout.ts";

// SUBSCRIPTION

/** How far down a page has to go, from the highest point it was seen at, before the navigation draws back. */
export const DRAWS_BACK_AFTER_PIXELS = 48;

/** How near its top a page has to be for the navigation to come out again. */
export const TOP_WITHIN_PIXELS = 16;

/** How long a page has to keep still for the scroll that was moving it to be over. */
export const SCROLL_ENDS_AFTER = Duration.millis(150);

/** Where a page stands: which page, and how far down from its top. */
export type PagePosition = Readonly<{ pageId: string; top: number }>;

/**
 * Where a page stands, kept within what it can scroll: a phone lets a page
 * be pulled past its ends and springs it back, and the way back from above
 * the top is no scroll down.
 */
const positionOf = (page: HTMLElement): PagePosition => {
  const furthest = Math.max(0, page.scrollHeight - page.clientHeight);
  return { pageId: page.id, top: Math.min(furthest, Math.max(0, page.scrollTop)) };
};

/** A page's position, read from its scroll. A scroll inside a page, a shelf moving sideways, is not the page's. */
const maybePagePosition = (event: Event): Option.Option<PagePosition> => {
  const { target } = event;
  return target instanceof HTMLElement && isPageId(target.id)
    ? Option.some(positionOf(target))
    : Option.none();
};

/**
 * Follows a page down. The highest point is where the page stood when the
 * following began, or any higher point it has been at since: another page
 * is a new start. The page has gone down once it stands far enough below it.
 */
export const followDown = (
  highest: PagePosition,
  position: PagePosition,
): readonly [highest: PagePosition, hasGoneDown: boolean] => {
  const nextHighest =
    highest.pageId === position.pageId && highest.top <= position.top ? highest : position;
  return [nextHighest, position.top - nextHighest.top > DRAWS_BACK_AFTER_PIXELS];
};

export const isAtTop = (position: PagePosition): boolean => position.top <= TOP_WITHIN_PIXELS;

// NOTE: scroll events do not bubble, so the pages are heard from the document
// on the way down to them. A page scrolls many times a second, and none of it
// is the Model's to hold: only the two moments that change the navigation are
// told.
const pagePositions = Stream.suspend(() =>
  Dom.streamFromEventFilterMap({
    target: document,
    type: "scroll",
    options: { capture: true, passive: true },
    filterMapEvent: maybePagePosition,
  }),
);

// NOTE: the one place the document is read rather than heard. A scroll says
// where a page is, never where it was: one turn of a wheel or one press of
// Space moves a page further than the whole distance watched for, in a single
// event. So the following starts from where the page on screen stands. A page
// not in the document yet starts at its top.
const standingOf = (pageId: string): Effect.Effect<PagePosition> =>
  Effect.sync(() => {
    const page = document.getElementById(pageId);
    return page === null ? { pageId, top: 0 } : positionOf(page);
  });

/** The page going down from where it stands now: told once it has gone far enough. */
const followingDown = (pageId: string): Stream.Stream<Message> =>
  Stream.unwrap(
    Effect.map(standingOf(pageId), (standing) =>
      pagePositions.pipe(
        Stream.mapAccum(
          () => standing,
          (highest, position) => {
            const [nextHighest, hasGoneDown] = followDown(highest, position);
            return [nextHighest, hasGoneDown ? [Message.ScrolledDown()] : []] as const;
          },
        ),
      ),
    ),
  );

/** A touch laid on the page: whatever was moving it before is over, and this is a scroll of its own. */
const touches = Stream.suspend(() =>
  Dom.streamFromEventFilterMap({
    target: document,
    type: "touchstart",
    options: { capture: true, passive: true },
    filterMapEvent: () => Option.some(true),
  }),
);

/**
 * The scroll under way has come to its end: no page has moved for a moment,
 * or the listener has laid a finger on the screen again. Told once. A page
 * that is standing still says so after that same moment.
 */
const scrollUnderWayEnds: Stream.Stream<boolean> = Stream.merge(
  touches,
  Stream.concat(
    Stream.make(true),
    Stream.map(pagePositions, () => true),
  ).pipe(Stream.debounce(SCROLL_ENDS_AFTER)),
).pipe(Stream.take(1));

// NOTE: the navigation is out in the middle of a page only because the
// listener pressed its circle, and they may have pressed it while the page
// was still running on from a flick. That run is not a wish to send the
// navigation away again: it was under way before the press. So the following
// waits for it to end, and starts from where the page has come to rest. At
// the top of a page there is nothing to wait for: the navigation came out by
// the page getting there, and the next way down is the listener's.
const wentDown = (pageId: string): Stream.Stream<Message> =>
  Stream.unwrap(
    Effect.map(standingOf(pageId), (standing) =>
      isAtTop(standing)
        ? followingDown(pageId)
        : Stream.flatMap(scrollUnderWayEnds, () => followingDown(pageId)),
    ),
  );

const reachedTop: Stream.Stream<Message> = pagePositions.pipe(
  Stream.filter(isAtTop),
  Stream.map(() => Message.ScrolledToTop()),
);

/**
 * A finger dragging Search's page while its field has the focus, anywhere
 * but on the field's own box: the listener has gone from typing to reading,
 * and a phone's keyboard is in the way of what was found. A drag within the
 * box is the listener moving through what they typed, and is not told.
 */
// NOTE: it is the finger's drag that is heard and not the page's scroll. The
// app scrolls the page itself, to its top when the field goes up to the
// page's head, and that must not take the focus from a listener still
// typing. Once the field has let go of the focus there is nothing more to
// tell, so a drag is told once, or a few times before the field lets go.
const dragsUnderSearchField = Stream.suspend(() =>
  Dom.streamFromEventFilterMap({
    target: document,
    type: "touchmove",
    options: { capture: true, passive: true },
    filterMapEvent: ({ target }) => {
      const field = document.getElementById(SEARCH_FIELD_ID);
      const isOnField =
        target instanceof Element && target.closest(`.${SEARCH_FIELD_BOX_CLASS}`) !== null;
      return field !== null && document.activeElement === field && !isOnField
        ? Option.some(Message.DraggedSearchPage())
        : Option.none();
    },
  }),
);

/**
 * Whether the screen is a desktop's: told as the app starts, and again each
 * time the window is made wide enough for three columns or too narrow for
 * them. It is the one width the Model holds, since it changes what the
 * player is and not only where its pieces are drawn (`screen.ts`).
 */
const screens = Stream.callback<Message>((queue) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const desktop = matchMedia(DESKTOP_QUERY);
      const tell = (): void => {
        Queue.offerUnsafe(
          queue,
          Message.ChangedScreen({ screen: desktop.matches ? "Desktop" : "Compact" }),
        );
      };
      desktop.addEventListener("change", tell);
      tell();
      return () => desktop.removeEventListener("change", tell);
    }),
    (stop) => Effect.sync(stop),
  ).pipe(Effect.flatMap(() => Effect.never)),
);

/**
 * What is listened for depends on how the navigation stands: whole, for the
 * page going down; drawn back, for the page reaching its top. Each change of
 * the navigation, and each change of page, starts the listening anew, so a
 * navigation brought out in the middle of a page measures the next way down
 * from there.
 */
const navigationSubscriptions = Subscription.make<Model, Message>()((entry) => ({
  screen: entry({}, {
    modelToDependencies: () => ({}),
    dependenciesToStream: () => screens,
  }),
  inputMethod: entry({}, {
    modelToDependencies: () => ({}),
    dependenciesToStream: () => {
      const capture = (type: "keydown" | "pointerdown" | "wheel" | "click", method: InputMethod) =>
        Dom.streamFromEventFilterMap({
          target: document,
          type,
          options: { capture: true, passive: true },
          filterMapEvent: (event) => type !== "click" ||
            (event instanceof MouseEvent && event.isTrusted && event.detail === 0)
            ? Option.some(method) : Option.none(),
        });
      return Stream.mergeAll([
        capture("keydown", "Keyboard"), capture("click", "Keyboard"),
        capture("pointerdown", "Pointer"), capture("wheel", "Pointer"),
      ], { concurrency: "unbounded" }).pipe(
        Stream.changes,
        Stream.map((method) => Message.ChangedInputMethod({ method })),
      );
    },
  }),
  searchDrag: entry(
    { isOnSearch: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ isOnSearch: model.route._tag === "Search" }),
      dependenciesToStream: ({ isOnSearch }) => (isOnSearch ? dragsUnderSearchField : Stream.empty),
    },
  ),
  pageScroll: entry(
    { isMinimized: Schema.Boolean, pageId: Schema.String },
    {
      modelToDependencies: (model) => ({
        isMinimized: model.navigation === "Minimized",
        pageId: pageIdOf(model.route),
      }),
      dependenciesToStream: ({ isMinimized, pageId }) =>
        isMinimized ? reachedTop : wentDown(pageId),
    },
  ),
}));

/** The player's own: the engine's reports, the system's media keys, the drag of its progress bar. */
const playerSubscriptions = Subscription.lift(Player.subscriptions)<Model, Message>({
  read: (model) => Option.some(model.player),
  toParentMessage: (message) => Message.GotPlayerMessage({ message }),
});

export const subscriptions = Subscription.aggregate(navigationSubscriptions, playerSubscriptions);
