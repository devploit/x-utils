// The landing page is hand-written HTML; make sure its inline script parses
// and that every tool it offers exists in dist/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "index.html"), "utf8");

test("landing page inline script is valid JavaScript", () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 1, "expected an inline script");
  for (const source of scripts) assert.doesNotThrow(() => new vm.Script(source, { filename: "index.html" }));
});

test("every Copy script button and Open file link points at an existing dist tool", async () => {
  const dist = new Set((await readdir(path.join(root, "dist"))).filter((f) => f.endsWith(".js")).map((f) => f.replace(/\.js$/, "")));
  const copyIds = [...html.matchAll(/data-copy="([^"]+)"/g)].map((m) => m[1]);
  const fileLinks = [...html.matchAll(/href="dist\/([^"]+)\.js"/g)].map((m) => m[1]);
  assert.ok(copyIds.length === dist.size, `landing offers ${copyIds.length} tools, dist has ${dist.size}`);
  for (const id of [...copyIds, ...fileLinks]) assert.ok(dist.has(id), `missing dist/${id}.js`);
});

test("landing page has no relative og:image and carries the custom domain", () => {
  assert.match(html, /<meta property="og:image" content="https:\/\/x-utils\.com\//);
  assert.ok(html.includes('<link rel="canonical" href="https://x-utils.com/">'));
});

test("home links point at the site root so the URL stays clean", () => {
  assert.ok(html.includes('<a class="brand" href="/"'));
  assert.ok(!html.includes('href="./"') && !html.includes('href="index.html"'));
});

test("landing page structured data is valid JSON and mirrors the visible FAQ and steps", () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const types = blocks.map((b) => b["@type"]);
  assert.deepEqual(types.sort(), ["FAQPage", "HowTo", "SoftwareApplication"]);
  const faq = blocks.find((b) => b["@type"] === "FAQPage");
  const summaries = [...html.matchAll(/<summary>(.*?)<\/summary>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").replace(/&quot;/g, '"'));
  assert.deepEqual(faq.mainEntity.map((q) => q.name), summaries, "FAQ schema must match the questions on the page");
  const howTo = blocks.find((b) => b["@type"] === "HowTo");
  assert.equal(howTo.step.length, (html.match(/<div class="gstep(?: has-aside)?">/g) || []).length);
  const app = blocks.find((b) => b["@type"] === "SoftwareApplication");
  assert.equal(app.offers.price, "0");
});

test("robots.txt, sitemap.xml and every image the landing references exist", async () => {
  const { access } = await import("node:fs/promises");
  const robots = await readFile(path.join(root, "robots.txt"), "utf8");
  assert.match(robots, /^Sitemap: https:\/\/x-utils\.com\/sitemap\.xml$/m);
  const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
  assert.ok(sitemap.includes("<loc>https://x-utils.com/</loc>"));
  for (const [, src] of html.matchAll(/<img src="([^"]+)"/g)) await access(path.join(root, src));
  for (const [, tag] of html.matchAll(/(<img [^>]+>)/g)) {
    assert.match(tag, /width="\d+" height="\d+"/, `image without dimensions: ${tag.slice(0, 80)}`);
    assert.doesNotMatch(tag, /alt=""/, `image without alt text: ${tag.slice(0, 80)}`);
  }
});
