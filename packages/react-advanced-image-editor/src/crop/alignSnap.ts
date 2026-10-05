/**
 * Soft magnetic alignment for the straighten ruler (built-in style).
 *
 * All proximity / attraction is continuous in the angle — there is no
 * `if (angle === 0)` branch that jumps the value. Crossing a snap target is
 * C0-continuous with the linear region outside the catch radius.
 *
 * Hysteresis (enter < exit) prevents snap/unsnap flicker at the boundary.
 * High scroll velocity disables attraction so a flick can pass through 0°
 * without getting caught, matching the native dial.
 */

export type AlignAxis = 'horizontal' | 'vertical';

export type AlignTarget = {
  /** Angle on the fine-straighten ruler (typically 0). */
  angle: number;
  /**
   * Which image axis becomes square to the crop frame at this angle.
   * Driven by the discrete quarter-turn: 0°/180° → horizontal, 90°/270° → vertical.
   */
  axis: AlignAxis;
};

/**
 * Live magnetism is intentionally narrow. Fine straighten values (1 / 2 / 3)
 * must stay reachable — a wide catch + scroll pull was locking the dial at 0.
 * Exact settle onto 0 happens on release when within half a tick (see ruler).
 */
export const SNAP_ENTER_DEG = 0.35;
/** Degrees: leave the magnetic field (hysteresis > enter). */
export const SNAP_EXIT_DEG = 0.7;
/**
 * Visual falloff reserved for future soft cues. Origin-mark visibility is
 * binary (away from 0 ↔ at 0); the center target is no longer shown.
 */
export const ALIGN_VISUAL_DEG = 14;
/** Scroll speed (px/s) above which magnetism is fully off. */
export const SNAP_VEL_FULL_OFF = 900;
/** Below this speed, magnetism is at full strength. */
export const SNAP_VEL_FULL_ON = 140;
/** Compression exponent (>1 → sticky near the target, identity at the rim). */
export const SNAP_POWER = 1.35;
/**
 * Per-frame lerp of scrollLeft toward the snap while attracted.
 * 0 = no scroll fighting; live stickiness comes only from angle compression
 * inside the tiny enter radius.
 */
export const SNAP_PULL = 0;

export function alignAxisForRotation(rotationDeg: number): AlignAxis {
  const q = ((Math.round(rotationDeg / 90) % 4) + 4) % 4;
  return q % 2 === 0 ? 'horizontal' : 'vertical';
}

/** Snap targets that fall inside the ruler range. */
export function alignTargetsForRuler(
  min: number,
  max: number,
  rotationDeg: number,
  /** When set (horizontal / vertical mode badge), overrides quarter-turn axis. */
  forcedAxis?: AlignAxis | null
): AlignTarget[] {
  if (!(min < 0 && max > 0)) return [];
  const axis = forcedAxis ?? alignAxisForRotation(rotationDeg);
  return [{ angle: 0, axis }];
}

/**
 * Continuous proximity in [0, 1]: 1 = exactly on target, 0 = at/beyond
 * `radiusDeg`. Smoothstep so indicator transitions have no corner.
 */
export function alignProximity(angle: number, target: number, radiusDeg = ALIGN_VISUAL_DEG) {
  const u = Math.min(1, Math.abs(angle - target) / Math.max(1e-6, radiusDeg));
  // smoothstep of (1 − u)
  const t = 1 - u;
  return t * t * (3 - 2 * t);
}

/**
 * Compress `raw` toward `target` inside `radius`. At the rim the function is
 * the identity (no jump); near the center the slope flattens (magnetic stick).
 */
export function compressToward(
  raw: number,
  target: number,
  radius: number,
  power = SNAP_POWER
) {
  const d = raw - target;
  const ad = Math.abs(d);
  if (ad >= radius || ad < 1e-9) return raw;
  const u = ad / radius;
  return target + Math.sign(d) * radius * Math.pow(u, power);
}

/**
 * Velocity-weighted magnetism with enter/exit hysteresis.
 * `lockedTarget` is the angle currently holding the field, or null.
 */
export function applyMagneticSnap(
  raw: number,
  targets: AlignTarget[],
  lockedTarget: number | null,
  speedPxPerSec: number
): { angle: number; locked: number | null; proximity: number; axis: AlignAxis | null } {
  if (targets.length === 0) {
    return { angle: raw, locked: null, proximity: 0, axis: null };
  }

  let nearest = targets[0];
  let nearestDist = Math.abs(raw - nearest.angle);
  for (let i = 1; i < targets.length; i++) {
    const d = Math.abs(raw - targets[i].angle);
    if (d < nearestDist) {
      nearest = targets[i];
      nearestDist = d;
    }
  }

  let locked = lockedTarget;
  if (locked != null) {
    const still = targets.find((t) => t.angle === locked);
    if (!still || Math.abs(raw - locked) > SNAP_EXIT_DEG) locked = null;
  }
  if (locked == null && nearestDist <= SNAP_ENTER_DEG) {
    locked = nearest.angle;
  }

  const active =
    locked != null
      ? targets.find((t) => t.angle === locked) ?? nearest
      : nearest;

  const prox = alignProximity(raw, active.angle);
  if (locked == null) {
    return { angle: raw, locked: null, proximity: prox, axis: active.axis };
  }

  const velT = Math.min(
    1,
    Math.max(
      0,
      (speedPxPerSec - SNAP_VEL_FULL_ON) / (SNAP_VEL_FULL_OFF - SNAP_VEL_FULL_ON)
    )
  );
  // Full magnetism at low speed → none at high speed
  const strength = 1 - velT;
  if (strength <= 0.01) {
    return { angle: raw, locked, proximity: prox, axis: active.axis };
  }

  const compressed = compressToward(raw, locked, SNAP_EXIT_DEG, SNAP_POWER);
  const angle = raw + (compressed - raw) * strength;
  return {
    angle,
    locked,
    proximity: alignProximity(angle, active.angle),
    axis: active.axis,
  };
}
