"use client";

import { useEffect, useState, type ReactNode } from "react";
import { readDraft, writeDraft, type ItemDraft } from "@/lib/collection/drafts";

export function ItemDraftGate({ storageKey, children }: { storageKey: string; children: (draft: ItemDraft | undefined) => ReactNode }) {
  const [state, setState] = useState<{ ready: boolean; draft?: ItemDraft; error?: string }>({ ready: false });
  const [accepted, setAccepted] = useState(false);
  useEffect(() => {
    let live = true;
    readDraft(storageKey).then((draft) => { if (live) setState({ ready: true, draft }); })
      .catch(() => { if (live) setState({ ready: true, error: "无法读取本地草稿。浏览器可能禁用了存储，关闭前请确认资料已保存。" }); });
    return () => { live = false; };
  }, [storageKey]);
  if (!state.ready || (state.draft && !accepted)) return <div className="sheet-backdrop"><section className="draft-recovery-card" role="dialog" aria-modal="true" aria-label="本地草稿">
    {!state.ready ? <p role="status">正在检查本地草稿…</p> : <><h2>继续上次未保存的内容？</h2><p>已在本机保留文字、照片和排序，尚未完成入库。</p><div className="phase-action-row draft-recovery-actions"><button type="button" className="primary-button" onClick={() => setAccepted(true)}>继续草稿</button><button type="button" className="secondary-button" onClick={async () => {
      if (!window.confirm("放弃本地草稿？此操作不会删除已经入库的资料或照片。")) return;
      try { await writeDraft(storageKey); setState({ ready: true }); } catch { setState((s) => ({ ...s, error: "无法清除草稿，请重试" })); }
    }}>放弃草稿，重新填写</button></div></>}{state.error ? <p role="alert">{state.error}</p> : null}
  </section></div>;
  return <>{state.error ? <p role="alert">{state.error}</p> : null}{children(state.draft)}</>;
}
