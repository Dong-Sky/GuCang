"use client";
import { useState } from "react";
import type { SupabaseClient, Workspace } from "@/lib/collection/types";
type Kind = "ips" | "characters" | "categories" | "series";
type Plan = { token: string; instances: number; active: number; styles: number; children: number; series: number; source: string; target: string };
export function DictionaryManager({ client, workspace, onDone }: { client: SupabaseClient; workspace: Workspace; onDone: () => Promise<boolean> }) {
  const [kind, setKind] = useState<Kind>("ips"), [source, setSource] = useState("");
  const [action, setAction] = useState("rename"), [name, setName] = useState(""), [aliases, setAliases] = useState(""), [target, setTarget] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const rows = workspace[kind], row = rows.find(r => r.id === source);
  const choose = (id: string) => { const r = rows.find(v => v.id === id); setSource(id); setName(r?.name ?? ""); setAliases((r?.aliases ?? []).join("\n")); setTarget(""); setPlan(null); setMessage(""); };
  const label = (r: typeof rows[number]) => r.name + ("ip_id" in r ? ` · ${workspace.ips.find(i => i.id === r.ip_id)?.name ?? "未关联 IP"}` : "");
  const run = async (preview: boolean) => {
    if (busy) return; setBusy(true); setMessage("");
    try {
      const { data, error } = await client.rpc("manage_dictionary", { p_household: workspace.household.id, p_kind: kind, p_source: source, ...(action === "merge" ? { p_target: target } : { p_name: name.trim(), p_aliases: aliases.split("\n").map(v => v.trim()).filter(Boolean) }), p_preview: preview, ...(!preview && plan ? { p_expected: plan.token } : {}) });
      if (error) throw error;
      if (preview) setPlan(data as unknown as Plan);
      else { setPlan(null); setSource(""); const refreshed = await onDone(); setMessage(refreshed ? "资料已更新，收藏和编号保持不变。" : "资料已保存，但刷新失败，请刷新页面后继续。"); }
    } catch (e) { setPlan(null); setMessage((e as { message?: string }).message ?? "操作失败，请刷新后重新预览；不要反复点击确认。"); }
    finally { setBusy(false); }
  };
  return <section className="dictionary-manager"><details><summary>资料整理 · 改名、别名与合并</summary>
    <p className="form-hint">全谷仓统一调整，包含回收站收藏。只整理关联，不合并谷子、不改变编号或图片。</p>
    <fieldset disabled={busy} onChange={() => setPlan(null)} className="find-grid">
      <label>资料类型<select aria-label="资料类型" value={kind} onChange={e => { setKind(e.target.value as Kind); setSource(""); setTarget(""); setPlan(null); }}><option value="ips">IP</option><option value="characters">角色</option><option value="categories">品类</option><option value="series">系列</option></select></label>
      <label>要整理的资料<select aria-label="要整理的资料" value={source} onChange={e => choose(e.target.value)}><option value="">请选择</option>{rows.map(r => <option value={r.id} key={r.id}>{label(r)}</option>)}</select></label>
      {row ? <><label>操作<select aria-label="整理操作" value={action} onChange={e => { setAction(e.target.value); setPlan(null); }}><option value="rename">改名或维护别名</option><option value="merge">合并误写资料</option></select></label>
      {action === "rename" ? <><label>统一名称<input value={name} maxLength={120} onChange={e => setName(e.target.value)} /></label><label>搜索别名（每行一个）<textarea value={aliases} rows={3} onChange={e => setAliases(e.target.value)} /></label></> : <label>合并到<select aria-label="合并到" value={target} onChange={e => setTarget(e.target.value)}><option value="">请选择保留的资料</option>{rows.filter(r => r.id !== row.id && (!("ip_id" in row) || ("ip_id" in r && r.ip_id === row.ip_id))).map(r => <option key={r.id} value={r.id}>{label(r)}</option>)}</select></label>}</> : null}
    </fieldset>
    {source ? <button className="secondary-button" type="button" disabled={busy || (action === "merge" ? !target : !name.trim())} onClick={() => void run(true)}>{busy ? "正在处理…" : "预览影响范围"}</button> : null}
    {plan ? <div className="dictionary-confirm" role="region" aria-label="资料整理确认"><strong>{plan.source} → {plan.target}</strong><p>影响 {plan.instances} 件（使用中 {plan.active} 件，回收站 {plan.instances - plan.active} 件），{plan.styles} 个款式。</p>{kind === "ips" && action === "merge" ? <p>同时迁移 {plan.children} 个角色、{plan.series} 个系列；同名角色不会自动合并。</p> : null}<p>旧名称保留为别名。合并后原分类不再显示；请确认目标正确。</p><div className="phase-action-row"><button type="button" className="primary-button" disabled={busy} onClick={() => void run(false)}>确认更新资料</button><button type="button" className="secondary-button" disabled={busy} onClick={() => setPlan(null)}>取消</button></div></div> : null}
    {message ? <p role="status">{message}</p> : null}
  </details></section>;
}
