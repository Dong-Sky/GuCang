import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { pageSlice, readAllPages } from "../lib/collection/pagination.ts";
import { buildWorkspace, applyStylePatch, locationPath } from "../lib/collection/model.ts";
import { SignedUrlCache } from "../lib/images/signed-url-cache.ts";
import { compressVariants } from "../lib/images/compression.ts";
import { newPhotoSession, preparePhotos, uploadPhotos } from "../lib/images/upload.ts";

function catalog(size = 1205) {
  const created_at = "2026-01-01T00:00:00.000Z";
  const style = (id) => ({ id, household_id: "home", name: id, ip_id: null, category_id: null, series_id: null, deleted_at: null, completion_status: "draft", created_at });
  const styles = Array.from({ length: size }, (_, index) => style(`style-${index}`));
  const instances = styles.map((row, index) => ({ id: `instance-${index}`, item_style_id: row.id, household_id: "home", deleted_at: null, current_location_id: "box", home_location_id: "box", physical_status: "stored", created_at }));
  return { household: { id: "home" }, member: {}, members: [], locations: [{ id: "box", name: "测试盒", parent_id: null }], ips: [], categories: [], series: [], characters: [], styles, instances, images: styles.map((row) => ({ id: `image-${row.id}`, item_style_id: row.id, detail_path: `${row.id}-original.webp`, thumbnail_path: `${row.id}-thumb.webp`, file_size_bytes: 100, thumbnail_size_bytes: 20, deleted_at: null, sort_order: 0, created_at })), links: [], locationImages: [], movements: [], lastExportAt: null };
}

test("read all 1205 metadata rows without the default 1000-row truncation", async () => {
  const all = Array.from({ length: 1205 }, (_, i) => i);
  const requests = [];
  const rows = await readAllPages(async (from, to) => { requests.push([from, to]); return { data: all.slice(from, to + 1), count: all.length, error: null }; });
  assert.deepEqual(rows, all);
  assert.deepEqual(requests, [[0, 499], [500, 999], [1000, 1499]]);
});

test("pagination follows returned row counts if the server caps a page", async () => {
  const all = Array.from({ length: 515 }, (_, i) => i);
  const rows = await readAllPages(async (from) => ({ data: all.slice(from, from + 200), count: all.length, error: null }));
  assert.deepEqual(rows, all);
  await assert.rejects(readAllPages(async () => ({ data: [], count: 3, error: null })), /读取|完整|数据/);
  await assert.rejects(readAllPages(async () => ({ data: null, error: { message: "offline" } })), /offline/);
});

test("display pages stay bounded and clamp after a shrinking result set", () => {
  const all = Array.from({ length: 53 }, (_, i) => i);
  assert.equal(pageSlice(all, 1).items.length, 24);
  assert.deepEqual(pageSlice(all, 3).items, [48, 49, 50, 51, 52]);
  assert.equal(pageSlice(all.slice(0, 25), 3).page, 2);
  assert.equal(pageSlice([], 99).items.length, 0);
});

test("saving one style updates its owned instances and preserves all unrelated objects/photos", () => {
  const data = catalog();
  data.instances.push({ ...data.instances[0], id: "second-owned-instance" });
  const before = buildWorkspace(data);
  const unrelated = before.items.find((item) => item.style.id === "style-1000");
  const patch = { householdId: "home", style: { ...data.styles[0], name: "已完善", completion_status: "complete" }, instances: data.instances.filter((row) => row.item_style_id === "style-0"), images: data.images.slice(0, 1), links: [], ips: [], categories: [], series: [], characters: [], movements: [] };
  const after = applyStylePatch(before, patch);
  assert.equal(after.items.length, before.items.length);
  assert.equal(after.items.filter((item) => item.style.name === "已完善").length, 2);
  assert.equal(after.items.find((item) => item.instance.id === unrelated.instance.id), unrelated);
  assert.deepEqual([...after.images].sort((a,b) => a.id.localeCompare(b.id)), [...before.images].sort((a,b) => a.id.localeCompare(b.id)));
  assert.equal(after.imageBytes, before.imageBytes);
  assert.equal(applyStylePatch(before, { ...patch, householdId: "someone-else" }), before);
});

test("trash/restore patch affects only this owned instance; location cycles cannot hang", () => {
  const data = catalog(2);
  const before = buildWorkspace(data);
  const patch = { householdId: "home", style: data.styles[0], instances: [{ ...data.instances[0], deleted_at: "2026-08-30T12:00:00Z" }], images: data.images.slice(0, 1), links: [], ips: [], categories: [], series: [], characters: [], movements: [] };
  const after = applyStylePatch(before, patch);
  assert.equal(after.items.length, 1);
  assert.equal(after.deletedItems.length, 1);
  assert.equal(after.images.length, 2);
  assert.equal(locationPath("a", [{ id: "a", name: "A", parent_id: "b" }, { id: "b", name: "B", parent_id: "a" }]), "B / A");
});

