import { test } from "node:test";
import assert from "node:assert/strict";
import { graphqlTweet, graphqlUser, loadLib, timelineResponse } from "./helpers.mjs";

const lib = await loadLib();

test("normalizeUser reads the new core/relationship_perspectives layout", () => {
  const u = lib.normalizeUser(graphqlUser({ id: "7", handle: "Bob", followedBy: false, following_: true }));
  assert.equal(u.id, "7");
  assert.equal(u.handle, "Bob");
  assert.equal(u.name, "Alice");
  assert.equal(u.followers, 120);
  assert.equal(u.tweets, 900);
  assert.equal(u.createdAt, "2018-10-10T20:19:24.000Z");
  assert.equal(u.followsYou, false);
  assert.equal(u.youFollow, true);
  assert.equal(u.defaultAvatar, false);
  assert.equal(u.url, "https://x.com/Bob");
  assert.equal(u.source, "api");
});

test("normalizeUser reads the legacy layout and detects default avatars", () => {
  const raw = {
    rest_id: "9",
    legacy: {
      screen_name: "eve",
      name: "Eve",
      description: "",
      followers_count: 0,
      friends_count: 500,
      statuses_count: 0,
      created_at: "Sun Aug 30 08:00:00 +0000 2026",
      profile_image_url_https: "https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png",
      followed_by: true,
      following: false,
      verified: false,
    },
  };
  const u = lib.normalizeUser(raw);
  assert.equal(u.defaultAvatar, true);
  assert.equal(u.followsYou, true);
  assert.equal(u.youFollow, false);
  assert.equal(u.bio, "");
});

test("normalizeUser reports unknown relationship as null, not false", () => {
  const u = lib.normalizeUser({ rest_id: "1", legacy: { screen_name: "x", name: "X" } });
  assert.equal(u.followsYou, null);
  assert.equal(u.youFollow, null);
  assert.equal(u.followers, null);
});

test("collectEntities finds GraphQL users, REST users and tweets anywhere in a payload", () => {
  const payload = timelineResponse([graphqlUser({ id: "1", handle: "a" }), graphqlUser({ id: "2", handle: "b" })]);
  payload.extra = { users: [{ id_str: "3", screen_name: "rest_user", name: "Rest", followers_count: 4 }] };
  const { users, tweets } = lib.collectEntities(payload);
  assert.equal(users.length, 3);
  assert.equal(tweets.length, 0);
  const rest = lib.normalizeUser(users[2]);
  assert.equal(rest.id, "3");
  assert.equal(rest.handle, "rest_user");
  assert.equal(rest.followers, 4);
});

test("collectEntities separates top-level tweets from quoted/retweeted ones", () => {
  const quoted = graphqlTweet({ id: "500", author: graphqlUser({ handle: "other" }) });
  const top = graphqlTweet({ id: "600", quoted });
  const { users, tweets } = lib.collectEntities(timelineResponse([top]));
  assert.deepEqual(tweets.map((t) => [t.raw.rest_id, t.nested]), [["600", false], ["500", true]]);
  assert.equal(users.length, 2, "tweet authors are discovered too");
});

test("mergeUserRecords lets API data win but never downgrades a true relationship flag", () => {
  const dom = { id: null, handle: "alice", name: "Alice", bio: "", followsYou: true, youFollow: null, verified: false, protected: false, url: "https://x.com/alice", source: "dom" };
  const api = lib.normalizeUser(graphqlUser({ id: "42", handle: "alice", followedBy: false, following_: true, bio: "rich bio" }));
  const merged = lib.mergeUserRecords(dom, api);
  assert.equal(merged.id, "42");
  assert.equal(merged.bio, "rich bio");
  assert.equal(merged.followsYou, true, "DOM badge seen -> stays true");
  assert.equal(merged.youFollow, true);
  assert.equal(merged.enriched, true);
  assert.equal(lib.mergeUserRecords(dom, undefined).enriched, false);
});

test("mergeUserRecords takes the API answer when the DOM had no badge", () => {
  const dom = { handle: "carol", followsYou: false, youFollow: null, source: "dom" };
  const api = lib.normalizeUser(graphqlUser({ handle: "carol", followedBy: true }));
  assert.equal(lib.mergeUserRecords(dom, api).followsYou, true);
  const api2 = lib.normalizeUser(graphqlUser({ handle: "carol", followedBy: false }));
  assert.equal(lib.mergeUserRecords(dom, api2).followsYou, false);
});

