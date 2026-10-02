/**
 * =============================================================================
 * PERSPECTIVE (KEYSTONE) CORRECTION — real 4-point homography
 * =============================================================================
 * `perspectiveX` / `perspectiveY` are normalized in [-1, 1] and stored on
 * `TransformState`. The source pixels are never modified; every consumer
 * (preview + export) derives the same homography from these two numbers.
 *
 * Model
 * -----
 * The image rectangle is mapped onto a symmetric trapezoid — exactly what a
 * camera sees when it is tilted — and then a projective (not affine) transform
 * carries the pixels onto it. This is what makes converging verticals in a
 * photo of a building straighten out instead of just shearing:
 *
 *   perspectiveY > 0  → top edge narrows, bottom edge widens  (vertical tilt)
 *   perspectiveX > 0  → left edge shortens, right edge grows  (horizontal pan)
 *
 * Because opposite edges change by ∓k the average edge length stays 1, so the
 * image keeps its centre of mass and the effect reads as a rotation in depth
 * rather than a resize.
 *
 * A homography cannot be expressed as a 2×3 affine matrix, so:
 *   - preview uses CSS `matrix3d` (the browser does the perspective divide),
 *   - export uses `drawPerspectiveImage`, which subdivides the source into a
 *     grid and draws each cell with its own affine approximation.
 * Both are driven by `perspectiveHomography`, so they cannot drift apart.
 * =============================================================================
 */

export type Point = { x: number; y: number };
/** Row-major 3×3. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/**
 * Largest fractional edge shift at |value| = 1. At 0.42 the wide edge is 1.42×
 * and the narrow edge 0.58× the original — roughly the range of iPhone Photos.
 */
export const PERSPECTIVE_MAX_SHIFT = 0.42;

/** Below this the transform is treated as identity (avoids pointless work). */
export const PERSPECTIVE_EPSILON = 1e-4;

export function hasPerspective(perspectiveX = 0, perspectiveY = 0) {
  return (
    Math.abs(perspectiveX) > PERSPECTIVE_EPSILON ||
    Math.abs(perspectiveY) > PERSPECTIVE_EPSILON
  );
}

function clampUnit(v: number) {
  return Math.min(1, Math.max(-1, Number.isFinite(v) ? v : 0));
}

/**
 * Destination quad in centred, normalized space (the source rectangle is
 * (-0.5,-0.5)…(0.5,0.5)). Order is TL, TR, BR, BL.
 */
export function perspectiveQuad(perspectiveX = 0, perspectiveY = 0): [Point, Point, Point, Point] {
  const ky = clampUnit(perspectiveY) * PERSPECTIVE_MAX_SHIFT;
  const kx = clampUnit(perspectiveX) * PERSPECTIVE_MAX_SHIFT;

  const topW = 1 - ky;
  const bottomW = 1 + ky;
  const leftH = 1 - kx;
  const rightH = 1 + kx;

  return [
    { x: (-topW / 2), y: (-leftH / 2) },
    { x: (topW / 2), y: (-rightH / 2) },
    { x: (bottomW / 2), y: (rightH / 2) },
    { x: (-bottomW / 2), y: (leftH / 2) },
  ];
}

/** Axis-aligned half extents of the perspective quad, in normalized units. */
export function perspectiveQuadHalfExtents(perspectiveX = 0, perspectiveY = 0) {
  const q = perspectiveQuad(perspectiveX, perspectiveY);
  let hx = 0;
  let hy = 0;
  for (const p of q) {
    hx = Math.max(hx, Math.abs(p.x));
    hy = Math.max(hy, Math.abs(p.y));
  }
  return { hx, hy };
}

/**
 * Homography mapping the unit square (0,0)→(1,1) onto an arbitrary quad.
 * Classic Heckbert formulation; `den === 0` only for degenerate quads.
 */
