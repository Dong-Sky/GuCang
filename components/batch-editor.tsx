"use client";

import { useRef, useState } from "react";
import type { ItemView, Workspace } from "@/lib/collection/types";
import { inventoryCode, itemTitle, matchesItemSearch } from "@/lib/collection/inventory";
import { locationPath } from "@/lib/collection/model";
import { BATCH_LIMIT, batchEligibility, matchesMissing, type BatchAction, type BatchField, type BatchResult, type MissingFilter } from "@/lib/collection/batch";
import { Paginated } from "./paginated";

export type BatchRunner = (ids: string[], action: BatchAction, report: (result: BatchResult) => void, cancelled: () => boolean, approvedIds: string[]) => Promise<void>;
const names: Record<BatchField, string> = { ip: "补 IP", category: "补品类", series: "补系列", character: "补角色", location: "补位置", return: "归位到各自默认位置" };
export function MissingSelect({ value, onChange }: { value: MissingFilter; onChange: (value: MissingFilter) => void }) {
  return <select aria-label="按缺失资料筛选" value={value} onChange={(e) => onChange(e.target.value as MissingFilter)}><option value="">全部资料状态</option>{["IP", "品类", "位置", "照片"].map((field) => <option key={field} value={field}>缺{field}</option>)}</select>;
}

