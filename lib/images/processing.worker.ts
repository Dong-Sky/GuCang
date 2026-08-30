import { compressVariants, type ImageQuality } from "./compression";

self.onmessage = async (event: MessageEvent<{ file: File; quality: ImageQuality }>) => {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(event.data.file);
    const source = bitmap;
    const canvas = new OffscreenCanvas(1, 1);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建图片画布");
    const pair = await compressVariants(bitmap.width, bitmap.height, event.data.quality, {
      draw: (width, height) => { canvas.width = width; canvas.height = height; context.drawImage(source, 0, 0, width, height); },
      encode: (type, quality) => canvas.convertToBlob({ type, quality }),
      dispose: () => { canvas.width = 1; canvas.height = 1; },
    });
    self.postMessage({ pair });
  } catch {
    // Android gallery decoders vary. Let the main thread retry via HTMLImage.
    self.postMessage({ fallback: true });
  } finally {
    bitmap?.close();
  }
};
