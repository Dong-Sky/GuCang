// An in-memory, localhost-only Supabase protocol fixture. Never calls Supabase.
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { register } from 'node:module';
register('./ts-loader.mjs', import.meta.url);
const { buildWorkspace } = await import('../lib/collection/model.ts');
const { matchesItemSearch, isIncompleteItem } = await import('../lib/collection/inventory.ts');
const { findItems } = await import('../lib/collection/find.ts');

export const TEST_HOUSEHOLD = "10000000-0000-4000-8000-000000000001";
export const TEST_USER = "20000000-0000-4000-8000-000000000001";
const uid = (kind, index) => `${String(kind).padStart(8, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450"><rect width="600" height="450" fill="#e7e1fa"/><circle cx="300" cy="205" r="140" fill="#8b79d9"/><path d="M200 330L400 330L300 100Z" fill="#fff8d9"/><text x="230" y="410" font-size="32">TEST</text></svg>');
const now = () => new Date().toISOString();

export function makeFixture(count = 1205) {
  const base = { household_id: TEST_HOUSEHOLD, created_at: "2026-01-01T00:00:00.000Z", created_by: TEST_USER, updated_by: TEST_USER, updated_at: "2026-01-01T00:00:00.000Z", deleted_at: null };
  const db = {
    profiles: [{ id: TEST_USER, display_name: "本地测试", avatar_url: null, created_at: now(), updated_at: now() }],
    households: [{ id: TEST_HOUSEHOLD, name: "本地隔离测试谷仓", owner_id: TEST_USER, storage_quota_bytes: 1073741824, created_at: now(), updated_at: now(), deleted_at: null }],
    household_members: [{ household_id: TEST_HOUSEHOLD, user_id: TEST_USER, role: "admin", joined_at: now() }],
    ips: [{ ...base, id: uid(3, 1), name: "测试作品", name_zh: "测试作品", sort_order: 0 }],
    categories: [{ ...base, id: uid(4, 1), name: "徽章", sort_order: 0 }],
    series: [], characters: [], item_style_characters: [],
    locations: [{ ...base, id: uid(5, 1), name: "测试收纳盒", location_type: "收纳箱", parent_id: null, description: null, sort_order: 0 }],
    item_styles: [], item_instances: [], item_images: [], location_images: [], movement_events: [], export_events: [], household_invites: [], activity_events: [],
  };
  for (let index = 1; index <= count; index++) {
    const styleId = uid(6, index), instanceId = uid(7, index), imageId = uid(8, index);
    const created_at = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
    const draft = index % 3 === 0;
    db.item_styles.push({ ...base, id: styleId, name: `测试收藏 ${index}`, ip_id: uid(3, 1), category_id: uid(4, 1), series_id: null, notes: null, search_text: `测试收藏 ${index}`, completion_status: draft ? "draft" : "complete", official_name: null, variant_name: null, created_at });
    db.item_instances.push({ ...base, id: instanceId, inventory_number: index, inventory_code: `GC-${String(index).padStart(6, "0")}`, item_style_id: styleId, current_location_id: draft ? null : uid(5, 1), home_location_id: draft ? null : uid(5, 1), physical_status: index % 10 === 0 ? "temporarily_out" : "stored", is_sealed: false, condition_note: null, acquired_at: null, acquisition_source: null, created_at });
    db.item_images.push({ ...base, id: imageId, item_style_id: styleId, image_type: "main", detail_path: `households/${TEST_HOUSEHOLD}/items/${styleId}/historical-detail.webp`, thumbnail_path: `households/${TEST_HOUSEHOLD}/items/${styleId}/historical-thumb.webp`, file_size_bytes: 100000, thumbnail_size_bytes: 20000, width: 1800, height: 1350, sort_order: 0, created_at });
  }
  db.item_instances[1].deleted_at = new Date(Date.now() - 86400000).toISOString();
  return db;
}

export async function startMockSupabase({ port = 54339, count = 1205 } = {}) {
  const db = makeFixture(count);
  const counters = new Map([[TEST_HOUSEHOLD, count]]);
  const initialInstanceIds = new Set(db.item_instances.map((row) => row.id));
  const historicalIds = new Set(db.item_images.map((image) => image.id));
  const files = new Map();
  const metrics = { requests: [], signBatches: [], uploads: [], activeUploads: 0, peakUploads: 0 };
  let failUploads = 0;
  const historyHash = () => createHash("sha256").update(JSON.stringify(db.item_images.filter((row) => historicalIds.has(row.id)))).digest("hex");
  const initialHistoryHash = historyHash();
  const user = { id: TEST_USER, aud: "authenticated", role: "authenticated", email: "smoke@example.test", email_confirmed_at: now(), user_metadata: { display_name: "本地测试" }, app_metadata: { provider: "email", providers: ["email"] }, identities: [], created_at: now(), updated_at: now() };
  const token = () => `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: TEST_USER, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), email: user.email })).toString("base64url")}.local-test-signature`;
  const state = () => ({ counts: Object.fromEntries(Object.entries(db).map(([key, rows]) => [key, rows.length])), initialHistoryHash, historyHash: historyHash(), newInstances: db.item_instances.filter((row) => !initialInstanceIds.has(row.id)), newImages: db.item_images.filter((row) => !historicalIds.has(row.id)), newLocations: db.locations.filter((row) => row.id !== uid(5, 1)), newLocationImages: db.location_images, metrics });
  const server = createServer(async (req, res) => {
    res.setHeader("access-control-allow-origin", req.headers.origin ?? "*");
    res.setHeader("access-control-allow-headers", "*");
    res.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("access-control-expose-headers", "content-range");
    const reply = (body, status = 200) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); };
    try {
      if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
      const url = new URL(req.url, "http://127.0.0.1");
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      const body = bytes.length && req.headers["content-type"]?.includes("application/json") ? JSON.parse(bytes.toString()) : {};
      if (url.pathname === "/__test/state") return reply(state());
      if (url.pathname === "/__test/fail-next-upload" && req.method === "POST") { failUploads = body.count ?? 1; return reply({ ok: true }); }
      if (url.pathname === "/__test/reset-metrics" && req.method === "POST") { metrics.requests.length = 0; metrics.signBatches.length = 0; metrics.uploads.length = 0; metrics.peakUploads = 0; return reply({ ok: true }); }
      metrics.requests.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams) });
      if (url.pathname === "/auth/v1/token") return reply({ access_token: token(), refresh_token: "local-test-refresh", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user });
      if (url.pathname === "/auth/v1/user") return reply(user);
      if (url.pathname === "/auth/v1/logout") return reply({});
      if (url.pathname.startsWith("/storage/v1/object/sign/")) {
        if (req.method === "POST") {
          const paths = body.paths ?? [url.pathname.replace("/storage/v1/object/sign/collection-images/", "")];
          metrics.signBatches.push(paths);
          const rows = paths.map((path) => ({ path, signedURL: `/object/sign/collection-images/${path}?token=local-only`, error: null }));
          return reply(body.paths ? rows : rows[0]);
        }
        const path = decodeURIComponent(url.pathname.replace("/storage/v1/object/sign/collection-images/", ""));
        const stored = files.get(path);
        res.setHeader("content-type", stored?.type ?? "image/svg+xml");
        res.setHeader("cache-control", "max-age=3600");
        res.end(stored?.bytes ?? svg);
        return;
      }
      if (url.pathname.startsWith("/storage/v1/object/collection-images/") && req.method === "POST") {
        const path = decodeURIComponent(url.pathname.replace("/storage/v1/object/collection-images/", ""));
        if (path.includes("historical")) throw new Error("A test attempted to overwrite a historical photo");
        metrics.activeUploads++; metrics.peakUploads = Math.max(metrics.peakUploads, metrics.activeUploads);
        await new Promise((resolve) => setTimeout(resolve, 100));
        metrics.activeUploads--;
        metrics.uploads.push(path);
        if (path.includes("-thumb") && failUploads > 0) { failUploads--; return reply({ message: "模拟弱网：照片上传失败", error: "network", statusCode: "503" }, 503); }
        if (files.has(path)) return reply({ message: "The resource already exists", error: "Duplicate", statusCode: "409" }, 409);
        const request = new Request(`http://127.0.0.1${url.pathname}`, { method: "POST", headers: { "content-type": req.headers["content-type"] }, body: bytes });
        const form = await request.formData();
        const photo = form.get("");
        files.set(path, { bytes: Buffer.from(await photo.arrayBuffer()), type: photo.type });
        return reply({ Key: `collection-images/${path}`, Id: randomUUID() });
      }
      if (["/rest/v1/rpc/browse_catalog", "/rest/v1/rpc/catalog_summary"].includes(url.pathname)) {
        const args=body;
        const household=db.households.find(h=>h.id===args.target_household);
        if(!household)return reply({message:'无权访问该谷仓'},403);
        const workspace=buildWorkspace({household,member:db.household_members[0],members:db.household_members,locations:db.locations.filter(l=>!l.deleted_at),ips:db.ips.filter(r=>!r.deleted_at),categories:db.categories.filter(r=>!r.deleted_at),series:db.series.filter(r=>!r.deleted_at),characters:db.characters.filter(r=>!r.deleted_at),styles:db.item_styles,instances:db.item_instances,images:db.item_images,links:db.item_style_characters,locationImages:db.location_images,movements:[],lastExportAt:null});
        if(url.pathname.endsWith('catalog_summary'))return reply({total:workspace.items.length,draft:workspace.items.filter(isIncompleteItem).length,out:workspace.items.filter(i=>i.instance.physical_status==='temporarily_out').length,pending:workspace.items.filter(i=>isIncompleteItem(i)||i.instance.physical_status==='temporarily_out').length,imageBytes:workspace.imageBytes});
        const f=args.filters??{};
        const filtered=findItems(workspace.items.filter(i=>matchesItemSearch(i,args.query_text??'')&&(!f.location||(()=>{let id=i.instance.current_location_id??i.instance.home_location_id;const seen=new Set();while(id&&!seen.has(id)){if(id===f.location)return true;seen.add(id);id=db.locations.find(l=>l.id===id)?.parent_id;}return false;})())),f);
        const page=Math.min(args.page_number,Math.max(1,Math.ceil(filtered.length/args.page_size))),items=filtered.slice((page-1)*args.page_size,page*args.page_size),styleIds=new Set(items.map(i=>i.style.id));
        return reply({total:filtered.length,page,instances:items.map(i=>i.instance),styles:db.item_styles.filter(s=>styleIds.has(s.id)),images:db.item_images.filter(i=>styleIds.has(i.item_style_id)),links:db.item_style_characters.filter(l=>styleIds.has(l.item_style_id))});
      }
      if (url.pathname === "/rest/v1/rpc/save_photo_album") {
        const { p_household: household, p_style: style, p_expected: expected, p_photos: photos, p_shared_count: count } = body;
        const current = db.item_images.filter(p => p.household_id === household && p.item_style_id === style && !p.deleted_at).sort((a,b) => a.sort_order-b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
        if (household !== TEST_HOUSEHOLD || !db.item_styles.some(s => s.id===style && s.household_id===household)) return reply({message:'无权管理'},403);
        if (db.item_instances.filter(i=>i.item_style_id===style).length!==count) return reply({message:'共享数量变化'},409);
        if (!Array.isArray(photos) || photos.length>3 || new Set(photos.map(p=>p.id)).size!==photos.length) return reply({message:'照片数量或重复'},400);
        if (JSON.stringify(current.map(p=>p.id))===JSON.stringify(photos.map(p=>p.id))) return reply(null);
        if (JSON.stringify(current.map(p=>p.id))!==JSON.stringify(expected)) return reply({message:'照片已变化，请重新打开'},409);
        const updated = structuredClone(db.item_images);
        for (const [index, photo] of photos.entries()) {
          let row=updated.find(p=>p.id===photo.id);
          if (row && (row.household_id!==household || row.item_style_id!==style || (row.deleted_at && Date.parse(row.deleted_at)<Date.now()-7*86400000))) return reply({message:'照片不能恢复'},400);
          if (!row) {
            if (!files.has(photo.detail_path) || !files.has(photo.thumbnail_path)) return reply({message:'照片尚未上传完整'},400);
            row={...photo,household_id:household,item_style_id:style,created_by:TEST_USER,created_at:now()}; updated.push(row);
          }
          Object.assign(row,{deleted_at:null,sort_order:index,image_type:index===0?'main':'attachment'});
        }
        for (const row of updated) if (row.item_style_id===style && !row.deleted_at && !photos.some(p=>p.id===row.id)) row.deleted_at=now();
        db.item_images=updated;
        return reply(null);
      }
      if (url.pathname === "/rest/v1/rpc/move_item_instance") {
        const instance = db.item_instances.find((row) => row.id === body.target_instance);
        if (!instance) return reply({ message: "Not found" }, 404);
        db.movement_events.unshift({ id: randomUUID(), household_id: TEST_HOUSEHOLD, item_instance_id: instance.id, action_type: "move", from_location_id: instance.current_location_id, to_location_id: body.target_location, from_status: instance.physical_status, to_status: body.target_status, actor_id: TEST_USER, note: body.target_note ?? null, created_at: now() });
        instance.current_location_id = body.target_status === "temporarily_out" ? null : body.target_location;
        instance.physical_status = body.target_status;
        instance.updated_at = now();
        return reply(instance);
      }
      const table = url.pathname.replace("/rest/v1/", "");
      if (!db[table]) return reply({ message: `Unknown local fixture route: ${url.pathname}` }, 404);
      const fields = url.searchParams.get("select") ?? "*";
      const matches = (row) => {
        for (const [field, expression] of url.searchParams) {
          if (["select", "order", "limit", "offset", "on_conflict"].includes(field)) continue;
          let value = row[field];
          if (field === "item_styles.household_id") value = db.item_styles.find((style) => style.id === row.item_style_id)?.household_id;
          if (field === "item_style_characters.item_style_id") { if (!db.item_style_characters.some((link) => link.character_id === row.id && expression === `eq.${link.item_style_id}`)) return false; else continue; }
          if (field === "item_instances.item_style_id") value = db.item_instances.find((instance) => instance.id === row.item_instance_id)?.item_style_id;
          if (expression.startsWith("eq.") && String(value) !== expression.slice(3)) return false;
          if (expression === "is.null" && value != null) return false;
          if (expression === "not.is.null" && value == null) return false;
          if (expression.startsWith("lt.") && !(value != null && value < expression.slice(3))) return false;
          if (expression.startsWith("in.(") && !expression.slice(4, -1).split(",").includes(String(value))) return false;
        }
        return true;
      };
      let selected;
      if (req.method === "POST") {
        selected = (Array.isArray(body) ? body : [body]).map((input) => {
          const id = input.id ?? (table === "item_style_characters" ? undefined : randomUUID());
          const existing = db[table].find((row) => id ? row.id === id : row.item_style_id === input.item_style_id && row.character_id === input.character_id);
          if (existing) { Object.assign(existing, input, { updated_at: now() }); return existing; }
          const row = { ...input, ...(id ? { id } : {}), deleted_at: input.deleted_at ?? null, sort_order: input.sort_order ?? 0, created_at: input.created_at ?? now(), updated_at: now(), household_id: input.household_id ?? TEST_HOUSEHOLD };
          if (table === "item_instances") {
            const number = (counters.get(row.household_id) ?? 0) + 1;
            counters.set(row.household_id, number);
            row.inventory_number = number;
            row.inventory_code = `GC-${String(number).padStart(6, "0")}`;
          }
          db[table].push(row);
          return row;
        });
      } else if (req.method === "PATCH") {
        selected = db[table].filter(matches);
        selected.forEach((row) => Object.assign(row, body, { updated_at: now() }));
      } else if (req.method === "DELETE") {
        if (["item_images", "location_images"].includes(table)) throw new Error("Historical photo deletion is forbidden in this test");
        selected = db[table].filter(matches);
        db[table] = db[table].filter((row) => !matches(row));
      } else selected = db[table].filter(matches);
      const order = url.searchParams.get("order");
      if (order) selected = [...selected].sort((a,b) => {
        for (const part of order.split(",")) { const [key, direction] = part.split("."); const result = typeof a[key] === "number" ? a[key] - b[key] : String(a[key] ?? "").localeCompare(String(b[key] ?? "")); if (result) return direction === "desc" ? -result : result; }
        return 0;
      });
      const total = selected.length;
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 1000);
      selected = selected.slice(offset, offset + limit).map((row) => {
        const keys = fields.split(",").filter((field) => !field.includes("(") && !field.includes(")"));
        const value = fields.includes("*") ? { ...row } : Object.fromEntries(keys.map((key) => [key, row[key]]));
        if (fields.includes("item_styles!inner")) value.item_styles = { household_id: TEST_HOUSEHOLD };
        return value;
      });
      res.setHeader("content-range", `${offset}-${Math.max(offset, offset + selected.length - 1)}/${total}`);
      if (req.headers.accept?.includes("vnd.pgrst.object")) {
        if (selected.length !== 1) return reply({ message: `Expected one fixture row, got ${selected.length}` }, 406);
        return reply(selected[0]);
      }
      return reply(selected);
    } catch (error) { reply({ message: error.message }, 500); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  return { server, db, files, metrics, state, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixture = await startMockSupabase();
  console.log(`Local-only fixture ready: ${fixture.url} (${fixture.db.item_styles.length} synthetic items)`);
}
