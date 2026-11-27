import { describe, test } from "vitest";
import { looksAs, scrolled } from "./draw.ts";
import * as Models from "./models.ts";

// SEARCH, LOOKED AT

describe("Search", () => {
  test("with nothing asked, on a phone", () =>
    looksAs("search-empty-phone", { model: Models.searchEmpty, screen: "Phone" }));

  test("with nothing asked, on a desktop", () =>
    looksAs("search-empty-desktop", { model: Models.searchEmpty, screen: "Desktop" }));

  test("while the first answer is on its way", () =>
    looksAs("search-asking-phone", { model: Models.searchAsking, screen: "Phone" }));

  test("with what was found, on a phone", () =>
    looksAs("search-found-phone", { model: Models.searchFound, screen: "Phone" }));

  test("with what was found, on a desktop", () =>
    looksAs("search-found-desktop", { model: Models.searchFound, screen: "Desktop" }));

  test("with what was found, on the dark page", () =>
    looksAs("search-found-desktop-dark", {
      model: Models.searchFound,
      screen: "Desktop",
      scheme: "dark",
    }));

  test("further down what was found, on a phone", () =>
    looksAs("search-found-further-phone", {
      model: Models.searchFound,
      screen: "Phone",
      arrange: scrolled("#search-page", 700),
    }));

  test("further down what was found, on a desktop", () =>
    looksAs("search-found-further-desktop", {
      model: Models.searchFound,
      screen: "Desktop",
      arrange: scrolled("#search-page", 520),
    }));

  test("with no artist found first, on a desktop", () =>
    looksAs("search-no-artist-desktop", { model: Models.searchFoundNoArtist, screen: "Desktop" }));

  test("with no artist found first, on a phone", () =>
    looksAs("search-no-artist-phone", { model: Models.searchFoundNoArtist, screen: "Phone" }));

  test("with nothing found, on a phone", () =>
    looksAs("search-nothing-phone", { model: Models.searchNothing, screen: "Phone" }));

  test("with nothing found, on a desktop", () =>
    looksAs("search-nothing-desktop", { model: Models.searchNothing, screen: "Desktop" }));

  test("when the catalog could not be asked", () =>
    looksAs("search-failed-phone", { model: Models.searchFailed, screen: "Phone" }));
});
