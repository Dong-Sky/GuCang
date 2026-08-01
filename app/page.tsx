"use client";

import { FormEvent, useMemo, useState } from "react";

type NavKey = "home" | "collection" | "locations" | "tasks";
type ArtKind = "badge" | "stand" | "card" | "paper" | "plush" | "album";
type CollectionTab = "all" | "characters" | "categories" | "series";

type Item = {
  id: string;
  name: string;
  ip: string;
  character: string;
  category: string;
  series: string;
  location: string;
  path: string;
  status: "已收纳" | "展示中" | "待完善" | "临时取出";
  art: ArtKind;
  accent: string;
  complete: boolean;
};

type IpSummary = {
  id: string;
  name: string;
  count: number;
  characters: number;
  categories: string;
  accent: string;
  art: ArtKind;
};

type LocationSummary = {
  id: string;
  name: string;
  type: string;
  count: number;
  path: string;
  description: string;
  accent: string;
  art: ArtKind;
};

const items: Item[] = [
  { id: "kageyama-badge", name: "影山飞雄 · Jump Festa徽章", ip: "排球少年!!", character: "影山飞雄", category: "徽章", series: "Jump Festa 2025", location: "蓝色徽章册 · 第4页", path: "书房 / 白色五斗柜 / 第三层抽屉 / 蓝色徽章册 / 第4页", status: "已收纳", art: "badge", accent: "#7d91d9", complete: true },
  { id: "hinata-stand", name: "日向翔阳 · 运动系列立牌", ip: "排球少年!!", character: "日向翔阳", category: "立牌", series: "运动系列", location: "蓝色徽章册 · 第6页", path: "书房 / 白色五斗柜 / 第三层抽屉 / 蓝色徽章册 / 第6页", status: "已收纳", art: "stand", accent: "#e8a55e", complete: true },
  { id: "tsukki-card", name: "月岛萤 · 黑金卡片", ip: "排球少年!!", character: "月岛萤", category: "卡片", series: "纪念展", location: "客厅展示柜 · 第二层", path: "客厅 / 展示柜 / 第二层", status: "展示中", art: "card", accent: "#ccb275", complete: true },
  { id: "gojo-badge", name: "五条悟 · 咒术回战徽章", ip: "咒术回战", character: "五条悟", category: "徽章", series: "生日系列", location: "灰色徽章册 · 第2页", path: "书房 / 白色五斗柜 / 第二层抽屉 / 灰色徽章册 / 第2页", status: "已收纳", art: "badge", accent: "#9c85cf", complete: true },
  { id: "megumi-paper", name: "伏黑惠 · 色纸", ip: "咒术回战", character: "伏黑惠", category: "色纸", series: "Animate Cafe", location: "纸品收纳箱 · A区", path: "书房 / 纸品收纳箱 / A区", status: "已收纳", art: "paper", accent: "#709a9c", complete: true },
  { id: "isagi-card", name: "洁世一 · 蓝色监狱卡片", ip: "蓝色监狱", character: "洁世一", category: "卡片", series: "第一弹", location: "卡片文件夹 · 第1页", path: "卧室 / 书架 / 卡片文件夹 / 第1页", status: "待完善", art: "card", accent: "#76a8cb", complete: false },
  { id: "chigiri-stand", name: "千切豹马 · 亚克力挂件", ip: "蓝色监狱", character: "千切豹马", category: "亚克力挂件", series: "咖啡联动", location: "待整理盒", path: "书房 / 待整理盒", status: "临时取出", art: "stand", accent: "#d58da8", complete: true },
  { id: "mystery-plush", name: "未命名 · 小型毛绒", ip: "未分类", character: "未填写", category: "毛绒", series: "未填写", location: "白色五斗柜 · 待完善区", path: "书房 / 白色五斗柜 / 待完善区", status: "待完善", art: "plush", accent: "#d8a68e", complete: false },
];

