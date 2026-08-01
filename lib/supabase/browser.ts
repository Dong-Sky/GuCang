import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";
import type { Database } from "./database.types";

export function createSupabaseBrowserClient() {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    throw new Error("Supabase 环境变量尚未配置");
  }

  return createBrowserClient<Database>(url, anonKey);
}
