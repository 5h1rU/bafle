import type { Document, HtmlBuilder } from "foldkit/html";
import waveform from "../assets/crash-waveform.png?inline";
import { retryIcon } from "./icon.ts";

// NOTE: clear of what the screen keeps for itself at each edge, and no
// nearer an edge than the page's own margin.
const LAYOUT_CLASS =
  "mx-auto flex min-h-dvh max-w-140 flex-col pt-[max(clamp(1.5rem,6.5dvh,3.5rem),env(safe-area-inset-top))] pr-[max(1.25rem,env(safe-area-inset-right))] pb-[max(2rem,env(safe-area-inset-bottom))] pl-[max(1.25rem,env(safe-area-inset-left))]";

/** Bafle's mark, in the colour of the name it stands before: the mark is cut out of that colour. */
const SPEAKER_CLASS =
  "ml-1 h-8 w-6 bg-current mask-[url(/icons/monochrome.svg)] mask-center mask-no-repeat mask-size-[3rem_3rem]";

/** This view can run even when the first render failed and the Model cannot be read. */
export const crashView = (_context: unknown, h: HtmlBuilder<never>): Document => ({
  title: "Bafle stopped.",
  // The stopped signal has the same night palette in either colour scheme.
  body: h.main(
    [h.Class("bg-crash-canvas font-sans text-crash-ink antialiased scheme-dark")],
    [
      h.div(
        [h.Class(LAYOUT_CLASS)],
        [
          h.p(
            [
              h.Class(
                "flex items-center gap-3 text-[1.625rem] leading-8 font-bold tracking-tight text-crash-orchid",
              ),
            ],
            [h.span([h.AriaHidden(true), h.Class(SPEAKER_CLASS)]), "Bafle"],
          ),
          h.div(
            [h.Class("mt-[clamp(2rem,13.5dvh,7.25rem)] mb-12")],
            [
              h.img([h.Src(waveform), h.Alt(""), h.Class("mb-5 h-auto w-[18.6rem] max-w-full")]),
              h.div(
                [h.Role("alert")],
                [
                  h.h1(
                    [h.Class("text-[2.625rem] leading-[1.1] font-extrabold tracking-tight")],
                    ["Bafle stopped."],
                  ),
                  h.p(
                    [h.Class("mt-1.5 text-[1.375rem] leading-snug text-crash-muted")],
                    ["Reload the app to keep listening."],
                  ),
                ],
              ),
            ],
          ),
          h.button(
            [
              h.Type("button"),
              // NOTE: Foldkit has stopped dispatching: no Message would be heard.
              // The browser reloads this URL itself, by the one attribute that
              // needs nothing of the app.
              // oxlint-disable-next-line foldkit/no-raw-dom-event-attributes
              h.Attribute("onclick", "location.reload()"),
              h.Class(
                "mt-auto flex min-h-[3.625rem] w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-crash-orchid px-5 py-2 text-2xl font-semibold tracking-tight text-crash-canvas hover:brightness-95 active:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-crash-orchid",
              ),
            ],
            [retryIcon("size-10 shrink-0"), "Reload Bafle"],
          ),
        ],
      ),
    ],
  ),
});
