import * as Schema from "effect/Schema";
import * as Marquee from "../../marquee/index.ts";

// MODEL

/**
 * The light that travels the island's edge. It is dark until there has been
 * sound. From then on it travels while there is sound and rests, dimmed,
 * where it stopped when there is not.
 */
export const Light = Schema.Literals(["Dark", "Travelling", "Resting"]);
export type Light = typeof Light.Type;

/**
 * What the island is told of the sound, by whoever knows: that it is heard,
 * that it was asked for and is awaited, or that there is none. The island
 * knows nothing more of playing than this.
 */
export const Sound = Schema.Literals(["Heard", "Awaited", "Silent"]);
export type Sound = typeof Sound.Type;

/**
 * The island: what its light does, and where each of its two lines of words
 * is in its waits and passes. Each line is a marquee of its own, so either
 * may travel while the other stands.
 */
export const Model = Schema.Struct({
  light: Light,
  title: Marquee.Model,
  artist: Marquee.Model,
});
export type Model = typeof Model.Type;

export const init = (): Model => ({
  light: "Dark",
  title: Marquee.init(),
  artist: Marquee.init(),
});

/**
 * What the light does once the sound is `sound`. Only the word that there
 * is sound sets it going. A tap not yet answered changes nothing, however
 * long the start takes: going on to another track does not halt the light,
 * and a first track does not light it. Anything else puts a light that has
 * travelled to rest, and leaves one that never travelled dark.
 */
export const lightAfter = (light: Light, sound: Sound): Light => {
  if (sound === "Heard") {
    return "Travelling";
  }
  if (sound === "Awaited") {
    return light;
  }
  return light === "Dark" ? "Dark" : "Resting";
};
