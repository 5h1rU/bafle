import { describe, test } from "vitest";
import { userEvent } from "vitest/browser";
import { looksAs, pressed, scrolled } from "./draw.ts";
import * as Models from "./models.ts";

// THE PLAYER, LOOKED AT

describe("the island", () => {
  test("over the navigation, on a phone", () =>
    looksAs("island-phone", { model: Models.sounding, screen: "Phone" }));

  test("on the dark page", () =>
    looksAs("island-phone-dark", { model: Models.sounding, screen: "Phone", scheme: "dark" }));

  test("in the navigation's row, once the page is scrolled", () =>
    looksAs("island-docked-phone", {
      model: Models.soundingScrolled,
      screen: "Phone",
      arrange: scrolled("#new-page", 300),
    }));

  test("on a desktop's screen, with the progress in its chin", () =>
    looksAs("island-desktop", { model: Models.sounding, screen: "Desktop" }));

  test("on a desktop's dark page", () =>
    looksAs("island-desktop-dark", { model: Models.sounding, screen: "Desktop", scheme: "dark" }));
});

describe("a row's menu", () => {
  test("open on a phone", () =>
    looksAs("row-menu-phone", {
      model: Models.sounding,
      screen: "Phone",
      arrange: pressed("More: Kerala"),
    }));

  test("open on a desktop", () =>
    looksAs("row-menu-desktop", {
      model: Models.sounding,
      screen: "Desktop",
      arrange: pressed("More: Kerala"),
    }));
});

describe("a row under the pointer", () => {
  test("lights its whole surface", () =>
    looksAs("row-hovered-desktop", {
      model: Models.newMusic,
      screen: "Desktop",
      arrange: async (root) => {
        const row = root.querySelector("#new-page [data-row-play]");
        if (row === null) {
          throw new Error("No row to lay the pointer on");
        }
        await userEvent.hover(row);
      },
    }));
});

describe("the player expanded", () => {
  test("on the song's face", () =>
    looksAs("player-song-phone", { model: Models.expanded, screen: "Phone" }));

  test("on the song's face, on the dark page", () =>
    looksAs("player-song-phone-dark", { model: Models.expanded, screen: "Phone", scheme: "dark" }));

  test("on the queue's face", () =>
    looksAs("player-queue-phone", { model: Models.expandedQueue, screen: "Phone" }));

  test("on the face of the song's details", () =>
    looksAs("player-details-phone", { model: Models.expandedDetails, screen: "Phone" }));

  test("with its menu open", () =>
    looksAs("player-menu-phone", {
      model: Models.expanded,
      screen: "Phone",
      arrange: pressed(/^More: /),
    }));
});

describe("the queue beside the page", () => {
  test("on a desktop", () =>
    looksAs("queue-column-desktop", { model: Models.queueBeside, screen: "Desktop" }));

  test("on a desktop's dark page", () =>
    looksAs("queue-column-desktop-dark", {
      model: Models.queueBeside,
      screen: "Desktop",
      scheme: "dark",
    }));
});
