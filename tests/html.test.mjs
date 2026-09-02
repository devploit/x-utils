import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { loadLib } from "./helpers.mjs";

const lib = await loadLib();

test("the inlined report script is valid JavaScript", () => {
  assert.doesNotThrow(() => new vm.Script(lib.XU_HTML_JS, { filename: "report.js" }));
});

test("htmlEscape neutralises markup and quotes", () => {
  assert.equal(lib.htmlEscape(`<img src=x onerror="alert('1')">&`), "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;");
  assert.equal(lib.htmlEscape(null), "");
});

test("htmlLink only links plain http(s) URLs", () => {
  assert.match(lib.htmlLink("https://x.com/alice", "@alice"), /^<a class="" href="https:\/\/x\.com\/alice" target="_blank" rel="noopener noreferrer">@alice<\/a>$/);
  assert.equal(lib.htmlLink("javascript:alert(1)", "click"), "click");
  assert.equal(lib.htmlLink('https://x.com/a"onmouseover="x', "a"), "a");
});

test("htmlAvatar falls back to initials and never links unsafe images", () => {
  const withImage = lib.htmlAvatar("alice", "Alice", "https://pbs.twimg.com/profile_images/1/a_normal.jpg");
  assert.ok(withImage.includes('src="https://pbs.twimg.com/profile_images/1/a_bigger.jpg"'), "requests the larger avatar variant");
  assert.ok(withImage.includes(">A<img"));
  const noImage = lib.htmlAvatar("bob", null, "javascript:alert(1)");
  assert.ok(!noImage.includes("<img"));
  assert.ok(noImage.includes(">B</span>"));
  assert.equal(lib.avatarHue("alice"), lib.avatarHue("alice"), "hue is deterministic");
});

test("htmlTableSection merges name into the account cell, escapes content and renders typed cells", () => {
  const rows = [
    { handle: "alice", name: "<script>alert(1)</script>", followers: 12345, followsYou: true, youFollow: false, verified: true, protected: false, inactive: true, createdAt: "2018-10-10T20:19:24.000Z", bio: "a & b", reasons: ["default avatar", "never posted"], url: "https://x.com/alice" },
    { handle: "bob", name: "Bob", followers: 10, followsYou: false, youFollow: true, verified: false, protected: false, inactive: false, createdAt: null, bio: "", reasons: [], url: "javascript:alert(1)" },
  ];
  const html = lib.htmlTableSection({ id: "t", title: "Test", columns: ["handle", "name", "followers", "followsYou", "youFollow", "verified", "inactive", "createdAt", "bio", "reasons", "url"], rows });
  assert.ok(!html.includes("<script>alert(1)</script>"), "script tag must be escaped");
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.equal((html.match(/<th /g) || []).length, 9, "name and verified fold into the account column");
  assert.ok(html.includes('class="acct-handle" href="https://x.com/alice"'));
  assert.ok(html.includes(">@alice</a>"));
  assert.ok(html.includes('class="badge badge-verified"'));
  assert.ok(html.includes('<span class="num">12,345</span><i class="bar " style="width:100%"></i>'), "largest value gets a full bar");
  assert.match(html, /<span class="num">10<\/span><i class="bar " style="width:(2[0-9])%">/, "log-scaled bar for the small value");
  assert.ok(html.includes('class="flag flag-good"'), "true relationship flag is good");
  assert.ok(html.includes('class="flag flag-bad">no'), "false relationship flag is bad");
  assert.ok(html.includes('class="flag flag-bad">yes'), "inactive=true is bad");
  assert.ok(lib.htmlFlag("isQuote", false).includes('class="flag flag-off">—'), "an informational false is neutral");
  assert.ok(html.includes('<time datetime="2018-10-10T20:19:24.000Z">2018-10-10</time><span class="rel">'));
  assert.ok(html.includes("a &amp; b"));
  assert.equal((html.match(/<span class="chip">/g) || []).length, 2);
  assert.ok(html.includes('data-filter="t"'), "filter input present");
  assert.ok(html.includes('data-copy="t"'), "copy button present");
  assert.ok(html.includes('data-type="num"'), "numeric sort type on followers");
  assert.ok(!html.includes('href="javascript:'), "unsafe URL is not linked");
});

test("htmlTableSection renders the empty state without a table", () => {
  const html = lib.htmlTableSection({ id: "e", title: "Empty", columns: ["handle"], rows: [], empty: "Nothing to see." });
  assert.ok(html.includes("Nothing to see."));
  assert.ok(!html.includes("<table"));
});

