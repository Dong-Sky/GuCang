"use client";

import Image from "next/image";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SignedUrlCache, type SignedImage } from "@/lib/images/signed-url-cache";
import type { SupabaseClient } from "@/lib/collection/types";

const ImageCacheContext = createContext<SignedUrlCache | null>(null);

export function PrivateImageProvider({ client, children }: { client: SupabaseClient; children: ReactNode }) {
  const cache = useMemo(() => new SignedUrlCache(async (paths, expiresIn) => client.storage.from("collection-images").createSignedUrls(paths, expiresIn)), [client]);
  useEffect(() => () => cache.clear(), [cache]);
  return <ImageCacheContext.Provider value={cache}>{children}</ImageCacheContext.Provider>;
}

export function PrivateImage({ path, alt = "", eager = false }: { path: string; alt?: string; eager?: boolean }) {
  const cache = useContext(ImageCacheContext);
  const container = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(eager);
  const [signed, setSigned] = useState<(SignedImage & { path: string }) | null>(null);
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (eager || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "200px" });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [eager]);

  useEffect(() => {
    if (!visible || !cache) return;
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setFailed(false);
    const load = async () => {
      try {
        const value = await cache.get(path);
        if (!current) return;
        setSigned({ ...value, path });
        timer = setTimeout(() => void load(), Math.max(1000, value.expiresAt - Date.now() - 60_000));
      } catch {
        if (current) setFailed(true);
      }
    };
    void load();
    return () => { current = false; if (timer) clearTimeout(timer); };
  }, [cache, path, visible, retry]);

  return <span className="private-image" ref={container}>
    {signed?.path === path && !failed ? <Image
      src={signed.url} alt={alt} fill sizes="(max-width: 720px) 50vw, 300px"
      unoptimized loading={eager ? "eager" : "lazy"} decoding="async"
      onError={() => {
        if (retry < 1) { cache?.invalidate(path); setRetry((value) => value + 1); }
        else setFailed(true);
      }}
    /> : <span className="image-placeholder" aria-label={failed ? "照片暂时无法加载，刷新可重试" : "照片加载中"}>{failed ? "照片暂不可用" : ""}</span>}
  </span>;
}
