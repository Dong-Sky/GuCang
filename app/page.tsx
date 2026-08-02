"use client";

import JSZip from "jszip";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Database, Tables } from "@/lib/supabase/database.types";

type SupabaseClient = ReturnType<typeof createSupabaseBrowserClient>;
type Household = Tables<"households">;
type LocationRow = Tables<"locations">;
type IpRow = Tables<"ips">;
type CategoryRow = Tables<"categories">;
type SeriesRow = Tables<"series">;
type StyleRow = Tables<"item_styles">;
type InstanceRow = Tables<"item_instances">;
type CharacterRow = Tables<"characters">;
type ImageRow = Tables<"item_images">;
type MovementRow = Tables<"movement_events">;
type MemberRow = Tables<"household_members">;

type NavKey = "home" | "collection" | "locations" | "tasks" | "settings";
type AppHistoryState = {
  gucang: true;
  role: "guard" | "app";
  nav: NavKey;
  overlay: "item" | "itemForm" | "locationForm" | null;
  itemId?: string;
  locationId?: string | null;
  collectionIpId?: string | null;
  search?: string;
};
type PhysicalStatus = Database["public"]["Enums"]["physical_status"];
type ArtKind = "badge" | "stand" | "card" | "paper" | "plush" | "album";
type FeedbackTone = "success" | "error" | "info";
type Feedback = { message: string; tone: FeedbackTone };

type ItemView = {
  instance: InstanceRow;
  style: StyleRow;
  ip: IpRow | null;
  category: CategoryRow | null;
  series: SeriesRow | null;
  characters: CharacterRow[];
  location: LocationRow | null;
  path: string;
  imageUrl: string | null;
  imageId: string | null;
  recentMoves: MovementRow[];
};

type Workspace = {
  household: Household;
  member: MemberRow;
  members: MemberRow[];
  locations: LocationRow[];
  ips: IpRow[];
  categories: CategoryRow[];
  series: SeriesRow[];
  characters: CharacterRow[];
  styles: StyleRow[];
  items: ItemView[];
  deletedItems: ItemView[];
  imageBytes: number;
  locationImageUrls: Record<string, string | null>;
  lastExportAt: string | null;
};

type ItemFormValues = {
  name: string;
  ip: string;
  character: string;
  category: string;
  series: string;
  locationId: string;
  notes: string;
  status: PhysicalStatus;
  quick: boolean;
  files: File[];
  styleId?: string;
  instanceId?: string;
};

const navItems: Array<{ id: NavKey; label: string; icon: string }> = [
  { id: "home", label: "首页", icon: "⌂" },
  { id: "collection", label: "收藏", icon: "✦" },
  { id: "locations", label: "位置", icon: "⌖" },
  { id: "tasks", label: "待办", icon: "✓" },
];

const locationTypes = ["房间", "柜子", "层板", "抽屉", "收纳箱", "收纳册", "页码", "分区", "展示位置", "其他"];
const EMPTY_ITEMS: ItemView[] = [];
const statusLabels: Record<PhysicalStatus, string> = {
  stored: "已收纳",
  temporarily_out: "临时取出",
  displayed: "展示中",
  unknown: "待确认",
};
const artAccents: Record<ArtKind, string> = { badge: "#7d91d9", stand: "#e8a55e", card: "#76a8cb", paper: "#709a9c", plush: "#d8a68e", album: "#a8a491" };

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

async function compressImage(file: File, maxDimension: number, targetBytes: number) {
  const source = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法处理图片");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close();
  let quality = 0.84;
  let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  while (blob && blob.size > targetBytes && quality > 0.38) {
    quality -= 0.08;
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  }
  if (!blob) throw new Error("图片压缩失败");
  return { blob, width: canvas.width, height: canvas.height };
}