test("htmlCardsSection renders one card per post with media, metrics and ranks when asked", () => {
  const tweets = [
    { id: "1", author: "alice", authorName: "Alice", authorAvatar: "https://pbs.twimg.com/profile_images/1/a_normal.jpg", createdAt: "2026-09-01T10:00:00.000Z", text: "line1\nline2 <b>", likes: 5, views: 100, media: ["https://pbs.twimg.com/media/a.jpg?name=orig", "https://video.twimg.com/v.mp4"], url: "https://x.com/alice/status/1" },
    { id: "2", author: "bob", createdAt: null, text: "", likes: null, media: [], url: "https://x.com/bob/status/2", isRetweet: true },
  ];
  const html = lib.htmlCardsSection({ id: "c", title: "Cards", tweets, numbered: true });
  assert.equal((html.match(/<article class="card"/g) || []).length, 2);
  assert.ok(html.includes("line1<br>line2 &lt;b&gt;"));
  assert.ok(html.includes('<img loading="lazy" src="https://pbs.twimg.com/media/a.jpg?name=small"'), "thumbnail variant on the page");
  assert.ok(html.includes('class="media-item media-video" href="https://video.twimg.com/v.mp4"'));
  assert.ok(html.includes('class="media media-2"'));
  assert.ok(html.includes('<span class="rank num">1</span>'));
  assert.ok(html.includes('<span class="tag">repost</span>'));
  assert.ok(html.includes('title="Likes"') && html.includes('title="Views"'));
  assert.ok(!html.includes('title="Reposts"'), "missing metrics are omitted, not shown as zero");
  assert.ok(html.includes("(no text)"));
  assert.ok(html.includes('data-url="https://x.com/alice/status/1"'));
});

test("htmlBreakdown renders proportional segments and a legend", () => {
  const html = lib.htmlBreakdown([{ label: "Mutuals", value: 30, tone: "good" }, { label: "Not following back", value: 10, tone: "bad" }, { label: "Unknown", value: 0, tone: "neutral" }]);
  assert.equal((html.match(/class="seg /g) || []).length, 2, "zero-valued parts get no segment");
  assert.ok(html.includes('style="flex-grow:30"'));
  assert.ok(html.includes("75%") && html.includes("25%") && html.includes("0%"), "legend shows percentages for every part");
  assert.ok(html.includes('aria-label="Mutuals: 30, Not following back: 10, Unknown: 0"'));
  assert.equal(lib.htmlBreakdown([{ label: "x", value: 0 }]), "", "nothing to draw when the total is zero");
});

test("htmlSubnav lists sections with counts and needs at least two", () => {
  const a = lib.htmlTableSection({ id: "one", title: "First", columns: ["handle"], rows: [{ handle: "a" }] });
  const b = lib.htmlCardsSection({ id: "two", title: "Second", tweets: [] });
  const nav = lib.htmlSubnav([a, b], "non-followers");
  assert.ok(nav.includes('href="#one">First<span class="num">1</span>'));
  assert.ok(nav.includes('href="#two">Second<span class="num">0</span>'));
  assert.ok(nav.includes('class="crumb">non-followers'));
  assert.equal(lib.htmlSubnav([a], "x"), "");
});

test("sections expose CSV export buttons", () => {
  const html = lib.htmlTableSection({ id: "t", title: "T", columns: ["handle"], rows: [{ handle: "a" }] });
  assert.ok(html.includes('data-csv="t"'));
});

test("renderHtmlReport produces a complete standalone document", () => {
  const html = lib.renderHtmlReport({
    tool: "non-followers",
    title: "Report <title>",
    subtitle: "sub",
    generatedAt: "2026-09-02T12:00:00.000Z",
    stats: [{ label: "Following", value: 1234 }, { label: "Bad", value: 3, tone: "bad", href: "#bad" }, { label: "Author", value: "@me" }],
    notes: ["a note"],
    sections: ['<section id="bad"></section>'],
  });
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("<title>Report &lt;title&gt;</title>"));
  assert.ok(html.includes('<span class="value">1,234</span>'));
  assert.ok(html.includes('<a class="stat tone-bad" href="#bad">'));
  assert.ok(html.includes('<span class="value is-text">@me</span>'));
  assert.ok(html.includes('<p class="band-note">a note</p>'));
  assert.ok(html.includes('<section id="bad"></section>'));
  const shell = html.replace(/<section.*<\/section>/s, "").replace(/<link rel="icon"[^>]*>/, "").replace(/<a [^>]*href="https:\/\/x-utils\.com\/"[^>]*>/g, "");
  assert.ok(!/https?:\/\//.test(shell), "no external resources in the shell (links to the project site are fine)");
  assert.ok(html.includes('<link rel="icon" href="data:image/svg+xml,'), "inline favicon");
  assert.ok(html.includes("<style>") && html.includes("<script>"), "CSS and JS are inlined");
});

test("media thumbnails load the small variant and link to the original", () => {
  assert.equal(lib.thumbnailUrl("https://pbs.twimg.com/media/a.jpg?name=orig"), "https://pbs.twimg.com/media/a.jpg?name=small");
  assert.equal(lib.thumbnailUrl("https://pbs.twimg.com/media/a.jpg"), "https://pbs.twimg.com/media/a.jpg");
  const html = lib.htmlMediaList(["https://pbs.twimg.com/media/a.jpg?name=orig", "https://pbs.twimg.com/media/b.jpg?name=orig", "https://pbs.twimg.com/media/c.jpg?name=orig"]);
  assert.ok(html.includes('class="media media-3"'));
  assert.ok(html.includes('href="https://pbs.twimg.com/media/a.jpg?name=orig"') && html.includes('src="https://pbs.twimg.com/media/a.jpg?name=small"'));
  assert.ok(lib.htmlCardsSection({ id: "c", title: "C", tweets: [{ id: "1", author: "a", text: "x", media: [], url: "https://x.com/a/status/1" }] }).includes('class="cards cards-flow"'));
  assert.ok(!lib.htmlCardsSection({ id: "c", title: "C", tweets: [{ id: "1", author: "a", text: "x", media: [], url: "https://x.com/a/status/1" }], numbered: true }).includes("cards-flow"));
});
