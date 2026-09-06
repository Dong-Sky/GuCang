import type { NextConfig } from "next";

// Fail closed: this work is preview-only and must never point at family data.
// Production builds keep their own environment and are unaffected by this check.
if (process.env.VERCEL_ENV === "preview" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") !== "https://ndksfltmgvafztorcxca.supabase.co") {
  throw new Error("Preview must use gucang-test. Check Preview Supabase environment variables before deploying.");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
};

export default nextConfig;
