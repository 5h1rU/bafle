import * as Array from "effect/Array";
import * as Match from "effect/Match";
import { type Html, type HtmlBuilder, inertHtml as ih } from "foldkit/html";
import type { LoadError } from "../catalog.ts";
import { Message } from "../message.ts";
import { type PillLook, iconButtonView, pillButtonView } from "./control.ts";
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
 * A page that could not load and has nothing to show: said where its content
 * would be, in the middle of the room the page has left under its head, over
 * the signal cut short. Only the words are the alert; the button stays an
 * ordinary control.
 */
export const failureView = (what: string, error: LoadError, h: HtmlBuilder<Message>): Html =>
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
      pillButtonView(
        {
          look: "Filled",
          size: "Tall",
          content: [retryIcon("size-4.5"), "Try again"],
          onClick: Message.ClickedTryAgain(),
        },
        h,
      ),
    ],
  );

/** Why a page shows what it loaded earlier, in a few words: there is little room over a page. */
const staleReason = (error: LoadError): string =>
  Match.value(error).pipe(
    Match.when("CatalogUnavailable", () => "The catalog is not answering."),
    Match.when("Unreachable", () => "You are offline."),
    Match.exhaustive,
  );

/**
 * A refresh failed behind content that is still on screen. It is said over
 * the foot of the page, on a piece of its own that takes no room in the
 * page: what is on the page stays where it is when the notice comes, and
 * when the listener puts it away. It offers to try again, and to be put away.
 */
// NOTE: it stands at the foot and not at the top. The top of a page is
// where a page keeps what stays as it scrolls, Search's field and the bar an
// album's head draws back to, and a notice there lay over them. At the foot
// it stands clear of the navigation and of the island, in the room every
// page leaves for them (`pageAttributes`): over the island while that is
// above the navigation's row, and lower once it has come down into it.
export const staleBannerView = (error: LoadError, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Class(
        "pointer-events-none absolute right-3 bottom-[5.25rem] left-3 z-30 flex justify-center transition-[bottom] duration-300 group-data-player/shell:bottom-36 minimized:group-data-player/shell:bottom-[5.25rem] motion-reduce:transition-none md:right-6 md:bottom-6 md:left-6 md:group-data-player/shell:bottom-28",
      ),
    ],
    [
      h.div(
        [
          h.DataAttribute("stale-notice", ""),
          h.Class(
            "pointer-events-auto flex max-w-full items-center gap-2 rounded-2xl border border-line bg-panel/90 py-1.5 pr-1.5 pl-4 text-sm shadow-lg backdrop-blur-xl",
          ),
        ],
        [
          h.p(
            [h.Role("status"), h.Class("min-w-0 text-pretty")],
            [`${staleReason(error)} Showing what loaded earlier.`],
          ),
          tryAgainView("Words", h),
          iconButtonView(
            {
              look: "OnNotice",
              label: "Dismiss",
              content: [closeIcon("size-4")],
              onClick: Message.ClickedDismissStaleNotice(),
            },
            h,
          ),
        ],
      ),
    ],
  );
