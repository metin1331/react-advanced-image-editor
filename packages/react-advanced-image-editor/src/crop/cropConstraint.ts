import { hasPerspective, perspectiveQuad, type CropArea } from 'react-advanced-image-editor-core';

/**
 * =============================================================================
 * CROP COVERAGE CONSTRAINT (iOS Photos / Pintura style)
 * =============================================================================
 * Geometry
 * --------
 * The crop frame is a fixed, axis-aligned rectangle centered in the viewport
 * (`fw` × `fh`). The image is drawn centered in the viewport, translated by
 * `t = (x·s, y·s)` px and rotated by `θ` about its own center, with on-screen
 * size `mw·s` × `mh·s` (`s = cover · zoom`).
 *
 * A crop corner `q` (relative to the viewport center) lies inside the image iff,
 * expressed in the image's own (unrotated) frame:
 *
 *     | R(−θ)·(q − t) |  ≤  (mw·s/2, mh·s/2)      componentwise
 *
 * Substituting `Q = R(−θ)·q` and `u = R(−θ)·t` makes the constraint separable:
 *
 *     |Q_x − u_x| ≤ hw       |Q_y − u_y| ≤ hh
 *
 * Over the four corners `Q_x` spans ±HX and `Q_y` spans ±HY where
 *
 *     HX = (fw/2)|cosθ| + (fh/2)|sinθ|
 *     HY = (fw/2)|sinθ| + (fh/2)|cosθ|
 *
 * so the exact set of valid translations is the axis-aligned box, **in rotated
 * space**:
 *
 *     u_x ∈ [−(hw − HX), hw − HX]      u_y ∈ [−(hh − HY), hh − HY]
 *
 * Consequences used below:
 *  - The minimum covering scale is closed-form: `s ≥ max(2·HX/mw, 2·HY/mh)`.
 *  - Constraining is a single orthogonal **projection onto a box** — no search,
 *    no iteration, no relaxation loop, therefore no jitter at the boundary.
 *  - The projection is idempotent: `constrain(constrain(c)) === constrain(c)`,
 *    so re-applying it every frame cannot oscillate or drift.
 *
 * Usage rules (also apply to future native ports)
 * -----------------------------------------------
 *  - Project the transform BEFORE rendering; never render an invalid frame and
 *    fix it on the next one.
 *  - Feed the projection the RAW gesture state (start value + total delta), not
 *    the previously constrained value, so floating point cannot accumulate.
 *  - Solve scale first, then translation, from that same state — the translation
 *    box is derived from the already-valid scale, so one constraint can never
 *    invalidate the other.
 *
 * Perspective
 * -----------
 * With a keystone applied the image is no longer a rectangle but a convex
 * quadrilateral, so the separable box above stops being exact. The same idea
 * still works though: "frame inside quad" is four linear inequalities in `u`
 * (one per quad edge, tightened by the worst of the four frame corners), so the
 * valid translations form a convex polygon instead of a box. Projecting onto a
 * convex polygon is still an exact, continuous, idempotent operation, and the
 * minimum covering scale is still well defined because growing the quad about
 * its centre can only enlarge the feasible set. The rectangle path is kept as a
 * closed-form fast path so behaviour without perspective is bit-for-bit
 * unchanged.
 * =============================================================================
 */

export type CoverageGeometry = {
  mediaWidth: number;
  mediaHeight: number;
  frameWidth: number;
  frameHeight: number;
  /** Total on-screen rotation in degrees (quarter turns + fine angle). */
  angleDeg: number;
  /** Scale at `zoom = 1`, i.e. `max(fw/mw, fh/mh)`. */
  cover: number;
  maxZoom: number;
  /** Keystone in [-1, 1]; 0 selects the closed-form rectangle path. */
  perspectiveX?: number;
  perspectiveY?: number;
};

type Vec = { x: number; y: number };

/**
 * Nudge above the exact minimum so the feasible polygon never degenerates to a
 * numerically empty set. 1e-5 relative is far below one device pixel.
 */
const COVER_EPSILON = 1e-5;

/** Half-extents of the rotated crop frame, measured in the image's own frame. */
export function rotatedFrameHalfExtents(fw: number, fh: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return {
    hx: (fw / 2) * c + (fh / 2) * s,
    hy: (fw / 2) * s + (fh / 2) * c,
  };
}

