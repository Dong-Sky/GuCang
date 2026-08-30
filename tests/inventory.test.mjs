import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { startMockSupabase, makeFixture, TEST_USER } from "./mock-supabase.mjs";
import { buildWorkspace, applyStylePatch } from "../lib/collection/model.ts";
import { loadWorkspace, loadStylePatch } from "../lib/collection/api.ts";
import { newSaveSession, saveItem } from "../lib/collection/save.ts";
import { formatInventoryCode, inventoryCode, itemTitle, isIncompleteItem, matchesItemSearch, compareInventoryNewest } from "../lib/collection/inventory.ts";

test("inventory codes have a six-digit minimum, never truncate or renumber at a million", () => {
  for (const [n, code] of [[1, "GC-000001"], [850, "GC-000850"], [999999, "GC-999999"], [1000000, "GC-1000000"], ["0000850", "GC-000850"], ["10000000000000000", "GC-10000000000000000"]]) assert.equal(formatInventoryCode(n), code);
  for (const invalid of [null, undefined, 0, -1, 1.1, "NaN", "GC-850"]) assert.equal(formatInventoryCode(invalid), "");
});

function fixtureItem() {
  const db = makeFixture(5);
  return {
    instance: db.item_instances[0], style: db.item_styles[0], ip: db.ips[0], category: db.categories[0],
    series: null, characters: [], location: db.locations[0], path: "家 / 收纳盒", imagePath: null,
    detailImagePath: null, imageId: null, recentMoves: [],
  };
}

test("optional names, original names, exact code search and per-instance completeness", () => {
  const item = fixtureItem();
  item.instance.inventory_number = 850;
  item.instance.inventory_code = "GC-000850";
  item.style.name = "";
  item.style.completion_status = "draft"; // stale, pre-upgrade client
  assert.equal(isIncompleteItem(item), false);
  assert.equal(itemTitle(item), "测试作品"); // category now lives beside the secondary code
  item.characters = [{ id: "character", name: "测试角色" }];
  assert.equal(itemTitle(item), "测试作品 · 测试角色");
  for (const query of ["GC-000850", "gc-850", "850", "000850", "ＧＣ－０００８５０", "测试作品", "徽章", "收纳盒"]) assert.equal(matchesItemSearch(item, query), true, query);
  assert.equal(matchesItemSearch(item, "GC-000085"), false);
  item.style.name = "以前填写的特别名称";
  assert.equal(itemTitle(item), item.style.name);
  assert.equal(matchesItemSearch(item, "特别名称"), true);
  item.instance.current_location_id = null;
  assert.equal(isIncompleteItem(item), false, "taken-out item with a home remains complete");
  item.instance.home_location_id = null;
  assert.equal(isIncompleteItem(item), true);
  item.instance.home_location_id = "home";
  item.ip = null;
  assert.equal(isIncompleteItem(item), true);
});

test("numeric ordering survives width expansion and does not alter identifiers", () => {
  const one = fixtureItem(), two = structuredClone(one);
  one.instance.inventory_code = "GC-999999";
  two.instance.inventory_code = "GC-1000000";
  assert.deepEqual([one, two].sort(compareInventoryNewest).map(inventoryCode), ["GC-1000000", "GC-999999"]);
});

test("save without a name is complete, retry reuses code, edits/trash/restore retain code and old photos", async () => {
  const fixture = await startMockSupabase({ port: 0, count: 5 });
  try {
    const client = createClient(fixture.url, "local-only", { auth: { persistSession: false, autoRefreshToken: false } });
    const before = await loadWorkspace(client, fixture.db.households[0], TEST_USER);
    const originalNames = before.styles.map((row) => [row.id, row.name]);
    const values = { name: "", ip: "测试作品", category: "徽章", character: "", series: "", notes: "", locationId: before.locations[0].id, status: "stored", quick: false, files: [], quality: "standard" };
    const session = newSaveSession();
    const first = await saveItem(client, before, TEST_USER, values, session, () => {});
    const retry = await saveItem(client, before, TEST_USER, values, session, () => {});
    assert.equal(first.completion, "complete");
    assert.equal(first.inventoryCode, "GC-000006");
    assert.equal(retry.inventoryCode, first.inventoryCode);
    assert.equal(fixture.db.item_instances.length, 6);
    const patch = await loadStylePatch(client, before.household.id, first.styleId);
    const after = applyStylePatch(before, patch);
    const saved = after.items.find((row) => row.style.id === first.styleId);
    assert.equal(isIncompleteItem(saved), false);
    assert.equal(saved.style.name, "");
    await saveItem(client, after, TEST_USER, { ...values, name: "以后补的名字", styleId: saved.style.id, instanceId: saved.instance.id }, newSaveSession(), () => {});
    for (const deleted_at of [new Date().toISOString(), null]) {
      const result = await client.from("item_instances").update({ deleted_at }).eq("id", saved.instance.id).select().single();
      assert.equal(result.error, null);
      assert.equal(result.data.inventory_code, first.inventoryCode);
    }
    const draft = await saveItem(client, after, TEST_USER, { ...values, locationId: "" }, newSaveSession(), () => {});
    assert.equal(draft.completion, "draft");
    assert.equal(draft.inventoryCode, "GC-000007");
    const final = await loadWorkspace(client, before.household, TEST_USER);
    assert.equal(isIncompleteItem(final.items.find((row) => row.style.id === draft.styleId)), true);
    assert.deepEqual(fixture.db.item_styles.slice(0, 5).map((row) => [row.id, row.name]), originalNames);
    assert.equal(fixture.state().initialHistoryHash, fixture.state().historyHash);
    assert.equal(fixture.metrics.uploads.length, 0);
    const writes = fixture.metrics.requests.filter((req) => req.method !== "GET");
    assert.ok(!writes.some((req) => req.path.includes("storage")));
    assert.ok(buildWorkspace(final).items.every((item) => inventoryCode(item)));
  } finally { await fixture.close(); }
});
