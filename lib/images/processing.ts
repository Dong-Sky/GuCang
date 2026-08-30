import { compressVariants, type ImagePair, type ImageQuality } from "./compression";

async function fallbackCompression(file: File, quality: ImageQuality): Promise<ImagePair> {
  const url = URL.createObjectURL(file);
  try {
    const source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("这张图片无法读取，请重新选择 JPG 或 PNG 图片"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法处理图片");
    return await compressVariants(source.naturalWidth, source.naturalHeight, quality, {
      draw: (width, height) => { canvas.width = width; canvas.height = height; context.drawImage(source, 0, 0, width, height); },
      encode: (type, quality) => new Promise<Blob | null>((resolve) => {
        // Give the progress indicator and touch input a frame between encodes.
        setTimeout(() => canvas.toBlob(resolve, type, quality), 0);
      }),
      dispose: () => { canvas.width = 1; canvas.height = 1; },
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareImage(file: File, quality: ImageQuality): Promise<ImagePair> {
  if (typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap === "function") {
    let worker: Worker | undefined;
    try {
      worker = new Worker(new URL("./processing.worker.ts", import.meta.url));
      const currentWorker = worker;
      const pair = await new Promise<ImagePair>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("图片处理超时")), 45_000);
        currentWorker.onmessage = (event: MessageEvent<{ pair?: ImagePair; fallback?: boolean }>) => {
          clearTimeout(timer);
          if (event.data.pair) resolve(event.data.pair);
          else reject(new Error("使用兼容图片处理方式"));
        };
        currentWorker.onerror = () => { clearTimeout(timer); reject(new Error("使用兼容图片处理方式")); };
        currentWorker.postMessage({ file, quality });
      });
      return pair;
    } catch {
      // HEIC support and createImageBitmap failures depend on the device.
    } finally {
      worker?.terminate();
    }
  }
  return fallbackCompression(file, quality);
}
