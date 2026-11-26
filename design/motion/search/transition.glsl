precision highp float;

/** @resolution */
uniform vec2 u_resolution;
/** @time */
uniform float u_time;
/** @label Estados editables de Search */
uniform sampler2D u_states;
/**
 * @label Tiempo en segundos (0 = reproducir)
 * @range 0, 6
 * @default 0
 */
uniform float u_playhead;
/**
 * @label Reducir movimiento
 * @range 0, 1
 * @default 0
 */
uniform float u_reduce;

const vec2 screen = vec2(402., 874.);
const vec4 canvasColor = vec4(22., 15., 21., 255.) / 255.;

vec4 stateAt(vec2 point, float state) {
  vec2 uv = clamp(point / screen, vec2(.0004), vec2(.9996));
  return texture2D(u_states, vec2((uv.x + state) * .5, 1. - uv.y));
}

// Bafle's cubic-bezier(.4, 0, .2, 1) applied to elapsed time.
float settle(float elapsed) {
  float t = clamp(elapsed, 0., 1.);
  float v = t;
  for (int i = 0; i < 5; i++) {
    float x = v * (1.2 + v * (-1.8 + 1.6 * v));
    v = clamp(v - (x - t) / (1.2 + v * (-3.6 + 4.8 * v)), 0., 1.);
  }
  return v * v * (3. - 2. * v);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x / u_resolution.x, 1. - gl_FragCoord.y / u_resolution.y) * screen;
  float t = u_playhead > 0. ? u_playhead : mod(u_time, 6.);
  const float arrival = 1.95;
  const float clear = 4.65;
  float dock = settle((t - arrival) / .28) - settle((t - clear) / .28);
  if (u_reduce > .5) dock = step(arrival, t) - step(clear, t);
  float intro = 1. - smoothstep(arrival, arrival + .09, t) + smoothstep(clear + .18, clear + .30, t);
  float reveal = smoothstep(arrival + .14, arrival + .31, t) - smoothstep(clear, clear + .09, t);
  vec4 color = canvasColor;
  if (p.y < 48. || p.y > 783.) color = stateAt(p, 0.);
  if (p.y >= 206. && p.y < 405.) color = mix(color, stateAt(p, 0.), intro);
  if (p.y >= 140. && p.y <= 776.) {
    float dy = u_reduce > .5 ? 0. : (1. - reveal) * 8.;
    color = mix(color, stateAt(p - vec2(0., dy), 1.), reveal);
  }

  float fieldY = mix(409., 62., dock);
  vec2 field = vec2(p.x, p.y - fieldY);
  if (field.y >= -1. && field.y <= 57. && field.x >= 21. && field.x <= 381.) {
    bool typed = t >= .84 && t < clear;
    vec2 source = field + vec2(0., typed ? 62. : 409.);
    vec4 sampleColor = stateAt(source, typed ? 1. : 0.);
    // Six glyph boundaries in the actual typeset field, for “Bonobo”.
    float end = 83. + 10. * step(.95, t) + 10. * step(1.08, t) + 10. * step(1.19, t)
                    + 10. * step(1.32, t) + 11. * step(1.44, t);
    if (typed && field.y > 12. && field.y < 45. && field.x >= end && field.x < 151.)
      sampleColor = stateAt(vec2(160., 90.), 1.);
    vec2 delta = abs(field - vec2(201., 28.)) - vec2(151., 0.);
    float mask = 1. - smoothstep(27.5, 28.7, length(max(delta, 0.)));
    color = mix(color, sampleColor, mask);
  }
  gl_FragColor = color;
}
