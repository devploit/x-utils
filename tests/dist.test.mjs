// Smoke test for the built files: each dist/*.js must be valid, self-contained
// and fail cleanly (no uncaught error) when pasted outside x.com.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const files = (await readdir(distDir)).filter((f) => f.endsWith(".js")).sort();

test("dist contains one build per tool", async () => {
  const tools = (await readdir(path.join(distDir, "..", "src", "tools"))).filter((f) => f.endsWith(".js")).sort();
  assert.deepEqual(files, tools, "run `npm run build` to refresh dist/");
});

for (const file of files) {
  test(`${file} refuses to run outside x.com without throwing`, async () => {
    const source = await readFile(path.join(distDir, file), "utf8");
    const errors = [];
    const context = vm.createContext({
      console: { log() {}, warn() {}, error: (...args) => errors.push(args.join(" ")), table() {} },
      location: { hostname: "example.com", pathname: "/", href: "https://example.com/", search: "" },
      window: {},
      document: {},
      setTimeout,
      clearTimeout,
      URL,
      URLSearchParams,
      Promise,
    });
    const result = vm.runInContext(source, context, { filename: file });
    await result; // the IIFE promise, already caught inside the bundle
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(errors.length, 1, `expected exactly one error line, got: ${errors.join(" || ")}`);
    assert.match(errors[0], /only runs on x\.com/);
  });

  test(`${file} exposes an editable CONFIG block before the runtime`, async () => {
    const source = await readFile(path.join(distDir, file), "utf8");
    const configAt = source.indexOf("const CONFIG = {");
    const runtimeAt = source.indexOf("// ==== x-utils runtime (inlined) ====");
    assert.ok(configAt > 0 && configAt < runtimeAt, "CONFIG must come first so users can edit it easily");
    assert.match(source, /Do not edit dist\/ by hand/);
  });
}