const ips: IpSummary[] = [
  { id: "haikyu", name: "排球少年!!", count: 86, characters: 12, categories: "徽章 · 立牌 · 卡片", accent: "#e7a363", art: "album" },
  { id: "jujutsu", name: "咒术回战", count: 53, characters: 9, categories: "徽章 · 色纸 · 立牌", accent: "#9885ca", art: "paper" },
  { id: "bluelock", name: "蓝色监狱", count: 31, characters: 8, categories: "卡片 · 挂件 · 徽章", accent: "#72a5c9", art: "card" },
  { id: "genshin", name: "原神", count: 42, characters: 11, categories: "立牌 · 卡片 · 毛绒", accent: "#9db5a7", art: "stand" },
  { id: "other", name: "其他收藏", count: 18, characters: 0, categories: "未分类 · 待完善", accent: "#cba98e", art: "plush" },
];

const locations: LocationSummary[] = [
  { id: "study", name: "书房", type: "房间", count: 246, path: "家 / 书房", description: "3个柜子 · 4个主要收纳容器", accent: "#a8a491", art: "album" },
  { id: "living", name: "客厅", type: "房间", count: 82, path: "家 / 客厅", description: "展示柜与近期常看收藏", accent: "#c9a578", art: "stand" },
  { id: "bedroom", name: "卧室", type: "房间", count: 45, path: "家 / 卧室", description: "卡片文件夹与备用收纳", accent: "#91aab1", art: "card" },
  { id: "blue-album", name: "蓝色徽章册", type: "收纳册", count: 34, path: "书房 / 白色五斗柜 / 第三层抽屉 / 蓝色徽章册", description: "5页 · 34件收藏", accent: "#7d91d9", art: "badge" },
  { id: "paper-box", name: "纸品收纳箱", type: "收纳箱", count: 27, path: "书房 / 纸品收纳箱", description: "A区 · B区 · 27件收藏", accent: "#90a99d", art: "paper" },
  { id: "display-cabinet", name: "展示柜第二层", type: "展示位置", count: 19, path: "客厅 / 展示柜 / 第二层", description: "当前展示中的收藏", accent: "#d3ab78", art: "stand" },
];

const navItems: Array<{ id: NavKey; label: string; icon: string }> = [
  { id: "home", label: "首页", icon: "⌂" },
  { id: "collection", label: "收藏", icon: "✦" },
  { id: "locations", label: "位置", icon: "⌖" },
  { id: "tasks", label: "待办", icon: "✓" },
];

function MerchThumb({ art, accent, label }: { art: ArtKind; accent: string; label?: string }) {
  return (
    <div className={`merch-thumb merch-${art}`} style={{ "--thumb-accent": accent } as React.CSSProperties} aria-label={label ?? "收藏缩略图"}>
      <span className="merch-shape" />
      <span className="merch-mark">✦</span>
      {label ? <span className="merch-label">{label}</span> : null}
    </div>
  );
}

function SectionHeading({ title, caption, action }: { title: string; caption?: string; action?: string }) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {caption ? <p>{caption}</p> : null}
      </div>
      {action ? <button className="text-button" type="button">{action} <span>›</span></button> : null}
    </div>
  );
}

