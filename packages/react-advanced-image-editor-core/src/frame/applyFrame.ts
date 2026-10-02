import type { FrameLayout, FrameState } from './frameState';
import { computeFrameLayout, hasFrame, PICTURE_STYLE_PRESET_IDS } from './frameState';

/**
 * Composite the graded image onto a larger canvas with mat + border.
 * Markup should already be baked into `source`.
 */
export function applyFrame(source: HTMLCanvasElement, frame: FrameState): HTMLCanvasElement {
  if (!hasFrame(frame)) return source;

  const layout = computeFrameLayout(source.width, source.height, frame);
  const f = layout.metrics;

  const canvas = document.createElement('canvas');
  canvas.width = layout.outW;
  canvas.height = layout.outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;

  const { photoX, photoY, photoW, photoH } = layout;
  const radius = f.cornerRadius;

  if (PICTURE_STYLE_PRESET_IDS.has(f.preset)) {
    applyPictureStyle(ctx, source, canvas, layout);
    return canvas;
  }

  if (f.preset === 'inner') {
    ctx.drawImage(source, 0, 0);
    drawInnerKeyline(ctx, 0, 0, photoW, photoH, f);
    return canvas;
  }

  if (f.preset === 'offset') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const ox = f.offsetX;
    const oy = f.offsetY;
    ctx.fillStyle = f.color;
    ctx.fillRect(photoX + ox, photoY + oy, photoW, photoH);
    ctx.drawImage(source, photoX, photoY, photoW, photoH);
    if (f.innerBorderWidth > 0 || f.accentColor) {
      strokeRound(ctx, photoX, photoY, photoW, photoH, 0, f.accentColor, 2);
    }
    return canvas;
  }

  if (f.preset === 'shadow') {
    ctx.fillStyle = f.color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    paintShadow(ctx, photoX, photoY, photoW, photoH, radius, f.shadowIntensity);
    clipDraw(ctx, source, photoX, photoY, photoW, photoH, radius);
    return canvas;
  }

  // Page / mat fill
  ctx.fillStyle = f.color;
  fillRound(ctx, 0, 0, canvas.width, canvas.height, outerRadius(f, canvas));

  if (f.preset === 'classic') {
    const inset = Math.max(4, Math.round(f.borderWidth * 0.22));
    strokeRound(
      ctx,
      inset,
      inset,
      canvas.width - inset * 2,
      canvas.height - inset * 2,
      0,
      f.accentColor,
      Math.max(2, Math.round(f.borderWidth * 0.12)),
    );
    const mat = f.borderWidth;
    ctx.fillStyle = '#f1e6d2';
    ctx.fillRect(mat, mat, canvas.width - mat * 2, canvas.height - mat * 2);
  }

  if (f.preset === 'outer') {
    ctx.fillStyle = f.accentColor;
    const b = f.borderWidth;
    ctx.fillRect(b, b, canvas.width - b * 2, canvas.height - b * 2);
  }

  if (f.shadow && f.preset !== 'classic') {
    paintShadow(ctx, photoX, photoY, photoW, photoH, radius, f.shadowIntensity);
  }

  clipDraw(ctx, source, photoX, photoY, photoW, photoH, radius);

  if (f.preset === 'film') {
    drawSprockets(ctx, canvas.width, canvas.height, photoX, photoY, photoW, photoH, f);
  }

  if (
    f.preset === 'double' ||
    f.preset === 'editorial' ||
    f.preset === 'gallery' ||
    f.preset === 'asymmetric' ||
    f.preset === 'classic'
  ) {
    drawMatKeylines(ctx, photoX, photoY, photoW, photoH, f);
  }

  return canvas;
}

function outerRadius(f: FrameState, canvas: HTMLCanvasElement) {
  if (f.preset === 'rounded' || f.preset === 'soft-round' || f.preset === 'polaroid') {
    return Math.min(f.cornerRadius + f.borderWidth + f.padding, canvas.width / 2, canvas.height / 2);
  }
  return 0;
}

