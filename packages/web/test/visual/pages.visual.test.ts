import { describe, test } from "vitest";
import { looksAs, scrolled } from "./draw.ts";
import * as Models from "./models.ts";

// THE PAGES OF ONE THING, LOOKED AT

describe("a track's page", () => {
  test("on a phone", () => looksAs("track-phone", { model: Models.track, screen: "Phone" }));

  test("on a desktop", () => looksAs("track-desktop", { model: Models.track, screen: "Desktop" }));

  test("before the catalog has answered", () =>
    looksAs("track-waiting-desktop", { model: Models.trackWaiting, screen: "Desktop" }));

  test("when the catalog does not have the track", () =>
    looksAs("track-missing-phone", { model: Models.trackMissing, screen: "Phone" }));
});

describe("an album's page", () => {
  test("on a phone", () => looksAs("album-phone", { model: Models.album, screen: "Phone" }));

  test("on a desktop", () => looksAs("album-desktop", { model: Models.album, screen: "Desktop" }));

  test("on the dark page", () =>
    looksAs("album-phone-dark", { model: Models.album, screen: "Phone", scheme: "dark" }));

  test("with its head part of the way to the bar", () =>
    looksAs("album-scrolling-phone", {
      model: Models.album,
      screen: "Phone",
      arrange: scrolled("#album-page", 180),
    }));

  test("with its head drawn back to the bar", () =>
    looksAs("album-scrolled-phone", {
      model: Models.album,
      screen: "Phone",
      arrange: scrolled("#album-page", 2000),
    }));

  test("with its head drawn back to the bar, on a desktop", () =>
    looksAs("album-scrolled-desktop", {
      model: Models.album,
      screen: "Desktop",
      arrange: scrolled("#album-page", 2000),
    }));

  test("of one song", () =>
    looksAs("album-of-one-song-phone", { model: Models.albumOfOneSong, screen: "Phone" }));

  test("before the catalog has answered", () =>
    looksAs("album-waiting-phone", { model: Models.albumWaiting, screen: "Phone" }));

  test("when the catalog does not have the album", () =>
    looksAs("album-missing-phone", { model: Models.albumMissing, screen: "Phone" }));

  test("when the catalog could not be asked", () =>
    looksAs("album-failed-desktop", { model: Models.albumFailed, screen: "Desktop" }));
});

describe("an artist's page", () => {
  test("on a phone", () => looksAs("artist-phone", { model: Models.artist, screen: "Phone" }));

  test("on a desktop", () =>
    looksAs("artist-desktop", { model: Models.artist, screen: "Desktop" }));

  test("before the catalog has answered, on a phone", () =>
    looksAs("artist-waiting-phone", { model: Models.artistWaiting, screen: "Phone" }));

  test("before the catalog has answered, on a desktop", () =>
    looksAs("artist-waiting-desktop", { model: Models.artistWaiting, screen: "Desktop" }));
});

describe("a playlist's page", () => {
  test("on a phone", () => looksAs("playlist-phone", { model: Models.playlist, screen: "Phone" }));

  test("on a desktop", () =>
    looksAs("playlist-desktop", { model: Models.playlist, screen: "Desktop" }));

  test("before the catalog has answered", () =>
    looksAs("playlist-waiting-phone", { model: Models.playlistWaiting, screen: "Phone" }));
});

describe("a genre's page", () => {
  test("on a phone", () => looksAs("genre-phone", { model: Models.genre, screen: "Phone" }));

  test("on a desktop", () => looksAs("genre-desktop", { model: Models.genre, screen: "Desktop" }));

  test("further down, on a desktop", () =>
    looksAs("genre-further-desktop", {
      model: Models.genre,
      screen: "Desktop",
      arrange: scrolled("#genre-page", 600),
    }));

  test("before the catalog has answered", () =>
    looksAs("genre-waiting-desktop", { model: Models.genreWaiting, screen: "Desktop" }));
});

describe("a station's page", () => {
  test("on a phone", () => looksAs("station-phone", { model: Models.station, screen: "Phone" }));

  test("on a desktop", () =>
    looksAs("station-desktop", { model: Models.station, screen: "Desktop" }));

  test("before the catalog has answered", () =>
    looksAs("station-waiting-phone", { model: Models.stationWaiting, screen: "Phone" }));
});
