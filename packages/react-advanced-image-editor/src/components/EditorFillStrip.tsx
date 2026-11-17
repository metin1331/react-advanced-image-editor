import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { FillState } from "react-advanced-image-editor-core";
import {
  FILL_SWATCH_NAMES,
  fillSwatchColor,
  fillSwatchLabel,
  type FillSwatchName,
} from "../color/tailwindPalette";

const IDS = FILL_SWATCH_NAMES;
const LAST = IDS.length - 1;
const ADD_POS = -1;
const ITEM_H = 46;

const DRAG_THRESHOLD_PX = 4;
const WHEEL_IDLE_MS = 140;
const RUBBER = 0.28;
const SNAP_MS = 200;
const TAP_SNAP_MS = 320;
const TOUCH_DRAG_GAIN = 0.8;
const INERTIA_FRICTION = 0.0038;
const INERTIA_MIN_V = 0.00055;
const VELOCITY_MAX_DT_MS = 64;

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function easeOutQuart(t: number) {
  return 1 - (1 - t) ** 4;
}

function clampIndex(index: number) {
  return Math.min(LAST, Math.max(0, index));
}

function nearestIndex(position: number) {
  return clampIndex(Math.round(position));
}

/** Gestures stop at `floor`. A short peek never parks on the pen cell. */
function rubberPosition(position: number, floor = 0) {
  if (position < floor) {
    const extra = floor - position;
    return floor - Math.min(0.16, extra * RUBBER);
  }
  if (position > LAST) return LAST + (position - LAST) * RUBBER;
  return position;
}

function normalizeWheelDelta(event: WheelEvent) {
  const line = 16;
  const page = 400;
  let dx = event.deltaX;
  let dy = event.deltaY;
  if (event.deltaMode === 1) {
    dx *= line;
    dy *= line;
  } else if (event.deltaMode === 2) {
    dx *= page;
    dy *= page;
  }
  return Math.abs(dx) >= Math.abs(dy) ? dx : dy;
}

function isColorName(value: string | null): value is FillSwatchName {
  return !!value && (IDS as readonly string[]).includes(value);
}

export type FillStripLabels = {
  color: string;
  blur: string;
  addColor: string;
};

type Props = {
  mode: FillState["mode"];
  family: FillSwatchName;
  shade: number;
  blur: number;
  labels: FillStripLabels;
  onSelectFamily: (name: FillSwatchName, commit: boolean) => void;
  onHighlight: (label: string) => void;
  onResetShade: () => void;
  onBlurAmount: (value: number, commit: boolean) => void;
  onOpenColorPicker: () => void;
  onChromeHoldFadeBegin?: (
    focus: string | null,
    stillActive?: () => boolean,
  ) => void;
  onChromeHoldFadeEnd?: () => void;
};

