import assert from "node:assert/strict";
import test from "node:test";
import { buildLocationIndex, compactLocationPath } from "../lib/collection/locations.ts";

const node = (id, parent_id = null, sort_order = 0) => ({ id, parent_id, sort_order, name: id });
const item = (id, current, home = null, deleted = false) => ({ instance: { id, current_location_id: current, home_location_id: home, deleted_at: deleted ? "2026-01-01" : null }, style: { deleted_at: null } });
test("locations: immediate children, arbitrary descendants, direct-at-parent and duplicate instances", () => {
  const nodes = [node("家"), node("书房", "家"), node("册", "书房"), node("页", "册"), node("袋", "页"), node("痛包")];
  const index = buildLocationIndex(nodes, [item("1", "家"), item("2", "袋"), item("3", "袋"), item("4", null, "页"), item("5", "痛包"), item("6", "袋", null, true)]);
  assert.equal(index.children.get(null).length, 2);
  assert.deepEqual(index.children.get("家").map((v) => v.id), ["书房"]);
  assert.equal(index.counts.get("家"), 4);
  assert.equal(index.counts.get("袋"), 2);
  assert.equal(index.counts.get("页"), 3);
  assert.deepEqual([...index.descendantIds("书房")], ["书房", "册", "页", "袋"]);
  assert.deepEqual(index.lineage("袋").map((v) => v.id), ["家", "书房", "册", "页", "袋"]);
});
test("locations: no three-child cap, cycles and missing parents fail safely", () => {
  const index = buildLocationIndex([node("root"), ...Array.from({ length: 6 }, (_, i) => node(String(i), "root", i)), node("a", "b"), node("b", "a"), node("orphan", "gone")], []);
  assert.equal(index.children.get("root").length, 6);
  assert.equal(index.descendantIds("a").size, 2);
  assert.equal(index.lineage("a").length, 2);
  assert.ok(index.children.get(null).some((v) => v.id === "orphan"));
  assert.equal(compactLocationPath("家 / 书房 / 册 / 第4页"), "册 · 第4页");
});
