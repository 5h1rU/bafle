import { islandOutline } from "./islandOutline.ts";
import { ISLAND_SHAPE_TAG, ISLAND_TAIL_ATTRIBUTE, type IslandLight } from "./islandShape.ts";

// NOTE: like the marquee, this is a custom element outside the architecture,
// and for the same reason: what it draws depends on how wide the island is
// in the document, a pixel at a time while the island changes place. It
// keeps no state of the app's. The Model tells it two things, through its
// two properties, and it tells the Model nothing.

// NOTE: the figure and the light are separate pictures. The light moves on
// every frame; the figure, with its blurred copy of the cover, would be
// drawn again with it if they were one. The figure lies behind the island's
// pieces and the light over them, so the light is seen all the way round,
// across the rim of the cover too, and falls a little on what it passes.

// NOTE: the light has a view transition name of its own. When a song
// changes, the browser fades a still picture of the island into the live
// island; the still picture would hold the light where it was when the
// picture was taken, and the light would seem to stop and then catch up.
// Under its own name the light is left out of the island's picture, and
// styles.css shows only the live one. The name is given there too, through
// the `lights` part: a name set from inside a shadow tree belongs to that
// tree, and the document's transition does not see it.

// The island has no edge of another colour: at rest it is one flat figure.
// What travels its outline is a light, not a line, and it is made of two
// things. The glow is a short, wide stroke in a picture of its own that is
// blurred, so it has no edge and spills to both sides of the outline. The
// beam is thin and lies on the outline itself: the same stroke laid many
// times over one stretch, each time shorter and each ending at the head, so
// that it is brightest at the head and thins out behind with no gradient,
// which a stroke cannot have along its length; and over its head a few
// strokes that are almost white. Lengths are in hundredths of the whole
// outline.
//
// The light never starts or stops at once. Put to rest, it slows to a halt
// where it is and dims to an ember that stays there; set going again, it
// brightens and gathers speed from that same place. Taking the animation
// away would put it back where it set out, in one frame.

/** How wide the beam is. */
const BEAM_WIDTH = 2;

/** How wide the glow is before it is blurred, and by how much it is blurred. */
const GLOW_WIDTH = 7;
const GLOW_BLUR = 3;

/** How much of the outline the light covers, from the end of its tail to its head. */
const LIGHT_LENGTH = 5;

const TAIL_LAYERS = 10;

/** How long the light takes to go once round, at full speed. */
const LOOP_MILLISECONDS = 10_000;

/** How long it takes to gather speed, or to lose it. */
const CHANGES_PACE_OVER_MILLISECONDS = 1400;

/** Below this share of its full speed the light is taken to have stopped. */
const STOPPED_BELOW = 0.001;

/** One stroke of the light, `length` long, ending `behind` the head. */
const lightStroke = (className: string, length: number, behind = 0): string => {
  const setsOut = length + behind - LIGHT_LENGTH;
  return `<path class="outline travels ${className}" pathLength="100" stroke-dasharray="${length} ${100 - length}" data-sets-out="${setsOut}" stroke-dashoffset="${setsOut}" />`;
};

const BEAM = [
  ...Array.from({ length: TAIL_LAYERS }, (_, layer) =>
    lightStroke("tail", LIGHT_LENGTH * (1 - layer / TAIL_LAYERS) ** 1.6),
  ),
  lightStroke("head faint", LIGHT_LENGTH * 0.2),
  lightStroke("head", LIGHT_LENGTH * 0.11),
  lightStroke("head", LIGHT_LENGTH * 0.05),
].join("\n  ");

// The glow is widest about the head and reaches a little ahead of it.
const GLOW = [
  lightStroke("glow far", LIGHT_LENGTH * 0.8, -LIGHT_LENGTH * 0.04),
  lightStroke("glow near", LIGHT_LENGTH * 0.32, -LIGHT_LENGTH * 0.04),
].join("\n  ");

