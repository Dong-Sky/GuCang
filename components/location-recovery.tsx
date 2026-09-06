"use client";
import { useEffect, useState } from "react";
import type { LocationRow, SupabaseClient } from "@/lib/collection/types";
import { readAllPages } from "@/lib/collection/pagination";
import { Paginated } from "./paginated";

export function LocationRecovery({ client, householdId, onRestored }: { client: SupabaseClient; householdId: string; onRestored: () => Promise<unknown> }) {
  const [rows, setRows] = useState<LocationRow[]>([]);
  const [message, setMessage] = useState("正在读取已删除位置…");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    readAllPages((from, to) => client.from("locations").select("*", { count: "exact" }).eq("household_id", householdId).not("deleted_at", "is", null).order("id").range(from, to))
      .then((data) => { if (live) { setRows(data); setMessage(""); } })
      .catch(() => { if (live) setMessage("无法读取已删除位置，请重试"); });
    return () => { live = false; };
  }, [client, householdId, version]);
  const restore = async (row: LocationRow) => {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      if (row.parent_id) {
        const parent = await client.from("locations").select("id,deleted_at").eq("household_id", householdId).eq("id", row.parent_id).maybeSingle();
        if (parent.error) throw parent.error;
        if (!parent.data || parent.data.deleted_at) throw new Error("请先恢复上级位置，再恢复这个子位置");
      }
      const result = await client.from("locations").update({ deleted_at: null }).eq("household_id", householdId).eq("id", row.id).select("id").single();
      if (result.error) throw result.error;
      setRows((current) => current.filter((entry) => entry.id !== row.id));
      setMessage("位置已恢复，原层级保持不变");
      await onRestored();
    } catch (error) { setMessage(error instanceof Error ? error.message : "恢复失败，请检查连接后重试"); }
    finally { setBusy(false); }
  };
  return <section className="settings-card location-recovery-card"><h2>已删除位置</h2><p className="settings-note">恢复到原来的上级位置；不会移动或删除收藏。位置目前不会自动永久清除。</p>
    {message ? <p role="status">{message}</p> : null}
    <Paginated items={rows} itemKey={(row) => row.id} label="已删除位置">{(visible) => visible.map((row) => <div className="settings-row" key={row.id}><span>{row.name}</span><button className="text-button" disabled={busy} onClick={() => void restore(row)}>恢复位置</button></div>)}</Paginated>
    {!message && !rows.length ? <p>没有已删除位置</p> : null}<div className="recovery-footer"><button type="button" className="secondary-button" disabled={busy} onClick={() => setVersion((v) => v + 1)}>重新检查</button></div>
  </section>;
}