function locationPath(locationId: string | null, locations: LocationRow[]) {
  if (!locationId) return "未指定位置";
  const byId = new Map(locations.map((location) => [location.id, location]));
  const names: string[] = [];
  let current = byId.get(locationId);
  while (current && names.length < 30) {
    names.unshift(current.name);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return names.join(" / ") || "未指定位置";
}

function inferArt(item: ItemView | null | undefined, index = 0): ArtKind {
  const category = item?.category?.name ?? "";
  if (category.includes("徽章") || category.includes("吧唧")) return "badge";
  if (category.includes("立牌") || category.includes("挂件")) return "stand";
  if (category.includes("色纸") || category.includes("纸")) return "paper";
  if (category.includes("毛绒")) return "plush";
  if (category.includes("卡")) return "card";
  return (["badge", "stand", "card", "paper", "plush"] as ArtKind[])[index % 5];
}

function MerchThumb({ item, label, imageUrl }: { item?: ItemView | null; label?: string; imageUrl?: string | null }) {
  const art = inferArt(item);
  const resolvedImageUrl = imageUrl ?? item?.imageUrl;
  return (
    <div className={`merch-thumb merch-${art}`} style={{ "--thumb-accent": artAccents[art] } as Record<string, string>} aria-label={label ?? item?.style.name ?? "收藏缩略图"}>
      {resolvedImageUrl ? <img src={resolvedImageUrl} alt="" /> : <><span className="merch-shape" /><span className="merch-mark">✦</span></>}
      {label ? <span className="merch-label">{label}</span> : null}
    </div>
  );
}

function SectionHeading({ title, caption, action, onAction }: { title: string; caption?: string; action?: string; onAction?: () => void }) {
  return <div className="section-heading"><div><h2>{title}</h2>{caption ? <p>{caption}</p> : null}</div>{action ? <button className="text-button" type="button" onClick={onAction}>{action} <span>›</span></button> : null}</div>;
}

function EmptyState({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span className="empty-dot">✦</span><strong>{title}</strong><p>{body}</p>{action ? <button className="primary-button" type="button" onClick={onAction}>{action}</button> : null}</div>;
}

function FeedbackBanner({ feedback, onDismiss }: { feedback: Feedback; onDismiss: () => void }) {
  const icon = feedback.tone === "error" ? "!" : feedback.tone === "info" ? "i" : "✓";
  return <div className={`feedback-banner feedback-${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"} aria-live={feedback.tone === "error" ? "assertive" : "polite"}>
    <span className="feedback-icon" aria-hidden="true">{icon}</span>
    <p>{feedback.message}</p>
    <button type="button" className="feedback-dismiss" aria-label="关闭提示" onClick={onDismiss}>×</button>
  </div>;
}

async function loadWorkspace(client: SupabaseClient, household: Household, userId: string): Promise<Workspace> {
  const [membersResult, locationsResult, ipsResult, categoriesResult, seriesResult, charactersResult, stylesResult, instancesResult, linksResult, imagesResult, locationImagesResult, movementsResult, exportEventsResult] = await Promise.all([
    client.from("household_members").select("*").eq("household_id", household.id),
    client.from("locations").select("*").eq("household_id", household.id).is("deleted_at", null).order("sort_order").order("created_at"),
    client.from("ips").select("*").eq("household_id", household.id).is("deleted_at", null).order("sort_order").order("name"),
    client.from("categories").select("*").eq("household_id", household.id).is("deleted_at", null).order("sort_order").order("name"),
    client.from("series").select("*").eq("household_id", household.id).is("deleted_at", null).order("name"),
    client.from("characters").select("*").eq("household_id", household.id).is("deleted_at", null).order("name"),
    client.from("item_styles").select("*").eq("household_id", household.id),
    client.from("item_instances").select("*").eq("household_id", household.id),
    client.from("item_style_characters").select("*"),
    client.from("item_images").select("*").eq("household_id", household.id).is("deleted_at", null).order("sort_order"),
    client.from("location_images").select("*").eq("household_id", household.id).is("deleted_at", null).order("created_at"),
    client.from("movement_events").select("*").eq("household_id", household.id).order("created_at", { ascending: false }).limit(300),
    client.from("export_events").select("created_at").eq("household_id", household.id).order("created_at", { ascending: false }).limit(1),
  ]);
  const results = [membersResult, locationsResult, ipsResult, categoriesResult, seriesResult, charactersResult, stylesResult, instancesResult, linksResult, imagesResult, locationImagesResult, movementsResult, exportEventsResult];
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);

  const members = membersResult.data ?? [];
  const locations = locationsResult.data ?? [];
  const ips = ipsResult.data ?? [];
  const categories = categoriesResult.data ?? [];
  const series = seriesResult.data ?? [];
  const characters = charactersResult.data ?? [];
  const styles = stylesResult.data ?? [];
  const instances = instancesResult.data ?? [];
  const links = linksResult.data ?? [];
  const images = imagesResult.data ?? [];
  const locationImages = locationImagesResult.data ?? [];
  const movements = movementsResult.data ?? [];
  const imagePaths = images.map((image) => image.thumbnail_path ?? image.detail_path);
  const signed = imagePaths.length ? await client.storage.from("collection-images").createSignedUrls(imagePaths, 60 * 60) : { data: [], error: null };
  if (signed.error) throw new Error(signed.error.message);
  const imageUrlByPath = new Map((signed.data ?? []).map((entry, index) => [imagePaths[index], entry.signedUrl]));
  const locationImagePaths = locationImages.map((image) => image.thumbnail_path ?? image.detail_path);
  const locationSigned = locationImagePaths.length ? await client.storage.from("collection-images").createSignedUrls(locationImagePaths, 60 * 60) : { data: [], error: null };
  if (locationSigned.error) throw new Error(locationSigned.error.message);
  const locationImageUrls: Record<string, string | null> = {};
  locationImages.forEach((image, index) => { if (!locationImageUrls[image.location_id]) locationImageUrls[image.location_id] = locationSigned.data?.[index]?.signedUrl ?? null; });
  const imageByStyle = new Map<string, { row: ImageRow; url: string | null }[]>();
  for (const image of images) {
    const list = imageByStyle.get(image.item_style_id) ?? [];
    list.push({ row: image, url: imageUrlByPath.get(image.thumbnail_path ?? image.detail_path) ?? null });
    imageByStyle.set(image.item_style_id, list);
  }
  const styleById = new Map(styles.map((style) => [style.id, style]));
  const ipById = new Map(ips.map((ip) => [ip.id, ip]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const seriesById = new Map(series.map((entry) => [entry.id, entry]));
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const charactersByStyle = new Map<string, CharacterRow[]>();
  for (const link of links) {
    const character = characters.find((entry) => entry.id === link.character_id);
    if (character) charactersByStyle.set(link.item_style_id, [...(charactersByStyle.get(link.item_style_id) ?? []), character]);
  }
  const buildItem = (instance: InstanceRow): ItemView | null => {
    const style = styleById.get(instance.item_style_id);
    if (!style) return null;
    const image = imageByStyle.get(style.id)?.[0];
    return {
      instance,
      style,
      ip: style.ip_id ? ipById.get(style.ip_id) ?? null : null,
      category: style.category_id ? categoryById.get(style.category_id) ?? null : null,
      series: style.series_id ? seriesById.get(style.series_id) ?? null : null,
      characters: charactersByStyle.get(style.id) ?? [],
      location: instance.current_location_id ? locationById.get(instance.current_location_id) ?? null : null,
      path: locationPath(instance.current_location_id, locations),
      imageUrl: image?.url ?? null,
      imageId: image?.row.id ?? null,
      recentMoves: movements.filter((move) => move.item_instance_id === instance.id).slice(0, 5),
    };
  };
  const activeItems = instances.filter((instance) => !instance.deleted_at && !styleById.get(instance.item_style_id)?.deleted_at).map(buildItem).filter(Boolean) as ItemView[];
  const deletedItems = instances.filter((instance) => Boolean(instance.deleted_at) || Boolean(styleById.get(instance.item_style_id)?.deleted_at)).map(buildItem).filter(Boolean) as ItemView[];
  return { household, member: members.find((member) => member.user_id === userId) ?? { household_id: household.id, user_id: userId, role: "member", joined_at: new Date().toISOString() }, members, locations, ips, categories, series, characters, styles, items: activeItems, deletedItems, locationImageUrls, lastExportAt: exportEventsResult.data?.[0]?.created_at ?? null, imageBytes: images.reduce((sum, image) => sum + image.file_size_bytes + image.thumbnail_size_bytes, 0) + locationImages.reduce((sum, image) => sum + image.file_size_bytes + image.thumbnail_size_bytes, 0) };
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
  return <main className="auth-shell"><div className="auth-card"><div className="brand-lockup"><div className="brand-mark">谷</div><div><strong>谷仓</strong><span>OUR COLLECTION</span></div></div><span className="eyebrow">家庭收藏空间</span><h1>{mode === "sign-in" ? "欢迎回来" : "创建你的谷仓"}</h1><p className="auth-copy">{inviteToken ? "登录或注册后即可接受家庭邀请。" : "和家人一起，把每一件收藏放在找得到的地方。"}</p><form onSubmit={submit} className="auth-form">{mode === "sign-up" ? <label>显示名称<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="例如：Dong" required /></label> : null}<label>邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label><label>密码<input type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 6 位" required /></label><button className="submit-button" type="submit" disabled={busy}>{busy ? "处理中…" : mode === "sign-in" ? "登录" : "注册"}</button></form><button className="text-button auth-switch" type="button" onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}>{mode === "sign-in" ? "还没有账号？注册一个" : "已经有账号？直接登录"}</button></div></main>;
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
  return <main className="auth-shell"><div className="auth-card onboarding-card"><div className="brand-lockup"><div className="brand-mark">谷</div><div><strong>谷仓</strong><span>OUR COLLECTION</span></div></div><span className="eyebrow">开始使用</span><h1>先建立一个家庭空间</h1><p className="auth-copy">之后可以邀请另一位成员加入，共同管理收藏和位置。</p><form onSubmit={create} className="auth-form"><label>空间名称<input value={name} onChange={(event) => setName(event.target.value)} required /></label><button className="submit-button" type="submit" disabled={busy}>{busy ? "创建中…" : "创建家庭空间"}</button></form><div className="or-divider"><span>或者</span></div><form onSubmit={accept} className="auth-form"><label>粘贴邀请令牌<input value={token} onChange={(event) => setToken(event.target.value)} placeholder="从邀请链接中复制 token" /></label><button className="secondary-button wide" type="submit" disabled={busy || token.trim().length < 16}>接受邀请并加入</button></form></div></main>;
}

function ItemCard({ item, onOpen }: { item: ItemView; onOpen: (item: ItemView) => void }) {
  const title = item.characters[0]?.name ?? item.style.name;
  return <button className="item-card" type="button" onClick={() => onOpen(item)}><MerchThumb item={item} label={item.style.completion_status === "draft" ? "待完善" : undefined} /><span className="item-card-copy"><strong>{title}</strong><span>{item.category?.name ?? "未分类"} · {statusLabels[item.instance.physical_status]}</span><small>{item.path}</small></span></button>;
}

function SearchResults({ items, onOpenItem }: { items: ItemView[]; onOpenItem: (item: ItemView) => void }) {
  const [mode, setMode] = useState<"cards" | "list">("cards");
  return <section className="search-results" aria-live="polite"><div className="search-results-header"><div><span className="eyebrow">搜索结果</span><h2>找到 {items.length} 件</h2></div><div className="search-view-toggle" role="group" aria-label="结果显示方式"><button type="button" className={mode === "cards" ? "active" : ""} onClick={() => setMode("cards")}>卡片</button><button type="button" className={mode === "list" ? "active" : ""} onClick={() => setMode("list")}>列表</button></div></div>{items.length ? mode === "cards" ? <div className="item-grid">{items.map((item) => <ItemCard key={item.instance.id} item={item} onOpen={onOpenItem} />)}</div> : <div className="search-list">{items.map((item) => <button className="search-list-row" type="button" key={item.instance.id} onClick={() => onOpenItem(item)}><MerchThumb item={item} /><span><strong>{item.characters[0]?.name ?? item.style.name}</strong><small>{[item.ip?.name, item.category?.name, statusLabels[item.instance.physical_status]].filter(Boolean).join(" · ")}</small><em>{item.path}</em></span><i>查看 ›</i></button>)}</div> : <EmptyState title="没有找到收藏" body="试试 IP、角色、品类、系列或位置名称。" />}</section>;
}

function HomeView({ workspace, filteredItems, search, setSearch, onNavigate, onAdd, onOpenItem, onOpenLocation }: { workspace: Workspace; filteredItems: ItemView[]; search: string; setSearch: (value: string) => void; onNavigate: (nav: NavKey) => void; onAdd: () => void; onOpenItem: (item: ItemView) => void; onOpenLocation: (locationId: string) => void }) {
  const draft = workspace.items.filter((item) => item.style.completion_status !== "complete");
  const out = workspace.items.filter((item) => item.instance.physical_status === "temporarily_out");
  const complete = workspace.items.filter((item) => item.style.completion_status === "complete").length;
  const percent = workspace.items.length ? Math.round((complete / workspace.items.length) * 100) : 0;
  const recentLocations = workspace.locations.filter((location) => workspace.items.some((item) => item.location?.id === location.id)).slice(0, 3);
  return <div className={search.trim() ? "page home-page is-searching" : "page home-page"}><div className="page-intro"><div><span className="eyebrow">{new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date())}</span><h1>今天想找什么？</h1><p>把喜欢的东西放在心里，也放在一个找得到的地方。</p></div><div className="intro-orb">✦</div></div><label className="global-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 IP、角色、品类或位置" /><kbd>⌘ K</kbd></label>{search.trim() ? <SearchResults items={filteredItems} onOpenItem={onOpenItem} /> : null}<div className="quick-actions"><button type="button" onClick={() => onNavigate("collection")}><span className="quick-icon lavender">✦</span><span><strong>按 IP 查看</strong><small>浏览家庭收藏</small></span><i>›</i></button><button type="button" onClick={() => onNavigate("locations")}><span className="quick-icon sand">⌖</span><span><strong>按位置查看</strong><small>从房间找到收纳盒</small></span><i>›</i></button><button type="button" onClick={onAdd}><span className="quick-icon mint">＋</span><span><strong>快速暂存</strong><small>先记录，之后慢慢完善</small></span><i>›</i></button></div><div className="home-grid"><section><SectionHeading title="待处理" caption="先把找不到的变成找得到的" action="查看全部" onAction={() => onNavigate("tasks")} /><div className="task-preview"><button type="button" onClick={() => onNavigate("tasks")}><span className="task-icon">◌</span><span><strong>{draft.length} 件资料待完善</strong><small>已经记录位置，之后再补 IP、角色和品类</small></span><b>›</b></button><button type="button" onClick={() => onNavigate("tasks")}><span className="task-icon warm">↩</span><span><strong>{out.length} 件谷子待归位</strong><small>取出后回到家，顺手放回原位</small></span><b>›</b></button></div></section><section className="initialization-card"><div className="initialization-top"><div><span className="eyebrow">资料完整度</span><strong>{complete} <small>/ {workspace.items.length} 件</small></strong></div><span className="progress-ring">{percent}%</span></div><div className="progress-line"><i style={{ width: `${percent}%` }} /></div><p>先确保位置不丢，资料可以以后再慢慢补。</p><button type="button" onClick={() => onNavigate("tasks")}>继续完善 <span>→</span></button></section></div><section className="home-section"><SectionHeading title="最近查看" caption="当前家庭空间中的收藏" action="查看全部" onAction={() => onNavigate("collection")} /><div className="recent-grid">{filteredItems.slice(0, 2).map((item) => <button className="recent-card" key={item.instance.id} type="button" onClick={() => onOpenItem(item)}><MerchThumb item={item} /><span><strong>{item.characters[0]?.name ?? item.style.name}</strong><small>{item.category?.name ?? "未分类"} · {statusLabels[item.instance.physical_status]}</small></span></button>)}{!filteredItems.length ? <EmptyState title="还没有收藏" body="从右下角开始记录第一件谷子。" action="添加谷子" onAction={onAdd} /> : null}</div></section><section className="home-section"><SectionHeading title="最近位置" caption="从收纳空间开始浏览" action="查看位置" onAction={() => onNavigate("locations")} /><div className="location-mini-grid">{recentLocations.map((location) => <button className="location-mini" type="button" key={location.id} onClick={() => onOpenLocation(location.id)}><MerchThumb item={workspace.items.find((item) => item.location?.id === location.id) ?? null} /><span><strong>{location.name}</strong><small>{workspace.items.filter((item) => item.location?.id === location.id).length} 件收藏</small></span></button>)}{!recentLocations.length ? <EmptyState title="还没有位置" body="先建立房间、柜子或收纳盒。" action="去添加" onAction={() => onNavigate("locations")} /> : null}</div></section></div>;
}

function CollectionView({ items, onOpenItem, onAdd }: { items: ItemView[]; onOpenItem: (item: ItemView) => void; onAdd: () => void }) {
  const [mode, setMode] = useState<"ip" | "all">("ip");
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const entry = event.state as AppHistoryState | null;
      if (entry?.gucang && entry.nav === "collection") setSelectedIp(entry.collectionIpId ?? null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const selectIp = (id: string) => {
    window.history.pushState({ gucang: true, role: "app", nav: "collection", overlay: null, locationId: null, collectionIpId: id } satisfies AppHistoryState, "", window.location.pathname);
    setSelectedIp(id);
  };
  const filtered = items.filter((item) => [item.style.name, item.ip?.name, item.category?.name, item.series?.name, ...item.characters.map((character) => character.name), item.path].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase()));
  const ipGroups = Array.from(new Map(filtered.map((item) => [item.ip?.id ?? "none", item.ip?.name ?? "未分类"])).entries());
  if (selectedIp) {
    const group = filtered.filter((item) => (item.ip?.id ?? "none") === selectedIp);
    const name = group[0]?.ip?.name ?? "未分类";
    return <div className="page"><button className="back-link" type="button" onClick={() => window.history.back()}>‹ 我的收藏</button><div className="detail-intro"><div><span className="eyebrow">IP 收藏主页</span><h1>{name}</h1><p>共 {group.length} 件 · {new Set(group.flatMap((item) => item.characters.map((character) => character.name))).size} 个角色</p></div><MerchThumb item={group[0] ?? null} /></div><div className="item-grid">{group.map((item) => <ItemCard key={item.instance.id} item={item} onOpen={onOpenItem} />)}</div></div>;
  }
  return <div className="page"><div className="page-title-row"><div><span className="eyebrow">家庭收藏空间</span><h1>我的收藏</h1><p>按作品浏览，或者像翻收藏册一样慢慢看。</p></div><button className="small-icon-button accent-button" type="button" onClick={onAdd} aria-label="添加">＋</button></div><label className="global-search compact"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 IP、角色、品类或位置" /></label><div className="segmented view-toggle"><button type="button" className={mode === "ip" ? "active" : ""} onClick={() => setMode("ip")}>按 IP</button><button type="button" className={mode === "all" ? "active" : ""} onClick={() => setMode("all")}>全部谷子</button></div>{mode === "ip" ? <><SectionHeading title="收藏的 IP" caption={`${ipGroups.length} 个作品`} /><div className="ip-grid">{ipGroups.map(([id, name]) => { const group = filtered.filter((item) => (item.ip?.id ?? "none") === id); return <button className="ip-card" type="button" key={id} onClick={() => selectIp(id)}><div className="ip-cover"><MerchThumb item={group[0] ?? null} /><span className="ip-count">{group.length} 件</span></div><div className="ip-card-copy"><strong>{name}</strong><span>{new Set(group.flatMap((item) => item.characters.map((character) => character.name))).size} 个角色 · {new Set(group.map((item) => item.category?.name).filter(Boolean)).size} 个品类</span><i>›</i></div></button>; })}{!ipGroups.length ? <EmptyState title="还没有 IP" body="添加第一件谷子后，作品会自动出现在这里。" action="添加谷子" onAction={onAdd} /> : null}</div></> : <><SectionHeading title="全部谷子" caption={`${filtered.length} 件实物实例`} /><div className="item-grid">{filtered.map((item) => <ItemCard key={item.instance.id} item={item} onOpen={onOpenItem} />)}</div></>}</div>;
}

function LocationTree({ locations, items, selected, onSelect }: { locations: LocationRow[]; items: ItemView[]; selected: string | null; onSelect: (id: string) => void }) {
  const render = (parentId: string | null, depth = 0): React.ReactNode => locations.filter((location) => location.parent_id === parentId).map((location) => <div key={location.id}><button type="button" className={`tree-row ${selected === location.id ? "active" : ""}`} style={{ paddingLeft: `${14 + depth * 18}px` }} onClick={() => onSelect(location.id)}><span>{depth ? "└" : "⌂"}</span><strong>{location.name}</strong><small>{items.filter((item) => item.location?.id === location.id).length} 件</small></button>{render(location.id, depth + 1)}</div>);
  return <div className="location-tree">{render(null)}{!locations.length ? <EmptyState title="还没有位置" body="先添加家、书房、柜子或收纳盒。" /> : null}</div>;
}

function LocationsView({ workspace, initialSelected, onAdd, onOpenItem, onDelete }: { workspace: Workspace; initialSelected?: string | null; onAdd: (parentId?: string) => void; onOpenItem: (item: ItemView) => void; onDelete: (location: LocationRow) => void }) {
  const [selected, setSelected] = useState<string | null>(initialSelected ?? null);
  useEffect(() => {
    if (initialSelected !== undefined) setSelected(initialSelected);
  }, [initialSelected]);
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const entry = event.state as AppHistoryState | null;
      if (entry?.gucang && entry.nav === "locations") setSelected(entry.locationId ?? null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const selectLocation = (id: string | null) => {
    if (!id) { window.history.back(); return; }
    window.history.pushState({ gucang: true, role: "app", nav: "locations", overlay: null, locationId: id, collectionIpId: null } satisfies AppHistoryState, "", window.location.pathname);
    setSelected(id);
  };
  const location = workspace.locations.find((entry) => entry.id === selected) ?? null;
  const directItems = location ? workspace.items.filter((item) => item.location?.id === location.id) : [];
  return <div className="page"><div className="page-title-row"><div><span className="eyebrow">实体收纳导航</span><h1>收纳位置</h1><p>位置是自由树状结构，之后可以随时增加抽屉、分区或新的收纳册。</p></div><button className="small-icon-button accent-button" type="button" onClick={() => onAdd(selected ?? undefined)} aria-label="新建位置">＋</button></div>{location ? <><button className="back-link" type="button" onClick={() => selectLocation(null)}>‹ 所有位置</button><div className="location-detail-head"><div><span className="eyebrow">{location.location_type}</span><h1>{location.name}</h1><p>{locationPath(location.id, workspace.locations)}</p></div><MerchThumb item={directItems[0] ?? null} imageUrl={workspace.locationImageUrls[location.id]} /></div><div className="location-actions"><button className="primary-button" type="button" onClick={() => onAdd(location.id)}>＋ 添加子位置</button><button className="secondary-button" type="button" onClick={() => onDelete(location)}>删除位置</button></div><div className="location-summary"><div><span>直接收藏</span><strong>{directItems.length}</strong></div><div><span>子位置</span><strong>{workspace.locations.filter((entry) => entry.parent_id === location.id).length}</strong></div><div><span>位置类型</span><strong>{location.location_type}</strong></div></div><SectionHeading title="这里的收藏" caption="点击查看实物实例" />{directItems.length ? <div className="item-grid">{directItems.map((item) => <ItemCard key={item.instance.id} item={item} onOpen={onOpenItem} />)}</div> : <EmptyState title="这个位置还是空的" body="添加收藏时选择这里，就能从位置快速找回。" />}</> : <><div className="location-tree-note"><span>⌖</span><p>数据库使用自由树状结构，不限制房间、柜子、抽屉、收纳盒和页码的层数。</p></div><LocationTree locations={workspace.locations} items={workspace.items} selected={selected} onSelect={selectLocation} /></>}</div>;
}

function TasksView({ workspace, onOpenItem, onMove, onRestore }: { workspace: Workspace; onOpenItem: (item: ItemView) => void; onMove: (item: ItemView, status: PhysicalStatus, locationId: string | null) => void; onRestore: (item: ItemView) => void }) {
  const [activeTab, setActiveTab] = useState<"draft" | "out" | "trash">("draft");
  const draft = workspace.items.filter((item) => item.style.completion_status !== "complete");
  const out = workspace.items.filter((item) => item.instance.physical_status === "temporarily_out");
  const selectTab = (tab: "draft" | "out" | "trash") => {
    setActiveTab(tab);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };
  return <div className="page"><div className="page-title-row"><div><span className="eyebrow">轻量维护</span><h1>待办</h1><p>不急着一次整理完，今天处理一两件也很好。</p></div><span className="task-count-badge">{draft.length + out.length} 件</span></div><div className="task-tabs" role="tablist" aria-label="待办分类"><button className={activeTab === "draft" ? "active" : ""} type="button" role="tab" aria-selected={activeTab === "draft"} onClick={() => selectTab("draft")}>待完善 <b>{draft.length}</b></button><button className={activeTab === "out" ? "active" : ""} type="button" role="tab" aria-selected={activeTab === "out"} onClick={() => selectTab("out")}>待归位 <b>{out.length}</b></button><button className={activeTab === "trash" ? "active" : ""} type="button" role="tab" aria-selected={activeTab === "trash"} onClick={() => selectTab("trash")}>回收站 <b>{workspace.deletedItems.length}</b></button></div>{activeTab === "draft" ? <section className="task-list" role="tabpanel"><SectionHeading title="资料待完善" caption="已经记录位置，补资料不需要重新拍照" />{draft.length ? draft.map((item) => <button className="task-row" type="button" key={item.instance.id} onClick={() => onOpenItem(item)}><MerchThumb item={item} /><span><strong>{item.style.name}</strong><small>已记录：{item.path}</small><em>缺少 IP、角色或品类</em></span><i>完善 ›</i></button>) : <EmptyState title="资料都很完整" body="新的快速暂存记录会出现在这里。" />}</section> : null}{activeTab === "out" ? <section className="task-list" role="tabpanel"><SectionHeading title="取出未归位" caption="回到收纳位置后点一下即可完成归位" />{out.length ? out.map((item) => <div className="task-row" key={item.instance.id}><MerchThumb item={item} /><span><strong>{item.style.name}</strong><small>默认位置：{locationPath(item.instance.home_location_id, workspace.locations)}</small><em className="warm-text">临时取出</em></span><button className="text-button" type="button" onClick={() => onMove(item, "stored", item.instance.home_location_id)}>归回 ›</button></div>) : <EmptyState title="目前没有待归位" body="取出收藏后，它会出现在这里。" />}</section> : null}{activeTab === "trash" ? <section className="task-list" role="tabpanel"><SectionHeading title="回收站" caption="删除后的收藏保留 7 天，可随时恢复" />{workspace.deletedItems.length ? workspace.deletedItems.map((item) => <div className="task-row" key={item.instance.id}><MerchThumb item={item} label="已删除" /><span><strong>{item.style.name}</strong><small>删除时间：{item.instance.deleted_at ? safeDate(item.instance.deleted_at) : "—"}</small></span><button className="text-button" type="button" onClick={() => onRestore(item)}>恢复 ›</button></div>) : <EmptyState title="回收站为空" body="删除收藏后，会先进入这里。" />}</section> : null}</div>;
}

function ItemForm({ initial, locations, ips, categories, series, onClose, onSave, onError }: { initial?: ItemView | null; locations: LocationRow[]; ips: IpRow[]; categories: CategoryRow[]; series: SeriesRow[]; onClose: () => void; onSave: (values: ItemFormValues) => Promise<void>; onError: (message: string) => void }) {
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
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  const hasRequiredFields = Boolean(name.trim() && ip.trim() && category.trim());
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try { await onSave({ name, ip, character, category, series: seriesName, locationId, notes, status, quick, files, styleId: initial?.style.id, instanceId: initial?.instance.id }); } catch (error) { onError(errorMessage(error)); } finally { setBusy(false); }
  };
  return <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="add-sheet" role="dialog" aria-modal="true"><div className="sheet-handle" /><div className="sheet-header"><div><span className="eyebrow">{initial ? "编辑收藏资料" : "添加到我们的谷仓"}</span><h2>{initial ? "完善这件谷子" : "记录一件谷子"}</h2></div><button className="close-button" type="button" onClick={onClose} aria-label="关闭">×</button></div>{!initial ? <div className="add-mode-tabs"><button type="button" className={quick ? "" : "active"} onClick={() => setQuick(false)}>完整录入</button><button type="button" className={quick ? "active" : ""} onClick={() => setQuick(true)}>快速暂存</button></div> : null}<p className="form-hint">{quick ? "快速暂存可以少填资料；带 * 的字段齐全后仍会正式保存。" : "带 * 的字段为必填，全部填写后可直接保存。"}</p><form onSubmit={submit}><label className="photo-drop"><span>＋</span><strong>{files.length ? `已选择 ${files.length} 张图片` : "拍摄或选择照片"}</strong><small>软件会自动裁剪、压缩为 WebP，并生成缩略图</small><div className="photo-previews" aria-label="照片预览">{previewUrls.map((url, index) => <div className="photo-preview" key={`${url}-${index}`}><img src={url} alt={files[index]?.name ?? `照片 ${index + 1}`} /><span>{index + 1}</span></div>)}</div><input type="file" accept="image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 3))} /></label><div className="form-grid"><label><span className="field-label">款式名称 <i className="required-mark">*</i></span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：影山飞雄 Jump Festa徽章" /></label><label><span className="field-label">IP <i className="required-mark">*</i></span><input value={ip} onChange={(event) => setIp(event.target.value)} list="ip-options" placeholder="搜索或输入 IP" /><datalist id="ip-options">{ips.map((entry) => <option key={entry.id} value={entry.name} />)}</datalist></label><label>角色<input value={character} onChange={(event) => setCharacter(event.target.value)} placeholder="可稍后补充" /></label><label><span className="field-label">品类 <i className="required-mark">*</i></span><input value={category} onChange={(event) => setCategory(event.target.value)} list="category-options" placeholder="例如：徽章" /><datalist id="category-options">{categories.map((entry) => <option key={entry.id} value={entry.name} />)}</datalist></label><label>系列<input value={seriesName} onChange={(event) => setSeriesName(event.target.value)} list="series-options" placeholder="例如：Jump Festa 2025" /><datalist id="series-options">{series.map((entry) => <option key={entry.id} value={entry.name} />)}</datalist></label><label>当前位置<select value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">暂不指定</option>{locations.map((location) => <option key={location.id} value={location.id}>{locationPath(location.id, locations)}</option>)}</select></label></div>{initial ? <label>状态<select value={status} onChange={(event) => setStatus(event.target.value as PhysicalStatus)}><option value="stored">已收纳</option><option value="displayed">展示中</option><option value="temporarily_out">临时取出</option><option value="unknown">待确认</option></select></label> : null}<label>备注<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="想记下什么？" rows={3} /></label><button className="submit-button" type="submit" disabled={busy}>{busy ? "保存中…" : hasRequiredFields ? (initial ? "保存修改" : "保存") : "保存为待完善"}</button></form></section></div>;
}

function LocationForm({ locations, parentId, onClose, onSave, onError }: { locations: LocationRow[]; parentId?: string; onClose: () => void; onSave: (name: string, type: string, description: string, parentId: string | null, files: File[]) => Promise<void>; onError: (message: string) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("其他");
  const [description, setDescription] = useState("");
  const [selectedParent, setSelectedParent] = useState(parentId ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  return <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="add-sheet" role="dialog" aria-modal="true"><div className="sheet-header"><div><span className="eyebrow">自由树状位置</span><h2>新建收纳位置</h2></div><button className="close-button" type="button" onClick={onClose}>×</button></div><form onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { await onSave(name, type, description, selectedParent || null, files); } catch (error) { onError(errorMessage(error)); } finally { setBusy(false); } }}><label>名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：书房、蓝色徽章册、第4页" required /></label><label>位置类型<select value={type} onChange={(event) => setType(event.target.value)}>{locationTypes.map((entry) => <option key={entry}>{entry}</option>)}</select></label><label>上级位置<select value={selectedParent} onChange={(event) => setSelectedParent(event.target.value)}><option value="">无（根位置）</option>{locations.map((location) => <option key={location.id} value={location.id}>{locationPath(location.id, locations)}</option>)}</select></label><label className="photo-drop"><span>＋</span><strong>{files.length ? `已选择 ${files.length} 张位置照片` : "添加位置照片"}</strong><small>照片会自动压缩，不上传手机原图</small><div className="photo-previews" aria-label="位置照片预览">{previewUrls.map((url, index) => <div className="photo-preview" key={`${url}-${index}`}><img src={url} alt={files[index]?.name ?? `位置照片 ${index + 1}`} /><span>{index + 1}</span></div>)}</div><input type="file" accept="image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 3))} /></label><label>备注<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="可选" /></label><button className="submit-button" type="submit" disabled={busy}>{busy ? "保存中…" : "保存位置"}</button></form></section></div>;
}

function ItemSheet({ item, locations, onClose, onEdit, onMove, onDelete }: { item: ItemView; locations: LocationRow[]; onClose: () => void; onEdit: () => void; onMove: (status: PhysicalStatus, locationId: string | null) => void; onDelete: () => void }) {
  const [status, setStatus] = useState<PhysicalStatus>(item.instance.physical_status);
  const [locationId, setLocationId] = useState(item.location?.id ?? item.instance.home_location_id ?? "");
  const title = item.characters[0]?.name ?? item.style.name;
  const isTemporarilyOut = item.instance.physical_status === "temporarily_out";
  return <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="item-sheet" role="dialog" aria-modal="true"><div className="item-sheet-art"><MerchThumb item={item} /><button className="close-button floating" type="button" onClick={onClose}>×</button></div><div className="item-sheet-body"><div className="eyebrow">{item.ip?.name ?? "未分类"}</div><h2>{title}</h2><p className="item-meta">{item.series?.name ?? "未填写"} · {item.category?.name ?? "未分类"}</p><div className={`status-pill status-${item.instance.physical_status === "stored" ? "stored" : item.instance.physical_status === "displayed" ? "display" : "pending"}`}><span />{statusLabels[item.instance.physical_status]}</div><div className="current-location"><span className="location-pin">⌖</span><div><small>当前位置</small><strong>{item.location?.name ?? "暂未指定"}</strong><p>{item.path}</p></div></div><div className="item-actions"><button className={isTemporarilyOut ? "secondary-button" : "primary-button"} type="button" onClick={() => onMove("temporarily_out", item.location?.id ?? item.instance.home_location_id)}>取出</button><button className={isTemporarilyOut ? "primary-button" : "secondary-button"} type="button" onClick={() => onMove("stored", item.instance.home_location_id)}>归位</button><button className="secondary-button" type="button" onClick={onEdit}>编辑</button></div><div className="move-control"><label>移动到<select value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">暂不指定</option>{locations.map((location) => <option key={location.id} value={location.id}>{locationPath(location.id, locations)}</option>)}</select></label><label>状态<select value={status} onChange={(event) => setStatus(event.target.value as PhysicalStatus)}><option value="stored">已收纳</option><option value="displayed">展示中</option><option value="temporarily_out">临时取出</option><option value="unknown">待确认</option></select></label><button className="secondary-button wide" type="button" onClick={() => onMove(status, locationId || null)}>保存移动</button></div><div className="item-history"><span>最近记录</span>{item.recentMoves.length ? item.recentMoves.map((move) => <strong key={move.id}>{statusLabels[move.to_status ?? "unknown"]} · {safeDate(move.created_at)}</strong>) : <strong>刚刚加入收藏</strong>}<small>所有移动操作都会保留历史记录</small></div><button className="danger-button" type="button" onClick={onDelete}>移入回收站</button></div></section></div>;
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
  return <div className="page settings-page"><div className="page-title-row"><div><span className="eyebrow">空间与数据安全</span><h1>设置</h1><p>管理家庭成员、导出备份和账户资料。</p></div></div><section className="settings-card"><SectionHeading title="我的账号" caption={user.email ?? ""} /><label>显示名称<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><button className="secondary-button" type="button" onClick={saveProfile}>保存资料</button></section><section className="settings-card"><SectionHeading title="邀请家庭成员" caption="邀请链接 14 天内有效，只有指定邮箱可以接受" /><form className="inline-form" onSubmit={async (event) => { event.preventDefault(); setInviteBusy(true); try { setInviteLink(await onInvite(email.trim())); setEmail(""); } catch (error) { onMessage(errorMessage(error), "error"); } finally { setInviteBusy(false); } }}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="对方的邮箱" required /><button className="primary-button" type="submit" disabled={inviteBusy}>{inviteBusy ? "生成中…" : "生成邀请"}</button></form>{inviteLink ? <div className="invite-result"><input readOnly value={inviteLink} onFocus={(event) => event.currentTarget.select()} /><button className="secondary-button" type="button" onClick={() => navigator.clipboard.writeText(inviteLink).then(() => onMessage("邀请链接已复制", "success"))}>复制链接</button></div> : null}</section><section className="settings-card"><SectionHeading title="完整备份" caption={`上次导出：${workspace.lastExportAt ? safeDate(workspace.lastExportAt) : "尚未导出"}；当前图片约 ${formatBytes(workspace.imageBytes)}`} />{exportIsStale ? <p className="settings-warning">建议每 30 天导出一次完整备份。</p> : null}<button className="primary-button" type="button" disabled={exportBusy} onClick={async () => { setExportBusy(true); try { await onExport(); } catch (error) { onMessage(errorMessage(error), "error"); } finally { setExportBusy(false); } }}>{exportBusy ? "整理备份中…" : "导出 ZIP 备份"}</button><p className="settings-note">备份包含 JSON、CSV、位置、收藏、移动记录，以及可读取到的图片文件。</p></section><section className="settings-card"><SectionHeading title="回收站" caption="删除后的记录保留 7 天" />{workspace.deletedItems.length ? workspace.deletedItems.map((item) => <div className="settings-row" key={item.instance.id}><span>{item.style.name}<small>{item.instance.deleted_at ? safeDate(item.instance.deleted_at) : "—"}</small></span><button className="text-button" type="button" onClick={() => onRestore(item)}>恢复</button></div>) : <p className="settings-note">回收站是空的。</p>}</section>{isAdmin && onDeleteHousehold ? <section className="settings-card danger-card"><SectionHeading title="危险操作" caption="删除家庭空间前会要求再次确认名称。" /><button className="danger-button" type="button" onClick={onDeleteHousehold}>删除家庭空间</button></section> : null}</div>;
}

export default function Home() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<NavKey>("home");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const [authInviteToken, setAuthInviteToken] = useState("");
  const [itemForm, setItemFormState] = useState<{ open: boolean; initial: ItemView | null; locationId?: string }>({ open: false, initial: null });
  const [locationForm, setLocationFormState] = useState<{ open: boolean; parentId?: string }>({ open: false });
  const [selectedItem, setSelectedItemState] = useState<ItemView | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedCollectionIpId, setSelectedCollectionIpId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [inviteHandled, setInviteHandled] = useState(false);
  const workspaceRef = useRef<Workspace | null>(null);
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
    if (!client || !user) return false;
    setLoading(true);
    try {
      const { data: memberRows, error: memberError } = await client.from("household_members").select("*").eq("user_id", user.id);
      if (memberError) throw memberError;
      const ids = (memberRows ?? []).map((row) => row.household_id);
      if (!ids.length) { setHouseholds([]); setWorkspace(null); return true; }
      const { data: householdRows, error: householdError } = await client.from("households").select("*").in("id", ids).is("deleted_at", null).order("created_at");
      if (householdError) throw householdError;
      const available = householdRows ?? [];
      setHouseholds(available);
      const household = available.find((entry) => entry.id === (nextHouseholdId ?? activeHouseholdId)) ?? available[0];
      if (!household) { setWorkspace(null); return true; }
      setActiveHouseholdId(household.id);
      await purgeExpiredItems(client, household.id);
      setWorkspace(await loadWorkspace(client, household, user.id));
      setError(null);
      return true;
    } catch (loadError) {
      const message = errorMessage(loadError);
      setError(message);
      notify(message, "error");
      return false;
    } finally { setLoading(false); }
  }, [activeHouseholdId, client, notify, user]);

  useEffect(() => {
    let mounted = true;
    let browserClient: SupabaseClient;
    try {
      browserClient = createSupabaseBrowserClient();
      setClient(browserClient);
    } catch (clientError) { setError(errorMessage(clientError)); setLoading(false); return; }
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite") ?? "";
    setAuthInviteToken(invite);
    if (params.get("auth_error") === "callback") {
      notify("邮箱确认链接无效或已过期，请重新注册", "error");
      window.history.replaceState({}, "", window.location.pathname);
    }
    browserClient.auth.getUser().then(({ data, error: authError }) => { if (authError && authError.message !== "Auth session missing!") setError(authError.message); if (mounted) { setUser(data.user); setLoading(false); } });
    const { data: subscription } = browserClient.auth.onAuthStateChange((_event, session) => { if (mounted) setUser(session?.user ?? null); });
    return () => { mounted = false; subscription.subscription.unsubscribe(); };
  }, [notify]);

  useEffect(() => { if (client && user) void reload(); else if (!user) setWorkspace(null); }, [client, user, reload]);

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
  const filteredItems = useMemo(() => { const query = search.trim().toLowerCase(); if (!query) return activeItems; return activeItems.filter((item) => [item.style.name, item.ip?.name, item.category?.name, item.series?.name, item.path, ...item.characters.map((character) => character.name)].filter(Boolean).join(" ").toLowerCase().includes(query)); }, [activeItems, search]);

  const pushHistory = useCallback((entry: AppHistoryState) => {
    if (typeof window !== "undefined") window.history.pushState(entry, "", window.location.pathname);
  }, []);
  const findItemById = useCallback((itemId?: string) => {
    if (!itemId) return null;
    const current = workspaceRef.current;
    return [...(current?.items ?? []), ...(current?.deletedItems ?? [])].find((entry) => entry.instance.id === itemId) ?? null;
  }, []);
  const applyHistoryEntry = useCallback((entry: AppHistoryState) => {
    setActiveNav(entry.nav);
    setSearch(entry.search ?? "");
    setProfileOpen(false);
    setSelectedLocationId(entry.locationId ?? null);
    setSelectedCollectionIpId(entry.collectionIpId ?? null);
    setSelectedItemState(entry.overlay === "item" ? findItemById(entry.itemId) : null);
    setItemFormState(entry.overlay === "itemForm" ? { open: true, initial: findItemById(entry.itemId) } : { open: false, initial: null });
    setLocationFormState(entry.overlay === "locationForm" ? { open: true, parentId: entry.locationId ?? undefined } : { open: false });
  }, [findItemById]);
  const makeHistoryEntry = useCallback((overrides: Partial<AppHistoryState> = {}): AppHistoryState => {
    const current = typeof window !== "undefined" ? window.history.state as Partial<AppHistoryState> | null : null;
    return { gucang: true, role: "app", nav: activeNav, overlay: null, locationId: current?.gucang ? current.locationId : selectedLocationId, collectionIpId: current?.gucang ? current.collectionIpId : selectedCollectionIpId, search, ...overrides };
  }, [activeNav, search, selectedCollectionIpId, selectedLocationId]);
  const handleBack = useCallback(() => {
    if (profileOpen) { setProfileOpen(false); return; }
    const state = typeof window !== "undefined" ? window.history.state as Partial<AppHistoryState> | null : null;
    if (state?.gucang) { window.history.back(); return; }
    if (itemForm.open) { setItemFormState({ open: false, initial: null }); return; }
    if (locationForm.open) { setLocationFormState({ open: false }); return; }
    if (selectedItem) { setSelectedItemState(null); return; }
    if (selectedCollectionIpId) { setSelectedCollectionIpId(null); return; }
    if (selectedLocationId) { setSelectedLocationId(null); return; }
    if (activeNav !== "home") setActiveNav("home");
  }, [activeNav, itemForm.open, locationForm.open, profileOpen, selectedCollectionIpId, selectedItem, selectedLocationId]);
  const navigate = useCallback((nav: NavKey) => {
    const entry = makeHistoryEntry({ nav, overlay: null, locationId: null, collectionIpId: null, search: "" });
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
  const openLocationForm = useCallback((parentId?: string) => {
    const entry = makeHistoryEntry({ overlay: "locationForm", locationId: parentId ?? null });
    pushHistory(entry);
    applyHistoryEntry(entry);
  }, [applyHistoryEntry, makeHistoryEntry, pushHistory]);
  const openLocation = useCallback((locationId: string) => {
    const entry = makeHistoryEntry({ nav: "locations", overlay: null, locationId, collectionIpId: null });
    pushHistory(entry);
    applyHistoryEntry(entry);
  }, [applyHistoryEntry, makeHistoryEntry, pushHistory]);
  const closeOverlay = useCallback(() => handleBack(), [handleBack]);
  const setItemForm = useCallback((value: { open: boolean; initial: ItemView | null; locationId?: string }) => {
    if (value.open) openItemForm(value.initial);
    else closeOverlay();
  }, [closeOverlay, openItemForm]);
  const setLocationForm = useCallback((value: { open: boolean; parentId?: string }) => {
    if (value.open) openLocationForm(value.parentId);
    else closeOverlay();
  }, [closeOverlay, openLocationForm]);
  const setSelectedItem = useCallback((item: ItemView | null) => {
    if (item) openItem(item);
    else if ((window.history.state as Partial<AppHistoryState> | null)?.overlay !== "itemForm") closeOverlay();
  }, [closeOverlay, openItem]);

  useEffect(() => {
    if (!currentUserId || !workspaceReady) { historyUserRef.current = null; return; }
    if (historyUserRef.current === currentUserId) return;
    historyUserRef.current = currentUserId;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const homeEntry: AppHistoryState = { gucang: true, role: "app", nav: "home", overlay: null, locationId: null, collectionIpId: null, search: "" };
    if (standalone) {
      window.history.replaceState({ ...homeEntry, role: "guard" }, "", window.location.pathname);
      window.history.pushState(homeEntry, "", window.location.pathname);
    } else {
      window.history.replaceState(homeEntry, "", window.location.pathname);
    }
    const onPopState = (event: PopStateEvent) => {
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
  }, [applyHistoryEntry, currentUserId, workspaceReady]);

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      const target = event.target as HTMLElement | null;
      if (touch.clientX > 36 || target?.closest("input, textarea, select, [contenteditable='true']")) return;
      start = { x: touch.clientX, y: touch.clientY };
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.changedTouches[0];
      const distanceX = touch.clientX - start.x;
      const distanceY = touch.clientY - start.y;
      if (distanceX >= 72 && Math.abs(distanceY) <= 96) handleBack();
      start = null;
    };
    const reset = () => { start = null; };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", reset, { passive: true });
    return () => { window.removeEventListener("touchstart", onTouchStart); window.removeEventListener("touchend", onTouchEnd); window.removeEventListener("touchcancel", reset); };
  }, [handleBack]);

  const createHousehold = async (household: Household) => { if (await reload(household.id)) notify("家庭空间已创建", "success"); };
  const addItem = async (values: ItemFormValues) => {
    if (!client || !user || !workspace) return;
    const findName = (value: string) => value.trim().toLowerCase();
    const resolveIp = async () => { const existing = workspace.ips.find((entry) => findName(entry.name) === findName(values.ip)); if (existing || !values.ip.trim()) return existing ?? null; const result = await client.from("ips").insert({ household_id: workspace.household.id, name: values.ip.trim(), name_zh: values.ip.trim(), created_by: user.id }).select().single(); if (result.error) throw result.error; return result.data; };
    const resolveCategory = async () => { const existing = workspace.categories.find((entry) => findName(entry.name) === findName(values.category)); if (existing || !values.category.trim()) return existing ?? null; const result = await client.from("categories").insert({ household_id: workspace.household.id, name: values.category.trim() }).select().single(); if (result.error) throw result.error; return result.data; };
    const ip = await resolveIp();
    const category = await resolveCategory();
    let series = workspace.series.find((entry) => findName(entry.name) === findName(values.series) && entry.ip_id === ip?.id) ?? null;
    if (!series && values.series.trim()) { const result = await client.from("series").insert({ household_id: workspace.household.id, name: values.series.trim(), ip_id: ip?.id ?? null }).select().single(); if (result.error) throw result.error; series = result.data; }
    const completion = !values.name.trim() || !values.ip.trim() || !values.category.trim() ? "draft" : "complete";
    const searchText = [values.name, values.ip, values.character, values.category, values.series, values.notes].filter(Boolean).join(" ");
    const editingStyle = Boolean(values.styleId);
    let styleId = values.styleId;
    if (!styleId && values.name.trim()) {
      const existingStyle = workspace.styles.find((style) => !style.deleted_at && findName(style.name) === findName(values.name) && style.ip_id === (ip?.id ?? null) && style.category_id === (category?.id ?? null) && style.series_id === (series?.id ?? null));
      if (existingStyle) styleId = existingStyle.id;
    }
    if (styleId) {
      const result = await client.from("item_styles").update({ name: values.name.trim() || "未命名谷子", ip_id: ip?.id ?? null, category_id: category?.id ?? null, series_id: series?.id ?? null, notes: values.notes.trim() || null, search_text: searchText, completion_status: completion, updated_by: user.id, deleted_at: null }).eq("id", styleId).select().single();
      if (result.error) throw result.error;
      if (editingStyle) await client.from("item_style_characters").delete().eq("item_style_id", styleId);
    } else {
      const result = await client.from("item_styles").insert({ household_id: workspace.household.id, name: values.name.trim() || "未命名谷子", ip_id: ip?.id ?? null, category_id: category?.id ?? null, series_id: series?.id ?? null, notes: values.notes.trim() || null, search_text: searchText, completion_status: completion, created_by: user.id, updated_by: user.id }).select().single();
      if (result.error) throw result.error;
      styleId = result.data.id;
    }
    if (values.character.trim() && ip) {
      let character = workspace.characters.find((entry) => entry.ip_id === ip.id && findName(entry.name) === findName(values.character));
      if (!character) { const result = await client.from("characters").insert({ household_id: workspace.household.id, ip_id: ip.id, name: values.character.trim(), created_by: user.id }).select().single(); if (result.error) throw result.error; character = result.data; }
      const linkResult = await client.from("item_style_characters").insert({ item_style_id: styleId, character_id: character.id });
      if (linkResult.error && !linkResult.error.message.includes("duplicate")) throw linkResult.error;
    }
    const existingInstance = values.instanceId
      ? [...workspace.items, ...workspace.deletedItems].find((item) => item.instance.id === values.instanceId)?.instance ?? null
      : null;
    const targetLocation = values.status === "temporarily_out" ? null : values.locationId || null;
    const homeLocation = values.locationId || existingInstance?.home_location_id || null;
    let instanceId = values.instanceId;
    if (!instanceId) {
      const result = await client.from("item_instances").insert({ household_id: workspace.household.id, item_style_id: styleId, current_location_id: targetLocation, home_location_id: homeLocation, physical_status: values.status, created_by: user.id, updated_by: user.id }).select().single();
      if (result.error) throw result.error;
      instanceId = result.data.id;
    } else {
      const homeResult = await client.from("item_instances").update({ home_location_id: homeLocation, updated_by: user.id, deleted_at: null }).eq("id", instanceId);
      if (homeResult.error) throw homeResult.error;
      if (existingInstance?.current_location_id !== targetLocation || existingInstance.physical_status !== values.status) {
        const moveResult = await client.rpc("move_item_instance", { target_instance: instanceId, target_location: targetLocation as unknown as string, target_status: values.status, target_note: "通过编辑表单更新" });
        if (moveResult.error) throw moveResult.error;
      }
    }
    for (const [index, file] of values.files.entries()) {
      const detail = await compressImage(file, 1800, 500 * 1024);
      const thumbnail = await compressImage(file, 600, 80 * 1024);
      const base = `households/${workspace.household.id}/items/${styleId}/${crypto.randomUUID()}`;
      const detailPath = `${base}-detail.webp`;
      const thumbnailPath = `${base}-thumb.webp`;
      const detailUpload = await client.storage.from("collection-images").upload(detailPath, detail.blob, { contentType: "image/webp", upsert: false });
      if (detailUpload.error) throw detailUpload.error;
      const thumbUpload = await client.storage.from("collection-images").upload(thumbnailPath, thumbnail.blob, { contentType: "image/webp", upsert: false });
      if (thumbUpload.error) throw thumbUpload.error;
      const imageResult = await client.from("item_images").insert({ household_id: workspace.household.id, item_style_id: styleId, image_type: index === 0 ? "main" : "attachment", detail_path: detailPath, thumbnail_path: thumbnailPath, file_size_bytes: detail.blob.size, thumbnail_size_bytes: thumbnail.blob.size, width: detail.width, height: detail.height, sort_order: index, created_by: user.id });
      if (imageResult.error) throw imageResult.error;
    }
    await reload();
    closeOverlay();
    notify(values.instanceId ? "收藏资料已更新" : completion === "draft" ? "已保存到待完善" : "谷子已加入收藏");
  };

  const moveItem = async (item: ItemView, status: PhysicalStatus, locationId: string | null) => {
    if (!client) return;
    const { error: moveError } = await client.rpc("move_item_instance", { target_instance: item.instance.id, target_location: (locationId ?? null) as unknown as string, target_status: status });
    if (moveError) { notify(errorMessage(moveError), "error"); return; }
    closeOverlay();
    await reload();
    notify(status === "temporarily_out" ? "已标记为取出" : "位置和状态已更新");
  };

  const deleteItem = async (item: ItemView) => { if (!client || !workspace) return; if (!window.confirm("这件收藏会先进入回收站，7天内可以恢复。确定继续吗？")) return; const { error: itemError } = await client.from("item_instances").update({ deleted_at: new Date().toISOString(), updated_by: user?.id }).eq("id", item.instance.id); if (itemError) { notify(errorMessage(itemError), "error"); return; } closeOverlay(); await reload(); notify("已移入回收站", "success"); };
  const restoreItem = async (item: ItemView) => { if (!client) return; const { error } = await client.from("item_instances").update({ deleted_at: null, updated_by: user?.id }).eq("id", item.instance.id); if (error) { notify(errorMessage(error), "error"); return; } const styleResult = await client.from("item_styles").update({ deleted_at: null, updated_by: user?.id }).eq("id", item.style.id); if (styleResult.error) { notify(errorMessage(styleResult.error), "error"); return; } await reload(); notify("收藏已恢复", "success"); };

  const addLocation = async (name: string, type: string, description: string, parentId: string | null, files: File[]) => {
    if (!client || !workspace || !user) return;
    const result = await client.from("locations").insert({ household_id: workspace.household.id, parent_id: parentId, name: name.trim(), location_type: type, description: description.trim() || null, created_by: user.id }).select().single();
    if (result.error) throw result.error;
    for (const [index, file] of files.entries()) {
      const detail = await compressImage(file, 1800, 500 * 1024);
      const thumbnail = await compressImage(file, 600, 80 * 1024);
      const base = `households/${workspace.household.id}/locations/${result.data.id}/${crypto.randomUUID()}`;
      const detailPath = `${base}-detail.webp`;
      const thumbnailPath = `${base}-thumb.webp`;
      const detailUpload = await client.storage.from("collection-images").upload(detailPath, detail.blob, { contentType: "image/webp", upsert: false });
      if (detailUpload.error) throw detailUpload.error;
      const thumbnailUpload = await client.storage.from("collection-images").upload(thumbnailPath, thumbnail.blob, { contentType: "image/webp", upsert: false });
      if (thumbnailUpload.error) throw thumbnailUpload.error;
      const imageResult = await client.from("location_images").insert({ household_id: workspace.household.id, location_id: result.data.id, image_type: index === 0 ? "main" : "attachment", detail_path: detailPath, thumbnail_path: thumbnailPath, file_size_bytes: detail.blob.size, thumbnail_size_bytes: thumbnail.blob.size, width: detail.width, height: detail.height, created_by: user.id });
      if (imageResult.error) throw imageResult.error;
    }
    closeOverlay();
    await reload();
    notify("位置已创建");
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

  const createInvite = async (email: string) => { if (!client || !workspace || !user) throw new Error("请先登录"); const token = newInviteToken(); const tokenHash = await hashToken(token); const { error } = await client.from("household_invites").insert({ household_id: workspace.household.id, email, token_hash: tokenHash, expires_at: new Date(Date.now() + 14 * 86400000).toISOString(), invited_by: user.id, role: "member" }); if (error) throw error; return `${window.location.origin}/?invite=${token}`; };

  const exportBackup = async () => {
    if (!client || !workspace || !user) return;
    const entries: Record<string, unknown[]> = {};
    const queries = [
      ["households", client.from("households").select("*").eq("id", workspace.household.id)],
      ["household_members", client.from("household_members").select("*").eq("household_id", workspace.household.id)],
      ["household_invites", client.from("household_invites").select("*").eq("household_id", workspace.household.id)],
      ["ips", client.from("ips").select("*").eq("household_id", workspace.household.id)],
      ["characters", client.from("characters").select("*").eq("household_id", workspace.household.id)],
      ["categories", client.from("categories").select("*").eq("household_id", workspace.household.id)],
      ["series", client.from("series").select("*").eq("household_id", workspace.household.id)],
      ["locations", client.from("locations").select("*").eq("household_id", workspace.household.id)],
      ["item_styles", client.from("item_styles").select("*").eq("household_id", workspace.household.id)],
      ["item_style_characters", client.from("item_style_characters").select("*")],
      ["item_instances", client.from("item_instances").select("*").eq("household_id", workspace.household.id)],
      ["item_images", client.from("item_images").select("*").eq("household_id", workspace.household.id)],
      ["location_images", client.from("location_images").select("*").eq("household_id", workspace.household.id)],
      ["movement_events", client.from("movement_events").select("*").eq("household_id", workspace.household.id)],
      ["activity_events", client.from("activity_events").select("*").eq("household_id", workspace.household.id)],
    ] as const;
    for (const [table, query] of queries) { const result = await query; if (result.error) throw result.error; entries[table] = result.data as unknown[]; }
    const zip = new JSZip();
    zip.file("data.json", JSON.stringify({ exported_at: new Date().toISOString(), household: workspace.household, tables: entries }, null, 2));
    for (const [table, rows] of Object.entries(entries)) zip.file(`${table}.csv`, toCsv(rows as Array<Record<string, unknown>>));
    const imageRows = [...(entries.item_images ?? []), ...(entries.location_images ?? [])] as Array<Record<string, unknown>>;
    for (const image of imageRows) { const path = String(image.detail_path ?? ""); if (!path) continue; const signed = await client.storage.from("collection-images").createSignedUrl(path, 600); if (signed.data?.signedUrl) { try { const response = await fetch(signed.data.signedUrl); if (response.ok) zip.file(`images/${path.split("/").pop()}`, await response.blob()); } catch { /* missing image does not block the data backup */ } } }
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    downloadBlob(blob, `gucang-backup-${new Date().toISOString().slice(0, 10)}.zip`);
    const eventResult = await client.from("export_events").insert({ household_id: workspace.household.id, actor_id: user.id, format: "zip", file_size_bytes: blob.size }).select().single();
    if (eventResult.error) throw eventResult.error;
    await reload(workspace.household.id);
    notify("完整备份已下载");
  };

  if (loading && !workspace) return <div className="loading-shell"><div className="brand-mark">谷</div><p>正在打开你的谷仓…</p></div>;
  if (error && !client) return <main className="route-error-shell"><div className="route-error-card"><span className="feedback-icon feedback-error">!</span><span className="eyebrow">连接出现问题</span><h1>暂时无法打开谷仓</h1><p>{error}</p><button className="primary-button" type="button" onClick={() => window.location.reload()}>重新加载</button></div></main>;
  const feedbackView = feedback ? <FeedbackBanner feedback={feedback} onDismiss={() => setFeedback(null)} /> : null;
  if (!user) return <><AuthView client={client} inviteToken={authInviteToken} onMessage={notify} />{feedbackView}</>;
  if (!workspace) return <><EmptyWorkspace client={client!} inviteToken={authInviteToken} onCreated={createHousehold} onMessage={notify} />{feedbackView}</>;

  const activeHousehold = households.find((household) => household.id === activeHouseholdId) ?? workspace.household;
  const storagePercent = activeHousehold.storage_quota_bytes > 0 ? Math.min(100, Math.round((workspace.imageBytes / activeHousehold.storage_quota_bytes) * 100)) : 0;
  const storageWarning = storagePercent >= 95 ? "图片空间接近上限，请先导出备份。" : storagePercent >= 85 ? "图片空间已使用较多，建议及时导出备份。" : storagePercent >= 70 ? "图片空间已使用 70%，请留意容量。" : null;
  const renderBottomItem = (item: (typeof navItems)[number]) => <button key={item.id} className={activeNav === item.id ? "bottom-item active" : "bottom-item"} type="button" onClick={() => navigate(item.id)}><span>{item.icon}</span>{item.label}{item.id === "tasks" && (workspace.items.filter((entry) => entry.style.completion_status !== "complete" || entry.instance.physical_status === "temporarily_out").length > 0) ? <em>{workspace.items.filter((entry) => entry.style.completion_status !== "complete" || entry.instance.physical_status === "temporarily_out").length}</em> : null}</button>;
  return <div className="app-shell"><aside className="side-nav"><div className="brand-lockup"><div className="brand-mark">谷</div><div><strong>谷仓</strong><span>OUR COLLECTION</span></div></div><label className="household-switcher"><span className="household-avatar">家</span><span><strong>{activeHousehold.name}</strong><small>{workspace.members.length} 位成员 · 家庭空间</small></span><select aria-label="切换家庭空间" value={activeHousehold.id} onChange={(event) => void reload(event.target.value)}>{households.map((household) => <option key={household.id} value={household.id}>{household.name}</option>)}</select></label><nav className="nav-list" aria-label="主导航">{navItems.map((item) => <button key={item.id} className={activeNav === item.id ? "nav-item active" : "nav-item"} onClick={() => navigate(item.id)} type="button"><span>{item.icon}</span>{item.label}{item.id === "tasks" && (workspace.items.filter((entry) => entry.style.completion_status !== "complete" || entry.instance.physical_status === "temporarily_out").length > 0) ? <em>{workspace.items.filter((entry) => entry.style.completion_status !== "complete" || entry.instance.physical_status === "temporarily_out").length}</em> : null}</button>)}</nav><div className="side-footer"><div className="storage-meter"><div><span>图片空间</span><b>{storagePercent}%</b></div><div className="meter-track"><i style={{ width: `${storagePercent}%` }} /></div><small>已使用 {formatBytes(workspace.imageBytes)} / {formatBytes(activeHousehold.storage_quota_bytes)}</small>{storageWarning ? <small className="storage-warning">{storageWarning}</small> : null}</div><button className="settings-link" type="button" onClick={() => navigate("settings")}>⚙ 设置</button></div></aside><main className="main-column"><header className="topbar"><div className="mobile-brand"><span className="brand-mark">谷</span><strong>谷仓</strong></div><div className="topbar-actions"><button type="button" className="icon-button" aria-label="刷新" onClick={() => void reload()}>↻</button><button type="button" className="profile-chip" onClick={() => setProfileOpen((open) => !open)}>{(user.user_metadata?.display_name ?? user.email ?? "我").slice(0, 1).toUpperCase()}</button>{profileOpen ? <div className="profile-menu"><strong>{user.user_metadata?.display_name ?? "谷仓成员"}</strong><small>{user.email}</small><button type="button" className="profile-settings" onClick={() => { setProfileOpen(false); navigate("settings"); }}>设置</button><button type="button" onClick={() => void client?.auth.signOut()}>退出登录</button></div> : null}</div></header><div className="content-wrap">{activeNav === "home" ? <HomeView workspace={workspace} filteredItems={filteredItems} search={search} setSearch={setSearch} onNavigate={navigate} onAdd={() => setItemForm({ open: true, initial: null })} onOpenItem={setSelectedItem} onOpenLocation={openLocation} /> : null}{activeNav === "collection" ? <CollectionView items={filteredItems} onOpenItem={setSelectedItem} onAdd={() => setItemForm({ open: true, initial: null })} /> : null}{activeNav === "locations" ? <LocationsView workspace={workspace} initialSelected={pendingLocationId} onAdd={(parentId) => setLocationForm({ open: true, parentId })} onOpenItem={setSelectedItem} onDelete={deleteLocation} /> : null}{activeNav === "tasks" ? <TasksView workspace={workspace} onOpenItem={setSelectedItem} onMove={moveItem} onRestore={restoreItem} /> : null}{activeNav === "settings" ? <SettingsView client={client!} workspace={workspace} user={user} onInvite={createInvite} onExport={exportBackup} onRestore={restoreItem} onDeleteHousehold={deleteHousehold} onMessage={notify} /> : null}</div></main><nav className="bottom-nav" aria-label="移动端主导航">{navItems.slice(0, 2).map(renderBottomItem)}<button className="bottom-add" type="button" onClick={() => setItemForm({ open: true, initial: null })} aria-label="添加谷子">＋</button>{navItems.slice(2).map(renderBottomItem)}</nav>{itemForm.open ? <ItemForm initial={itemForm.initial} locations={workspace.locations} ips={workspace.ips} categories={workspace.categories} series={workspace.series} onClose={() => setItemForm({ open: false, initial: null })} onSave={addItem} onError={notify} /> : null}{locationForm.open ? <LocationForm locations={workspace.locations} parentId={locationForm.parentId} onClose={() => setLocationForm({ open: false })} onSave={addLocation} onError={notify} /> : null}{selectedItem ? <ItemSheet item={selectedItem} locations={workspace.locations} onClose={() => setSelectedItem(null)} onEdit={() => { setItemForm({ open: true, initial: selectedItem }); setSelectedItem(null); }} onMove={(status, locationId) => void moveItem(selectedItem, status, locationId)} onDelete={() => void deleteItem(selectedItem)} /> : null}{feedbackView}</div>;
}
