"use client";

import JSZip from "jszip";
import Image from "next/image";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient, Household, LocationRow, IpRow, CategoryRow, SeriesRow, ItemView, Workspace } from "@/lib/collection/types";
import { readAllPages } from "@/lib/collection/pagination";
import { loadWorkspace, loadStylePatch } from "@/lib/collection/api";
import { applyStylePatch, buildWorkspace, locationPath, upsertRows } from "@/lib/collection/model";
import { inventoryCode, itemTitle, isIncompleteItem, missingItemFields, matchesItemSearch } from "@/lib/collection/inventory";
import { newSaveSession, saveItem, saveLocationRecord, type SaveSession, type ItemFormValues, type LocationFormValues } from "@/lib/collection/save";
import type { ImageQuality } from "@/lib/images/compression";
import type { ProgressReporter, SaveProgress } from "@/lib/images/upload";
import { PrivateImage, PrivateImageProvider } from "@/components/private-image";
import { Paginated } from "@/components/paginated";
import { PageHeader } from "@/components/page-header";
import { PhotoQuality, SaveProgressView } from "@/components/save-progress";
import { Brand, BrandMark } from "@/components/brand";
import { HomeIcon, StarIcon, ArchiveIcon, ClipboardTextIcon, SearchIcon, MapPinIcon, CubeIcon, PlusIcon, CaretRightIcon, CaretLeftIcon, CaretDownIcon, CameraIcon, ImageIcon, UserCircleIcon, ArrowClockwiseIcon, GearSixIcon, CheckCircleIcon, WarningCircleIcon, InfoIcon, XIcon, DotsThreeIcon } from "@/components/icons";
import { buildLocationIndex, compactLocationPath } from "@/lib/collection/locations";
import { resolveStartupSurface, type WorkspaceStatus } from "@/lib/startup";

type NavKey = "home" | "collection" | "locations" | "tasks" | "settings";
type AppHistoryState = {
  gucang: true;
  role: "guard" | "app";
  nav: NavKey;
  overlay: "item" | "itemForm" | "locationForm" | null;
  itemId?: string;
  locationId?: string | null;
  locationFormId?: string;
  collectionIpId?: string | null;
  collectionCharacterId?: string | null;
  locationItems?: boolean;
  taskTab?: "draft" | "out" | "trash";
  search?: string;
};
type PhysicalStatus = Database["public"]["Enums"]["physical_status"];
type FeedbackTone = "success" | "error" | "info";
type Feedback = { message: string; tone: FeedbackTone };

const navItems = [
  { id: "home" as const, label: "首页", icon: HomeIcon },
  { id: "collection" as const, label: "收藏", icon: StarIcon },
  { id: "locations" as const, label: "位置", icon: ArchiveIcon },
  { id: "tasks" as const, label: "待办", icon: ClipboardTextIcon },
];

const locationTypes = ["房间", "柜子", "层板", "抽屉", "收纳箱", "收纳册", "页码", "分区", "展示位置", "其他"];
const EMPTY_ITEMS: ItemView[] = [];
const statusLabels: Record<PhysicalStatus, string> = {
  stored: "已收纳",
  temporarily_out: "临时取出",
  displayed: "展示中",
  unknown: "待确认",
};

function errorMessage(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : "操作失败，请稍后再试";
  if (/email not confirmed/i.test(message)) return "邮箱还没有完成确认，请先打开最新的确认邮件。";
  if (/redirect url|redirect_uri|url not allowed/i.test(message)) return "邮箱确认地址尚未配置，请联系管理员检查 Supabase 的 Redirect URLs。";
  if (/over_email_send_rate_limit|too many requests|after \d+ seconds/i.test(message)) return "确认邮件发送得太频繁，请等待约 1 分钟后再试。";
  if (/row-level security|permission denied|请先登录|登录会话/i.test(message)) return "登录会话已失效或权限尚未生效，请刷新页面后重新登录。";
  if (/source image could not be decoded|image could not be decoded|decode/i.test(message)) return "这张图片无法读取，请尝试从相册重新选择，或先转换为 JPG/PNG 后重试。";
  if (error instanceof Error || typeof error === "string" || (error && typeof error === "object" && "message" in error)) return message;
  return "操作失败，请稍后再试";
}

function safeDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  return [columns.map(csvEscape).join(","), ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))].join("\n");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function hashToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function newInviteToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function PhotoPicker({ files, previewUrls, idPrefix, onFilesSelected, onRemove, disabled = false, existingCount = 0 }: { files: File[]; previewUrls: string[]; idPrefix: string; onFilesSelected: (files: File[]) => void; onRemove: (index: number) => void; disabled?: boolean; existingCount?: number }) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (selected.length) onFilesSelected(selected);
  };
  return <div className="photo-drop">
    <div className="photo-heading"><strong>照片</strong><span>{files.length + existingCount} / 3</span></div>
    <div className={files.length ? "photo-picker-body has-photos" : "photo-picker-body"}>
      {previewUrls.length ? <div className="photo-previews" aria-label="照片预览">{previewUrls.map((url, index) => <div className="photo-preview" key={url}><Image src={url} alt={files[index]?.name ?? `照片 ${index + 1}`} fill unoptimized sizes="140px" /><button type="button" disabled={disabled} aria-label={`移除新照片 ${index + 1}`} onClick={() => onRemove(index)}><XIcon size={18} /></button></div>)}</div> : null}
      <div className="photo-source-actions" aria-disabled={disabled || files.length + existingCount >= 3}>
        <button className="photo-source-button" type="button" disabled={disabled || files.length + existingCount >= 3} onClick={() => document.getElementById(`${idPrefix}-camera`)?.click()}><CameraIcon size={22} />拍照</button>
        <button className="photo-source-button" type="button" disabled={disabled || files.length + existingCount >= 3} onClick={() => document.getElementById(`${idPrefix}-gallery`)?.click()}><ImageIcon size={22} />从相册选择</button>
      </div>
    </div>
    {disabled ? <small>已开始上传，失败后可直接重试保存。</small> : existingCount ? <small>已保留原有 {existingCount} 张照片，新照片会追加保存。</small> : null}
    <input id={`${idPrefix}-camera`} className="photo-input" type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true" disabled={disabled} onChange={handleChange} />
    <input id={`${idPrefix}-gallery`} className="photo-input" type="file" accept="image/*,.heic,.heif" multiple tabIndex={-1} aria-hidden="true" disabled={disabled} onChange={handleChange} />
  </div>;
}

function incompleteFields(item: ItemView) {
  const missing = missingItemFields(item);
  return missing.length ? `待补：${missing.join("、")}` : "资料或位置尚未补齐";
}

function MerchThumb({ item, label, imagePath, detail = false }: { item?: ItemView | null; label?: string; imagePath?: string | null; detail?: boolean }) {
  const path = imagePath ?? (detail ? item?.detailImagePath : item?.imagePath);
  return <div className="merch-thumb" aria-label={label ?? (item ? itemTitle(item) : "收藏缩略图")}>
    {path ? <PrivateImage key={path} path={path} eager={detail} /> : <span className="no-photo"><ImageIcon size={28} weight="light" aria-hidden="true" /><small>暂无照片</small></span>}
    {label ? <span className="merch-label">{label}</span> : null}
  </div>;
}

function SectionHeading({ title, caption, action, onAction }: { title: string; caption?: string; action?: string; onAction?: () => void }) {
  return <div className="section-heading"><div><h2>{title}</h2>{caption ? <p>{caption}</p> : null}</div>{action ? <button className="text-button" type="button" onClick={onAction}>{action}<CaretRightIcon size={16} /></button> : null}</div>;
}

