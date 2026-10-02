/**
 * =============================================================================
 * WARMTH / TINT — photographic white-balance (Apple Photos–style)
 * =============================================================================
 * Not an Instagram filter and not an RGB offset. Both axes are expressed as a
 * change of illuminant, then applied with a Bradford chromatic-adaptation
 * transform (von Kries in LMS). The CPU folds that into one 3×3 matrix in
 * **linear sRGB**; the WebGL shader just multiplies and optionally restores
 * Rec.709 luminance so the look stays a colour-balance correction.
 *
 * Warmth (temperature)
 * --------------------
 * Slider ∈ [-1, 1] is eased, then mapped onto a correlated colour temperature
 * around D65 (≈6504 K):
 *   +1 → ~4000 K  (warm / yellow-amber)
 *    0 →  6504 K  (neutral)
 *   −1 → ~10000 K (cool / blue)
 * The destination white is taken from the Planckian locus at that CCT.
 * Adapting D65 → that white makes the whole frame warmer or cooler without
 * painting orange/blue onto every pixel.
 *
 * Tint (green ↔ magenta)
 * ----------------------
 * Independent ISO-style tint: a small offset in CIE 1976 u′v′ along the
 * isotherm (perpendicular to the Planckian locus). Negative → green,
 * positive → magenta. Composed into the same destination white before CAT,
 * so Warmth and Tint stay independent yet combine stably.
 *
 * Why this resembles Apple Photos
 * -------------------------------
 * Apple's Adjust > Warmth / Tint are white-balance axes, not grade LUTs.
 * Bradford CAT + Planckian/isotherm whites is the same family of model used
 * by camera WB and Lightroom-style temperature/tint, which is why the result
 * reads as subtle photographic correction rather than a stylized filter.
 * =============================================================================
 */

export type Mat3 = [
  number, number, number,
  number, number, number,
  number, number, number,
];

const D65_XYZ: [number, number, number] = [0.95047, 1.0, 1.08883];

/** Bradford cone-response matrix (CIE XYZ → LMS). */
const BRADFORD: Mat3 = [
  0.8951, 0.2664, -0.1614,
  -0.7502, 1.7135, 0.0367,
  0.0389, -0.0685, 1.0296,
];

const BRADFORD_INV: Mat3 = [
  0.9869929, -0.1470543, 0.1599627,
  0.4323053, 0.5183603, 0.0492912,
  -0.0085287, 0.0400428, 0.9684867,
];

/** Linear sRGB → CIE XYZ (D65). */
const RGB_TO_XYZ: Mat3 = [
  0.4124564, 0.3575761, 0.1804375,
  0.2126729, 0.7151522, 0.0721750,
  0.0193339, 0.1191920, 0.9503041,
];

/** CIE XYZ (D65) → linear sRGB. */
const XYZ_TO_RGB: Mat3 = [
  3.2404542, -1.5371385, -0.4985314,
  -0.9692660, 1.8760108, 0.0415560,
  0.0556434, -0.2040259, 1.0572252,
];

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Soft response near zero — perceptually smoother than a raw linear slider. */
export function easeWbSlider(t: number): number {
  const s = t < 0 ? -1 : 1;
  const a = Math.min(1, Math.abs(t));
  return s * Math.pow(a, 1.15);
}

/**
 * Warmth ∈ [-1, 1] → destination CCT in Kelvin.
 * Positive warmth lowers CCT (warmer); negative raises it (cooler).
 */
export function warmthToKelvin(warmth: number): number {
  const w = easeWbSlider(warmth);
  if (w >= 0) return 6504 - w * (6504 - 4000);
  return 6504 + -w * (10000 - 6504);
}

/** Kang / CIE-style Planckian locus xy for 1667–25000 K. */
export function planckianXy(kelvin: number): { x: number; y: number } {
  const T = Math.min(25000, Math.max(1667, kelvin));
  const t = T;
  let x: number;
  if (T <= 4000) {
    x =
      -0.2661239e9 / (t * t * t) -
      0.2343580e6 / (t * t) +
      0.8776956e3 / t +
      0.17991;
  } else {
    x =
      -3.0258469e9 / (t * t * t) +
      2.1070379e6 / (t * t) +
      0.2226347e3 / t +
      0.24039;
  }

  let y: number;
  if (T <= 2222) {
    y =
      -1.1063814 * x * x * x -
      1.3481102 * x * x +
      2.18555832 * x -
      0.20219683;
  } else if (T <= 4000) {
    y =
      -0.9549476 * x * x * x -
      1.37418593 * x * x +
      2.09137015 * x -
      0.16748867;
  } else {
    y =
      3.081758 * x * x * x -
      5.8733867 * x * x +
      3.75112997 * x -
      0.37001483;
  }
  return { x, y };
}

