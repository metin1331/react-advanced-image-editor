export type Rgba = { r: number; g: number; b: number; a: number };

function hex2(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
}

export function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function rgb(r: number, g: number, b: number, a = 1): Rgba {
  return {
    r: Math.max(0, Math.min(255, Math.round(r))),
    g: Math.max(0, Math.min(255, Math.round(g))),
    b: Math.max(0, Math.min(255, Math.round(b))),
    a: clamp01(a),
  };
}

export function parseCssColor(input: string | undefined | null): Rgba {
  const raw = (input ?? '').trim();
  const hex = raw.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) {
      h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    }
    if (h.length === 4) {
      h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return rgb(r, g, b, a);
  }
  const rgba = raw.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );
  if (rgba) {
    return rgb(
      Number(rgba[1]),
      Number(rgba[2]),
      Number(rgba[3]),
      rgba[4] == null ? 1 : Number(rgba[4]),
    );
  }
  return rgb(255, 59, 48);
}

export function toHex6(c: Rgba) {
  return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
}

/** `#RRGGBB` when opaque so existing preset compares keep working. */
export function toCssColor(c: Rgba) {
  if (c.a >= 0.995) return toHex6(c);
  return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${hex2(c.a * 255)}`;
}

export function sameRgb(a: Rgba, b: Rgba, tol = 2) {
  return (
    Math.abs(a.r - b.r) <= tol &&
    Math.abs(a.g - b.g) <= tol &&
    Math.abs(a.b - b.b) <= tol
  );
}

export function rgbToHsv(c: Rgba) {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

export function hsvToRgb(h: number, s: number, v: number, a = 1): Rgba {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) {
    r = c;
    g = x;
  } else if (hh < 120) {
    r = x;
    g = c;
  } else if (hh < 180) {
    g = c;
    b = x;
  } else if (hh < 240) {
    g = x;
    b = c;
  } else if (hh < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return rgb((r + m) * 255, (g + m) * 255, (b + m) * 255, a);
}

/** x 0…1 white → saturated → black; y 0…1 hue. */
export function spectrumToRgb(x: number, y: number, a = 1): Rgba {
  const h = clamp01(y) * 360;
  const t = clamp01(x);
  if (t < 0.5) return hsvToRgb(h, t / 0.5, 1, a);
  return hsvToRgb(h, 1, 1 - (t - 0.5) / 0.5, a);
}

export function rgbToSpectrum(c: Rgba) {
  const { h, s, v } = rgbToHsv(c);
  const y = h / 360;
  const x = v >= 0.999 ? s * 0.5 : 0.5 + (1 - v) * 0.5;
  return { x: clamp01(x), y: clamp01(y) };
}

export function withHdrBoost(c: Rgba, boost01: number): Rgba {
  const t = clamp01(boost01);
  if (t <= 0) return c;
  const { h, s, v } = rgbToHsv(c);
  return hsvToRgb(h, s * (1 - t * 0.22), v + (1 - v) * t, c.a);
}

export const COLOR_GRID = [
  [
    '#FFFFFF', '#EBEBEB', '#D6D6D6', '#C2C2C2',
    '#ADADAD', '#999999', '#858585', '#707070',
    '#5C5C5C', '#474747', '#333333', '#000000',
  ],
  [
    '#133649', '#081D54', '#0F0539', '#29093A',
    '#360C1A', '#541108', '#53210A', '#52350D',
    '#533E0F', '#65611A', '#505417', '#2B3D17',
  ],
  [
    '#1F4C63', '#102E76', '#170B4D', '#3F1255',
    '#4D1629', '#771E0E', '#712F0F', '#744C18',
    '#735A1A', '#8B862A', '#717626', '#3F5524',
  ],
  [
    '#2F6C8B', '#1941A1', '#280C72', '#591E78',
    '#6E223C', '#A52C17', '#A1461A', '#9F6B22',
    '#9F7C28', '#C1BC3C', '#9CA435', '#587934',
  ],
  [
    '#3E89B0', '#2254CD', '#331C8E', '#702898',
    '#8C2F4E', '#D03A21', '#C95A23', '#C7872F',
    '#C89F35', '#F2EC4E', '#C5CF48', '#739B43',
  ],
  [
    '#479ED3', '#2860F5', '#4824AA', '#8C33B5',
    '#A9395D', '#EA512F', '#ED742F', '#F2AF3E',
    '#F4C946', '#FCFA67', '#DCEB5C', '#86B954',
  ],
  [
    '#5AC4F6', '#5085F5', '#5732E1', '#AE43E9',
    '#D44A7B', '#EB6C59', '#EF8C55', '#F3B757',
    '#F6CD5B', '#FDF681', '#E5EE79', '#A3D16E',
  ],
  [
    '#79D3F6', '#7FA5F8', '#7E51F4', '#C35FF5',
    '#DE789D', '#EF9185', '#F1A983', '#F5C982',
    '#F8D986', '#FEF8A0', '#ECF29C', '#BADB94',
  ],
  [
    '#A4E0F8', '#AEC5F9', '#AA8EF5', '#D696F7',
    '#E7A7BF', '#F3B8B2', '#F5C7AF', '#F9DAAE',
    '#FAE5B0', '#FDFBC0', '#F3F6BD', '#D1E7B9',
  ],
  [
    '#D2EEFC', '#D6E2FC', '#D5C9F9', '#E8CBFB',
    '#F2D4DE', '#F9DCD8', '#F9E3D6', '#FBECD7',
    '#FCF2D7', '#FDFCE0', '#F7FADF', '#E1EDD5',
  ],
] as const;

export const GRID_ROWS = COLOR_GRID.length;
export const GRID_COLS = COLOR_GRID[0].length;

export function gridCellColor(row: number, col: number): Rgba {
  const hex = COLOR_GRID[row]?.[col] ?? COLOR_GRID[0][0];
  return parseCssColor(hex);
}
