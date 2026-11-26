import type { Artwork } from "@bafle/domain/Catalog/Artwork";
import * as Option from "effect/Option";
import { thumbHashToDataURL } from "thumbhash";

/**
 * A picture's likeness, drawn: the ThumbHash the catalog sent with the
 * picture (`placeholder` on `Artwork`) as a small blurred image, which the
 * box the picture goes in shows as its ground. The picture is drawn over it
 * when it comes, so the box shows the picture's colours and shapes from the
 * moment its page does, and is never empty. Without a likeness the box shows
 * its plain ground, as it always did.
 */
// NOTE: a likeness never changes, and a page draws the same ones on every
// update: each is drawn once and kept, by the ThumbHash itself.
const drawn = new Map<string, Option.Option<string>>();

const fromBase64 = (text: string): Option.Option<Uint8Array> =>
  Option.liftThrowable(() => Uint8Array.from(atob(text), (letter) => letter.charCodeAt(0)))();

const imageOf = (placeholder: string): Option.Option<string> => {
  const known = drawn.get(placeholder);
  if (known !== undefined) return known;
  const image = Option.flatMap(fromBase64(placeholder), (bytes) =>
    Option.liftThrowable(() => thumbHashToDataURL(bytes))(),
  );
  drawn.set(placeholder, image);
  return image;
};

/** What a picture's box takes from its likeness: the blurred image as its ground, if there is one. */
export const likenessStyle = (
  maybeArtwork: Option.Option<Artwork>,
): Readonly<Record<string, string>> =>
  Option.match(
    Option.flatMap(maybeArtwork, (artwork) =>
      Option.flatMap(Option.fromNullishOr(artwork.placeholder), imageOf),
    ),
    {
      onNone: () => ({}),
      onSome: (image) => ({
        backgroundImage: `url("${image}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }),
    },
  );
