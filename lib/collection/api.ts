import { readAllPages } from "./pagination";
import { buildWorkspace } from "./model";
import type { Catalog, Household, StylePatch, SupabaseClient, Workspace } from "./types";

type PageData = Pick<Catalog, "styles" | "instances" | "images" | "links"> & { total: number; page: number };
type ReadRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
export async function browseCatalog(client: SupabaseClient, workspace: Workspace, query: string, filters: Record<string, string>, page: number, size = 24) {
  const data = checked(await (client.rpc.bind(client) as unknown as ReadRpc)("browse_catalog", { target_household: workspace.household.id, query_text: query, filters, page_number: page, page_size: size })) as PageData;
  if (!Array.isArray(data.instances) || !Array.isArray(data.styles) || !Array.isArray(data.images) || !Array.isArray(data.links) || !Number.isSafeInteger(data.total) || data.total < 0 || !Number.isSafeInteger(data.page) || data.page < 1 || data.instances.length > size) throw new Error("分页数据无效，请重试");
  const built = buildWorkspace({ ...workspace, ...data });
  const byId = new Map(built.items.map(item => [item.instance.id, item]));
  return { ...data, items: data.instances.map(row => byId.get(row.id)!).filter(Boolean) };
}

function checked<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data == null) throw new Error("未能读取收藏数据，请重试");
  return result.data;
}

export async function loadWorkspace(client: SupabaseClient, household: Household, userId: string, lightweight = false): Promise<Workspace> {
  const id = household.id;
  const [members, locations, ips, categories, series, characters, styles, instances, links, images, locationImages, exportResult] = await Promise.all([
    readAllPages((from, to) => client.from("household_members").select("*", { count: "exact" }).eq("household_id", id).order("user_id").range(from, to)),
    readAllPages((from, to) => client.from("locations").select("*", { count: "exact" }).eq("household_id", id).is("deleted_at", null).order("sort_order").order("created_at").order("id").range(from, to)),
    readAllPages((from, to) => client.from("ips").select("*", { count: "exact" }).eq("household_id", id).is("deleted_at", null).order("sort_order").order("name").order("id").range(from, to)),
    readAllPages((from, to) => client.from("categories").select("*", { count: "exact" }).eq("household_id", id).is("deleted_at", null).order("sort_order").order("name").order("id").range(from, to)),
    readAllPages((from, to) => client.from("series").select("*", { count: "exact" }).eq("household_id", id).is("deleted_at", null).order("name").order("id").range(from, to)),
    readAllPages((from, to) => client.from("characters").select("*", { count: "exact" }).eq("household_id", id).is("deleted_at", null).order("name").order("id").range(from, to)),
    lightweight ? [] : readAllPages((from, to) => client.from("item_styles").select("*", { count: "exact" }).eq("household_id", id).order("id").range(from, to)),
    lightweight ? [] : readAllPages((from, to) => client.from("item_instances").select("*", { count: "exact" }).eq("household_id", id).order("id").range(from, to)),
    lightweight ? [] : readAllPages((from, to) => client.from("item_style_characters").select("item_style_id,character_id,sort_order,item_styles!inner(household_id)", { count: "exact" }).eq("item_styles.household_id", id).order("item_style_id").order("character_id").range(from, to)),
    lightweight ? [] : readAllPages((from, to) => client.from("item_images").select("*", { count: "exact" }).eq("household_id", id).order("id").range(from, to)),
    readAllPages((from, to) => client.from("location_images").select("*", { count: "exact" }).eq("household_id", id).is("deleted_at", null).order("id").range(from, to)),
    client.from("export_events").select("created_at").eq("household_id", id).order("created_at", { ascending: false }).limit(1),
  ]);
  const workspace = buildWorkspace({
    household, members,
    member: members.find((member) => member.user_id === userId) ?? { household_id: id, user_id: userId, role: "member", joined_at: new Date().toISOString() },
    locations, ips, categories, series, characters, styles, instances,
    links: links.map(({ item_style_id, character_id, sort_order }) => ({ item_style_id, character_id, sort_order })),
    // ItemHistory loads instance-scoped pages on demand; history is not startup data.
    images, locationImages, movements: [], lastExportAt: checked(exportResult)[0]?.created_at ?? null,
  });
  if (!lightweight) return workspace;
  const [page, rawSummary] = await Promise.all([
    browseCatalog(client, workspace, "", {}, 1, 2),
    (client.rpc.bind(client) as unknown as ReadRpc)("catalog_summary", { target_household: id }),
  ]);
  const summary = checked(rawSummary) as NonNullable<Workspace["summary"]>;
  if ([summary.total, summary.draft, summary.out, summary.pending, summary.imageBytes].some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error("汇总数据无效，请重试");
  return { ...buildWorkspace({ ...workspace, ...page }), summary, imageBytes: summary.imageBytes };
}

// Only the saved style and its owned instances are refreshed. No household-wide
// reload, signing pass, or recycle-bin cleanup is part of the save critical path.
export async function loadStylePatch(client: SupabaseClient, householdId: string, styleId: string): Promise<StylePatch> {
  const style = checked(await client.from("item_styles").select("*").eq("household_id", householdId).eq("id", styleId).single());
  const [instances, images, links, charactersResult, ipsResult, categoriesResult, seriesResult] = await Promise.all([
    readAllPages((from, to) => client.from("item_instances").select("*", { count: "exact" }).eq("household_id", householdId).eq("item_style_id", styleId).order("id").range(from, to)),
    readAllPages((from, to) => client.from("item_images").select("*", { count: "exact" }).eq("household_id", householdId).eq("item_style_id", styleId).order("id").range(from, to)),
    readAllPages((from, to) => client.from("item_style_characters").select("*", { count: "exact" }).eq("item_style_id", styleId).order("character_id").range(from, to)),
    client.from("characters").select("*,item_style_characters!inner(item_style_id)").eq("household_id", householdId).eq("item_style_characters.item_style_id", styleId),
    style.ip_id ? client.from("ips").select("*").eq("household_id", householdId).eq("id", style.ip_id) : Promise.resolve({ data: [], error: null }),
    style.category_id ? client.from("categories").select("*").eq("household_id", householdId).eq("id", style.category_id) : Promise.resolve({ data: [], error: null }),
    style.series_id ? client.from("series").select("*").eq("household_id", householdId).eq("id", style.series_id) : Promise.resolve({ data: [], error: null }),
  ]);
  return { householdId, style, instances, images, links, characters: checked(charactersResult), ips: checked(ipsResult), categories: checked(categoriesResult), series: checked(seriesResult), movements: [] };
}
