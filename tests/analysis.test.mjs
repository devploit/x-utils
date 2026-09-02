import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLib } from "./helpers.mjs";

const lib = await loadLib();
const NOW = Date.parse("2026-09-02T12:00:00Z");

test("scoreUserQuality flags obvious bot signals and explains them", () => {
  const bot = { enriched: true, handle: "john8237461", bio: "", defaultAvatar: true, tweets: 0, followers: 0, following: 900, createdAt: "2026-08-30T00:00:00Z" };
  const { score, reasons } = lib.scoreUserQuality(bot, {}, NOW);
  assert.ok(score >= 10, `score was ${score}`);
  assert.deepEqual(reasons, ["default avatar", "never posted", "empty bio", "0 followers", "follows 900, followed by 0", "account is 3 days old", "auto-generated looking handle"]);
});

test("scoreUserQuality gives a healthy account a low score", () => {
  const human = { enriched: true, handle: "alice", bio: "engineer", defaultAvatar: false, tweets: 4000, followers: 800, following: 400, createdAt: "2015-01-01T00:00:00Z" };
  assert.equal(lib.scoreUserQuality(human, {}, NOW).score, 0);
});

test("scoreUserQuality returns null for rows without profile data", () => {
  const { score, reasons } = lib.scoreUserQuality({ handle: "x", enriched: false, source: "dom" }, {}, NOW);
  assert.equal(score, null);
  assert.equal(reasons.length, 1);
});

test("buildThreadChain follows the author's self-replies from the root", () => {
  const tweets = [
    { id: "3", author: "me", inReplyToId: "2", createdAt: "2026-09-01T10:02:00Z" },
    { id: "1", author: "me", inReplyToId: null, createdAt: "2026-09-01T10:00:00Z" },
    { id: "2", author: "me", inReplyToId: "1", createdAt: "2026-09-01T10:01:00Z" },
    { id: "9", author: "someone", inReplyToId: "1", createdAt: "2026-09-01T10:00:30Z" },
    { id: "10", author: "me", inReplyToId: "9", createdAt: "2026-09-01T10:05:00Z" },
  ];
  const chain = lib.buildThreadChain(tweets, "3");
  assert.deepEqual(chain.tweets.map((t) => t.id), ["1", "2", "3"]);
  assert.equal(chain.author, "me");
  assert.equal(chain.method, "reply-chain");
});

test("buildThreadChain falls back to on-screen order without reply metadata", () => {
  const tweets = [
    { id: "1", author: "me" },
    { id: "5", author: "other" },
    { id: "2", author: "ME" },
  ];
  const chain = lib.buildThreadChain(tweets, "1");
  assert.deepEqual(chain.tweets.map((t) => t.id), ["1", "2"]);
  assert.equal(chain.method, "dom-order");
});

test("buildThreadChain returns empty when the focal post is missing", () => {
  assert.deepEqual(lib.buildThreadChain([{ id: "1", author: "a" }], "999"), { tweets: [], author: null, method: "none" });
});

test("engagementStats computes totals, medians, rates and best slots", () => {
  const rows = [
    { id: "1", likes: 10, retweets: 2, replies: 1, quotes: 0, views: 1300, createdAt: "2026-08-31T09:30:00.000Z" },
    { id: "2", likes: 30, retweets: 5, replies: 5, quotes: 0, views: 2000, createdAt: "2026-09-01T09:15:00.000Z" },
    { id: "3", likes: 2, retweets: 0, replies: 0, quotes: 0, views: null, createdAt: "2026-09-01T20:00:00.000Z" },
  ];
  const stats = lib.engagementStats(rows);
  assert.equal(stats.totals.posts, 3);
  assert.equal(stats.totals.likes, 42);
  assert.equal(stats.totals.views, 3300);
  assert.equal(stats.medians.likes, 10);
  assert.equal(stats.rows[0].interactions, 13);
  assert.equal(stats.rows[0].engagementRate, 1);
  assert.equal(stats.rows[2].engagementRate, null);
  assert.equal(stats.averages.engagementRate, 1.5);
  assert.match(stats.bestHourLocal, /^\d{2}:00$/);
  assert.ok(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].includes(stats.bestWeekday));
});

test("engagementStats handles an empty input", () => {
  const stats = lib.engagementStats([]);
  assert.equal(stats.totals.posts, 0);
  assert.equal(stats.medians.likes, null);
  assert.equal(stats.bestHourLocal, null);
});

test("buildThreadChain continues with the author's on-screen posts when metadata runs out", () => {
  const tweets = [
    { id: "1", author: "me", inReplyToId: null, createdAt: "2026-09-01T10:00:00Z" },
    { id: "2", author: "me", inReplyToId: "1", createdAt: "2026-09-01T10:01:00Z" },
    { id: "3", author: "me", inReplyToId: null, createdAt: null }, // DOM-only, no metadata
    { id: "4", author: "me", inReplyToId: null, createdAt: null },
    { id: "9", author: "someone", inReplyToId: null },
    { id: "5", author: "me", inReplyToId: null }, // after a stranger: not part of the thread
    { id: "77", author: "other", inReplyToId: "1", offscreen: true },
  ];
  const chain = lib.buildThreadChain(tweets, "2");
  assert.deepEqual(chain.tweets.map((t) => t.id), ["1", "2", "3", "4"]);
  assert.equal(chain.method, "reply-chain+order");
});

test("newestPostDate ignores the pinned post and undated entries", () => {
  const tweets = [
    { id: "p", createdAt: "2026-09-01T00:00:00.000Z" }, // pinned, newest but excluded
    { id: "a", createdAt: "2024-03-01T00:00:00.000Z" },
    { id: "b", createdAt: "2025-01-15T00:00:00.000Z" },
    { id: "c", createdAt: null },
  ];
  assert.equal(lib.newestPostDate(tweets, ["p"]), "2025-01-15T00:00:00.000Z");
  assert.equal(lib.newestPostDate([{ id: "p", createdAt: "2026-09-01T00:00:00.000Z" }], ["p"]), null);
  assert.equal(lib.newestPostDate([]), null);
});
