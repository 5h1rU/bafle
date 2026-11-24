import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { Dom, Subscription } from "foldkit";
import { Message } from "./message.ts";
import type { Model } from "./model.ts";
import * as Player from "./player/index.ts";
import { isPageId, pageIdOf } from "./view/layout.ts";

// SUBSCRIPTION

/** How far down a page has to go, from the highest point it was seen at, before the navigation draws back. */
export const DRAWS_BACK_AFTER_PIXELS = 48;

/** How near its top a page has to be for the navigation to come out again. */
export const TOP_WITHIN_PIXELS = 16;

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

const wentDown = (pageId: string): Stream.Stream<Message> =>
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

const reachedTop: Stream.Stream<Message> = pagePositions.pipe(
  Stream.filter(isAtTop),
  Stream.map(() => Message.ScrolledToTop()),
);

/**
 * What is listened for depends on how the navigation stands: whole, for the
 * page going down; drawn back, for the page reaching its top. Each change of
 * the navigation, and each change of page, starts the listening anew, so a
 * navigation brought out in the middle of a page measures the next way down
 * from there.
 */
const navigationSubscriptions = Subscription.make<Model, Message>()((entry) => ({
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
