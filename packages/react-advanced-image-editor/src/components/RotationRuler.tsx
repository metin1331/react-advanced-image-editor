import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ALIGN_VISUAL_DEG,
  SNAP_EXIT_DEG,
  SNAP_PULL,
  alignProximity,
  alignTargetsForRuler,
  applyMagneticSnap,
  type AlignAxis,
} from '../crop/alignSnap';
import { attachPointerHeld, markScriptScroll } from '../crop/pointerHeld';

const MIN_ANGLE = -45;
const MAX_ANGLE = 45;
const TICK_STEP = 1;
const MAJOR_EVERY = 5;
/** Visual spacing per degree (tick width + side margins). */
const PX_PER_DEGREE = 8;

/**
 * Fallbacks when props are omitted. Must NOT be assigned back onto the same
 * custom property (that creates a cyclic `var(--ie-ruler-positive)`).
 */
const FALLBACK_NEGATIVE = 'var(--ie-ruler-negative)';
const FALLBACK_POSITIVE = 'var(--ie-accent)';
const DEFAULT_TICK_WIDTH = 2;

/** All non-main ticks share one height; main tick is always tallest. */
const TICK_H = 14;
const MAIN_TICK_H = TICK_H * 2;
/** Trail peak stays below main so main is always visually taller */
const TRAIL_PEAK_H = MAIN_TICK_H - 6;

/** Slow drag: trail spans ~8 ticks; faster scroll stretches further */
const TRAIL_LOCKED_PX = PX_PER_DEGREE * 8;
const TRAIL_MAX_PX = PX_PER_DEGREE * 22;
/** Enter flowing slope above this speed; exit below (hysteresis) */
const VELOCITY_SLOPE_ENTER = 220;
const VELOCITY_SLOPE_EXIT = 110;
/** Scroll speed (px/s) at which slope reaches full length */
const VELOCITY_FOR_MAX_TRAIL = 1200;
/** Below this → collapse trail (idle / micro-jitter) */
const MIN_TRAIL_SPEED = 40;
const VELOCITY_SMOOTH = 0.24;
const TRAIL_SMOOTH_EXPAND = 0.28;
const TRAIL_SMOOTH_SHRINK = 0.2;
/** After release — slope collapses faster */
const TRAIL_RELEASE_SHRINK = 0.58;
const RELEASE_VELOCITY_DECAY = 0.7;
/** Main-tick handoff: new main grows / old main shrinks quickly */
const MAIN_HANDOFF_GROW = 0.62;
const MAIN_HANDOFF_SHRINK = 0.58;
/** Other tick height follow rate (trail) */
const HEIGHT_FOLLOW = 0.38;

const BADGE_SIZE = 44;
const BADGE_STROKE = 1.75;
const BADGE_RADIUS = (BADGE_SIZE - BADGE_STROKE) / 2 - 0.5;
const INACTIVE_OPACITY = 0.22;

export type RotationRulerProps = {
  value: number;
  onChange: (angle: number) => void;
  onCommit?: (angle: number) => void;
  min?: number;
  max?: number;
  /** Major tick every N units (default 5). */
  majorEvery?: number;
  /** Badge label; defaults to rounded integer. */
  formatValue?: (value: number) => string;
  /** Show the circular value badge above the ruler (default true). */
  showBadge?: boolean;
  className?: string;
  /**
   * Derive tick heights from real-time distance to the center while scrolling.
   * Defaults to `true`. The circular progress border is always animated and cannot be disabled.
   */
  animateTicks?: boolean;
  /** Active color when value ≤ 0 (default `--ie-ruler-negative` from theme). */
  negativeColor?: string;
  /** Active color when value > 0 (default `--ie-accent`). */
  positiveColor?: string;
  /** Width in px for minor ticks (default `2`). Sets `--ie-ruler-tick-width`. */
  tickWidth?: number;
  /** Width in px for major ticks (default: same as `tickWidth`). */
  majorTickWidth?: number;
  /**
   * Discrete quarter-turn already applied to the image (0 / 90 / 180 / 270).
   * Decides whether the 0° snap is a **horizontal** or **vertical** alignment
   * (90°/270° → vertical). Ignored on non-signed rulers (e.g. Scale 0–100).
   */
  imageRotation?: number;
  /** Soft magnetic snap to H/V alignment angles (default `true` for signed rulers). */
  alignSnap?: boolean;
  /**
   * Force horizontal or vertical alignment semantics (from the mode-strip badge).
   * When omitted, axis follows the discrete quarter-turn.
   */
  forcedAlignAxis?: AlignAxis | null;
  /**
   * Show the scrolling mark + center target on the ruler track.
   * Typically `true` only in horizontal / vertical straighten modes.
   */
  showAlignIndicators?: boolean;
  /** Accessible name for the ruler slider. */
  ariaLabel?: string;
  /** When true, a hold on the ruler viewport triggers chrome fade-out (Crop / Calibrate). */
  chromeHoldFadeEnabled?: boolean;
  onChromeHoldFadeBegin?: (
    focus: string | null,
    stillActive?: () => boolean,
  ) => void;
  onChromeHoldFadeEnd?: () => void;
  /** Marks this ruler as the one kept visible during chrome fade. */
  rulerFocusActive?: boolean;
  /** When true, participate in selective chrome fade (e.g. filter intensity). */
  chromeFadeAsSelective?: boolean;
  /** Id passed to hold-fade focus (mode or adjust channel). */
  chromeHoldFadeFocus?: string | null;
  /** Fired when the user starts or stops scrubbing this ruler. */
  onInteractChange?: (active: boolean) => void;
  /** Parked at 0: fade tick / accent colors until the next badge tap restores. */
  parked?: boolean;
};

