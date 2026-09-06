import type { ItemView } from "./types";

// Minimum width, never a maximum: padding must not truncate the millionth item.
export function formatInventoryCode(value: number | bigint | string | null | undefined): string {
  if (value == null || !/^[0-9]+$/.test(String(value))) return "";
  const digits = String(value).replace(/^0+(?=\d)/, "");
  return digits === "0" ? "" : `GC-${digits.padStart(6, "0")}`;
}

export function inventoryCode(item: ItemView): string {
  return item.instance.inventory_code || formatInventoryCode(item.instance.inventory_number);
}

export function itemTitle(item: ItemView): string {
  const name = item.style.name.trim();
  if (name && name !== "未命名谷子") return name;
  const characters = item.characters.map((character) => character.name).join("、");
  return [item.ip?.name, characters].filter(Boolean).join(" · ") || item.category?.name || inventoryCode(item) || "收藏";
}

export function missingItemFields(item: ItemView): string[] {
  const missing: string[] = [];
  if (!item.ip) missing.push("IP");
  if (!item.category) missing.push("品类");
  if (!item.instance.current_location_id && !item.instance.home_location_id) missing.push("位置");
  return missing;
}

// Completeness belongs to the actual instance. Old clients may still write a
// draft style for an empty name; that must not make a complete instance a draft.
export function isIncompleteItem(item: ItemView): boolean {
  return item.style.completion_status === "review" || missingItemFields(item).length > 0;
}

export function matchesItemSearch(item: ItemView, search: string): boolean {
  const query = search.normalize("NFKC").trim().toLocaleLowerCase();
  if (!query) return true;
  const code = inventoryCode(item);
  const number = /^(?:gc\s*-?\s*)?(\d+)$/i.exec(query);
  if (number && formatInventoryCode(number[1]) === code) return true;
  // A GC-prefixed query addresses one instance, not a similarly named style.
  if (/^gc\s*-?\s*\d+$/i.test(query)) return false;
  return [item.style.name, item.style.official_name, item.style.notes, item.ip?.name,
    item.category?.name, item.series?.name, item.path, ...item.characters.map((character) => character.name)]
    .filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase().includes(query);
}

export function compareInventoryNewest(a: ItemView, b: ItemView): number {
  const aCode = inventoryCode(a), bCode = inventoryCode(b);
  if (aCode && bCode) {
    const aNumber = BigInt(aCode.slice(3)), bNumber = BigInt(bCode.slice(3));
    if (aNumber !== bNumber) return aNumber > bNumber ? -1 : 1;
  }
  return b.instance.created_at.localeCompare(a.instance.created_at) || a.instance.id.localeCompare(b.instance.id);
}