function xyToUcs(x: number, y: number) {
  const d = -2 * x + 12 * y + 3;
  return { u: (4 * x) / d, v: (9 * y) / d };
}

function ucsToXy(u: number, v: number) {
  const d = 6 * u - 16 * v + 12;
  return { x: (9 * u) / d, y: (4 * v) / d };
}

function xyToXyz(x: number, y: number, Y = 1): [number, number, number] {
  if (Math.abs(y) < 1e-8) return [0, Y, 0];
  const X = (x * Y) / y;
  const Z = ((1 - x - y) * Y) / y;
  return [X, Y, Z];
}

function mulMat3(a: Mat3, b: Mat3): Mat3 {
  const o = new Array(9) as Mat3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 3 + c] =
        a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return o;
}

function mulMat3Vec(m: Mat3, v: [number, number, number]): [number, number, number] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

function diagMat3(x: number, y: number, z: number): Mat3 {
  return [x, 0, 0, 0, y, 0, 0, 0, z];
}

/**
 * Destination white XYZ for the joint (warmth, tint) illuminant.
 * Tint shifts CIE 1976 u′v′ along the isotherm: −green / +magenta.
 */
export function wbDestinationWhite(warmth: number, tint: number): [number, number, number] {
  const { x, y } = planckianXy(warmthToKelvin(warmth));
  let { u, v } = xyToUcs(x, y);

  // Max |tint| ≈ ±0.018 in u′v′ — photographic, not neon.
  const t = easeWbSlider(tint) * 0.018;
  u += t;
  v -= t * 0.35;

  const xy = ucsToXy(u, v);
  return xyToXyz(xy.x, xy.y, 1);
}

/** Bradford CAT mapping `srcWhite` → `dstWhite` (XYZ domain). */
export function bradfordCat(srcWhite: [number, number, number], dstWhite: [number, number, number]): Mat3 {
  const srcLms = mulMat3Vec(BRADFORD, srcWhite);
  const dstLms = mulMat3Vec(BRADFORD, dstWhite);
  const scale = diagMat3(
    dstLms[0] / Math.max(srcLms[0], 1e-10),
    dstLms[1] / Math.max(srcLms[1], 1e-10),
    dstLms[2] / Math.max(srcLms[2], 1e-10)
  );
  return mulMat3(BRADFORD_INV, mulMat3(scale, BRADFORD));
}

/**
 * 3×3 in **linear sRGB** applying Warmth+Tint. Identity when both ≈ 0.
 * Column-vector convention: `out = M * in` with elements row-major.
 */
export function whiteBalanceMatrix(warmth = 0, tint = 0): Mat3 {
  if (Math.abs(warmth) < 1e-4 && Math.abs(tint) < 1e-4) return IDENTITY;

  const dst = wbDestinationWhite(warmth, tint);
  const cat = bradfordCat(D65_XYZ, dst);
  // linearRGB → XYZ → CAT → XYZ → linearRGB
  return mulMat3(XYZ_TO_RGB, mulMat3(cat, RGB_TO_XYZ));
}

/** Apply a linear-RGB WB matrix to one pixel (already linearized). */
export function applyWbMatrix(
  m: Mat3,
  r: number,
  g: number,
  b: number,
  preserveLuma = true
): [number, number, number] {
  let or = m[0] * r + m[1] * g + m[2] * b;
  let og = m[3] * r + m[4] * g + m[5] * b;
  let ob = m[6] * r + m[7] * g + m[8] * b;

  if (preserveLuma) {
    const y0 = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const y1 = 0.2126 * or + 0.7152 * og + 0.0722 * ob;
    if (y1 > 1e-6) {
      const s = y0 / y1;
      or *= s;
      og *= s;
      ob *= s;
    }
  }
  return [or, og, ob];
}

export function mat3ToFloat32(m: Mat3): Float32Array {
  // WebGL `uniformMatrix3fv` expects column-major
  return new Float32Array([
    m[0], m[3], m[6],
    m[1], m[4], m[7],
    m[2], m[5], m[8],
  ]);
}