function geometryHasPerspective(g: CoverageGeometry) {
  return hasPerspective(g.perspectiveX ?? 0, g.perspectiveY ?? 0);
}

/** The four crop-frame corners expressed in the image's own (unrotated) frame. */
function frameCornersInImageSpace(g: CoverageGeometry): Vec[] {
  const rad = (g.angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = g.frameWidth / 2;
  const hh = g.frameHeight / 2;
  const out: Vec[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const x = sx * hw;
      const y = sy * hh;
      out.push({ x: x * cos + y * sin, y: -x * sin + y * cos });
    }
  }
  return out;
}

/** Keystoned image outline in image space, in on-screen pixels, TL/TR/BR/BL. */
function imageQuadAtScale(g: CoverageGeometry, s: number): Vec[] {
  const quad = perspectiveQuad(g.perspectiveX ?? 0, g.perspectiveY ?? 0);
  const w = g.mediaWidth * s;
  const h = g.mediaHeight * s;
  return quad.map((p) => ({ x: p.x * w, y: p.y * h }));
}

/**
 * "Every frame corner is inside the quad" reduced to `dot(a_i, u) <= b_i`,
 * one inequality per quad edge. `u` is the translation in image space.
 */
function translationHalfPlanes(quad: Vec[], corners: Vec[]) {
  const planes: { a: Vec; b: number }[] = [];
  for (let i = 0; i < quad.length; i++) {
    const p = quad[i];
    const q = quad[(i + 1) % quad.length];
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    let b = Infinity;
    for (const c of corners) {
      b = Math.min(b, ex * (c.y - p.y) - ey * (c.x - p.x));
    }
    planes.push({ a: { x: -ey, y: ex }, b });
  }
  return planes;
}

function clipToHalfPlane(poly: Vec[], a: Vec, b: number): Vec[] {
  const n = poly.length;
  if (!n) return poly;
  const out: Vec[] = [];
  const side = (p: Vec) => a.x * p.x + a.y * p.y - b;
  for (let i = 0; i < n; i++) {
    const cur = poly[i];
    const nxt = poly[(i + 1) % n];
    const dc = side(cur);
    const dn = side(nxt);
    if (dc <= 0) out.push(cur);
    if ((dc < 0 && dn > 0) || (dc > 0 && dn < 0)) {
      const t = dc / (dc - dn);
      out.push({ x: cur.x + (nxt.x - cur.x) * t, y: cur.y + (nxt.y - cur.y) * t });
    }
  }
  return out;
}

/** Convex polygon of valid translations at scale `s`; empty ⇒ `s` is too small. */
function feasibleTranslations(g: CoverageGeometry, s: number, corners: Vec[]): Vec[] {
  const quad = imageQuadAtScale(g, s);
  const r =
    4 * (g.mediaWidth * s + g.mediaHeight * s + g.frameWidth + g.frameHeight) + 1;
  let poly: Vec[] = [
    { x: -r, y: -r },
    { x: r, y: -r },
    { x: r, y: r },
    { x: -r, y: r },
  ];
  for (const { a, b } of translationHalfPlanes(quad, corners)) {
    poly = clipToHalfPlane(poly, a, b);
    if (!poly.length) return poly;
  }
  return poly;
}

/**
 * Minimum covering scale for the keystoned outline. Found by bisection because
 * there is no closed form for a general quad — but feasibility is monotone in
 * `s` (scaling a convex set about a contained origin can only grow it), so the
 * search is deterministic and its result varies continuously with the inputs.
 */
let quadScaleCacheKey = '';
let quadScaleCacheValue = 0;

function minCoverScaleQuad(g: CoverageGeometry): number {
  // A single render asks for this two or three times with identical geometry;
  // the bisection is pure, so one memo slot removes the repeats.
  const key = `${g.mediaWidth}|${g.mediaHeight}|${g.frameWidth}|${g.frameHeight}|${g.angleDeg}|${g.perspectiveX}|${g.perspectiveY}`;
  if (key === quadScaleCacheKey) return quadScaleCacheValue;

  const corners = frameCornersInImageSpace(g);
  const { hx, hy } = rotatedFrameHalfExtents(g.frameWidth, g.frameHeight, g.angleDeg);
  const seed = Math.max(
    (2 * hx) / g.mediaWidth,
    (2 * hy) / g.mediaHeight,
    1e-6
  );

  let hi = seed;
  let lo = 0;
  for (let i = 0; i < 40 && !feasibleTranslations(g, hi, corners).length; i++) {
    lo = hi;
    hi *= 1.5;
  }
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (feasibleTranslations(g, mid, corners).length) hi = mid;
    else lo = mid;
  }

  quadScaleCacheKey = key;
  quadScaleCacheValue = hi * (1 + COVER_EPSILON);
  return quadScaleCacheValue;
}

