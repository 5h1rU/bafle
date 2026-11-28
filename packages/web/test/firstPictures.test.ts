import { expect, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { afterEach, vi } from "vitest";
import { PICTURE_WAIT, preparePictures } from "../src/command.ts";
import { ROWS_AT_ONCE, firstPicturesOf } from "../src/view/firstPictures.ts";
import {
  album,
  artist,
  featured,
  fullAlbum,
  fullGenre,
  otherGenre,
  playlist,
  reply,
  track,
  trending,
} from "./fixtures.ts";

// A page takes the screen with the pictures it opens with already painted: the reply for it is
// held until they are loaded and decoded, and never longer than a moment.

it("a list of shelves waits for the first tiles of its first two shelves", () => {
  const pictured = { ...playlist, picture: otherGenre.picture };
  expect(firstPicturesOf(reply.home("page:0", { ...featured, playlists: [pictured] }))).toEqual([
    album.cover?.medium,
    otherGenre.picture?.medium,
  ]);
});

it("Search prepares the large artist portrait with the album tiles and song thumbnails", () => {
  expect(firstPicturesOf(reply.search("page:0"))).toEqual([
    artist.picture?.large,
    album.cover?.medium,
    track.album.cover?.small,
  ]);
});

it("a page with a head waits for the small rendition under its picture, and the thumbnails of its first rows", () => {
  // The genre has no picture; its first track's album has a cover, the second's has none.
  expect(firstPicturesOf(reply.genre("page:1", fullGenre))).toEqual([track.album.cover?.small]);
  expect(firstPicturesOf(reply.album("page:2", fullAlbum))).toEqual([fullAlbum.cover?.small]);
});

it("only the rows a screen holds are waited for, and a picture once", () => {
  const many = Array.from({ length: ROWS_AT_ONCE + 4 }, () => track);
  expect(firstPicturesOf(reply.newMusic("page:3", { ...trending, tracks: many }))).toEqual([
    track.album.cover?.small,
  ]);
});

it("a failure waits for no picture", () => {
  expect(firstPicturesOf(reply.homeLost("page:4"))).toEqual([]);
  expect(firstPicturesOf(reply.trackMissing("page:5"))).toEqual([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A browser in which a picture's decoding ends when the test says so. */
const picturesThat = (decode: () => Promise<void>) => {
  const asked: Array<string> = [];
  vi.stubGlobal(
    "Image",
    class {
      set src(url: string) {
        asked.push(url);
      }
      decode = decode;
    },
  );
  return asked;
};

it.effect("pictures that never finish hold the reply for 300 ms, and not a moment more", () =>
  Effect.gen(function* () {
    expect(Duration.toMillis(PICTURE_WAIT)).toBe(300);
    const asked = picturesThat(() => new Promise<void>(() => {}));

    const waiting = yield* Effect.forkChild(
      preparePictures(["https://img.test/a", "https://img.test/b"]),
    );
    yield* TestClock.adjust(Duration.millis(299));
    expect(waiting.pollUnsafe()).toBeUndefined();
    expect(asked).toEqual(["https://img.test/a", "https://img.test/b"]);

    yield* TestClock.adjust(Duration.millis(1));
    yield* Fiber.join(waiting);
  }),
);

it.effect("ready pictures, or pictures that fail to load, hold nothing", () =>
  Effect.gen(function* () {
    picturesThat(() => Promise.resolve());
    yield* preparePictures(["https://img.test/a"]);

    picturesThat(() => Promise.reject(new Error("not a picture")));
    yield* preparePictures(["https://img.test/b"]);

    yield* preparePictures([]);
  }),
);
