import { expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import { rgbaToThumbHash } from "thumbhash";
import { likenessStyle } from "../src/view/likeness.ts";

const terracotta = (() => {
  const rgba = new Uint8Array(8 * 8 * 4).map((_, index) => [200, 90, 60, 255][index % 4] ?? 0);
  return btoa(String.fromCharCode(...rgbaToThumbHash(8, 8, rgba)));
})();

const picture = (placeholder: string | null) => ({
  small: "https://img.test/small",
  medium: "https://img.test/medium",
  large: "https://img.test/large",
  placeholder,
});

it("a picture with a likeness has it drawn as the ground of its box, until the picture covers it", () => {
  const style = likenessStyle(Option.some(picture(terracotta)));
  expect(style.backgroundImage).toMatch(/^url\("data:image\/png;base64,/);
  expect(style.backgroundSize).toBe("cover");
});

it("a picture without one, or with one that cannot be read, keeps the box's plain ground", () => {
  expect(likenessStyle(Option.some(picture(null)))).toEqual({});
  expect(likenessStyle(Option.some(picture("not base64 at all!")))).toEqual({});
  expect(likenessStyle(Option.none())).toEqual({});
});
