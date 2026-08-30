import type { ImageQuality } from "@/lib/images/compression";
import type { SaveProgress } from "@/lib/images/upload";

export function PhotoQuality({ value, onChange, disabled = false }: { value: ImageQuality; onChange: (value: ImageQuality) => void; disabled?: boolean }) {
  return <label className="photo-quality"><span>新照片画质</span>
    <select aria-label="新照片画质" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as ImageQuality)}>
      <option value="standard">标准画质（推荐）</option>
      <option value="high">高清画质（保留更多细节）</option>
    </select>
    <small>只影响这次选择的新照片，已有照片保持原样。复杂图片体积会稍大。</small>
  </label>;
}

export function SaveProgressView({ progress }: { progress: SaveProgress | null }) {
  if (!progress) return null;
  const stages = ["compress", "save", "upload", "refresh"] as const;
  const labels = ["处理照片", "保存资料", "上传照片", "更新列表"];
  const current = stages.indexOf(progress.stage);
  return <div className="save-progress" role="status" aria-live="polite" aria-atomic="true">
    <strong>{progress.message}</strong>
    <ol aria-label="保存阶段">{stages.map((stage, index) => <li key={stage} className={index <= current ? "reached" : ""} aria-current={index === current ? "step" : undefined}>{labels[index]}</li>)}</ol>
    <small>请保持页面打开；上传失败后可重试，不会重复新增这一件。</small>
  </div>;
}
