import { describe, test } from "vitest";
import { looksAs, pressed, stoppedLooksAs } from "./draw.ts";
import * as Models from "./models.ts";

// THE SECTIONS, LOOKED AT

describe("Home", () => {
  test("on a phone", () => looksAs("home-phone", { model: Models.home, screen: "Phone" }));

  test("on a desktop", () => looksAs("home-desktop", { model: Models.home, screen: "Desktop" }));

  test("on the dark page", () =>
    looksAs("home-phone-dark", { model: Models.home, screen: "Phone", scheme: "dark" }));

  test("before the catalog has answered", () =>
    looksAs("home-waiting-phone", { model: Models.homeWaiting, screen: "Phone" }));

  test("when the catalog could not be asked", () =>
    looksAs("home-failed-phone", { model: Models.homeFailed, screen: "Phone" }));

  test("when the catalog has nothing to recommend", () =>
    looksAs("home-empty-phone", { model: Models.homeEmpty, screen: "Phone" }));

  test("with who made the app open", () =>
    looksAs("home-about-phone", {
      model: Models.home,
      screen: "Phone",
      arrange: pressed("About Bafle"),
    }));

  test("with a tile's page on its way", () =>
    looksAs("home-album-opening-phone", { model: Models.albumOpening, screen: "Phone" }));

  test("with a tile whose page could not be asked", () =>
    looksAs("home-album-failed-phone", { model: Models.albumFailedFromTile, screen: "Phone" }));

  test("with a tile whose page could not be asked, on a desktop", () =>
    looksAs("home-album-failed-desktop", {
      model: Models.albumFailedFromTile,
      screen: "Desktop",
    }));

  test("showing what it loaded earlier", () =>
    looksAs("home-stale-phone", { model: Models.homeStale, screen: "Phone" }));

  test("showing what it loaded earlier, on a desktop", () =>
    looksAs("home-stale-desktop", { model: Models.homeStale, screen: "Desktop" }));
});

describe("New", () => {
  test("on a phone", () => looksAs("new-phone", { model: Models.newMusic, screen: "Phone" }));

  test("on a desktop", () => looksAs("new-desktop", { model: Models.newMusic, screen: "Desktop" }));

  test("on the dark page, on a desktop", () =>
    looksAs("new-desktop-dark", { model: Models.newMusic, screen: "Desktop", scheme: "dark" }));

  test("before the catalog has answered, on a phone", () =>
    looksAs("new-waiting-phone", { model: Models.newWaiting, screen: "Phone" }));

  test("before the catalog has answered, on a desktop", () =>
    looksAs("new-waiting-desktop", { model: Models.newWaiting, screen: "Desktop" }));
});

describe("Genres", () => {
  test("on a phone", () => looksAs("genres-phone", { model: Models.genres, screen: "Phone" }));

  test("on a desktop", () =>
    looksAs("genres-desktop", { model: Models.genres, screen: "Desktop" }));

  test("before the catalog has answered", () =>
    looksAs("genres-waiting-phone", { model: Models.genresWaiting, screen: "Phone" }));
});

describe("Radio", () => {
  test("on a phone", () => looksAs("radio-phone", { model: Models.radio, screen: "Phone" }));

  test("on a desktop", () => looksAs("radio-desktop", { model: Models.radio, screen: "Desktop" }));

  test("before the catalog has answered", () =>
    looksAs("radio-waiting-desktop", { model: Models.radioWaiting, screen: "Desktop" }));
});

describe("a page that is not there", () => {
  test("on a phone", () => looksAs("not-found-phone", { model: Models.notFound, screen: "Phone" }));
});

describe("the page that says the app stopped", () => {
  test("on a phone", () => stoppedLooksAs("stopped-phone", "Phone"));

  test("on a desktop", () => stoppedLooksAs("stopped-desktop", "Desktop"));
});