function EmptyState({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><ArchiveIcon size={32} weight="light" aria-hidden="true" /><strong>{title}</strong><p>{body}</p>{action ? <button className="primary-button" type="button" onClick={onAction}>{action}</button> : null}</div>;
}

function FeedbackBanner({ feedback, onDismiss }: { feedback: Feedback; onDismiss: () => void }) {
  const Icon = feedback.tone === "error" ? WarningCircleIcon : feedback.tone === "info" ? InfoIcon : CheckCircleIcon;
  return <div className={`feedback-banner feedback-${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"} aria-live={feedback.tone === "error" ? "assertive" : "polite"}>
    <Icon size={25} className="feedback-icon" aria-hidden="true" />
    <p>{feedback.message}</p>
    <button type="button" className="feedback-dismiss" aria-label="关闭提示" onClick={onDismiss}><XIcon size={20} /></button>
  </div>;
}

async function purgeExpiredItems(client: SupabaseClient, householdId: string) {
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
  const expiredResult = await client.from("item_instances").select("id, item_style_id").eq("household_id", householdId).not("deleted_at", "is", null).lt("deleted_at", cutoff);
  if (expiredResult.error) throw expiredResult.error;
  for (const expired of expiredResult.data ?? []) {
    const deleteResult = await client.from("item_instances").delete().eq("id", expired.id);
    if (deleteResult.error) continue;
    const remainingResult = await client.from("item_instances").select("id").eq("item_style_id", expired.item_style_id);
    if (remainingResult.error || (remainingResult.data?.length ?? 0) > 0) continue;
    const imagesResult = await client.from("item_images").select("detail_path, thumbnail_path").eq("item_style_id", expired.item_style_id);
    if (!imagesResult.error) {
      const paths = (imagesResult.data ?? []).flatMap((image) => [image.detail_path, image.thumbnail_path].filter(Boolean) as string[]);
      if (paths.length) await client.storage.from("collection-images").remove(paths);
    }
    await client.from("item_styles").delete().eq("id", expired.item_style_id);
  }
}

function AuthView({ client, inviteToken, onMessage }: { client: SupabaseClient | null; inviteToken: string; onMessage: (message: string, tone?: FeedbackTone) => void }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!client) return onMessage("Supabase 环境变量尚未配置", "error");
    setBusy(true);
    try {
      if (mode === "sign-up") {
        const emailRedirectTo = `${window.location.origin}/auth/callback`;
        const { data, error } = await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo, data: { display_name: displayName.trim() } } });
        if (error) throw error;
        if (!data.session) { setMode("sign-in"); setPassword(""); onMessage("注册成功，请打开最新的确认邮件；确认后回来登录", "success"); }
        else onMessage("注册成功", "success");
      } else {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (error) { onMessage(errorMessage(error), "error"); } finally { setBusy(false); }
  };
  return <main className="auth-shell"><div className="auth-card"><Brand /><span className="eyebrow">家庭收藏空间</span><h1>{mode === "sign-in" ? "欢迎回来" : "创建你的谷仓"}</h1><p className="auth-copy">{inviteToken ? "登录或注册后即可接受家庭邀请。" : "和家人一起，把每一件收藏放在找得到的地方。"}</p><form onSubmit={submit} className="auth-form">{mode === "sign-up" ? <label>显示名称<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如：Dong" required /></label> : null}<label>邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label><label>密码<input type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 6 位" required /></label><button className="submit-button" type="submit" disabled={busy}>{busy ? "处理中…" : mode === "sign-in" ? "登录" : "注册"}</button></form><button className="text-button auth-switch" type="button" onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}>{mode === "sign-in" ? "还没有账号？注册一个" : "已经有账号？直接登录"}</button></div></main>;
}

function EmptyWorkspace({ client, inviteToken, onCreated, onMessage }: { client: SupabaseClient; inviteToken: string; onCreated: (household: Household) => void; onMessage: (message: string, tone?: FeedbackTone) => void }) {
  const [name, setName] = useState("我们的谷仓");
  const [token, setToken] = useState(inviteToken);
  const [busy, setBusy] = useState(false);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { data: currentUser, error: authError } = await client.auth.getUser();
      if (authError || !currentUser.user) throw authError ?? new Error("登录会话已失效，请重新登录");
      const { data: household, error } = await client.rpc("create_household", { household_name: name.trim() || "我们的谷仓" });
      if (error) throw error;
      if (!household) throw new Error("家庭空间创建失败，请稍后再试");
      onCreated(household);
    } catch (error) { onMessage(errorMessage(error), "error"); } finally { setBusy(false); }
  };
  const accept = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await client.rpc("accept_household_invite", { invite_token: token.trim() });
      if (error) throw error;
      onMessage("已加入家庭收藏空间", "success");
      window.history.replaceState({}, "", window.location.pathname);
      window.location.reload();
      void data;
    } catch (error) { onMessage(errorMessage(error), "error"); } finally { setBusy(false); }
  };
  return <main className="auth-shell"><div className="auth-card onboarding-card"><Brand /><span className="eyebrow">开始使用</span><h1>先建立一个家庭空间</h1><p className="auth-copy">之后可以邀请另一位成员加入，共同管理收藏和位置。</p><form onSubmit={create} className="auth-form"><label>空间名称<input value={name} onChange={(event) => setName(event.target.value)} required /></label><button className="submit-button" type="submit" disabled={busy}>{busy ? "创建中…" : "创建家庭空间"}</button></form><div className="or-divider"><span>或者</span></div><form onSubmit={accept} className="auth-form"><label>粘贴邀请令牌<input value={token} onChange={(event) => setToken(event.target.value)} placeholder="从邀请链接中复制 token" /></label><button className="secondary-button wide" type="submit" disabled={busy || token.trim().length < 16}>接受邀请并加入</button></form></div></main>;
}

function ItemCard({ item, onOpen }: { item: ItemView; onOpen: (item: ItemView) => void }) {
  const title = itemTitle(item);
  return <button className="item-card" type="button" onClick={() => onOpen(item)}><MerchThumb item={item} /><span className="item-card-copy"><strong>{title}</strong><ItemMetadata item={item} /><small title={item.path}>{compactLocationPath(item.path)}</small>{item.instance.physical_status !== "stored" ? <span className="item-status">{statusLabels[item.instance.physical_status]}</span> : null}</span></button>;
}

type DisplayMode = "cards" | "list";

function DisplayModeToggle({ mode, onChange, label = "显示方式" }: { mode: DisplayMode; onChange: (mode: DisplayMode) => void; label?: string }) {
  return <div className="search-view-toggle" role="group" aria-label={label}><button type="button" aria-pressed={mode === "cards"} className={mode === "cards" ? "active" : ""} onClick={() => onChange("cards")}>卡片</button><button type="button" aria-pressed={mode === "list"} className={mode === "list" ? "active" : ""} onClick={() => onChange("list")}>列表</button></div>;
}

function ItemDisplay({ items, onOpenItem, mode }: { items: ItemView[]; onOpenItem: (item: ItemView) => void; mode: DisplayMode }) {
  return <Paginated items={items} itemKey={(item) => item.instance.id}>{(visible) => mode === "cards"
    ? <div className="item-grid">{visible.map((item) => <ItemCard key={item.instance.id} item={item} onOpen={onOpenItem} />)}</div>
    : <div className="search-list collection-item-list">{visible.map((item) => <button className="search-list-row" type="button" key={item.instance.id} onClick={() => onOpenItem(item)}><MerchThumb item={item} /><span className="list-item-copy"><strong>{itemTitle(item)}</strong><ItemMetadata item={item} /><small title={item.path}>{compactLocationPath(item.path)}{item.instance.physical_status !== "stored" ? ` · ${statusLabels[item.instance.physical_status]}` : ""}</small></span><CaretRightIcon size={18} aria-hidden="true" /></button>)}</div>
  }</Paginated>;
}

function IpGroupDisplay({ groups, items, mode, onSelect }: { groups: Array<[string, string]>; items: ItemView[]; mode: DisplayMode; onSelect: (id: string) => void }) {
  const byIp = new Map<string, ItemView[]>();
  for (const item of items) {
    const id = item.ip?.id ?? "none";
    const group = byIp.get(id) ?? [];
    group.push(item);
    byIp.set(id, group);
  }
  return <Paginated items={groups} itemKey={([id]) => id} label="IP 列表">{(visible) => <div className={mode === "cards" ? "ip-grid" : "search-list collection-ip-list"}>{visible.map(([id, name]) => {
    const group = byIp.get(id) ?? [];
    const summary = `${new Set(group.flatMap((item) => item.characters.map((character) => character.id))).size} 个角色 · ${new Set(group.map((item) => item.category?.id).filter(Boolean)).size} 个品类`;
    return mode === "cards"
      ? <button className="ip-card" type="button" key={id} onClick={() => onSelect(id)}><div className="ip-cover"><MerchThumb item={group[0] ?? null} /><span className="ip-count">{group.length} 件</span></div><div className="ip-card-copy"><strong>{name}</strong><span>{summary}</span><CaretRightIcon size={16} aria-hidden="true" /></div></button>
      : <button className="search-list-row" type="button" key={id} onClick={() => onSelect(id)}><MerchThumb item={group[0] ?? null} /><span><strong>{name}</strong><small>{group.length} 件 · {summary}</small><em>点击查看该 IP 的收藏</em></span><CaretRightIcon size={18} aria-hidden="true" /></button>;
  })}</div>}</Paginated>;
}

type CharacterCollectionGroup = { id: string; name: string; items: ItemView[] };

function characterGroupForItem(item: ItemView) {
  const characters = [...item.characters].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  if (!characters.length) return { id: "none", name: "未指定角色" };
  if (characters.length === 1) return { id: characters[0].id, name: characters[0].name };
  return { id: `multi:${characters.map((character) => character.id).join(",")}`, name: characters.map((character) => character.name).join("、") };
}

function buildCharacterGroups(items: ItemView[]) {
  const grouped = new Map<string, CharacterCollectionGroup>();
  for (const item of items) {
    const character = characterGroupForItem(item);
    const current = grouped.get(character.id);
    if (current) current.items.push(item);
    else grouped.set(character.id, { ...character, items: [item] });
  }
  return [...grouped.values()].sort((left, right) => right.items.length - left.items.length || left.name.localeCompare(right.name, "zh-CN"));
}

function CharacterGroupDisplay({ groups, mode, onSelect }: { groups: CharacterCollectionGroup[]; mode: DisplayMode; onSelect: (id: string) => void }) {
  return <Paginated items={groups} itemKey={(group) => group.id} label="角色列表">{(visible) => mode === "cards"
    ? <div className="ip-grid">{visible.map((group) => <button className="ip-card" type="button" key={group.id} onClick={() => onSelect(group.id)}><div className="ip-cover"><MerchThumb item={group.items[0] ?? null} /><span className="ip-count">{group.items.length} 件</span></div><div className="ip-card-copy"><strong>{group.name}</strong><span>{new Set(group.items.map((item) => item.category?.name).filter(Boolean)).size} 个品类</span><CaretRightIcon size={16} aria-hidden="true" /></div></button>)}</div>
    : <div className="search-list collection-ip-list">{visible.map((group) => <button className="search-list-row" type="button" key={group.id} onClick={() => onSelect(group.id)}><MerchThumb item={group.items[0] ?? null} /><span><strong>{group.name}</strong><small>{group.items.length} 件 · {new Set(group.items.map((item) => item.category?.name).filter(Boolean)).size} 个品类</small><em>点击查看该角色的全部谷子</em></span><CaretRightIcon size={18} aria-hidden="true" /></button>)}</div>
  }</Paginated>;
}

function SearchResults({ items, onOpenItem }: { items: ItemView[]; onOpenItem: (item: ItemView) => void }) {
  const [mode, setMode] = useState<DisplayMode>("cards");
  return <section className="search-results"><div className="search-results-header"><div><span className="eyebrow">搜索结果</span><h2>找到 {items.length} 件</h2></div><DisplayModeToggle mode={mode} onChange={setMode} /></div>{items.length ? <ItemDisplay items={items} onOpenItem={onOpenItem} mode={mode} /> : <EmptyState title="没有找到收藏" body="试试收藏编号、原名称、IP、角色、品类或位置。" />}</section>;
}

function SearchField({ value, onChange, label = "搜索收藏" }: { value: string; onChange: (value: string) => void; label?: string }) {
  return <label className="global-search">
    <SearchIcon size={23} weight="light" aria-hidden="true" />
    <input type="search" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} placeholder="搜索 IP、角色、编号、位置" />
    {value ? <button type="button" className="icon-button" aria-label="清空搜索" onClick={() => onChange("")}><XIcon size={18} /></button> : null}
  </label>;
}

function ItemMetadata({ item }: { item: ItemView }) {
  return <span className="item-metadata">{item.category?.name ?? "未分类"}{inventoryCode(item) ? <><span aria-hidden="true"> · </span><span className="inventory-code">{inventoryCode(item)}</span></> : null}</span>;
}

function HomeView({ workspace, filteredItems, search, setSearch, onNavigate, onOpenTasks, onAdd, onOpenItem }: { workspace: Workspace; filteredItems: ItemView[]; search: string; setSearch: (value: string) => void; onNavigate: (nav: NavKey) => void; onOpenTasks: (tab: "draft" | "out") => void; onAdd: () => void; onOpenItem: (item: ItemView) => void }) {
  const draftCount = workspace.items.filter(isIncompleteItem).length;
  const outCount = workspace.items.filter((item) => item.instance.physical_status === "temporarily_out").length;
  return <div className="page home-page">
    <PageHeader title={workspace.household.name} countLabel={`${workspace.items.length} 件收藏`} />
    <SearchField value={search} onChange={setSearch} />
    {search.trim() ? <SearchResults items={filteredItems} onOpenItem={onOpenItem} /> : <>
      <div className="quick-actions">
        <button type="button" onClick={() => onNavigate("collection")}><CubeIcon size={27} weight="light" /><span>浏览收藏</span></button>
        <button type="button" onClick={() => onNavigate("locations")}><MapPinIcon size={27} weight="light" /><span>按位置查找</span></button>
      </div>
      <section className="home-pending"><SectionHeading title="待处理" />
        <div className="task-preview">
          <button type="button" onClick={() => onOpenTasks("draft")}><ClipboardTextIcon size={25} weight="light" /><span>待完善 <b>{draftCount}</b></span><CaretRightIcon size={16} /></button>
          <button type="button" onClick={() => onOpenTasks("out")}><ArchiveIcon size={25} weight="light" /><span>待归位 <b>{outCount}</b></span><CaretRightIcon size={16} /></button>
        </div>
      </section>
      <section className="home-section"><SectionHeading title="最近入库" action="查看全部" onAction={() => onNavigate("collection")} />
        {workspace.items.length ? <div className="recent-grid">{workspace.items.slice(0, 2).map((item) => <ItemCard key={item.instance.id} item={item} onOpen={onOpenItem} />)}</div> : <EmptyState title="记录第一件喜欢的收藏" body="照片和位置可以先记下来，其余资料之后再补。" action="添加谷子" onAction={onAdd} />}
      </section>
    </>}
  </div>;
}
function CollectionView({ items, locations, onOpenItem, onAdd }: { items: ItemView[]; locations: LocationRow[]; onOpenItem: (item: ItemView) => void; onAdd: () => void }) {
  const [mode, setMode] = useState<"ip" | "all">("all");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("cards");
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  useEffect(() => {
    const restore = (entry: AppHistoryState | null) => {
      if (entry?.gucang && entry.nav === "collection") {
        setSelectedIp(entry.collectionIpId ?? null);
        setSelectedCharacter(entry.collectionCharacterId ?? null);
      }
    };
    restore(window.history.state as AppHistoryState | null);
    const onPopState = (event: PopStateEvent) => restore(event.state);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const selectGroup = (ipId: string, characterId: string | null = null) => {
    window.history.pushState({ gucang: true, role: "app", nav: "collection", overlay: null, locationId: null, collectionIpId: ipId, collectionCharacterId: characterId } satisfies AppHistoryState, "", window.location.pathname);
    setSelectedIp(ipId);
    setSelectedCharacter(characterId);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const locationIndex = useMemo(() => buildLocationIndex(locations, items), [locations, items]);
  const selectedLocationIds = useMemo(() => selectedLocationId ? locationIndex.descendantIds(selectedLocationId) : null, [locationIndex, selectedLocationId]);
  const filtered = items.filter((item) => (!selectedLocationIds || selectedLocationIds.has(item.instance.current_location_id ?? item.instance.home_location_id ?? "")) && matchesItemSearch(item, search));
  const ipGroups = Array.from(new Map(filtered.map((item) => [item.ip?.id ?? "none", item.ip?.name ?? "未分类"])).entries());
  if (selectedIp) {
    const group = filtered.filter((item) => (item.ip?.id ?? "none") === selectedIp);
    const name = group[0]?.ip?.name ?? "未分类";
    const characterGroups = buildCharacterGroups(group);
    const character = selectedCharacter ? characterGroups.find((entry) => entry.id === selectedCharacter) ?? null : null;
    return <div className="page collection-detail">
      <button className="back-link" type="button" onClick={() => window.history.back()}><CaretLeftIcon size={16} />{character ? name : "我的收藏"}</button>
      <div className="detail-intro"><div><span className="eyebrow">{character ? name : "IP 收藏"}</span><h1>{character?.name ?? name}</h1><p>共 {character ? character.items.length : group.length} 件{!character ? ` · ${characterGroups.length} 个角色/组合` : ""}</p></div><MerchThumb item={character?.items[0] ?? group[0] ?? null} /></div>
      <div className="collection-display-bar"><span>{character ? "全部谷子" : "按角色浏览"}</span><DisplayModeToggle mode={displayMode} onChange={setDisplayMode} /></div>
      {character ? <ItemDisplay items={character.items} onOpenItem={onOpenItem} mode={displayMode} /> : characterGroups.length ? <CharacterGroupDisplay groups={characterGroups} mode={displayMode} onSelect={(id) => selectGroup(selectedIp, id)} /> : <EmptyState title="暂时没有匹配的收藏" body="换一个关键词或位置试试。" />}
    </div>;
  }
  return <div className="page collection-page">
    <PageHeader title="我的收藏" countLabel={`${filtered.length} 件`} />
    <SearchField value={search} onChange={setSearch} />
    <div className="collection-primary-tabs" role="group" aria-label="收藏分组">
      <button type="button" aria-pressed={mode === "all"} className={mode === "all" ? "active" : ""} onClick={() => setMode("all")}>全部谷子</button>
      <button type="button" aria-pressed={mode === "ip"} className={mode === "ip" ? "active" : ""} onClick={() => setMode("ip")}>按 IP</button>
    </div>
    <div className="collection-secondary-toolbar">
      <label className="location-filter"><select aria-label="按位置筛选" value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)}><option value="">全部位置</option>{locations.map((location) => <option key={location.id} value={location.id}>{locationPath(location.id, locations)}</option>)}</select><CaretDownIcon size={14} aria-hidden="true" /></label>
      <DisplayModeToggle mode={displayMode} onChange={setDisplayMode} />
    </div>
    {selectedLocationId ? <p className="filter-context">包含子位置<button className="text-button" type="button" onClick={() => setSelectedLocationId("")}>清除筛选</button></p> : null}
    {mode === "ip" ? (ipGroups.length ? <IpGroupDisplay groups={ipGroups} items={filtered} mode={displayMode} onSelect={selectGroup} /> : <EmptyState title="还没有匹配的 IP" body="添加收藏或换一个搜索词试试。" action="添加谷子" onAction={onAdd} />) : (filtered.length ? <ItemDisplay items={filtered} onOpenItem={onOpenItem} mode={displayMode} /> : <EmptyState title="没有找到收藏" body="换一个关键词试试，或添加第一件谷子。" action="添加谷子" onAction={onAdd} />)}
  </div>;
}

function LocationsView({ workspace, initialSelected, onAdd, onOpenItem, onEdit, onDelete }: { workspace: Workspace; initialSelected?: string | null; onAdd: (parentId?: string) => void; onOpenItem: (item: ItemView) => void; onEdit: (location: LocationRow) => void; onDelete: (location: LocationRow) => void }) {
  const [selected, setSelected] = useState<string | null>(initialSelected ?? null);
  const [showItems, setShowItems] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("cards");
  useEffect(() => { if (initialSelected !== undefined) setSelected(initialSelected); }, [initialSelected]);
  useEffect(() => {
    const restore = (entry: AppHistoryState | null) => {
      if (entry?.gucang && entry.nav === "locations") { setSelected(entry.locationId ?? null); setShowItems(Boolean(entry.locationItems)); }
    };
    restore(window.history.state as AppHistoryState | null);
    const onPopState = (event: PopStateEvent) => restore(event.state);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const selectLocation = (id: string | null, items = false) => {
    window.history.pushState({ gucang: true, role: "app", nav: "locations", overlay: null, locationId: id, locationItems: items, collectionIpId: null } satisfies AppHistoryState, "", window.location.pathname);
    setSelected(id);
    setShowItems(items);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const index = useMemo(() => buildLocationIndex(workspace.locations, workspace.items), [workspace.locations, workspace.items]);
  const location = selected ? index.byId.get(selected) ?? null : null;
  const children = index.children.get(location?.id ?? null) ?? [];
  const descendants = useMemo(() => selected ? index.descendantIds(selected) : new Set<string>(), [index, selected]);
  const items = workspace.items.filter((item) => descendants.has(item.instance.current_location_id ?? item.instance.home_location_id ?? ""));
  const path = index.lineage(location?.id ?? null);
  return <div className={`page locations-page${!location ? " locations-overview" : ""}`}>
    <PageHeader title="收纳位置" />
    {location ? <nav className="breadcrumbs" aria-label="位置层级">
      <button type="button" onClick={() => selectLocation(null)}>所有位置</button>
      {path.map((part) => <span key={part.id}><CaretRightIcon size={12} /><button type="button" aria-current={part.id === location.id && !showItems ? "page" : undefined} onClick={() => selectLocation(part.id)}>{part.name}</button></span>)}
      {showItems ? <span><CaretRightIcon size={12} /><span aria-current="page">谷子</span></span> : null}
    </nav> : null}
    {location ? <div className="location-detail-head"><div><h2>{location.name}{showItems ? "的谷子" : ""}</h2><p>{items.length} 件收藏{!showItems ? ` · ${children.length} 个子位置` : " · 包含子位置"}</p></div>
      {!showItems ? <div className="location-edit-actions"><button className="text-button" type="button" onClick={() => onEdit(location)}>编辑</button><details className="overflow-menu"><summary aria-label="更多位置操作"><DotsThreeIcon size={22} /></summary><button type="button" onClick={() => onDelete(location)}>删除位置</button></details></div> : <button className="text-button" type="button" onClick={() => window.history.back()}><CaretLeftIcon size={15} />返回位置</button>}
    </div> : null}
    {!showItems ? <>
      <div className="section-heading location-section-heading"><h2>{location ? "子位置" : "所有位置"}</h2><button className="primary-button compact-button" type="button" onClick={() => onAdd(location?.id)}>{location ? "添加子位置" : "新建位置"}</button></div>
      <div className="location-rows">{children.map((child) => <button className="location-row" type="button" key={child.id} onClick={() => selectLocation(child.id)}>
        <span><strong>{child.name}</strong><small>{index.counts.get(child.id) ?? 0} 件收藏{(index.children.get(child.id)?.length ?? 0) > 0 ? ` · ${index.children.get(child.id)!.length} 个子位置` : ""}</small></span><CaretRightIcon size={19} weight="light" />
      </button>)}</div>
      {!location ? children.length ? <p className="location-overview-copy">进入位置，查看下一级收纳空间。</p> : <EmptyState title="给收藏安一个家" body="可以先建家、书房或收纳盒，之后再逐层补充。" /> : null}
      {location && children.length > 0 ? <button className="location-items-link" type="button" onClick={() => selectLocation(location.id, true)}><span>查看这里的谷子<small>包含子位置</small></span><CaretRightIcon size={18} /></button> : null}
    </> : null}
    {location && (showItems || !children.length) ? <section className="location-collections">
      <div className="collection-display-bar"><span>{showItems ? "全部谷子" : "这里的谷子"}</span><DisplayModeToggle mode={displayMode} onChange={setDisplayMode} /></div>
      {items.length ? <ItemDisplay items={items} onOpenItem={onOpenItem} mode={displayMode} /> : <EmptyState title="这个位置还没有谷子" body="添加谷子时选择这里，就能从位置快速找到。" />}
    </section> : null}
  </div>;
}

function TasksView({ workspace, initialTab = "draft", onOpenItem, onEditItem, onMove, onRestore }: { workspace: Workspace; initialTab?: "draft" | "out" | "trash"; onOpenItem: (item: ItemView) => void; onEditItem: (item: ItemView) => void; onMove: (item: ItemView, status: PhysicalStatus, locationId: string | null) => void; onRestore: (item: ItemView) => void }) {
  const [activeTab, setActiveTab] = useState<"draft" | "out" | "trash">(initialTab);
  useEffect(() => { setActiveTab(initialTab); }, [initialTab]);
  const groups = {
    draft: { items: workspace.items.filter(isIncompleteItem), title: "资料待完善", caption: "补齐资料，下次更好找。", empty: "资料都很完整", body: "新的快速暂存记录会出现在这里。" },
    out: { items: workspace.items.filter((item) => item.instance.physical_status === "temporarily_out"), title: "取出未归位", caption: "放回原来的位置，再点一下归位。", empty: "目前没有待归位", body: "取出收藏后，它会出现在这里。" },
    trash: { items: workspace.deletedItems, title: "回收站", caption: "保留 7 天，期间可恢复。", empty: "回收站为空", body: "删除收藏后，会先进入这里。" },
  };
  const current = groups[activeTab];
  return <div className="page tasks-page">
    <PageHeader title="待办" />
    <div className="task-tabs" role="tablist" aria-label="待办分类">{(["draft", "out", "trash"] as const).map((tab, i) => <button key={tab} id={`task-tab-${tab}`} aria-controls="task-panel" className={activeTab === tab ? "active" : ""} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => {
      setActiveTab(tab);
      window.history.replaceState({ ...window.history.state, taskTab: tab }, "", window.location.pathname);
      window.scrollTo({ top: 0, behavior: "instant" });
    }}>{["待完善", "待归位", "回收站"][i]} <b>{groups[tab].items.length}</b></button>)}</div>
    <section className="task-list" id="task-panel" role="tabpanel" aria-labelledby={`task-tab-${activeTab}`}>
      <p className="task-caption">{current.caption}</p>
      {current.items.length ? <Paginated key={activeTab} items={current.items} itemKey={(item) => item.instance.id} label={current.title}>{(visible) => visible.map((item) => <div className="task-row" key={item.instance.id}>
        {activeTab === "trash" ? <div className="task-item-main"><MerchThumb item={item} /><span className="list-item-copy"><strong>{itemTitle(item)}</strong><ItemMetadata item={item} /><small>{item.instance.deleted_at ? `删除于 ${safeDate(item.instance.deleted_at)}` : "已移入回收站"}</small></span></div> : <button className="task-item-main" type="button" onClick={() => onOpenItem(item)}><MerchThumb item={item} /><span className="list-item-copy"><strong>{itemTitle(item)}</strong><ItemMetadata item={item} /><small>{activeTab === "draft" ? incompleteFields(item) : `默认位置：${compactLocationPath(locationPath(item.instance.home_location_id, workspace.locations))}`}</small></span></button>}
        <button className="task-action" type="button" onClick={() => activeTab === "draft" ? onEditItem(item) : activeTab === "trash" ? onRestore(item) : item.instance.home_location_id ? onMove(item, "stored", item.instance.home_location_id) : onOpenItem(item)}>{activeTab === "draft" ? "完善" : activeTab === "trash" ? "恢复" : "归位"}<CaretRightIcon size={14} aria-hidden="true" /></button>
      </div>)}</Paginated> : <EmptyState title={current.empty} body={current.body} />}
    </section>
  </div>;
}
function ItemForm({ initial, locations, ips, categories, series, existingPhotoCount = 0, onClose, onSave, onError }: { initial?: ItemView | null; locations: LocationRow[]; ips: IpRow[]; categories: CategoryRow[]; series: SeriesRow[]; existingPhotoCount?: number; onClose: () => void; onSave: (values: ItemFormValues, session: SaveSession, report: ProgressReporter) => Promise<void>; onError: (message: string) => void }) {
  const [name, setName] = useState(initial?.style.name ?? "");
  const [ip, setIp] = useState(initial?.ip?.name ?? "");
  const [character, setCharacter] = useState(initial?.characters[0]?.name ?? "");
  const [category, setCategory] = useState(initial?.category?.name ?? "");
  const [seriesName, setSeriesName] = useState(initial?.series?.name ?? "");
  const [locationId, setLocationId] = useState(initial?.location?.id ?? initial?.instance.home_location_id ?? "");
  const [notes, setNotes] = useState(initial?.style.notes ?? "");
  const [status, setStatus] = useState<PhysicalStatus>(initial?.instance.physical_status ?? "stored");
  const [quick, setQuick] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [quality, setQuality] = useState<ImageQuality>("standard");
  const [progress, setProgress] = useState<SaveProgress | null>(null);
  const [saveError, setSaveError] = useState("");
  const [saveSession] = useState(newSaveSession);
  const submitting = useRef(false);
  const photosLocked = [...saveSession.photoSession.photos.values()].some((photo) => photo.uploaded.size > 0 || photo.committed);
  const photoSlots = Math.max(0, 3 - existingPhotoCount);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const hasRequiredFields = Boolean(ip.trim() && category.trim() && locationId);
  const appendFiles = (selected: File[]) => {
    setFiles((current) => [...current, ...selected].slice(0, photoSlots));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setSaveError("");
    try {
      await onSave({
        name,
        ip,
        character,
        category,
        series: seriesName,
        locationId,
        notes,
        status,
        quick,
        files,
        quality,
        styleId: initial?.style.id,
        instanceId: initial?.instance.id,
      }, saveSession, setProgress);
    } catch (error) {
      setSaveError(errorMessage(error));
      setProgress(null);
      onError(errorMessage(error));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}>
      <section className="add-sheet item-form-sheet" role="dialog" aria-modal="true" aria-labelledby="item-form-title">
        <div className="sheet-header">
          <button className="cancel-button" type="button" disabled={busy} onClick={onClose}>取消</button>
          <h2 id="item-form-title">{initial ? "编辑谷子" : "添加谷子"}</h2>
        </div>
        {!initial ? (
          <div className="add-mode-tabs">
            <button type="button" disabled={busy} aria-pressed={!quick} className={quick ? "" : "active"} onClick={() => setQuick(false)}>完整录入</button>
            <button type="button" disabled={busy} aria-pressed={quick} className={quick ? "active" : ""} onClick={() => setQuick(true)}>快速暂存</button>
          </div>
        ) : null}
        <p className="form-hint">{quick ? "先记录照片或位置，资料可以之后再补。" : "带 * 的资料齐全后可正式保存，未填齐也可暂存。"}</p>
        <form onSubmit={submit} aria-busy={busy}><fieldset className="form-fields" disabled={busy}>
          {initial?.imagePath ? <div className="existing-photo"><MerchThumb item={initial} /><small>原有照片保留</small></div> : null}
          {photoSlots > 0 ? <PhotoPicker files={files} previewUrls={previewUrls} idPrefix="item-photo" existingCount={existingPhotoCount} onFilesSelected={appendFiles} onRemove={(index) => setFiles((current) => current.filter((_, i) => i !== index))} disabled={photosLocked} /> : <p className="form-hint">已有 {existingPhotoCount} 张照片，将保留原图；本次仅修改资料。</p>}<PhotoQuality value={quality} onChange={setQuality} disabled={photosLocked} />
          <div className="inventory-field" aria-label="收藏编号">
            <span role="status">{initial ? <>编号 <span className="inventory-code">{inventoryCode(initial)}</span></> : saveSession.inventoryCode || "编号保存后自动生成"}</span>
          </div>
          <div className="form-grid">
            <label>
              <span className="field-label">IP <i className="required-mark">*</i></span>
              <input value={ip} onChange={(event) => setIp(event.target.value)} list="ip-options" placeholder="搜索或输入 IP" />
              <datalist id="ip-options">{ips.map((entry) => <option key={entry.id} value={entry.name} />)}</datalist>
            </label>
            <label>角色（选填）<input value={character} onChange={(event) => setCharacter(event.target.value)} placeholder="可稍后补充" /></label>
            <label>
              <span className="field-label">品类 <i className="required-mark">*</i></span>
              <input value={category} onChange={(event) => setCategory(event.target.value)} list="category-options" placeholder="例如：徽章" />
              <datalist id="category-options">{categories.map((entry) => <option key={entry.id} value={entry.name} />)}</datalist>
            </label>
            <label>
              <span className="field-label">当前位置 <i className="required-mark">*</i></span>
              <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                <option value="">暂不指定（将保存为待完善）</option>
                {locations.map((location) => <option key={location.id} value={location.id}>{locationPath(location.id, locations)}</option>)}
              </select>
            </label>
          </div>
          <details className="optional-name">
            <summary><span>更多资料（选填）<small>系列、补充名称、备注</small></span><CaretDownIcon size={18} /></summary>
            <div className="more-fields">
              <label>系列（选填）<input value={seriesName} onChange={(event) => setSeriesName(event.target.value)} list="series-options" placeholder="例如：Jump Festa 2025" /><datalist id="series-options">{series.map((entry) => <option key={entry.id} value={entry.name} />)}</datalist></label>
              <label>款式名称（选填）<input value={name} onChange={(event) => setName(event.target.value)} placeholder="想记住的名称，可留空" /></label>
              <p className="optional-field-hint">原名称会保留；不填写名称不影响资料完整度。</p>
              <label>备注（选填）<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="想记下什么？" rows={3} /></label>
            </div>
          </details>
          {initial ? (
            <label>
              状态
              <select value={status} onChange={(event) => setStatus(event.target.value as PhysicalStatus)}>
                <option value="stored">已收纳</option>
                <option value="displayed">展示中</option>
                <option value="temporarily_out">临时取出</option>
                <option value="unknown">待确认</option>
              </select>
            </label>
          ) : null}
          </fieldset><SaveProgressView progress={progress} />{saveError ? <p className="save-error" role="alert">{saveError} 可直接重试保存。</p> : null}<div className="form-footer"><button className="submit-button" type="submit" disabled={busy}>{busy ? progress?.message ?? "准备保存…" : hasRequiredFields ? (initial ? "保存修改" : "保存") : "保存为待完善"}</button></div>
        </form>
      </section>
    </div>
  );
}

function LocationForm({ initial, locations, parentId, existingPhotoCount = 0, onClose, onSave, onError }: { initial?: LocationRow | null; locations: LocationRow[]; parentId?: string; existingPhotoCount?: number; onClose: () => void; onSave: (values: LocationFormValues, session: SaveSession, report: ProgressReporter) => Promise<void>; onError: (message: string) => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState(initial?.location_type ?? "其他");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [selectedParent, setSelectedParent] = useState(initial ? initial.parent_id ?? "" : parentId ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [quality, setQuality] = useState<ImageQuality>("standard");
  const [progress, setProgress] = useState<SaveProgress | null>(null);
  const [saveError, setSaveError] = useState("");
  const [saveSession] = useState(newSaveSession);
  const submitting = useRef(false);
  const photosLocked = [...saveSession.photoSession.photos.values()].some((photo) => photo.uploaded.size > 0 || photo.committed);
  const photoSlots = Math.max(0, 3 - existingPhotoCount);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const appendFiles = (selected: File[]) => {
    setFiles((current) => [...current, ...selected].slice(0, photoSlots));
  };

  const excludedParentIds = useMemo(() => {
    const excluded = new Set<string>(initial ? [initial.id] : []);
    let changed = true;
    while (changed) {
      changed = false;
      for (const location of locations) {
        if (location.parent_id && excluded.has(location.parent_id) && !excluded.has(location.id)) {
          excluded.add(location.id);
          changed = true;
        }
      }
    }
    return excluded;
  }, [initial, locations]);
  const parentOptions = locations.filter((location) => !excludedParentIds.has(location.id));

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}>
      <section className="add-sheet" role="dialog" aria-modal="true" aria-label={initial ? "编辑收纳位置" : "新建收纳位置"}>
        <div className="sheet-header">
          <div><span className="eyebrow">自由树状位置</span><h2>{initial ? "编辑收纳位置" : "新建收纳位置"}</h2></div>
          <button className="close-button" type="button" disabled={busy} onClick={onClose} aria-label="关闭"><XIcon size={20} /></button>
        </div>
        <form onSubmit={async (event) => {
          event.preventDefault();
          if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setSaveError("");
          try {
            await onSave({ locationId: initial?.id, name, type, description, parentId: selectedParent || null, files, quality }, saveSession, setProgress);
          } catch (error) {
            setSaveError(errorMessage(error));
      setProgress(null);
      onError(errorMessage(error));
          } finally {
            submitting.current = false;
      setBusy(false);
          }
        }} aria-busy={busy}><fieldset className="form-fields" disabled={busy}>
          <label>名称（必填）<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：书房、蓝色徽章册、第4页" required /></label>
          <label>位置类型<select value={type} onChange={(event) => setType(event.target.value)}>{locationTypes.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
          <label>上级位置<select value={selectedParent} onChange={(event) => setSelectedParent(event.target.value)}><option value="">无（根位置）</option>{parentOptions.map((location) => <option key={location.id} value={location.id}>{locationPath(location.id, locations)}</option>)}</select></label>
          <details className="optional-name"><summary><span>更多资料（选填）<small>备注和原有位置照片</small></span><CaretDownIcon size={18} /></summary><div className="more-fields"><label>备注<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="可选" /></label>
          {photoSlots > 0 ? <PhotoPicker files={files} previewUrls={previewUrls} idPrefix="location-photo" existingCount={existingPhotoCount} onFilesSelected={appendFiles} onRemove={(index) => setFiles((current) => current.filter((_, i) => i !== index))} disabled={photosLocked} /> : <p className="form-hint">已有 {existingPhotoCount} 张照片，将保留原图。</p>}{files.length ? <PhotoQuality value={quality} onChange={setQuality} disabled={photosLocked} /> : null}</div></details>
          </fieldset><SaveProgressView progress={progress} />{saveError ? <p className="save-error" role="alert">{saveError} 可直接重试保存。</p> : null}<div className="form-footer"><button className="submit-button" type="submit" disabled={busy}>{busy ? progress?.message ?? "准备保存…" : initial ? "保存修改" : "保存位置"}</button></div>
        </form>
      </section>
    </div>
  );
}

function ItemSheet({ item, locations, onClose, onEdit, onMove, onDelete }: { item: ItemView; locations: LocationRow[]; onClose: () => void; onEdit: () => void; onMove: (status: PhysicalStatus, locationId: string | null) => void; onDelete: () => void }) {
  const [status, setStatus] = useState<PhysicalStatus>(item.instance.physical_status);
  const [locationId, setLocationId] = useState(item.location?.id ?? item.instance.home_location_id ?? "");
  const title = itemTitle(item);
  const isTemporarilyOut = item.instance.physical_status === "temporarily_out";
  return <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="item-sheet" role="dialog" aria-modal="true" aria-label="谷子详情"><div className="item-sheet-art"><MerchThumb item={item} detail /><button className="close-button floating" type="button" onClick={onClose} aria-label="关闭"><XIcon size={20} /></button></div><div className="item-sheet-body"><div className="eyebrow">{item.ip?.name ?? "未分类"}</div><h2>{title}</h2><p className="inventory-code detail-inventory-code" aria-label="收藏编号">{inventoryCode(item)}</p><p className="item-meta">{item.series?.name ?? "未填写"} · {item.category?.name ?? "未分类"}</p><div className={`status-pill status-${item.instance.physical_status === "stored" ? "stored" : item.instance.physical_status === "displayed" ? "display" : "pending"}`}><span />{statusLabels[item.instance.physical_status]}</div><div className="current-location"><MapPinIcon className="location-pin" size={24} /><div><small>当前位置</small><strong>{item.location?.name ?? "暂未指定"}</strong><p>{item.path}</p></div></div><div className="item-actions"><button className={isTemporarilyOut ? "secondary-button" : "primary-button"} type="button" onClick={() => onMove("temporarily_out", item.location?.id ?? item.instance.home_location_id)}>取出</button><button className={isTemporarilyOut ? "primary-button" : "secondary-button"} type="button" onClick={() => onMove("stored", item.instance.home_location_id)}>归位</button><button className="secondary-button" type="button" onClick={onEdit}>编辑</button></div><div className="move-control"><label>移动到<select value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">暂不指定</option>{locations.map((location) => <option key={location.id} value={location.id}>{locationPath(location.id, locations)}</option>)}</select></label><label>状态<select value={status} onChange={(event) => setStatus(event.target.value as PhysicalStatus)}><option value="stored">已收纳</option><option value="displayed">展示中</option><option value="temporarily_out">临时取出</option><option value="unknown">待确认</option></select></label><button className="secondary-button wide" type="button" onClick={() => onMove(status, locationId || null)}>保存移动</button></div><div className="item-history"><span>最近记录</span>{item.recentMoves.length ? item.recentMoves.map((move) => <strong key={move.id}>{statusLabels[move.to_status ?? "unknown"]} · {safeDate(move.created_at)}</strong>) : <strong>刚刚加入收藏</strong>}<small>所有移动操作都会保留历史记录</small></div><button className="danger-button" type="button" onClick={onDelete}>移入回收站</button></div></section></div>;
}

function SettingsView({ client, workspace, user, onInvite, onExport, onRestore, onDeleteHousehold, onMessage }: { client: SupabaseClient; workspace: Workspace; user: User; onInvite: (email: string) => Promise<string>; onExport: () => Promise<void>; onRestore: (item: ItemView) => void; onDeleteHousehold?: () => Promise<void>; onMessage: (message: string, tone?: FeedbackTone) => void }) {
  const [email, setEmail] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [displayName, setDisplayName] = useState(user.user_metadata?.display_name ?? "");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); }, []);
  const exportIsStale = now !== null && (!workspace.lastExportAt || now - new Date(workspace.lastExportAt).getTime() > 30 * 86400000);
  const isAdmin = workspace.member.role === "admin";
  const saveProfile = async () => { const { error } = await client.from("profiles").update({ display_name: displayName.trim() }).eq("id", user.id); if (error) onMessage(errorMessage(error), "error"); else onMessage("个人资料已保存", "success"); };
  return <div className={`page settings-page ${isAdmin ? "is-admin" : "is-member"}`}><div className="page-title-row"><div><span className="eyebrow">空间与数据安全</span><h1>设置</h1><p>管理家庭成员、导出备份和账户资料。</p></div></div><section className="settings-card"><SectionHeading title="我的账号" caption={user.email ?? ""} /><label>显示名称<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><button className="secondary-button" type="button" onClick={saveProfile}>保存资料</button></section><section className="settings-card"><SectionHeading title="邀请家庭成员" caption="邀请链接 14 天内有效，只有指定邮箱可以接受" /><form className="inline-form" onSubmit={async (event) => { event.preventDefault(); setInviteBusy(true); try { setInviteLink(await onInvite(email.trim())); setEmail(""); } catch (error) { onMessage(errorMessage(error), "error"); } finally { setInviteBusy(false); } }}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="对方的邮箱" required /><button className="primary-button" type="submit" disabled={inviteBusy}>{inviteBusy ? "生成中…" : "生成邀请"}</button></form>{inviteLink ? <div className="invite-result"><input readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} /><button className="secondary-button" type="button" onClick={() => navigator.clipboard.writeText(inviteLink).then(() => onMessage("邀请链接已复制", "success"))}>复制链接</button></div> : null}</section><section className="settings-card"><SectionHeading title="完整备份" caption={`上次导出：${workspace.lastExportAt ? safeDate(workspace.lastExportAt) : "尚未导出"}；当前图片约 ${formatBytes(workspace.imageBytes)}`} />{exportIsStale ? <p className="settings-warning">建议每 30 天导出一次完整备份。</p> : null}<button className="primary-button" type="button" disabled={exportBusy} onClick={async () => { setExportBusy(true); try { await onExport(); } catch (error) { onMessage(errorMessage(error), "error"); } finally { setExportBusy(false); } }}>{exportBusy ? "整理备份中…" : "导出 ZIP 备份"}</button><p className="settings-note">备份包含 JSON、CSV、位置、收藏、移动记录，以及可读取到的图片文件。</p></section><section className="settings-card"><SectionHeading title="回收站" caption="删除后的记录保留 7 天" />{workspace.deletedItems.length ? <Paginated items={workspace.deletedItems} itemKey={(item) => item.instance.id} label="回收站">{(visible) => visible.map((item) => <div className="settings-row" key={item.instance.id}><span>{itemTitle(item)}<small className="inventory-code">{inventoryCode(item)}</small><small>{item.instance.deleted_at ? safeDate(item.instance.deleted_at) : "—"}</small></span><button className="text-button" type="button" onClick={() => onRestore(item)}>恢复</button></div>)}</Paginated> : <p className="settings-note">回收站是空的。</p>}</section>{isAdmin && onDeleteHousehold ? <section className="settings-card danger-card"><SectionHeading title="危险操作" caption="删除家庭空间前会要求再次确认名称。" /><button className="danger-button" type="button" onClick={onDeleteHousehold}>删除家庭空间</button></section> : null}</div>;
}

export default function Home() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<NavKey>("home");
  const [search, setSearch] = useState("");
  const [authChecking, setAuthChecking] = useState(true);
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const [authInviteToken, setAuthInviteToken] = useState("");
  const [itemForm, setItemFormState] = useState<{ open: boolean; initial: ItemView | null; locationId?: string }>({ open: false, initial: null });
  const [locationForm, setLocationFormState] = useState<{ open: boolean; parentId?: string; initial: LocationRow | null }>({ open: false, initial: null });
  const [selectedItem, setSelectedItemState] = useState<ItemView | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedCollectionIpId, setSelectedCollectionIpId] = useState<string | null>(null);
  const [selectedTaskTab, setSelectedTaskTab] = useState<"draft" | "out" | "trash">("draft");
  const [profileOpen, setProfileOpen] = useState(false);
  const [inviteHandled, setInviteHandled] = useState(false);
  const workspaceRef = useRef<Workspace | null>(null);
  const mutationRef = useRef(false);
  const saveHistoryRef = useRef<AppHistoryState | null>(null);
  const reloadSequence = useRef(0);
  const activeHouseholdRef = useRef<string | null>(null);
  const userId = user?.id;
  const updateWorkspace = useCallback((update: (current: Workspace) => Workspace) => {
    const current = workspaceRef.current;
    if (!current) return;
    const next = update(current);
    workspaceRef.current = next;
    setWorkspace(next);
  }, []);
  const historyUserRef = useRef<string | null>(null);
  const pendingLocationId = selectedLocationId;
  useEffect(() => { workspaceRef.current = workspace; }, [workspace]);

  const notify = useCallback((message: string, tone: FeedbackTone = "success") => {
    setFeedback({ message, tone });
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), tone === "error" ? 7000 : 4500);
  }, []);
  useEffect(() => () => { if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current); }, []);
  const reload = useCallback(async (nextHouseholdId?: string): Promise<boolean> => {
    if (!client || !userId) return false;
    if (mutationRef.current) { notify("正在保存，请稍候再刷新", "info"); return false; }
    const sequence = ++reloadSequence.current;
    setWorkspaceStatus("loading");
    setError(null);
    try {
      const { data: memberRows, error: memberError } = await client.from("household_members").select("*").eq("user_id", userId);
      if (memberError) throw memberError;
      const ids = (memberRows ?? []).map((row) => row.household_id);
      if (sequence !== reloadSequence.current) return false;
      if (!ids.length) { setHouseholds([]); workspaceRef.current = null; setWorkspace(null); setWorkspaceStatus("empty"); return true; }
      const { data: householdRows, error: householdError } = await client.from("households").select("*").in("id", ids).is("deleted_at", null).order("created_at");
      if (householdError) throw householdError;
      if (sequence !== reloadSequence.current) return false;
      const available = householdRows ?? [];
      setHouseholds(available);
      const household = available.find((entry) => entry.id === (nextHouseholdId ?? activeHouseholdRef.current)) ?? available[0];
      if (!household) { workspaceRef.current = null; setWorkspace(null); setWorkspaceStatus("empty"); return true; }
      activeHouseholdRef.current = household.id;
      setActiveHouseholdId(household.id);
      await purgeExpiredItems(client, household.id);
      const loaded = await loadWorkspace(client, household, userId);
      if (sequence !== reloadSequence.current) return false;
      workspaceRef.current = loaded;
      setWorkspace(loaded);
      setWorkspaceStatus("ready");
      setError(null);
      return true;
    } catch (loadError) {
      if (sequence !== reloadSequence.current) return false;
      const message = errorMessage(loadError);
      setError(message);
      setWorkspaceStatus("error");
      notify(message, "error");
      return false;
    }
  }, [client, notify, userId]);

  useEffect(() => {
    let mounted = true;
    let browserClient: SupabaseClient;
    try {
      browserClient = createSupabaseBrowserClient();
      setClient(browserClient);
    } catch (clientError) { setError(errorMessage(clientError)); setAuthChecking(false); return; }
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite") ?? "";
    setAuthInviteToken(invite);
    if (params.get("auth_error") === "callback") {
      notify("邮箱确认链接无效或已过期，请重新注册", "error");
      window.history.replaceState({}, "", window.location.pathname);
    }
    browserClient.auth.getUser().then(({ data, error: authError }) => { if (authError && authError.message !== "Auth session missing!") setError(authError.message); if (mounted) { setUser(data.user); setAuthChecking(false); } });
    const { data: subscription } = browserClient.auth.onAuthStateChange((_event, session) => { if (mounted) { setUser(session?.user ?? null); setAuthChecking(false); } });
    return () => { mounted = false; subscription.subscription.unsubscribe(); };
  }, [notify]);

  useEffect(() => {
    workspaceRef.current = null;
    activeHouseholdRef.current = null;
    setWorkspace(null);
    if (client && userId) void reload();
    else setWorkspaceStatus("idle");
    return () => { reloadSequence.current += 1; };
  }, [client, userId, reload]);

  useEffect(() => {
    const protectSave = (event: BeforeUnloadEvent) => { if (mutationRef.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", protectSave);
    return () => window.removeEventListener("beforeunload", protectSave);
  }, []);

  useEffect(() => {
    if (!client || !user || !authInviteToken || inviteHandled) return;
    setInviteHandled(true);
    void client.rpc("accept_household_invite", { invite_token: authInviteToken }).then(({ data: joinedHouseholdId, error: inviteError }) => {
      if (inviteError) { notify(errorMessage(inviteError), "error"); return; }
      window.history.replaceState({}, "", window.location.pathname);
      notify("已加入家庭收藏空间", "success");
      void reload(joinedHouseholdId ?? undefined);
    });
  }, [authInviteToken, client, inviteHandled, notify, reload, user]);

  const activeItems = workspace?.items ?? EMPTY_ITEMS;
  const currentUserId = user?.id;
  const workspaceReady = Boolean(workspace);
  const filteredItems = useMemo(() => activeItems.filter((item) => matchesItemSearch(item, search)), [activeItems, search]);

  const pushHistory = useCallback((entry: AppHistoryState) => {
    if (typeof window !== "undefined") window.history.pushState(entry, "", window.location.pathname);
  }, []);
  const findItemById = useCallback((itemId?: string) => {
    if (!itemId) return null;
    const current = workspaceRef.current;
    return [...(current?.items ?? []), ...(current?.deletedItems ?? [])].find((entry) => entry.instance.id === itemId) ?? null;
  }, []);
  const findLocationById = useCallback((locationId?: string) => {
    if (!locationId) return null;
    return workspaceRef.current?.locations.find((entry) => entry.id === locationId) ?? null;
  }, []);
  const applyHistoryEntry = useCallback((entry: AppHistoryState) => {
    setActiveNav(entry.nav);
    setSearch(entry.search ?? "");
    setProfileOpen(false);
    setSelectedLocationId(entry.locationId ?? null);
    setSelectedCollectionIpId(entry.collectionIpId ?? null);
    setSelectedTaskTab(entry.taskTab ?? "draft");
    setSelectedItemState(entry.overlay === "item" ? findItemById(entry.itemId) : null);
    setItemFormState(entry.overlay === "itemForm" ? { open: true, initial: findItemById(entry.itemId) } : { open: false, initial: null });
    const locationFormInitial = entry.overlay === "locationForm" ? findLocationById(entry.locationFormId) : null;
    setLocationFormState(entry.overlay === "locationForm" ? { open: true, parentId: locationFormInitial ? locationFormInitial.parent_id ?? undefined : entry.locationId ?? undefined, initial: locationFormInitial } : { open: false, initial: null });
  }, [findItemById, findLocationById]);
  const makeHistoryEntry = useCallback((overrides: Partial<AppHistoryState> = {}): AppHistoryState => {
    const current = typeof window !== "undefined" ? window.history.state as Partial<AppHistoryState> | null : null;
    return { ...(current?.gucang ? current : {}), gucang: true, role: "app", nav: activeNav, overlay: null, locationId: current?.gucang ? current.locationId : selectedLocationId, collectionIpId: current?.gucang ? current.collectionIpId : selectedCollectionIpId, search, ...overrides };
  }, [activeNav, search, selectedCollectionIpId, selectedLocationId]);
  const handleBack = useCallback(() => {
    if (mutationRef.current) { notify("正在保存，请稍候再返回", "info"); return; }
    if (profileOpen) { setProfileOpen(false); return; }
    const state = typeof window !== "undefined" ? window.history.state as Partial<AppHistoryState> | null : null;
    if (state?.gucang) { window.history.back(); return; }
    if (itemForm.open) { setItemFormState({ open: false, initial: null }); return; }
    if (locationForm.open) { setLocationFormState({ open: false, initial: null }); return; }
    if (selectedItem) { setSelectedItemState(null); return; }
    if (selectedCollectionIpId) { setSelectedCollectionIpId(null); return; }
    if (selectedLocationId) { setSelectedLocationId(null); return; }
    if (activeNav !== "home") setActiveNav("home");
  }, [activeNav, itemForm.open, locationForm.open, notify, profileOpen, selectedCollectionIpId, selectedItem, selectedLocationId]);
  const navigate = useCallback((nav: NavKey) => {
    const entry = makeHistoryEntry({ nav, overlay: null, locationId: null, locationItems: false, collectionIpId: null, collectionCharacterId: null, search: "" });
    pushHistory(entry);
    applyHistoryEntry(entry);
  }, [applyHistoryEntry, makeHistoryEntry, pushHistory]);
  const openTasks = useCallback((tab: "draft" | "out" | "trash") => {
    const entry = makeHistoryEntry({ nav: "tasks", overlay: null, locationId: null, collectionIpId: null, taskTab: tab, search: "" });
    pushHistory(entry);
    applyHistoryEntry(entry);
  }, [applyHistoryEntry, makeHistoryEntry, pushHistory]);
  const openItem = useCallback((item: ItemView) => {
    const entry = makeHistoryEntry({ overlay: "item", itemId: item.instance.id });
    pushHistory(entry);
    applyHistoryEntry(entry);
  }, [applyHistoryEntry, makeHistoryEntry, pushHistory]);
  const openItemForm = useCallback((initial: ItemView | null = null) => {
    const entry = makeHistoryEntry({ overlay: "itemForm", itemId: initial?.instance.id });
    pushHistory(entry);
    applyHistoryEntry(entry);
  }, [applyHistoryEntry, makeHistoryEntry, pushHistory]);
  const openLocationForm = useCallback((parentId?: string, initial: LocationRow | null = null) => {
    const entry = makeHistoryEntry({ overlay: "locationForm", locationId: initial ? initial.id : parentId ?? null, locationFormId: initial?.id });
    pushHistory(entry);
    applyHistoryEntry(entry);
  }, [applyHistoryEntry, makeHistoryEntry, pushHistory]);
  const openLocationEdit = useCallback((location: LocationRow) => {
    openLocationForm(location.parent_id ?? undefined, location);
  }, [openLocationForm]);
  const closeOverlay = useCallback(() => {
    if ((window.history.state as Partial<AppHistoryState> | null)?.overlay) handleBack();
  }, [handleBack]);
  const setItemForm = useCallback((value: { open: boolean; initial: ItemView | null; locationId?: string }) => {
    if (value.open) openItemForm(value.initial);
    else closeOverlay();
  }, [closeOverlay, openItemForm]);
  const setLocationForm = useCallback((value: { open: boolean; parentId?: string; initial?: LocationRow | null }) => {
    if (value.open) openLocationForm(value.parentId, value.initial ?? null);
    else closeOverlay();
  }, [closeOverlay, openLocationForm]);
  const setSelectedItem = useCallback((item: ItemView | null) => {
    if (item) openItem(item);
    else if ((window.history.state as Partial<AppHistoryState> | null)?.overlay !== "itemForm") closeOverlay();
  }, [closeOverlay, openItem]);

  useEffect(() => {
    if (!currentUserId || !workspaceReady) { historyUserRef.current = null; return; }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const homeEntry: AppHistoryState = { gucang: true, role: "app", nav: "home", overlay: null, locationId: null, collectionIpId: null, search: "" };
    if (historyUserRef.current !== currentUserId) {
      historyUserRef.current = currentUserId;
    if (standalone) {
      window.history.replaceState({ ...homeEntry, role: "guard" }, "", window.location.pathname);
      window.history.pushState(homeEntry, "", window.location.pathname);
    } else {
      window.history.replaceState(homeEntry, "", window.location.pathname);
    }
    }
    const onPopState = (event: PopStateEvent) => {
      if (mutationRef.current && saveHistoryRef.current) {
        window.history.pushState(saveHistoryRef.current, "", window.location.pathname);
        notify("正在保存，请稍候再返回", "info");
        return;
      }
      const entry = event.state as AppHistoryState | null;
      if (entry?.gucang) {
        if (entry.role === "guard") {
          applyHistoryEntry(homeEntry);
          window.history.pushState(homeEntry, "", window.location.pathname);
        } else applyHistoryEntry(entry);
      } else if (standalone) {
        applyHistoryEntry(homeEntry);
        window.history.pushState(homeEntry, "", window.location.pathname);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [applyHistoryEntry, currentUserId, notify, workspaceReady]);

  const dialogKey = itemForm.open ? `item-form:${itemForm.initial?.instance.id ?? "new"}` : locationForm.open ? `location-form:${locationForm.initial?.id ?? "new"}` : selectedItem ? `item:${selectedItem.instance.id}` : "";
  useEffect(() => {
    if (!dialogKey) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.tabIndex = -1;
    dialog.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); handleBack(); }
      if (event.key !== "Tab") return;
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href]')].filter((node) => node.getClientRects().length > 0 && !node.classList.contains("photo-input"));
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = oldOverflow; dialog.removeEventListener("keydown", keydown); if (previous?.isConnected) previous.focus(); };
  }, [dialogKey, handleBack]);

  const createHousehold = async (household: Household) => { if (await reload(household.id)) notify("家庭空间已创建", "success"); };
  const refreshStyle = async (householdId: string, styleId: string) => {
    if (!client) throw new Error("登录会话已失效，请重新登录");
    const patch = await loadStylePatch(client, householdId, styleId);
    updateWorkspace((current) => applyStylePatch(current, patch));
  };
  const addItem = async (values: ItemFormValues, session: SaveSession, report: ProgressReporter) => {
    if (!client || !user || !workspace) throw new Error("登录会话已失效，请重新登录");
    mutationRef.current = true;
    saveHistoryRef.current = window.history.state as AppHistoryState | null;
    try {
      const saved = await saveItem(client, workspace, user.id, values, session, report);
      report({ stage: "refresh", message: "正在更新这件收藏" });
      try { await refreshStyle(workspace.household.id, saved.styleId); }
      catch { throw new Error("收藏已保存，但列表更新失败。请重试保存，不会重复创建"); }
      mutationRef.current = false;
      closeOverlay();
      notify([values.instanceId ? "收藏资料已更新" : saved.completion === "draft" ? "已保存到待完善" : "谷子已加入收藏", saved.inventoryCode].filter(Boolean).join(" · "));
    } finally { mutationRef.current = false; }
  };

  const moveItem = async (item: ItemView, status: PhysicalStatus, locationId: string | null) => {
    if (!client || mutationRef.current) return;
    mutationRef.current = true;
    saveHistoryRef.current = window.history.state as AppHistoryState | null;
    try {
      const { error: moveError } = await client.rpc("move_item_instance", { target_instance: item.instance.id, target_location: (locationId ?? null) as unknown as string, target_status: status });
      if (moveError) throw moveError;
      await refreshStyle(item.instance.household_id, item.style.id);
      mutationRef.current = false;
      closeOverlay();
      notify(status === "temporarily_out" ? "已标记为取出" : "位置和状态已更新");
    } catch (error) { notify(errorMessage(error), "error"); }
    finally { mutationRef.current = false; }
  };

  const deleteItem = async (item: ItemView) => {
    if (!client || !workspace || mutationRef.current) return;
    if (!window.confirm("这件收藏会先进入回收站，7天内可以恢复。确定继续吗？")) return;
    mutationRef.current = true;
    saveHistoryRef.current = window.history.state as AppHistoryState | null;
    try {
      const result = await client.from("item_instances").update({ deleted_at: new Date().toISOString(), updated_by: user?.id }).eq("household_id", workspace.household.id).eq("id", item.instance.id);
      if (result.error) throw result.error;
      await refreshStyle(workspace.household.id, item.style.id);
      mutationRef.current = false;
      closeOverlay();
      notify("已移入回收站", "success");
    } catch (error) { notify(errorMessage(error), "error"); }
    finally { mutationRef.current = false; }
  };
  const restoreItem = async (item: ItemView) => {
    if (!client || mutationRef.current) return;
    mutationRef.current = true;
    saveHistoryRef.current = window.history.state as AppHistoryState | null;
    try {
      const instance = await client.from("item_instances").update({ deleted_at: null, updated_by: user?.id }).eq("household_id", item.instance.household_id).eq("id", item.instance.id);
      if (instance.error) throw instance.error;
      const style = await client.from("item_styles").update({ deleted_at: null, updated_by: user?.id }).eq("household_id", item.instance.household_id).eq("id", item.style.id);
      if (style.error) throw style.error;
      await refreshStyle(item.instance.household_id, item.style.id);
      notify("收藏已恢复", "success");
    } catch (error) { notify(errorMessage(error), "error"); }
    finally { mutationRef.current = false; }
  };

  const saveLocation = async (values: LocationFormValues, session: SaveSession, report: ProgressReporter) => {
    if (!client || !workspace || !user) throw new Error("登录会话已失效，请重新登录");
    mutationRef.current = true;
    saveHistoryRef.current = window.history.state as AppHistoryState | null;
    try {
      const saved = await saveLocationRecord(client, workspace, user.id, values, session, report);
      updateWorkspace((current) => current.household.id !== workspace.household.id ? current : buildWorkspace({
        ...current,
        locations: upsertRows(current.locations, [saved.location]),
        locationImages: [...current.locationImages.filter((image) => image.location_id !== saved.location.id), ...saved.images],
      }));
      mutationRef.current = false;
      closeOverlay();
      notify(values.locationId ? "位置已更新" : "位置已创建");
    } finally { mutationRef.current = false; }
  };
  const deleteLocation = async (location: LocationRow) => { if (!client || !workspace || !user) return; const hasChildren = workspace.locations.some((entry) => entry.parent_id === location.id); const hasItems = workspace.items.some((item) => item.location?.id === location.id || item.instance.home_location_id === location.id); if (hasChildren || hasItems) { notify("请先处理这个位置下的子位置和收藏", "error"); return; } if (!window.confirm(`确定删除“${location.name}”吗？`)) return; const { error } = await client.from("locations").update({ deleted_at: new Date().toISOString() }).eq("id", location.id); if (error) { notify(errorMessage(error), "error"); return; } await reload(); notify("位置已移入回收站", "success"); };
  const deleteHousehold = async () => {
    if (!client || !workspace || workspace.member.role !== "admin") return;
    if (!window.confirm("删除家庭空间后，成员将无法继续访问。确定继续吗？")) return;
    const confirmation = window.prompt(`请输入家庭空间名称“${workspace.household.name}”以确认删除`);
    if (confirmation !== workspace.household.name) { notify("名称不匹配，已取消删除", "error"); return; }
    const { error } = await client.from("households").update({ deleted_at: new Date().toISOString() }).eq("id", workspace.household.id);
    if (error) { notify(errorMessage(error), "error"); return; }
    await client.auth.signOut();
  };

  const createInvite = async (email: string) => { if (!client || !workspace || !user) throw new Error("请先登录"); if (workspace.member.role !== "admin") throw new Error("只有管理员可以邀请家庭成员"); const token = newInviteToken(); const tokenHash = await hashToken(token); const { error } = await client.from("household_invites").insert({ household_id: workspace.household.id, email, token_hash: tokenHash, expires_at: new Date(Date.now() + 14 * 86400000).toISOString(), invited_by: user.id, role: "member" }); if (error) throw error; return `${window.location.origin}/?invite=${token}`; };

  const exportBackup = async () => {
    if (!client || !workspace || !user) return;
    if (workspace.member.role !== "admin") throw new Error("只有管理员可以导出完整备份");
    const entries: Record<string, unknown[]> = {};
    const queries = [
      ["households", client.from("households").select("*").eq("id", workspace.household.id)],
      ["household_members", client.from("household_members").select("*").eq("household_id", workspace.household.id)],
      ["household_invites", client.from("household_invites").select("id,household_id,email,role,expires_at,accepted_at,invited_by,created_at").eq("household_id", workspace.household.id)],
      ["ips", client.from("ips").select("*").eq("household_id", workspace.household.id)],
      ["characters", client.from("characters").select("*").eq("household_id", workspace.household.id)],
      ["categories", client.from("categories").select("*").eq("household_id", workspace.household.id)],
      ["series", client.from("series").select("*").eq("household_id", workspace.household.id)],
      ["locations", client.from("locations").select("*").eq("household_id", workspace.household.id)],
      ["item_styles", client.from("item_styles").select("*").eq("household_id", workspace.household.id)],
      ["item_style_characters", client.from("item_style_characters").select("item_style_id,character_id,sort_order,item_styles!inner(household_id)").eq("item_styles.household_id", workspace.household.id)],
      ["item_instances", client.from("item_instances").select("*").eq("household_id", workspace.household.id)],
      ["item_images", client.from("item_images").select("*").eq("household_id", workspace.household.id)],
      ["location_images", client.from("location_images").select("*").eq("household_id", workspace.household.id)],
      ["movement_events", client.from("movement_events").select("*").eq("household_id", workspace.household.id)],
      ["activity_events", client.from("activity_events").select("*").eq("household_id", workspace.household.id)],
    ] as const;
    for (const [table, query] of queries) {
      const ordered = table === "household_members" ? query.order("user_id") : table === "item_style_characters" ? query.order("item_style_id").order("character_id") : query.order("id");
      entries[table] = await readAllPages<Record<string, unknown>>(async (from, to) => {
        const result = await ordered.range(from, to);
        return { data: result.data as Record<string, unknown>[] | null, error: result.error };
      });
    }
    const zip = new JSZip();
    zip.file("data.json", JSON.stringify({ exported_at: new Date().toISOString(), inventory_numbering: { prefix: "GC-", minimum_digits: 6, scope: "household", reuse_deleted_numbers: false }, household: workspace.household, tables: entries }, null, 2));
    for (const [table, rows] of Object.entries(entries)) zip.file(`${table}.csv`, toCsv(rows as Array<Record<string, unknown>>));
    const imageRows = [...(entries.item_images ?? []), ...(entries.location_images ?? [])] as Array<Record<string, unknown>>;
    const missingImages: string[] = [];
    const includedImages = new Set<string>();
    for (const image of imageRows) {
      for (const field of ["detail_path", "thumbnail_path"] as const) {
        const path = String(image[field] ?? "");
        if (!path || includedImages.has(path)) continue;
        includedImages.add(path);
        const signed = await client.storage.from("collection-images").createSignedUrl(path, 600);
        if (!signed.data?.signedUrl) { missingImages.push(path); continue; }
        try {
          const response = await fetch(signed.data.signedUrl);
          if (response.ok) zip.file(`images/${path.split("/").pop()}`, await response.blob());
          else missingImages.push(path);
        } catch { missingImages.push(path); }
      }
    }
    zip.file("backup_manifest.json", JSON.stringify({ exported_at: new Date().toISOString(), image_count: includedImages.size - missingImages.length, missing_images: missingImages }, null, 2));
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    downloadBlob(blob, `gucang-backup-${new Date().toISOString().slice(0, 10)}.zip`);
    const eventResult = await client.from("export_events").insert({ household_id: workspace.household.id, actor_id: user.id, format: "zip", file_size_bytes: blob.size }).select().single();
    if (!eventResult.error) await reload(workspace.household.id);
    notify(missingImages.length ? `备份已下载，但有 ${missingImages.length} 个图片文件未能读取` : eventResult.error ? "备份已下载，但导出记录未能写入" : "完整备份已下载", missingImages.length || eventResult.error ? "info" : "success");
  };

  const startupSurface = resolveStartupSurface({ authChecking, hasClient: Boolean(client), hasUser: Boolean(user), hasWorkspace: Boolean(workspace), hasError: Boolean(error), workspaceStatus });
  if (startupSurface === "loading") return <div className="loading-shell"><BrandMark /><p>正在打开你的谷仓…</p></div>;
  if (startupSurface === "connection-error") return <main className="route-error-shell"><div className="route-error-card"><span className="feedback-icon feedback-error">!</span><span className="eyebrow">连接出现问题</span><h1>暂时无法打开谷仓</h1><p>{error}</p><button className="primary-button" type="button" onClick={() => window.location.reload()}>重新加载</button></div></main>;
  const feedbackView = feedback ? <FeedbackBanner feedback={feedback} onDismiss={() => setFeedback(null)} /> : null;
  if (startupSurface === "auth") return <><AuthView client={client} inviteToken={authInviteToken} onMessage={notify} />{feedbackView}</>;
  if (startupSurface === "workspace-error") return <main className="route-error-shell"><div className="route-error-card"><h1>暂时无法读取收藏</h1><p>{error}</p><button className="primary-button" type="button" onClick={() => void reload()}>重试加载</button></div>{feedbackView}</main>;
  if (startupSurface === "onboarding") return <><EmptyWorkspace client={client!} inviteToken={authInviteToken} onCreated={createHousehold} onMessage={notify} />{feedbackView}</>;
  if (!user || !client || !workspace) return <div className="loading-shell"><BrandMark /><p>正在打开你的谷仓…</p></div>;

  const activeHousehold = households.find((household) => household.id === activeHouseholdId) ?? workspace.household;
  const storagePercent = activeHousehold.storage_quota_bytes > 0 ? Math.min(100, Math.round((workspace.imageBytes / activeHousehold.storage_quota_bytes) * 100)) : 0;
  const storageWarning = storagePercent >= 95 ? "图片空间接近上限，请先导出备份。" : storagePercent >= 85 ? "图片空间已使用较多，建议及时导出备份。" : storagePercent >= 70 ? "图片空间已使用 70%，请留意容量。" : null;
  const pendingCount = workspace.items.filter((entry) => isIncompleteItem(entry) || entry.instance.physical_status === "temporarily_out").length;
  const modalOpen = Boolean(dialogKey);
  const renderBottomItem = (item: (typeof navItems)[number]) => {
    const Icon = item.icon;
    return <button key={item.id} className={activeNav === item.id ? "bottom-item active" : "bottom-item"} aria-current={activeNav === item.id ? "page" : undefined} type="button" onClick={() => navigate(item.id)}><Icon weight={activeNav === item.id ? "fill" : "regular"} aria-hidden="true" />{item.label}</button>;
  };
  return <PrivateImageProvider key={`${user.id}:${workspace.household.id}`} client={client}>
    <div className="app-shell">
      <aside className="side-nav" inert={modalOpen}>
        <Brand />
        <label className="household-switcher"><span className="household-avatar"><HomeIcon size={18} /></span><span><strong>{activeHousehold.name}</strong><small>{workspace.members.length} 位成员 · 家庭空间</small></span><select aria-label="切换家庭空间" value={activeHousehold.id} onChange={(event) => void reload(event.target.value)}>{households.map((household) => <option key={household.id} value={household.id}>{household.name}</option>)}</select></label>
        <nav className="nav-list" aria-label="主导航">{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={activeNav === item.id ? "nav-item active" : "nav-item"} aria-current={activeNav === item.id ? "page" : undefined} onClick={() => navigate(item.id)} type="button"><Icon weight={activeNav === item.id ? "fill" : "regular"} aria-hidden="true" />{item.label}{item.id === "tasks" && pendingCount > 0 ? <em>{pendingCount}</em> : null}</button>; })}</nav>
        <button type="button" className="primary-button side-add" onClick={() => openItemForm()}><PlusIcon size={20} />添加谷子</button>
        <div className="side-footer"><div className="storage-meter"><div><span>图片空间</span><b>{storagePercent}%</b></div><div className="meter-track"><i style={{ width: `${storagePercent}%` }} /></div><small>{formatBytes(workspace.imageBytes)} / {formatBytes(activeHousehold.storage_quota_bytes)}</small>{storageWarning ? <small className="storage-warning">{storageWarning}</small> : null}</div><button className="settings-link" type="button" onClick={() => navigate("settings")}><GearSixIcon size={19} />设置</button></div>
      </aside>
      <main className="main-column" inert={modalOpen}>
        <header className="topbar">
          <div className="mobile-brand"><Brand /></div>
          <button type="button" className="mobile-storage-meter" aria-label={`图片空间 ${storagePercent}%，查看容量详情`} title={storageWarning ?? `${formatBytes(workspace.imageBytes)} / ${formatBytes(activeHousehold.storage_quota_bytes)}`} onClick={() => navigate("settings")}><span className="mobile-storage-summary"><span>图片空间</span><b>{storagePercent}%</b></span></button>
          <div className="topbar-actions"><button type="button" className="icon-button refresh-button" aria-label="刷新" onClick={() => void reload()}><ArrowClockwiseIcon size={21} /></button><button type="button" className="profile-chip" aria-label="账号菜单" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}><UserCircleIcon weight="light" /></button>
            {profileOpen ? <div className="profile-menu"><strong>{user.user_metadata?.display_name ?? "谷仓成员"}</strong><small>{user.email}</small><button type="button" className="profile-settings" onClick={() => { setProfileOpen(false); navigate("settings"); }}>设置</button><button type="button" onClick={() => { setProfileOpen(false); void reload(); }}>刷新收藏</button><button type="button" onClick={() => void client?.auth.signOut()}>退出登录</button></div> : null}
          </div>
        </header>
        <div className="content-wrap">
          {activeNav === "home" ? <HomeView workspace={workspace} filteredItems={filteredItems} search={search} setSearch={setSearch} onNavigate={navigate} onOpenTasks={openTasks} onAdd={() => openItemForm()} onOpenItem={setSelectedItem} /> : null}
          {activeNav === "collection" ? <CollectionView items={filteredItems} locations={workspace.locations} onOpenItem={setSelectedItem} onAdd={() => openItemForm()} /> : null}
          {activeNav === "locations" ? <LocationsView workspace={workspace} initialSelected={pendingLocationId} onAdd={(parentId) => setLocationForm({ open: true, parentId })} onOpenItem={setSelectedItem} onEdit={openLocationEdit} onDelete={deleteLocation} /> : null}
          {activeNav === "tasks" ? <TasksView workspace={workspace} initialTab={selectedTaskTab} onOpenItem={setSelectedItem} onEditItem={openItemForm} onMove={moveItem} onRestore={restoreItem} /> : null}
          {activeNav === "settings" ? <SettingsView client={client} workspace={workspace} user={user} onInvite={createInvite} onExport={exportBackup} onRestore={restoreItem} onDeleteHousehold={deleteHousehold} onMessage={notify} /> : null}
        </div>
      </main>
      <nav className="bottom-nav" aria-label="移动端主导航" inert={modalOpen}>
        {navItems.slice(0, 2).map(renderBottomItem)}
        <button className="bottom-add" type="button" onClick={() => openItemForm()} aria-label="添加谷子"><span><PlusIcon weight="light" /></span>添加</button>
        {navItems.slice(2).map(renderBottomItem)}
      </nav>
      {itemForm.open ? <ItemForm key={itemForm.initial?.instance.id ?? "new"} existingPhotoCount={workspace.images.filter((image) => image.item_style_id === itemForm.initial?.style.id).length} initial={itemForm.initial} locations={workspace.locations} ips={workspace.ips} categories={workspace.categories} series={workspace.series} onClose={() => setItemForm({ open: false, initial: null })} onSave={addItem} onError={(message) => notify(message, "error")} /> : null}
      {locationForm.open ? <LocationForm key={locationForm.initial?.id ?? "new"} existingPhotoCount={workspace.locationImages.filter((image) => image.location_id === locationForm.initial?.id).length} initial={locationForm.initial} locations={workspace.locations} parentId={locationForm.parentId} onClose={() => setLocationForm({ open: false })} onSave={saveLocation} onError={(message) => notify(message, "error")} /> : null}
      {selectedItem ? <ItemSheet item={selectedItem} locations={workspace.locations} onClose={() => setSelectedItem(null)} onEdit={() => { setItemForm({ open: true, initial: selectedItem }); setSelectedItem(null); }} onMove={(status, locationId) => void moveItem(selectedItem, status, locationId)} onDelete={() => void deleteItem(selectedItem)} /> : null}
      {feedbackView}
    </div>
  </PrivateImageProvider>;
}
