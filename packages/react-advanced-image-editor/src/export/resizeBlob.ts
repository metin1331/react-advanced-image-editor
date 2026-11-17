/** Scale an exported blob to an exact pixel size. Upscale and downscale both apply. */
export async function resizeBlob(
  blob: Blob,
  width: number,
  height: number,
  quality = 0.92,
): Promise<Blob> {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const bitmap = await createImageBitmap(blob);
  if (bitmap.width === w && bitmap.height === h) {
    bitmap.close();
    return blob;
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return blob;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (next) => (next ? resolve(next) : reject(new Error("Export failed"))),
      blob.type || "image/jpeg",
      quality,
    );
  });
}