function ItemCard({ item, onOpen }: { item: Item; onOpen: (item: Item) => void }) {
  return (
    <button className="item-card" type="button" onClick={() => onOpen(item)}>
      <MerchThumb art={item.art} accent={item.accent} label={item.character === "未填写" ? "待完善" : undefined} />
      <span className="item-card-copy">
        <strong>{item.character === "未填写" ? item.name : item.character}</strong>
        <span>{item.category} · {item.status}</span>
        <small>{item.location}</small>
      </span>
    </button>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><span className="empty-dot">✦</span><strong>{title}</strong><p>{body}</p></div>;
}

export default function Home() {
  const [activeNav, setActiveNav] = useState<NavKey>("home");
  const [search, setSearch] = useState("");
  const [collectionTab, setCollectionTab] = useState<CollectionTab>("all");
  const [collectionMode, setCollectionMode] = useState<"ip" | "all">("ip");
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<"single" | "quick" | "batch">("single");
  const [toast, setToast] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => [item.name, item.ip, item.character, item.category, item.location, item.series].some((field) => field.toLowerCase().includes(query)));
  }, [search]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };

  const navigate = (nav: NavKey) => {
    setActiveNav(nav);
    setSelectedIp(null);
    setSelectedLocation(null);
    setSearch("");
  };

  const submitAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddOpen(false);
    notify(addMode === "quick" ? "已保存到待完善" : addMode === "batch" ? "批次草稿已保存" : "谷子已加入收藏");
  };

  const activeLocation = selectedLocation ? (locations.find((location) => location.id === selectedLocation) ?? null) : null;
  const activeIp = selectedIp ? ips.find((ip) => ip.id === selectedIp) : undefined;
  const ipItems = activeIp ? filteredItems.filter((item) => item.ip === activeIp.name) : [];

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div className="brand-lockup">
          <div className="brand-mark">谷</div>
          <div><strong>谷仓</strong><span>OUR COLLECTION</span></div>
        </div>
        <div className="household-switcher"><span className="household-avatar">我</span><span><strong>我们的谷仓</strong><small>家庭收藏空间</small></span><span className="chevron">⌄</span></div>
        <nav className="nav-list" aria-label="主导航">
          {navItems.map((item) => <button key={item.id} className={activeNav === item.id ? "nav-item active" : "nav-item"} onClick={() => navigate(item.id)} type="button"><span>{item.icon}</span>{item.label}{item.id === "tasks" ? <em>8</em> : null}</button>)}
        </nav>
        <div className="side-footer"><div className="storage-meter"><div><span>图片空间</span><b>24%</b></div><div className="meter-track"><i /></div><small>约可再保存 1,240 件</small></div><button className="settings-link" type="button" onClick={() => notify("设置页将在下一步接入")}>⚙ 设置</button></div>
      </aside>

      <main className="main-column">
        <header className="topbar"><div className="mobile-brand"><span className="brand-mark">谷</span><strong>谷仓</strong></div><div className="topbar-actions"><button type="button" className="icon-button" aria-label="通知" onClick={() => notify("暂时没有新的提醒")}>♧</button><button type="button" className="profile-chip" onClick={() => notify("当前账号：我")}>我</button></div></header>

        <div className="content-wrap">
          {activeNav === "home" ? <HomeView search={search} setSearch={setSearch} onNavigate={navigate} onAdd={() => setAddOpen(true)} onOpenItem={setSelectedItem} onOpenLocation={(id) => { setActiveNav("locations"); setSelectedLocation(id); }} filteredItems={filteredItems} /> : null}
          {activeNav === "collection" ? <CollectionView search={search} setSearch={setSearch} mode={collectionMode} setMode={setCollectionMode} tab={collectionTab} setTab={setCollectionTab} selectedIp={selectedIp} onSelectIp={setSelectedIp} activeIp={activeIp} ipItems={ipItems} allItems={filteredItems} onOpenItem={setSelectedItem} onBack={() => setSelectedIp(null)} /> : null}
          {activeNav === "locations" ? <LocationsView selectedLocation={selectedLocation} location={activeLocation} onSelect={setSelectedLocation} onBack={() => setSelectedLocation(null)} onAdd={() => setAddOpen(true)} onOpenItem={setSelectedItem} /> : null}
          {activeNav === "tasks" ? <TasksView onOpenItem={setSelectedItem} onNotify={notify} /> : null}
        </div>
      </main>

      <nav className="bottom-nav" aria-label="移动端主导航">
        {navItems.map((item) => <button key={item.id} className={activeNav === item.id ? "bottom-item active" : "bottom-item"} type="button" onClick={() => navigate(item.id)}><span>{item.icon}</span>{item.label}{item.id === "tasks" ? <em>8</em> : null}</button>)}
        <button className="bottom-add" type="button" onClick={() => setAddOpen(true)} aria-label="添加谷子">＋</button>
      </nav>

      {addOpen ? <AddSheet mode={addMode} setMode={setAddMode} onClose={() => setAddOpen(false)} onSubmit={submitAdd} /> : null}
      {selectedItem ? <ItemSheet item={selectedItem} onClose={() => setSelectedItem(null)} onNotify={notify} /> : null}
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </div>
  );
}

