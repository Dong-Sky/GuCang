import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { startMockSupabase, TEST_USER } from "./mock-supabase.mjs";
import { loadWorkspace, loadStylePatch } from "../lib/collection/api.ts";
import { saveItem, saveLocationRecord, newSaveSession } from "../lib/collection/save.ts";
import { applyStylePatch } from "../lib/collection/model.ts";

test("real Supabase client: scoped save/retry, complete metadata pagination, and historical image preservation", async () => {
  const fixture = await startMockSupabase({ port: 0 });
  try {
    const client = createClient(fixture.url, "local-only", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const before = await loadWorkspace(client, fixture.db.households[0], TEST_USER);
    assert.equal(before.instances.length, 1205);
    assert.equal(before.items.length, 1204);
    assert.equal(fixture.metrics.signBatches.length, 0, "metadata loading must not sign every historical photo");
    const history = fixture.state().historyHash;
    fixture.metrics.requests.length = 0;
    const values = { name: "保存重试测试", ip: "新 IP", category: "新分类", character: "新角色", series: "新系列", notes: "", locationId: before.locations[0].id, status: "stored", quick: false, files: [], quality: "standard" };
    const session = newSaveSession();
    const progress = [];
    const result = await saveItem(client, before, TEST_USER, values, session, (value) => progress.push(value));
    await saveItem(client, before, TEST_USER, values, session, () => {});
    assert.equal(fixture.db.item_styles.length, 1206);
    assert.equal(fixture.db.item_instances.length, 1206);
    assert.equal(fixture.db.ips.filter((row) => row.name === "新 IP").length, 1);
    assert.equal(fixture.db.characters.filter((row) => row.name === "新角色").length, 1);
    assert.equal(fixture.db.item_style_characters.filter((row) => row.item_style_id === result.styleId).length, 1);
    const patch = await loadStylePatch(client, before.household.id, result.styleId);
    const after = applyStylePatch(before, patch);
    const saved = after.items.find((item) => item.style.id === result.styleId);
    assert.equal(saved.characters[0].name, "新角色");
    assert.equal(saved.path, "测试收纳盒");
    assert.equal(saved.style.completion_status, "complete");
    assert.equal(fixture.state().historyHash, history);
    assert.equal(after.imageBytes, before.imageBytes);
    assert.ok(!fixture.metrics.requests.some((request) => request.path === "/rest/v1/household_members"));
    assert.ok(fixture.metrics.requests.filter((request) => request.method === "GET" && request.path === "/rest/v1/item_instances").every((request) => request.query.item_style_id === `eq.${result.styleId}`));
    assert.ok(progress.some((value) => value.stage === "save"));

    const editedValues = { ...values, styleId: result.styleId, instanceId: saved.instance.id, name: "已更新", status: "temporarily_out" };
    await saveItem(client, after, TEST_USER, editedValues, newSaveSession(), () => {});
    const edited = await loadStylePatch(client, before.household.id, result.styleId);
    assert.equal(edited.instances[0].physical_status, "temporarily_out");
    assert.equal(edited.instances[0].current_location_id, null);
    assert.equal(edited.movements.length, 1);
    assert.equal(edited.images.length, 0);
    assert.equal(fixture.state().historyHash, history);
  } finally { await fixture.close(); }
});

test("location save retries keep one node, read only that node's images, and never alter existing photos", async () => {
  const fixture = await startMockSupabase({ port: 0, count: 5 });
  try {
    const client = createClient(fixture.url, "local-only", { auth: { persistSession: false, autoRefreshToken: false } });
    const workspace = await loadWorkspace(client, fixture.db.households[0], TEST_USER);
    const session = newSaveSession();
    const values = { name: "新子位置", type: "页码", parentId: workspace.locations[0].id, description: "", quality: "standard", files: [] };
    const first = await saveLocationRecord(client, workspace, TEST_USER, values, session, () => {});
    const second = await saveLocationRecord(client, workspace, TEST_USER, values, session, () => {});
    assert.equal(first.location.id, second.location.id);
    assert.equal(fixture.db.locations.length, 2);
    assert.equal(fixture.state().initialHistoryHash, fixture.state().historyHash);
  } finally { await fixture.close(); }
});
