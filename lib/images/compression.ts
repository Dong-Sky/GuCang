export type ImageQuality = "standard" | "high";
export type CompressedImage = { blob: Blob; width: number; height: number; mimeType: string; extension: string };
export type ImagePair = { detail: CompressedImage; thumbnail: CompressedImage };

// These are new-upload presets, not a migration policy for existing photos.
export const IMAGE_PRESETS = {
  standard: { detail: { edge: 1400, target: 120 * 1024, quality: 0.78, floor: 0.62 }, thumbnail: { edge: 400, target: 24 * 1024, quality: 0.72, floor: 0.56 } },
  high: { detail: { edge: 1800, target: 500 * 1024, quality: 0.84, floor: 0.68 }, thumbnail: { edge: 600, target: 80 * 1024, quality: 0.80, floor: 0.64 } },
} as const;

export type ImageSurface = {
  draw: (width: number, height: number) => void;
  encode: (type: string, quality: number) => Promise<Blob | null>;
  dispose: () => void;
};

export async function compressVariants(width: number, height: number, quality: ImageQuality, surface: ImageSurface): Promise<ImagePair> {
  if (!width || !height) throw new Error("这张图片无法读取，请重新选择 JPG 或 PNG 图片");
  const encode = async (preset: typeof IMAGE_PRESETS[ImageQuality]["detail"] | typeof IMAGE_PRESETS[ImageQuality]["thumbnail"]): Promise<CompressedImage> => {
    const scale = Math.min(1, preset.edge / Math.max(width, height));
    const outputWidth = Math.max(1, Math.round(width * scale));
    const outputHeight = Math.max(1, Math.round(height * scale));
    surface.draw(outputWidth, outputHeight);
    let mimeType = "image/webp";
    let blob = await surface.encode(mimeType, preset.quality);
    // Some browsers silently return PNG when WebP encoding is unsupported.
    if (!blob || blob.type !== mimeType) {
      mimeType = "image/jpeg";
      blob = await surface.encode(mimeType, preset.quality);
    }
    if (!blob || blob.type !== mimeType) throw new Error("浏览器无法压缩这张照片，请更新浏览器后重试");
    // Bounded work on mobile; keep legibility instead of repeatedly encoding
    // down to a very low quality just to hit an artificial byte limit.
    if (blob.size > preset.target) {
      const smaller = await surface.encode(mimeType, preset.floor);
      if (smaller && smaller.type === mimeType && smaller.size < blob.size) blob = smaller;
    }
    return { blob, width: outputWidth, height: outputHeight, mimeType, extension: mimeType === "image/webp" ? "webp" : "jpg" };
  };
  try {
    const detail = await encode(IMAGE_PRESETS[quality].detail);
    const thumbnail = await encode(IMAGE_PRESETS[quality].thumbnail);
    return { detail, thumbnail };
  } finally {
    surface.dispose();
  }
}