function HomeView({ search, setSearch, onNavigate, onAdd, onOpenItem, onOpenLocation, filteredItems }: { search: string; setSearch: (value: string) => void; onNavigate: (nav: NavKey) => void; onAdd: () => void; onOpenItem: (item: Item) => void; onOpenLocation: (id: string) => void; filteredItems: Item[] }) {
  return <div className="page home-page">
    <div className="page-intro"><div><span className="eyebrow">2026年8月2日 · 周日</span><h1>今天想找什么？</h1><p>把喜欢的东西放在心里，也放在一个找得到的地方。</p></div><div className="intro-orb">✦</div></div>
    <label className="global-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 IP、角色、品类或位置"/><kbd>⌘ K</kbd></label>
    <div className="quick-actions"><button type="button" onClick={() => onNavigate("collection")}><span className="quick-icon lavender">✦</span><span><strong>按 IP 查看</strong><small>浏览我收藏的作品</small></span><i>›</i></button><button type="button" onClick={() => onNavigate("locations")}><span className="quick-icon sand">⌖</span><span><strong>按位置查看</strong><small>从房间找到收纳盒</small></span><i>›</i></button><button type="button" onClick={onAdd}><span className="quick-icon mint">＋</span><span><strong>快速暂存</strong><small>先记录，之后慢慢完善</small></span><i>›</i></button></div>
    <div className="home-grid"><section><SectionHeading title="待处理" caption="先把找不到的变成找得到的" action="查看全部" /><div className="task-preview"><button type="button" onClick={() => onOpenItem(filteredItems.find((item) => item.status === "待完善") ?? items[5])}><span className="task-icon">◌</span><span><strong>5 件资料待完善</strong><small>已经记录位置，补上 IP 和角色就好</small></span><b>›</b></button><button type="button" onClick={() => onNavigate("tasks")}><span className="task-icon warm">↩</span><span><strong>3 件谷子待归位</strong><small>取出超过 2 天，回家之前顺手放回去</small></span><b>›</b></button></div></section><section className="initialization-card"><div className="initialization-top"><div><span className="eyebrow">初始化进度</span><strong>326 <small>/ 500 件</small></strong></div><span className="progress-ring">65%</span></div><div className="progress-line"><i /></div><p>已录入的先确保位置不丢，资料可以以后再慢慢补。</p><button type="button" onClick={() => onNavigate("tasks")}>继续完善 <span>→</span></button></section></div>
    <section className="home-section"><SectionHeading title="最近查看" caption="上次看到这里" action="全部记录" /><div className="recent-grid">{items.slice(0, 4).map((item) => <button className="recent-card" key={item.id} type="button" onClick={() => onOpenItem(item)}><MerchThumb art={item.art} accent={item.accent} /><span><strong>{item.character}</strong><small>{item.category} · 刚刚</small></span></button>)}</div></section>
    <section className="home-section"><SectionHeading title="最近位置" caption="从收纳空间开始浏览" action="查看位置" /><div className="location-mini-grid">{locations.slice(0, 3).map((location) => <button className="location-mini" type="button" key={location.id} onClick={() => onOpenLocation(location.id)}><MerchThumb art={location.art} accent={location.accent} /><span><strong>{location.name}</strong><small>{location.count} 件收藏</small></span></button>)}</div></section>
  </div>;
}

