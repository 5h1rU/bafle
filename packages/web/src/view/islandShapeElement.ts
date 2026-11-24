import { islandOutline } from "./islandOutline.ts";
import { ISLAND_SHAPE_TAG, ISLAND_TAIL_ATTRIBUTE } from "./islandShape.ts";

// NOTE: like the marquee, this is a custom element outside the architecture,
// and for the same reason: what it draws depends on how wide the island is
// in the document, a pixel at a time while the island changes place. It
// keeps no state of the app's. The Model tells it two things, through its
// two properties, and it tells the Model nothing.

// NOTE: the figure and the light are two pictures. The light moves on every
// frame; the figure, with its blurred copy of the cover, would be drawn
// again with it if they were one. The figure lies behind the island's
// pieces and the light over them, so the light is seen all the way round,
// across the rim of the cover too, where the figure's own edge is hidden.

// The island has an edge two pixels wide, a little lighter than itself and
// always there. The light is a comet that runs inside that edge: a head
// that is almost white and a copper tail that thins out behind it.
//
// The tail is the same stroke laid many times over one stretch of the
// outline, each time shorter and each ending at the head: where more of them
// lie on top of one another the tail is brighter, so it fades away from the
// head with no gradient, which a stroke cannot have along its length.
// Lengths are in hundredths of the whole outline.

/** How wide the edge is, and the comet in it. */
const EDGE_WIDTH = 2;

/** How much of the outline the comet covers, from the end of its tail to its head. */
const COMET_LENGTH = 9;

const TAIL_LAYERS = 12;

const LOOP_SECONDS = 4;

/** One stroke of the comet, `length` long, ending where the head is. */
const cometStroke = (className: string, length: number): string =>
  `<path class="outline ${className}" pathLength="100" stroke-dasharray="${length} ${100 - length}" style="--sets-out: ${length - COMET_LENGTH}" />`;

const COMET = [
  ...Array.from({ length: TAIL_LAYERS }, (_, layer) =>
    cometStroke("tail", COMET_LENGTH * (1 - layer / TAIL_LAYERS)),
  ),
  cometStroke("head", COMET_LENGTH * 0.16),
  cometStroke("head", COMET_LENGTH * 0.07),
].join("\n    ");

// NOTE: a stroke is drawn half to each side of its path. Each one here is
// twice the width wanted and cut to the inside of the outline, so the edge
// and the comet lie within the figure, as a border does.
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

  .figure {
    z-index: -1;
    filter: drop-shadow(0 6px 14px rgb(0 0 0 / 0.28));
  }

  .body {
    fill: var(--color-island);
  }

  .tint {
    opacity: 0.85;
  }

  .edge {
    fill: none;
    stroke: var(--color-island-edge);
    stroke-width: ${2 * EDGE_WIDTH};
  }

  .light {
    z-index: 1;
    opacity: 0;
    transition: opacity 500ms ease-out;
  }

  .light.sounding {
    opacity: 1;
  }

  .light path {
    fill: none;
    stroke-width: ${2 * EDGE_WIDTH};
    stroke-dashoffset: var(--sets-out);
  }

  .tail {
    stroke: var(--color-island-light);
    stroke-opacity: 0.2;
  }

  .head {
    stroke: var(--color-island-light-head);
    stroke-opacity: 0.7;
  }

  @media (prefers-reduced-motion: no-preference) {
    .light.sounding path {
      animation: travel ${LOOP_SECONDS}s linear infinite;
    }
  }

  @keyframes travel {
    to {
      stroke-dashoffset: calc(var(--sets-out) - 100);
    }
  }
</style>
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
    <path class="outline edge" />
  </g>
</svg>
<svg class="light" aria-hidden="true">
  <defs>
    <clipPath id="inside"><path class="outline" /></clipPath>
  </defs>
  <g clip-path="url(#inside)">
    ${COMET}
  </g>
</svg>
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

  class IslandShapeElement extends HTMLElement {
    readonly #outlines: ReadonlyArray<SVGPathElement>;
    readonly #tint: SVGImageElement;
    readonly #light: SVGSVGElement;
    readonly #sizes = new ResizeObserver(() => this.#draw());
    #maybeTail: Element | null = null;
    #drawn = "";
    #cover = "";
    #sounding = false;

    constructor() {
      super();
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML = TEMPLATE;
      this.#outlines = Array.from(root.querySelectorAll<SVGPathElement>(".outline"));
      // The template above is this element's own: both of these are in it.
      this.#tint = root.querySelector(".tint") as SVGImageElement;
      this.#light = root.querySelector(".light") as SVGSVGElement;
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

    /** Whether the light travels: true only while the engine says there is sound. */
    get sounding(): boolean {
      return this.#sounding;
    }

    set sounding(value: boolean) {
      this.#sounding = value;
      this.#light.classList.toggle("sounding", value);
    }

    connectedCallback(): void {
      this.#sizes.observe(this);
      this.#draw();
    }

    disconnectedCallback(): void {
      this.#sizes.disconnect();
      this.#maybeTail = null;
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
