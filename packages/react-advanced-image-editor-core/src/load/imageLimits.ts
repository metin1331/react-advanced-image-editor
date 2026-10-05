/** mobile Safari historically rejects canvases above ~16MP and kills the tab sooner. */
export const MAX_CANVAS_PIXELS = 16_777_216;

/** Working copy inside the editor. Far below a 12–48MP phone photo. */
export const MAX_WORKING_EDGE_MOBILE = 2048;
export const MAX_WORKING_EDGE_DESKTOP = 4096;

/** Live Calibrate / Filter bake — must fit a WebGL texture on a mobile device. */
export const MAX_PREVIEW_EDGE_MOBILE = 1600;
export const MAX_PREVIEW_EDGE_DESKTOP = 4096;

export function isConstrainedDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof memory === 'number' && memory > 0 && memory <= 4) return true;
  return false;
}

export function getMaxWorkingEdge(): number {
  return isConstrainedDevice() ? MAX_WORKING_EDGE_MOBILE : MAX_WORKING_EDGE_DESKTOP;
}

export function getMaxPreviewEdge(): number {
  return isConstrainedDevice() ? MAX_PREVIEW_EDGE_MOBILE : MAX_PREVIEW_EDGE_DESKTOP;
}

export function clampCanvasSize(
  width: number,
  height: number,
  maxEdge = getMaxWorkingEdge()
): { width: number; height: number } {
  let w = Math.max(1, Math.round(width));
  let h = Math.max(1, Math.round(height));
  const long = Math.max(w, h);
  if (long > maxEdge) {
    const s = maxEdge / long;
    w = Math.max(1, Math.round(w * s));
    h = Math.max(1, Math.round(h * s));
  }
  if (w * h > MAX_CANVAS_PIXELS) {
    const s = Math.sqrt(MAX_CANVAS_PIXELS / (w * h));
    w = Math.max(1, Math.round(w * s));
    h = Math.max(1, Math.round(h * s));
  }
  return { width: w, height: h };
}

export function canvasToJpeg(
  canvas: HTMLCanvasElement,
  quality = 0.92
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode image'))),
      'image/jpeg',
      quality
    );
  });
}

/** Draw `img` into a JPEG at or below `maxEdge`, baking whatever the decoder already applied. */
export async function rasterizeToJpeg(
  img: CanvasImageSource & { width?: number; naturalWidth?: number; height?: number; naturalHeight?: number },
  maxEdge = getMaxWorkingEdge()
): Promise<Blob> {
  const srcW = Math.max(1, img.naturalWidth ?? img.width ?? 1);
  const srcH = Math.max(1, img.naturalHeight ?? img.height ?? 1);
  const { width, height } = clampCanvasSize(srcW, srcH, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  return canvasToJpeg(canvas);
}