function CollectionView({ search, setSearch, mode, setMode, tab, setTab, selectedIp, onSelectIp, activeIp, ipItems, allItems, onOpenItem, onBack }: { search: string; setSearch: (value: string) => void; mode: "ip" | "all"; setMode: (value: "ip" | "all") => void; tab: CollectionTab; setTab: (value: CollectionTab) => void; selectedIp: string | null; onSelectIp: (id: string) => void; activeIp: IpSummary | undefined; ipItems: Item[]; allItems: Item[]; onOpenItem: (item: Item) => void; onBack: () => void }) {
  if (selectedIp && activeIp) return <div className="page"><button className="back-link" type="button" onClick={onBack}>‹ 我的收藏</button><div className="detail-intro"><div><span className="eyebrow">IP 收藏主页</span><h1>{activeIp.name}</h1><p>共 {activeIp.count} 件 · {activeIp.characters} 个角色 · {activeIp.categories}</p></div><MerchThumb art={activeIp.art} accent={activeIp.accent} /></div><div className="segmented tabs">{(["all", "characters", "categories", "series"] as CollectionTab[]).map((value) => <button type="button" key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{value === "all" ? "全部" : value === "characters" ? "角色" : value === "categories" ? "品类" : "系列"}</button>)}</div>{tab === "all" ? <div className="item-grid">{ipItems.length ? ipItems.map((item) => <ItemCard item={item} onOpen={onOpenItem} key={item.id} />) : <EmptyState title="还没有演示记录" body="真实数据接入后，这里会展示这个 IP 的全部收藏。" />}</div> : <GroupedCollection tab={tab} items={ipItems} onOpenItem={onOpenItem} />}</div>;
  return <div className="page"><div className="page-title-row"><div><span className="eyebrow">家庭收藏空间</span><h1>我的收藏</h1><p>按作品浏览，或者像翻收藏册一样慢慢看。</p></div><button className="small-icon-button" type="button" aria-label="搜索">⌕</button></div><label className="global-search compact"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 IP、角色或品类"/></label><div className="segmented view-toggle"><button type="button" className={mode === "ip" ? "active" : ""} onClick={() => setMode("ip")}>按 IP</button><button type="button" className={mode === "all" ? "active" : ""} onClick={() => setMode("all")}>全部谷子</button></div>{mode === "ip" ? <><SectionHeading title="常看作品" caption="从一个 IP 开始，看到所有喜欢的角色" /><div className="ip-grid">{ips.map((ip) => <button className="ip-card" type="button" key={ip.id} onClick={() => onSelectIp(ip.id)}><div className="ip-cover"><MerchThumb art={ip.art} accent={ip.accent} /><span className="ip-count">{ip.count} 件</span></div><div className="ip-card-copy"><strong>{ip.name}</strong><span>{ip.characters ? `${ip.characters} 个角色 · ` : ""}{ip.categories}</span><i>›</i></div></button>)}</div></> : <><SectionHeading title="全部谷子" caption={`${allItems.length} 件演示记录 · 接入数据库后会持续增长`} /><div className="item-grid">{allItems.map((item) => <ItemCard item={item} onOpen={onOpenItem} key={item.id} />)}</div></>}</div>;
}

function GroupedCollection({ tab, items: groupItems, onOpenItem }: { tab: CollectionTab; items: Item[]; onOpenItem: (item: Item) => void }) {
  const groups = tab === "characters" ? ["影山飞雄", "日向翔阳", "月岛萤"] : tab === "categories" ? ["徽章", "立牌", "卡片"] : ["Jump Festa 2025", "运动系列", "纪念展"];
  return <div className="group-list">{groups.map((group) => { const groupItemsForName = groupItems.filter((item) => (tab === "characters" ? item.character : tab === "categories" ? item.category : item.series) === group); return <section className="collection-group" key={group}><div className="group-heading"><strong>{group}</strong><span>{groupItemsForName.length || 0} 件 <i>›</i></span></div>{groupItemsForName.length ? <div className="mini-item-grid">{groupItemsForName.map((item) => <ItemCard item={item} onOpen={onOpenItem} key={item.id} />)}</div> : <p className="group-empty">接入完整收藏后，这里会自动聚合。</p>}</section>; })}</div>;
}

