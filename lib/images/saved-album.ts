import type { ImageRow, SupabaseClient } from '../collection/types';
import { newPhotoSession, preparePhotos, uploadPhotos, type ProgressReporter } from './upload';
import { prepareImage } from './processing';

export type AlbumEntry = { key: string; row?: ImageRow; file?: File; url?: string; turns: number };
export const albumSession = () => ({ uploads: newPhotoSession(), rotated: new Map<string, File>() });
export type AlbumSession = ReturnType<typeof albumSession>;
export function movePhoto<T>(rows: T[], from: number, to: number): T[] {
  if (from < 0 || from >= rows.length || to < 0 || to >= rows.length) return rows;
  const result = [...rows]; result.splice(to, 0, result.splice(from, 1)[0]); return result;
}

async function rotatedFile(client: SupabaseClient, entry: AlbumEntry): Promise<File> {
  let source = entry.file;
  if (!source && entry.row) {
    const result = await client.storage.from('collection-images').download(entry.row.detail_path);
    if (result.error || !result.data) throw new Error('原照片读取失败，请重试；旧图没有改变');
    source = new File([result.data], 'original', { type: result.data.type });
  }
  if (!source) throw new Error('没有选择照片');
  if (!entry.turns) return source;
  const url = URL.createObjectURL(source);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image(); const timer = setTimeout(() => reject(new Error('照片读取超时')), 15000);
      img.onload = () => { clearTimeout(timer); resolve(img); };
      img.onerror = () => { clearTimeout(timer); reject(new Error('照片无法读取')); }; img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = entry.turns % 2 ? image.naturalHeight : image.naturalWidth;
    canvas.height = entry.turns % 2 ? image.naturalWidth : image.naturalHeight;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('无法旋转照片');
    ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(entry.turns * Math.PI / 2);
    ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('旋转失败')), 'image/png'));
    canvas.width = canvas.height = 1;
    return new File([blob], 'rotated.png', { type: 'image/png' });
  } finally { URL.revokeObjectURL(url); }
}

export async function saveAlbum(client: SupabaseClient, householdId: string, styleId: string, expected: string[], entries: AlbumEntry[], sharedCount: number, session: AlbumSession, report: ProgressReporter) {
  if (entries.length > 3 || new Set(entries.map(e => e.key)).size !== entries.length) throw new Error('最多保留3张不同的照片');
  const files = new Map<string, File>();
  for (const entry of entries) if (entry.file || entry.turns) {
    report({ stage: 'compress', message: '正在处理调整后的照片，旧图保持不变' });
    const key = `${entry.key}:${entry.turns}`;
    let file = session.rotated.get(key);
    if (!file) { file = await rotatedFile(client, entry); session.rotated.set(key, file); }
    files.set(entry.key, file);
  }
  const uploadFiles = [...files.values()];
  await preparePhotos(uploadFiles, 'standard', `households/${householdId}/items/${styleId}`, session.uploads, report, prepareImage);
  // Upload every variant before touching any existing image row.
  await uploadPhotos(client, uploadFiles, session.uploads, report, async () => {});
  const photos = entries.map(entry => {
    const file = files.get(entry.key);
    if (!file) return { id: entry.row!.id };
    const pending = session.uploads.photos.get(file)!;
    return { id: pending.id, detail_path: pending.detailPath, thumbnail_path: pending.thumbnailPath,
      file_size_bytes: pending.pair.detail.blob.size, thumbnail_size_bytes: pending.pair.thumbnail.blob.size,
      width: pending.pair.detail.width, height: pending.pair.detail.height };
  });
  report({ stage: 'save', message: '照片已上传，正在确认照片顺序' });
  const result = await client.rpc('save_photo_album', { p_household: householdId, p_style: styleId, p_expected: expected, p_photos: photos, p_shared_count: sharedCount });
  if (result.error) throw new Error(result.error.message);
}
