import { useCallback, useEffect, useRef } from 'react';
import { CROP_FADE_HIDE_HOLD_MS } from './cropFade';

/** `ruler` = selective fade inside bottom bar; `viewport` = whole bottom bar fades; `selective` = focused controls stay visible in chrome. */
export type ChromeFadeKind = 'ruler' | 'viewport' | 'selective';

export type ChromeFadeState = {
  faded: boolean;
  /** Mode / adjust channel id kept visible with its ruler during ruler fade. */
  focus: string | null;
  kind: ChromeFadeKind | null;
};

type ChangeHandler = (state: ChromeFadeState) => void;

/**
 * Hold-to-fade controller shared by crop viewport gestures and ruler scrolling.
 * One timer per editor — avoids duplicate / out-of-sync fades.
 */
export function useChromeHoldFade(onChange: ChangeHandler) {
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdEligibleRef = useRef(false);
  const fadedRef = useRef(false);
  const focusRef = useRef<string | null>(null);
  const kindRef = useRef<ChromeFadeKind | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const emit = useCallback(
    (faded: boolean, focus: string | null, kind: ChromeFadeKind | null) => {
      onChangeRef.current({ faded, focus, kind });
    },
    [],
  );

  const beginHoldFade = useCallback(
    (
      focus: string | null,
      kind: ChromeFadeKind,
      enabled = true,
      shouldStillFade?: () => boolean,
    ) => {
      if (!enabled) return;
      if (fadedRef.current) {
        if (focus && focusRef.current !== focus) {
          focusRef.current = focus;
          kindRef.current = kind;
          emit(true, focus, kind);
        }
        return;
      }
      focusRef.current = focus;
      kindRef.current = kind;
      holdEligibleRef.current = true;
      emit(false, focus, kind);
      if (holdTimerRef.current) return;
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        if (!holdEligibleRef.current) return;
        if (shouldStillFade && !shouldStillFade()) return;
        fadedRef.current = true;
        emit(true, focusRef.current, kindRef.current);
      }, CROP_FADE_HIDE_HOLD_MS);
    },
    [emit],
  );

  const endHoldFade = useCallback(() => {
    holdEligibleRef.current = false;
    clearHoldTimer();
    const had = fadedRef.current || focusRef.current != null;
    fadedRef.current = false;
    focusRef.current = null;
    kindRef.current = null;
    if (had) emit(false, null, null);
  }, [clearHoldTimer, emit]);

  const resetHoldFade = useCallback(() => {
    holdEligibleRef.current = false;
    clearHoldTimer();
    if (!fadedRef.current && focusRef.current == null) return;
    fadedRef.current = false;
    focusRef.current = null;
    kindRef.current = null;
    emit(false, null, null);
  }, [clearHoldTimer, emit]);

  useEffect(
    () => () => {
      clearHoldTimer();
      fadedRef.current = false;
      focusRef.current = null;
      kindRef.current = null;
    },
    [clearHoldTimer]
  );

  return { beginHoldFade, endHoldFade, resetHoldFade };
}
