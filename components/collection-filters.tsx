"use client";
import type { ItemView, Workspace } from "@/lib/collection/types";
import { emptyFind, type FindOptions } from "@/lib/collection/find";
export function CollectionFilters({ items, value, onChange, references }: { items: ItemView[]; value: FindOptions; onChange: (value: FindOptions) => void; references?: Workspace }) {
  const options = (key: "ip" | "category" | "series" | "character") => [...new Map((references ? key === "ip" ? references.ips : key === "category" ? references.categories : key === "series" ? references.series : references.characters : items.flatMap<{ id: string; name: string; ip_id?: string | null }>(i => key === "character" ? i.characters : i[key] ? [i[key]!] : [])).filter(r => !(key === "character" || key === "series") || !value.ip || ('ip_id' in r && r.ip_id === value.ip)).map(r => [r.id, r.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], "zh-CN"));
  const count = [value.ip, value.category, value.status, value.character, value.series].filter(Boolean).length;
  return <details className="collection-filters"><summary>筛选与排序{count ? ` · ${count} 项筛选` : ""}{value.sort !== "newest" ? " · 已调整排序" : ""}</summary>
    <div className="find-grid">{([['ip', 'IP'], ['category', '品类'], ['character', '角色'], ['series', '系列']] as const).map(([key, label]) => <label key={key}>{label}<select aria-label={`筛选${label}`} value={value[key]} onChange={e => onChange({ ...value, [key]: e.target.value, ...(key === "ip" ? { character: "", series: "" } : {}) })}><option value="">全部{label}</option>{options(key).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>)}
      <label>状态<select aria-label="筛选状态" value={value.status} onChange={e => onChange({ ...value, status: e.target.value })}><option value="">全部状态</option><option value="stored">已收纳</option><option value="temporarily_out">临时取出</option><option value="displayed">展示中</option><option value="unknown">待确认</option></select></label>
      <label>排序<select aria-label="收藏排序" value={value.sort} onChange={e => onChange({ ...value, sort: e.target.value })}><option value="newest">最近入库</option><option value="oldest">最早入库</option><option value="updated">最近修改</option></select></label>
    </div><button type="button" className="text-button" onClick={() => onChange({ ...emptyFind })}>重置组合筛选与排序</button></details>;
}
