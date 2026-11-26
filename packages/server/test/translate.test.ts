import { expect, it } from "@effect/vitest";
import { toArtwork } from "../src/Deezer/translate.ts";

const deezerImage = (size: number, extension: string) =>
  `https://cdn-images.dzcdn.net/images/cover/22e3ab6a96c843e538a8a4ba6ad4debe/${size}x${size}-000000-80-0-0.${extension}`;

it("artwork: a picture from Deezer's image server is asked for as WebP, at the sizes Deezer gave", () => {
  expect(toArtwork(deezerImage(250, "jpg"), deezerImage(500, "jpg"), deezerImage(1000, "jpg"))).toEqual({
    small: deezerImage(250, "webp"),
    medium: deezerImage(500, "webp"),
    large: deezerImage(1000, "webp"),
    placeholder: null,
  });
});

it("artwork: an address of another shape is left as Deezer gave it", () => {
  const elsewhere = {
    small: "https://cdn.test/1/250.jpg",
    medium: "https://api.deezer.com/album/302127/image?size=big",
    large: "https://cdn-images.dzcdn.net/images/cover/22e3ab6a96c843e538a8a4ba6ad4debe/1000x1000-000000-80-0-0.png",
    placeholder: null,
  };
  expect(toArtwork(elsewhere.small, elsewhere.medium, elsewhere.large)).toEqual(elsewhere);
});

it("artwork: without all three sizes there is none", () => {
  expect(toArtwork(deezerImage(250, "jpg"), null, deezerImage(1000, "jpg"))).toBeNull();
  expect(toArtwork(deezerImage(250, "jpg"), deezerImage(500, "jpg"), "")).toBeNull();
});