/**
 * Smallest zoom at which the transformed image still covers the whole crop
 * frame. At `angleDeg = 0` with no perspective this is exactly `1` (cover fit).
 */
export function minCoverZoom(g: CoverageGeometry) {
  const { mediaWidth: mw, mediaHeight: mh, cover } = g;
  if (mw <= 0 || mh <= 0 || cover <= 0) return 1;
  if (geometryHasPerspective(g)) return minCoverScaleQuad(g) / cover;
  const { hx, hy } = rotatedFrameHalfExtents(g.frameWidth, g.frameHeight, g.angleDeg);
  const sMin = Math.max((2 * hx) / mw, (2 * hy) / mh);
  return sMin / cover;
}

/** Closest point of a convex polygon (interior counts as distance 0). */
function projectOntoPolygon(poly: Vec[], p: Vec): Vec {
  if (!poly.length) return p;
  if (poly.length === 1) return poly[0];

  let inside = true;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) < -1e-9) {
      inside = false;
      break;
    }
  }
  if (inside) return p;

  let best = poly[0];
  let bestDist = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 1e-12 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    const cx = a.x + dx * t;
    const cy = a.y + dy * t;
    const d = (cx - p.x) ** 2 + (cy - p.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = { x: cx, y: cy };
    }
  }
  return best;
}

/** Valid zoom interval. Coverage wins over `maxZoom` if they ever conflict. */
export function zoomBounds(g: CoverageGeometry) {
  const min = minCoverZoom(g);
  return { min, max: Math.max(g.maxZoom, min) };
}

function clampSym(value: number, limit: number) {
  const l = Math.max(0, limit);
  return Math.min(l, Math.max(-l, value));
}

/**
 * Projects a raw crop onto the exact set of transforms whose frame is fully
 * covered by the rotated image. Deterministic, continuous, idempotent.
 */
export function constrainCropToImage(raw: CropArea, g: CoverageGeometry): CropArea {
  const { mediaWidth: mw, mediaHeight: mh, cover } = g;
  if (mw <= 0 || mh <= 0 || cover <= 0) return raw;

  const bounds = zoomBounds(g);
  const zoom = Math.min(bounds.max, Math.max(bounds.min, raw.zoom));

  const s = cover * zoom;
  const rad = (g.angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const tx = raw.x * s;
  const ty = raw.y * s;

  // Rotate into image space, project onto the valid set, rotate back
  let ux: number;
  let uy: number;

  if (geometryHasPerspective(g)) {
    const poly = feasibleTranslations(g, s, frameCornersInImageSpace(g));
    const u = projectOntoPolygon(poly, {
      x: tx * cos + ty * sin,
      y: -tx * sin + ty * cos,
    });
    ux = u.x;
    uy = u.y;
  } else {
    const { hx, hy } = rotatedFrameHalfExtents(g.frameWidth, g.frameHeight, g.angleDeg);
    ux = clampSym(tx * cos + ty * sin, (mw * s) / 2 - hx);
    uy = clampSym(-tx * sin + ty * cos, (mh * s) / 2 - hy);
  }

  return {
    ...raw,
    zoom,
    x: (ux * cos - uy * sin) / s,
    y: (ux * sin + uy * cos) / s,
  };
}

/** Free-form mode: only enforce the configured zoom range. */
export function constrainZoomOnly(
  raw: CropArea,
  minZoom: number,
  maxZoom: number
): CropArea {
  return { ...raw, zoom: Math.min(maxZoom, Math.max(minZoom, raw.zoom)) };
}

export function cropsEqual(a: CropArea, b: CropArea, eps = 1e-6) {
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.zoom - b.zoom) < eps
  );
}
