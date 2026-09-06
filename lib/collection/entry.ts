import type { ItemFormValues } from "./save";

export type EntryDefaults = Pick<ItemFormValues, "ip" | "category" | "series" | "locationId" | "quick" | "quality">;

// Deliberately never inherit identity, photos, names, characters or notes.
export function nextEntryDefaults(values: ItemFormValues, keepDefaults = true, entryLocationId?: string): EntryDefaults {
  return { ip: keepDefaults ? values.ip : "", category: keepDefaults ? values.category : "", series: keepDefaults ? values.series : "", locationId: entryLocationId ?? (keepDefaults ? values.locationId : ""), quick: values.quick, quality: values.quality };
}
