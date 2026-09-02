import { test } from "node:test";
import assert from "node:assert/strict";
import { loadLib } from "./helpers.mjs";

const lib = await loadLib();

test("postingHeatmap buckets posts by local weekday and hour", () => {
  const rows = [
    { createdAt: "2026-09-01T10:00:00", interactions: 10 }, // local time string, no Z
    { createdAt: "2026-09-01T10:30:00", interactions: 30 },
    { createdAt: "2026-09-02T22:00:00", interactions: 5 },
  ];
  const hm = lib.postingHeatmap(rows);
  const d1 = (new Date("2026-09-01T10:00:00").getDay() + 6) % 7;
  const d2 = (new Date("2026-09-02T22:00:00").getDay() + 6) % 7;
  assert.equal(hm.cells[d1][10].posts, 2);
  assert.equal(hm.cells[d1][10].avg, 20);
  assert.equal(hm.cells[d2][22].posts, 1);
  assert.equal(hm.max, 20);
});

test("svgHeatmap draws 168 cells and escapes titles", () => {
  const hm = lib.postingHeatmap([{ createdAt: "2026-09-01T10:00:00", interactions: 3 }]);
  const svg = lib.svgHeatmap(hm);
  assert.equal((svg.match(/<rect class="hm/g) || []).length, 168 + 5, "7x24 cells plus the 5 legend swatches");
  assert.ok(svg.includes("<title>"));
  assert.ok(svg.startsWith('<svg class="chart chart-heatmap"'));
});

test("svgBars draws one bar per point and labels the extremes", () => {
  const svg = lib.svgBars([{ label: "2026-08-01", value: 5, title: "a <b>" }, { label: "2026-08-02", value: 10 }], { valueLabel: "likes" });
  assert.equal((svg.match(/<rect class="bar-v"/g) || []).length, 2);
  assert.ok(svg.includes("a &lt;b&gt;"));
  assert.ok(svg.includes(">10 likes · square-root scale<"));
  assert.ok(svg.includes("2026-08-01") && svg.includes("2026-08-02"));
  assert.equal(lib.svgBars([]), "");
});

test("sizeHistogram uses log buckets and counts unknown sizes", () => {
  const hist = lib.sizeHistogram([{ followers: 5 }, { followers: 500 }, { followers: 5000 }, { followers: 50000 }, { followers: 500000 }, { followers: null }, {}]);
  assert.deepEqual(hist.buckets.map((b) => b.count), [1, 1, 1, 1, 1]);
  assert.equal(hist.unknown, 2);
  const svg = lib.svgHistogram(hist);
  assert.equal((svg.match(/<rect class="bar-v"/g) || []).length, 5);
  assert.ok(svg.includes("100k+"));
});

test("svgTrend needs two points and renders dots, area and line", () => {
  assert.equal(lib.svgTrend([{ date: "2026-08-01T00:00:00Z", value: 10 }]), "");
  const svg = lib.svgTrend([{ date: "2026-08-01T00:00:00Z", value: 10 }, { date: "2026-08-15T00:00:00Z", value: 12 }, { date: "2026-09-01T00:00:00Z", value: 11 }], { valueLabel: "followers" });
  assert.equal((svg.match(/<circle class="dot"/g) || []).length, 3);
  assert.ok(svg.includes('class="area"') && svg.includes('class="line"'));
  assert.ok(svg.includes("2026-08-01") && svg.includes("2026-09-01"));
});

test("htmlChartSection skips empty charts and disappears when none remain", () => {
  const html = lib.htmlChartSection({ id: "c", title: "Charts", charts: [{ title: "A", svg: "<svg></svg>", caption: "cap" }, { title: "B", svg: "" }] });
  assert.equal((html.match(/<figure class="chart-card">/g) || []).length, 1);
  assert.ok(html.includes("<strong>A</strong><span>cap</span>"));
  assert.equal(lib.htmlChartSection({ id: "c", title: "Charts", charts: [{ title: "B", svg: "" }] }), "");
});

test("htmlTableSection renders quick-filter chips and row data attributes", () => {
  const rows = [{ handle: "a", followers: 20000, verified: true, bio: "", createdAt: "2026-08-01T00:00:00Z" }, { handle: "b", followers: 50, verified: false, bio: "x", createdAt: null }];
  const html = lib.htmlTableSection({ id: "t", title: "T", columns: ["handle", "followers", "bio", "url"], rows, chips: lib.XU_USER_CHIPS });
  assert.equal((html.match(/class="chip-btn"/g) || []).length, 5);
  assert.ok(html.includes('data-chip="{&quot;key&quot;:&quot;followers&quot;,&quot;op&quot;:&quot;gte&quot;,&quot;value&quot;:10000}"'));
  assert.ok(html.includes('data-c-followers="20000"') && html.includes('data-c-verified="true"') && html.includes('data-c-bio=""') && html.includes('data-c-createdAt=""'));
  const noChips = lib.htmlTableSection({ id: "t2", title: "T", columns: ["handle"], rows: [{ handle: "a" }], chips: [{ label: "x", key: "missing", op: "empty" }] });
  assert.ok(!noChips.includes("chips-row"), "chips whose key no row has are dropped");
});

test("renderHtmlReport embeds share data safely and a share button", () => {
  const html = lib.renderHtmlReport({ tool: "t", title: "A </script><script>alert(1)</script>", stats: [{ label: "N", value: 1234 }], breakdown: [{ label: "x", value: 1, tone: "good" }], sections: [] });
  assert.ok(html.includes('<script type="application/json" id="xu-share">'));
  assert.ok(!html.includes("</script><script>alert(1)</script>{"), "closing tag inside JSON must be escaped");
  assert.ok(html.includes("\\u003c/script>"));
  assert.ok(html.includes('"value":"1,234"'));
  assert.ok(html.includes('class="btn-share" data-share'));
  assert.ok(!lib.renderHtmlReport({ tool: "t", title: "x", sections: [], share: false }).includes('class="btn-share"'));
});

test("appendHistory keeps chronological points capped at the limit", () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const key = lib.historyKey("followers", "Me");
  assert.equal(key, "xu:history:followers:me");
  for (let i = 0; i < 5; i++) lib.appendHistory(key, { takenAt: `2026-09-0${i + 1}T00:00:00Z`, count: 100 + i }, 3);
  const history = lib.loadHistory(key);
  assert.deepEqual(history.map((p) => p.count), [102, 103, 104]);
  delete globalThis.localStorage;
});
