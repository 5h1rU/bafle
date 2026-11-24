import { CustomElement } from "foldkit";

// VIEW

export const MARQUEE_TAG = "bafle-marquee";

/**
 * A line of words that may be longer than its place. One that fits is just
 * the words. One that does not waits, then travels across its place once,
 * its copy following it in, until the copy stands where the words began;
 * then it waits again. The words that reach an end of the place fade there.
 *
 * It asks nothing of the Model and tells it nothing: whether the words fit
 * is a matter of pixels, known only in the document, and the element in
 * `marqueeElement.ts` settles it there. Until that element is registered,
 * and wherever it is not, the words are simply cut at the end of their place.
 */
export const Marquee = CustomElement.define({
  tag: MARQUEE_TAG,
  properties: {},
  events: {},
});
