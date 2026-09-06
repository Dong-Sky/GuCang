import type { ItemFormValues, SaveSession } from "./save";

export type ItemDraft = { version: 1; values: ItemFormValues; session: SaveSession; updatedAt: number };
export function draftKey(userId: string, householdId: string, instanceId?: string) {
  return JSON.stringify(["item-v1", userId, householdId, instanceId ?? "new"]);
}

// IndexedDB structured clone preserves Files, Maps and Sets together, including
// the file identity used by the retry session. No tokens or signed URLs stored.
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("gucang-local-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("草稿存储被其他页面占用"));
  });
}
export async function readDraft(key: string): Promise<ItemDraft | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("drafts").objectStore("drafts").get(key);
      request.onsuccess = () => {
        const value = request.result as ItemDraft | undefined;
        if (value && value.version !== 1) reject(new Error("草稿版本不兼容，请保留此页面并联系维护者"));
        else resolve(value);
      };
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
export async function writeDraft(key: string, draft?: ItemDraft) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      if (draft) tx.objectStore("drafts").put(draft, key);
      else tx.objectStore("drafts").delete(key);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("无法保留本地草稿"));
    });
  } finally { db.close(); }
}
