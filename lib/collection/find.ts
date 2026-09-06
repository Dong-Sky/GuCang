import type { ItemView } from "./types";
import { compareInventoryNewest } from "./inventory";
export type FindOptions = { ip: string; category: string; status: string; character: string; series: string; sort: string };
export const emptyFind: FindOptions = { ip: "", category: "", status: "", character: "", series: "", sort: "newest" };
export function findItems(items: ItemView[], f: FindOptions): ItemView[] {
  return items.filter(i => (!f.ip || i.ip?.id === f.ip) && (!f.category || i.category?.id === f.category) && (!f.status || i.instance.physical_status === f.status) && (!f.character || i.characters.some(c => c.id === f.character)) && (!f.series || i.series?.id === f.series))
    .sort((a, b) => f.sort === "oldest" ? -compareInventoryNewest(a, b) : f.sort === "updated" ? Math.max(Date.parse(b.instance.updated_at), Date.parse(b.style.updated_at)) - Math.max(Date.parse(a.instance.updated_at), Date.parse(a.style.updated_at)) || compareInventoryNewest(a, b) : compareInventoryNewest(a, b));
}