test("private URLs are batched, deduplicated, mapped by path, cached and refreshed before expiry", async () => {
  let now = 0;
  const calls = [];
  const cache = new SignedUrlCache(async (paths) => { calls.push(paths); return { data: [...paths].reverse().map((path) => ({ path, signedUrl: `${path}?v=${calls.length}` })), error: null }; }, () => now);
  const first = await Promise.all([cache.get("a"), cache.get("b"), cache.get("a")]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["a", "b"]);
  assert.equal(first[0].url, "a?v=1");
  assert.equal(first[0], first[2]);
  now = 3_000_000;
  await cache.get("a");
  assert.equal(calls.length, 1);
  now = 3_550_000;
  assert.equal((await cache.get("a")).url, "a?v=2");
  cache.clear();
});

test("signing batches are bounded and an inaccessible photo does not block other rows", async () => {
  const calls = [];
  const cache = new SignedUrlCache(async (paths) => { calls.push(paths); return { data: paths.map((path) => ({ path, signedUrl: path === "bad" ? null : path, error: path === "bad" ? "missing" : null })), error: null }; });
  const result = await Promise.allSettled([cache.get("bad"), ...Array.from({ length: 99 }, (_, index) => cache.get(String(index)))]);
  assert.equal(result.filter((row) => row.status === "fulfilled").length, 99);
  assert.ok(calls.every((paths) => paths.length <= 48));
  cache.clear();
});

test("cache clear cancels old requests without leaking a prior household's URL", async () => {
  const resolvers = [];
  const cache = new SignedUrlCache((paths) => new Promise((resolve) => resolvers.push(() => resolve({ data: paths.map((path) => ({ path, signedUrl: "old" })), error: null }))));
  const pending = cache.get("a");
  const rejection = assert.rejects(pending, /会话/);
  await delay(20);
  cache.clear();
  resolvers[0]();
  await rejection;
  const second = new SignedUrlCache(async (paths) => ({ data: paths.map((path) => ({ path, signedUrl: "new" })), error: null }));
  assert.equal((await second.get("a")).url, "new");
  second.clear();
});

test("standard compression uses one decoded source for 1400/400 variants without upscaling", async () => {
  const drawn = [];
  let disposed = false;
  const pair = await compressVariants(4000, 3000, "standard", { draw: (w,h) => drawn.push([w,h]), encode: async (type) => new Blob(["pixels"], { type }), dispose: () => { disposed = true; } });
  assert.deepEqual(drawn, [[1400, 1050], [400, 300]]);
  assert.equal(pair.detail.extension, "webp");
  assert.equal(disposed, true);
  drawn.length = 0;
  await compressVariants(100, 80, "high", { draw: (w,h) => drawn.push([w,h]), encode: async (type) => new Blob(["pixels"], { type }), dispose() {} });
  assert.deepEqual(drawn, [[100, 80], [100, 80]]);
});

test("unsupported WebP falls back to real JPEG, with bounded quality passes and cleanup", async () => {
  let encoded = 0, disposed = false;
  const pair = await compressVariants(4000, 2000, "standard", { draw() {}, encode: async (type) => { encoded++; return new Blob([new Uint8Array(200 * 1024)], { type: type === "image/webp" ? "image/png" : type }); }, dispose() { disposed = true; } });
  assert.equal(pair.detail.mimeType, "image/jpeg");
  assert.equal(pair.thumbnail.extension, "jpg");
  assert.equal(encoded, 6);
  assert.equal(disposed, true);
});

test("upload retry is bounded to two requests and never reuploads a successful file or deletes history", async () => {
  const files = [new File(["source"], "new.jpg")];
  const session = newPhotoSession();
  let decoded = 0, active = 0, peak = 0, thumbAttempts = 0, commits = 0;
  const uploads = [];
  const image = { blob: new Blob(["compressed"], { type: "image/webp" }), width: 1400, height: 1000, mimeType: "image/webp", extension: "webp" };
  const process = async () => { decoded++; return { detail: image, thumbnail: { ...image, width: 400, height: 286 } }; };
  await preparePhotos(files, "standard", "new-only", session, () => {}, process);
  const client = { storage: { from: () => ({ upload: async (path, _blob, options) => {
    assert.equal(options.upsert, false);
    uploads.push(path); active++; peak = Math.max(peak, active);
    await delay(10); active--;
    if (path.includes("-thumb") && ++thumbAttempts === 1) return { error: { message: "network failed" } };
    return { error: null };
  }, remove: () => { throw new Error("Historical images must never be removed"); } }) } };
  const commit = async () => { commits++; };
  await assert.rejects(uploadPhotos(client, files, session, () => {}, commit), /network failed/);
  assert.equal(active, 0);
  assert.equal(commits, 0);
  await preparePhotos(files, "standard", "new-only", session, () => {}, process);
  await uploadPhotos(client, files, session, () => {}, commit);
  await uploadPhotos(client, files, session, () => {}, commit);
  assert.equal(decoded, 1);
  assert.equal(peak, 2);
  assert.equal(uploads.length, 3);
  assert.equal(commits, 1);
});
