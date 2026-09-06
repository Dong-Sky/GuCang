"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { PrivateImage } from "./private-image";

export type GalleryPhoto = { id: string; path: string; local?: boolean; name?: string };

export function PhotoGallery({ photos, compact = false }: { photos: GalleryPhoto[]; compact?: boolean }) {
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const index = Math.min(selected, Math.max(0, photos.length - 1));
  const current = photos[index];
  const change = (direction: number) => setSelected((index + direction + photos.length) % photos.length);
  const renderPhoto = (photo: GalleryPhoto) => photo.local
    ? <Image src={photo.path} alt={photo.name ?? "照片"} fill unoptimized sizes="(max-width: 720px) 90vw, 560px" />
    : <PrivateImage key={photo.path} path={photo.path} alt={photo.name ?? "收藏照片"} eager />;
  if (!current) return <div className="gallery-empty">暂无照片</div>;
  return <div className={`photo-gallery${compact ? " compact" : ""}${expanded ? " expanded" : ""}`}
    role={expanded ? "dialog" : undefined} aria-modal={expanded || undefined} aria-label={expanded ? "查看大图" : "收藏照片"}
    onKeyDown={(event) => {
      if (event.key === "Escape" && expanded) { event.stopPropagation(); setExpanded(false); }
      if (event.key === "ArrowLeft") { event.preventDefault(); change(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); change(1); }
    }}>
    <button type="button" className="gallery-main" aria-label={expanded ? "缩小照片" : "放大照片"}
      onPointerDown={(event) => { swiped.current = false; start.current = event.clientX > 32 ? { x: event.clientX, y: event.clientY } : null; }}
      onPointerCancel={() => { start.current = null; swiped.current = true; }}
      onPointerUp={(event) => {
        const from = start.current; start.current = null;
        if (!from) return;
        const dx = event.clientX - from.x, dy = event.clientY - from.y;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5 && photos.length > 1) { swiped.current = true; change(dx < 0 ? 1 : -1); }
      }}
      onClick={() => { if (!swiped.current) setExpanded(!expanded); }}>
      {renderPhoto(current)}
    </button>
    {photos.length > 1 && <div className="gallery-controls"><button type="button" aria-label="上一张照片" onClick={() => change(-1)}>‹</button><span aria-live="polite">{index + 1} / {photos.length}</span><button type="button" aria-label="下一张照片" onClick={() => change(1)}>›</button></div>}
    {photos.length > 1 && <div className="gallery-thumbnails">{photos.map((photo, i) => <button type="button" key={photo.id} aria-label={`查看照片 ${i + 1}`} aria-pressed={i === index} onClick={() => setSelected(i)}>{renderPhoto(photo)}</button>)}</div>}
    {expanded && <button type="button" className="gallery-close" onClick={() => setExpanded(false)}>关闭大图</button>}
  </div>;
}
