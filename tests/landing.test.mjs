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
