// UI-only seed. This process listens exclusively on localhost and never calls
// a remote database. Stop it to discard all edited records.
import { startMockSupabase } from "./mock-supabase.mjs";
const fixture = await startMockSupabase({ count: 688 });
const { db } = fixture;
db.households[0].name = "我们的谷仓";
db.profiles[0].display_name = "界面测试";
const base = db.locations[0];
const id = (n) => `00000005-0000-4000-8000-${String(n).padStart(12, "0")}`;
db.locations = [
  [1, "家", null, "其他"], [2, "书房", 1, "房间"], [3, "客厅", 1, "房间"], [4, "卧室", 1, "房间"],
  [5, "白色五斗柜", 2, "柜子"], [6, "蓝色徽章册", 2, "收纳册"], [7, "纸品文件夹", 2, "收纳册"], [8, "展示柜", 2, "柜子"],
  [9, "第4页", 6, "页码"], [10, "第二层", 8, "层板"], [11, "外出痛包", null, "其他"],
].map(([n, name, parent, location_type]) => ({ ...base, id: id(n), name, parent_id: parent ? id(parent) : null, location_type, sort_order: n }));
const ipBase = db.ips[0], categoryBase = db.categories[0];
db.ips = ["排球少年", "钻石王牌", "绝区零"].map((name, i) => ({ ...ipBase, id: `ui-ip-${i}`, name }));
db.categories = ["徽章", "亚克力立牌", "小卡"].map((name, i) => ({ ...categoryBase, id: `ui-category-${i}`, name }));
db.characters = ["日向翔阳", "御幸一也", "艾莲"].map((name, i) => ({ ...ipBase, id: `ui-character-${i}`, ip_id: db.ips[i].id, name }));
db.item_styles.forEach((style, i) => {
  const j = i % 3;
  style.name = ""; style.ip_id = db.ips[j].id; style.category_id = db.categories[j].id;
  db.item_style_characters.push({ item_style_id: style.id, character_id: db.characters[j].id, sort_order: 0 });
  const instance = db.item_instances[i];
  if (i < 12) { instance.current_location_id = null; instance.home_location_id = null; }
  else { instance.current_location_id = id([9, 10, 3, 4, 2, 11][i % 6]); instance.home_location_id = instance.current_location_id; }
  instance.physical_status = i >= 12 && i < 15 ? "temporarily_out" : "stored";
});
console.log(`UI fixture: ${fixture.url}; synthetic photos/records only. Login smoke@example.test / local-test-password.`);