function clipDraw(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.save();
  pathRound(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(source, x, y, w, h);
  ctx.restore();
}

function paintShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  intensity: number,
) {
  const i = Math.max(0, Math.min(1, intensity));
  ctx.save();
  ctx.shadowColor = `rgba(0,0,0,${0.18 + i * 0.42})`;
  ctx.shadowBlur = 8 + i * 36;
  ctx.shadowOffsetY = 3 + i * 10;
  ctx.shadowOffsetX = 0;
  ctx.fillStyle = '#000';
  fillRound(ctx, x, y, w, h, r);
  ctx.restore();
}

function drawInnerKeyline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  f: FrameState,
) {
  const inset = Math.max(4, f.innerGap || 10);
  const sw = Math.max(1, f.borderWidth);
  strokeRound(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, 0, f.color, sw);
}

function drawMatKeylines(
  ctx: CanvasRenderingContext2D,
  photoX: number,
  photoY: number,
  photoW: number,
  photoH: number,
  f: FrameState,
) {
  const gap = Math.max(2, f.innerGap);
  const sw = Math.max(1, f.innerBorderWidth || 1);
  const color = f.accentColor || '#111';

  if (f.preset === 'double') {
    strokeRound(ctx, photoX - gap, photoY - gap, photoW + gap * 2, photoH + gap * 2, 0, color, sw);
    strokeRound(
      ctx,
      photoX - gap - sw - 4,
      photoY - gap - sw - 4,
      photoW + (gap + sw + 4) * 2,
      photoH + (gap + sw + 4) * 2,
      0,
      color,
      Math.max(1, f.borderWidth),
    );
    return;
  }

  if (f.preset === 'gallery') {
    strokeRound(ctx, photoX - gap, photoY - gap, photoW + gap * 2, photoH + gap * 2, 0, color, sw);
    strokeRound(
      ctx,
      photoX - gap - 4,
      photoY - gap - 4,
      photoW + (gap + 4) * 2,
      photoH + (gap + 4) * 2,
      0,
      color,
      sw,
    );
    return;
  }

  strokeRound(ctx, photoX - gap, photoY - gap, photoW + gap * 2, photoH + gap * 2, 0, color, sw);
}

function drawSprockets(
  ctx: CanvasRenderingContext2D,
  outW: number,
  outH: number,
  photoX: number,
  photoY: number,
  photoW: number,
  photoH: number,
  f: FrameState,
) {
  const holeW = Math.max(5, Math.round(photoX * 0.38));
  const holeH = Math.max(4, Math.round(holeW * 0.72));
  const gap = holeH * 0.85;
  const top = photoY;
  const bottom = photoY + photoH;
  ctx.fillStyle = f.accentColor || '#d0d0d0';
  const drawCol = (cx: number) => {
    for (let y = top + gap; y + holeH < bottom - gap * 0.4; y += holeH + gap) {
      const hx = cx - holeW / 2;
      const r = Math.min(2, holeW / 4);
      fillRound(ctx, hx, y, holeW, holeH, r);
    }
  };
  drawCol(photoX / 2);
  drawCol(photoX + photoW + (outW - (photoX + photoW)) / 2);
  void outH;
}

function pathRound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (radius <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function fillRound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  pathRound(ctx, x, y, w, h, r);
  ctx.fill();
}