function clampAngle(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** Always exactly one main tick — avoids the .5° gap where none matched. */
function mainTickIndex(mainAngle: number) {
  return Math.round(mainAngle);
}

function isMainTick(angle: number, mainAngle: number) {
  return angle === mainTickIndex(mainAngle);
}

function isMajorTick(angle: number, majorEvery: number) {
  return angle % majorEvery === 0;
}

/** Main tick uses a class so CSS can transition parked / strip-wash mixes. */
function paintTickChrome(
  node: HTMLSpanElement,
  angle: number,
  mainIdx: number,
  majorEvery: number,
) {
  const main = angle === mainIdx;
  node.style.background = '';
  node.classList.toggle('ie-ruler-tick-main', main);
  if (main) {
    node.classList.remove('ie-ruler-tick-major');
  } else if (isMajorTick(angle, majorEvery)) {
    node.classList.add('ie-ruler-tick-major');
  } else {
    node.classList.remove('ie-ruler-tick-major');
  }
}

/**
 * One-sided continuous trail behind scroll direction.
 * Main tick is always MAIN_TICK_H; neighbors ramp up to TRAIL_PEAK_H only (< main).
 */
function heightTrailingMain(
  angle: number,
  mainAngle: number,
  trailRadiusPx: number,
  trailSide: number
) {
  if (isMainTick(angle, mainAngle)) return MAIN_TICK_H;
  if (trailRadiusPx <= 0.5) return TICK_H;

  let behindDistPx: number;

  if (trailSide >= 0) {
    // Scrolling +x → trail on −x (lower angles)
    if (angle >= mainAngle) return TICK_H;
    behindDistPx = (mainAngle - angle) * PX_PER_DEGREE;
  } else {
    if (angle <= mainAngle) return TICK_H;
    behindDistPx = (angle - mainAngle) * PX_PER_DEGREE;
  }

  if (behindDistPx <= 0 || behindDistPx > trailRadiusPx) return TICK_H;
  const t = 1 - behindDistPx / trailRadiusPx;
  const proximity = t ** 1.35;
  return TICK_H + (TRAIL_PEAK_H - TICK_H) * proximity;
}

function trailRadiusFromVelocity(speedPxPerSec: number, slopeActive: boolean) {
  if (speedPxPerSec < MIN_TRAIL_SPEED) return 0;
  if (!slopeActive) return TRAIL_LOCKED_PX;
  const span = VELOCITY_FOR_MAX_TRAIL - VELOCITY_SLOPE_ENTER;
  const n = Math.min(
    1,
    Math.max(0, (speedPxPerSec - VELOCITY_SLOPE_ENTER) / Math.max(1, span))
  );
  const eased = n * n;
  return TRAIL_LOCKED_PX + (TRAIL_MAX_PX - TRAIL_LOCKED_PX) * eased;
}

function angleFromScroll(scrollLeft: number, min: number) {
  return min + scrollLeft / PX_PER_DEGREE;
}

function scrollFromAngle(angle: number, min: number) {
  return (angle - min) * PX_PER_DEGREE;
}

export function RotationRuler({
  value,
  onChange,
  onCommit,
  min = MIN_ANGLE,
  max = MAX_ANGLE,
  majorEvery = MAJOR_EVERY,
  formatValue,
  showBadge = true,
  className,
  animateTicks = true,
  negativeColor,
  positiveColor,
  tickWidth = DEFAULT_TICK_WIDTH,
  majorTickWidth,
  imageRotation = 0,
  alignSnap = true,
  forcedAlignAxis = null,
  showAlignIndicators = false,
  ariaLabel = 'Rotation',
  chromeHoldFadeEnabled = false,
  onChromeHoldFadeBegin,
  onChromeHoldFadeEnd,
  rulerFocusActive = false,
  chromeFadeAsSelective = false,
  chromeHoldFadeFocus = null,
  onInteractChange,
  parked = false,
}: RotationRulerProps) {
  const resolvedMajorTickWidth = majorTickWidth ?? tickWidth;
  const resolvedNegative = negativeColor ?? FALLBACK_NEGATIVE;
  const resolvedPositive = positiveColor ?? FALLBACK_POSITIVE;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const tickNodesRef = useRef(new Map<number, HTMLSpanElement>());
  const interacting = useRef(false);
  const interactionHeldRef = useRef(false);
  const dragRef = useRef(false);
  const onInteractChangeRef = useRef(onInteractChange);
  onInteractChangeRef.current = onInteractChange;
  /** crop-grid-inner: stays visible until pointer/touch lifts, not scroll idle. */
  const rulerGridHeldRef = useRef(false);
  /**
   * Touchpad two-finger scroll (no click): keep grid while the cursor stays on
   * the ruler — do not end on wheel idle (finger may pause without lifting).
   */
  const pointerOverRulerRef = useRef(false);
  const wheelGridSessionRef = useRef(false);
  const touchHeldRef = useRef(false);
  const lastX = useRef(0);
  const suppressScroll = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const alignTargets = useMemo(
    () =>
      alignSnap ? alignTargetsForRuler(min, max, imageRotation, forcedAlignAxis) : [],
    [alignSnap, min, max, imageRotation, forcedAlignAxis]
  );
  const alignEnabled = alignTargets.length > 0;
  // Origin mark is independent of magnetic snap — Scale (0…100) has no snap
  // targets but still needs the start-dot when the value leaves 0.
  const alignIndicatorsVisible = showAlignIndicators;
  const lockedSnapRef = useRef<number | null>(null);
  const alignAxisRef = useRef<AlignAxis | null>(
    alignTargets[0]?.axis ?? null
  );
  const alignProximityRef = useRef(0);

  const [display, setDisplay] = useState(value);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [arcAngle, setArcAngle] = useState(value);
  const arcRef = useRef(value);
  const arcRaf = useRef<number | null>(null);

  const [padX, setPadX] = useState(0);
  const padXRef = useRef(0);
  padXRef.current = padX;

  const frameRaf = useRef<number | null>(null);
  /** Scrolls with the 0° tick — the H/V alignment reference mark. */
  const alignMarkRef = useRef<HTMLSpanElement | null>(null);
  /** Fixed at the ruler viewport center — becomes the active alignment target. */
  const alignTargetRef = useRef<HTMLSpanElement | null>(null);
  const animateTicksRef = useRef(animateTicks);
  animateTicksRef.current = animateTicks;
  const negativeColorRef = useRef(resolvedNegative);
  const positiveColorRef = useRef(resolvedPositive);
  negativeColorRef.current = resolvedNegative;
  positiveColorRef.current = resolvedPositive;

  /**
   * Origin mark only: a dot on the ruler's start tick (0) while the value is
   * away from rest. Never paints on the fixed main-tick center — that was
   * reading as a second ghost dot under the hairline.
   */
  const paintAlignIndicators = useCallback(
    (angle: number, _proximity: number, axis: AlignAxis | null) => {
      const mark = alignMarkRef.current;
      const target = alignTargetRef.current;
      // Center target stays permanently off (kept in the DOM for layout stability).
      if (target) {
        target.style.opacity = '0';
        target.style.transform = 'translate(-50%, 0) scale(0.6)';
        target.dataset.active = 'false';
      }
      if (!mark) return;
      if (!alignIndicatorsVisible) {
        mark.style.opacity = '0';
        mark.dataset.active = 'false';
        return;
      }

      const axisName = axis ?? 'horizontal';
      // Half-step deadzone matches the ruler's 0.5 quantization.
      const away = Math.abs(angle) >= 0.25;
      mark.dataset.ieAxis = axisName;
      mark.dataset.active = away ? 'true' : 'false';
      mark.style.opacity = away ? '1' : '0';

      alignProximityRef.current = away ? 1 : 0;
      alignAxisRef.current = axis;
    },
    [alignIndicatorsVisible]
  );

  const lastScrollLeftRef = useRef<number | null>(null);
  const lastScrollTimeRef = useRef(0);
  /** Smoothed speed — lag gives the weighted feel */
  const velocityRef = useRef(0);
  const trailRadiusRef = useRef(0);
  /** Hysteresis: once flowing, stay flowing until speed drops below EXIT */
  const slopeActiveRef = useRef(false);
  /** +1 = trail on −x side; −1 = trail on +x side */
  const trailSideRef = useRef(1);
  /** Displayed heights (lerped) — enables fast main-tick grow/shrink handoff */
  const heightDisplayRef = useRef(new Map<number, number>());
  const lastMainTickRef = useRef<number | null>(null);
  /** Previous main while it finishes shrinking after a handoff */
  const outgoingMainRef = useRef<number | null>(null);
  const heightSettlingRef = useRef(false);

  const ticks = useMemo(() => {
    const list: number[] = [];
    for (let a = min; a <= max; a += TICK_STEP) list.push(a);
    return list;
  }, [min, max]);

  const stopArcRaf = () => {
    if (arcRaf.current != null) {
      cancelAnimationFrame(arcRaf.current);
      arcRaf.current = null;
    }
  };

  const stopFrameLoop = () => {
    if (frameRaf.current != null) {
      cancelAnimationFrame(frameRaf.current);
      frameRaf.current = null;
    }
  };

  const syncArcImmediate = (angle: number) => {
    stopArcRaf();
    arcRef.current = angle;
    setArcAngle(angle);
  };

  const easeArcTo = (target: number) => {
    stopArcRaf();
    const start = arcRef.current;
    if (Math.abs(start - target) < 0.01) {
      arcRef.current = target;
      setArcAngle(target);
      return;
    }
    const t0 = performance.now();
    const duration = 150;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = 1 - (1 - t) ** 3;
      const next = start + (target - start) * e;
      arcRef.current = next;
      setArcAngle(next);
      if (t < 1) arcRaf.current = requestAnimationFrame(step);
      else arcRaf.current = null;
    };
    arcRaf.current = requestAnimationFrame(step);
  };

  const sampleVelocityAndTrail = useCallback((scrollLeft: number, now: number) => {
    const lastLeft = lastScrollLeftRef.current;
    const lastTime = lastScrollTimeRef.current;

    if (lastLeft != null && lastTime > 0) {
      const dt = Math.max(0.001, (now - lastTime) / 1000);
      const dScroll = scrollLeft - lastLeft;
      const instant = Math.abs(dScroll) / dt;

      if (Math.abs(dScroll) > 0.08) {
        trailSideRef.current = dScroll > 0 ? 1 : -1;
        const capped = Math.min(instant, VELOCITY_FOR_MAX_TRAIL * 1.35);
        velocityRef.current += (capped - velocityRef.current) * VELOCITY_SMOOTH;
      } else {
        velocityRef.current *= interacting.current ? 0.92 : 0.86;
      }
    }

    lastScrollLeftRef.current = scrollLeft;
    lastScrollTimeRef.current = now;

    const speed = velocityRef.current;
    if (speed >= VELOCITY_SLOPE_ENTER) slopeActiveRef.current = true;
    else if (speed <= VELOCITY_SLOPE_EXIT) slopeActiveRef.current = false;

    const target = trailRadiusFromVelocity(speed, slopeActiveRef.current);
    const current = trailRadiusRef.current;
    const k = target > current ? TRAIL_SMOOTH_EXPAND : TRAIL_SMOOTH_SHRINK;
    trailRadiusRef.current = current + (target - current) * k;
  }, []);

  /**
   * Every frame: continuous trail + fast handoff when main tick changes
   * (new main grows quickly, previous main shrinks quickly).
   */
  const paintTickHeights = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const now = performance.now();
    sampleVelocityAndTrail(el.scrollLeft, now);

    const mainAngle = angleFromScroll(el.scrollLeft, min);
    const mainIdx = mainTickIndex(mainAngle);
    if (lastMainTickRef.current != null && lastMainTickRef.current !== mainIdx) {
      outgoingMainRef.current = lastMainTickRef.current;
    }
    const outgoing = outgoingMainRef.current;
    const active =
      mainAngle >= 0 ? positiveColorRef.current : negativeColorRef.current;
    (el.closest('[data-ie-part="rotation-ruler"]') as HTMLElement | null)?.style.setProperty(
      '--ie-ruler-active',
      active,
    );

    const trailRadius = animateTicksRef.current ? trailRadiusRef.current : 0;
    const trailSide = trailSideRef.current;

    let settling = false;
    let outgoingSettled = outgoing == null;

    for (const [angle, node] of tickNodesRef.current) {
      const main = angle === mainIdx;
      const target = animateTicksRef.current
        ? heightTrailingMain(angle, mainAngle, trailRadius, trailSide)
        : main
          ? MAIN_TICK_H
          : TICK_H;

      const current = heightDisplayRef.current.get(angle) ?? target;
      let height: number;

      if (!animateTicksRef.current) {
        height = target;
      } else {
        let k = HEIGHT_FOLLOW;
        if (main && current < target - 0.25) {
          // New main → shoot up
          k = MAIN_HANDOFF_GROW;
        } else if (!main && outgoing != null && angle === outgoing && current > target + 0.25) {
          // Old main → drop fast toward trail/default
          k = MAIN_HANDOFF_SHRINK;
        } else if (current > target + 0.25) {
          k = TRAIL_SMOOTH_SHRINK + 0.12;
        }

        height = current + (target - current) * k;
        if (Math.abs(height - target) < 0.35) height = target;
        else settling = true;

        if (outgoing != null && angle === outgoing && Math.abs(height - target) < 0.35) {
          outgoingSettled = true;
        }
      }

      heightDisplayRef.current.set(angle, height);
      node.style.height = `${height}px`;
      paintTickChrome(node, angle, mainIdx, majorEvery);
    }

    if (alignEnabled) {
      const prox = alignProximity(mainAngle, alignTargets[0].angle, ALIGN_VISUAL_DEG);
      paintAlignIndicators(mainAngle, prox, alignTargets[0].axis);
    }

    lastMainTickRef.current = mainIdx;
    if (outgoingSettled) outgoingMainRef.current = null;
    heightSettlingRef.current = settling;
  }, [
    min,
    max,
    majorEvery,
    sampleVelocityAndTrail,
    alignEnabled,
    alignTargets,
    paintAlignIndicators,
  ]);

  const ensureFrameLoop = useCallback(() => {
    if (frameRaf.current != null) return;

    const loop = () => {
      paintTickHeights();
      if (
        interacting.current ||
        velocityRef.current > 8 ||
        trailRadiusRef.current > 1 ||
        heightSettlingRef.current
      ) {
        if (!interacting.current) {
          velocityRef.current *= RELEASE_VELOCITY_DECAY;
          if (velocityRef.current <= VELOCITY_SLOPE_EXIT) slopeActiveRef.current = false;
          trailRadiusRef.current += (0 - trailRadiusRef.current) * TRAIL_RELEASE_SHRINK;
        }
        frameRaf.current = requestAnimationFrame(loop);
      } else {
        frameRaf.current = null;
        trailRadiusRef.current = 0;
        velocityRef.current = 0;
        slopeActiveRef.current = false;
        paintTickHeights();
      }
    };

    frameRaf.current = requestAnimationFrame(loop);
  }, [paintTickHeights]);

  /** Idle: only the main tick is tall; clear trail residue from prior frames. */
  const snapIdleHeights = useCallback((angle: number) => {
    trailRadiusRef.current = 0;
    velocityRef.current = 0;
    slopeActiveRef.current = false;
    heightSettlingRef.current = false;
    outgoingMainRef.current = null;
    const mainIdx = mainTickIndex(angle);
    lastMainTickRef.current = mainIdx;
    const root = scrollerRef.current?.closest(
      '[data-ie-part="rotation-ruler"]',
    ) as HTMLElement | null;
    root?.style.setProperty(
      '--ie-ruler-active',
      angle >= 0 ? positiveColorRef.current : negativeColorRef.current,
    );
    for (const [a, node] of tickNodesRef.current) {
      const h = a === mainIdx ? MAIN_TICK_H : TICK_H;
      heightDisplayRef.current.set(a, h);
      node.style.height = `${h}px`;
      paintTickChrome(node, a, mainIdx, majorEvery);
    }
    if (alignEnabled) {
      const prox = alignProximity(angle, alignTargets[0].angle, ALIGN_VISUAL_DEG);
      paintAlignIndicators(angle, prox, alignTargets[0].axis);
    } else {
      paintAlignIndicators(angle, 0, null);
    }
  }, [majorEvery, min, max, alignEnabled, alignTargets, paintAlignIndicators]);

  const syncScrollToAngle = useCallback(
    (angle: number, opts?: { snapIdle?: boolean }) => {
      const el = scrollerRef.current;
      if (!el) return;
      const next = scrollFromAngle(angle, min);
      const needsScroll = Math.abs(el.scrollLeft - next) >= 0.5;
      if (needsScroll) {
        suppressScroll.current = true;
        markScriptScroll(el);
        el.scrollLeft = next;
      }
      requestAnimationFrame(() => {
        suppressScroll.current = false;
        if (opts?.snapIdle !== false && !interacting.current) {
          snapIdleHeights(angle);
        } else {
          paintTickHeights();
        }
      });
    },
    [min, paintTickHeights, snapIdleHeights]
  );

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => {
      // Centre on the tick mid-line.
      const next = Math.max(0, el.clientWidth / 2 - tickWidth / 2);
      padXRef.current = next;
      setPadX(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tickWidth]);

  useEffect(() => {
    if (interacting.current) return;
    setDisplay(value);
    arcRef.current = value;
    setArcAngle(value);
    // padX must be applied before scroll math; sync + idle snap after layout
    syncScrollToAngle(value, { snapIdle: true });
  }, [value, syncScrollToAngle, padX]);

  useEffect(() => {
    if (interacting.current) return;
    snapIdleHeights(valueRef.current);
  }, [animateTicks, ticks, snapIdleHeights]);

  useEffect(
    () => () => {
      stopFrameLoop();
      stopArcRaf();
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    []
  );

  const beginInteract = () => {
    interacting.current = true;
    const el = scrollerRef.current;
    if (el) {
      lastScrollLeftRef.current = el.scrollLeft;
      lastScrollTimeRef.current = performance.now();
    }
    ensureFrameLoop();
  };

  const syncRulerGridHold = useCallback(() => {
    const held =
      dragRef.current ||
      touchHeldRef.current ||
      (wheelGridSessionRef.current && pointerOverRulerRef.current);
    if (held === rulerGridHeldRef.current) return;
    rulerGridHeldRef.current = held;
    onInteractChangeRef.current?.(held);
  }, []);

  const endWheelGridSession = useCallback(() => {
    if (!wheelGridSessionRef.current) return;
    wheelGridSessionRef.current = false;
    syncRulerGridHold();
  }, [syncRulerGridHold]);

  const beginWheelGridSession = useCallback(() => {
    pointerOverRulerRef.current = true;
    wheelGridSessionRef.current = true;
    syncRulerGridHold();
  }, [syncRulerGridHold]);

  const requestChromeHoldFade = useCallback(() => {
    if (!chromeHoldFadeEnabled || !onChromeHoldFadeBegin) return;
    onChromeHoldFadeBegin(chromeHoldFadeFocus, () => interactionHeldRef.current);
  }, [
    chromeHoldFadeEnabled,
    onChromeHoldFadeBegin,
    chromeHoldFadeFocus,
  ]);

  const releaseChromeHoldFade = useCallback(() => {
    onChromeHoldFadeEnd?.();
  }, [onChromeHoldFadeEnd]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !chromeHoldFadeEnabled) return;
    return attachPointerHeld(
      el,
      {
        onAcquire: () => {
          interactionHeldRef.current = true;
          requestChromeHoldFade();
        },
        onRelease: () => {
          interactionHeldRef.current = false;
          releaseChromeHoldFade();
          // crop-mask follows the same contact end as the chrome fade.
          // scrollend fires when the fingers lift, while the cursor can
          // still be over the ruler.
          endWheelGridSession();
        },
      },
      { includeWheel: true },
    );
  }, [
    chromeHoldFadeEnabled,
    endWheelGridSession,
    releaseChromeHoldFade,
    requestChromeHoldFade,
  ]);

  /**
   * Touch contact on the ruler; touchpad wheel session ends on leave or when
   * the system reports contact ended (pointerup/cancel) while still over the band.
   */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const onEnter = () => {
      pointerOverRulerRef.current = true;
      syncRulerGridHold();
    };
    const onLeave = () => {
      pointerOverRulerRef.current = false;
      endWheelGridSession();
    };
    const onTouchStart = () => {
      touchHeldRef.current = true;
      syncRulerGridHold();
    };
    const onTouchEnd = () => {
      touchHeldRef.current = false;
      syncRulerGridHold();
    };
    /** Some trackpads emit pointerup when a scroll gesture ends. */
    const onContactEnd = () => {
      if (dragRef.current || touchHeldRef.current) return;
      if (!wheelGridSessionRef.current) return;
      endWheelGridSession();
    };

    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointerup', onContactEnd);
    el.addEventListener('pointercancel', onContactEnd);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    window.addEventListener('pointerup', onContactEnd);
    window.addEventListener('pointercancel', onContactEnd);
    return () => {
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointerup', onContactEnd);
      el.removeEventListener('pointercancel', onContactEnd);
      el.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('pointerup', onContactEnd);
      window.removeEventListener('pointercancel', onContactEnd);
    };
  }, [syncRulerGridHold, endWheelGridSession]);

  const endInteract = () => {
    if (!interacting.current) return;
    interacting.current = false;
    // crop-grid-inner visibility is tied to pointer/touch release (syncRulerGridHold).

    // On release: only the nearest half-tick to the origin snaps home. Larger
    // fine values (1 / 2 / 3 …) stay put — live magnetism no longer swallows them.
    let committed = valueRef.current;
    if (alignEnabled && alignTargets[0] && Math.abs(committed - alignTargets[0].angle) <= 0.5) {
      committed = alignTargets[0].angle;
      valueRef.current = committed;
      setDisplay(committed);
      syncScrollToAngle(committed, { snapIdle: false });
      onChange(committed);
      lockedSnapRef.current = committed;
      paintAlignIndicators(committed, 1, alignTargets[0].axis);
    }

    onCommit?.(committed);
    easeArcTo(committed);
    ensureFrameLoop(); // keep frames while velocity/trail shrink
  };

  const scheduleSettle = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      endInteract();
    }, 120);
  };

  /**
   * Map scroll → angle through the magnetic field, then (when attraction is
   * active and velocity is low) gently pull scrollLeft toward the snap so the
   * ruler ticks, indicators, and image all share one value — no jump, no
   * oscillation (damped pull + hysteresis live in `applyMagneticSnap`).
   */
  const applyAngleFromScroll = (scrollLeft: number) => {
    const el = scrollerRef.current;
    const raw = angleFromScroll(scrollLeft, min);
    const snapped = applyMagneticSnap(
      raw,
      alignTargets,
      lockedSnapRef.current,
      velocityRef.current
    );
    lockedSnapRef.current = snapped.locked;

    const continuous = clampAngle(snapped.angle, min, max);
    const next = clampAngle(Math.round(continuous * 2) / 2, min, max);

    paintAlignIndicators(continuous, snapped.proximity, snapped.axis);
    syncArcImmediate(continuous);

    // Damped scroll attraction — only while locked and moving slowly.
    if (
      el &&
      snapped.locked != null &&
      Math.abs(continuous - raw) > 0.02 &&
      velocityRef.current < 220
    ) {
      const targetScroll = scrollFromAngle(continuous, min);
      const gap = targetScroll - el.scrollLeft;
      if (Math.abs(gap) > 0.35) {
        suppressScroll.current = true;
        markScriptScroll(el);
        el.scrollLeft += gap * SNAP_PULL;
        requestAnimationFrame(() => {
          suppressScroll.current = false;
        });
      }
    }

    if (next === valueRef.current) return;
    valueRef.current = next;
    setDisplay(next);
    onChange(next);
  };

  const onScroll = () => {
    if (suppressScroll.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    // A resize (fullscreen, panel width) can move scrollLeft without a gesture.
    // Restoring the current angle keeps the photo from rotating on its own.
    if (!interacting.current && !dragRef.current) {
      syncScrollToAngle(valueRef.current, { snapIdle: false });
      return;
    }
    if (!interacting.current) {
      beginInteract();
      requestChromeHoldFade();
    } else ensureFrameLoop();
    if (!dragRef.current) beginWheelGridSession();
    applyAngleFromScroll(el.scrollLeft);
    scheduleSettle();
  };

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const dx = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      if (dx === 0) return;
      beginInteract();
      requestChromeHoldFade();
      beginWheelGridSession();
      // Horizontal touchpad scroll is the browser's own user scroll so
      // `scrollend` waits until the fingers lift, even if the cursor stays
      // over the ruler. A vertical wheel has no horizontal default action;
      // apply that delta ourselves.
      if (e.deltaX === 0) {
        e.preventDefault();
        markScriptScroll(el);
        el.scrollLeft += dx;
      }
      scheduleSettle();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [beginWheelGridSession]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const el = scrollerRef.current;
      if (!el) return;
      const dx = e.clientX - lastX.current;
      lastX.current = e.clientX;
      markScriptScroll(el);
      el.scrollLeft -= dx;
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = false;
      syncRulerGridHold();
      scheduleSettle();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [releaseChromeHoldFade, syncRulerGridHold]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    beginInteract();
    dragRef.current = true;
    syncRulerGridHold();
    lastX.current = e.clientX;
    if (settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
  };

  const setTickNode = useCallback((angle: number, node: HTMLSpanElement | null) => {
    if (node) {
      tickNodesRef.current.set(angle, node);
      // Init once per DOM node — never reset on React ref re-attach (that
      // briefly forced every tick including main back to TICK_H).
      if (node.dataset.ieTickInit !== '1') {
        node.dataset.ieTickInit = '1';
        node.style.height = `${TICK_H}px`;
      }
      return;
    }
    // Ignore null from ref re-attach; only drop detached nodes
    const existing = tickNodesRef.current.get(angle);
    if (existing && !existing.isConnected) {
      tickNodesRef.current.delete(angle);
    }
  }, []);

  const commitStep = (delta: number) => {
    const next = clampAngle(valueRef.current + delta, min, max);
    valueRef.current = next;
    setDisplay(next);
    syncArcImmediate(next);
    syncScrollToAngle(next);
    onChange(next);
    onCommit?.(next);
  };

  const shown = formatValue ? formatValue(display) : String(Math.round(display));
  const activeColor =
    display > 0 ? resolvedPositive : display < 0 ? resolvedNegative : resolvedPositive;

  const span = Math.max(Math.abs(min), Math.abs(max), 1);
  const progress = Math.min(1, Math.abs(arcAngle) / span);
  const circumference = 2 * Math.PI * BADGE_RADIUS;
  const arcLength = progress * circumference;
  const isPositive = arcAngle > 0;
  const isZero = Math.abs(arcAngle) < 0.05;
  const cx = BADGE_SIZE / 2;
  const cy = BADGE_SIZE / 2;

  const cssVars = {
    // Only write theme tokens when the host overrides them — never
    // `positive: var(--ie-ruler-positive)` (cyclic / "not defined").
    ...(negativeColor != null
      ? { ['--ie-ruler-negative' as string]: negativeColor }
      : null),
    ...(positiveColor != null
      ? { ['--ie-ruler-positive' as string]: positiveColor }
      : null),
    ['--ie-ruler-active' as string]: activeColor,
    ['--ie-ruler-inactive-opacity' as string]: String(INACTIVE_OPACITY),
    ['--ie-ruler-tick-width' as string]: `${tickWidth}px`,
    ['--ie-ruler-tick-major-width' as string]: `${resolvedMajorTickWidth}px`,
  } as React.CSSProperties;

  return (
    <div
      data-ie-part='rotation-ruler'
      data-ie-ruler-focus={
        !chromeFadeAsSelective && rulerFocusActive ? 'true' : undefined
      }
      data-ie-chrome-fade-target={chromeFadeAsSelective ? '' : undefined}
      data-ie-chrome-focus={
        chromeFadeAsSelective && rulerFocusActive ? 'true' : undefined
      }
      data-ie-ruler-sign={display > 0 ? 'positive' : 'negative'}
      data-ie-animate-ticks={animateTicks ? 'true' : 'false'}
      data-ie-parked={parked ? 'true' : undefined}
      className={className}
      style={cssVars}
    >
      {showBadge && (
        <div className='ie-angle-badge' aria-live='polite'>
          <svg
            className='ie-angle-badge-ring'
            width={BADGE_SIZE}
            height={BADGE_SIZE}
            viewBox={`0 0 ${BADGE_SIZE} ${BADGE_SIZE}`}
            aria-hidden
          >
            <circle
              className='ie-angle-ring-inactive'
              cx={cx}
              cy={cy}
              r={BADGE_RADIUS}
              fill='none'
              stroke={activeColor}
              strokeWidth={BADGE_STROKE}
              strokeOpacity={INACTIVE_OPACITY}
            />
            {!isZero && (
              <g
                transform={
                  isPositive
                    ? `translate(${cx} ${cy}) rotate(-90)`
                    : `translate(${cx} ${cy}) scale(-1 1) rotate(-90)`
                }
              >
                <circle
                  className='ie-angle-ring-active'
                  cx={0}
                  cy={0}
                  r={BADGE_RADIUS}
                  fill='none'
                  stroke={activeColor}
                  strokeWidth={BADGE_STROKE}
                  strokeLinecap='round'
                  strokeDasharray={`${arcLength} ${circumference}`}
                />
              </g>
            )}
          </svg>
          <span className='ie-angle-badge-value'>{shown}</span>
        </div>
      )}

      <div className='ie-ruler-shell'>
        {/*
          Fixed center target — becomes the active H/V alignment indicator as
          the continuous proximity to the snap angle rises. Does not jump; its
          opacity/scale are driven every frame from angular distance.
        */}
        {alignIndicatorsVisible && (
          <span
            ref={alignTargetRef}
            className='ie-ruler-align-target'
            data-ie-axis={alignTargets[0]?.axis ?? 'horizontal'}
            data-active='false'
            aria-hidden
          />
        )}
        <div
          ref={scrollerRef}
          className='ie-ruler-viewport'
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          role='slider'
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={display}
          aria-label={ariaLabel}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              commitStep(-1);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              commitStep(1);
            }
          }}
        >
          <div className='ie-ruler-track' style={{ paddingLeft: padX, paddingRight: padX }}>
            {ticks.map((a) => (
              <span
                key={a}
                ref={(node) => setTickNode(a, node)}
                className={
                  isMajorTick(a, majorEvery) ? 'ie-ruler-tick ie-ruler-tick-major' : 'ie-ruler-tick'
                }
                data-angle={a}
              >
                {a === 0 && alignIndicatorsVisible ? (
                  <span
                    ref={alignMarkRef}
                    className='ie-ruler-align-mark'
                    data-ie-axis={alignTargets[0]?.axis ?? 'horizontal'}
                    data-active='false'
                    aria-hidden
                  />
                ) : null}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export const ROTATION_RULER_MIN = MIN_ANGLE;
export const ROTATION_RULER_MAX = MAX_ANGLE;
