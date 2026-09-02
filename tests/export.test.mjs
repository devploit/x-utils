import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLib } from "./helpers.mjs";

const lib = await loadLib();

test("csvEscape quotes separators, doubles quotes, joins arrays and neutralises formulas", () => {
  assert.equal(lib.csvEscape("plain"), "plain");
  assert.equal(lib.csvEscape('say "hi", ok'), '"say ""hi"", ok"');
  assert.equal(lib.csvEscape("line\nbreak"), '"line\nbreak"');
  assert.equal(lib.csvEscape(["a", "b"]), "a | b");
  assert.equal(lib.csvEscape(null), "");
  assert.equal(lib.csvEscape("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(lib.csvEscape("@handle"), "'@handle");
  assert.equal(lib.csvEscape(12), "12");
  assert.equal(lib.csvEscape(false), "false");
});

test("toCsv writes a header and one line per row using the given columns", () => {
  const csv = lib.toCsv([{ handle: "a", n: 1 }, { handle: "b,c", n: null }], ["handle", "n"]);
  assert.equal(csv, 'handle,n\na,1\n"b,c",');
});

test("toCsv infers columns from the first row", () => {
  assert.equal(lib.toCsv([{ x: 1, y: 2 }]), "x,y\n1,2");
  assert.equal(lib.toCsv([]), "");
});

test("tweetsToMarkdown renders one section per post with stats and link", () => {
  const md = lib.tweetsToMarkdown(
    [{ id: "1", author: "alice", createdAt: "2026-09-01T10:00:00.000Z", text: "hello\nworld", likes: 5, retweets: 1, replies: 0, views: 100, media: ["https://m/1.jpg"], url: "https://x.com/alice/status/1" }],
    { title: "Bookmarks of @me" },
  );
  assert.match(md, /^# Bookmarks of @me/);
  assert.match(md, /### 1\. @alice · 2026-09-01/);
  assert.match(md, /> hello\n> world/);
  assert.match(md, /- media: https:\/\/m\/1\.jpg/);
  assert.match(md, /5 likes · 1 reposts · 0 replies · 100 views · \[link\]\(https:\/\/x\.com\/alice\/status\/1\)/);
});

test("threadToMarkdown and threadToPlainText keep the posts in order", () => {
  const tweets = [
    { id: "1", author: "a", createdAt: "2026-09-01T10:00:00.000Z", text: "first", media: [], url: "https://x.com/a/status/1" },
    { id: "2", author: "a", createdAt: "2026-09-01T10:01:00.000Z", text: "second", media: ["https://m/2.jpg"], url: "https://x.com/a/status/2" },
  ];
  const md = lib.threadToMarkdown(tweets, { author: "a", title: "Thread by @a" });
  assert.ok(md.indexOf("first") < md.indexOf("second"));
  assert.match(md, /!\[media\]\(https:\/\/m\/2\.jpg\)/);
  assert.match(md, /2 posts · \[original\]\(https:\/\/x\.com\/a\/status\/1\)/);
  assert.equal(lib.threadToPlainText(tweets), "1/2\nfirst\n\n2/2\nsecond\nhttps://m/2.jpg");
});
