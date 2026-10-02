/**
 * Center a child of a horizontal scroll strip under the viewport midline.
 *
 * Uses getBoundingClientRect so padding / scroll-snap / offsetParent quirks
 * cannot shift the target by one badge (the classic offsetLeft bug).
 */
export function scrollChildToCenter(
  container: HTMLElement,
  child: HTMLElement,
  smooth: boolean
) {
  const cRect = container.getBoundingClientRect();
  const bRect = child.getBoundingClientRect();
  const delta = bRect.left + bRect.width / 2 - (cRect.left + cRect.width / 2);
  const left = container.scrollLeft + delta;
  container.scrollTo({
    left: Math.max(0, left),
    behavior: smooth ? 'smooth' : 'auto',
  });
}

/**
 * Which snap child is closest to the strip's horizontal center.
 * `getAttr` reads the identity attribute (e.g. `data-ie-mode`).
 */
export function nearestCenteredChild<T extends string>(
  container: HTMLElement,
  ids: readonly T[],
  getAttr: (id: T) => string
): T {
  if (ids.length === 0) throw new Error('nearestCenteredChild: empty ids');
  const cRect = container.getBoundingClientRect();
  const mid = cRect.left + cRect.width / 2;
  let best = ids[0];
  let bestDist = Infinity;
  for (const id of ids) {
    const btn = container.querySelector(getAttr(id)) as HTMLElement | null;
    if (!btn) continue;
    const bRect = btn.getBoundingClientRect();
    const d = Math.abs(bRect.left + bRect.width / 2 - mid);
    if (d < bestDist) {
      bestDist = d;
      best = id;
    }
  }
  return best;
}

/**
 * Directional 45% gap threshold.
 *
 * `t` is 0 when the left badge of the pair is centered and 1 when the right
 * badge is centered. Moving toward the right badge activates it after 45% of
 * the gap; moving toward the left badge activates it after 45% the other way.
 */
export function directionalThresholdChild<T extends string>(
  container: HTMLElement,
  ids: readonly T[],
  getAttr: (id: T) => string,
  direction: 'left' | 'right' | null,
  current: T,
  ratio = 0.45,
): T {
  if (ids.length === 0) return current;
  if (ids.length === 1) return ids[0];

  const cRect = container.getBoundingClientRect();
  const mid = cRect.left + cRect.width / 2;
  const centers: { id: T; center: number }[] = [];
  for (const id of ids) {
    const btn = container.querySelector(getAttr(id)) as HTMLElement | null;
    if (!btn) continue;
    const r = btn.getBoundingClientRect();
    centers.push({ id, center: r.left + r.width / 2 });
  }
  if (centers.length === 0) return current;

  if (mid <= centers[0].center) return centers[0].id;
  const last = centers[centers.length - 1];
  if (mid >= last.center) return last.id;

  let i0 = 0;
  for (let i = 0; i < centers.length - 1; i++) {
    if (mid >= centers[i].center && mid <= centers[i + 1].center) {
      i0 = i;
      break;
    }
  }

  const a = centers[i0];
  const b = centers[i0 + 1];
  if (!b) return a.id;
  const span = b.center - a.center;
  if (span <= 1) return a.id;
  const t = (mid - a.center) / span;

  if (direction === 'right') return t >= ratio ? b.id : a.id;
  if (direction === 'left') return t <= 1 - ratio ? a.id : b.id;
  return t < 0.5 ? a.id : b.id;
}

/** Run after layout so clientWidth / badge positions are real. */
export function afterLayout(fn: () => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(fn);
  });
}
