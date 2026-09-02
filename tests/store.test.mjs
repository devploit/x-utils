import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLib } from "./helpers.mjs";

const lib = await loadLib();

test("diffUserLists matches by id first, then by handle, and detects renames", () => {
  const previous = [
    { id: "1", handle: "stays" },
    { id: "2", handle: "old_name" },
    { id: "3", handle: "leaves" },
    { id: null, handle: "dom_only_prev" },
  ];
  const current = [
    { id: "1", handle: "stays" },
    { id: "2", handle: "new_name" },
    { id: "4", handle: "arrives" },
    { id: "77", handle: "DOM_ONLY_PREV" },
  ];
  const diff = lib.diffUserLists(previous, current);
  assert.deepEqual(diff.added.map((u) => u.handle), ["arrives"]);
  assert.deepEqual(diff.removed.map((u) => u.handle), ["leaves"]);
  assert.deepEqual(diff.renamed, [{ from: "old_name", to: "new_name", id: "2" }]);
});

test("diffUserLists with identical lists reports no changes", () => {
  const list = [{ id: "1", handle: "a" }, { id: null, handle: "b" }];
  assert.deepEqual(lib.diffUserLists(list, list), { added: [], removed: [], renamed: [] });
});

test("makeSnapshot stores only identity fields", () => {
  const snap = lib.makeSnapshot("followers", "Me", [{ id: "1", handle: "a", name: "A", bio: "secret", followers: 10 }]);
  assert.equal(snap.kind, "followers");
  assert.equal(snap.count, 1);
  assert.deepEqual(snap.users, [{ id: "1", handle: "a", name: "A" }]);
  assert.match(snap.takenAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("snapshotKey is case-insensitive on the owner", () => {
  assert.equal(lib.snapshotKey("following", "Alice"), "xu:snapshot:following:alice");
});
