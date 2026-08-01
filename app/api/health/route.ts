import { NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export function GET() {
  const { configured } = getSupabaseConfig();
  return NextResponse.json({
    ok: true,
    app: "gucang",
    supabaseConfigured: configured,
    timestamp: new Date().toISOString(),
  });
}
