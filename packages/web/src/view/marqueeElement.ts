import { MARQUEE_TAG } from "./marquee.ts";

// NOTE: this is the one piece of the app outside the architecture: a custom
// element, which keeps its own timers and reads the document. The Model has
// no part in it, because nothing here is the app's state: whether a title is
// wider than its place changes with the island's width, a pixel at a time.

// The times and the speed were read off the app the island is modelled on,
// frame by frame: a title starts to move about three and a half seconds
// after its place last changed, and crosses it at about 45 points a second.
// The wait between two passes is five seconds.

/** How long the words stand before their first pass, counted from when their place last changed. */
const STARTS_AFTER_MILLISECONDS = 3500;

/** How long the words stand between one pass and the next. */
const RESTS_FOR_MILLISECONDS = 5000;

const PIXELS_PER_SECOND = 45;

/** The words fit when they are no wider than their place, give or take the rounding of a layout. */
const FITS_WITHIN_PIXELS = 0.5;

// NOTE: the place reaches a little further back than where the words begin,
// and fades over that reach. Standing, the words are clear of it; moving,
// they fade into it. So the fade can always be there, and nothing changes
// look as a pass starts.
const TEMPLATE = `
<style>
  :host {
    display: block;
    min-width: 0;
  }

  .place {
    --lead: 0.5rem;
    --tail: 1rem;
    overflow: hidden;
    margin-left: calc(-1 * var(--lead));
    padding-left: var(--lead);
    white-space: nowrap;
    mask-image: linear-gradient(to right, transparent, black var(--lead));
  }

  .place.overflowing {
    mask-image: linear-gradient(
      to right,
      transparent,
      black var(--lead),
      black calc(100% - var(--tail)),
      transparent
    );
  }

  .line {
    display: inline-flex;
    gap: 2.5rem;
    will-change: transform;
  }

  .copy {
    display: none;
  }

  .overflowing .copy {
    display: inline;
  }
</style>
<div class="place"><div class="line"><span class="words"><slot></slot></span><span class="copy" aria-hidden="true"></span></div></div>
`;

/**
 * Registers the element. Called once, as the app starts in a browser: until
 * then, and in a test that draws no document, the tag is an unknown element
 * and shows its words as they are.
 */
export const defineMarqueeElement = (): void => {
  if (customElements.get(MARQUEE_TAG) !== undefined) {
    return;
  }

  const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  class MarqueeElement extends HTMLElement {
    readonly #place: HTMLElement;
    readonly #line: HTMLElement;
    readonly #words: HTMLElement;
    readonly #copy: HTMLElement;
    readonly #sizes = new ResizeObserver(() => this.#settle());
    readonly #text = new MutationObserver(() => this.#settle());
    #timer: ReturnType<typeof setTimeout> | undefined;
    #pass: Animation | undefined;

    constructor() {
      super();
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML = TEMPLATE;
      // The template above is this element's own: each of these is in it.
      this.#place = root.querySelector(".place") as HTMLElement;
      this.#line = root.querySelector(".line") as HTMLElement;
      this.#words = root.querySelector(".words") as HTMLElement;
      this.#copy = root.querySelector(".copy") as HTMLElement;
    }

    connectedCallback(): void {
      // The place changes width with the island; the words change with the track.
      this.#sizes.observe(this);
      this.#sizes.observe(this.#words);
      this.#text.observe(this, { characterData: true, childList: true, subtree: true });
      prefersReducedMotion.addEventListener("change", this.#settle);
    }

    disconnectedCallback(): void {
      this.#sizes.disconnect();
      this.#text.disconnect();
      prefersReducedMotion.removeEventListener("change", this.#settle);
      this.#stand();
    }

    /** The words go back to where they begin, and nothing is pending. */
    #stand(): void {
      clearTimeout(this.#timer);
      this.#timer = undefined;
      this.#pass?.cancel();
      this.#pass = undefined;
    }

    /**
     * The place or the words changed: the words stand, and whether they fit
     * is read again. If they do not, the wait before a first pass starts over.
     */
    readonly #settle = (): void => {
      this.#stand();
      this.#copy.textContent = this.textContent;

      const place = this.#place.getBoundingClientRect();
      const words = this.#words.getBoundingClientRect();
      const isOverflowing = words.right > place.right + FITS_WITHIN_PIXELS;
      this.#place.classList.toggle("overflowing", isOverflowing);

      if (!isOverflowing || prefersReducedMotion.matches) {
        return;
      }
      // One pass ends with the copy standing exactly where the words began.
      const distance = this.#copy.offsetLeft - this.#words.offsetLeft;
      this.#timer = setTimeout(() => this.#cross(distance), STARTS_AFTER_MILLISECONDS);
    };

    #cross(distance: number): void {
      const pass = this.#line.animate(
        [{ transform: "translateX(0)" }, { transform: `translateX(${-distance}px)` }],
        { duration: (distance / PIXELS_PER_SECOND) * 1000, easing: "linear" },
      );
      this.#pass = pass;
      pass.finished.then(
        () => {
          // A pass that was not the last one started has nothing to follow it.
          if (this.#pass === pass) {
            this.#timer = setTimeout(() => this.#cross(distance), RESTS_FOR_MILLISECONDS);
          }
        },
        // A cancelled pass: the words were made to stand, and what follows is theirs to say.
        () => undefined,
      );
    }
  }

  customElements.define(MARQUEE_TAG, MarqueeElement);
};
