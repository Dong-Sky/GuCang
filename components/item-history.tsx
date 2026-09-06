"use client";
import { useEffect, useState } from "react";
import type { SupabaseClient, MovementRow, LocationRow } from "@/lib/collection/types";
import { locationPath } from "@/lib/collection/model";

const labels = { stored: "已收纳", temporarily_out: "临时取出", displayed: "展示中", unknown: "待确认" };
export function ItemHistory({ client, householdId, instanceId, locations }: { client: SupabaseClient; householdId: string; instanceId: string; locations: LocationRow[] }) {
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setBusy(true); setError("");
    (async () => {
      const result = await client.from("movement_events").select("*").eq("household_id", householdId).eq("item_instance_id", instanceId).order("created_at", { ascending: false }).order("id").range(page * 10, page * 10 + 10);
      if (result.error) throw result.error;
      const visible = result.data.slice(0, 10);
      const actors = [...new Set(visible.map((row) => row.actor_id))];
      const profiles = actors.length ? await client.from("profiles").select("id,display_name").in("id", actors) : null;
      if (!live) return;
      setRows(visible); setHasMore(result.data.length > 10);
      setNames(Object.fromEntries((profiles?.data ?? []).map((profile) => [profile.id, profile.display_name ?? "家庭成员"])));
    })().catch(() => { if (live) setError("记录加载失败，请重试"); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [client, householdId, instanceId, page, retry]);
  const place = (id: string | null) => id && !locations.some((row) => row.id === id) ? "已删除或不可访问的位置" : locationPath(id, locations);
  return <section className="item-history"><h3>移动记录</h3>{busy ? <p role="status">正在读取…</p> : error ? <p role="alert">{error}<button className="text-button" onClick={() => setRetry((v) => v + 1)}>重试</button></p> : <>
    {!rows.length ? <p>暂无移动记录</p> : rows.map((row) => <div className="movement-history-row" key={row.id}><strong>{labels[row.from_status ?? "unknown"]} → {labels[row.to_status ?? "unknown"]}</strong><p>{place(row.from_location_id)} → {place(row.to_location_id)}</p><small>{names[row.actor_id] ?? "家庭成员"} · {new Date(row.created_at).toLocaleString("zh-CN")}</small>{row.note ? <p>{row.note}</p> : null}</div>)}
    <div className="phase-action-row history-page-actions"><button type="button" className="secondary-button" disabled={!page} onClick={() => setPage((v) => v - 1)}>较新记录</button><button type="button" className="secondary-button" disabled={!hasMore} onClick={() => setPage((v) => v + 1)}>更早记录</button></div>
  </>}</section>;
}