export function homographyFromUnitSquare(quad: [Point, Point, Point, Point]): Mat3 {
  const [p0, p1, p2, p3] = quad;

  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;

  const den = dx1 * dy2 - dx2 * dy1;

  // Parallelogram → affine (no projective term)
  if (Math.abs(den) < 1e-12) {
    return [
      p1.x - p0.x, p3.x - p0.x, p0.x,
      p1.y - p0.y, p3.y - p0.y, p0.y,
      0, 0, 1,
    ];
  }

  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;

  return [
    p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x,
    p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y,
    g, h, 1,
  ];
}

export function multiplyMat3(a: Mat3, b: Mat3): Mat3 {
  const out = new Array(9) as Mat3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] =
        a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

export function applyMat3(m: Mat3, x: number, y: number): Point {
  const w = m[6] * x + m[7] * y + m[8];
  const iw = Math.abs(w) < 1e-12 ? 0 : 1 / w;
  return {
    x: (m[0] * x + m[1] * y + m[2]) * iw,
    y: (m[3] * x + m[4] * y + m[5]) * iw,
  };
}

/**
 * Homography for an element of `width` × `height`, expressed in **centred**
 * coordinates so it composes with `transform-origin: center center`.
 */
export function perspectiveHomography(
  width: number,
  height: number,
  perspectiveX = 0,
  perspectiveY = 0
): Mat3 {
  const quad = perspectiveQuad(perspectiveX, perspectiveY);
  // unit square → centred normalized square → centred normalized quad
  const unitToQuad = homographyFromUnitSquare(quad);
  const centredToUnit: Mat3 = [1, 0, 0.5, 0, 1, 0.5, 0, 0, 1];
  const normalized = multiplyMat3(unitToQuad, centredToUnit);

  // pixels → normalized → pixels
  const toNormalized: Mat3 = [1 / width, 0, 0, 0, 1 / height, 0, 0, 0, 1];
  const toPixels: Mat3 = [width, 0, 0, 0, height, 0, 0, 0, 1];
  return multiplyMat3(toPixels, multiplyMat3(normalized, toNormalized));
}

/**
 * CSS `matrix3d(...)` for the homography above. Column-major, with the
 * projective row folded into the w column — this is how CSS performs the
 * perspective divide, so no `perspective()` wrapper is needed.
 */
export function homographyToMatrix3d(m: Mat3): string {
  const v = [
    m[0], m[3], 0, m[6],
    m[1], m[4], 0, m[7],
    0, 0, 1, 0,
    m[2], m[5], 0, m[8],
  ];
  return `matrix3d(${v.map((n) => (Math.abs(n) < 1e-10 ? 0 : n)).join(', ')})`;
}

/** Ready-to-use CSS transform for an element of the given size, or `null`. */
export function perspectiveCssTransform(
  width: number,
  height: number,
  perspectiveX = 0,
  perspectiveY = 0
): string | null {
  if (!hasPerspective(perspectiveX, perspectiveY)) return null;
  if (!(width > 0) || !(height > 0)) return null;
  return homographyToMatrix3d(
    perspectiveHomography(width, height, perspectiveX, perspectiveY)
  );
}

