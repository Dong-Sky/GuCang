import type { Database } from "../supabase/database.types";
import { characterNames } from "./find";
import type { CategoryRow, CharacterRow, IpRow, SeriesRow, SupabaseClient, Workspace } from "./types";
import { prepareImage } from "../images/processing";
import type { ImageQuality } from "../images/compression";
import { newPhotoSession, preparePhotos, uploadPhotos, type PhotoSession, type ProgressReporter } from "../images/upload";

export type ItemFormValues = {
  name: string; ip: string; character: string; category: string; series: string;
  locationId: string; notes: string; status: Database["public"]["Enums"]["physical_status"];
  quick: boolean; files: File[]; quality: ImageQuality; styleId?: string; instanceId?: string;
};
export type LocationFormValues = { locationId?: string; name: string; type: string; description: string; parentId: string | null; files: File[]; quality: ImageQuality };
export type SaveSession = {
  ownerId?: string; instanceId?: string; householdId?: string; inventoryCode?: string; photoSession: PhotoSession;
  lookupIds: Map<string, string>;
  ips: IpRow[]; categories: CategoryRow[]; series: SeriesRow[]; characters: CharacterRow[];
  movedTo?: string;
};
export function newSaveSession(): SaveSession { return { photoSession: newPhotoSession(), lookupIds: new Map(), ips: [], categories: [], series: [], characters: [] }; }

function required<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data == null) throw new Error("未能确认保存结果，请重试");
  return result.data;
}
function reserve(session: SaveSession, key: string) {
  let id = session.lookupIds.get(key);
  if (!id) { id = crypto.randomUUID(); session.lookupIds.set(key, id); }
  return id;
}
function assertHousehold(session: SaveSession, householdId: string) {
  if (session.householdId && session.householdId !== householdId) throw new Error("家庭空间已切换，请重新打开录入页面");
  session.householdId = householdId;
}
const normalized = (value: string) => value.trim().toLocaleLowerCase();

