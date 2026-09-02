import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLib } from "./helpers.mjs";

const lib = await loadLib();

test("parseTwitterDate handles the classic X format and rejects garbage", () => {
  assert.equal(lib.parseTwitterDate("Wed Oct 10 20:19:24 +0000 2018"), "2018-10-10T20:19:24.000Z");
  assert.equal(lib.parseTwitterDate("not a date"), null);
  assert.equal(lib.parseTwitterDate(null), null);
});

test("daysSince counts whole days", () => {
  const now = Date.parse("2026-09-02T12:00:00Z");
  assert.equal(lib.daysSince("2026-08-03T12:00:00Z", now), 30);
  assert.equal(lib.daysSince(null, now), null);
});

test("pathHandle ignores reserved first segments", () => {
  assert.equal(lib.pathHandle("/jack/following"), "jack");
  assert.equal(lib.pathHandle("/i/bookmarks"), null);
  assert.equal(lib.pathHandle("/settings/blocked/all"), null);
  assert.equal(lib.pathHandle("/"), null);
});

test("slug and outputBaseName produce filesystem-safe names", () => {
  assert.equal(lib.slug("Hello World! ¿qué?"), "hello-world-qu");
  const name = lib.outputBaseName("non-followers", "Some Handle");
  assert.match(name, /^x-utils_non-followers_some-handle_\d{4}-\d{2}-\d{2}$/);
});

test("num converts numeric strings and rejects the rest", () => {
  assert.equal(lib.num("1234"), 1234);
  assert.equal(lib.num(""), null);
  assert.equal(lib.num(undefined), null);
  assert.equal(lib.num("abc"), null);
});