const TEMPLATE = `
<style>
  :host {
    position: absolute;
    inset: 0;
    display: block;
    pointer-events: none;
  }

  svg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  /* NOTE: the shadow is the figure once more, under the figure, in a
     picture of its own: within the island's own picture it would be cut
     where that picture is cut while a song changes (styles.css gives it its
     own name for the transition, as it does the light). */
  .shadow {
    z-index: -2;
    filter: drop-shadow(var(--island-shadow, none));
  }

  .figure {
    z-index: -1;
  }

  .body {
    fill: var(--color-island);
  }

  .tint {
    opacity: 0.85;
  }

  .lights {
    position: absolute;
    inset: 0;
    z-index: 1;
  }

  .light {
    opacity: 0;
    transition: opacity ${CHANGES_PACE_OVER_MILLISECONDS}ms ease-in-out;
  }

  .light.resting {
    opacity: 0.3;
  }

  .light.travelling {
    opacity: 1;
  }

  .light.soft {
    filter: blur(${GLOW_BLUR}px);
  }

  .light path {
    fill: none;
    stroke-linecap: round;
  }

  .glow {
    stroke: var(--color-island-light);
    stroke-width: ${GLOW_WIDTH};
  }

  .glow.far {
    stroke-opacity: 0.5;
  }

  .glow.near {
    stroke-opacity: 0.9;
  }

  .tail {
    stroke: var(--color-island-light);
    stroke-width: ${BEAM_WIDTH};
    stroke-opacity: 0.24;
  }

  .head {
    stroke: var(--color-island-light-head);
    stroke-width: ${BEAM_WIDTH};
    stroke-opacity: 0.6;
  }

  .head.faint {
    stroke-opacity: 0.3;
  }
</style>
<svg class="shadow" part="shadow" aria-hidden="true">
  <path class="outline body" />
</svg>
<svg class="figure" aria-hidden="true">
  <defs>
    <clipPath id="within"><path class="outline" /></clipPath>
    <linearGradient id="fading" gradientUnits="userSpaceOnUse" x1="44" y1="0" x2="132" y2="0">
      <stop offset="0" stop-color="#fff" />
      <stop offset="1" stop-color="#000" />
    </linearGradient>
    <mask id="fade" maskUnits="userSpaceOnUse" x="-20" y="-40" width="200" height="124">
      <rect x="-20" y="-40" width="200" height="124" fill="url(#fading)" />
    </mask>
    <filter id="blur" filterUnits="userSpaceOnUse" x="-80" y="-110" width="320" height="264">
      <feGaussianBlur stdDeviation="16" />
    </filter>
  </defs>
  <path class="outline body" />
  <g clip-path="url(#within)">
    <g mask="url(#fade)">
      <image class="tint" x="-40" y="-68" width="180" height="180" preserveAspectRatio="xMidYMid slice" filter="url(#blur)" />
    </g>
  </g>
</svg>
<div class="lights" part="lights">
  <svg class="light soft" aria-hidden="true">
    ${GLOW}
  </svg>
  <svg class="light" aria-hidden="true">
    ${BEAM}
  </svg>
</div>
`;

/**
 * Registers the element. Called once, as the app starts in a browser: until
 * then, and in a test that draws no document, the tag is an unknown element
 * that draws nothing.
 */