function drawAffineTriangle(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  s0: Point,
  s1: Point,
  s2: Point,
  d0: Point,
  d1: Point,
  d2: Point
) {
  const den = s0.x * (s2.y - s1.y) + s1.x * (s0.y - s2.y) + s2.x * (s1.y - s0.y);
  if (Math.abs(den) < 1e-12) return;

  const a = (d0.x * (s2.y - s1.y) + d1.x * (s0.y - s2.y) + d2.x * (s1.y - s0.y)) / den;
  const b = (d0.y * (s2.y - s1.y) + d1.y * (s0.y - s2.y) + d2.y * (s1.y - s0.y)) / den;
  const c = (d0.x * (s1.x - s2.x) + d1.x * (s2.x - s0.x) + d2.x * (s0.x - s1.x)) / den;
  const d = (d0.y * (s1.x - s2.x) + d1.y * (s2.x - s0.x) + d2.y * (s0.x - s1.x)) / den;
  const e =
    (d0.x * (s2.x * s1.y - s1.x * s2.y) +
      d1.x * (s0.x * s2.y - s2.x * s0.y) +
      d2.x * (s1.x * s0.y - s0.x * s1.y)) /
    den;
  const f =
    (d0.y * (s2.x * s1.y - s1.x * s2.y) +
      d1.y * (s0.x * s2.y - s2.x * s0.y) +
      d2.y * (s1.x * s0.y - s0.x * s1.y)) /
    den;

  // Grow the clip a hair so neighbouring cells overlap instead of showing seams
  const cx = (d0.x + d1.x + d2.x) / 3;
  const cy = (d0.y + d1.y + d2.y) / 3;
  const spread =
    (Math.hypot(d0.x - cx, d0.y - cy) +
      Math.hypot(d1.x - cx, d1.y - cy) +
      Math.hypot(d2.x - cx, d2.y - cy)) /
    3;
  const grow = spread > 1e-6 ? 1 + 0.9 / spread : 1;
  const gx = (p: Point) => cx + (p.x - cx) * grow;
  const gy = (p: Point) => cy + (p.y - cy) * grow;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(gx(d0), gy(d0));
  ctx.lineTo(gx(d1), gy(d1));
  ctx.lineTo(gx(d2), gy(d2));
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);

  // Only sample the cell (plus padding), never the whole image — keeps the
  // per-cell cost flat regardless of source resolution.
  const pad = 1;
  const minX = Math.max(0, Math.floor(Math.min(s0.x, s1.x, s2.x) - pad));
  const minY = Math.max(0, Math.floor(Math.min(s0.y, s1.y, s2.y) - pad));
  const maxX = Math.min(sourceWidth, Math.ceil(Math.max(s0.x, s1.x, s2.x) + pad));
  const maxY = Math.min(sourceHeight, Math.ceil(Math.max(s0.y, s1.y, s2.y) + pad));
  const w = maxX - minX;
  const h = maxY - minY;
  if (w > 0 && h > 0) {
    ctx.drawImage(source, minX, minY, w, h, minX, minY, w, h);
  }
  ctx.restore();
}

/** Subdivision count that keeps the affine error well under a pixel. */
export function perspectiveSubdivisions(width: number, height: number) {
  const longest = Math.max(width, height);
  return Math.max(12, Math.min(64, Math.round(longest / 24)));
}

/**
 * Draw `source` so its corners land on `dest` (TL, TR, BR, BL) in the current
 * canvas user space. Canvas 2D has no projective transform, so the image is
 * subdivided into a grid and each cell drawn with its own affine map — the
 * error inside a cell shrinks quadratically with the cell size.
 */
export function drawPerspectiveImage(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  dest: [Point, Point, Point, Point],
  subdivisions?: number
) {
  const steps = subdivisions ?? perspectiveSubdivisions(sourceWidth, sourceHeight);
  const h = homographyFromUnitSquare(dest);

  const dst = (u: number, v: number) => applyMat3(h, u, v);
  const src = (u: number, v: number): Point => ({ x: u * sourceWidth, y: v * sourceHeight });

  for (let i = 0; i < steps; i++) {
    const u0 = i / steps;
    const u1 = (i + 1) / steps;
    for (let j = 0; j < steps; j++) {
      const v0 = j / steps;
      const v1 = (j + 1) / steps;

      const s00 = src(u0, v0);
      const s10 = src(u1, v0);
      const s11 = src(u1, v1);
      const s01 = src(u0, v1);

      const d00 = dst(u0, v0);
      const d10 = dst(u1, v0);
      const d11 = dst(u1, v1);
      const d01 = dst(u0, v1);

      drawAffineTriangle(ctx, source, sourceWidth, sourceHeight, s00, s10, s11, d00, d10, d11);
      drawAffineTriangle(ctx, source, sourceWidth, sourceHeight, s00, s11, s01, d00, d11, d01);
    }
  }
}
