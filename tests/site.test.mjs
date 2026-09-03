// The per-tool pages are generated from scripts/site-content.mjs; check that
// every page exists, is well-formed and points at real files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { TOOL_PAGES } from "../scripts/site-content.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("every built tool has a landing page and every page has a built tool", async () => {
  const dist = new Set((await readdir(path.join(root, "dist"))).filter((f) => f.endsWith(".js")).map((f) => f.replace(/\.js$/, "")));
  assert.deepEqual([...new Set(TOOL_PAGES.map((p) => p.tool))].sort(), [...dist].sort());
  assert.equal(new Set(TOOL_PAGES.map((p) => p.slug)).size, TOOL_PAGES.length, "slugs are unique");
});

for (const p of TOOL_PAGES) {
  test(`page /${p.slug} is complete`, async () => {
    const html = await readFile(path.join(root, `${p.slug}.html`), "utf8");
    assert.ok(html.includes(`<link rel="canonical" href="https://x-utils.com/${p.slug}">`));
    assert.ok(html.includes(`<title>${p.title.replace(/&/g, "&amp;")} · x-utils</title>`));
    assert.ok(html.includes("X (Twitter)"), "mentions Twitter for search");
    assert.ok(!html.includes("dpua"), "no local username leaks");
    for (const source of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])) assert.doesNotThrow(() => new vm.Script(source, { filename: `${p.slug}.html` }));
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    assert.deepEqual(blocks.map((b) => b["@type"]).sort(), ["BreadcrumbList", "FAQPage", "HowTo"]);
    assert.equal(blocks.find((b) => b["@type"] === "FAQPage").mainEntity.length, p.faqs.length);
    for (const [, href] of html.matchAll(/href="\/(dist\/[^"]+|docs\/[^"]+)"/g)) await access(path.join(root, href));
    for (const [, src] of html.matchAll(/<img src="\/([^"]+)"/g)) await access(path.join(root, src));
    for (const [, slug] of html.matchAll(/class="card" href="\/([a-z-]+)"/g)) assert.ok(TOOL_PAGES.some((q) => q.slug === slug), `related link to unknown page ${slug}`);
    assert.equal((html.match(new RegExp(`data-copy="${p.tool}"`, "g")) || []).length, 2, "hero and step 3 copy buttons");
  });
}

test("sitemap lists the home page, every tool page and every sample report", async () => {
  const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
  assert.ok(sitemap.includes("<loc>https://x-utils.com/</loc>"));
  for (const p of TOOL_PAGES) assert.ok(sitemap.includes(`<loc>https://x-utils.com/${p.slug}</loc>`), p.slug);
  for (const f of (await readdir(path.join(root, "docs", "examples"))).filter((f) => f.endsWith(".html"))) assert.ok(sitemap.includes(`/docs/examples/${f}</loc>`));
});

test("the home page links to every tool page", async () => {
  const html = await readFile(path.join(root, "index.html"), "utf8");
  for (const p of TOOL_PAGES) assert.ok(html.includes(`href="/${p.slug}"`), `home does not link to /${p.slug}`);
});
