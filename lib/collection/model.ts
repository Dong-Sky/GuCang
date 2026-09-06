import type { Catalog, ItemView, LocationRow, StylePatch, Workspace } from "./types";
import { compareInventoryNewest } from "./inventory";

export function locationPath(locationId: string | null, locations: LocationRow[] | Map<string, LocationRow>) {
  if (!locationId) return "未指定位置";
  const byId = locations instanceof Map ? locations : new Map(locations.map((location) => [location.id, location]));
  const names: string[] = [];
  const visited = new Set<string>();
  let current = byId.get(locationId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.name);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return names.join(" / ") || "未指定位置";
}

export function upsertRows<T extends { id: string }>(current: T[], updates: T[]) {
  const byId = new Map(current.map((row) => [row.id, row]));
  for (const row of updates) byId.set(row.id, row);
  return [...byId.values()];
}

function itemBuilder(data: Catalog) {
  const styles = new Map(data.styles.map((row) => [row.id, row]));
  const ips = new Map(data.ips.map((row) => [row.id, row]));
  const categories = new Map(data.categories.map((row) => [row.id, row]));
  const series = new Map(data.series.map((row) => [row.id, row]));
  const locations = new Map(data.locations.map((row) => [row.id, row]));
  const characters = new Map(data.characters.map((row) => [row.id, row]));
  const charactersByStyle = new Map<string, ItemView["characters"]>();
  for (const link of data.links) {
    const character = characters.get(link.character_id);
    if (!character) continue;
    const list = charactersByStyle.get(link.item_style_id) ?? [];
    list.push(character);
    charactersByStyle.set(link.item_style_id, list);
  }
  const imageByStyle = new Map<string, Catalog["images"]>();
  for (const image of [...data.images].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))) {
    if (!image.deleted_at) {
      const photos = imageByStyle.get(image.item_style_id) ?? [];
      photos.push(image);
      imageByStyle.set(image.item_style_id, photos);
    }
  }
  const movesByInstance = new Map<string, ItemView["recentMoves"]>();
  for (const move of [...data.movements].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const list = movesByInstance.get(move.item_instance_id) ?? [];
    if (list.length < 5) list.push(move);
    movesByInstance.set(move.item_instance_id, list);
  }
  return (instance: Catalog["instances"][number]): ItemView | null => {
    const style = styles.get(instance.item_style_id);
    if (!style) return null;
    const photos = imageByStyle.get(style.id) ?? [];
    const image = photos[0];
    return {
      instance, style,
      ip: ips.get(style.ip_id ?? "") ?? null,
      category: categories.get(style.category_id ?? "") ?? null,
      series: series.get(style.series_id ?? "") ?? null,
      characters: charactersByStyle.get(style.id) ?? [],
      location: locations.get(instance.current_location_id ?? "") ?? null,
      path: locationPath(instance.current_location_id, locations),
      imagePath: image?.thumbnail_path ?? image?.detail_path ?? null,
      detailImagePath: image?.detail_path ?? null,
      imageId: image?.id ?? null,
      photos,
      recentMoves: movesByInstance.get(instance.id) ?? [],
    };
  };
}

function isDeleted(item: ItemView) { return Boolean(item.instance.deleted_at || item.style.deleted_at); }
const newestFirst = compareInventoryNewest;
function imageBytes(data: Catalog) {
  return [...data.images, ...data.locationImages].reduce((sum, row) => sum + (row.deleted_at ? 0 : row.file_size_bytes + row.thumbnail_size_bytes), 0);
}

export function buildWorkspace(data: Catalog): Workspace {
  const build = itemBuilder(data);
  const all = data.instances.map(build).filter((item): item is ItemView => item !== null).sort(newestFirst);
  const locationImagePaths: Record<string, string | null> = {};
  for (const image of [...data.locationImages].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!image.deleted_at && !locationImagePaths[image.location_id]) locationImagePaths[image.location_id] = image.thumbnail_path ?? image.detail_path;
  }
  return { ...data, items: all.filter((item) => !isDeleted(item)), deletedItems: all.filter(isDeleted), imageBytes: imageBytes(data), locationImagePaths };
}

// Preserve unrelated item objects, pictures, and historical metadata. A style may
// have several owned instances; shared style edits must reach those instances too.
export function applyStylePatch(current: Workspace, patch: StylePatch): Workspace {
  if (current.household.id !== patch.householdId) return current;
  const styleId = patch.style.id;
  const affectedIds = new Set(patch.instances.map((row) => row.id));
  const data: Catalog = {
    ...current,
    styles: upsertRows(current.styles, [patch.style]),
    instances: [...current.instances.filter((row) => row.item_style_id !== styleId), ...patch.instances],
    images: [...current.images.filter((row) => row.item_style_id !== styleId), ...patch.images],
    links: [...current.links.filter((row) => row.item_style_id !== styleId), ...patch.links],
    ips: upsertRows(current.ips, patch.ips), categories: upsertRows(current.categories, patch.categories),
    series: upsertRows(current.series, patch.series), characters: upsertRows(current.characters, patch.characters),
    movements: [...current.movements.filter((row) => !affectedIds.has(row.item_instance_id)), ...patch.movements],
  };
  const build = itemBuilder(data);
  const changed = patch.instances.map(build).filter((item): item is ItemView => item !== null);
  return {
    ...current, ...data,
    items: [...current.items.filter((item) => item.style.id !== styleId), ...changed.filter((item) => !isDeleted(item))].sort(newestFirst),
    deletedItems: [...current.deletedItems.filter((item) => item.style.id !== styleId), ...changed.filter(isDeleted)].sort(newestFirst),
    imageBytes: imageBytes(data),
  };
}