export function BatchEditor({ items, workspace, onClose, onRun }: { items: ItemView[]; workspace: Workspace; onClose: () => void; onRun: BatchRunner }) {
  const [candidates] = useState(items);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [missing, setMissing] = useState<MissingFilter>("");
  const [action, setAction] = useState<BatchAction>({ field: "category", value: "" });
  const [confirming, setConfirming] = useState(false);
  const [results, setResults] = useState<Record<string, BatchResult>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const stop = useRef(false), running = useRef(false);
  const filtered = candidates.filter((item) => matchesItemSearch(item, search) && matchesMissing(item, missing));
  const chosen = candidates.filter((item) => selected.has(item.instance.id));
  const planned = chosen.map((item) => ({ item, reason: batchEligibility(workspace.items.find((row) => row.instance.id === item.instance.id) ?? item, action, workspace, selected) }));
  const available = action.field === "ip" ? workspace.ips : action.field === "category" ? workspace.categories : action.field === "series" ? workspace.series : action.field === "character" ? workspace.characters : workspace.locations;
  const summary = action.field === "return" ? names.return : `${names[action.field]}：${action.field === "location" ? locationPath(action.value, workspace.locations) : available.find((row) => row.id === action.value)?.name ?? "未选择"}`;
  const start = async (ids: string[]) => {
    if (running.current) return;
    running.current = true; stop.current = false; setBusy(true); setMessage("");
    try { await onRun(ids, action, (result) => setResults((previous) => ({ ...previous, [result.id]: result })), () => stop.current, [...selected]); }
    catch (error) { setMessage(error instanceof Error ? error.message : "批量操作中断，请核对结果"); }
    finally { running.current = false; setBusy(false); }
  };
  const toggle = (id: string) => setSelected((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else if (next.size < BATCH_LIMIT) next.add(id);
    return next;
  });
  const failed = Object.values(results).filter((row) => row.state === "failed");
  const pending = chosen.filter((item) => !results[item.instance.id]);
  const started = Object.keys(results).length > 0 || busy;
  return <div className="sheet-backdrop"><section className="batch-sheet" role="dialog" aria-modal="true" aria-labelledby="batch-title">
    <div className="batch-header"><h2 id="batch-title">批量整理</h2><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>关闭</button></div>
    {!confirming ? <>
      <p className="form-hint">每次最多 {BATCH_LIMIT} 件，只补空白，不覆盖已填资料。没有批量删除。</p>
      <input aria-label="搜索批量收藏" placeholder="搜索 IP、编号、位置" value={search} onChange={(e) => { setSearch(e.target.value); setSelected(new Set()); }} />
      <MissingSelect value={missing} onChange={(value) => { setMissing(value); setSelected(new Set()); }} />
      <div className="batch-selection-count" role="status">已选 {selected.size} / {BATCH_LIMIT} 件<button className="text-button" type="button" onClick={() => setSelected(new Set())}>清空选择</button></div>
      <Paginated items={filtered} itemKey={(item) => item.instance.id} label="批量选择">{(visible) => <><button type="button" className="secondary-button" onClick={() => setSelected((previous) => new Set([...previous, ...visible.map((item) => item.instance.id)].slice(0, BATCH_LIMIT)))}>选择本页</button><div className="batch-rows">{visible.map((item) => <label className="batch-row" key={item.instance.id}><input type="checkbox" aria-label={`选择 ${inventoryCode(item)}`} checked={selected.has(item.instance.id)} disabled={!selected.has(item.instance.id) && selected.size >= BATCH_LIMIT} onChange={() => toggle(item.instance.id)} /><span><strong>{itemTitle(item)}</strong><small>{inventoryCode(item)} · {item.ip?.name ?? "未分类"} · {item.path}</small></span></label>)}</div></>}</Paginated>
      {!filtered.length ? <p>没有匹配的收藏</p> : null}
      <div className="batch-action-fields"><label>操作<select value={action.field} onChange={(e) => setAction({ field: e.target.value as BatchField, value: "" })}>{Object.entries(names).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{action.field !== "return" ? <label>填入内容<select aria-label="批量填入内容" value={action.value} onChange={(e) => setAction({ ...action, value: e.target.value })}><option value="">请选择</option>{available.filter((row) => !row.deleted_at).map((row) => <option key={row.id} value={row.id}>{action.field === "location" ? locationPath(row.id, workspace.locations) : `${row.name}${"ip_id" in row && row.ip_id ? ` · ${workspace.ips.find((ip) => ip.id === row.ip_id)?.name ?? ""}` : ""}`}</option>)}</select></label> : null}</div>
      <p className="form-hint">IP、品类、角色、系列从已有资料中选择；新内容可先通过单件录入建立。</p>
      <button className="primary-button" type="button" disabled={!selected.size || (action.field !== "return" && !action.value)} onClick={() => setConfirming(true)}>预览修改</button>
    </> : <>
      <h3>{summary}</h3><p>已选 {chosen.length} 件。{!started ? `预计修改 ${planned.filter((row) => !row.reason).length} 件，跳过 ${planned.filter((row) => row.reason).length} 件。` : `已完成 ${Object.values(results).filter((row) => row.state === "done").length} 件，失败 ${failed.length} 件，未处理 ${pending.length} 件。`}</p>
      <p className="form-hint">逐件处理，不是一笔整体事务；中途停止会保留已完成结果。照片、编号和其他字段不变。</p>
      <div className="batch-rows" aria-live="polite">{planned.map(({ item, reason }) => <div className="batch-result" key={item.instance.id}><strong>{inventoryCode(item)} · {itemTitle(item)}</strong><small>{results[item.instance.id]?.message ?? reason ?? (busy ? "等待处理" : "将更新")}</small></div>)}</div>
      {message ? <p role="alert">{message}</p> : null}
      <div className="phase-action-row">{!started ? <><button className="secondary-button" type="button" onClick={() => setConfirming(false)}>返回调整</button><button className="primary-button" type="button" disabled={!planned.some((row) => !row.reason)} onClick={() => void start([...selected])}>确认执行</button></> : busy ? <button className="secondary-button" type="button" onClick={() => { stop.current = true; setMessage("将完成当前一件后停止"); }}>停止后续操作</button> : <><button className="secondary-button" type="button" onClick={() => { setConfirming(false); setResults({}); setSelected(new Set()); }}>选择其他收藏</button>{failed.length || pending.length ? <button className="primary-button" type="button" onClick={() => void start([...failed.map((row) => row.id), ...pending.map((item) => item.instance.id)])}>重试未完成项</button> : <button className="primary-button" type="button" onClick={onClose}>完成</button>}</>}</div>
    </>}
  </section></div>;
}