function LocationsView({ selectedLocation, location, onSelect, onBack, onAdd, onOpenItem }: { selectedLocation: string | null; location: LocationSummary | null; onSelect: (id: string) => void; onBack: () => void; onAdd: () => void; onOpenItem: (item: Item) => void }) {
  if (selectedLocation && location) return <div className="page"><button className="back-link" type="button" onClick={onBack}>‹ 收纳位置</button><div className="location-detail-head"><div><span className="eyebrow">{location.type}</span><h1>{location.name}</h1><p>{location.path}</p></div><MerchThumb art={location.art} accent={location.accent} /></div><div className="location-actions"><button className="primary-button" type="button" onClick={onAdd}>＋ 添加到这里</button><button className="secondary-button" type="button">移动物品</button></div><div className="location-summary"><div><span>收藏数量</span><strong>{location.count}</strong></div><div><span>待完善</span><strong>{location.id === "blue-album" ? "2" : "—"}</strong></div><div><span>主要品类</span><strong>{location.id === "blue-album" ? "徽章" : "多种"}</strong></div></div><div className="segmented tabs"><button className="active" type="button">按页码</button><button type="button">按 IP</button></div><div className="page-section"><div className="page-section-heading"><strong>第1页 · 8件</strong><span>›</span></div><div className="album-grid">{items.slice(0, 4).map((item) => <button type="button" key={item.id} onClick={() => onOpenItem(item)}><MerchThumb art={item.art} accent={item.accent} /></button>)}</div></div><div className="page-section"><div className="page-section-heading"><strong>第2页 · 8件</strong><span>›</span></div><div className="album-grid">{items.slice(4, 8).map((item) => <button type="button" key={item.id} onClick={() => onOpenItem(item)}><MerchThumb art={item.art} accent={item.accent} /></button>)}</div></div></div>;
  return <div className="page"><div className="page-title-row"><div><span className="eyebrow">实体收纳导航</span><h1>收纳位置</h1><p>先找到房间，再进入柜子、盒子和页码。</p></div><button className="small-icon-button accent-button" type="button" onClick={onAdd} aria-label="新建位置">＋</button></div><div className="location-tree-note"><span>⌖</span><p>位置是自由树状结构，之后可以随时增加抽屉、分区或新的收纳册。</p></div><div className="location-grid">{locations.map((item) => <button className="location-card" type="button" key={item.id} onClick={() => onSelect(item.id)}><div className="location-card-top"><div><span className="location-type">{item.type}</span><strong>{item.name}</strong><small>{item.path}</small></div><span className="location-count">{item.count} 件 ›</span></div><MerchThumb art={item.art} accent={item.accent} /><p>{item.description}</p></button>)}</div></div>;
}

function TasksView({ onOpenItem, onNotify }: { onOpenItem: (item: Item) => void; onNotify: (message: string) => void }) {
  const incomplete = items.filter((item) => !item.complete);
  const out = items.filter((item) => item.status === "临时取出");
  return <div className="page"><div className="page-title-row"><div><span className="eyebrow">轻量维护</span><h1>待办</h1><p>不急着一次整理完，今天处理一两件也很好。</p></div><span className="task-count-badge">8 件</span></div><div className="task-tabs"><button className="active" type="button">待完善 <b>5</b></button><button type="button">待归位 <b>3</b></button><button type="button">待确认 <b>0</b></button></div><section className="task-list"><SectionHeading title="资料待完善" caption="已经记录位置，补资料不需要重新拍照" />{incomplete.map((item) => <button className="task-row" type="button" key={item.id} onClick={() => onOpenItem(item)}><MerchThumb art={item.art} accent={item.accent} /><span><strong>{item.name}</strong><small>已记录：{item.location}</small><em>缺少 IP、角色或品类</em></span><i>完善 ›</i></button>)}</section><section className="task-list"><SectionHeading title="取出未归位" caption="回到收纳位置后点一下即可完成归位" />{out.length ? out.map((item) => <button className="task-row" type="button" key={item.id} onClick={() => onNotify(`${item.character} 已归回原位`)}><MerchThumb art={item.art} accent={item.accent} /><span><strong>{item.name}</strong><small>原位置：{item.location}</small><em className="warm-text">临时取出 · 2天</em></span><i>归回 ›</i></button>) : <EmptyState title="目前没有待归位" body="取出收藏后，它会出现在这里。" />}</section></div>;
}

