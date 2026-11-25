import type { Document, HtmlBuilder } from "foldkit/html";
import waveform from "../assets/crash-waveform.png?inline";
import { retryIcon } from "./icon.ts";

/** This view can run even when the first render failed and the Model cannot be read. */
export const crashView = (_context: unknown, h: HtmlBuilder<never>): Document => ({
  title: "Bafle stopped.",
  body: h.main([h.Class("crash-screen font-sans antialiased")], [
    h.div([h.Class("crash-layout")], [
      h.p(
        [h.Class("flex items-center gap-3 text-[1.625rem] leading-8 font-bold tracking-tight text-crash-orchid")],
        [h.span([h.AriaHidden(true), h.Class("crash-speaker")], []), "Bafle"],
      ),
      h.div([h.Class("crash-message")], [
        h.img([h.Src(waveform), h.Alt(""), h.Class("mb-5 h-auto w-[18.6rem] max-w-full")]),
        h.div([h.Role("alert")], [
          h.h1([h.Class("text-[2.625rem] leading-[1.1] font-extrabold tracking-tight")], [
            "Bafle stopped.",
          ]),
          h.p([h.Class("mt-1.5 text-[1.375rem] leading-snug text-crash-muted")], [
            "Reload the app to keep listening.",
          ]),
        ]),
      ]),
      h.button(
        [
          h.Type("button"),
          // Foldkit has stopped dispatching. The browser reloads this URL directly.
          h.Attribute("onclick", "location.reload()"),
          h.Class(
            "mt-auto flex min-h-[3.625rem] w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-crash-orchid px-5 py-2 text-2xl font-semibold tracking-tight text-crash-canvas hover:brightness-95 active:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-crash-orchid",
          ),
        ],
        [retryIcon("size-10 shrink-0"), "Reload Bafle"],
      ),
    ]),
  ]),
});
