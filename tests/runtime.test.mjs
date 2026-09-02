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

test("noteResponse tracks per-operation quota and exhaustedQuota reports a used-up list operation", () => {
  const lib2 = lib;
  const reset = String(Math.floor(Date.now() / 1000) + 600);
  const headers = (h) => ({ "x-rate-limit-remaining": "3", "x-rate-limit-reset": reset, "x-rate-limit-limit": "50" })[h] ?? null;
  lib2.noteResponse("https://x.com/i/api/graphql/abc/UserTweets?variables=%7B%7D", 200, headers);
  assert.equal(lib2.xuDebug.quota.UserTweets.remaining, 3);
  assert.equal(lib2.xuDebug.responses.UserTweets, 1);
  assert.equal(lib2.exhaustedQuota(), null, "quota left means nothing is exhausted");
  lib2.noteResponse("https://x.com/i/api/graphql/abc/UserTweets", 200, (h) => (h === "x-rate-limit-remaining" ? "0" : headers(h)));
  const gone = lib2.exhaustedQuota();
  assert.equal(gone.op, "UserTweets");
  assert.ok(gone.resetAt > Date.now());
  lib2.noteResponse("https://x.com/i/api/graphql/abc/UserByScreenName", 200, (h) => (h === "x-rate-limit-remaining" ? "0" : headers(h)));
  assert.equal(lib2.exhaustedQuota().op, "UserTweets", "profile lookups are not list operations");
  lib2.noteResponse("https://x.com/i/api/graphql/abc/Followers", 429, headers);
  assert.equal(lib2.xuDebug.rateLimit.op, "Followers");
  assert.equal(lib2.xuDebug.quota.Followers.remaining, 0);
  assert.equal(lib2.xuDebug.statuses["429"], 1);
  delete lib2.xuDebug.quota.UserTweets;
  delete lib2.xuDebug.quota.Followers;
  lib2.xuDebug.rateLimit = null;
});
