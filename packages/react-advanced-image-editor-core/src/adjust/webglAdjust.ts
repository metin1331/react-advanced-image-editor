/**
 * =============================================================================
 * WebGL ADJUST PIPELINE
 * =============================================================================
 * Non-destructive colour grading of an already-cropped frame texture.
 *
 *   - Source pixels are uploaded once per crop/transform change (texture).
 *   - Slider drags only update uniforms + `drawArrays` — no `readPixels`,
 *     no JS per-pixel loops, no CSS filters.
 *   - Warmth/Tint arrive as a precomputed Bradford CAT matrix (see
 *     `whiteBalance.ts`); the shader multiplies in linear light and restores
 *     Rec.709 luminance.
 *
 * Export calls `renderToCanvas2D` once (readback only at export time).
 * =============================================================================
 */

import {
  ADJUST_CHANNELS,
  type AdjustChannelKey,
  type AdjustState,
  type FilterState,
} from '../types';
import { hasFilter, resolveFilterLook } from '../filter/filterLooks';
import {
  BLACK_POINT_RANGE,
  BRIGHTNESS,
  BRILLIANCE,
  DEFINITION,
  HIGHLIGHTS_EV,
  SHADOWS_LIFT,
  normalizeAdjust,
  sharpnessGain,
} from './adjustments';
import { buildBlurGuide } from './blurGuide';
import { mat3ToFloat32, whiteBalanceMatrix } from './whiteBalance';

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/** GLSL has no implicit int→float, so every injected constant needs a point. */
function glslFloat(value: number) {
  const text = String(value);
  return text.includes('.') || text.includes('e') ? text : `${text}.0`;
}

const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_image;
uniform float u_exposure;
uniform float u_brilliance;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_blackPoint;
uniform float u_saturation;
uniform float u_vibrance;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_sharpness;
uniform float u_definition;
uniform float u_vignette;
uniform mat3 u_wb;
uniform float u_wbActive;
/** One source texel in UV units — lets the sharpen taps hit exact neighbours. */
uniform vec2 u_texel;
/** Blurred copy of the same frame: local neighbourhood brightness. */
uniform sampler2D u_guide;
uniform float u_guideActive;
/**
 * Filter look, already interpolated by intensity on the CPU
 * (resolveFilterLook). The shader never blends presets itself.
 */
uniform float u_fActive;
uniform mat3 u_fwb;
uniform float u_fwbActive;
uniform float u_fSaturation;
uniform float u_fContrast;
uniform float u_fBrightness;
uniform float u_fHighlights;
uniform float u_fShadows;
uniform float u_fBlackPoint;
uniform float u_fMono;
uniform vec3 u_fMonoTint;
uniform float u_fVignette;

float srgbToLinear(float c) {
  return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4);
}
float linearToSrgb(float c) {
  c = clamp(c, 0.0, 1.0);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1.0/2.4) - 0.055;
}
vec3 srgbToLinear3(vec3 c) {
  return vec3(srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b));
}
vec3 linearToSrgb3(vec3 c) {
  return vec3(linearToSrgb(c.r), linearToSrgb(c.g), linearToSrgb(c.b));
}
float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
/** Weight of the bright end of the tone range, 0 below mid-gray. */
float highlightMask(float y) {
  return smoothstep(0.35, 1.0, y);
}
/** Weight of the dark end of the tone range, 0 above mid-gray. */
float shadowMask(float y) {
  return 1.0 - smoothstep(0.0, 0.5, y);
}
/** Rough orange-hue weight (red > green > blue) used to hold back skin tones. */
float skinWeight(vec3 c) {
  return clamp(
    smoothstep(0.0, 0.15, c.r - c.g) * smoothstep(0.0, 0.12, c.g - c.b),
    0.0,
    1.0
  );
}
/** Radial photometric vignette, shared by the Calibrate channel and filters. */
vec3 vignette(vec3 c, vec2 uv, float strength) {
  float t = clamp(length(uv - vec2(0.5)) / 0.70710678, 0.0, 1.0);
  float amount = strength * (t * t * (3.0 - 2.0 * t)) * 0.85;
  if (amount > 0.0) return c * (1.0 - amount);
  return c + (vec3(1.0) - c) * (-amount);
}
/** Bradford white-balance with Rec.709 luminance restored afterwards. */
vec3 whiteBalance(vec3 c, mat3 m) {
  float y0 = luma(c);
  vec3 wb = m * c;
  float y1 = luma(wb);
  return y1 > 1e-6 ? wb * (y0 / y1) : wb;
}

