import { clsx } from "clsx";
import * as Array from "effect/Array";
import * as Match from "effect/Match";
import { type Html, type HtmlBuilder, inertHtml as ih } from "foldkit/html";
import type { LoadError } from "../catalog.ts";
import type { NoticeReason } from "../model.ts";
import { Message } from "../message.ts";
import {
  type PillLook,
  iconButtonView,
  iconControlClass,
  pillButtonView,
  pillClass,
} from "./control.ts";
import { closeIcon, retryIcon } from "./icon.ts";

// VIEW

/** Why the catalog could not be asked, in the listener's words. */
export const reason = (error: LoadError): string =>
  Match.value(error).pipe(
    Match.when("CatalogUnavailable", () => "The music catalog is not answering right now."),
    Match.when("Unreachable", () => "Bafle could not be reached. Check your connection."),
    Match.exhaustive,
  );

const tryAgainView = (look: PillLook, h: HtmlBuilder<Message>): Html =>
  pillButtonView(
    { look, size: "Short", content: ["Try again"], onClick: Message.ClickedTryAgain() },
    h,
  );

/**
 * Words for whoever cannot see what changed: said politely when they change,
 * without being seen and without taking the focus. The place is in the
 * document whether or not there is anything to say, so that what is said is
 * heard as a change.
 */
export const saidView = <M>(words: string, h: HtmlBuilder<M>): Html =>
  h.p([h.Role("status"), h.Class("sr-only")], [words]);

/** A bar of the signal: where it stands across, its two ends, and whether it still sounds. */
type SignalBar = readonly [x: number, top: number, bottom: number];

// The signal as the design draws it (`design/artwork/bafle-waveform.png`,
// 650 by 238): a burst that sounds, in the middle, and on either side of it
// what fades, down to dots where it is cut. A bar whose two ends are one
// place is a dot, since its ends are round.
const SOUNDING: ReadonlyArray<SignalBar> = [
  [90, 100, 163],
  [110, 60, 190],
  [130, 25, 213],
  [150, 6, 230],
  [170, 25, 213],
  [189, 53, 190],
  [211, 82, 165],
  [232, 100, 160],
];

const FADING: ReadonlyArray<SignalBar> = [
  [9, 112, 170],
  [29, 97, 185],
  [49, 83, 190],
  [69, 97, 172],
  [255, 122, 168],
  [277, 135, 182],
  [298, 135, 190],
  [318, 127, 182],
  [338, 110, 163],
  [359, 101, 155],
  [379, 109, 153],
  [400, 123, 155],
  [421, 132, 155],
  [443, 134, 155],
  [464, 134, 153],
  [486, 140, 150],
  ...Array.map(Array.range(0, 6), (dot): SignalBar => [508 + dot * 22, 146, 146]),
];

const signalPath = (bars: ReadonlyArray<SignalBar>): string =>
  Array.join(
    Array.map(bars, ([x, top, bottom]) => `M${x} ${top}V${bottom}`),
    "",
  );

/** The signal, cut: what stands over a page that could not reach the catalog. */
const lostSignalView = (): Html =>
  ih.svg(
    [
      ih.AriaHidden(true),
      ih.Class("h-18 w-auto"),
      ih.Xmlns("http://www.w3.org/2000/svg"),
      ih.Fill("none"),
      ih.ViewBox("0 0 650 238"),
      ih.StrokeWidth("9"),
    ],
    [
      ih.path([
        ih.Class("stroke-signal-fade"),
        ih.StrokeLinecap("round"),
        ih.D(signalPath(FADING)),
      ]),
      ih.path([ih.Class("stroke-signal"), ih.StrokeLinecap("round"), ih.D(signalPath(SOUNDING))]),
    ],
  );

/**
 * Where a failure is said. A page says it as the whole of what it shows; the
 * face of a song's details, in the expanded player, says it in a part of the
 * sheet, under a low head and over the deck, where the page's way would not fit.
 */
export type FailurePlace = "Page" | "Face";

const tryAgainTallView = (h: HtmlBuilder<Message>): Html =>
  pillButtonView(
    {
      look: "Filled",
      size: "Tall",
      content: [retryIcon("size-4.5"), "Try again"],
      onClick: Message.ClickedTryAgain(),
    },
    h,
  );

/**
 * A page that could not load and has nothing to show: said where its content
 * would be. On a page, that is the middle of the room the page has left under
 * its head, over the signal cut short. Only the words are the alert; the
 * button stays an ordinary control.
 */
