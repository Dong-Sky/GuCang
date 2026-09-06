"use client";

import Image from "next/image";
import { useRef, useState, type ChangeEvent } from "react";
import { CameraIcon, ImageIcon, XIcon } from "./icons";
import { PhotoGallery } from "./photo-gallery";

export function PhotoPicker({ files, previewUrls, idPrefix, onFilesSelected, onRemove, disabled = false, existingCount = 0, onChecking }: { files: File[]; previewUrls: string[]; idPrefix: string; onFilesSelected: (files: File[]) => void; onRemove: (index: number) => void; disabled?: boolean; existingCount?: number; onChecking: (checking: boolean) => void }) {
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const selecting = useRef(false);
  const signature = async (file: File) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())), byte => byte.toString(16).padStart(2, "0")).join("");
  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!selected.length || selecting.current) return;
    selecting.current = true; setChecking(true); onChecking(true); setMessage("");
    const accepted: File[] = [], notices: string[] = [];
    try {
      const seen = new Set<string>();
      for (const file of files) seen.add(await signature(file));
      for (const file of selected) {
        const key = await signature(file);
        if (seen.has(key)) { notices.push(`${file.name} 已选择，未重复添加`); continue; }
        if (files.length + accepted.length + existingCount >= 3) { notices.push("最多3张，超出的照片未添加"); break; }
        const url = URL.createObjectURL(file);
        try {
          await new Promise<void>((resolve, reject) => {
            const image = new window.Image();
            const timer = setTimeout(() => { image.src = ""; reject(new Error("读取超时")); }, 15000);
            image.onload = () => { clearTimeout(timer); resolve(); };
            image.onerror = () => { clearTimeout(timer); reject(new Error("无法读取")); };
            image.src = url;
          });
          accepted.push(file); seen.add(key);
        } catch { notices.push(`${file.name} 无法读取，请改选 JPG、PNG 或可读取的图片`); }
        finally { URL.revokeObjectURL(url); }
      }
      if (accepted.length) onFilesSelected(accepted);
      setMessage([...new Set(notices)].join("；"));
    } catch { setMessage("读取照片失败，请重新选择。"); }
    finally { selecting.current = false; setChecking(false); onChecking(false); }
  };
  const locked = disabled || checking;
  return <div className="photo-drop">
    <div className="photo-heading"><strong>照片</strong><span>{files.length + existingCount} / 3</span></div>
    {previewUrls.length > 0 && <div className="photo-previews" aria-label="照片预览">{previewUrls.map((url, index) => <div className="photo-preview" key={url}>
      <button type="button" className="photo-open" aria-label={`预览新照片 ${index + 1}`} onClick={() => setViewing(index)}><Image src={url} alt={files[index]?.name ?? `照片 ${index + 1}`} fill unoptimized sizes="120px" /></button>
      <span className="photo-number">{existingCount === 0 && index === 0 ? "主图" : `照片 ${index + existingCount + 1}`}</span>
      <button className="photo-remove" type="button" disabled={locked} aria-label={`移除新照片 ${index + 1}`} onClick={() => { onRemove(index); setMessage(""); }}><XIcon size={18} /></button>
    </div>)}</div>}
    <div className="photo-source-actions">
      <button className="photo-source-button" type="button" disabled={locked || files.length + existingCount >= 3} onClick={() => document.getElementById(`${idPrefix}-camera`)?.click()}><CameraIcon size={22} />拍照</button>
      <button className="photo-source-button" type="button" disabled={locked || files.length + existingCount >= 3} onClick={() => document.getElementById(`${idPrefix}-gallery`)?.click()}><ImageIcon size={22} />从相册选择</button>
    </div>
    <small role="status">{checking ? "正在检查照片…" : message || (disabled ? "部分照片已上传，照片选择暂时锁定。请重试保存以完成剩余上传。" : files.length + existingCount >= 3 ? "已选满3张；可移除新选照片后重新添加。" : existingCount ? `保留已有 ${existingCount} 张照片，新照片追加保存。` : "第一张用作主图，点击照片可查看完整画面。")}</small>
    <input id={`${idPrefix}-camera`} className="photo-input" type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true" disabled={locked} onChange={handleChange} />
    <input id={`${idPrefix}-gallery`} className="photo-input" type="file" accept="image/*,.heic,.heif" multiple tabIndex={-1} aria-hidden="true" disabled={locked} onChange={handleChange} />
    {viewing !== null && previewUrls[viewing] && <div className="local-photo-view"><PhotoGallery key={previewUrls[viewing]} photos={[{ id: previewUrls[viewing], path: previewUrls[viewing], local: true, name: files[viewing]?.name }]} /><button type="button" onClick={() => setViewing(null)}>关闭预览</button></div>}
  </div>;
}