function AddSheet({ mode, setMode, onClose, onSubmit }: { mode: "single" | "quick" | "batch"; setMode: (mode: "single" | "quick" | "batch") => void; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="add-sheet" role="dialog" aria-modal="true" aria-labelledby="add-title"><div className="sheet-handle" /><div className="sheet-header"><div><span className="eyebrow">添加到我们的谷仓</span><h2 id="add-title">记录一件谷子</h2></div><button type="button" onClick={onClose} className="close-button" aria-label="关闭">×</button></div><div className="add-mode-tabs"><button type="button" className={mode === "single" ? "active" : ""} onClick={() => setMode("single")}>单件录入</button><button type="button" className={mode === "quick" ? "active" : ""} onClick={() => setMode("quick")}>快速暂存</button><button type="button" className={mode === "batch" ? "active" : ""} onClick={() => setMode("batch")}>批量录入</button></div><form onSubmit={onSubmit}><button type="button" className="photo-drop"><span>＋</span><strong>{mode === "batch" ? "连续添加照片" : "拍摄或选择照片"}</strong><small>{mode === "quick" ? "先记录位置，资料之后再补" : "照片会自动裁剪和压缩"}</small></button><div className="form-grid"><label>IP<input placeholder="搜索或选择 IP" defaultValue={mode === "quick" ? "" : "排球少年!!"} /></label><label>角色<input placeholder="搜索或选择角色" /></label><label>品类<select defaultValue="徽章"><option>徽章</option><option>立牌</option><option>卡片</option><option>色纸</option><option>其他</option></select></label><label>位置<input placeholder="选择收纳位置" defaultValue="蓝色徽章册 · 第4页" /></label></div><details><summary>更多资料 <span>系列、款式、备注</span></summary><div className="more-fields"><label>系列<input placeholder="例如 Jump Festa 2025" /></label><label>备注<textarea placeholder="想记下什么？" /></label></div></details><button className="submit-button" type="submit">{mode === "quick" ? "保存为待完善" : mode === "batch" ? "保存批次草稿" : "保存这件谷子"}</button></form></section></div>;
}

function ItemSheet({ item, onClose, onNotify }: { item: Item; onClose: () => void; onNotify: (message: string) => void }) {
  return <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="item-sheet" role="dialog" aria-modal="true" aria-labelledby="item-title"><div className="item-sheet-art"><MerchThumb art={item.art} accent={item.accent} /><button className="close-button floating" type="button" onClick={onClose} aria-label="关闭">×</button></div><div className="item-sheet-body"><div className="eyebrow">{item.ip}</div><h2 id="item-title">{item.name}</h2><p className="item-meta">{item.series} · {item.category}</p><div className={`status-pill status-${item.status === "已收纳" ? "stored" : item.status === "展示中" ? "display" : "pending"}`}><span />{item.status}</div><div className="current-location"><span className="location-pin">⌖</span><div><small>当前位置</small><strong>{item.location}</strong><p>{item.path}</p></div><button type="button" onClick={() => onNotify("定位页面将在下一步接入")}>查看位置 ›</button></div><div className="item-actions"><button className="primary-button" type="button" onClick={() => onNotify(`${item.character} 已标记为取出`)}>取出</button><button className="secondary-button" type="button" onClick={() => onNotify("移动位置功能将在下一步接入")}>移动</button><button className="secondary-button" type="button" onClick={() => onNotify("编辑表单将在下一步接入")}>编辑</button></div><div className="item-history"><span>最近记录</span><strong>由我添加 · 2026年8月1日</strong><small>所有移动操作都会保留历史记录</small></div></div></section></div>;
}