function strokeRound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  color: string,
  width: number,
) {
  if (width <= 0 || w <= 0 || h <= 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  pathRound(ctx, x + width / 2, y + width / 2, w - width, h - width, Math.max(0, r - width / 2));
  ctx.stroke();
  ctx.restore();
}

function applyPictureStyle(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  canvas: HTMLCanvasElement,
  layout: FrameLayout
) {
  const f = layout.metrics;
  const { photoX, photoY, photoW, photoH } = layout;
  const r = f.cornerRadius;
  const preset = f.preset;

  if (preset === 'inner-shadow') {
    ctx.drawImage(source, 0, 0);
    paintInnerShadow(ctx, 0, 0, photoW, photoH, 0, f.innerShadowIntensity);
    return;
  }

  ctx.fillStyle = f.color;
  fillRound(ctx, 0, 0, canvas.width, canvas.height, outerPictureRadius(f, canvas));

  if (preset === 'hard-shadow') {
    ctx.fillStyle = f.accentColor || '#000';
    ctx.fillRect(photoX + f.offsetX, photoY + f.offsetY, photoW, photoH);
    clipDraw(ctx, source, photoX, photoY, photoW, photoH, 0);
    return;
  }

  if (preset === 'offset-shadow') {
    ctx.fillStyle = f.accentColor;
    ctx.fillRect(photoX + f.offsetX, photoY + f.offsetY, photoW, photoH);
    clipDraw(ctx, source, photoX, photoY, photoW, photoH, 0);
    return;
  }

  if (preset === 'outline-offset') {
    strokeRound(
      ctx,
      photoX + f.offsetX,
      photoY + f.offsetY,
      photoW,
      photoH,
      0,
      f.accentColor,
      Math.max(2, f.innerBorderWidth || 2)
    );
    clipDraw(ctx, source, photoX, photoY, photoW, photoH, 0);
    return;
  }

  if (preset === 'perspective') {
    drawPerspectivePlate(ctx, photoX, photoY, photoW, photoH, f.offsetX, f.offsetY, f.accentColor);
    clipDraw(ctx, source, photoX, photoY, photoW, photoH, 0);
    return;
  }

  if (preset === 'beveled' || preset === 'metal') {
    drawBevel(ctx, 0, 0, canvas.width, canvas.height, f.bevelWidth, f.color, f.accentColor);
    if (preset === 'metal') {
      ctx.fillStyle = '#1c1c1e';
      ctx.fillRect(
        f.bevelWidth,
        f.bevelWidth,
        canvas.width - f.bevelWidth * 2,
        canvas.height - f.bevelWidth * 2
      );
    }
    clipDraw(ctx, source, photoX, photoY, photoW, photoH, 0);
    if (f.innerBorderWidth > 0) {
      strokeRound(
        ctx,
        photoX - f.innerGap,
        photoY - f.innerGap,
        photoW + f.innerGap * 2,
        photoH + f.innerGap * 2,
        0,
        f.accentColor,
        f.innerBorderWidth
      );
    }
    return;
  }

  if (preset === 'layered') {
    const gap = Math.max(8, f.innerGap);
    ctx.fillStyle = f.accentColor;
    fillRound(ctx, photoX - gap, photoY - gap, photoW + gap * 2, photoH + gap * 2, 0);
    clipDraw(ctx, source, photoX, photoY, photoW, photoH, 0);
    return;
  }

  if (preset === 'center-shadow') {
    paintCenterShadow(ctx, photoX, photoY, photoW, photoH, f.shadowIntensity);
    clipDraw(ctx, source, photoX, photoY, photoW, photoH, r);
    return;
  }

  if (preset === 'outer-glow') {
    paintGlow(ctx, photoX, photoY, photoW, photoH, r, f.shadowIntensity);
    clipDraw(ctx, source, photoX, photoY, photoW, photoH, r);
    return;
  }

  if (f.shadow) {
    paintShadow(ctx, photoX, photoY, photoW, photoH, r, f.shadowIntensity);
  }

  clipDraw(ctx, source, photoX, photoY, photoW, photoH, r);

  if (f.innerShadowIntensity > 0) {
    paintInnerShadow(ctx, photoX, photoY, photoW, photoH, r, f.innerShadowIntensity);
  }

  if (preset === 'white-mat') {
    strokeRound(ctx, 0.5, 0.5, canvas.width - 1, canvas.height - 1, 0, f.accentColor, 1);
  }

  if (preset === 'black-mat' || preset === 'minimal-mat') {
    strokeRound(
      ctx,
      photoX,
      photoY,
      photoW,
      photoH,
      0,
      f.accentColor,
      Math.max(1, f.innerBorderWidth || 1)
    );
  }

  if (preset === 'vintage' || preset === 'double-shadow' || preset === 'compound') {
    const gap = Math.max(2, f.innerGap);
    strokeRound(
      ctx,
      photoX - gap,
      photoY - gap,
      photoW + gap * 2,
      photoH + gap * 2,
      r,
      f.accentColor,
      Math.max(1, f.innerBorderWidth || 1)
    );
    if (preset === 'double-shadow' || preset === 'compound') {
      strokeRound(
        ctx,
        photoX - gap - 4,
        photoY - gap - 4,
        photoW + (gap + 4) * 2,
        photoH + (gap + 4) * 2,
        r,
        f.accentColor,
        Math.max(1, f.borderWidth || 2)
      );
    }
  }

  if (preset === 'modern-card' || preset === 'raised') {
    strokeRound(ctx, photoX, photoY, photoW, photoH, r, f.accentColor || '#e5e5ea', 1);
  }
}

function outerPictureRadius(f: FrameState, canvas: HTMLCanvasElement) {
  if (
    f.preset === 'photo-card' ||
    f.preset === 'modern-card' ||
    f.preset === 'floating' ||
    f.preset === 'raised'
  ) {
    return Math.min(f.cornerRadius + f.padding, canvas.width / 2, canvas.height / 2);
  }
  return 0;
}

function paintInnerShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  intensity: number
) {
  const i = Math.max(0, Math.min(1, intensity));
  ctx.save();
  pathRound(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.shadowColor = `rgba(0,0,0,${0.35 + i * 0.45})`;
  ctx.shadowBlur = 10 + i * 28;
  ctx.shadowOffsetY = 4 + i * 6;
  ctx.lineWidth = 18;
  ctx.strokeStyle = '#000';
  pathRound(ctx, x - 10, y - 10, w + 20, h + 20, r);
  ctx.stroke();
  ctx.restore();
}

function paintGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  intensity: number
) {
  const i = Math.max(0, Math.min(1, intensity));
  ctx.save();
  ctx.shadowColor = `rgba(0,0,0,${0.22 + i * 0.28})`;
  ctx.shadowBlur = 24 + i * 40;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#000';
  fillRound(ctx, x, y, w, h, r);
  ctx.restore();
}

function paintCenterShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  intensity: number
) {
  const i = Math.max(0, Math.min(1, intensity));
  ctx.save();
  ctx.shadowColor = `rgba(0,0,0,${0.28 + i * 0.32})`;
  ctx.shadowBlur = 22 + i * 18;
  ctx.shadowOffsetY = 16 + i * 10;
  ctx.shadowOffsetX = 0;
  ctx.fillStyle = '#000';
  const ovalW = w * 0.72;
  const ovalH = Math.max(10, h * 0.08);
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h - 4, ovalW / 2, ovalH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPerspectivePlate(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ox: number,
  oy: number,
  color: string
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.08, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w + ox, y + h + oy);
  ctx.lineTo(x + ox * 0.35, y + h + oy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBevel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  bw: number,
  light: string,
  dark: string
) {
  const b = Math.max(6, bw);
  ctx.save();
  ctx.fillStyle = lighten(light, 0.22);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - b, y + b);
  ctx.lineTo(x + b, y + b);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = lighten(light, 0.08);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x + b, y + h - b);
  ctx.lineTo(x + b, y + b);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - b, y + h - b);
  ctx.lineTo(x + w - b, y + b);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = darken(dark, 0.12);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - b, y + h - b);
  ctx.lineTo(x + b, y + h - b);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function lighten(hex: string, amount: number) {
  return mixHex(hex, '#ffffff', amount);
}

function darken(hex: string, amount: number) {
  return mixHex(hex, '#000000', amount);
}

function mixHex(a: string, b: string, t: number) {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const m = (i: number) => Math.round(pa[i] + (pb[i] - pa[i]) * t);
  return `rgb(${m(0)}, ${m(1)}, ${m(2)})`;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  if (h.length >= 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  return [180, 180, 180];
}
