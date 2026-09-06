import type { ItemView, StylePatch, SupabaseClient, Workspace } from "./types";
import { loadStylePatch } from "./api";
import { applyStylePatch } from "./model";
import { missingItemFields } from "./inventory";

export const BATCH_LIMIT = 50;
export type BatchField = "ip" | "category" | "series" | "character" | "location" | "move" | "return";
export type BatchAction = { field: BatchField; value: string };
export type BatchResult = { id: string; state: "done" | "skipped" | "failed"; message: string };
export type MissingFilter = "" | "IP" | "品类" | "位置" | "照片";
export function matchesMissing(item: ItemView, filter: MissingFilter) {
  return !filter || (filter === "照片" ? !item.photos.length : missingItemFields(item).includes(filter));
}

export function batchEligibility(item: ItemView, action: BatchAction, workspace: Workspace, selected: Set<string>): string | null {
  if (item.instance.household_id !== workspace.household.id || item.instance.deleted_at || item.style.deleted_at) return "收藏已删除或不属于当前谷仓";
  if (action.field === "move") {
    if (!workspace.locations.some((l) => l.id === action.value && l.household_id === workspace.household.id && !l.deleted_at)) return "请选择有效位置";
    return item.instance.current_location_id === action.value && item.instance.physical_status === "stored" ? "已收纳在这里，无需移动" : null;
  }
  if (action.field === "return") {
    if (item.instance.physical_status !== "temporarily_out") return "不在待归位状态";
    return workspace.locations.some((l) => l.id === item.instance.home_location_id && !l.deleted_at) ? null : "没有可用的默认归位位置";
  }
  if (action.field === "location") {
    if (!workspace.locations.some((l) => l.id === action.value && !l.deleted_at)) return "请选择有效位置";
    const { current_location_id: current, home_location_id: home, physical_status: status } = item.instance;
    // Allow finishing a partially completed fill without moving an existing item elsewhere.
    if ((!current && !home) || (!current && home === action.value && status !== "temporarily_out") || (current === action.value && !home)) return null;
    return "已有位置，不覆盖";
  }
  if (workspace.instances.some((row) => row.item_style_id === item.style.id && !selected.has(row.id))) return "同款还有未选中的实物，请一起选择或单件编辑";
  if (action.field === "ip") {
    if (item.style.ip_id) return "已有 IP，不覆盖";
    if (item.characters.length || item.style.series_id) return "已有角色或系列，请单件核对 IP";
    return workspace.ips.some((row) => row.id === action.value && !row.deleted_at) ? null : "请选择有效 IP";
  }
  if (action.field === "category") {
    if (item.style.category_id) return "已有品类，不覆盖";
    return workspace.categories.some((row) => row.id === action.value && !row.deleted_at) ? null : "请选择有效品类";
  }
  if (action.field === "character") {
    if (item.characters.length) return "已有角色，不覆盖";
    return workspace.characters.some((row) => row.id === action.value && !row.deleted_at && row.ip_id === item.style.ip_id) ? null : "角色与这件收藏的 IP 不匹配";
  }
  if (item.style.series_id) return "已有系列，不覆盖";
  return workspace.series.some((row) => row.id === action.value && !row.deleted_at && row.ip_id === item.style.ip_id) ? null : "系列与这件收藏的 IP 不匹配";
}

function checked<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

// Sequential, per-instance results. Never create/delete items or touch media.
// Re-read each style/instance before changing a field; preserve unrelated fields.
export async function runBatch(client: SupabaseClient, workspace: Workspace, userId: string, ids: string[], action: BatchAction,
  onPatch: (patch: StylePatch) => void, onResult: (result: BatchResult) => void, cancelled: () => boolean = () => false, approvedIds: string[] = ids) {
  const unique = [...new Set(ids)];
  if (!unique.length || unique.length > BATCH_LIMIT) throw new Error(`每次请选择 1–${BATCH_LIMIT} 件`);
  const selected = new Set(approvedIds);
  if (selected.size > BATCH_LIMIT || unique.some((id) => !selected.has(id))) throw new Error("批量确认范围已变化，请重新选择");
  let current = workspace;
  for (const id of unique) {
    if (cancelled()) break;
    const original = workspace.items.find((item) => item.instance.id === id);
    if (!original) { onResult({ id, state: "skipped", message: "当前谷仓中没有这件收藏" }); continue; }
    try {
      const patch = await loadStylePatch(client, workspace.household.id, original.style.id);
      current = applyStylePatch(current, patch); onPatch(patch);
      const item = current.items.find((entry) => entry.instance.id === id);
      const reason = item ? batchEligibility(item, action, current, selected) : "收藏已移入回收站";
      if (reason || !item) { onResult({ id, state: "skipped", message: reason! }); continue; }
      if (action.field === "move") {
        checked(await client.from("locations").select("id").eq("household_id", workspace.household.id).eq("id", action.value).is("deleted_at", null).single());
        checked(await client.rpc("move_item_instance", { target_instance: id, target_location: action.value, target_status: "stored", target_note: "按位置批量整理（默认归位位置不变）" }));
      } else if (action.field === "location" || action.field === "return") {
        const target = action.field === "return" ? item.instance.home_location_id! : action.value;
        const location = checked(await client.from("locations").select("id").eq("household_id", workspace.household.id).eq("id", target).is("deleted_at", null).single());
        if (!location) throw new Error("位置已不可用，请重新选择");
        if (action.field === "location" && !item.instance.home_location_id) {
          checked(await client.from("item_instances").update({ home_location_id: target, updated_by: userId }).eq("household_id", workspace.household.id).eq("id", id).is("deleted_at", null).is("home_location_id", null).select().single());
        }
        if (action.field === "return" || (item.instance.physical_status !== "temporarily_out" && item.instance.current_location_id !== target)) {
          checked(await client.rpc("move_item_instance", { target_instance: id, target_location: target, target_status: action.field === "return" ? "stored" : item.instance.physical_status, target_note: "批量整理" }));
        }
      } else {
        const table = action.field === "ip" ? "ips" : action.field === "category" ? "categories" : action.field === "character" ? "characters" : "series";
        const dictionary = checked(await client.from(table).select("*").eq("household_id", workspace.household.id).eq("id", action.value).is("deleted_at", null).single());
        if (!dictionary || ((action.field === "series" || action.field === "character") && "ip_id" in dictionary && dictionary.ip_id !== item.style.ip_id)) throw new Error("所选资料已不可用或 IP 不匹配");
        if (action.field === "character") {
          checked(await client.from("item_style_characters").upsert({ item_style_id: item.style.id, character_id: action.value }));
        } else {
          const column = action.field === "ip" ? "ip_id" : action.field === "category" ? "category_id" : "series_id";
          const rows = checked(await client.from("item_styles").update({ [column]: action.value, updated_by: userId }).eq("household_id", workspace.household.id).eq("id", item.style.id).is("deleted_at", null).is(column, null).select());
          if (!rows?.length) { onResult({ id, state: "skipped", message: "资料已变化，没有覆盖" }); continue; }
        }
      }
      const updated = await loadStylePatch(client, workspace.household.id, original.style.id);
      current = applyStylePatch(current, updated); onPatch(updated);
      onResult({ id, state: "done", message: "已完成" });
    } catch (error) { onResult({ id, state: "failed", message: error instanceof Error ? error.message : "操作失败，请核对后重试" }); }
  }
}
