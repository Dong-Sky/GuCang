import type { ItemFormValues } from "./save";

export type EntryDefaults = Pick<ItemFormValues, "ip" | "category" | "series" | "locationId" | "quick" | "quality">;

// Deliberately never inherit identity, photos, names, characters or notes.
export function nextEntryDefaults(values: ItemFormValues): EntryDefaults {
  return { ip: values.ip, category: values.category, series: values.series, locationId: values.locationId, quick: values.quick, quality: values.quality };
}
