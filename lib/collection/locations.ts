import type { ItemView, LocationRow } from "./types";

/** A single index for arbitrary-depth navigation; no per-row full catalog scan. */
export function buildLocationIndex(locations: LocationRow[], items: ItemView[]) {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const children = new Map<string | null, LocationRow[]>();
  for (const location of locations) {
    const parent = location.parent_id && byId.has(location.parent_id) ? location.parent_id : null;
    const siblings = children.get(parent) ?? [];
    siblings.push(location);
    children.set(parent, siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "zh-CN"));
  const lineage = (id: string | null) => {
    const result: LocationRow[] = [], visited = new Set<string>();
    let node = id ? byId.get(id) : undefined;
    while (node && !visited.has(node.id)) {
      visited.add(node.id);
      result.push(node);
      node = node.parent_id ? byId.get(node.parent_id) : undefined;
    }
    return result.reverse();
  };
  const descendantIds = (id: string) => {
    const ids = new Set<string>(), pending = [id];
    while (pending.length) {
      const current = pending.pop()!;
      if (ids.has(current)) continue;
      ids.add(current);
      for (const child of children.get(current) ?? []) pending.push(child.id);
    }
    return ids;
  };
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.instance.deleted_at || item.style.deleted_at) continue;
    // A temporarily-out instance is still found through its home container.
    const id = item.instance.current_location_id ?? item.instance.home_location_id;
    for (const parent of lineage(id)) counts.set(parent.id, (counts.get(parent.id) ?? 0) + 1);
  }
  return { byId, children, lineage, descendantIds, counts };
}

export function compactLocationPath(path: string) {
  return path.split(" / ").slice(-2).join(" · ");
}