export async function saveItem(client: SupabaseClient, workspace: Workspace, userId: string, values: ItemFormValues, session: SaveSession, report: ProgressReporter) {
  const householdId = workspace.household.id;
  assertHousehold(session, householdId);
  const styleId = session.ownerId ??= values.styleId ?? crypto.randomUUID();
  const instanceId = session.instanceId ??= values.instanceId ?? crypto.randomUUID();
  await preparePhotos(values.files, values.quality, `households/${householdId}/items/${styleId}`, session.photoSession, report, prepareImage);
  report({ stage: "save", message: "正在保存收藏资料" });

  const [ip, category] = await Promise.all([
    (async () => {
      if (!values.ip.trim()) return null;
      const match = [...workspace.ips, ...session.ips].find((row) => normalized(row.name) === normalized(values.ip));
      if (match) return match;
      const existing = required(await client.from("ips").select("*").eq("household_id", householdId).eq("name", values.ip.trim()).is("deleted_at", null).limit(1));
      const row = existing[0] ?? required(await client.from("ips").upsert({ id: reserve(session, `ip:${normalized(values.ip)}`), household_id: householdId, name: values.ip.trim(), name_zh: values.ip.trim(), created_by: userId }).select().single());
      session.ips.push(row);
      return row;
    })(),
    (async () => {
      if (!values.category.trim()) return null;
      const match = [...workspace.categories, ...session.categories].find((row) => normalized(row.name) === normalized(values.category));
      if (match) return match;
      const existing = required(await client.from("categories").select("*").eq("household_id", householdId).eq("name", values.category.trim()).is("deleted_at", null).limit(1));
      const row = existing[0] ?? required(await client.from("categories").upsert({ id: reserve(session, `category:${normalized(values.category)}`), household_id: householdId, name: values.category.trim() }).select().single());
      session.categories.push(row);
      return row;
    })(),
  ]);
  const previousItem = workspace.items.find((item) => item.style.id === styleId);
  const names = characterNames(values.character);
  if (names.length > 50) throw new Error("一件收藏最多关联 50 个角色");
  if (names.length && !ip) throw new Error("请先填写 IP，再添加角色");
  const charactersChanged = !values.styleId || JSON.stringify((previousItem?.characters ?? []).map(c => normalized(c.name)).sort()) !== JSON.stringify(names.map(normalized).sort()) || previousItem?.ip?.id !== ip?.id;
  const [series, character] = await Promise.all([
    (async () => {
      if (!values.series.trim()) return null;
      const match = [...workspace.series, ...session.series].find((row) => row.ip_id === (ip?.id ?? null) && normalized(row.name) === normalized(values.series));
      if (match) return match;
      const query = client.from("series").select("*").eq("household_id", householdId).eq("name", values.series.trim()).is("deleted_at", null);
      const existing = required(await (ip ? query.eq("ip_id", ip.id) : query.is("ip_id", null)).limit(1));
      const row = existing[0] ?? required(await client.from("series").upsert({ id: reserve(session, `series:${ip?.id}:${normalized(values.series)}`), household_id: householdId, name: values.series.trim(), ip_id: ip?.id ?? null }).select().single());
      session.series.push(row);
      return row;
    })(),
    (async () => {
      if (!charactersChanged || !ip) return [];
      return Promise.all(names.map(async name => {
        const match = [...workspace.characters, ...session.characters].find(row => row.ip_id === ip.id && normalized(row.name) === normalized(name));
        if (match) return match;
        const existing = required(await client.from("characters").select("*").eq("household_id", householdId).eq("ip_id", ip.id).eq("name", name).is("deleted_at", null).limit(1));
        const row = existing[0] ?? required(await client.from("characters").upsert({ id: reserve(session, `character:${ip.id}:${normalized(name)}`), household_id: householdId, ip_id: ip.id, name, created_by: userId }).select().single());
        session.characters.push(row);
        return row;
      }));
    })(),
  ]);
  const completion = !values.ip.trim() || !values.category.trim() || !values.locationId ? "draft" : "complete";
  const styleValues = { name: values.name.trim(), ip_id: ip?.id ?? null, category_id: category?.id ?? null, series_id: series?.id ?? null, notes: values.notes.trim() || null, search_text: [values.name, values.ip, values.character, values.category, values.series, values.notes].filter(Boolean).join(" "), completion_status: ip && category ? "complete" : "draft", updated_by: userId } as const;
  required(values.styleId
    ? await client.from("item_styles").update(styleValues).eq("household_id", householdId).eq("id", styleId).select().single()
    : await client.from("item_styles").upsert({ ...styleValues, id: styleId, household_id: householdId, created_by: userId }).select().single());
  if (charactersChanged) {
    const linked = await client.rpc("set_style_characters", { p_style: styleId, p_characters: character.map(row => row.id) });
    if (linked.error) throw linked.error;
  }
  const previousInstance = workspace.instances.find((instance) => instance.id === instanceId);
  const currentLocation = values.status === "temporarily_out" ? null : values.locationId || null;
  const homeLocation = values.locationId || previousInstance?.home_location_id || null;
  if (!values.instanceId) {
    const instance = required(await client.from("item_instances").upsert({ id: instanceId, household_id: householdId, item_style_id: styleId, current_location_id: currentLocation, home_location_id: homeLocation, physical_status: values.status, created_by: userId, updated_by: userId }).select().single());
    session.inventoryCode = instance.inventory_code;
  } else {
    const instance = required(await client.from("item_instances").update({ home_location_id: homeLocation, updated_by: userId }).eq("household_id", householdId).eq("id", instanceId).select().single());
    session.inventoryCode = instance.inventory_code;
    const moveKey = `${currentLocation}:${values.status}`;
    if ((previousInstance?.current_location_id !== currentLocation || previousInstance?.physical_status !== values.status) && session.movedTo !== moveKey) {
      const moved = await client.rpc("move_item_instance", { target_instance: instanceId, target_location: currentLocation as unknown as string, target_status: values.status, target_note: "通过编辑表单更新" });
      if (moved.error) throw moved.error;
      session.movedTo = moveKey;
    }
  }
  const existingImages = workspace.images.filter((image) => image.item_style_id === styleId);
  const firstOrder = existingImages.reduce((max, image) => Math.max(max, image.sort_order + 1), 0);
  await uploadPhotos(client, values.files, session.photoSession, report, async (photo, index) => {
    const { detail, thumbnail } = photo.pair;
    const result = await client.from("item_images").upsert({ id: photo.id, household_id: householdId, item_style_id: styleId, image_type: firstOrder + index === 0 ? "main" : "attachment", detail_path: photo.detailPath, thumbnail_path: photo.thumbnailPath, file_size_bytes: detail.blob.size, thumbnail_size_bytes: thumbnail.blob.size, width: detail.width, height: detail.height, sort_order: firstOrder + index, created_by: userId });
    if (result.error) throw result.error;
  });
  return { styleId, completion, inventoryCode: session.inventoryCode };
}

export async function saveLocationRecord(client: SupabaseClient, workspace: Workspace, userId: string, values: LocationFormValues, session: SaveSession, report: ProgressReporter) {
  const householdId = workspace.household.id;
  assertHousehold(session, householdId);
  const id = session.ownerId ??= values.locationId ?? crypto.randomUUID();
  if (!values.name.trim()) throw new Error("请填写位置名称");
  if (values.parentId === id) throw new Error("上级位置不能选择自己");
  await preparePhotos(values.files, values.quality, `households/${householdId}/locations/${id}`, session.photoSession, report, prepareImage);
  report({ stage: "save", message: "正在保存收纳位置" });
  const fields = { parent_id: values.parentId, name: values.name.trim(), location_type: values.type, description: values.description.trim() || null, updated_at: new Date().toISOString() };
  const location = required(values.locationId
    ? await client.from("locations").update(fields).eq("household_id", householdId).eq("id", id).select().single()
    : await client.from("locations").upsert({ ...fields, id, household_id: householdId, created_by: userId }).select().single());
  const hasImages = workspace.locationImages.some((image) => image.location_id === id);
  await uploadPhotos(client, values.files, session.photoSession, report, async (photo, index) => {
    const { detail, thumbnail } = photo.pair;
    const result = await client.from("location_images").upsert({ id: photo.id, household_id: householdId, location_id: id, image_type: !hasImages && index === 0 ? "main" : "attachment", detail_path: photo.detailPath, thumbnail_path: photo.thumbnailPath, file_size_bytes: detail.blob.size, thumbnail_size_bytes: thumbnail.blob.size, width: detail.width, height: detail.height, created_by: userId });
    if (result.error) throw result.error;
  });
  report({ stage: "refresh", message: "正在更新这个位置" });
  const images = required(await client.from("location_images").select("*").eq("household_id", householdId).eq("location_id", id).is("deleted_at", null));
  return { location, images };
}