test("usersToRows keeps only the requested columns in order", () => {
  const rows = lib.usersToRows([{ handle: "a", name: "A", followers: 1, extra: true }], ["handle", "followers", "missing"]);
  assert.deepEqual(rows, [{ handle: "a", followers: 1, missing: null }]);
});

test("normalizeUser reads the 2026 GraphQL layout captured from x.com (no legacy block)", async () => {
  const { readFile } = await import("node:fs/promises");
  const raw = JSON.parse(await readFile(new URL("./fixtures/graphql-user-2026.json", import.meta.url), "utf8"));
  assert.ok(lib.isRawGraphqlUser(raw), "must be recognised as a user");
  const u = lib.normalizeUser(raw);
  assert.equal(u.id, "1000000000000000001");
  assert.equal(u.handle, "sample_user");
  assert.equal(u.name, "Sample User");
  assert.equal(u.bio, "cofounder @acme");
  assert.equal(u.location, "right behind you");
  assert.equal(u.followers, 1592);
  assert.equal(u.following, 3358);
  assert.equal(u.tweets, 2510);
  assert.equal(u.media, 679);
  assert.equal(u.likes, 5314);
  assert.equal(u.createdAt, "2023-05-08T14:23:40.000Z");
  assert.equal(u.followsYou, true);
  assert.equal(u.youFollow, false);
  assert.equal(u.verified, true, "is_blue_verified counts as verified");
  assert.equal(u.protected, false);
  assert.equal(u.defaultAvatar, false);
  assert.equal(u.avatar, "https://pbs.twimg.com/profile_images/1000000000000000001/sample_normal.jpg");
});

test("htmlAvatar upgrades every small avatar variant to _bigger", () => {
  for (const variant of ["_normal", "_x96", "_mini", "_200x200"]) {
    const html = lib.htmlAvatar("a", "A", `https://pbs.twimg.com/profile_images/1/pic${variant}.jpg`);
    assert.ok(html.includes("pic_bigger.jpg"), variant);
  }
});

test("findBottomCursor and headersToObject support the first-page replay", () => {
  const entries = [{ entryId: "cursor-top-1", content: { cursorType: "Top", value: "TOP" } }, { entryId: "cursor-bottom-1", content: { cursorType: "Bottom", value: "BOTTOM_CURSOR" } }];
  const json = { data: { user: { result: { timeline: { timeline: { instructions: [{ entries }] } } } } } };
  assert.equal(lib.findBottomCursor(json), "BOTTOM_CURSOR");
  assert.equal(lib.findBottomCursor({ data: {} }), null);
  assert.deepEqual(lib.headersToObject({ a: "1", b: "2" }), { a: "1", b: "2" });
  assert.deepEqual(lib.headersToObject([["x", "y"]]), { x: "y" });
  assert.deepEqual(lib.headersToObject(new Map([["k", "v"]])), { k: "v" }, "Headers-like objects with forEach");
  assert.deepEqual(lib.headersToObject(null), {});
});

test("normalizeUser expands t.co links inside the bio", () => {
  const raw = { rest_id: "5", core: { screen_name: "u", name: "U" }, profile_bio: { description: "Building https://t.co/abc daily", entities: { description: { urls: [{ url: "https://t.co/abc", expanded_url: "https://example.com/app" }] } } } };
  assert.equal(lib.normalizeUser(raw).bio, "Building https://example.com/app daily");
});

test("parseCompactCount understands X's localized header counts", () => {
  assert.equal(lib.parseCompactCount("1.301 Seguidores"), 1301);
  assert.equal(lib.parseCompactCount("1,301 Followers"), 1301);
  assert.equal(lib.parseCompactCount("12.5K Followers"), 12500);
  assert.equal(lib.parseCompactCount("1,3 mil seguidores"), 1300);
  assert.equal(lib.parseCompactCount("2 M Followers"), 2000000);
  assert.equal(lib.parseCompactCount("640 Siguiendo"), 640);
  assert.equal(lib.parseCompactCount("no digits"), null);
});

test("describeListEffort scales its advice with the list size", () => {
  assert.match(lib.describeListEffort(500, "followers"), /couple of minutes/);
  assert.match(lib.describeListEffort(1500, "followers"), /5 to 15 minutes/);
  assert.match(lib.describeListEffort(20000, "followers"), /maxUsers/);
  assert.equal(lib.describeListEffort(0, "followers"), null);
});
