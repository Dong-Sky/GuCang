"use client";

import { useRef, type ReactNode } from "react";
import { useBrowseMemory } from "./browse-memory";
import { DISPLAY_PAGE_SIZE, pageSlice } from "@/lib/collection/pagination";

export function Paginated<T>({ items, itemKey, children, label = "收藏列表", pageSize = DISPLAY_PAGE_SIZE }: {
  items: T[]; itemKey: (item: T) => string; children: (visibleItems: T[]) => ReactNode; label?: string; pageSize?: number;
}) {
  const signature = items.map(itemKey).join("|");
  const [selection, setSelection] = useBrowseMemory(`page:${label}`, { signature, page: 1 });
  const anchor = useRef<HTMLDivElement>(null);
  const result = pageSlice(items, signature === selection.signature ? selection.page : 1, pageSize);
  const go = (page: number) => {
    setSelection({ signature, page });
    anchor.current?.scrollIntoView({ behavior: "auto", block: "start" });
  };
  return <div className="paged-results" ref={anchor}>
    {children(result.items)}
    {result.pageCount > 1 ? <nav className="pagination" aria-label={`${label}分页`}>
      <p aria-live="polite">第 {result.from}–{result.to} 项，共 {result.total} 项</p>
      <div className="pagination-controls"><button type="button" disabled={result.page === 1} onClick={() => go(result.page - 1)}>上一页</button><span>{result.page} / {result.pageCount}</span><button type="button" disabled={result.page === result.pageCount} onClick={() => go(result.page + 1)}>下一页</button></div>
    </nav> : null}
  </div>;
}