void main() {
  vec4 src = texture2D(u_image, v_uv);
  vec3 rgb = srgbToLinear3(src.rgb);

  // White balance in linear light (Warmth + Tint as one CAT matrix)
  if (u_wbActive > 0.5) {
    rgb = whiteBalance(rgb, u_wb);
  }

  rgb *= u_exposure;

  // Brilliance — a local tone map. The weights read the blurred guide, not
  // this pixel, so a shaded subject opens up while a bright background does
  // not blow out. Negative flattens the scene instead.
  if (u_guideActive > 0.5 && abs(u_brilliance) > 1e-4) {
    float yg = luma(srgbToLinear3(texture2D(u_guide, v_uv).rgb));
    float shadowW = 1.0 - smoothstep(0.0, ${glslFloat(BRILLIANCE.shadowEdge)}, yg);
    float highW = smoothstep(${glslFloat(BRILLIANCE.highlightEdge)}, 1.0, yg);
    rgb = max(rgb + u_brilliance * shadowW * ${glslFloat(BRILLIANCE.shadowLift)}, vec3(0.0));
    rgb *= 1.0 - u_brilliance * highW * ${glslFloat(BRILLIANCE.highlightPull)};
    float yb = luma(rgb);
    rgb = mix(
      vec3(yb),
      rgb,
      1.0 + max(0.0, u_brilliance) * shadowW * ${glslFloat(BRILLIANCE.chromaRestore)}
    );
  }

  // Highlights — gain confined to the bright end. Applied to all three
  // channels equally so hue survives the recovery.
  if (abs(u_highlights) > 1e-4) {
    rgb *= pow(2.0, u_highlights * highlightMask(luma(rgb)));
  }

  // Shadows — a multiplicative gain cannot open black (0 * k = 0), so the
  // dark end is lifted additively instead.
  if (abs(u_shadows) > 1e-4) {
    rgb = max(rgb + u_shadows * shadowMask(luma(rgb)), vec3(0.0));
  }

  // Brightness — gamma, so +100 opens the picture without painting it white
  // and a small negative step does not crush it. White stays white.
  if (abs(u_brightness) > 1e-4) {
    float gamma = u_brightness > 0.0
      ? exp2(-u_brightness * ${glslFloat(BRIGHTNESS.positive)})
      : exp2(-u_brightness * ${glslFloat(BRIGHTNESS.negative)});
    rgb = pow(max(rgb, vec3(0.0)), vec3(gamma));
  }

  rgb = (rgb - 0.5) * u_contrast + 0.5;

  // Black point — move the black floor, then rescale so white stays put.
  // Arrives pre-scaled as an offset in [-0.25, 0.25].
  if (abs(u_blackPoint) > 1e-4) {
    rgb = u_blackPoint > 0.0
      ? (rgb - u_blackPoint) / (1.0 - u_blackPoint)
      : rgb * (1.0 + u_blackPoint) - u_blackPoint;
  }

  // Definition — wide-radius local contrast against the same guide. Sharpness
  // works on a one-pixel radius; this lifts the broad midtone structure that
  // reads as clarity. Applied as a luminance ratio, so hue is untouched.
  if (u_guideActive > 0.5 && abs(u_definition) > 1e-4) {
    float yd = luma(rgb);
    float ygd = luma(srgbToLinear3(texture2D(u_guide, v_uv).rgb));
    float protect = 1.0 - smoothstep(${glslFloat(DEFINITION.protectEdge)}, 1.0, yd);
    float target = yd + (yd - ygd) * u_definition * ${glslFloat(DEFINITION.gain)} * protect;
    rgb *= clamp(max(target, 0.0) / max(yd, 1e-4), 0.25, 4.0);
  }

  float y = luma(rgb);
  rgb = mix(vec3(y), rgb, u_saturation);

  // Vibrance — saturation weighted by how muted the pixel already is, so
  // washed-out colours move first and vivid ones do not clip. Skin held back.
  if (abs(u_vibrance) > 1e-4) {
    float chroma = clamp(max(rgb.r, max(rgb.g, rgb.b)) - min(rgb.r, min(rgb.g, rgb.b)), 0.0, 1.0);
    float amount = u_vibrance * (1.0 - chroma) * (1.0 - 0.5 * skinWeight(rgb));
    float yv = luma(rgb);
    rgb = mix(vec3(yv), rgb, 1.0 + amount);
  }

  // Sharpness — unsharp mask on luminance only, so edges gain local
  // contrast with no colour fringing. The detail comes from the ungraded
  // source (3x3 Gaussian) and is re-applied to the graded pixel as a
  // multiplier, which keeps hue intact.
  if (abs(u_sharpness) > 1e-4) {
    float c = luma(src.rgb);
    float blurY = (
      luma(texture2D(u_image, v_uv + u_texel * vec2(-1.0, -1.0)).rgb) +
      luma(texture2D(u_image, v_uv + u_texel * vec2( 1.0, -1.0)).rgb) +
      luma(texture2D(u_image, v_uv + u_texel * vec2(-1.0,  1.0)).rgb) +
      luma(texture2D(u_image, v_uv + u_texel * vec2( 1.0,  1.0)).rgb) +
      2.0 * (
        luma(texture2D(u_image, v_uv + u_texel * vec2( 0.0, -1.0)).rgb) +
        luma(texture2D(u_image, v_uv + u_texel * vec2(-1.0,  0.0)).rgb) +
        luma(texture2D(u_image, v_uv + u_texel * vec2( 1.0,  0.0)).rgb) +
        luma(texture2D(u_image, v_uv + u_texel * vec2( 0.0,  1.0)).rgb)
      ) +
      4.0 * c
    ) / 16.0;
    float detail = clamp(c - blurY, -0.25, 0.25);
    float target = clamp(c + detail * u_sharpness, 0.0, 1.0);
    rgb *= clamp(srgbToLinear(target) / max(srgbToLinear(c), 1e-5), 0.25, 4.0);
  }

  // Vignette (radial, photometric)
  if (abs(u_vignette) > 1e-4) {
    rgb = vignette(rgb, v_uv, u_vignette);
  }

  // ---- Filter look ----
  // Runs last, on top of the user's own grade, so picking a filter never
  // discards Calibrate edits. Every parameter already carries the intensity
  // mix, so at intensity 0 this block is a no-op by construction.
  if (u_fActive > 0.5) {
    if (u_fwbActive > 0.5) {
      rgb = whiteBalance(rgb, u_fwb);
    }
    if (abs(u_fHighlights) > 1e-4) {
      rgb *= pow(2.0, u_fHighlights * highlightMask(luma(rgb)));
    }
    if (abs(u_fShadows) > 1e-4) {
      rgb = max(rgb + u_fShadows * shadowMask(luma(rgb)), vec3(0.0));
    }
    rgb += u_fBrightness;
    rgb = (rgb - 0.5) * u_fContrast + 0.5;
    if (abs(u_fBlackPoint) > 1e-4) {
      rgb = u_fBlackPoint > 0.0
        ? (rgb - u_fBlackPoint) / (1.0 - u_fBlackPoint)
        : rgb * (1.0 + u_fBlackPoint) - u_fBlackPoint;
    }
    float fy = luma(rgb);
    rgb = mix(vec3(fy), rgb, u_fSaturation);
    if (u_fMono > 1e-4) {
      rgb = mix(rgb, max(vec3(luma(rgb)), 0.0) * u_fMonoTint, u_fMono);
    }
    if (abs(u_fVignette) > 1e-4) {
      rgb = vignette(rgb, v_uv, u_fVignette);
    }
  }

  gl_FragColor = vec4(linearToSrgb3(rgb), src.a);
}
`;

function createClampedTexture(gl: WebGLRenderingContext) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('WebGL shader alloc failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`WebGL shader compile: ${info}`);
  }
  return sh;
}

export type AdjustGlUniforms = Record<AdjustChannelKey, number> & {
  wb: Float32Array;
  wbActive: boolean;
};

/**
 * Normalized [-1, 1] → shader uniform value, per channel.
 *
 * Warmth/Tint have no scalar uniform of their own: they are folded into the
 * `u_wb` Bradford matrix, so their entries are pass-through and the `u_warmth`
 * / `u_tint` lookups simply resolve to `null` and are skipped in `draw`.
 */
const CHANNEL_UNIFORM: Record<AdjustChannelKey, (v: number) => number> = {
  brightness: (v) => v,
  contrast: (v) => 1 + v,
  blackPoint: (v) => v * BLACK_POINT_RANGE,
  saturation: (v) => 1 + v,
  vibrance: (v) => v,
  exposure: (v) => Math.pow(2, v * 2),
  brilliance: (v) => v,
  highlights: (v) => v * HIGHLIGHTS_EV,
  shadows: (v) => v * SHADOWS_LIFT,
  vignette: (v) => v,
  warmth: (v) => v,
  tint: (v) => v,
  sharpness: sharpnessGain,
  definition: (v) => v,
};

export function adjustStateToUniforms(adjust: AdjustState): AdjustGlUniforms {
  const a = normalizeAdjust(adjust);
  const out = {} as AdjustGlUniforms;
  for (const channel of ADJUST_CHANNELS) out[channel] = CHANNEL_UNIFORM[channel](a[channel]);
  out.wb = mat3ToFloat32(whiteBalanceMatrix(a.warmth, a.tint));
  out.wbActive = Math.abs(a.warmth) > 1e-4 || Math.abs(a.tint) > 1e-4;
  return out;
}

export type FilterGlUniforms = {
  active: boolean;
  wb: Float32Array;
  wbActive: boolean;
  saturation: number;
  contrast: number;
  brightness: number;
  highlights: number;
  shadows: number;
  blackPoint: number;
  mono: number;
  monoTint: Float32Array;
  vignette: number;
};

/**
 * Resolve the selected look at its current intensity into flat uniforms.
 * Highlights reuse the Calibrate EV scale so a filter and a slider that read
 * the same number do the same thing.
 */
export function filterStateToUniforms(
  filter?: Partial<FilterState> | null
): FilterGlUniforms {
  const look = resolveFilterLook(filter);
  return {
    active: hasFilter(filter),
    wb: mat3ToFloat32(whiteBalanceMatrix(look.warmth, look.tint)),
    wbActive: Math.abs(look.warmth) > 1e-4 || Math.abs(look.tint) > 1e-4,
    saturation: look.saturation,
    contrast: look.contrast,
    brightness: look.brightness,
    highlights: look.highlights * HIGHLIGHTS_EV,
    shadows: look.shadows * SHADOWS_LIFT,
    blackPoint: look.blackPoint * BLACK_POINT_RANGE,
    mono: look.mono,
    monoTint: new Float32Array(look.monoTint),
    vignette: look.vignette,
  };
}

/**
 * Persistent WebGL adjust renderer. Upload a cropped frame with
 * `setSource`, then call `draw(adjust)` on every slider tick.
 */
export class WebGLAdjustRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null;
  private program: WebGLProgram | null = null;
  private tex: WebGLTexture | null = null;
  private guideTex: WebGLTexture | null = null;
  private guideActive = false;
  private buf: WebGLBuffer | null = null;
  private locs: Record<string, WebGLUniformLocation | null> = {};
  private aPos = -1;
  private srcW = 0;
  private srcH = 0;
  private alive = true;

  constructor(canvas?: HTMLCanvasElement) {
    this.canvas = canvas ?? document.createElement('canvas');
    const gl =
      this.canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        antialias: false,
      }) ||
      (this.canvas.getContext('experimental-webgl', {
        alpha: true,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
      }) as WebGLRenderingContext | null);
    this.gl = gl;
    if (gl) this.init(gl);
  }

  get isSupported() {
    return !!this.gl && !!this.program;
  }

  private init(gl: WebGLRenderingContext) {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!prog) throw new Error('WebGL program alloc failed');
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`WebGL link: ${gl.getProgramInfoLog(prog)}`);
    }
    this.program = prog;
    this.aPos = gl.getAttribLocation(prog, 'a_pos');
    for (const name of [
      'u_image',
      'u_wb',
      'u_wbActive',
      'u_texel',
      'u_guide',
      'u_guideActive',
      'u_fActive',
      'u_fwb',
      'u_fwbActive',
      'u_fSaturation',
      'u_fContrast',
      'u_fBrightness',
      'u_fHighlights',
      'u_fShadows',
      'u_fBlackPoint',
      'u_fMono',
      'u_fMonoTint',
      'u_fVignette',
      ...ADJUST_CHANNELS.map((channel) => `u_${channel}`),
    ]) {
      this.locs[name] = gl.getUniformLocation(prog, name);
    }

    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    this.tex = createClampedTexture(gl);
    this.guideTex = createClampedTexture(gl);
  }

  /**
   * Upload / replace the cropped source texture (call when crop changes).
   * The blurred neighbourhood guide used by Brilliance and Definition is
   * rebuilt here too, so slider drags never pay for it.
   */
  setSource(source: TexImageSource, width: number, height: number) {
    const gl = this.gl;
    if (!gl || !this.tex) return;
    this.srcW = Math.max(1, Math.round(width));
    this.srcH = Math.max(1, Math.round(height));
    if (this.canvas.width !== this.srcW) this.canvas.width = this.srcW;
    if (this.canvas.height !== this.srcH) this.canvas.height = this.srcH;

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    this.guideActive = false;
    const guide = buildBlurGuide(source, this.srcW, this.srcH);
    if (guide && this.guideTex) {
      gl.bindTexture(gl.TEXTURE_2D, this.guideTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, guide);
      this.guideActive = true;
    }
  }

  /**
   * Redraw with new adjustment / filter uniforms — GPU only, no readback.
   * Both the Calibrate sliders and the filter intensity land here, which is
   * why either can be dragged at full frame rate.
   */
  draw(adjust: AdjustState, filter?: Partial<FilterState> | null) {
    const gl = this.gl;
    const prog = this.program;
    if (!gl || !prog || !this.tex || !this.buf || this.srcW < 1) return;

    const u = adjustStateToUniforms(adjust);
    const f = filterStateToUniforms(filter);

    gl.viewport(0, 0, this.srcW, this.srcH);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.guideTex);
    gl.uniform1i(this.locs.u_guide, 1);
    gl.uniform1f(this.locs.u_guideActive, this.guideActive ? 1 : 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.locs.u_image, 0);
    for (const channel of ADJUST_CHANNELS) {
      const loc = this.locs[`u_${channel}`];
      if (loc) gl.uniform1f(loc, u[channel]);
    }
    gl.uniformMatrix3fv(this.locs.u_wb, false, u.wb);
    gl.uniform1f(this.locs.u_wbActive, u.wbActive ? 1 : 0);
    gl.uniform2f(this.locs.u_texel, 1 / this.srcW, 1 / this.srcH);

    gl.uniform1f(this.locs.u_fActive, f.active ? 1 : 0);
    gl.uniformMatrix3fv(this.locs.u_fwb, false, f.wb);
    gl.uniform1f(this.locs.u_fwbActive, f.wbActive ? 1 : 0);
    gl.uniform1f(this.locs.u_fSaturation, f.saturation);
    gl.uniform1f(this.locs.u_fContrast, f.contrast);
    gl.uniform1f(this.locs.u_fBrightness, f.brightness);
    gl.uniform1f(this.locs.u_fHighlights, f.highlights);
    gl.uniform1f(this.locs.u_fShadows, f.shadows);
    gl.uniform1f(this.locs.u_fBlackPoint, f.blackPoint);
    gl.uniform1f(this.locs.u_fMono, f.mono);
    gl.uniform3fv(this.locs.u_fMonoTint, f.monoTint);
    gl.uniform1f(this.locs.u_fVignette, f.vignette);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * One-shot: process `source` into a 2D canvas (export path). Uses WebGL
   * when available; otherwise the CPU fallback in `applyAdjustmentsCpu`.
   */
  renderToCanvas2D(
    source: HTMLCanvasElement,
    adjust: AdjustState,
    filter?: Partial<FilterState> | null,
    out?: HTMLCanvasElement
  ): HTMLCanvasElement {
    this.setSource(source, source.width, source.height);
    this.draw(adjust, filter);

    const target = out ?? document.createElement('canvas');
    target.width = source.width;
    target.height = source.height;
    const ctx = target.getContext('2d');
    if (ctx) ctx.drawImage(this.canvas, 0, 0);
    return target;
  }

  dispose() {
    if (!this.alive) return;
    this.alive = false;
    const gl = this.gl;
    if (!gl) return;
    if (this.tex) gl.deleteTexture(this.tex);
    if (this.guideTex) gl.deleteTexture(this.guideTex);
    if (this.buf) gl.deleteBuffer(this.buf);
    if (this.program) gl.deleteProgram(this.program);
    this.guideTex = null;
    this.tex = null;
    this.buf = null;
    this.program = null;
    this.gl = null;
  }
}

/** Shared lazy renderer for export (created on first use). */
let exportRenderer: WebGLAdjustRenderer | null = null;

export function getExportAdjustRenderer(): WebGLAdjustRenderer | null {
  if (typeof document === 'undefined') return null;
  if (!exportRenderer) {
    try {
      exportRenderer = new WebGLAdjustRenderer();
      if (!exportRenderer.isSupported) {
        exportRenderer.dispose();
        exportRenderer = null;
      }
    } catch {
      exportRenderer = null;
    }
  }
  return exportRenderer;
}
