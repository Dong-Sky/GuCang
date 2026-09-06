import { readAllPages } from "./pagination";
import { buildWorkspace } from "./model";
import type { Household, StylePatch, SupabaseClient, Workspace } from "./types";

function checked<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data == null) throw new Error("未能读取收藏数据，请重试");
  return result.data;
}

export async function loadWorkspace(client: SupabaseClient, household: Household, userId: string): Promise<Workspace> {
  const id = household.id;
  const [members, locations, ips, categories, series, characters, styles, instances, links, images, locationImages, exportResult] = await Promise.all([
    readAllPages((from, to) => client.from("household_members").select("*", { count: "exact" }).eq("household_id", id).order("user_id").range(from, to)),
    readAllPages((from, to) => client.from("locations").select("*", { count: "exact" }).eq("household_id", id).is("deleted_at", null).order("sort_order").order("created_at").order("id").range(from, to)),
    readAllPages((from, to) => client.from("ips").select("*", { count: "exact" }).eq("household_id", id).is("deleted_at", null).order("sort_order").order("name").order("id").range(from, to)),
    readAllPages((from, to) => client.from("categories").select("*", { count: "exact" }).eq("household_id", id).is("deleted_at", null).order("sort_order").order("name").order("id").range(from, to)),
    readAllPages((from, to) => client.from("series").select("*", { count: "exact" }).eq("household_id", id).is("deleted_at", null).order("name").order("id").range(from, to)),
    readAllPages((from, to) => client.from("characters").select("*", { count: "exact" }).eq("household_id", id).is("deleted_at", null).order("name").order("id").range(from, to)),
    readAllPages((from, to) => client.from("item_styles").select("*", { count: "exact" }).eq("household_id", id).order("id").range(from, to)),
    readAllPages((from, to) => client.from("item_instances").select("*", { count: "exact" }).eq("household_id", id).order("id").range(from, to)),
    readAllPages((from, to) => client.from("item_style_characters").select("item_style_id,character_id,sort_order,item_styles!inner(household_id)", { count: "exact" }).eq("item_styles.household_id", id).order("item_style_id").order("character_id").range(from, to)),
    readAllPages((from, to) => client.from("item_images").select("*", { count: "exact" }).eq("household_id", id).order("id").range(from, to)),
    readAllPages((from, to) => client.from("location_images").select("*", { count: "exact" }).eq("household_id", id).is("deleted_at", null).order("id").range(from, to)),
    client.from("export_events").select("created_at").eq("household_id", id).order("created_at", { ascending: false }).limit(1),
  ]);
  return buildWorkspace({
    household, members,
    member: members.find((member) => member.user_id === userId) ?? { household_id: id, user_id: userId, role: "member", joined_at: new Date().toISOString() },
    locations, ips, categories, series, characters, styles, instances,
    links: links.map(({ item_style_id, character_id, sort_order }) => ({ item_style_id, character_id, sort_order })),
    // ItemHistory loads instance-scoped pages on demand; history is not startup data.
    images, locationImages, movements: [], lastExportAt: checked(exportResult)[0]?.created_at ?? null,
  });
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