export const defineIslandShapeElement = (): void => {
  if (customElements.get(ISLAND_SHAPE_TAG) !== undefined) {
    return;
  }

  const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  /** Slow to leave one pace and slow to reach the other. */
  const eased = (share: number): number => share * share * (3 - 2 * share);

  class IslandShapeElement extends HTMLElement {
    readonly #outlines: ReadonlyArray<SVGPathElement>;
    readonly #strokes: ReadonlyArray<SVGPathElement>;
    readonly #lights: ReadonlyArray<SVGSVGElement>;
    readonly #tint: SVGImageElement;
    readonly #sizes = new ResizeObserver(() => this.#draw());
    #maybeTail: Element | null = null;
    #drawn = "";
    #cover = "";
    #light: IslandLight = "Resting";
    #hasTravelled = false;
    #travels: ReadonlyArray<Animation> = [];
    /** The light's speed, as a share of its full speed. */
    #pace = 0;
    #paceChange: number | undefined;

    constructor() {
      super();
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML = TEMPLATE;
      this.#outlines = Array.from(root.querySelectorAll<SVGPathElement>(".outline"));
      this.#strokes = Array.from(root.querySelectorAll<SVGPathElement>(".travels"));
      this.#lights = Array.from(root.querySelectorAll<SVGSVGElement>(".light"));
      // The template above is this element's own: the picture is in it.
      this.#tint = root.querySelector(".tint") as SVGImageElement;
    }

    /** The picture the figure takes its colours from near the cover; empty for none. */
    get cover(): string {
      return this.#cover;
    }

    set cover(value: string) {
      this.#cover = value;
      if (value === "") {
        this.#tint.removeAttribute("href");
      } else {
        this.#tint.setAttribute("href", value);
      }
    }

    /**
     * What the light is to do. `Travelling` sets it going and `Resting` slows
     * it to a halt. `Holding` changes nothing: whatever it was doing, it goes
     * on doing. A light that has never travelled stays dark until it does.
     */
    get light(): IslandLight {
      return this.#light;
    }

    set light(value: IslandLight) {
      if (value === this.#light) {
        return;
      }
      this.#light = value;
      if (value === "Holding" || (value === "Resting" && !this.#hasTravelled)) {
        return;
      }
      const isTravelling = value === "Travelling";
      this.#hasTravelled = true;
      this.#lights.forEach((light) => {
        light.classList.toggle("travelling", isTravelling);
        light.classList.toggle("resting", !isTravelling);
      });
      this.#changePace(isTravelling ? 1 : 0);
    }

    connectedCallback(): void {
      this.#sizes.observe(this);
      this.#draw();
    }

    disconnectedCallback(): void {
      this.#sizes.disconnect();
      this.#maybeTail = null;
      if (this.#paceChange !== undefined) {
        cancelAnimationFrame(this.#paceChange);
        this.#paceChange = undefined;
      }
      this.#travels.forEach((travel) => travel.cancel());
      this.#travels = [];
      this.#pace = 0;
    }

    /**
     * The light's strokes, each going once round the outline for ever, made
     * the first time the light is to move and held still until then. Under
     * reduced motion there are none: the light stays where it is drawn.
     */
    #travelling(): ReadonlyArray<Animation> {
      if (this.#travels.length === 0 && !prefersReducedMotion.matches) {
        this.#travels = this.#strokes.map((stroke) => {
          const setsOut = Number(stroke.dataset["setsOut"]);
          const travel = stroke.animate(
            [{ strokeDashoffset: setsOut }, { strokeDashoffset: setsOut - 100 }],
            { duration: LOOP_MILLISECONDS, iterations: Infinity },
          );
          travel.pause();
          return travel;
        });
      }
      return this.#travels;
    }

    #setPace(pace: number): void {
      this.#pace = pace;
      this.#travelling().forEach((travel) => {
        if (pace < STOPPED_BELOW) {
          travel.pause();
        } else {
          travel.playbackRate = pace;
          travel.play();
        }
      });
    }

    /** Gather speed, or lose it, from whatever pace the light has now. */
    #changePace(to: number): void {
      if (this.#paceChange !== undefined) {
        cancelAnimationFrame(this.#paceChange);
      }
      const from = this.#pace;
      const began = performance.now();
      const step = (now: number): void => {
        const share = Math.min(1, (now - began) / CHANGES_PACE_OVER_MILLISECONDS);
        this.#setPace(from + (to - from) * eased(share));
        this.#paceChange = share < 1 ? requestAnimationFrame(step) : undefined;
      };
      this.#paceChange = requestAnimationFrame(step);
    }

    /**
     * The piece whose width is the tail's reach. It is looked for again
     * whenever it is no longer the one in the document: the app may have
     * put another in its place.
     */
    #tail(): Element | null {
      if (this.#maybeTail?.isConnected !== true) {
        this.#maybeTail =
          this.parentElement?.querySelector(`[data-${ISLAND_TAIL_ATTRIBUTE}]`) ?? null;
        if (this.#maybeTail !== null) {
          this.#sizes.observe(this.#maybeTail);
        }
      }
      return this.#maybeTail;
    }

    /** The island or its tail changed width: the outline is worked out again. */
    #draw(): void {
      const width = this.getBoundingClientRect().width;
      if (width === 0) {
        return;
      }
      const tailWidth = this.#tail()?.getBoundingClientRect().width ?? 0;
      const outline = islandOutline(width, tailWidth);
      if (outline === this.#drawn) {
        return;
      }
      this.#drawn = outline;
      this.#outlines.forEach((path) => path.setAttribute("d", outline));
    }
  }

  customElements.define(ISLAND_SHAPE_TAG, IslandShapeElement);
};
