import type { SupabaseClient } from "../collection/types";
import type { ImagePair, ImageQuality } from "./compression";

export type SaveProgress = { stage: "compress" | "save" | "upload" | "refresh"; message: string };
export type ProgressReporter = (progress: SaveProgress) => void;
export type PendingPhoto = {
  id: string;
  pair: ImagePair;
  detailPath: string;
  thumbnailPath: string;
  uploaded: Set<string>;
  committed: boolean;
};
export type PhotoSession = { quality?: ImageQuality; photos: Map<File, PendingPhoto> };

export function newPhotoSession(): PhotoSession { return { photos: new Map() }; }

export async function preparePhotos(files: File[], quality: ImageQuality, basePath: string, session: PhotoSession, report: ProgressReporter, process: (file: File, quality: ImageQuality) => Promise<ImagePair>) {
  // A retry must use exactly the bytes that belong to its reserved new paths.
  const startedUploading = [...session.photos.values()].some((photo) => photo.uploaded.size > 0 || photo.committed);
  const mode = startedUploading ? session.quality ?? quality : quality;
  if (!startedUploading && session.quality !== mode) session.photos.clear();
  for (const [index, file] of files.entries()) {
    if (session.photos.has(file)) continue;
    report({ stage: "compress", message: `正在处理照片 ${index + 1}/${files.length} · ${mode === "standard" ? "标准省空间" : "高清"}` });
    const pair = await process(file, mode);
    const id = crypto.randomUUID();
    session.quality = mode;
    session.photos.set(file, { id, pair, detailPath: `${basePath}/${id}-detail.${pair.detail.extension}`, thumbnailPath: `${basePath}/${id}-thumb.${pair.thumbnail.extension}`, uploaded: new Set(), committed: false });
  }
}

export async function uploadPhotos(client: SupabaseClient, files: File[], session: PhotoSession, report: ProgressReporter, commit: (photo: PendingPhoto, index: number) => Promise<void>) {
  for (const [index, file] of files.entries()) {
    const photo = session.photos.get(file);
    if (!photo) throw new Error("照片尚未处理完成，请重试");
    if (photo.committed) continue;
    const variants = [{ path: photo.detailPath, image: photo.pair.detail }, { path: photo.thumbnailPath, image: photo.pair.thumbnail }];
    report({ stage: "upload", message: `正在上传照片 ${index + 1}/${files.length}（${photo.uploaded.size}/2）` });
    // At most two uploads in flight. Wait for both to settle before retrying;
    // successful new files are retained, never removed because a sibling failed.
    const results = await Promise.allSettled(variants.map(async ({ path, image }) => {
      if (photo.uploaded.has(path)) return;
      const result = await client.storage.from("collection-images").upload(path, image.blob, { contentType: image.mimeType, cacheControl: "31536000", upsert: false });
      if (result.error) {
        // A lost response may mean a previous attempt already stored this exact
        // session's immutable file. No other upload shares these random paths.
        const status = "statusCode" in result.error ? String(result.error.statusCode) : "";
        if (status !== "409" && !/already exists|duplicate/i.test(result.error.message)) throw new Error(result.error.message);
      }
      photo.uploaded.add(path);
      report({ stage: "upload", message: `正在上传照片 ${index + 1}/${files.length}（${photo.uploaded.size}/2）` });
    }));
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    await commit(photo, index);
    photo.committed = true;
  }
}
