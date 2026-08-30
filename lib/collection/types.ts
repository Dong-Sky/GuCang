import type { Tables } from "../supabase/database.types";
import type { createSupabaseBrowserClient } from "../supabase/browser";

export type SupabaseClient = ReturnType<typeof createSupabaseBrowserClient>;
export type Household = Tables<"households">;
export type LocationRow = Tables<"locations">;
export type IpRow = Tables<"ips">;
export type CategoryRow = Tables<"categories">;
export type SeriesRow = Tables<"series">;
export type StyleRow = Tables<"item_styles">;
export type InstanceRow = Tables<"item_instances">;
export type CharacterRow = Tables<"characters">;
export type ImageRow = Tables<"item_images">;
export type LocationImageRow = Tables<"location_images">;
export type MovementRow = Tables<"movement_events">;
export type MemberRow = Tables<"household_members">;
export type CharacterLink = Tables<"item_style_characters">;

export type ItemView = {
  instance: InstanceRow;
  style: StyleRow;
  ip: IpRow | null;
  category: CategoryRow | null;
  series: SeriesRow | null;
  characters: CharacterRow[];
  location: LocationRow | null;
  path: string;
  imagePath: string | null;
  detailImagePath: string | null;
  imageId: string | null;
  recentMoves: MovementRow[];
};

export type Catalog = {
  household: Household;
  member: MemberRow;
  members: MemberRow[];
  locations: LocationRow[];
  ips: IpRow[];
  categories: CategoryRow[];
  series: SeriesRow[];
  characters: CharacterRow[];
  styles: StyleRow[];
  instances: InstanceRow[];
  links: CharacterLink[];
  images: ImageRow[];
  locationImages: LocationImageRow[];
  movements: MovementRow[];
  lastExportAt: string | null;
};

export type Workspace = Catalog & {
  items: ItemView[];
  deletedItems: ItemView[];
  imageBytes: number;
  locationImagePaths: Record<string, string | null>;
};

export type StylePatch = Pick<Catalog, "instances" | "images" | "links" | "ips" | "categories" | "series" | "characters" | "movements"> & {
  householdId: string;
  style: StyleRow;
};
