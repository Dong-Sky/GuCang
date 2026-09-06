"use client";
import { createContext, useContext, useEffect, useState, type Dispatch, type SetStateAction } from "react";

export const BrowseScope = createContext("");
export function useBrowseMemory<T>(name: string, fallback: T): [T, Dispatch<SetStateAction<T>>] {
  const scope = useContext(BrowseScope);
  const key = `gucang-browse-v1:${scope}:${name}`;
  const [value, setValue] = useState<T>(() => {
    try { const saved = sessionStorage.getItem(key); return saved ? JSON.parse(saved) : fallback; }
    catch { return fallback; }
  });
  const update: Dispatch<SetStateAction<T>> = (action) => setValue((previous) => {
    const next = typeof action === "function" ? (action as (value: T) => T)(previous) : action;
    try { sessionStorage.setItem(key, JSON.stringify(next)); } catch { /* Memory is optional, browsing must remain available. */ }
    return next;
  });
  return [value, update];
}
export function useBrowseScroll(name: string) {
  const scope = useContext(BrowseScope);
  useEffect(() => {
    const key = `gucang-scroll-v1:${scope}:${name}`;
    let position = 0;
    try { position = Number(sessionStorage.getItem(key)) || 0; } catch {}
    const frame = requestAnimationFrame(() => window.scrollTo({ top: position, behavior: "instant" }));
    const remember = () => { try { sessionStorage.setItem(key, String(window.scrollY)); } catch {} };
    window.addEventListener("scroll", remember, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", remember); };
  }, [scope, name]);
}
