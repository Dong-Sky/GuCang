import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";

export function createSupabaseBrowserClient() {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    throw new Error("Supabase 环境变量尚未配置");
  }

  return createBrowserClient(url, anonKey);
}
