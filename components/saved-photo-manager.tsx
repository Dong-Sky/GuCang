"use client";

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { PrivateImage } from './private-image';
import { albumSession, movePhoto, type AlbumEntry, type AlbumSession } from '@/lib/images/saved-album';
import type { ImageRow } from '@/lib/collection/types';
import type { ProgressReporter } from '@/lib/images/upload';

export function SavedPhotoManager({ photos, archived, sharedCount, onClose, onSave }: {
  photos: ImageRow[]; archived: ImageRow[]; sharedCount: number; onClose: () => void;
  onSave: (entries: AlbumEntry[], session: AlbumSession, report: ProgressReporter) => Promise<void>;
}) {
  const [entries, setEntries] = useState<AlbumEntry[]>(() => photos.map(row => ({ key: row.id, row, turns: 0 })));
  const [confirm, setConfirm] = useState(false), [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false), [locked, setLocked] = useState(false), [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [recoveryCutoff] = useState(() => Date.now() - 7 * 86400000);
  const session = useRef(albumSession()), urls = useRef<string[]>([]), selecting = useRef(false);
  const target = useRef<string | null>(null), input = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null), drag = useRef<number | null>(null);
  const dirty = entries.length !== photos.length || entries.some((e, i) => e.key !== photos[i]?.id || e.turns !== 0 || Boolean(e.file));
  useEffect(() => { const list = urls.current; return () => list.forEach(url => URL.revokeObjectURL(url)); }, []);
  useEffect(() => { if (!dirty && !busy) return; const guard = (e: BeforeUnloadEvent) => e.preventDefault(); window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty, busy]);
  const close = () => { if (!busy && (!dirty || window.confirm('放弃未保存的照片调整？原照片不会改变。'))) onClose(); };
  const change = (next: AlbumEntry[]) => { if (busy || locked) return; setEntries(next); setConfirm(false); setError(''); };
  const select = async (file?: File) => {
    if (!file || selecting.current || locked || busy) return;
    selecting.current = true; setBusy(true); setError('');
    const replacing = target.current;
    const url = URL.createObjectURL(file);
    try {
      if (!replacing && entries.length >= 3) throw new Error('最多3张，请先移除一张');
      await new Promise<void>((resolve, reject) => {
        const img = new window.Image(), timer = setTimeout(() => reject(new Error('照片读取超时')), 15000);
        img.onload = () => { clearTimeout(timer); resolve(); }; img.onerror = () => { clearTimeout(timer); reject(new Error('照片无法读取，请选择 JPG 或 PNG')); }; img.src = url;
      });
      urls.current.push(url);
      const entry: AlbumEntry = { key: crypto.randomUUID(), file, url, turns: 0 };
      setEntries(replacing ? entries.map(e => e.key === replacing ? entry : e) : [...entries, entry]); setConfirm(false);
    } catch (e) { URL.revokeObjectURL(url); setError(e instanceof Error ? e.message : '读取失败'); }
    finally { selecting.current = false; setBusy(false); }
  };
  const restore = (row: ImageRow) => change([...entries, { key: row.id, row, turns: 0 }]);
  const save = async () => {
    if (busy || (sharedCount > 1 && !acknowledged)) return;
    setBusy(true); setLocked(true); setError('');
    try { await onSave(entries, session.current, progress => setMessage(progress.message)); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : '保存失败，请重试'); setMessage('旧文件仍保留。若提交结果不确定，可重试相同操作；不要重复上传。'); }
    finally { setBusy(false); }
  };
  const hit = (x: number, y: number) => Array.from(grid.current?.children ?? []).findIndex(node => { const b = node.getBoundingClientRect(); return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom; });
  return <section className="saved-photo-manager" aria-label="管理已保存照片" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
    <header><h2>管理照片</h2><button type="button" className="text-button" disabled={busy} onClick={close}>返回详情</button></header>
    <p>第一张为主图，最多3张。调整后需确认保存；旧图可在7天内恢复。</p>
    <p className="album-scope">照片属于款式，共用此款式的 {sharedCount} 件（含回收站）会一起更新；编号、位置及其他资料不变。</p>
    <div ref={grid} className="saved-photo-rows">{entries.map((entry, i) => <div className="saved-photo-row" key={entry.key}>
      <div className="saved-photo-thumb"><div style={{ transform: `rotate(${entry.turns * 90}deg)` }}>{entry.url ? <Image src={entry.url} alt={`照片 ${i + 1}`} fill unoptimized sizes="110px" /> : <PrivateImage path={entry.row!.detail_path} eager />}</div><span>{i === 0 ? '主图' : `照片 ${i + 1}`}</span></div>
      <div className="saved-photo-actions">
        <button type="button" disabled={busy || locked || i === 0} onClick={() => change(movePhoto(entries, i, 0))}>设为主图</button>
        <button type="button" disabled={busy || locked} onClick={() => change(entries.map(e => e.key === entry.key ? { ...e, turns: (e.turns + 1) % 4 } : e))}>旋转90°</button>
        <button type="button" disabled={busy || locked} onClick={() => { target.current = entry.key; input.current?.click(); }}>替换</button>
        <button type="button" disabled={busy || locked} onClick={() => change(entries.filter(e => e.key !== entry.key))}>移除</button>
        <button type="button" aria-label={`照片 ${i + 1} 上移`} disabled={busy || locked || i === 0} onClick={() => change(movePhoto(entries, i, i - 1))}>↑ 上移</button>
        <button type="button" aria-label={`照片 ${i + 1} 下移`} disabled={busy || locked || i === entries.length - 1} onClick={() => change(movePhoto(entries, i, i + 1))}>↓ 下移</button>
        <button type="button" className="album-drag" aria-label={`拖动已保存照片 ${i + 1}`} disabled={busy || locked} onPointerDown={e => { if (busy || locked || !e.isPrimary || e.button !== 0) return; e.preventDefault(); drag.current = i; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={e => { const dest = hit(e.clientX, e.clientY); if (drag.current !== null && dest >= 0) change(movePhoto(entries, drag.current, dest)); drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>⠿ 拖动排序</button>
      </div>
    </div>)}</div>
    <div className="phase-action-row"><button type="button" className="secondary-button" disabled={busy || locked || entries.length >= 3} onClick={() => { target.current = null; camera.current?.click(); }}>拍照添加</button><button type="button" className="secondary-button" disabled={busy || locked || entries.length >= 3} onClick={() => { target.current = null; input.current?.click(); }}>从相册添加</button></div>
    <input ref={input} type="file" accept="image/*" className="photo-input" aria-label="选择管理照片" onChange={e => { void select(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
    <input ref={camera} type="file" accept="image/*" capture="environment" className="photo-input" aria-label="拍摄管理照片" onChange={e => { void select(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
    <small>替换、旋转会生成标准画质的新文件。旧文件仍占用空间，本轮不会永久删除。</small>
    <details className="album-recovery"><summary>最近移除的照片（7天内）</summary>
      {archived.filter(row => row.deleted_at && Date.parse(row.deleted_at) >= recoveryCutoff && !entries.some(e => e.key === row.id)).map(row => <div className="album-recovery-row" key={row.id}><div className="saved-photo-thumb"><PrivateImage path={row.thumbnail_path ?? row.detail_path} /></div><span>{new Date(row.deleted_at!).toLocaleDateString()} 移除</span><button type="button" className="secondary-button" disabled={busy || locked || entries.length >= 3} onClick={() => restore(row)}>恢复到末尾</button></div>)}
      <small>恢复也需要保存。满3张时先移除一张；替换或旋转前的旧图也在这里。超过7天不再提供恢复入口。</small>
    </details>
    {error ? <p role="alert" className="album-error">{error}</p> : null}<p role="status">{message}</p>
    {confirm ? <div className="album-confirm"><p>确认保存 {entries.length} 张照片？{entries.length === 0 ? '将暂时不显示照片。' : '第一张将作为主图。'}被移除或替换的旧图保留7天恢复机会。</p>{sharedCount > 1 ? <label><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />我知道会影响同款的 {sharedCount} 件</label> : null}<div className="phase-action-row"><button type="button" className="primary-button" disabled={busy || (sharedCount > 1 && !acknowledged)} onClick={() => void save()}>{busy ? '正在保存…' : '确认保存照片'}</button><button type="button" className="secondary-button" disabled={busy || locked} onClick={() => setConfirm(false)}>返回调整</button></div></div>
      : <button type="button" className="primary-button wide" disabled={busy || !dirty} onClick={() => setConfirm(true)}>预览并保存照片</button>}
  </section>;
}