export function EditorFillStrip({
  mode,
  family,
  shade,
  blur,
  labels,
  onSelectFamily,
  onHighlight,
  onResetShade,
  onBlurAmount,
  onOpenColorPicker,
  onChromeHoldFadeBegin,
  onChromeHoldFadeEnd,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef(Math.max(0, IDS.indexOf(family)));
  const onAddRef = useRef(false);
  const familyRef = useRef(family);
  familyRef.current = family;
  const draggingRef = useRef(false);
  const pointerActiveRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startPosRef = useRef(0);
  const startHitRef = useRef<FillSwatchName | null>(null);
  const tapHandledRef = useRef(false);
  const movedRef = useRef(false);
  const snappingRef = useRef(false);
  const interactionHeldRef = useRef(false);
  const directionRef = useRef<"left" | "right" | null>(null);
  const lastPosRef = useRef(positionRef.current);
  const isTouchRef = useRef(false);
  const velPxRef = useRef(0);
  const lastMoveXRef = useRef(0);
  const lastMoveTRef = useRef(0);
  const snapRafRef = useRef(0);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pitchRef = useRef(ITEM_H);

  const applyLayout = useCallback((position: number) => {
    const root = rootRef.current;
    const track = trackRef.current;
    const frame = frameRef.current;
    if (!root || !track) return;
    const items = track.querySelectorAll<HTMLElement>(".ie-fill-color-item");
    const first = items[0];
    if (!first) return;
    const itemWidth = first.offsetWidth || ITEM_H;
    const itemHeight = first.offsetHeight || ITEM_H;
    const pitch = items[1] ? items[1].offsetLeft - first.offsetLeft : itemWidth;
    pitchRef.current = Math.max(1, pitch);
    const centerInTrack =
      first.offsetLeft + itemWidth / 2 + position * pitchRef.current;
    track.style.transform = `translate3d(${root.clientWidth / 2 - centerInTrack}px, 0, 0)`;
    if (!frame) return;
    frame.style.width = `${itemWidth}px`;
    frame.style.height = `${itemHeight}px`;
    frame.style.opacity = "1";
    frame.style.transform = `translate3d(${first.offsetLeft + position * pitchRef.current}px, ${first.offsetTop}px, 0)`;
  }, []);

  const noteDirection = useCallback((nextPos: number) => {
    const delta = nextPos - lastPosRef.current;
    if (delta > 1e-4) directionRef.current = "right";
    else if (delta < -1e-4) directionRef.current = "left";
    lastPosRef.current = nextPos;
  }, []);

  const resolveThresholdIndex = useCallback(() => {
    const frame = frameRef.current;
    const track = trackRef.current;
    const current = Math.max(0, IDS.indexOf(familyRef.current));
    const direction = directionRef.current;
    if (!frame || !track || !direction) return current;
    const select = frame.getBoundingClientRect();
    const items = track.querySelectorAll<HTMLElement>(".ie-fill-color-item");
    let chosen = current;
    items.forEach((el, index) => {
      const item = el.getBoundingClientRect();
      if (item.width <= 0) return;
      if (direction === "right") {
        if (select.right >= item.left + item.width * 0.65)
          chosen = Math.max(chosen, index);
      } else if (select.left <= item.left + item.width * 0.35) {
        chosen = Math.min(chosen, index);
      }
    });
    return clampIndex(chosen);
  }, []);

  const syncThreshold = useCallback(() => {
    const name = IDS[resolveThresholdIndex()];
    if (name && name !== familyRef.current) {
      onHighlight(fillSwatchLabel(name));
      onSelectFamily(name, false);
    }
  }, [onHighlight, onSelectFamily, resolveThresholdIndex]);

  const stopSnap = useCallback(() => {
    if (snapRafRef.current) {
      cancelAnimationFrame(snapRafRef.current);
      snapRafRef.current = 0;
    }
  }, []);

  const snapTo = useCallback(
    (targetIndex: number, history: boolean, durationMs?: number) => {
      onAddRef.current = false;
      const target = clampIndex(targetIndex);
      const name = IDS[target];
      const already = name === familyRef.current;
      stopSnap();
      snappingRef.current = true;
      const from = positionRef.current;
      const commitHistory = history && !already;
      if (Math.abs(from - target) < 0.001) {
        positionRef.current = target;
        applyLayout(target);
        snappingRef.current = false;
        if (!already) onSelectFamily(name, commitHistory);
        return;
      }
      if (!already) {
        onHighlight(fillSwatchLabel(name));
        onSelectFamily(name, false);
      }
      const start = performance.now();
      const duration =
        durationMs ?? Math.min(480, SNAP_MS + Math.abs(target - from) * 40);
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = durationMs != null ? easeOutQuart(t) : easeOutCubic(t);
        const next = from + (target - from) * eased;
        positionRef.current = next;
        applyLayout(next);
        if (t < 1) {
          snapRafRef.current = requestAnimationFrame(step);
          return;
        }
        snapRafRef.current = 0;
        snappingRef.current = false;
        positionRef.current = target;
        applyLayout(target);
        if (commitHistory) onSelectFamily(name, true);
      };
      snapRafRef.current = requestAnimationFrame(step);
    },
    [applyLayout, onHighlight, onSelectFamily, stopSnap],
  );

  const selectById = useCallback(
    (name: FillSwatchName) => {
      const wasOnAdd = onAddRef.current;
      onAddRef.current = false;
      const index = IDS.indexOf(name);
      if (index < 0) return;
      if (
        !wasOnAdd &&
        name === familyRef.current &&
        nearestIndex(positionRef.current) === index
      ) {
        onResetShade();
        return;
      }
      snappingRef.current = true;
      onHighlight(fillSwatchLabel(name));
      onSelectFamily(name, false);
      snapTo(index, false, TAP_SNAP_MS);
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      commitTimerRef.current = setTimeout(() => {
        commitTimerRef.current = null;
        onSelectFamily(name, true);
      }, 280);
    },
    [onHighlight, onResetShade, onSelectFamily, snapTo],
  );

  const snapToAdd = useCallback(() => {
    onAddRef.current = true;
    stopSnap();
    snappingRef.current = true;
    const from = positionRef.current;
    const target = ADD_POS;
    if (Math.abs(from - target) < 0.001) {
      positionRef.current = target;
      applyLayout(target);
      snappingRef.current = false;
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / TAP_SNAP_MS);
      const next = from + (target - from) * easeOutQuart(t);
      positionRef.current = next;
      applyLayout(next);
      if (t < 1) {
        snapRafRef.current = requestAnimationFrame(step);
        return;
      }
      snapRafRef.current = 0;
      snappingRef.current = false;
      positionRef.current = target;
      applyLayout(target);
    };
    snapRafRef.current = requestAnimationFrame(step);
  }, [applyLayout, stopSnap]);

  const releaseChrome = useCallback(() => {
    interactionHeldRef.current = false;
    onChromeHoldFadeEnd?.();
  }, [onChromeHoldFadeEnd]);

  const acquireChrome = useCallback(() => {
    if (!onChromeHoldFadeBegin) return;
    interactionHeldRef.current = true;
    onChromeHoldFadeBegin("fill-color", () => interactionHeldRef.current);
  }, [onChromeHoldFadeBegin]);

  const finishGesture = useCallback(() => {
    if (onAddRef.current && positionRef.current <= -0.5) snapToAdd();
    else snapTo(Math.max(0, IDS.indexOf(familyRef.current)), true);
    directionRef.current = null;
    velPxRef.current = 0;
    releaseChrome();
  }, [releaseChrome, snapTo, snapToAdd]);

  const coastThenSnap = useCallback(() => {
    const gain = isTouchRef.current ? TOUCH_DRAG_GAIN : 1;
    let velocity = (-velPxRef.current * gain) / pitchRef.current;
    if (!isTouchRef.current || Math.abs(velocity) < INERTIA_MIN_V) {
      finishGesture();
      return;
    }
    stopSnap();
    snappingRef.current = true;
    const coastStart = performance.now();
    let last = coastStart;
    const step = (now: number) => {
      if (now - coastStart > 900) {
        snapRafRef.current = 0;
        finishGesture();
        return;
      }
      const dt = Math.min(32, now - last);
      last = now;
      velocity *= Math.exp(-INERTIA_FRICTION * dt);
      let next = positionRef.current + velocity * dt;
      const floor = onAddRef.current ? ADD_POS : 0;
      if (next < floor || next > LAST) {
        next = rubberPosition(next, floor);
        velocity *= 0.32;
      }
      positionRef.current = next;
      noteDirection(next);
      applyLayout(next);
      syncThreshold();
      if (Math.abs(velocity) < INERTIA_MIN_V) {
        snapRafRef.current = 0;
        finishGesture();
        return;
      }
      snapRafRef.current = requestAnimationFrame(step);
    };
    snapRafRef.current = requestAnimationFrame(step);
  }, [applyLayout, finishGesture, noteDirection, stopSnap, syncThreshold]);

  useLayoutEffect(() => {
    if (mode !== "solid") return;
    const root = rootRef.current;
    if (root) root.style.setProperty("--ie-filter-item-w", `${ITEM_H}px`);
    applyLayout(positionRef.current);
  }, [applyLayout, mode]);

  useEffect(() => {
    if (mode !== "solid") return;
    if (onAddRef.current) return;
    if (draggingRef.current || pointerActiveRef.current || snappingRef.current)
      return;
    const index = IDS.indexOf(family);
    if (index < 0 || Math.abs(positionRef.current - index) < 0.001) return;
    positionRef.current = index;
    applyLayout(index);
  }, [applyLayout, family, mode]);

  useEffect(() => {
    if (mode !== "solid") return;
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root) return;
    const observer = new ResizeObserver(() => applyLayout(positionRef.current));
    observer.observe(root);
    if (track) observer.observe(track);
    return () => observer.disconnect();
  }, [applyLayout, mode]);

  useEffect(() => {
    if (mode !== "solid") return;
    const root = rootRef.current;
    if (!root) return;

    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.(".ie-fill-color-add"))
        return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.stopPropagation();
      if (wheelTimerRef.current) {
        clearTimeout(wheelTimerRef.current);
        wheelTimerRef.current = null;
      }
      pointerActiveRef.current = true;
      draggingRef.current = false;
      movedRef.current = false;
      tapHandledRef.current = false;
      pointerIdRef.current = event.pointerId;
      startXRef.current = event.clientX;
      startPosRef.current = positionRef.current;
      lastPosRef.current = positionRef.current;
      lastMoveXRef.current = event.clientX;
      lastMoveTRef.current = performance.now();
      velPxRef.current = 0;
      isTouchRef.current =
        event.pointerType === "touch" || event.pointerType === "pen";
      directionRef.current = null;
      const hit = (event.target as HTMLElement | null)?.closest?.(
        ".ie-fill-color-item",
      );
      const hitName = hit?.getAttribute("data-ie-fill-color") ?? null;
      startHitRef.current = isColorName(hitName) ? hitName : null;
      if (event.pointerType !== "mouse") {
        try {
          root.setPointerCapture(event.pointerId);
        } catch {
          /* Safari */
        }
      }
      bindWindow();
    };

    const applyDrag = (clientX: number, event?: Event) => {
      if (!pointerActiveRef.current) return;
      const dx = clientX - startXRef.current;
      if (!movedRef.current && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      if (!movedRef.current) {
        movedRef.current = true;
        draggingRef.current = true;
        root.setAttribute("data-ie-dragging", "true");
        stopSnap();
        acquireChrome();
        if (pointerIdRef.current != null) {
          try {
            root.setPointerCapture(pointerIdRef.current);
          } catch {
            /* Safari */
          }
        }
      }
      event?.preventDefault();
      const now = performance.now();
      const sampleDt = now - lastMoveTRef.current;
      if (sampleDt > 0 && sampleDt < VELOCITY_MAX_DT_MS) {
        const instant = (clientX - lastMoveXRef.current) / sampleDt;
        velPxRef.current = velPxRef.current * 0.62 + instant * 0.38;
      } else if (sampleDt >= VELOCITY_MAX_DT_MS) {
        velPxRef.current = 0;
      }
      lastMoveXRef.current = clientX;
      lastMoveTRef.current = now;
      const gain = isTouchRef.current ? TOUCH_DRAG_GAIN : 1;
      positionRef.current = rubberPosition(
        startPosRef.current - (dx * gain) / pitchRef.current,
        onAddRef.current ? ADD_POS : 0,
      );
      noteDirection(positionRef.current);
      applyLayout(positionRef.current);
      syncThreshold();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointerActiveRef.current || event.pointerId !== pointerIdRef.current)
        return;
      if (event.pointerType === "touch") return;
      applyDrag(event.clientX, event);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pointerActiveRef.current || event.touches.length === 0) return;
      isTouchRef.current = true;
      event.preventDefault();
      applyDrag(event.touches[0].clientX);
    };

    const endGesture = () => {
      if (!pointerActiveRef.current) {
        unbindWindow();
        return;
      }
      pointerActiveRef.current = false;
      const capturedId = pointerIdRef.current;
      pointerIdRef.current = null;
      root.removeAttribute("data-ie-dragging");
      if (capturedId != null) {
        try {
          root.releasePointerCapture(capturedId);
        } catch {
          /* ignore */
        }
      }
      unbindWindow();
      if (!movedRef.current) {
        releaseChrome();
        const tapped = startHitRef.current;
        startHitRef.current = null;
        if (tapped) {
          tapHandledRef.current = true;
          selectById(tapped);
        }
        return;
      }
      draggingRef.current = false;
      startHitRef.current = null;
      if (performance.now() - lastMoveTRef.current > 80) velPxRef.current = 0;
      coastThenSnap();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      if (
        pointerIdRef.current != null &&
        event.pointerId !== pointerIdRef.current
      )
        return;
      endGesture();
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      if (
        pointerIdRef.current != null &&
        event.pointerId !== pointerIdRef.current
      )
        return;
      endGesture();
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length > 0) return;
      endGesture();
    };

    const onClickCapture = (event: MouseEvent) => {
      if (!movedRef.current && !tapHandledRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      movedRef.current = false;
      tapHandledRef.current = false;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      stopSnap();
      if (!interactionHeldRef.current) acquireChrome();
      positionRef.current = rubberPosition(
        positionRef.current + normalizeWheelDelta(event) / pitchRef.current,
        onAddRef.current ? ADD_POS : 0,
      );
      noteDirection(positionRef.current);
      applyLayout(positionRef.current);
      syncThreshold();
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => {
        wheelTimerRef.current = null;
        finishGesture();
      }, WHEEL_IDLE_MS);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const base = onAddRef.current ? ADD_POS : nearestIndex(positionRef.current);
      const next = base + (event.key === "ArrowRight" ? 1 : -1);
      if (next < 0) return;
      snapTo(next, true);
    };

    let windowBound = false;
    const bindWindow = () => {
      if (windowBound) return;
      windowBound = true;
      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
      window.addEventListener("touchend", onTouchEnd);
      window.addEventListener("touchcancel", onTouchEnd);
    };
    const unbindWindow = () => {
      if (!windowBound) return;
      windowBound = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove, { passive: false });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("lostpointercapture", onPointerCancel);
    root.addEventListener("touchend", onTouchEnd);
    root.addEventListener("touchcancel", onTouchEnd);
    root.addEventListener("click", onClickCapture, true);
    root.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("keydown", onKeyDown);
    return () => {
      unbindWindow();
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("lostpointercapture", onPointerCancel);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchEnd);
      root.removeEventListener("click", onClickCapture, true);
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("keydown", onKeyDown);
    };
  }, [
    acquireChrome,
    applyLayout,
    coastThenSnap,
    finishGesture,
    mode,
    noteDirection,
    releaseChrome,
    selectById,
    snapTo,
    stopSnap,
    syncThreshold,
  ]);

  useEffect(
    () => () => {
      stopSnap();
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    },
    [stopSnap],
  );

  if (mode === "edge-blur") {
    const amount = Number.isFinite(blur) ? blur : 0.55;
    return (
      <div className="ie-fill-blur">
        <label className="ie-redact-slider">
          <span>{labels.blur}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={amount}
            aria-label={labels.blur}
            onChange={(event) =>
              onBlurAmount(Number(event.currentTarget.value), false)
            }
            onPointerUp={(event) =>
              onBlurAmount(
                Number((event.currentTarget as HTMLInputElement).value),
                true,
              )
            }
          />
        </label>
      </div>
    );
  }

  if (mode !== "solid") return <div className="ie-fill-color-row" />;

  return (
    <div className="ie-fill-color-row">
      <div
        ref={rootRef}
        className="ie-fill-color-strip"
        data-ie-part="fill-color-strip"
        tabIndex={0}
        role="listbox"
        aria-label={labels.color}
        aria-activedescendant={`ie-fill-color-${family}`}
      >
        <div ref={trackRef} className="ie-fill-color-track">
          <button
            type="button"
            className="ie-fill-color-add"
            aria-label={labels.addColor}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              snapToAdd();
              onOpenColorPicker();
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M12.4 6.9 4.8 14.5c-.5.5-.8 1.2-.8 1.9V19h2.6c.7 0 1.4-.3 1.9-.8l7.6-7.6-3.7-3.7Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M4 16.4V19h2.6c.3 0 .5-.1.7-.2l-3.1-3.1c-.1.2-.2.5-.2.7Z"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M14.5 4.8 16.7 2.6l3.7 3.7-2.2 2.2Z"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {IDS.map((name) => (
            <button
              key={name}
              type="button"
              id={`ie-fill-color-${name}`}
              data-ie-fill-color={name}
              className="ie-fill-color-item"
              aria-label={fillSwatchLabel(name)}
              aria-pressed={family === name}
              onClick={() => selectById(name)}
            >
              <span
                className="ie-fill-color-thumb"
                style={{
                  background: fillSwatchColor(
                    name,
                    name === family ? shade : 50,
                  ),
                }}
              />
            </button>
          ))}
          <div ref={frameRef} className="ie-fill-color-select" aria-hidden />
        </div>
      </div>
    </div>
  );
}
