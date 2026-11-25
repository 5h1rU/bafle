precision highp float;

/** @resolution */
uniform vec2 u_resolution;
/** @time */
uniform float u_time;
/** @label Pantallas de la isla */
uniform sampler2D u_states;
/** @label Portada de Migration */
uniform sampler2D u_cover;
/**
 * @label Reducir movimiento
 * @range 0, 1
 * @default 0
 */
uniform float u_reduce;

/**
 * @label Cabezal en segundos (0 = automático)
 * @range 0, 8.4
 * @default 0
 */
uniform float u_playhead;

const vec2 screenSize = vec2(402., 874.);
const vec4 canvas = vec4(.0863, .0588, .0824, 1.);
const vec4 orchid = vec4(.937, .773, .902, 1.);
const vec4 ink = vec4(.216, .086, .184, 1.);

vec4 screenAt(vec2 p, vec2 tile) {
  vec2 uv = (clamp(p / screenSize, .0008, .9992) + tile) * .5;
  return texture2D(u_states, vec2(uv.x, 1. - uv.y));
}

float rounded(vec2 p, vec2 origin, vec2 size, float radius) {
  vec2 d = abs(p - origin - size * .5) - size * .5 + radius;
  float distance = length(max(d, 0.)) + min(max(d.x, d.y), 0.) - radius;
  return 1. - smoothstep(-.6, .6, distance);
}

vec4 coverAt(vec2 p, vec2 origin, vec2 size) {
  vec2 uv = (p - origin - size * .5) / max(size.x, size.y) + .5;
  return texture2D(u_cover, vec2(uv.x, 1. - uv.y));
}

// Solve Bafle's player transition cubic-bezier(.3, 0, .1, 1) for elapsed time.
float ease(float t) {
  t = clamp(t, 0., 1.);
  float u = t;
  for (int i = 0; i < 5; i++) {
    float x = u * (.9 + u * (-1.5 + 1.6 * u));
    u = clamp(u - (x - t) / (.9 + u * (-3. + 4.8 * u)), 0., 1.);
  }
  return u * u * (3. - 2. * u);
}

float phase(float t, float start, float duration) {
  return u_reduce > .5 ? step(start, t) : ease((t - start) / duration);
}

float press(float t, float start) {
  if (u_reduce > .5) return 0.;
  float attack = ease((t - start) / .085);
  float release = clamp((t - start - .13) / .28, 0., 1.);
  return attack * (1. - smoothstep(0., 1., release))
    * mix(1., cos(6.2 * release), smoothstep(0., .35, release));
}

float insideBox(vec2 p, vec2 a, vec2 b) {
  return step(a.x, p.x) * step(a.y, p.y) * step(p.x, b.x) * step(p.y, b.y);
}

vec4 playing(vec2 p, float queue, float touch, float paused) {
  vec4 song = screenAt(p, vec2(1., 0.));
  vec4 next = screenAt(p, vec2(0., 1.));
  song = mix(song, canvas, insideBox(p, vec2(15., 555.), vec2(387., 701.)));
  next = mix(next, canvas, insideBox(p, vec2(15., 688.), vec2(387., 834.)));
  vec4 color = mix(song, next, queue);

  vec2 artOrigin = mix(vec2(0.), vec2(24., 135.), queue);
  vec2 artSize = mix(vec2(402., 550.), vec2(74.), queue);
  float flight = smoothstep(0., .24, queue) * (1. - smoothstep(.78, 1., queue));
  color = mix(color, coverAt(p, artOrigin, artSize), flight * rounded(p, artOrigin, artSize, 10. * queue));

  vec2 deck = p - vec2(0., queue * 132.);
  color = mix(color, screenAt(deck, vec2(1., 0.)),
    insideBox(deck, vec2(15., 555.), vec2(387., 701.)));
  vec2 center = vec2(201., 655.);
  float radius = 42. * (1. - .065 * touch);
  color = mix(color, canvas, rounded(deck, center - 43., vec2(86.), 43.));
  vec2 glyph = center + (deck - center) * 42. / radius;
  vec4 button = screenAt(glyph, vec2(1., 0.));
  vec2 g = glyph - center - vec2(2., 0.);
  float triangle = max(-g.x - 11., abs(g.y) - (15. - g.x) * .64);
  vec4 play = mix(orchid, ink, 1. - smoothstep(-.6, .6, triangle));
  return mix(color, mix(button, play, paused),
    rounded(deck, center - radius, vec2(2. * radius), radius));
}

void main() {
  vec2 p = vec2(gl_FragCoord.x / u_resolution.x, 1. - gl_FragCoord.y / u_resolution.y) * screenSize;
  float t = u_playhead > 0. ? u_playhead : mod(u_time, 8.4);
  float opened = phase(t, 1.35, .38) - phase(t, 7.05, .38);
  float queue = phase(t, 3.90, .28) - phase(t, 5.95, .28);
  float paused = phase(t, 2.40, .11) - phase(t, 3.16, .11);
  float feedback = press(t, 2.27) + press(t, 3.03);
  vec4 full = playing(p, queue, feedback, paused);
  if (opened >= .9999) {
    gl_FragColor = full;
    return;
  }

  vec2 island = vec2(73., 789.);
  vec2 size = vec2(256., 60.);
  vec4 compact = screenAt(p, vec2(0.));
  vec4 clean = screenAt(p, vec2(1.));
  vec4 background = mix(compact, clean, rounded(p, island - 1., size + 2., 31.));
  vec2 origin = mix(island, vec2(0.), opened);
  vec2 sheetSize = mix(size, screenSize, opened);
  vec4 sheet = mix(canvas, full, smoothstep(.42, .96, opened));
  background = mix(background, sheet, rounded(p, origin, sheetSize, 30. * (1. - opened)) * smoothstep(0., .1, opened));

  float swell = press(t, .54);
  vec2 scale = vec2(1.) + vec2(.025, .055) * swell;
  vec2 scaledPos = island + size * .5 + (p - island - size * .5) / scale;
  background = mix(background, screenAt(scaledPos, vec2(0.)),
    (1. - smoothstep(0., .40, opened)) * rounded(scaledPos, island, size, 30.));

  vec2 artOrigin = mix(island + vec2(5.), vec2(0.), opened);
  vec2 artSize = mix(vec2(50.), vec2(402., 550.), opened);
  float coverBlend = smoothstep(0., .06, opened) * (1. - smoothstep(.65, 1., opened));
  gl_FragColor = mix(background, coverAt(p, artOrigin, artSize), coverBlend *
    rounded(p, artOrigin, artSize, 25. * (1. - opened)));
}
