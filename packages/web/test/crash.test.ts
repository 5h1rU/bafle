import * as Schema from "effect/Schema";
import { Runtime } from "foldkit";
import { expect, test, vi } from "vitest";
import { crashView } from "../src/view/crash.ts";

test("a DOM failure before the first page mounts leaves a visible reload button", async () => {
  const previousTitle = document.title;
  const host = document.createElement("div");
  const container = document.createElement("div");
  container.id = "crash-test-root";
  host.append(container);
  document.body.append(host);

  const failure = new Error("First page could not mount");
  const createElement = document.createElement.bind(document);
  const create = vi.spyOn(document, "createElement").mockImplementation((tag, options) => {
    if (tag === "article") throw failure;
    return createElement(tag, options);
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const app = Runtime.embed(
    Runtime.makeApplication({
      Model: Schema.String,
      init: () => ({ model: "" }),
      update: (model) => ({ model }),
      view: (_model, h) => ({ title: "Opening Bafle", body: h.article([], []) }),
      crash: { view: crashView },
      container,
      devTools: false,
    }),
  );

  try {
    await vi.waitFor(() => expect(host.querySelector("h1")?.textContent).toBe("Bafle stopped."));
    expect(document.title).toBe("Bafle stopped.");
    expect(host.querySelector("button")?.textContent).toBe("Reload Bafle");
    expect(log).toHaveBeenCalledWith("[foldkit] Application crash:", failure);
  } finally {
    app.dispose();
    create.mockRestore();
    log.mockRestore();
    host.remove();
    document.title = previousTitle;
  }
});
