// Builds one self-contained, paste-ready script per tool into dist/.
// Each output = banner + tool CONFIG + inlined runtime (src/lib/*) + tool body.
// No dependencies; run with `npm run build`.

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const libDir = path.join(root, "src", "lib");
const toolsDir = path.join(root, "src", "tools");
const distDir = path.join(root, "dist");

const CONFIG_START = "// == CONFIG ==";
const CONFIG_END = "// == END CONFIG ==";

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));

async function readSorted(dir) {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".js")).sort();
  return Promise.all(files.map(async (f) => ({ file: f, source: await readFile(path.join(dir, f), "utf8") })));
}

function parseTool({ file, source }) {
  const meta = {};
  for (const match of source.matchAll(/^\/\/ @(\w+)\s+(.*)$/gm)) meta[match[1]] = match[2].trim();
  for (const key of ["name", "description", "page"]) {
    if (!meta[key]) throw new Error(`${file}: missing "// @${key}" header`);
  }
  const start = source.indexOf(CONFIG_START);
  const end = source.indexOf(CONFIG_END);
  if (start < 0 || end < 0 || end < start) throw new Error(`${file}: CONFIG block markers not found`);
  const config = source.slice(start + CONFIG_START.length, end).trim();
  const body = source.slice(end + CONFIG_END.length).trim();
  return { id: path.basename(file, ".js"), meta, config, body };
}

function banner(tool) {
  return `/*!
 * x-utils v${pkg.version} · ${tool.meta.name}
 * ${tool.meta.description}
 *
 * HOW TO RUN
 *   1. Log in to x.com and open: ${tool.meta.page}
 *   2. Open DevTools (F12, or Cmd+Option+I on macOS) and select the Console tab.
 *   3. Paste this entire file and press Enter. Keep the tab in the foreground.
 *
 * Runs entirely inside your browser session. Nothing is sent anywhere.
 * Edit the CONFIG block below to tune the run.
 *
 * Generated from src/tools/${tool.id}.js by \`npm run build\`. Do not edit dist/ by hand.${pkg.homepage ? `\n * ${pkg.homepage}` : ""}
 */`;
}

function assemble(tool, lib) {
  return `${banner(tool)}
(async () => {
"use strict";

// ==== CONFIG ====
${tool.config}

// ==== x-utils runtime (inlined) ====
${lib}

// ==== ${tool.meta.name} ====
${tool.body}

})().catch((err) => {
  if (!/^x-utils:/.test(String(err && err.message))) {
    console.error("%c✗ x-utils", "color:#f4212e;font-weight:600", "Failed:", err);
    try {
      const panel = document.querySelector("[data-xu-overlay]");
      if (panel) panel.firstChild.nextSibling.textContent = "Failed: " + (err && err.message ? err.message : err);
    } catch {}
  }
});
`;
}

const libParts = await readSorted(libDir);
const lib = libParts.map((p) => p.source.trim()).join("\n\n");

const versionMatch = lib.match(/const XU_VERSION = "([^"]+)"/);
if (!versionMatch || versionMatch[1] !== pkg.version) {
  throw new Error(`XU_VERSION in src/lib/00-runtime.js (${versionMatch && versionMatch[1]}) must match package.json version (${pkg.version})`);
}

await mkdir(distDir, { recursive: true });
const tools = (await readSorted(toolsDir)).map(parseTool);
const manifest = [];
for (const tool of tools) {
  const output = assemble(tool, lib);
  new vm.Script(output, { filename: `dist/${tool.id}.js` }); // syntax check only, never executed
  await writeFile(path.join(distDir, `${tool.id}.js`), output);
  manifest.push({ id: tool.id, name: tool.meta.name, description: tool.meta.description, page: tool.meta.page, file: `dist/${tool.id}.js` });
  console.log(`built dist/${tool.id}.js (${(output.length / 1024).toFixed(1)} KB)`);
}
await writeFile(path.join(distDir, "manifest.json"), `${JSON.stringify({ version: pkg.version, tools: manifest }, null, 2)}\n`);
console.log(`${tools.length} tools built.`);