export const failureView = (
  what: string,
  error: LoadError,
  place: FailurePlace,
  h: HtmlBuilder<Message>,
): Html =>
  Match.value(place).pipe(
    Match.when("Page", () =>
      h.div(
        [
          h.Class(
            // NOTE: the room left is the screen's height less what stands over
            // it (the page's top and its title's row) and the room at its foot
            // (`--page-foot`). Search's field takes that row, so it is the same there.
            "flex min-h-[calc(100dvh-var(--page-foot)-5rem)] flex-col items-center justify-center gap-6 py-8 text-center",
          ),
        ],
        [
          lostSignalView(),
          h.div(
            [h.Role("alert")],
            [
              h.p(
                [h.Class("text-3xl font-bold tracking-tight text-balance md:text-4xl")],
                [`${what} could not load.`],
              ),
              h.p([h.Class("mt-2 text-pretty text-muted")], [reason(error)]),
            ],
          ),
          tryAgainTallView(h),
        ],
      ),
    ),
    Match.when("Face", () =>
      h.div(
        [h.Class("mt-8 max-w-md rounded-2xl border border-line bg-panel p-6")],
        [
          h.div(
            [h.Role("alert")],
            [
              h.p([h.Class("font-semibold")], [`${what} could not load.`]),
              h.p([h.Class("mt-1 text-sm text-muted")], [reason(error)]),
            ],
          ),
          pillButtonView(
            {
              look: "Filled",
              size: "Short",
              content: ["Try again"],
              onClick: Message.ClickedTryAgain(),
              place: "mt-4",
            },
            h,
          ),
        ],
      ),
    ),
    Match.exhaustive,
  );

/** Why a page shows what it loaded earlier, in a few words: there is little room over a page. */
const staleReason = (reason: NoticeReason): string =>
  Match.value(reason).pipe(
    Match.when("CatalogUnavailable", () => "The catalog is not answering."),
    Match.whenOr("Offline", "Unreachable", () => "You are offline."),
    Match.exhaustive,
  );

/**
 * What the notice over the page says, and whether it is there to be read:
 * why what is on screen may not be what the catalog has now, whether the
 * page holds what loaded earlier, and whether asking again could work.
 */
export type Notice = Readonly<{
  isShown: boolean;
  reason: NoticeReason;
  holdsEarlier: boolean;
}>;

/** Asking again needs a connection: without one the app asks by itself when it has one again. */
const canTryAgain = (notice: Notice): boolean => notice.reason !== "Offline";

/** What can be done from the notice: try again, while there is a connection to try with, and put it away. */
const noticeControlsView = (notice: Notice, h: HtmlBuilder<Message>): ReadonlyArray<Html> => [
  canTryAgain(notice) ? tryAgainView("Words", h) : h.empty,
  iconButtonView(
    {
      look: "OnNotice",
      label: "Dismiss",
      content: [closeIcon("size-4")],
      onClick: Message.ClickedDismissStaleNotice(),
    },
    h,
  ),
];

/**
 * The same, as the notice goes: drawn as they were, so that the notice keeps
 * its width on its way out, and no longer controls, since nothing in it can
 * be reached by then.
 */
const noticeControlsGoneView = (notice: Notice, h: HtmlBuilder<Message>): ReadonlyArray<Html> => [
  canTryAgain(notice) ? h.span([h.Class(pillClass("Words", "Short"))], ["Try again"]) : h.empty,
  h.span([h.Class(iconControlClass("OnNotice"))], [closeIcon("size-4")]),
];

const NOTICE_CLASS =
  "flex max-w-full items-center gap-2 rounded-2xl border border-line bg-panel/90 py-1.5 pr-1.5 pl-4 text-sm shadow-lg backdrop-blur-xl transition-[translate,opacity] duration-300 ease-settle";

// NOTE: gone, it goes back up out of sight and is clear, and not hidden: it
// is seen to go, and comes down again from there. Under reduced motion it
// only grows clear and comes back.
const NOTICE_PLACES: Readonly<Record<"Shown" | "Gone", string>> = {
  Shown: "pointer-events-auto translate-y-0 opacity-100",
  Gone: "pointer-events-none -translate-y-[calc(100%+1.5rem)] opacity-0 motion-reduce:translate-y-0",
};

/**
 * That the device has no connection, or that a refresh failed behind what
 * is still on screen. It is said over the top of the page, on a piece of
 * its own that takes no room in the page: what is on the page stays where
 * it is when the notice comes and when it goes. It comes down as soon as
 * there is something to say, and goes back up as soon as there is not,
 * saying what it said as it goes. It offers to try again, while there is a
 * connection to try with, and to be put away.
 */
// NOTE: it is always in the document, so that it can be seen to come and
// go. Gone, nothing in it can be reached, and nothing in it is heard.
export const noticeView = (notice: Notice, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Class(
        "pointer-events-none absolute inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 flex justify-center md:inset-x-6 md:top-6",
      ),
    ],
    [
      h.div(
        [
          h.DataAttribute("stale-notice", notice.isShown ? "shown" : "gone"),
          h.Inert(!notice.isShown),
          h.AriaHidden(!notice.isShown),
          h.Class(clsx(NOTICE_CLASS, NOTICE_PLACES[notice.isShown ? "Shown" : "Gone"])),
        ],
        [
          h.p(
            [h.Role("status"), h.Class("min-w-0 text-pretty")],
            [
              notice.holdsEarlier
                ? `${staleReason(notice.reason)} Showing what loaded earlier.`
                : staleReason(notice.reason),
            ],
          ),
          ...(notice.isShown ? noticeControlsView(notice, h) : noticeControlsGoneView(notice, h)),
        ],
      ),
    ],
  );
