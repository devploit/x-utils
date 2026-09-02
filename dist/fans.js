/*!
 * x-utils v0.1.0 · Fans
 * Lists the accounts that follow you but you do not follow back.
 *
 * HOW TO RUN
 *   1. Log in to x.com and open: https://x.com/<your_handle>/followers
 *   2. Open DevTools (F12, or Cmd+Option+I on macOS) and select the Console tab.
 *   3. Paste this entire file and press Enter. Keep the tab in the foreground.
 *
 * Runs entirely inside your browser session. Nothing is sent anywhere.
 * Edit the CONFIG block below to tune the run.
 *
 * Generated from src/tools/fans.js by `npm run build`. Do not edit dist/ by hand.
 * https://x-utils.com
 */
(async () => {
"use strict";

// ==== CONFIG ====
const CONFIG = {
  outputs: ["html", "csv", "json"], // formats to download: "html" (report), "csv", "json"
  copyToClipboard: true, // also copy the first format to the clipboard
  scrollDelayMs: 800, // pause between scroll steps; raise it if X rate-limits you
  stagnantRounds: 8, // stop after this many scroll steps without new accounts
  maxUsers: Infinity, // stop early after this many accounts
  refetchFirstPage: true, // bounce tabs so the first page also gets full profile data
  saveSnapshot: true, // store the list locally so followers-diff can compare later
};

// ==== x-utils runtime (inlined) ====
// ---------------------------------------------------------------------------
// x-utils runtime: logging, timing, page guards, file output.
// Every function here is plain and browser-only at call time (never at load
// time) so the same source can be unit-tested in Node.
// ---------------------------------------------------------------------------

const XU_VERSION = "0.1.0";

const XU_STYLE = {
  info: "color:#1d9bf0;font-weight:600",
  ok: "color:#00ba7c;font-weight:600",
  warn: "color:#e0a800;font-weight:600",
  error: "color:#f4212e;font-weight:600",
  step: "color:#8b98a5",
};

const log = {
  info: (...args) => console.log("%c• x-utils", XU_STYLE.info, ...args),
  ok: (...args) => console.log("%c✓ x-utils", XU_STYLE.ok, ...args),
  warn: (...args) => {
    console.warn("%c! x-utils", XU_STYLE.warn, ...args);
    xuOverlay.status(args.map(String).join(" "), "warn");
  },
  error: (...args) => {
    console.error("%c✗ x-utils", XU_STYLE.error, ...args);
    xuOverlay.fail(args.map(String).join(" "));
  },
  step: (...args) => {
    console.log("%c→ x-utils", XU_STYLE.step, ...args);
    xuOverlay.status(args.map(String).join(" "));
  },
  phase: (name) => {
    xuDebug.phase = name;
    xuDebug.phaseAt = new Date().toISOString();
  },
  banner: (name) => {
    console.log(`%c x-utils ${XU_VERSION} · ${name} `, "background:#1d9bf0;color:#fff;font-weight:700;padding:2px 6px;border-radius:3px");
    // Publish diagnostics from the start so a stuck run can still be inspected.
    try {
      window.xu = window.xu || {};
      window.xu.debug = xuDebug;
      xuDebug.phase = "starting";
    } catch {
      /* ignore */
    }
    xuOverlay.start(name);
  },
};

// ---- in-page progress panel ----------------------------------------------
// A small card in the corner of x.com so nobody has to read the console.
// Styles are applied through the CSSOM (allowed by X's CSP). Every method is
// wrapped so a failure here can never break a tool.

// A blob: document opened from x.com inherits X's Content-Security-Policy,
// which blocks the report's script (inline and blob: alike). The in-page
// preview is therefore read-only and says so; the downloaded file is the
// interactive one.
const xuOverlay = {
  root: null,
  parts: null,
  reportUrl: null,
  reportName: null,
  start(name) {
    try {
      if (!document.body) return;
      if (this.root) this.root.remove();
      for (const stale of document.querySelectorAll("[data-xu-overlay]")) stale.remove(); // panels left by earlier runs
      const root = document.createElement("div");
      root.setAttribute("data-xu-overlay", "");
      root.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;width:340px;max-width:calc(100vw - 40px);background:#0d1220;color:#f4f6fb;border:1px solid rgba(255,255,255,.12);border-radius:14px;box-shadow:0 20px 50px -20px rgba(0,0,0,.7);font:13.5px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:14px 16px 12px;box-sizing:border-box";
      const head = document.createElement("div");
      head.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:8px";
      const dot = document.createElement("span");
      dot.style.cssText = "width:10px;height:10px;border-radius:3px;background:linear-gradient(135deg,#b3a6ff,#5ee0a8);flex:0 0 auto";
      const title = document.createElement("span");
      title.textContent = `x-utils · ${name}`;
      title.style.cssText = "font:600 11.5px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;color:#c7cede;flex:1";
      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "×";
      close.setAttribute("aria-label", "Close");
      close.style.cssText = "background:none;border:0;color:#8f9ab3;font-size:20px;line-height:1;cursor:pointer;padding:0 2px";
      close.addEventListener("click", () => this.close());
      head.append(dot, title, close);
      const status = document.createElement("div");
      status.textContent = "Starting…";
      status.style.cssText = "color:#c7cede;min-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
      const bar = document.createElement("div");
      bar.style.cssText = "height:4px;border-radius:2px;background:rgba(255,255,255,.1);margin:10px 0 6px;overflow:hidden;position:relative";
      const fill = document.createElement("div");
      fill.style.cssText = "position:absolute;left:0;top:0;height:100%;width:35%;border-radius:2px;background:linear-gradient(90deg,#b3a6ff,#5ee0a8);animation:xu-slide 1.4s ease-in-out infinite alternate";
      bar.appendChild(fill);
      const foot = document.createElement("div");
      foot.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12px;color:#8f9ab3";
      const count = document.createElement("span");
      count.textContent = "Keep this tab in the foreground";
      const actions = document.createElement("span");
      actions.style.cssText = "display:flex;gap:8px";
      foot.append(count, actions);
      root.append(head, status, bar, foot);
      document.body.appendChild(root);
      this.root = root;
      this.parts = { status, bar, fill, count, actions };
      this.reportUrl = null;
      this.reportName = null;
      // Indeterminate animation via CSSOM so no inline <style> is needed.
      if (!document.getElementById("xu-overlay-anim")) {
        const sheet = document.createElement("style");
        sheet.id = "xu-overlay-anim";
        document.head.appendChild(sheet);
        try {
          sheet.sheet.insertRule("@keyframes xu-slide{from{left:0}to{left:65%}}", 0);
        } catch {
          /* CSP may block; the bar simply stays static */
        }
      }
    } catch {
      /* never break the tool for a cosmetic panel */
    }
  },
  status(text, tone) {
    try {
      if (!this.parts) return;
      this.parts.status.textContent = text;
      this.parts.status.style.color = tone === "warn" ? "#e2b35c" : "#c7cede";
    } catch {
      /* ignore */
    }
  },
  count(text) {
    try {
      if (this.parts) this.parts.count.textContent = text;
    } catch {
      /* ignore */
    }
  },
  setReport(url, filename) {
    this.reportUrl = url;
    this.reportName = filename;
  },
  openReport() {
    try {
      window.open(this.reportUrl, "_blank");
    } catch {
      /* ignore */
    }
    this.count(`For sorting, filtering and export, open ${this.reportName || "the .html file"} from Downloads`);
  },
  done(summary) {
    try {
      if (!this.parts) return;
      this.parts.status.textContent = summary;
      this.parts.status.style.color = "#5ee0a8";
      this.parts.status.style.whiteSpace = "normal";
      this.parts.fill.style.animation = "none";
      this.parts.fill.style.width = "100%";
      this.parts.count.textContent = this.reportName ? `Saved to Downloads as ${this.reportName}` : "Files are in your Downloads folder";
      this.parts.actions.textContent = "";
      if (this.reportUrl) {
        const open = document.createElement("button");
        open.type = "button";
        open.textContent = "Preview (read-only)";
        open.style.cssText = "background:#b3a6ff;color:#0d1220;border:0;border-radius:8px;padding:6px 11px;font:600 12.5px inherit;cursor:pointer";
        open.addEventListener("click", () => this.openReport());
        this.parts.actions.appendChild(open);
      }
    } catch {
      /* ignore */
    }
  },
  fail(text) {
    try {
      if (!this.parts) return;
      this.parts.status.textContent = text;
      this.parts.status.style.color = "#ff9a6c";
      this.parts.status.style.whiteSpace = "normal";
      this.parts.fill.style.animation = "none";
      this.parts.fill.style.background = "#ff9a6c";
      this.parts.fill.style.width = "100%";
      this.parts.count.textContent = "See the console for details";
    } catch {
      /* ignore */
    }
  },
  close() {
    try {
      if (this.root) this.root.remove();
      this.root = null;
      this.parts = null;
    } catch {
      /* ignore */
    }
  },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// X uses the classic "Wed Oct 10 20:19:24 +0000 2018" format in `created_at`.
// Returns an ISO-8601 string or null.
function parseTwitterDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function daysSince(isoDate, now = Date.now()) {
  if (!isoDate) return null;
  const t = new Date(isoDate).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / 86400000);
}

function todayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function slug(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---- page guards ----------------------------------------------------------

function currentPath() {
  return location.pathname.replace(/\/+$/, "") || "/";
}

function requireXHost() {
  if (!/(^|\.)(x|twitter)\.com$/.test(location.hostname)) {
    log.error(`This tool only runs on x.com (you are on ${location.hostname}).`);
    throw new Error("x-utils: wrong host");
  }
}

// `patterns` is an array of strings (exact path) or RegExps tested against the path.
function requirePage(patterns, hint) {
  const path = currentPath();
  const ok = patterns.some((p) => (p instanceof RegExp ? p.test(path) : p === path));
  if (!ok) {
    log.error(`This tool must run on ${hint}. Current page: ${location.href}`);
    throw new Error("x-utils: wrong page");
  }
}

const XU_RESERVED_PATHS = new Set([
  "i", "home", "explore", "notifications", "messages", "settings", "search",
  "compose", "login", "logout", "signup", "tos", "privacy", "about", "jobs",
]);

// Handle of the logged-in account, read from the left navigation bar.
function myHandle() {
  const link = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
  const href = link && link.getAttribute("href");
  return href ? href.replace(/^\//, "").split(/[/?#]/)[0] || null : null;
}

// Handle in the first path segment (e.g. /jack/following -> "jack").
function pathHandle(path = currentPath()) {
  const segment = path.split("/")[1];
  if (!segment || XU_RESERVED_PATHS.has(segment.toLowerCase())) return null;
  return segment;
}

// ---- output ---------------------------------------------------------------

const XU_MIME = { html: "text/html", csv: "text/csv", json: "application/json", md: "text/markdown", txt: "text/plain" };

function saveFile(filename, content, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1500);
  log.ok(`Downloaded ${filename}`);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Writes every requested format. `files` maps format -> content string.
// Returns the list of filenames written.
async function writeOutputs(baseName, files, formats, { clipboard = false } = {}) {
  const written = [];
  for (const format of formats) {
    const content = files[format];
    if (content === undefined) {
      log.warn(`No "${format}" output available for this tool; skipping.`);
      continue;
    }
    const filename = `${baseName}.${format}`;
    saveFile(filename, content, XU_MIME[format] || "text/plain");
    written.push(filename);
    if (format === "html") {
      try {
        xuOverlay.setReport(URL.createObjectURL(new Blob([previewVariant(content, filename)], { type: "text/html;charset=utf-8" })), filename);
      } catch {
        /* ignore */
      }
    }
  }
  if (clipboard) {
    const first = formats.find((f) => files[f] !== undefined);
    if (first) {
      const done = await copyToClipboard(files[first]);
      if (done) log.ok(`${first.toUpperCase()} copied to the clipboard.`);
      else log.warn("Clipboard blocked by the browser (click the page and run again if you need it).");
    }
  }
  return written;
}

// The preview cannot run scripts under X's CSP, so it carries a banner that
// points to the downloaded file for sorting, filtering and export.
function previewVariant(html, filename) {
  const note = `<div style="position:sticky;top:0;z-index:20;background:#a86b0f;color:#fff;font:600 13.5px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:10px 16px;text-align:center">Read-only preview. To sort, filter, export or share, open <span style="font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:500">${filename}</span> from your Downloads folder.</div>`;
  return html.replace(/<body([^>]*)>/, (m) => `${m}${note}`);
}

// Keeps the last result reachable from the console for ad-hoc inspection.
// Raw samples kept for diagnosing X format changes. Never written to files;
// only reachable as window.xu.debug after a run.
const xuDebug = { sampleUser: null, sampleCell: null, sampleTweet: null, sampleArticle: null, apiResponses: 0, responses: {}, statuses: {}, quota: {}, bounce: null, completed: null, replay: null, direct: null, scroll: null, rateLimited: null, rateLimit: null, phase: null, phaseAt: null };

function publishResult(toolName, result, summary = "Done") {
  window.xu = window.xu || {};
  window.xu[toolName] = result;
  window.xu.last = result;
  window.xu.debug = xuDebug;
  log.info(`Result object available as window.xu.last (also window.xu["${toolName}"]).`);
  xuOverlay.done(summary);
  return result;
}

function outputBaseName(toolName, ...parts) {
  return ["x-utils", toolName, ...parts.filter(Boolean).map(slug), todayStamp()].join("_");
}

// ---- DOM interaction helpers --------------------------------------------

// Clicks any visible button whose text matches `re`. Returns how many were clicked.
function clickButtons(re, { root = document, max = 5, once = false } = {}) {
  let clicked = 0;
  for (const el of root.querySelectorAll('[role="button"], button')) {
    if (clicked >= max) break;
    if (once && el.dataset.xuClicked) continue;
    const text = (el.textContent || "").trim();
    if (text && re.test(text)) {
      if (once) el.dataset.xuClicked = "1";
      el.click();
      clicked++;
    }
  }
  return clicked;
}

const XU_RETRY_RE = /^(retry|try again|reintentar|intentar de nuevo|volver a intentar|réessayer|erneut versuchen|riprova|tentar novamente|tentar de novo|opnieuw proberen|försök igen)$/i;
const XU_ERROR_TEXT_RE = /something went wrong|algo salió mal|algo ha salido mal|quelque chose s.est mal passé|etwas ist schiefgelaufen|qualcosa è andato storto|algo deu errado|er is iets misgegaan|något gick fel/i;
// Waits between retries when X rate-limits a list. Limits reset in windows of
// several minutes, so the waits grow instead of hammering the button.
const XU_BACKOFF_MS = [8000, 20000, 45000, 90000, 150000, 240000];

function retryButton() {
  for (const el of document.querySelectorAll('[role="button"], button')) {
    if (XU_RETRY_RE.test((el.textContent || "").trim())) return el;
  }
  return null;
}

// X shows "Something went wrong. Try reloading." with a Retry button when it
// rate-limits a timeline.
function rateLimitVisible() {
  if (xuDebug.rateLimit && Date.now() - xuDebug.rateLimit.at < 15000) return true;
  if (retryButton()) return true;
  const area = document.querySelector('[role="dialog"]') || document.querySelector("main") || document.body;
  return !!area && XU_ERROR_TEXT_RE.test((area.innerText || "").slice(0, 20000));
}

// How long to wait before retrying: the exact reset X announced when known
// (capped at 15 minutes), otherwise the next step of the backoff ladder.
function rateLimitWait(attempt, { blindMs = null } = {}) {
  const reset = xuDebug.rateLimit && xuDebug.rateLimit.resetAt;
  if (reset && reset > Date.now()) return Math.min(reset - Date.now() + 2500, 15 * 60 * 1000);
  if (blindMs) return blindMs;
  return XU_BACKOFF_MS[Math.min(attempt, XU_BACKOFF_MS.length - 1)];
}

function fmtDuration(seconds) {
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s` : `${seconds}s`;
}

function clickRetryIfPresent() {
  const btn = retryButton();
  if (btn) btn.click();
  return !!btn;
}

async function countdown(ms, onTick) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    onTick(Math.ceil((end - Date.now()) / 1000));
    await sleep(Math.min(1000, end - Date.now()));
  }
}

// Polls `predicate` until it returns true or the timeout passes.
async function waitFor(predicate, timeoutMs = 4000, stepMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(stepMs);
  }
  return predicate();
}

// Forces X to re-request the first page of the current timeline by switching
// to a sibling tab and back (SPA navigation, the script keeps running). Waits
// for the URL to actually change both ways, so the tool never scrolls the
// wrong list. Returns true only when the original page is back on screen.
async function bounceTabs(delayMs = 1200) {
  const startPath = currentPath();
  // Settings menus are marked up as tabs too; bouncing through them reloads nothing.
  if (/^\/settings(\/|$)/.test(startPath)) return false;
  const section = startPath.split("/")[1];
  const tabs = () => [...document.querySelectorAll('a[role="tab"], [role="tablist"] a')].filter((a) => a.getAttribute("href"));
  const current = tabs().find((t) => t.getAttribute("aria-selected") === "true") || tabs().find((t) => t.getAttribute("href") === startPath);
  // A real sibling tab lives in the same section of the URL (/user/followers ↔ /user/following, /i/history ↔ /i/history/likes).
  const other = tabs().find((t) => t !== current && t.getAttribute("href") !== startPath && t.getAttribute("href").split("/")[1] === section);
  xuDebug.bounce = { tabs: tabs().map((t) => t.getAttribute("href")), from: current ? current.getAttribute("href") : null, to: other ? other.getAttribute("href") : null, restored: null };
  if (!current || !other) return false;
  other.click();
  const left = await waitFor(() => currentPath() !== startPath, 3000);
  if (!left) {
    xuDebug.bounce.restored = true;
    return false;
  }
  await sleep(delayMs);
  const back = tabs().find((t) => t.getAttribute("href") === startPath);
  if (back) back.click();
  else history.back();
  let restored = await waitFor(() => currentPath() === startPath, 4000);
  if (!restored) {
    history.back();
    restored = await waitFor(() => currentPath() === startPath, 4000);
  }
  xuDebug.bounce.restored = restored;
  if (!restored) {
    log.warn(`Could not return to ${startPath} after switching tabs; open it again and re-run the tool.`);
    throw new Error("x-utils: lost the original page");
  }
  await sleep(delayMs);
  return true;
}

// Pages without sibling tabs (a post's conversation view) are refreshed by
// leaving through an in-page profile link and coming back with history.back():
// X re-requests the conversation on the way back, which the interceptor sees.
async function bounceAway(delayMs = 1200) {
  const startPath = currentPath();
  const hadDialog = !!document.querySelector('[role="dialog"]');
  // Prefer a profile link inside the open dialog, then anything in the main column.
  const scopes = ['[role="dialog"] a[href^="/"]', 'main a[href^="/"]', 'a[href^="/"]'];
  let link = null;
  for (const scope of scopes) {
    link = [...document.querySelectorAll(scope)].find((a) => {
      const href = a.getAttribute("href");
      return /^\/[A-Za-z0-9_]{1,15}$/.test(href) && href !== startPath && !XU_RESERVED_PATHS.has(href.slice(1).toLowerCase());
    });
    if (link) break;
  }
  xuDebug.bounce = { away: link ? link.getAttribute("href") : null, from: startPath, hadDialog, left: null, restored: null, dialogBack: null };
  if (!link) return false;
  link.click();
  const left = await waitFor(() => currentPath() !== startPath, 3000);
  xuDebug.bounce.left = left;
  if (!left) return false;
  await sleep(delayMs);
  history.back();
  const restored = await waitFor(() => currentPath() === startPath, 5000);
  xuDebug.bounce.restored = restored;
  if (restored && hadDialog) {
    // Wait for the dialog and its cells to render again before anyone harvests.
    xuDebug.bounce.dialogBack = await waitFor(() => !!document.querySelector('[role="dialog"] [data-testid="UserCell"], [role="dialog"] article'), 6000);
  }
  if (!restored) {
    log.warn(`Could not return to ${startPath} after leaving the page; open it again and re-run the tool.`);
    throw new Error("x-utils: lost the original page");
  }
  await sleep(delayMs);
  return true;
}

// Some X pages (list members, a post's likers) open as a modal dialog over the
// page. The list then lives in the dialog's own scroll container, not in the
// window. Returns that element, or null when the page itself scrolls.
function scrollContainer() {
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return null;
  let best = null;
  for (const el of dialog.querySelectorAll("div")) {
    if (el.scrollHeight <= el.clientHeight + 40) continue;
    const overflow = getComputedStyle(el).overflowY;
    if (overflow !== "auto" && overflow !== "scroll") continue;
    if (!best || el.scrollHeight > best.scrollHeight) best = el;
  }
  return best;
}

// Where to look for list cells and posts: inside the open dialog if there is
// one (so sidebar "who to follow" cells are ignored), otherwise the whole page.
function contentRoot() {
  return document.querySelector('[role="dialog"]') || document;
}

// Scrolls the window until `harvest()` stops returning a growing count.
// `harvest` must be idempotent: it is called on every tick and its return
// value is the current number of collected items.
async function autoScroll({
  harvest,
  stagnantLimit = 8,
  delayMs = 800,
  maxItems = Infinity,
  label = "items",
  beforeScroll = null,
  shouldStop = null,
  resumeOnQuota = true,
}) {
  let box = scrollContainer();
  if (box) log.step("The list is inside a dialog; scrolling the dialog.");
  const scrollTop = () => (box ? box.scrollTo(0, 0) : window.scrollTo(0, 0));
  const scrollStep = () => {
    if (box && !box.isConnected) box = scrollContainer();
    if (box) box.scrollBy(0, Math.max(200, box.clientHeight * 0.85));
    else window.scrollBy(0, Math.max(200, window.innerHeight * 0.85));
  };
  scrollTop();
  await sleep(300);
  let stagnant = 0;
  let last = -1;
  let retries = 0;
  let delay = delayMs;
  let ticks = 0;
  let quotaWaits = 0;
  let stopReason = null;
  const finish = (reason, count) => {
    xuDebug.scroll = { ticks, stopReason: reason, collected: count, quotaWaits, retries };
  };
  for (;;) {
    ticks++;
    const count = harvest();
    if (count >= maxItems) {
      log.info(`Reached the configured limit of ${maxItems} ${label}.`);
      finish("maxItems", count);
      break;
    }
    const loading = !!contentRoot().querySelector('[role="progressbar"]');
    if (count === last) {
      // X is still fetching the next page: do not count it as the end of the list (bounded below).
      if (loading && stagnant < stagnantLimit * 2) stagnant += 0.5;
      else stagnant++;
    } else {
      stagnant = 0;
      last = count;
      log.step(`${label}: ${count}`);
      xuOverlay.count(`${count.toLocaleString("en-US")} ${label} so far`);
    }
    if (rateLimitVisible()) {
      if (retries >= XU_BACKOFF_MS.length) {
        log.warn(`X kept rate-limiting this list after ${retries} retries. Stopping with the ${count} ${label} collected so far; run again in 15 minutes to get the rest.`);
        xuDebug.rateLimited = { retries, collected: count, gaveUp: true };
        finish("rateLimit", count);
        break;
      }
      const wait = rateLimitWait(retries);
      retries++;
      const known = xuDebug.rateLimit && xuDebug.rateLimit.resetAt ? " (X announced when the limit resets)" : "";
      log.warn(`X paused the list (rate limit). Waiting ${fmtDuration(Math.round(wait / 1000))} before retrying${known}, attempt ${retries} of ${XU_BACKOFF_MS.length}…`);
      await countdown(wait, (left) => xuOverlay.count(`Rate limited by X · ${count.toLocaleString("en-US")} ${label} so far · retrying in ${fmtDuration(left)}`));
      xuDebug.rateLimit = null;
      clickRetryIfPresent();
      await sleep(3000);
      delay = Math.max(Math.round(delay * 1.5), 1500); // be gentler from here on
      stagnant = 0;
      xuDebug.rateLimited = { retries, collected: count, gaveUp: false };
      continue;
    }
    if (stagnant >= stagnantLimit) {
      // X's client goes quiet, with no error on screen, once the quota for this
      // list is used up. Its own answers told us the reset time: wait for it.
      const quota = resumeOnQuota && quotaWaits < 2 ? exhaustedQuota() : null;
      if (quota && quota.resetAt - Date.now() <= 16 * 60 * 1000) {
        quotaWaits++;
        const wait = quota.resetAt - Date.now() + 2500;
        log.warn(`X stopped loading this list: its quota for ${quota.op} is used up (X says so in its own responses). It resets in ${fmtDuration(Math.round(wait / 1000))}; waiting, then continuing with the ${count.toLocaleString("en-US")} ${label} collected so far.`);
        await countdown(wait, (left) => xuOverlay.count(`X quota used up · ${count.toLocaleString("en-US")} ${label} so far · resuming in ${fmtDuration(left)}`));
        delete xuDebug.quota[quota.op];
        clickRetryIfPresent();
        await sleep(3000);
        delay = Math.max(Math.round(delay * 1.5), 1500);
        stagnant = 0;
        scrollStep();
        await sleep(delay);
        continue;
      }
      finish("stagnant", count);
      break;
    }
    if (shouldStop && shouldStop(count)) {
      log.step("Nothing more of interest below; stopping early.");
      finish("shouldStop", count);
      break;
    }
    if (beforeScroll) beforeScroll();
    scrollStep();
    await sleep(delay);
  }
  return harvest();
}

// ---------------------------------------------------------------------------
// Network interception. X's web client already downloads every user and tweet
// you scroll past as GraphQL JSON. We observe those responses (fetch and XHR)
// instead of issuing our own requests, so there are no extra calls, no tokens
// to manage and no additional rate-limit exposure.
// ---------------------------------------------------------------------------

const XU_API_URL_RE = /\/i\/api\//;

// The most recent GraphQL request the page made, per operation name, with the
// headers X attached. Used to re-request the first page of a list (X serves
// that page from its own cache after the tool starts, so it is never observed).
const xuRequests = new Map();

// The last "next page" cursor each operation delivered, so a list can be
// continued directly from where X's own client stopped.
const xuCursors = new Map();

// Operations that page through a list; their quota is what runs out mid-scroll.
const XU_LIST_OP_RE = /Tweets|Followers|Following|Bookmarks|Likes|Search|Timeline|Members|Blocked|Muted|TweetDetail/i;

function operationName(url) {
  const match = String(url).match(/\/graphql\/[^/]+\/([A-Za-z0-9_]+)/);
  return match ? match[1] : null;
}

function headersToObject(headers) {
  const out = {};
  if (!headers) return out;
  if (typeof headers.forEach === "function" && !Array.isArray(headers)) {
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  for (const [key, value] of Array.isArray(headers) ? headers : Object.entries(headers)) out[key] = value;
  return out;
}

function rememberRequest(url, method, headers, body) {
  const match = String(url).match(/\/graphql\/[^/]+\/([A-Za-z0-9_]+)/);
  if (!match) return;
  xuRequests.set(match[1], { url: String(url), method: (method || "GET").toUpperCase(), headers: headersToObject(headers), body: typeof body === "string" ? body : null, at: Date.now() });
}

// Installs response observers. `onJson(json, url)` is called for every parsed
// JSON response whose URL matches `match`. Returns an uninstall function.
function installInterceptor(onJson, { match = XU_API_URL_RE } = {}) {
  const deliver = (url, text) => {
    if (!match.test(url)) return;
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return;
    }
    const op = operationName(url);
    if (op) {
      const cursor = findBottomCursor(json);
      if (cursor) xuCursors.set(op, cursor);
    }
    try {
      onJson(json, url);
    } catch (err) {
      log.warn("Interceptor handler failed:", err);
    }
  };

  const originalFetch = window.fetch;
  window.fetch = function xuFetch(input, init) {
    const promise = originalFetch.apply(this, arguments);
    let url = "";
    try {
      url = typeof input === "string" ? input : input instanceof URL ? input.href : (input && input.url) || "";
      if (url && match.test(url) && !(init && init.__xuReplay)) {
        const isRequest = input && typeof input === "object" && "headers" in input && !(input instanceof URL);
        rememberRequest(url, (init && init.method) || (isRequest ? input.method : "GET"), (init && init.headers) || (isRequest ? input.headers : null), init && init.body);
      }
    } catch {
      url = "";
    }
    if (url && match.test(url)) {
      promise
        .then((res) => {
          noteResponse(url, res.status, (name) => res.headers.get(name));
          return res.clone().text().then((text) => deliver(url, text));
        })
        .catch(() => {});
    }
    return promise;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function xuOpen(method, url) {
    this.__xuUrl = String(url);
    this.__xuMethod = method;
    this.__xuHeaders = {};
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function xuSetHeader(name, value) {
    if (this.__xuHeaders) this.__xuHeaders[name] = value;
    return originalSetHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function xuSend(body) {
    if (this.__xuUrl && match.test(this.__xuUrl)) {
      rememberRequest(this.__xuUrl, this.__xuMethod, this.__xuHeaders, body);
      this.addEventListener("load", () => {
        try {
          noteResponse(this.__xuUrl, this.status, (name) => this.getResponseHeader(name));
          if (this.responseType === "" || this.responseType === "text") deliver(this.__xuUrl, this.responseText);
          else if (this.responseType === "json" && this.response) onJson(this.response, this.__xuUrl);
        } catch {
          /* ignore unreadable bodies */
        }
      });
    }
    return originalSend.apply(this, arguments);
  };

  return function uninstall() {
    window.fetch = originalFetch;
    XMLHttpRequest.prototype.open = originalOpen;
    XMLHttpRequest.prototype.send = originalSend;
    XMLHttpRequest.prototype.setRequestHeader = originalSetHeader;
  };
}

// Records what every API answer says about its quota (x-rate-limit-remaining,
// x-rate-limit-reset in epoch seconds) per operation, plus 429s explicitly.
// X's own client stops asking for pages, silently, once remaining hits 0, so
// knowing the quota from its regular answers is what lets a tool wait for the
// reset instead of mistaking the silence for the end of the list.
function noteResponse(url, status, getHeader) {
  const op = operationName(url);
  xuDebug.statuses[status] = (xuDebug.statuses[status] || 0) + 1;
  if (op) xuDebug.responses[op] = (xuDebug.responses[op] || 0) + 1;
  let remaining = null;
  let limit = null;
  let resetAt = null;
  try {
    const rem = getHeader("x-rate-limit-remaining");
    if (rem !== null && rem !== undefined && rem !== "") remaining = Number(rem);
    const lim = getHeader("x-rate-limit-limit");
    if (lim) limit = Number(lim);
    const reset = Number(getHeader("x-rate-limit-reset"));
    if (reset > 0) resetAt = reset * 1000;
  } catch {
    /* header not exposed */
  }
  if (op && (remaining !== null || status === 429)) xuDebug.quota[op] = { remaining: status === 429 ? 0 : remaining, limit, resetAt, at: Date.now() };
  if (status !== 429) return;
  xuDebug.rateLimit = { at: Date.now(), resetAt, limit, op, count: ((xuDebug.rateLimit && xuDebug.rateLimit.count) || 0) + 1 };
}

// The list operation whose quota X reports as used up (with a reset still in
// the future), or null. Most recent first when several qualify.
function exhaustedQuota(re = XU_LIST_OP_RE) {
  let best = null;
  for (const [op, q] of Object.entries(xuDebug.quota)) {
    if (!re.test(op) || q.remaining !== 0 || !q.resetAt || q.resetAt <= Date.now()) continue;
    if (!best || q.at > best.at) best = { op, ...q };
  }
  return best;
}

// Finds the "next page" cursor anywhere in a timeline response.
function findBottomCursor(json) {
  let cursor = null;
  walkJson(json, (node) => {
    if (!cursor && node && typeof node === "object" && !Array.isArray(node) && node.cursorType === "Bottom" && typeof node.value === "string") cursor = node.value;
  });
  return cursor;
}

// Re-issues a list request the page already made, without its cursor (first
// page), then follows cursors while `needMore()` says the list is still
// incomplete. Goes through the wrapped fetch, so responses reach the collector
// like any other. Returns the number of pages fetched.
// With `fromCursor`, it continues from the last cursor X delivered for that
// operation instead of starting over.
async function replayListPages(operationNames, needMore, { maxPages = 6, delayMs = 700, fromCursor = false } = {}) {
  const name = operationNames.find((n) => xuRequests.has(n));
  xuDebug.replay = { candidates: operationNames, observed: [...xuRequests.keys()], used: name || null, fromCursor: !!(fromCursor && name && xuCursors.has(name)), pages: [] };
  if (!name) return 0;
  const req = xuRequests.get(name);
  let cursor = fromCursor && xuCursors.has(name) ? xuCursors.get(name) : undefined;
  let pages = 0;
  while (pages < maxPages && needMore()) {
    let response;
    try {
      const url = new URL(req.url, location.origin);
      if (req.method === "GET") {
        const variables = JSON.parse(url.searchParams.get("variables") || "{}");
        if (cursor === undefined) delete variables.cursor;
        else variables.cursor = cursor;
        url.searchParams.set("variables", JSON.stringify(variables));
        response = await fetch(url.toString(), { method: "GET", headers: req.headers, credentials: "include", __xuReplay: true });
      } else {
        const body = JSON.parse(req.body || "{}");
        body.variables = body.variables || {};
        if (cursor === undefined) delete body.variables.cursor;
        else body.variables.cursor = cursor;
        response = await fetch(url.toString(), { method: "POST", headers: req.headers, credentials: "include", body: JSON.stringify(body), __xuReplay: true });
      }
    } catch (err) {
      xuDebug.replay.pages.push({ error: String(err && err.message) });
      log.step(`Re-requesting page ${pages + 1} failed: ${err && err.message}`);
      break;
    }
    pages++;
    xuDebug.replay.pages.push({ status: response.status });
    if (!response.ok) {
      log.step(`X answered ${response.status} when re-requesting page ${pages}; stopping.`);
      break;
    }
    let json;
    try {
      json = await response.clone().json();
    } catch {
      break;
    }
    cursor = findBottomCursor(json);
    // Give the interceptor's own clone().text() chain time to deliver the page.
    await sleep(delayMs);
    if (!cursor) break;
  }
  await sleep(300);
  return pages;
}

// Looks up accounts one by one with the profile query the page itself uses
// (UserByScreenName), which is observed whenever a profile is visited. Used for
// short lists X serves entirely from cache. Stops on the first refusal.
async function lookupUsersByHandle(handles, { delayMs = 250, max = 1000, onProgress = null } = {}) {
  const req = xuRequests.get("UserByScreenName");
  if (!req || req.method !== "GET") return { attempted: 0, ok: 0, stoppedBy: req ? "method" : "not observed" };
  let ok = 0;
  let attempted = 0;
  let stoppedBy = null;
  const total = Math.min(handles.length, max);
  for (const handle of handles.slice(0, max)) {
    attempted++;
    if (onProgress && attempted % 5 === 0) onProgress(attempted, total);
    try {
      const url = new URL(req.url, location.origin);
      const variables = JSON.parse(url.searchParams.get("variables") || "{}");
      variables.screen_name = handle;
      url.searchParams.set("variables", JSON.stringify(variables));
      const response = await fetch(url.toString(), { method: "GET", headers: req.headers, credentials: "include", __xuReplay: true });
      if (response.ok) ok++;
      else {
        stoppedBy = `HTTP ${response.status}`;
        break;
      }
    } catch (err) {
      stoppedBy = String(err && err.message);
      break;
    }
    await sleep(delayMs);
  }
  await sleep(400);
  return { attempted, ok, stoppedBy };
}

// Re-issues the profile timeline request the page made for one account
// (UserTweets or its current name) with another account's id, and returns that
// account's normalized top-level tweets. Used to learn when someone last posted
// without opening their profile. Returns { tweets, status }.
const XU_TIMELINE_OP_RE = /^(UserTweets|UserOriginalsTimeline|UserTweetsAndReplies|UserMedia)$/;

function observedTimelineOp() {
  return [...xuRequests.keys()].find((n) => XU_TIMELINE_OP_RE.test(n) && xuRequests.get(n).method === "GET") || null;
}

async function replayUserTimeline(userId) {
  const op = observedTimelineOp();
  if (!op) return { tweets: null, status: "no timeline request observed" };
  const req = xuRequests.get(op);
  try {
    const url = new URL(req.url, location.origin);
    const variables = JSON.parse(url.searchParams.get("variables") || "{}");
    variables.userId = String(userId);
    delete variables.cursor;
    url.searchParams.set("variables", JSON.stringify(variables));
    const response = await fetch(url.toString(), { method: "GET", headers: req.headers, credentials: "include", __xuReplay: true });
    if (!response.ok) return { tweets: null, status: `HTTP ${response.status}` };
    const json = await response.clone().json();
    const found = collectEntities(json).tweets.filter((t) => !t.nested).map((t) => normalizeTweet(t.raw));
    return { tweets: found.filter((t) => t.authorId === String(userId) || !t.authorId), status: "ok" };
  } catch (err) {
    return { tweets: null, status: String(err && err.message) };
  }
}

// ---- entity discovery -----------------------------------------------------
// GraphQL payload shapes change often (instructions, entries, modules...).
// Instead of hard-coding paths we walk the whole JSON and pick out anything
// that looks like a User or a Tweet. This survives most layout changes.

function isRawGraphqlUser(node) {
  if (!node || typeof node !== "object" || !node.rest_id) return false;
  if (node.__typename && node.__typename !== "User") return false;
  const legacy = node.legacy || {};
  const core = node.core || {};
  return typeof (legacy.screen_name || core.screen_name) === "string";
}

// Classic REST v1.1 user object (still used by a few settings endpoints).
function isRawRestUser(node) {
  return !!(node && typeof node === "object" && typeof node.id_str === "string" && typeof node.screen_name === "string" && !node.rest_id);
}

function isRawTweet(node) {
  if (!node || typeof node !== "object" || !node.rest_id || !node.legacy) return false;
  if (node.__typename && node.__typename !== "Tweet") return false;
  return typeof node.legacy.full_text === "string";
}

// `TweetWithVisibilityResults` wraps the real tweet under `.tweet`.
function unwrapTweet(result) {
  if (!result || typeof result !== "object") return null;
  if (result.__typename === "TweetWithVisibilityResults" && result.tweet) return result.tweet;
  return result;
}

// Depth-first walk. `visit(node, ctx)` may return a new ctx for the children.
function walkJson(node, visit, ctx = {}, depth = 0) {
  if (!node || typeof node !== "object" || depth > 80) return;
  const childCtx = visit(node, ctx) || ctx;
  if (Array.isArray(node)) {
    for (const item of node) walkJson(item, visit, childCtx, depth + 1);
    return;
  }
  for (const key of Object.keys(node)) walkJson(node[key], visit, childCtx, depth + 1);
}

// Returns { users: [raw], tweets: [{ raw, nested }] } found anywhere in `json`.
// `nested` marks tweets embedded in another tweet (quoted / retweeted), which
// timeline exporters should not count as their own entries.
function collectEntities(json) {
  const users = [];
  const tweets = [];
  walkJson(json, (node, ctx) => {
    if (Array.isArray(node)) return ctx;
    if (isRawGraphqlUser(node)) {
      users.push(node);
      return ctx;
    }
    if (isRawRestUser(node)) {
      users.push({ rest_id: node.id_str, legacy: node, __xuRest: true });
      return ctx;
    }
    if (isRawTweet(node)) {
      tweets.push({ raw: node, nested: !!ctx.insideTweet });
      return { insideTweet: true };
    }
    return ctx;
  });
  return { users, tweets };
}

// ---------------------------------------------------------------------------
// Users: normalisation of API objects, DOM cell parsing and the list collector
// that merges both sources.
// ---------------------------------------------------------------------------

function pickBool(...values) {
  for (const v of values) if (typeof v === "boolean") return v;
  return null;
}

// Normalises a GraphQL user (the 2026 layout with relationship_counts,
// tweet_counts and profile_bio, the older one with everything under legacy) or
// a REST v1.1 user object. Each field is read from the newest location first.
function normalizeUser(raw) {
  const legacy = raw.legacy || {};
  const core = raw.core || {};
  const relationship = raw.relationship_perspectives || {};
  const counts = raw.relationship_counts || {};
  const tweetCounts = raw.tweet_counts || {};
  const actions = raw.action_counts || {};
  const profileBio = raw.profile_bio || {};
  const bioUrls = (profileBio.entities && profileBio.entities.description && profileBio.entities.description.urls) || (legacy.entities && legacy.entities.description && legacy.entities.description.urls) || [];
  const avatar = (raw.avatar && raw.avatar.image_url) || legacy.profile_image_url_https || null;
  const handle = core.screen_name || legacy.screen_name || null;
  const first = (...values) => values.find((v) => v !== undefined && v !== null);
  return {
    id: raw.rest_id ? String(raw.rest_id) : null,
    handle,
    name: core.name || legacy.name || null,
    bio: expandUrls(String(first(profileBio.description, legacy.description, "")), bioUrls).trim(),
    location: String(first(raw.location && raw.location.location, legacy.location, "")),
    followers: num(first(counts.followers, legacy.followers_count)),
    following: num(first(counts.following, legacy.friends_count)),
    tweets: num(first(tweetCounts.tweets, legacy.statuses_count)),
    likes: num(first(actions.favorites_count, legacy.favourites_count)),
    listed: num(legacy.listed_count),
    media: num(first(tweetCounts.media_tweets, legacy.media_count)),
    createdAt: parseTwitterDate(core.created_at || legacy.created_at),
    verified: !!(raw.is_blue_verified || legacy.verified || (raw.verification && raw.verification.verified)),
    protected: !!(legacy.protected || (raw.privacy && raw.privacy.protected)),
    defaultAvatar: !!avatar && /default_profile/.test(avatar),
    avatar,
    followsYou: pickBool(relationship.followed_by, legacy.followed_by),
    youFollow: pickBool(relationship.following, legacy.following),
    blocking: pickBool(relationship.blocking, legacy.blocking),
    muting: pickBool(relationship.muting, legacy.muting),
    pinnedIds: ((raw.pinned_items && raw.pinned_items.tweet_ids_str) || legacy.pinned_tweet_ids_str || []).map(String),
    url: handle ? `https://x.com/${handle}` : null,
    source: "api",
  };
}

// "Follows you" badge text in the languages X ships most often.
const XU_FOLLOWS_YOU_RE = /^(follows you|te sigue|vous suit|folgt dir|ti segue|segue você|segue-te|volgt jou|följer dig|obserwuje cię)$/i;

// Parses one `[data-testid="UserCell"]` element. Returns null when the cell
// has no handle (skeleton rows while loading).
function readUserCell(cell) {
  const links = [...cell.querySelectorAll('a[href^="/"]')];
  const profileLink = links.find((a) => /^\/[A-Za-z0-9_]{1,15}(\/|$|\?)/.test(a.getAttribute("href")) && !/^\/i\//.test(a.getAttribute("href")));
  if (!profileLink) return null;
  const handle = profileLink.getAttribute("href").slice(1).split(/[/?#]/)[0];
  if (!handle) return null;

  const sameProfile = (a) => a.getAttribute("href").split(/[?#]/)[0].replace(/\/$/, "").toLowerCase() === `/${handle.toLowerCase()}`;
  const nameLink = links.find((a) => sameProfile(a) && a.textContent.trim() && !a.textContent.trim().startsWith("@"));
  const name = nameLink ? nameLink.textContent.trim() : null;
  const avatarImg = cell.querySelector('[data-testid^="UserAvatar-Container"] img');
  const avatar = avatarImg && /^https:\/\//.test(avatarImg.getAttribute("src") || "") ? avatarImg.getAttribute("src") : null;

  // The badge proves "follows you"; its absence proves nothing (list dialogs
  // never show it), so only the API may say "no".
  const texts = [...cell.querySelectorAll('div[dir="auto"], span')].map((el) => el.textContent.trim()).filter(Boolean);
  const followsYou = texts.some((t) => XU_FOLLOWS_YOU_RE.test(t)) ? true : null;

  // The bio is the last direction-auto block that is neither the name, the
  // handle nor a badge. Heuristic, but only used when API data is missing.
  // Skip X's hidden helper text ("Click to unfollow …"), which is also dir="auto".
  const blocks = [...cell.querySelectorAll('div[dir="auto"]')].filter((el) => el.style.display !== "none" && !/^id__/.test(el.id || "")).map((el) => el.textContent.trim()).filter(Boolean);
  const bio = blocks.filter((t) => t !== name && t !== `@${handle}` && !XU_FOLLOWS_YOU_RE.test(t) && !/^(follow|following|unfollow|blocked|muted|seguir|siguiendo|bloqueado|silenciado)$/i.test(t)).pop() || "";

  let youFollow = null;
  if (cell.querySelector('[data-testid$="-unfollow"]')) youFollow = true;
  else if (cell.querySelector('[data-testid$="-follow"]')) youFollow = false;

  return {
    id: null,
    handle,
    name,
    bio,
    followsYou,
    youFollow,
    verified: !!cell.querySelector('svg[data-testid="icon-verified"]'),
    protected: !!cell.querySelector('svg[data-testid="icon-lock"]'),
    avatar,
    url: `https://x.com/${handle}`,
    source: "dom",
  };
}

// Merges a DOM record with an API record for the same handle. API fields win
// whenever present; boolean relationship flags never degrade from true to
// null/false because a re-rendered cell may lack the badge for a moment.
function mergeUserRecords(domUser, apiUser) {
  if (!apiUser) return { ...domUser, enriched: false };
  const merged = { ...domUser };
  for (const [key, value] of Object.entries(apiUser)) {
    if (value !== null && value !== undefined && value !== "") merged[key] = value;
  }
  merged.followsYou = domUser.followsYou === true || apiUser.followsYou === true ? true : pickBool(apiUser.followsYou, domUser.followsYou);
  merged.youFollow = domUser.youFollow === true || apiUser.youFollow === true ? true : pickBool(apiUser.youFollow, domUser.youFollow);
  merged.source = "dom+api";
  merged.enriched = true;
  return merged;
}

// Collects the user list of the current page. The DOM decides membership and
// order (every cell scrolls through the viewport); intercepted API objects add
// counts, dates and IDs.
function createUserCollector() {
  const dom = new Map(); // lower-case handle -> dom record (first-seen order)
  const api = new Map(); // lower-case handle -> api record

  function harvestDom(root = document) {
    for (const cell of root.querySelectorAll('[data-testid="UserCell"]')) {
      const user = readUserCell(cell);
      if (!user) continue;
      if (!xuDebug.sampleCell) xuDebug.sampleCell = cell.outerHTML.slice(0, 20000);
      const key = user.handle.toLowerCase();
      const previous = dom.get(key);
      if (!previous) {
        dom.set(key, user);
        continue;
      }
      if (user.followsYou) previous.followsYou = true;
      if (user.youFollow !== null) previous.youFollow = previous.youFollow === true ? true : user.youFollow;
      if (!previous.bio && user.bio) previous.bio = user.bio;
      if (!previous.name && user.name) previous.name = user.name;
    }
    return dom.size;
  }

  const opHandles = new Map(); // GraphQL operation -> handles it delivered

  function ingestJson(json, url = "") {
    xuDebug.apiResponses++;
    const { users } = collectEntities(json);
    if (!xuDebug.sampleUser && users.length) xuDebug.sampleUser = users[0];
    const op = String(url).match(/\/graphql\/[^/]+\/([A-Za-z0-9_]+)/);
    for (const raw of users) {
      const user = normalizeUser(raw);
      if (!user.handle) continue;
      api.set(user.handle.toLowerCase(), user);
      if (op) {
        if (!opHandles.has(op[1])) opHandles.set(op[1], new Set());
        opHandles.get(op[1]).add(user.handle.toLowerCase());
      }
    }
    return users.length;
  }

  // Operations ranked by how many of their users are actually in this list on
  // screen. A tab bounce also loads a sibling list (e.g. verified followers),
  // which must not be the one re-requested.
  function listOps() {
    return [...opHandles.entries()]
      .map(([op, handles]) => ({ op, hits: [...handles].filter((h) => dom.has(h)).length }))
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .map((x) => x.op);
  }

  function list() {
    return [...dom.values()].map((user) => mergeUserRecords(user, api.get(user.handle.toLowerCase())));
  }

  return {
    harvestDom,
    ingestJson,
    list,
    hasApi: (handle) => api.has(String(handle).toLowerCase()),
    ownerRecord: (handle) => api.get(String(handle).toLowerCase()) || null,
    listOps,
    missingCount: () => [...dom.keys()].filter((k) => !api.has(k)).length,
    missingHandles: () => [...dom.values()].filter((u) => !api.has(u.handle.toLowerCase())).map((u) => u.handle),
    get size() {
      return dom.size;
    },
    get apiSize() {
      return api.size;
    },
  };
}

// Parses counts as X prints them in the profile header: "1.301", "1,301",
// "12.5K", "1,3 mil", "2 M". Approximate by design; only used for estimates.
function parseCompactCount(text) {
  const m = String(text || "").replace(/\u00a0/g, " ").match(/(\d+(?:[.,]\d+)?)\s*(mil millones|mil|millones|[kKmM])?/);
  if (!m) return null;
  let n = m[1];
  const unit = (m[2] || "").toLowerCase();
  if (unit) n = Number(n.replace(",", "."));
  else n = Number(n.replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  if (unit === "k" || unit === "mil") n *= 1000;
  else if (unit === "m" || unit === "millones" || unit === "mil millones") n *= unit === "mil millones" ? 1e9 : 1e6;
  return Math.round(n);
}

// Size of the followers/following list according to the profile header, if visible.
function expectedListSize() {
  const path = currentPath();
  const m = path.match(/^\/([A-Za-z0-9_]+)\/(followers|verified_followers|followers_you_follow|following)$/);
  if (!m) return null;
  const target = m[2] === "following" ? "following" : "followers";
  const link = [...document.querySelectorAll(`a[href="/${m[1]}/${target}"], a[href="/${m[1]}/verified_followers"]`)].find((a) => /\d/.test(a.textContent));
  return link ? parseCompactCount(link.textContent) : null;
}

// Rough wall-clock estimate: X pages out ~20 accounts per request and pauses
// long lists, so beyond a thousand the pauses dominate.
function describeListEffort(count, label) {
  if (!count) return null;
  if (count < 800) return `About ${count.toLocaleString("en-US")} ${label}: this should take a couple of minutes.`;
  if (count < 3000) return `About ${count.toLocaleString("en-US")} ${label}: expect 5 to 15 minutes. X will pause the list once or twice; the tool waits and resumes on its own, keep the tab open.`;
  return `About ${count.toLocaleString("en-US")} ${label}: this is a long run (X pauses big lists for minutes at a time). Consider setting maxUsers in CONFIG, or leave the tab open and come back later. Partial results are kept if X refuses for good.`;
}

// End-to-end: install interceptor, optionally bounce tabs so the first page is
// re-fetched, auto-scroll, complete what is still missing, return the merged list.
async function collectUserList({ label = "users", stagnantLimit = 8, delayMs = 800, maxItems = Infinity, refetchFirstPage = true, completeMissing = true } = {}) {
  const collector = createUserCollector();
  const uninstall = installInterceptor((json, url) => collector.ingestJson(json, url));
  const startPath = currentPath();
  const expected = expectedListSize();
  const effort = describeListEffort(expected, label);
  if (effort) {
    log.info(effort);
    xuOverlay.count(effort.split(":")[1].trim().split(".")[0]);
  } else if (/\/(followers|verified_followers|followers_you_follow|following)$/.test(startPath)) {
    log.info("Large lists take a while: X pauses them every so often and the tool waits and resumes on its own. Keep this tab open and in front.");
  }
  try {
    log.phase("refetch-first-page");
    if (refetchFirstPage) {
      let bounced = await bounceTabs();
      if (!bounced) bounced = await bounceAway();
      if (!bounced) log.step("Could not make X reload this list; will re-request the first page instead.");
    }
    if (currentPath() !== startPath) {
      log.error(`The page changed to ${currentPath()} before collecting. Open ${startPath} again and re-run.`);
      throw new Error("x-utils: page changed");
    }
    log.phase("scrolling");
    await autoScroll({ harvest: () => collector.harvestDom(contentRoot()), stagnantLimit, delayMs, maxItems, label });
    if (completeMissing && collector.missingCount() > 0) {
      log.phase("completing");
      const before = collector.missingCount();
      xuOverlay.count(`Completing ${before} ${label} that loaded before the tool started…`);
      // Operations that delivered accounts for this list; when none did (a short
      // list served from X's cache), fall back to any observed list-like request,
      // such as the empty "next page" X asks for when the dialog is scrolled.
      const listLike = /Members|Followers|Following|Blocked|Muted|Subscri/i;
      let ops = collector.listOps().filter((n) => listLike.test(n));
      if (!ops.length) ops = [...xuRequests.keys()].filter((n) => listLike.test(n));
      const pages = await replayListPages(ops, () => collector.missingCount() > 0);
      // Nothing observed at all (X served the list from cache): visit one profile
      // and come back, which makes the page issue the profile query we can reuse.
      if (collector.missingCount() > 0 && !xuRequests.has("UserByScreenName")) {
        log.phase("visiting-profile");
        xuOverlay.count("Visiting one profile to learn how X looks accounts up…");
        try {
          await bounceAway();
        } catch {
          /* page could not be restored; reported by bounceAway */
        }
      }
      let lookup = null;
      if (collector.missingCount() > 0 && xuRequests.has("UserByScreenName")) {
        log.phase("looking-up");
        const handles = collector.missingHandles();
        xuOverlay.count(`Looking up ${handles.length} ${label} one by one…`);
        if (handles.length > 200) log.info(`X served this list from its cache, so ${handles.length} ${label} are being looked up one by one (about ${Math.ceil((handles.length * 0.9) / 60)} min). Tip: reload the page before running a tool so X fetches the list fresh.`);
        lookup = await lookupUsersByHandle(handles, { onProgress: (done, total) => xuOverlay.count(`Looking up ${label}: ${done} of ${total}`) });
      }
      const after = collector.missingCount();
      xuDebug.completed = { before, after, pages, ops, lookup };
      if (pages) log.info(`Re-requested ${pages} page${pages === 1 ? "" : "s"} of the list to complete ${before - after} of ${before} ${label} that loaded before the tool started.`);
      if (lookup && lookup.attempted) log.info(`Looked up ${lookup.attempted} ${label} individually (${lookup.ok} answered${lookup.stoppedBy ? `, stopped by ${lookup.stoppedBy}` : ""}).`);
      if (!pages && !(lookup && lookup.attempted)) log.step(`Could not re-request the first page (no list request was observed); ${before} ${label} stay DOM-only.`);
    }
    // On followers/following pages, learn the real total from the owner's profile
    // so a list X cut short is reported as partial instead of as the truth.
    const ownerMatch = startPath.match(/^\/([A-Za-z0-9_]+)\/(followers|verified_followers|followers_you_follow|following)$/);
    if (ownerMatch && !expected) {
      log.phase("checking-total");
      if (!xuRequests.has("UserByScreenName")) {
        try {
          await bounceAway();
        } catch {
          /* reported by bounceAway */
        }
      }
      if (xuRequests.has("UserByScreenName")) {
        const owner = ownerMatch[1];
        const before = collector.apiSize;
        await lookupUsersByHandle([owner], { delayMs: 0 });
        const ownerRecord = collector.ownerRecord(owner);
        if (ownerRecord) xuDebug.expectedTotal = ownerMatch[2] === "following" ? ownerRecord.following : ownerRecord.followers;
        void before;
      }
    } else if (expected) xuDebug.expectedTotal = expected;
  } finally {
    uninstall();
    log.phase("done");
  }
  const users = collector.list();
  const enriched = users.filter((u) => u.enriched).length;
  log.info(`Collected ${users.length} ${label} (${enriched} with full profile data).`);
  const total = xuDebug.expectedTotal;
  if (typeof total === "number" && total > 0) {
    Object.defineProperty(users, "expectedTotal", { value: total, enumerable: false });
    if (users.length < total * 0.9) {
      const msg = `X served only ${users.length.toLocaleString("en-US")} of about ${total.toLocaleString("en-US")} ${label}. Its list endpoint is rate-limited for now; wait 15 minutes or more and run again to get the rest.`;
      log.warn(msg);
      xuOverlay.count(`Partial: ${users.length.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} ${label}`);
    }
  }
  diagnoseUsers(users, enriched);
  return users;
}

// Note for a report when the collected list is clearly shorter than the real total.
function partialListNote(users, label) {
  const total = users && users.expectedTotal;
  if (!total || users.length >= total * 0.9) return null;
  return `Partial list: X served ${users.length.toLocaleString("en-US")} of about ${total.toLocaleString("en-US")} ${label} before it stopped (its list endpoint is rate-limited for now). Run the tool again after 15 minutes or more to complete it.`;
}

// Says out loud when X's data arrives in an unexpected shape, so a broken run
// produces an actionable report instead of a quietly incomplete table.
function diagnoseUsers(users, enriched) {
  if (!users.length) {
    log.warn(`No accounts were found on this page. Seen ${xuDebug.apiResponses} API responses. Make sure the list is visible, then run again. If it keeps failing, run copy(JSON.stringify(xu.debug)) and open an issue with the result.`);
    return;
  }
  const withCounts = users.filter((u) => typeof u.followers === "number").length;
  const withNames = users.filter((u) => u.name).length;
  const problems = [];
  if (enriched && !withCounts) problems.push("follower counts are missing from X's profile data");
  if (withNames < users.length / 2) problems.push("display names could not be read");
  if (!enriched) problems.push("no profile data was received from X (only what was on screen)");
  if (problems.length) {
    const keys = xuDebug.sampleUser ? Object.keys(xuDebug.sampleUser).join(", ") : "none captured";
    log.warn(`Heads-up: ${problems.join("; ")}. X may have changed its format. Raw user keys seen: ${keys}. To help fix it, run copy(JSON.stringify(xu.debug)) in this console and paste the result in a GitHub issue.`);
  }
}

const XU_USER_COLUMNS = ["handle", "name", "followsYou", "youFollow", "followers", "following", "tweets", "createdAt", "verified", "protected", "bio", "url"];

function usersToRows(users, columns = XU_USER_COLUMNS) {
  return users.map((u) => {
    const row = {};
    for (const c of columns) row[c] = u[c] === undefined ? null : u[c];
    return row;
  });
}

// ---------------------------------------------------------------------------
// Tweets: normalisation of API objects, DOM article parsing and the timeline
// collector that merges both sources.
// ---------------------------------------------------------------------------

function expandUrls(text, urls) {
  let out = text || "";
  for (const u of urls || []) {
    if (u && u.url && u.expanded_url) out = out.split(u.url).join(u.expanded_url);
  }
  return out;
}

function bestVideoVariant(variants) {
  return (variants || [])
    .filter((v) => v.content_type === "video/mp4" && v.url)
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0] || null;
}

// Returns [{ type, url, tco }] for the media attached to a tweet.
function extractMedia(mediaList) {
  const out = [];
  for (const m of mediaList || []) {
    if (!m) continue;
    let url = null;
    if (m.type === "photo" && m.media_url_https) url = `${m.media_url_https}?name=orig`;
    else if ((m.type === "video" || m.type === "animated_gif") && m.video_info) {
      const best = bestVideoVariant(m.video_info.variants);
      url = best ? best.url : m.media_url_https || null;
    } else url = m.media_url_https || null;
    if (url) out.push({ type: m.type || "media", url, tco: m.url || null });
  }
  return out;
}

function tweetUrl(handle, id) {
  return handle ? `https://x.com/${handle}/status/${id}` : `https://x.com/i/status/${id}`;
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Normalises a GraphQL Tweet result (already unwrapped from visibility wrappers).
function normalizeTweet(raw) {
  const tweet = unwrapTweet(raw);
  const legacy = tweet.legacy || {};
  const authorRaw = tweet.core && tweet.core.user_results && tweet.core.user_results.result;
  const author = authorRaw ? normalizeUser(authorRaw) : null;
  const note = tweet.note_tweet && tweet.note_tweet.note_tweet_results && tweet.note_tweet.note_tweet_results.result;
  const entities = (note && note.entity_set) || legacy.entities || {};
  const media = extractMedia((legacy.extended_entities || legacy.entities || {}).media);

  let text = expandUrls((note && note.text) || legacy.full_text || "", entities.urls);
  for (const m of media) if (m.tco) text = text.split(m.tco).join("").trim();
  text = decodeHtmlEntities(text);

  const retweeted = legacy.retweeted_status_result && unwrapTweet(legacy.retweeted_status_result.result);
  const quoted = tweet.quoted_status_result && unwrapTweet(tweet.quoted_status_result.result);
  let retweetedTweet = null;
  if (retweeted && retweeted.legacy) {
    retweetedTweet = normalizeTweet(retweeted);
    text = `RT @${retweetedTweet.author || "unknown"}: ${retweetedTweet.text}`;
  }
  const quotedTweet = quoted && quoted.legacy ? normalizeTweet(quoted) : null;
  // X appends the quoted post's link to the text; the card already shows it as "Quoting".
  if (quotedTweet) {
    const quotedLink = new RegExp(`\\s*https?://(?:x|twitter)\\.com/[A-Za-z0-9_]+/status/${quotedTweet.id}(?:\\?\\S*)?\\s*$`);
    text = text.replace(quotedLink, "").trim();
  }

  const id = String(tweet.rest_id || legacy.id_str || "");
  const handle = author ? author.handle : null;
  return {
    id,
    url: tweetUrl(handle, id),
    author: handle,
    authorName: author ? author.name : null,
    authorId: author ? author.id : legacy.user_id_str || null,
    authorAvatar: author ? author.avatar : null,
    createdAt: parseTwitterDate(legacy.created_at),
    text,
    lang: legacy.lang || null,
    replies: num(legacy.reply_count),
    retweets: num(legacy.retweet_count),
    likes: num(legacy.favorite_count),
    quotes: num(legacy.quote_count),
    bookmarks: num(legacy.bookmark_count),
    views: tweet.views && tweet.views.count !== undefined ? num(tweet.views.count) : null,
    isRetweet: !!retweetedTweet,
    isQuote: !!quotedTweet || !!legacy.is_quote_status,
    isReply: !!legacy.in_reply_to_status_id_str,
    inReplyToId: legacy.in_reply_to_status_id_str || null,
    inReplyToUser: legacy.in_reply_to_screen_name || null,
    conversationId: legacy.conversation_id_str || null,
    quotedUrl: quotedTweet ? quotedTweet.url : null,
    retweetedUrl: retweetedTweet ? retweetedTweet.url : null,
    media: media.map((m) => m.url),
    mediaTypes: media.map((m) => m.type),
    hashtags: (entities.hashtags || []).map((h) => h.text),
    mentions: (entities.user_mentions || []).map((m) => m.screen_name),
    links: (entities.urls || []).map((u) => u.expanded_url).filter(Boolean),
    source: "api",
  };
}

// Parses the accessible label of a tweet's action bar, e.g.
// "12 replies, 3 reposts, 45 likes, 2 bookmarks, 1234 views".
function parseMetricsLabel(label) {
  const grab = (re) => {
    const m = (label || "").match(re);
    return m ? num(m[1].replace(/[.,\s]/g, "")) : null;
  };
  return {
    replies: grab(/([\d.,\s]+)\s*(repl|respuesta|comentario|réponse|antwort|rispost)/i),
    retweets: grab(/([\d.,\s]+)\s*(repost|retweet|reposteo|republicaci|partage)/i),
    likes: grab(/([\d.,\s]+)\s*(like|me gusta|j'aime|gefällt|mi piace)/i),
    bookmarks: grab(/([\d.,\s]+)\s*(bookmark|marcador|(?:elementos? )?guardado|signet|lesezeichen|segnalibr)/i),
    views: grab(/([\d.,\s]+)\s*(view|visualizaci|vue|ansicht|reproducci)/i),
  };
}

const XU_REPOST_CONTEXT_RE = /\b(reposted|retweeted|reposteó|retwitteó|a reposté|hat repostet|ha ripostato)\b/i;
const XU_AD_LABEL_RE = /^(ad|promoted|anuncio|promocionado|sponsorisé|anzeige|sponsorizzato)$/i;

// Text of a rendered post. X splits long links into several spans that
// innerText joins with line breaks, so links are rebuilt without whitespace and
// emoji images are replaced by their alt text.
function readTweetText(el) {
  if (!el) return "";
  const parts = [];
  const walk = (node) => {
    if (node.nodeType === 3) {
      parts.push(node.nodeValue);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    if (tag === "BR") {
      parts.push("\n");
      return;
    }
    if (tag === "IMG") {
      parts.push(node.getAttribute("alt") || "");
      return;
    }
    if (tag === "A") {
      parts.push(node.textContent.replace(/\s+/g, ""));
      return;
    }
    for (const child of node.childNodes) walk(child);
  };
  walk(el);
  return parts.join("").replace(/[ \t]+\n/g, "\n").trim();
}

// Parses one `article[data-testid="tweet"]` element.
function readTweetArticle(article) {
  const timeEl = article.querySelector('a[href*="/status/"] time');
  const link = timeEl ? timeEl.closest("a") : article.querySelector('a[href*="/status/"]');
  if (!link) return null;
  const match = link.getAttribute("href").match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)/);
  if (!match) return null;
  const [, author, id] = match;

  const textEl = article.querySelector('[data-testid="tweetText"]');
  const nameEl = article.querySelector('[data-testid="User-Name"] a[href^="/"] span');
  const avatarEl = article.querySelector('[data-testid^="UserAvatar-Container"] img, [data-testid="Tweet-User-Avatar"] img');
  const group = article.querySelector('[role="group"][aria-label]');
  const context = article.querySelector('[data-testid="socialContext"]');
  const promoted = [...article.querySelectorAll("span")].some((s) => XU_AD_LABEL_RE.test(s.textContent.trim()));
  // Photos of a quoted post live inside a nested role="link" card; skip them.
  // The same photo can also be rendered twice at different sizes, so dedupe by path.
  const seenMedia = new Set();
  const media = [];
  for (const el of article.querySelectorAll('[data-testid="tweetPhoto"] img, video')) {
    if (el.closest('[role="link"][tabindex="0"]') && el.closest('[role="link"][tabindex="0"]') !== article) continue;
    const src = el.tagName === "VIDEO" ? el.getAttribute("poster") || el.src : el.src;
    if (!src) continue;
    const key = src.split("?")[0];
    if (seenMedia.has(key)) continue;
    seenMedia.add(key);
    media.push(src);
  }
  return {
    id,
    url: tweetUrl(author, id),
    author,
    authorName: nameEl ? nameEl.textContent.trim() : null,
    authorAvatar: avatarEl ? avatarEl.getAttribute("src") : null,
    createdAt: timeEl ? timeEl.getAttribute("datetime") : null,
    text: readTweetText(textEl),
    ...parseMetricsLabel(group ? group.getAttribute("aria-label") : ""),
    isRetweet: !!(context && XU_REPOST_CONTEXT_RE.test(context.textContent)),
    isReply: false,
    promoted,
    media,
    source: "dom",
  };
}

function mergeTweetRecords(domTweet, apiTweet) {
  if (!apiTweet) return { ...domTweet, enriched: false };
  const merged = { ...domTweet };
  for (const [key, value] of Object.entries(apiTweet)) {
    if (value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0 && Array.isArray(merged[key]) && merged[key].length)) merged[key] = value;
  }
  merged.promoted = !!domTweet.promoted;
  merged.source = "dom+api";
  merged.enriched = true;
  return merged;
}

// Collects the tweets of the current timeline. DOM order is authoritative for
// what was on screen; API-only top-level tweets (pre-rendered off-screen) are
// appended so nothing the client downloaded is lost.
function createTweetCollector() {
  const dom = new Map(); // id -> dom record
  const api = new Map(); // id -> api record (top-level only)
  const nested = new Map(); // id -> api record for quoted/retweeted tweets
  const users = new Map(); // lower-case handle -> user, for author enrichment

  function harvestDom(root = document) {
    for (const article of root.querySelectorAll('article[data-testid="tweet"]')) {
      const tweet = readTweetArticle(article);
      if (!tweet) continue;
      if (!xuDebug.sampleArticle) xuDebug.sampleArticle = article.outerHTML.slice(0, 20000);
      const previous = dom.get(tweet.id);
      if (!previous) dom.set(tweet.id, tweet);
      else if (!previous.text && tweet.text) previous.text = tweet.text;
    }
    return dom.size + [...api.keys()].filter((id) => !dom.has(id)).length;
  }

  const opIds = new Map(); // GraphQL operation -> top-level tweet ids it delivered

  function ingestJson(json, url = "") {
    xuDebug.apiResponses++;
    const found = collectEntities(json);
    if (!xuDebug.sampleTweet && found.tweets.length) xuDebug.sampleTweet = found.tweets[0].raw;
    if (!xuDebug.sampleUser && found.users.length) xuDebug.sampleUser = found.users[0];
    const op = String(url).match(/\/graphql\/[^/]+\/([A-Za-z0-9_]+)/);
    for (const raw of found.users) {
      const user = normalizeUser(raw);
      if (user.handle) users.set(user.handle.toLowerCase(), user);
    }
    for (const { raw, nested: isNested } of found.tweets) {
      const tweet = normalizeTweet(raw);
      if (!tweet.id) continue;
      (isNested ? nested : api).set(tweet.id, tweet);
      if (!isNested && op) {
        if (!opIds.has(op[1])) opIds.set(op[1], new Set());
        opIds.get(op[1]).add(tweet.id);
      }
    }
    return found.tweets.length;
  }

  // Operations ranked by overlap with what is on screen (see createUserCollector).
  function listOps() {
    return [...opIds.entries()]
      .map(([op, ids]) => ({ op, hits: [...ids].filter((id) => dom.has(id)).length }))
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .map((x) => x.op);
  }

  function missingCount() {
    return [...dom.keys()].filter((id) => !api.has(id) && !nested.has(id)).length;
  }

  function list() {
    const out = [];
    for (const [id, domTweet] of dom) out.push(mergeTweetRecords(domTweet, api.get(id) || nested.get(id)));
    for (const [id, apiTweet] of api) if (!dom.has(id)) out.push({ ...apiTweet, promoted: false, enriched: true, offscreen: true });
    return out;
  }

  return {
    harvestDom,
    ingestJson,
    list,
    listOps,
    missingCount,
    users,
    get size() {
      return dom.size;
    },
  };
}

// Same role as diagnoseUsers: make a format change visible and actionable.
function diagnoseTweets(tweets, enriched) {
  if (!tweets.length) {
    log.warn(`No posts were found on this page. Seen ${xuDebug.apiResponses} API responses. Make sure the timeline is visible, then run again. If it keeps failing, run copy(JSON.stringify(xu.debug)) and open an issue with the result.`);
    return;
  }
  const withText = tweets.filter((t) => t.text).length;
  const withLikes = tweets.filter((t) => typeof t.likes === "number").length;
  const withViews = tweets.filter((t) => typeof t.views === "number").length;
  const withAuthor = tweets.filter((t) => t.author).length;
  const problems = [];
  if (withText < tweets.length / 2) problems.push("post text could not be read");
  if (enriched && !withLikes) problems.push("like counts are missing from X's post data");
  if (enriched && !withViews) problems.push("view counts are missing from X's post data");
  if (withAuthor < tweets.length / 2) problems.push("authors could not be read");
  if (!enriched) problems.push("no post data was received from X (only what was on screen)");
  if (problems.length) {
    const keys = xuDebug.sampleTweet ? Object.keys(xuDebug.sampleTweet).join(", ") : "none captured";
    log.warn(`Heads-up: ${problems.join("; ")}. X may have changed its format. Raw post keys seen: ${keys}. To help fix it, run copy(JSON.stringify(xu.debug)) in this console and paste the result in a GitHub issue.`);
  }
}

const XU_SHOW_MORE_RE = /^(show (more )?replies|show this thread|mostrar (más )?respuestas|mostrar este hilo|afficher (plus de )?réponses|weitere antworten anzeigen|mostra (altre )?risposte)$/i;

async function collectTweetTimeline({ label = "tweets", stagnantLimit = 8, delayMs = 900, maxItems = Infinity, refetchFirstPage = true, expandThreads = false, completeMissing = true, stopWhen = null } = {}) {
  const collector = createTweetCollector();
  const uninstall = installInterceptor((json, url) => collector.ingestJson(json, url));
  const startPath = currentPath();
  try {
    if (refetchFirstPage) {
      let bounced = await bounceTabs();
      if (!bounced) bounced = await bounceAway();
      if (!bounced) log.step("Could not make X reload this timeline; will re-request the first page instead.");
    }
    if (currentPath() !== startPath) {
      log.error(`The page changed to ${currentPath()} before collecting. Open ${startPath} again and re-run.`);
      throw new Error("x-utils: page changed");
    }
    await autoScroll({
      harvest: () => collector.harvestDom(contentRoot()),
      stagnantLimit,
      delayMs,
      maxItems,
      label,
      beforeScroll: expandThreads ? () => clickButtons(XU_SHOW_MORE_RE, { max: 2, once: true }) : null,
      shouldStop: stopWhen ? () => stopWhen(collector.list()) : null,
    });
    // A profile whose counter says there is much more than what X's page
    // loaded: ask for the following pages directly, from the last cursor X gave.
    const owner = pathHandle(startPath);
    const ownerRecord = owner ? collector.users.get(owner.toLowerCase()) : null;
    const target = ownerRecord && typeof ownerRecord.tweets === "number" ? Math.min(ownerRecord.tweets, maxItems) : null;
    if (target && !stopWhen && collector.list().length < target * 0.7) {
      const ops = collector.listOps().filter((n) => /Tweets|Timeline/i.test(n));
      const before = collector.list().length;
      if (ops.length) {
        xuOverlay.count(`X stopped at ${before.toLocaleString("en-US")} ${label}; requesting the rest directly…`);
        log.step(`X's page stopped at ${before} ${label} while the account counter says about ${ownerRecord.tweets}; requesting more pages directly.`);
        const pages = await replayListPages(ops, () => collector.list().length < target, { fromCursor: true, maxPages: Math.ceil((target - before) / 15) + 1, delayMs: 1200 });
        const after = collector.list().length;
        xuDebug.direct = { before, after, pages, ops, target };
        if (after > before) log.info(`Fetched ${pages} more page${pages === 1 ? "" : "s"} directly: ${after - before} additional ${label}.`);
        else log.step(`Direct requests added nothing (X answered ${pages} page${pages === 1 ? "" : "s"}); keeping the ${before} ${label} from the page.`);
      } else {
        xuDebug.direct = { before, after: before, pages: 0, ops: [], target };
      }
    }
    if (completeMissing && collector.missingCount() > 0) {
      const before = collector.missingCount();
      xuOverlay.count(`Completing ${before} ${label} that loaded before the tool started…`);
      const listLike = /Tweets|Bookmarks|Likes|Search|TweetDetail|ListLatest|Timeline/i;
      let ops = collector.listOps().filter((n) => listLike.test(n));
      if (!ops.length) ops = [...xuRequests.keys()].filter((n) => listLike.test(n));
      const pages = await replayListPages(ops, () => collector.missingCount() > 0);
      const after = collector.missingCount();
      xuDebug.completed = { before, after, pages, ops };
      if (pages) log.info(`Re-requested ${pages} page${pages === 1 ? "" : "s"} of the timeline to complete ${before - after} of ${before} ${label} that loaded before the tool started.`);
      else log.step(`Could not re-request the first page (no timeline request was observed); ${before} ${label} stay DOM-only.`);
    }
  } finally {
    uninstall();
  }
  const tweets = collector.list();
  const enriched = tweets.filter((t) => t.enriched).length;
  log.info(`Collected ${tweets.length} ${label} (${enriched} with full API data).`);
  // On a profile page, hand the owner's account record to the tool (post count, etc.).
  const owner = pathHandle(startPath);
  if (owner && collector.users.has(owner.toLowerCase())) Object.defineProperty(tweets, "profileRecord", { value: collector.users.get(owner.toLowerCase()), enumerable: false });
  diagnoseTweets(tweets, enriched);
  return tweets;
}

const XU_TWEET_COLUMNS = ["id", "createdAt", "author", "authorName", "text", "likes", "retweets", "replies", "quotes", "bookmarks", "views", "isRetweet", "isReply", "isQuote", "media", "links", "url"];

function tweetsToRows(tweets, columns = XU_TWEET_COLUMNS) {
  return tweets.map((t) => {
    const row = {};
    for (const c of columns) row[c] = t[c] === undefined ? null : t[c];
    return row;
  });
}

// ---------------------------------------------------------------------------
// Export formats: CSV, JSON, Markdown and console tables.
// ---------------------------------------------------------------------------

// Escapes one CSV cell. Arrays are joined with " | ". Cells that a spreadsheet
// would interpret as a formula (=, +, -, @) are prefixed with an apostrophe.
function csvEscape(value) {
  if (value === null || value === undefined) return "";
  let s = Array.isArray(value) ? value.join(" | ") : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows, columns) {
  const cols = columns || Object.keys(rows[0] || {});
  const lines = [cols.join(",")];
  for (const row of rows) lines.push(cols.map((c) => csvEscape(row[c])).join(","));
  return lines.join("\n");
}

function toJson(value) {
  return JSON.stringify(value, null, 2);
}

function fmtInt(n) {
  return n === null || n === undefined ? "" : Number(n).toLocaleString("en-US");
}

function fmtDate(iso) {
  return iso ? String(iso).slice(0, 10) : "";
}

// Prints up to `limit` rows with the given columns.
function printTable(rows, columns, limit = 25) {
  if (!rows.length) {
    log.info("Nothing to show.");
    return;
  }
  const view = rows.slice(0, limit).map((r) => {
    const out = {};
    for (const c of columns) {
      const v = r[c];
      out[c] = Array.isArray(v) ? v.join(" | ") : typeof v === "string" && v.length > 80 ? `${v.slice(0, 77)}...` : v;
    }
    return out;
  });
  console.table(view);
  if (rows.length > limit) log.info(`Showing ${limit} of ${rows.length} rows. The exported file has all of them.`);
}

function mdEscape(text) {
  return String(text || "").replace(/([\\`*_{}[\]<>#|])/g, "\\$1");
}

function tweetToMarkdown(tweet, { heading = "###", index = null } = {}) {
  const who = tweet.author ? `@${tweet.author}` : "unknown";
  const when = fmtDate(tweet.createdAt);
  const title = index !== null ? `${heading} ${index}. ${who} · ${when}` : `${heading} ${who} · ${when}`;
  const lines = [title, "", tweet.text ? tweet.text.split("\n").map((l) => `> ${l}`).join("\n") : "> _(no text)_"];
  if (tweet.media && tweet.media.length) {
    lines.push("");
    for (const m of tweet.media) lines.push(`- media: ${m}`);
  }
  if (tweet.quotedUrl) lines.push("", `- quotes: ${tweet.quotedUrl}`);
  const stats = [];
  if (tweet.likes !== null && tweet.likes !== undefined) stats.push(`${fmtInt(tweet.likes)} likes`);
  if (tweet.retweets !== null && tweet.retweets !== undefined) stats.push(`${fmtInt(tweet.retweets)} reposts`);
  if (tweet.replies !== null && tweet.replies !== undefined) stats.push(`${fmtInt(tweet.replies)} replies`);
  if (tweet.views !== null && tweet.views !== undefined) stats.push(`${fmtInt(tweet.views)} views`);
  lines.push("", `${stats.length ? `${stats.join(" · ")} · ` : ""}[link](${tweet.url})`);
  return lines.join("\n");
}

function tweetsToMarkdown(tweets, { title, subtitle = "" } = {}) {
  const parts = [`# ${title}`, ""];
  if (subtitle) parts.push(subtitle, "");
  parts.push(`_${tweets.length} posts · exported ${todayStamp()} with x-utils_`, "");
  tweets.forEach((t, i) => {
    parts.push(tweetToMarkdown(t, { index: i + 1 }), "");
  });
  return parts.join("\n").trim() + "\n";
}

// A thread reads better as continuous prose than as numbered cards.
function threadToMarkdown(tweets, { author, title }) {
  const first = tweets[0] || {};
  const parts = [`# ${title}`, "", `by @${author} · ${fmtDate(first.createdAt)} · ${tweets.length} posts · [original](${first.url || ""})`, "", "---", ""];
  for (const t of tweets) {
    parts.push(t.text || "_(no text)_", "");
    for (const m of t.media || []) parts.push(`![media](${m})`, "");
    if (t.quotedUrl) parts.push(`> quoting ${t.quotedUrl}`, "");
  }
  parts.push("---", "", `_Unrolled ${todayStamp()} with x-utils_`);
  return parts.join("\n") + "\n";
}

function threadToPlainText(tweets) {
  return tweets.map((t, i) => `${i + 1}/${tweets.length}\n${t.text}${t.media && t.media.length ? `\n${t.media.join("\n")}` : ""}`).join("\n\n");
}

// ---------------------------------------------------------------------------
// Snapshots in localStorage, used to diff lists between runs.
// ---------------------------------------------------------------------------

function snapshotKey(kind, owner) {
  return `xu:snapshot:${kind}:${String(owner || "unknown").toLowerCase()}`;
}

function loadSnapshot(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSnapshot(key, snapshot) {
  try {
    localStorage.setItem(key, JSON.stringify(snapshot));
    return true;
  } catch (err) {
    log.warn("Could not persist the snapshot in localStorage:", err && err.message);
    return false;
  }
}

// Reduces a user record to what a snapshot needs to identify it later.
function snapshotUser(user) {
  return { id: user.id || null, handle: user.handle, name: user.name || null };
}

function makeSnapshot(kind, owner, users) {
  return { version: 1, kind, owner, takenAt: new Date().toISOString(), count: users.length, users: users.map(snapshotUser) };
}

// ---- count history (one point per run, for trend charts) -----------------

function historyKey(kind, owner) {
  return `xu:history:${kind}:${String(owner || "unknown").toLowerCase()}`;
}

function loadHistory(key) {
  const raw = loadSnapshot(key);
  return Array.isArray(raw) ? raw : [];
}

// Appends { takenAt, count } and keeps the newest `limit` points. Returns the new history.
function appendHistory(key, point, limit = 200) {
  const history = loadHistory(key).filter((p) => p && p.takenAt && typeof p.count === "number");
  history.push({ takenAt: point.takenAt, count: point.count });
  const trimmed = history.slice(-limit);
  saveSnapshot(key, trimmed);
  return trimmed;
}

// Compares two user lists. Identity is the numeric ID when both sides have it,
// otherwise the handle (case-insensitive). Detects renames when the ID matches
// but the handle changed.
function diffUserLists(previousUsers, currentUsers) {
  const prevById = new Map();
  const prevByHandle = new Map();
  for (const u of previousUsers) {
    if (u.id) prevById.set(String(u.id), u);
    if (u.handle) prevByHandle.set(u.handle.toLowerCase(), u);
  }
  const currById = new Map();
  const currByHandle = new Map();
  for (const u of currentUsers) {
    if (u.id) currById.set(String(u.id), u);
    if (u.handle) currByHandle.set(u.handle.toLowerCase(), u);
  }

  const added = [];
  const renamed = [];
  for (const u of currentUsers) {
    const byId = u.id ? prevById.get(String(u.id)) : null;
    const byHandle = u.handle ? prevByHandle.get(u.handle.toLowerCase()) : null;
    if (!byId && !byHandle) added.push(u);
    else if (byId && byId.handle && u.handle && byId.handle.toLowerCase() !== u.handle.toLowerCase()) renamed.push({ from: byId.handle, to: u.handle, id: u.id });
  }
  const removed = [];
  for (const u of previousUsers) {
    const byId = u.id ? currById.get(String(u.id)) : null;
    const byHandle = u.handle ? currByHandle.get(u.handle.toLowerCase()) : null;
    if (!byId && !byHandle) removed.push(u);
  }
  return { added, removed, renamed };
}

// ---------------------------------------------------------------------------
// Pure analysis helpers shared by several tools: follower quality heuristics,
// thread reconstruction and engagement statistics.
// ---------------------------------------------------------------------------

const XU_QUALITY_DEFAULTS = {
  minFollowers: 5,
  minTweets: 3,
  maxFollowRatio: 20, // following / followers
  newAccountDays: 30,
  suspiciousScore: 5,
};

// Scores how much a follower looks like a low-quality or automated account.
// Higher is worse. Returns { score, reasons }; score is null when the record
// has no profile data to judge (DOM-only rows).
function scoreUserQuality(user, options = {}, now = Date.now()) {
  const cfg = { ...XU_QUALITY_DEFAULTS, ...options };
  if (!user.enriched && user.followers === undefined) return { score: null, reasons: ["no profile data (DOM-only row)"] };

  let score = 0;
  const reasons = [];
  if (user.defaultAvatar) {
    score += 3;
    reasons.push("default avatar");
  }
  if (user.tweets === 0) {
    score += 3;
    reasons.push("never posted");
  } else if (user.tweets !== null && user.tweets < cfg.minTweets) {
    score += 1;
    reasons.push(`only ${user.tweets} posts`);
  }
  if (!user.bio) {
    score += 1;
    reasons.push("empty bio");
  }
  if (user.followers !== null && user.followers < cfg.minFollowers) {
    score += 2;
    reasons.push(`${user.followers} followers`);
  }
  if (user.following !== null && user.followers !== null && user.following >= 100 && user.following / Math.max(user.followers, 1) > cfg.maxFollowRatio) {
    score += 2;
    reasons.push(`follows ${user.following}, followed by ${user.followers}`);
  }
  const age = daysSince(user.createdAt, now);
  if (age !== null && age < cfg.newAccountDays) {
    score += 2;
    reasons.push(`account is ${age} days old`);
  }
  if (user.handle && /^[A-Za-z]+\d{6,}$/.test(user.handle)) {
    score += 1;
    reasons.push("auto-generated looking handle");
  }
  return { score, reasons };
}

// Rebuilds an author's thread from a bag of tweets collected on a status page.
// Walks up from the focal tweet to the root, then follows the author's own
// replies downwards. Falls back to DOM order when reply metadata is missing.
function buildThreadChain(tweets, focalId) {
  const byId = new Map(tweets.map((t) => [String(t.id), t]));
  const focal = byId.get(String(focalId));
  if (!focal) return { tweets: [], author: null, method: "none" };

  // Ascend to the root (bounded to avoid loops in malformed data).
  let root = focal;
  const seen = new Set([root.id]);
  while (root.inReplyToId && byId.has(String(root.inReplyToId)) && !seen.has(String(root.inReplyToId))) {
    root = byId.get(String(root.inReplyToId));
    seen.add(root.id);
  }
  const author = (root.author || focal.author || "").toLowerCase();
  if (!author) return { tweets: [focal], author: null, method: "focal-only" };

  const hasReplyData = tweets.some((t) => t.inReplyToId);
  if (!hasReplyData) {
    const ordered = tweets.filter((t) => (t.author || "").toLowerCase() === author);
    return { tweets: ordered, author, method: "dom-order" };
  }

  const chain = [root];
  const used = new Set([String(root.id)]);
  let current = root;
  for (;;) {
    const children = tweets
      .filter((t) => String(t.inReplyToId) === String(current.id) && (t.author || "").toLowerCase() === author && !used.has(String(t.id)))
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || String(a.id).localeCompare(String(b.id)));
    if (!children.length) break;
    current = children[0];
    chain.push(current);
    used.add(String(current.id));
  }
  // Posts that only came from the screen have no reply metadata. In the
  // conversation view the author's thread is contiguous, so keep following the
  // author's posts that directly follow the last chained one on screen.
  let method = "reply-chain";
  const onScreen = tweets.filter((t) => !t.offscreen);
  let index = onScreen.findIndex((t) => String(t.id) === String(current.id));
  while (index >= 0 && index + 1 < onScreen.length) {
    const next = onScreen[index + 1];
    const byAuthor = (next.author || "").toLowerCase() === author;
    const unlinked = !next.inReplyToId || String(next.inReplyToId) === String(current.id);
    if (!byAuthor || !unlinked || used.has(String(next.id))) break;
    chain.push(next);
    used.add(String(next.id));
    current = next;
    method = "reply-chain+order";
    index++;
  }
  return { tweets: chain, author, method };
}

// Newest post date in a timeline sample, ignoring the pinned post (which can be
// years old and sits first). Returns an ISO string or null when nothing dated.
function newestPostDate(tweets, pinnedIds = []) {
  const pinned = new Set((pinnedIds || []).map(String));
  let newest = null;
  for (const t of tweets || []) {
    if (!t || !t.createdAt || pinned.has(String(t.id))) continue;
    if (!newest || t.createdAt > newest) newest = t.createdAt;
  }
  return newest;
}

function median(values) {
  const v = values.filter((n) => n !== null && n !== undefined).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function sum(values) {
  return values.reduce((acc, n) => acc + (n || 0), 0);
}

// Per-post engagement plus aggregate stats for a set of the account's tweets.
function engagementStats(tweets) {
  const rows = tweets.map((t) => {
    const interactions = sum([t.likes, t.retweets, t.replies, t.quotes]);
    const rate = t.views ? Math.round((interactions / t.views) * 10000) / 100 : null;
    return { ...t, interactions, engagementRate: rate };
  });
  const hours = new Array(24).fill(0);
  const weekdays = new Array(7).fill(0);
  const hourScore = new Array(24).fill(0);
  const weekdayScore = new Array(7).fill(0);
  for (const r of rows) {
    if (!r.createdAt) continue;
    const d = new Date(r.createdAt);
    hours[d.getHours()]++;
    weekdays[d.getDay()]++;
    hourScore[d.getHours()] += r.interactions;
    weekdayScore[d.getDay()] += r.interactions;
  }
  const bestIndex = (arr, counts) => {
    let best = -1;
    let bestValue = -1;
    arr.forEach((total, i) => {
      if (!counts[i]) return;
      const avg = total / counts[i];
      if (avg > bestValue) {
        bestValue = avg;
        best = i;
      }
    });
    return best;
  };
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const bestHour = bestIndex(hourScore, hours);
  const bestDay = bestIndex(weekdayScore, weekdays);
  return {
    rows,
    totals: {
      posts: rows.length,
      likes: sum(rows.map((r) => r.likes)),
      retweets: sum(rows.map((r) => r.retweets)),
      replies: sum(rows.map((r) => r.replies)),
      quotes: sum(rows.map((r) => r.quotes)),
      views: sum(rows.map((r) => r.views)),
    },
    averages: {
      likes: rows.length ? Math.round((sum(rows.map((r) => r.likes)) / rows.length) * 10) / 10 : 0,
      views: rows.length ? Math.round(sum(rows.map((r) => r.views)) / rows.length) : 0,
      engagementRate: median(rows.map((r) => r.engagementRate)),
    },
    medians: { likes: median(rows.map((r) => r.likes)), views: median(rows.map((r) => r.views)) },
    bestHourLocal: bestHour >= 0 ? `${String(bestHour).padStart(2, "0")}:00` : null,
    bestWeekday: bestDay >= 0 ? dayNames[bestDay] : null,
  };
}

// ---------------------------------------------------------------------------
// HTML report: a single self-contained file (inline CSS and JS, no network
// besides the avatars and media X already serves) that opens from Downloads.
// Every value is escaped; URLs are only linked when they are plain http(s).
// ---------------------------------------------------------------------------

function htmlEscape(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHref(url) {
  return typeof url === "string" && /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : null;
}

function htmlLink(url, label, extraClass = "") {
  const href = safeHref(url);
  if (!href) return htmlEscape(label === undefined ? url : label);
  return `<a class="${extraClass}" href="${htmlEscape(href)}" target="_blank" rel="noopener noreferrer">${htmlEscape(label === undefined ? url : label)}</a>`;
}

const XU_ICONS = {
  like: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.3-9.4C1.4 8 3.6 4.5 7.2 4.5c2 0 3.5 1.1 4.8 2.7 1.3-1.6 2.8-2.7 4.8-2.7 3.6 0 5.8 3.5 4.5 7.1C19.5 16.4 12 21 12 21z"/></svg>',
  repost: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10V8a4 4 0 0 1 4-4h9l-3-3m3 3-3 3M20 14v2a4 4 0 0 1-4 4H7l3 3m-3-3 3-3"/></svg>',
  reply: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.5-4.5A8 8 0 1 1 21 12z"/></svg>',
  views: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  rate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19 19 4M7 7h.01M17 17h.01"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/></svg>',
  open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4 10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0 4-4m-4 4-4-4M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/></svg>',
};

const XU_FAVICON = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0d1220"/><path d="M8 8l16 16M24 8L8 24" stroke="url(#g)" stroke-width="4" stroke-linecap="round"/><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b3a6ff"/><stop offset="1" stop-color="#5ee0a8"/></linearGradient></defs></svg>');

// Deterministic hue for initials avatars, so the same account always gets the same colour.
function avatarHue(handle) {
  let h = 0;
  for (const ch of String(handle || "")) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function htmlAvatar(handle, name, avatarUrl, size = "") {
  const initial = htmlEscape((name || handle || "?").trim().charAt(0).toUpperCase());
  const src = safeHref(avatarUrl);
  const img = src ? `<img src="${htmlEscape(src.replace(/_(normal|mini|x96|200x200)\./, "_bigger."))}" alt="" loading="lazy" onerror="this.remove()">` : "";
  return `<span class="avatar ${size}" style="--h:${avatarHue(handle)}">${initial}${img}</span>`;
}

// Account identity cell: avatar, display name with badges, @handle.
function htmlAccountCell(row) {
  const handle = row.handle || "";
  const href = handle ? `https://x.com/${handle}` : null;
  const badges = `${row.verified ? `<span class="badge badge-verified" title="Verified">${XU_ICONS.check}</span>` : ""}${row.protected ? `<span class="badge badge-lock" title="Protected account">${XU_ICONS.lock}</span>` : ""}`;
  const name = row.name ? `<span class="acct-name">${htmlEscape(row.name)}${badges}</span>` : "";
  const handleHtml = href ? `<a class="acct-handle" href="${htmlEscape(href)}" target="_blank" rel="noopener noreferrer">@${htmlEscape(handle)}</a>` : `<span class="acct-handle">@${htmlEscape(handle)}</span>`;
  return `<span class="acct">${htmlAvatar(handle, row.name, row.avatar)}<span class="acct-text">${name}${handleHtml}</span></span>`;
}

const XU_HTML_DATE_KEYS = new Set(["createdAt", "lastPostAt", "takenAt"]);
const XU_HTML_LOG_KEYS = new Set(["followers", "following", "tweets", "likes", "retweets", "replies", "quotes", "bookmarks", "views", "interactions", "listed", "media"]);
const XU_HTML_LINEAR_KEYS = new Set(["score", "daysSinceLastPost", "engagementRate"]);
const XU_HTML_NUMBER_KEYS = new Set([...XU_HTML_LOG_KEYS, ...XU_HTML_LINEAR_KEYS]);
const XU_HTML_BAD_WHEN_FALSE = new Set(["followsYou", "youFollow"]);
const XU_HTML_BAD_WHEN_TRUE = new Set(["inactive", "defaultAvatar"]);
const XU_HTML_BAD_BARS = new Set(["score", "daysSinceLastPost"]);

const XU_HTML_LABELS = {
  handle: "Account", name: "Name", followsYou: "Follows you", youFollow: "You follow", followers: "Followers", following: "Following", tweets: "Posts", createdAt: "Joined", verified: "Verified", protected: "Protected", bio: "Bio", url: "", id: "ID", score: "Score", reasons: "Signals", defaultAvatar: "Default avatar", lastPostAt: "Last post", daysSinceLastPost: "Days silent", inactive: "Silent", probeStatus: "Check", change: "Change", text: "Post", author: "Author", authorName: "Author name", likes: "Likes", retweets: "Reposts", replies: "Replies", quotes: "Quotes", bookmarks: "Bookmarks", views: "Views", interactions: "Interactions", engagementRate: "Engagement", isReply: "Reply", isQuote: "Quote", isRetweet: "Repost", media: "Media", links: "Links",
};

function htmlColumnLabel(key) {
  return XU_HTML_LABELS[key] !== undefined ? XU_HTML_LABELS[key] : key;
}

function htmlFlag(key, value) {
  if (value === true) {
    const bad = XU_HTML_BAD_WHEN_TRUE.has(key);
    return `<span class="flag ${bad ? "flag-bad" : "flag-good"}">${bad ? "yes" : `${XU_ICONS.check}yes`}</span>`;
  }
  if (XU_HTML_BAD_WHEN_FALSE.has(key)) return '<span class="flag flag-bad">no</span>';
  return '<span class="flag flag-off">—</span>';
}

// Renders one table cell. `scale` holds per-column maxima for magnitude bars.
function htmlCell(key, value, row, scale) {
  if (key === "handle") return htmlAccountCell(row);
  if (key === "url") return value && safeHref(value) ? `<a class="open" href="${htmlEscape(value)}" target="_blank" rel="noopener noreferrer" aria-label="Open on X">${XU_ICONS.open}</a>` : "";
  if (key === "text") return `<div class="text">${htmlEscape(value).replace(/\n/g, "<br>")}</div>`;
  if (key === "bio") return value ? `<div class="bio" title="${htmlEscape(value)}">${htmlEscape(value)}</div>` : '<span class="dim">—</span>';
  if (key === "reasons" && Array.isArray(value)) return `<span class="chips">${value.map((r) => `<span class="chip">${htmlEscape(r)}</span>`).join("")}</span>`;
  if (key === "change") return `<span class="chip chip-${htmlEscape(value)}">${htmlEscape(value)}</span>`;
  if (key === "probeStatus") return `<span class="chip chip-${value === "ok" ? "ok" : "warn"}">${htmlEscape(value)}</span>`;
  if (typeof value === "boolean") return htmlFlag(key, value);
  if (value === null || value === undefined) return '<span class="dim">—</span>';
  if (XU_HTML_DATE_KEYS.has(key)) {
    const days = daysSince(value);
    const rel = days === null ? "" : days < 30 ? `${days}d ago` : days < 730 ? `${Math.round(days / 30)}mo ago` : `${Math.round(days / 365)}y ago`;
    return `<time datetime="${htmlEscape(value)}">${htmlEscape(fmtDate(value))}</time>${rel ? `<span class="rel">${htmlEscape(rel)}</span>` : ""}`;
  }
  if (XU_HTML_NUMBER_KEYS.has(key) && typeof value === "number") {
    const max = scale && scale[key];
    let width = 0;
    if (max > 0) width = XU_HTML_LOG_KEYS.has(key) ? Math.log10(value + 1) / Math.log10(max + 1) : value / max;
    const label = key === "engagementRate" ? `${value}%` : fmtInt(value);
    return `<span class="cell-num"><span class="num">${htmlEscape(label)}</span><i class="bar ${XU_HTML_BAD_BARS.has(key) ? "bar-bad" : ""}" style="width:${Math.round(Math.max(0, Math.min(1, width)) * 100)}%"></i></span>`;
  }
  if (Array.isArray(value)) return htmlEscape(value.join(", "));
  return htmlEscape(value);
}

// copyWhat: "handles" (tables with an account column), "links" (posts or
// tables with a url column) or null (nothing sensible to copy).
function htmlToolbar(id, count, noun, kind, copyWhat) {
  const copyButton = copyWhat
    ? `<button type="button" class="btn" data-copy="${htmlEscape(id)}" data-kind="${kind}" data-what="${copyWhat}" title="Copy the ${copyWhat === "handles" ? "@handles" : "links"} of the rows currently shown">${XU_ICONS.copy}<span>Copy ${copyWhat}</span></button>`
    : "";
  return `<div class="toolbar">
    <label class="filter">${XU_ICONS.search}<span class="sr-only">Filter ${htmlEscape(noun)}</span><input type="search" placeholder="Filter ${htmlEscape(count.toLocaleString("en-US"))} ${htmlEscape(noun)}…" data-filter="${htmlEscape(id)}" data-kind="${kind}"><kbd title="Press / to search">/</kbd></label>
    ${copyButton}
    <button type="button" class="btn btn-quiet" data-csv="${htmlEscape(id)}" data-kind="${kind}" title="Download the rows currently shown as CSV">${XU_ICONS.download}<span>CSV</span></button>
  </div>`;
}

// Stacked proportion bar for the masthead. `parts` = [{ label, value, tone }].
function htmlBreakdown(parts) {
  const total = parts.reduce((acc, p) => acc + (p.value || 0), 0);
  if (!total) return "";
  const segments = parts
    .filter((p) => p.value > 0)
    .map((p) => `<span class="seg tone-${htmlEscape(p.tone || "neutral")}" style="flex-grow:${p.value}" title="${htmlEscape(p.label)}: ${htmlEscape(fmtInt(p.value))}"></span>`)
    .join("");
  const legend = parts
    .map((p) => `<span class="key tone-${htmlEscape(p.tone || "neutral")}"><i></i>${htmlEscape(p.label)} <b class="num">${htmlEscape(fmtInt(p.value))}</b><span class="pct num">${Math.round(((p.value || 0) / total) * 100)}%</span></span>`)
    .join("");
  return `<div class="breakdown" role="img" aria-label="${htmlEscape(parts.map((p) => `${p.label}: ${p.value}`).join(", "))}"><div class="track">${segments}</div><div class="legend">${legend}</div></div>`;
}

// Sticky section navigation derived from the rendered sections.
function htmlSubnav(sections, brand) {
  const items = [];
  for (const html of sections) {
    const id = (html.match(/<section class="block" id="([^"]+)"/) || [])[1];
    const title = (html.match(/<h2>(.*?)<span class="count num">(.*?)<\/span>/) || []);
    if (id && title[1]) items.push(`<a href="#${htmlEscape(id)}">${title[1]}<span class="num">${title[2]}</span></a>`);
  }
  if (items.length < 2) return "";
  return `<nav class="subnav" aria-label="Sections"><div class="wrap"><span class="crumb">${htmlEscape(brand)}</span>${items.join("")}</div></nav>`;
}

// Quick filters shown as chips above a table. op: gte | lt | eq | empty | daysLt | daysGte
const XU_USER_CHIPS = [
  { label: "10k+ followers", key: "followers", op: "gte", value: 10000 },
  { label: "Under 100 followers", key: "followers", op: "lt", value: 100 },
  { label: "Verified", key: "verified", op: "eq", value: true },
  { label: "Joined this year", key: "createdAt", op: "daysLt", value: 365 },
  { label: "No bio", key: "bio", op: "empty" },
];

function htmlChips(id, chips, rows) {
  const usable = (chips || []).filter((c) => rows.some((r) => r[c.key] !== undefined));
  if (!usable.length) return "";
  const buttons = usable
    .map((c) => `<button type="button" class="chip-btn" data-chip="${htmlEscape(JSON.stringify({ key: c.key, op: c.op, value: c.value === undefined ? null : c.value }))}" aria-pressed="false">${htmlEscape(c.label)}</button>`)
    .join("");
  return `<div class="chips-row" data-chips="${htmlEscape(id)}">${buttons}</div>`;
}

function rowChipAttrs(row, chips) {
  const keys = [...new Set((chips || []).map((c) => c.key))];
  return keys.map((k) => ` data-c-${htmlEscape(k)}="${htmlEscape(row[k] === null || row[k] === undefined ? "" : row[k])}"`).join("");
}

// A sortable, filterable table section with magnitude bars and identity cells.
function htmlTableSection({ id, title, columns, rows, note = "", empty = "Nothing here.", chips = null }) {
  // With an identity cell, name and badges (verified, protected) live inside it.
  const cols = columns.includes("handle") ? columns.filter((c) => !["name", "verified", "protected"].includes(c)) : columns.slice();
  const scale = {};
  for (const c of cols) if (XU_HTML_NUMBER_KEYS.has(c)) scale[c] = Math.max(0, ...rows.map((r) => (typeof r[c] === "number" ? r[c] : 0)));
  const sortType = (key) => (XU_HTML_NUMBER_KEYS.has(key) ? "num" : XU_HTML_DATE_KEYS.has(key) ? "date" : "text");
  const head = cols.map((c) => `<th scope="col" data-key="${htmlEscape(c)}" data-type="${sortType(c)}" class="${XU_HTML_NUMBER_KEYS.has(c) ? "num" : ""} ${c === "url" ? "col-open" : ""}" tabindex="0" role="button" aria-sort="none"><span>${htmlEscape(htmlColumnLabel(c))}</span></th>`).join("");
  const body = rows
    .map((row) => `<tr${rowChipAttrs(row, chips)}>${cols.map((c) => `<td data-key="${htmlEscape(c)}" data-sort="${htmlEscape(row[c] === null || row[c] === undefined ? "" : Array.isArray(row[c]) ? row[c].join(" ") : row[c])}" class="${XU_HTML_NUMBER_KEYS.has(c) ? "num" : ""}">${htmlCell(c, row[c], row, scale)}</td>`).join("")}</tr>`)
    .join("\n");
  return `
<section class="block" id="${htmlEscape(id)}">
  <header class="block-head">
    <h2>${htmlEscape(title)}<span class="count num">${rows.length.toLocaleString("en-US")}</span></h2>
    ${rows.length ? htmlToolbar(id, rows.length, "rows", "table", cols.includes("handle") ? "handles" : cols.includes("url") ? "links" : null) : ""}
  </header>
  ${note ? `<p class="note">${htmlEscape(note)}</p>` : ""}
  ${rows.length ? htmlChips(id, chips, rows) : ""}
  ${rows.length ? `<div class="scroll"><table data-table="${htmlEscape(id)}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div><p class="shown" data-shown="${htmlEscape(id)}"></p>` : `<p class="empty">${htmlEscape(empty)}</p>`}
</section>`;
}

// Thumbnails link to the full-size file; the page itself loads the small variant.
function thumbnailUrl(href) {
  return href.replace(/([?&])name=(orig|large|medium|4096x4096)\b/, "$1name=small");
}

function htmlMediaList(media) {
  if (!media || !media.length) return "";
  const items = media
    .slice(0, 4)
    .map((url) => {
      const href = safeHref(url);
      if (!href) return "";
      const isImage = /\.(jpe?g|png|gif|webp)(\?|$)/i.test(href) || /format=(jpe?g|png|webp)/i.test(href);
      return isImage
        ? `<a class="media-item" href="${htmlEscape(href)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" src="${htmlEscape(thumbnailUrl(href))}" alt="" onerror="this.parentNode.classList.add('broken')"><span class="media-fallback">image</span></a>`
        : `<a class="media-item media-video" href="${htmlEscape(href)}" target="_blank" rel="noopener noreferrer"><span class="media-fallback">▶ video</span></a>`;
    })
    .join("");
  return `<div class="media media-${Math.min(media.length, 4)}">${items}</div>`;
}

function htmlMetric(icon, value, label) {
  if (value === null || value === undefined) return "";
  return `<span class="metric" title="${htmlEscape(label)}">${XU_ICONS[icon]}<b class="num">${htmlEscape(value)}</b></span>`;
}

// Posts as reading cards, in the order given. `numbered` only for rankings.
function htmlCardsSection({ id, title, tweets, note = "", numbered = false, empty = "No posts." }) {
  const cards = tweets
    .map((t, i) => {
      const searchable = `${t.author || ""} ${t.authorName || ""} ${t.text || ""}`.toLowerCase();
      const href = safeHref(t.url);
      return `<article class="card" data-search="${htmlEscape(searchable)}" data-url="${htmlEscape(href || "")}">
  ${numbered ? `<span class="rank num">${i + 1}</span>` : ""}
  <header>
    ${htmlAvatar(t.author, t.authorName, t.authorAvatar)}
    <span class="acct-text">
      <span class="acct-name">${htmlEscape(t.authorName || t.author || "unknown")}${t.isRetweet ? '<span class="tag">repost</span>' : ""}${t.isReply ? '<span class="tag">reply</span>' : ""}</span>
      ${t.author ? `<a class="acct-handle" href="https://x.com/${htmlEscape(t.author)}" target="_blank" rel="noopener noreferrer">@${htmlEscape(t.author)}</a>` : ""}
    </span>
    ${t.createdAt ? (href ? `<a class="when" href="${htmlEscape(href)}" target="_blank" rel="noopener noreferrer"><time datetime="${htmlEscape(t.createdAt)}">${htmlEscape(fmtDate(t.createdAt))}</time></a>` : `<time class="when" datetime="${htmlEscape(t.createdAt)}">${htmlEscape(fmtDate(t.createdAt))}</time>`) : ""}
  </header>
  <div class="text">${htmlEscape(t.text || "").replace(/\n/g, "<br>") || '<span class="dim">(no text)</span>'}</div>
  ${htmlMediaList(t.media)}
  ${t.quotedUrl ? `<p class="quoted">Quoting ${htmlLink(t.quotedUrl)}</p>` : ""}
  <footer>
    ${htmlMetric("like", t.likes === null || t.likes === undefined ? null : fmtInt(t.likes), "Likes")}
    ${htmlMetric("repost", t.retweets === null || t.retweets === undefined ? null : fmtInt(t.retweets), "Reposts")}
    ${htmlMetric("reply", t.replies === null || t.replies === undefined ? null : fmtInt(t.replies), "Replies")}
    ${htmlMetric("views", t.views === null || t.views === undefined ? null : fmtInt(t.views), "Views")}
    ${htmlMetric("rate", t.engagementRate === null || t.engagementRate === undefined ? null : `${t.engagementRate}%`, "Engagement rate")}
    <span class="spacer"></span>
    ${href ? `<a class="open open-text" href="${htmlEscape(href)}" target="_blank" rel="noopener noreferrer">Open on X ${XU_ICONS.open}</a>` : ""}
  </footer>
</article>`;
    })
    .join("\n");
  return `
<section class="block" id="${htmlEscape(id)}">
  <header class="block-head">
    <h2>${htmlEscape(title)}<span class="count num">${tweets.length.toLocaleString("en-US")}</span></h2>
    ${tweets.length ? htmlToolbar(id, tweets.length, "posts", "cards", "links") : ""}
  </header>
  ${note ? `<p class="note">${htmlEscape(note)}</p>` : ""}
  ${tweets.length ? `<div class="cards${numbered ? "" : " cards-flow"}" data-cards="${htmlEscape(id)}">${cards}</div><p class="shown" data-shown="${htmlEscape(id)}"></p>` : `<p class="empty">${htmlEscape(empty)}</p>`}
</section>`;
}

const XU_HTML_CSS = `
:root{--band:#0d1220;--band-2:#161d33;--band-ink:#f4f6fb;--band-muted:#8f9ab3;--band-line:rgba(255,255,255,.1);
--ground:#eef0f4;--surface:#fff;--surface-2:#f6f7fa;--ink:#0d1220;--muted:#66708a;--dim:#a3abbe;--line:#e3e6ee;--hover:#f4f5ff;
--accent:#5b3df5;--accent-soft:rgba(91,61,245,.14);--good:#12805c;--good-soft:rgba(18,128,92,.12);--bad:#d2481d;--bad-soft:rgba(210,72,29,.12);--warn:#a86b0f;--warn-soft:rgba(168,107,15,.14);
--band-good:#5ee0a8;--band-bad:#ff9a6c;--band-accent:#b3a6ff;
--mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI Variable","Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;
--r:14px;--shadow:0 1px 2px rgba(13,18,32,.06),0 12px 32px -16px rgba(13,18,32,.18)}
@media (prefers-color-scheme:dark){:root{--band:#080b14;--band-2:#0f1424;--ground:#0b0f19;--surface:#121826;--surface-2:#171e2e;--ink:#e8ecf5;--muted:#8d97ad;--dim:#5b6479;--line:#222b3d;--hover:#182038;
--accent:#a394ff;--accent-soft:rgba(163,148,255,.16);--good:#4fd39b;--good-soft:rgba(79,211,155,.14);--bad:#ff9a6c;--bad-soft:rgba(255,154,108,.14);--warn:#e2b35c;--warn-soft:rgba(226,179,92,.16);--shadow:0 1px 2px rgba(0,0,0,.4),0 16px 40px -20px rgba(0,0,0,.8)}}
*{box-sizing:border-box}html{color-scheme:light dark;scroll-behavior:smooth}@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
body{margin:0;background:var(--ground);color:var(--ink);font:14.5px/1.5 var(--sans);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
svg{width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:-.15em}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.num{font-family:var(--mono);font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.dim{color:var(--dim)}
.wrap{max-width:1200px;margin:0 auto;padding:0 28px}

/* masthead band */
.band{background:radial-gradient(900px 360px at 12% -20%,rgba(120,96,255,.35),transparent 65%),radial-gradient(700px 300px at 95% 10%,rgba(46,196,182,.18),transparent 60%),linear-gradient(180deg,var(--band-2),var(--band));color:var(--band-ink);padding:36px 0 72px}
.band .top{display:flex;justify-content:space-between;align-items:center;gap:16px;font-family:var(--mono);font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--band-muted)}
.band .top .brand{display:inline-flex;align-items:center;gap:10px;color:var(--band-ink);text-decoration:none!important;font:700 15px/1 var(--sans);letter-spacing:-.02em;text-transform:none}
.band .top .brand:hover{color:var(--band-accent)}
.band .top .brand i{display:inline-block;width:12px;height:12px;border-radius:3px;background:linear-gradient(135deg,#b3a6ff,#5ee0a8)}
.band .top .crumbs{display:inline-flex;align-items:center;gap:14px}
.band .top .crumb-tool{display:inline-flex;align-items:center;gap:10px}
.band .top .crumb-tool::before{content:"";display:inline-block;width:1px;height:14px;background:var(--band-line)}
.band h1{margin:34px 0 10px;font-size:clamp(28px,4.2vw,44px);font-weight:700;letter-spacing:-.035em;line-height:1.05;max-width:22ch;text-wrap:balance}
.band .subtitle{margin:0;font-size:16.5px;color:var(--band-muted);max-width:70ch}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0;margin-top:34px;border-top:1px solid var(--band-line)}
.stat{display:block;color:inherit;padding:18px 20px 0 0;margin-right:20px;border-right:1px solid var(--band-line);text-decoration:none!important;position:relative;min-width:0}
.stat:last-child{border-right:0}
.stat .value{display:block;font-family:var(--mono);font-size:38px;font-weight:600;line-height:1;letter-spacing:-.04em;font-variant-numeric:tabular-nums;white-space:nowrap}
.stat .value.is-long{font-size:28px;padding-top:6px}
.stat .label{display:block;margin-top:8px;font-size:13px;color:var(--band-muted);letter-spacing:.01em}
a.stat .label::after{content:" →";opacity:0;transition:opacity .15s}a.stat:hover .label::after,a.stat:focus-visible .label::after{opacity:1}
a.stat:hover .label{color:var(--band-ink)}
.stat.tone-good .value{color:var(--band-good)}.stat.tone-bad .value{color:var(--band-bad)}.stat.tone-accent .value{color:var(--band-accent)}
.stat .value.is-text{font-size:24px;padding-top:9px;letter-spacing:-.02em}
.band-note{margin:22px 0 0;padding:10px 14px;border-left:2px solid var(--band-accent);color:var(--band-muted);font-size:13.5px;max-width:80ch}
.breakdown{margin-top:28px}
.breakdown .track{display:flex;height:10px;border-radius:999px;overflow:hidden;background:var(--band-line);gap:2px}
.breakdown .seg{display:block;flex-basis:0;min-width:3px}
.breakdown .seg.tone-good{background:var(--band-good)}.breakdown .seg.tone-bad{background:var(--band-bad)}.breakdown .seg.tone-accent{background:var(--band-accent)}.breakdown .seg.tone-neutral{background:rgba(255,255,255,.35)}
.breakdown .legend{display:flex;flex-wrap:wrap;gap:8px 22px;margin-top:10px;font-size:13px;color:var(--band-muted)}
.breakdown .key{display:inline-flex;align-items:center;gap:7px}
.breakdown .key i{width:9px;height:9px;border-radius:3px;background:rgba(255,255,255,.35)}
.breakdown .key.tone-good i{background:var(--band-good)}.breakdown .key.tone-bad i{background:var(--band-bad)}.breakdown .key.tone-accent i{background:var(--band-accent)}
.breakdown .key b{color:var(--band-ink);font-weight:600}
.breakdown .pct{opacity:.7;font-size:12px}

/* sticky section navigation */
.band.has-nav{padding-bottom:40px}
.subnav{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--surface) 88%,transparent);backdrop-filter:saturate(1.4) blur(10px);-webkit-backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--line)}
.subnav .wrap{display:flex;align-items:center;gap:4px;height:46px;overflow-x:auto;scrollbar-width:none}
.subnav .wrap::-webkit-scrollbar{display:none}
.subnav .crumb{font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-right:14px;white-space:nowrap}
.subnav a{display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:8px;color:var(--ink);font-size:13px;font-weight:500;white-space:nowrap;text-decoration:none}
.subnav a:hover{background:var(--surface-2)}
.subnav a .num{font-size:11.5px;color:var(--muted);background:var(--surface-2);border:1px solid var(--line);border-radius:999px;padding:0 6px}
.subnav + .content{margin-top:26px}
.has-subnav th{top:46px}

/* content */
.content{margin-top:-40px;padding-bottom:56px}
.block{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);padding:22px 24px 18px;margin:0 0 22px;scroll-margin-top:16px}
.block-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 20px;margin-bottom:14px}
.block h2{margin:0;font-size:18px;font-weight:650;letter-spacing:-.015em;display:flex;align-items:baseline;gap:10px}
.block h2 .count{font-size:12px;font-weight:600;color:var(--muted);background:var(--surface-2);border:1px solid var(--line);border-radius:999px;padding:1px 8px}
.toolbar{display:flex;align-items:center;gap:8px}
.filter{display:inline-flex;align-items:center;gap:8px;padding:0 12px;height:36px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);color:var(--muted);min-width:260px}
.filter:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.filter kbd{font-family:var(--mono);font-size:10.5px;color:var(--dim);border:1px solid var(--line);border-radius:4px;padding:0 5px;line-height:16px}
.filter:focus-within kbd{display:none}
.filter input{border:0;background:transparent;font:inherit;color:var(--ink);width:100%;outline:none}
.btn{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 13px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);font:inherit;font-weight:500;cursor:pointer;white-space:nowrap}
.btn:hover{background:var(--surface-2)}.btn.done{color:var(--good);border-color:var(--good)}
.btn-quiet{color:var(--muted);padding:0 11px}.btn-quiet:hover{color:var(--ink)}
.block{scroll-margin-top:60px}
.note{margin:-4px 0 14px;color:var(--muted);font-size:13.5px}
.empty{margin:4px 0 6px;padding:26px;text-align:center;color:var(--muted);background:var(--surface-2);border:1px dashed var(--line);border-radius:10px}
.shown{font-size:12.5px;color:var(--muted);margin:10px 0 0;min-height:1em}

/* table */
.scroll{margin:0 -8px}
table{width:100%;border-collapse:separate;border-spacing:0;font-size:13.5px}
th,td{padding:10px 10px;border-bottom:1px solid var(--line);vertical-align:middle;text-align:left}
th{position:sticky;top:0;z-index:1;background:var(--surface);font-size:12px;font-weight:600;color:var(--muted);cursor:pointer;user-select:none;white-space:nowrap;border-bottom:1px solid var(--line)}
th span{display:inline-flex;align-items:center;gap:4px}
th:hover{color:var(--ink)}th[aria-sort="ascending"] span::after{content:"↑";color:var(--accent)}th[aria-sort="descending"] span::after{content:"↓";color:var(--accent)}
th.num,td.num{text-align:right}th.num span{justify-content:flex-end}
th.col-open{width:40px}
tbody tr:hover td{background:var(--hover)}
tbody tr:last-child td{border-bottom:0}
tr[hidden]{display:none}
td .text{max-width:520px;white-space:pre-wrap;line-height:1.45;overflow-wrap:anywhere}
td .bio{max-width:340px;color:var(--muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:13px;line-height:1.4}
td time{font-family:var(--mono);font-size:12.5px;white-space:nowrap}
td .rel{display:block;font-size:11.5px;color:var(--dim)}
.cell-num{display:inline-block;position:relative;min-width:64px;padding-bottom:5px;text-align:right}
.cell-num .bar{position:absolute;right:0;bottom:0;height:3px;border-radius:2px;background:var(--accent);opacity:.35}
.cell-num .bar.bar-bad{background:var(--bad);opacity:.55}
a.open{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:7px;color:var(--muted);font-size:15px}
a.open:hover{background:var(--accent-soft);color:var(--accent);text-decoration:none}
a.open-text{width:auto;padding:0 8px;font-size:12.5px;font-weight:500;gap:5px}

/* identity */
.acct{display:inline-flex;align-items:center;gap:10px;min-width:180px}
.acct-text{display:flex;flex-direction:column;line-height:1.25;min-width:0}
.acct-name{font-weight:600;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px}
.acct-handle{font-family:var(--mono);font-size:12.5px;color:var(--muted)}a.acct-handle:hover{color:var(--accent)}
.avatar{position:relative;flex:0 0 auto;width:34px;height:34px;border-radius:50%;display:inline-grid;place-items:center;font-weight:700;font-size:13px;color:#fff;background:hsl(var(--h) 45% 48%);overflow:hidden;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
.avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.badge{display:inline-grid;place-items:center;width:15px;height:15px;border-radius:50%;font-size:10px}
.badge svg{stroke-width:3}
.badge-verified{background:var(--accent);color:#fff}.badge-lock{color:var(--muted)}
.flag{display:inline-flex;align-items:center;gap:3px;font-family:var(--mono);font-size:12px;padding:2px 8px;border-radius:999px}
.flag-good{color:var(--good);background:var(--good-soft)}.flag-bad{color:var(--bad);background:var(--bad-soft)}.flag-off{color:var(--dim)}
.chips{display:flex;flex-wrap:wrap;gap:4px;max-width:360px}
.chip{display:inline-block;font-size:12px;padding:2px 9px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line);white-space:nowrap;color:var(--muted)}
.chip-removed{color:var(--bad);background:var(--bad-soft);border-color:transparent}.chip-added{color:var(--good);background:var(--good-soft);border-color:transparent}.chip-renamed,.chip-warn{color:var(--warn);background:var(--warn-soft);border-color:transparent}.chip-ok{color:var(--good);background:var(--good-soft);border-color:transparent}

/* cards */
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:14px;align-items:start}
.cards.cards-flow{display:block;columns:2 420px;column-gap:14px}
.cards-flow .card{break-inside:avoid;margin-bottom:14px}
.card{position:relative;display:flex;flex-direction:column;border:1px solid var(--line);border-radius:12px;padding:16px 18px 12px;background:var(--surface);transition:border-color .15s,box-shadow .15s}
.card:hover{border-color:color-mix(in srgb,var(--accent) 45%,var(--line));box-shadow:0 8px 24px -16px rgba(13,18,32,.35)}
.card[hidden]{display:none}
.card header{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.card header .avatar{width:38px;height:38px;font-size:14px}
.card .when{margin-left:auto;color:var(--muted);font-family:var(--mono);font-size:12px;white-space:nowrap;align-self:flex-start}
.card .tag{font-family:var(--mono);font-size:10.5px;font-weight:500;color:var(--muted);background:var(--surface-2);border:1px solid var(--line);border-radius:5px;padding:0 5px;margin-left:4px}
.card .text{white-space:pre-wrap;font-size:15px;line-height:1.55;flex:1;overflow-wrap:anywhere}
.card .text a{overflow-wrap:anywhere}
.card .rank{position:absolute;top:-11px;left:14px;background:var(--ink);color:var(--surface);font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:999px;letter-spacing:.02em}
.media{display:grid;gap:6px;margin-top:12px;border-radius:10px;overflow:hidden}
.media-2,.media-3,.media-4{grid-template-columns:1fr 1fr}
.media-item{display:block;position:relative;background:var(--surface-2);min-height:44px}
.media-item img{display:block;width:100%;max-height:320px;object-fit:cover}
.media-2 .media-item img,.media-3 .media-item img,.media-4 .media-item img{height:170px}
.media-3 .media-item:first-child{grid-row:span 2}.media-3 .media-item:first-child img{height:346px}
.media-fallback{display:none;padding:12px 14px;font-family:var(--mono);font-size:12px;color:var(--muted)}
.media-item.broken img{display:none}.media-item.broken .media-fallback,.media-video .media-fallback{display:block}
.quoted{margin:10px 0 0;font-size:13px;color:var(--muted)}
.card footer{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin-top:12px;padding-top:10px;border-top:1px solid var(--line);color:var(--muted);font-size:12.5px}
.metric{display:inline-flex;align-items:center;gap:5px}.metric b{font-weight:600;color:var(--ink)}
.card footer .spacer{flex:1}

/* quick filter chips */
.chips-row{display:flex;flex-wrap:wrap;gap:6px;margin:-2px 0 12px}
.chip-btn{font:inherit;font-size:12.5px;font-weight:500;padding:5px 11px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--muted);cursor:pointer}
.chip-btn:hover{color:var(--ink);border-color:var(--muted)}
.chip-btn[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}

/* charts */
.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:16px}
.chart-card.wide{grid-column:1/-1}
.chart-card{margin:0;padding:14px 16px 10px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2)}
.chart-card figcaption{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;margin-bottom:10px;font-size:13px}
.chart-card figcaption strong{font-weight:600;color:var(--ink)}.chart-card figcaption span{color:var(--muted)}
.chart{display:block;width:100%;height:auto;font-family:var(--mono);overflow:visible;stroke:none}
.chart text,.chart rect,.chart path,.chart circle,.chart line{stroke:none;stroke-width:0}
.chart-heatmap{max-width:880px;margin:0 auto}
.chart .ax{fill:var(--muted);font-size:11px}.chart .val{fill:var(--ink);font-size:11px;font-weight:600}
.chart-bars .ax,.chart-trend .ax,.chart-heatmap .ax{font-size:9px}.chart-bars .val,.chart-trend .val{font-size:9.5px}
.chart .axis{stroke:var(--line);stroke-width:1}
.chart .hm{fill:var(--accent)}.chart .hm-empty{fill:var(--line);fill-opacity:.6}
.chart .bar-v{fill:var(--accent);fill-opacity:.8}.chart .bar-v:hover{fill-opacity:1}
.chart .area{fill:var(--accent);fill-opacity:.12}.chart .line{fill:none;stroke:var(--accent);stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}.chart .dot{fill:var(--surface);stroke:var(--accent);stroke-width:2}

/* share */
.band .top .actions{display:flex;align-items:center;gap:8px;text-transform:none;letter-spacing:0}
.btn-share{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--band-line);background:rgba(255,255,255,.06);color:var(--band-ink);font:500 12.5px/1 var(--sans);cursor:pointer}
.btn-share:hover{background:rgba(255,255,255,.12)}

.tip{position:fixed;z-index:50;pointer-events:none;max-width:320px;background:var(--ink);color:var(--surface);padding:8px 11px;border-radius:8px;font-size:12.5px;line-height:1.45;box-shadow:0 8px 24px -8px rgba(0,0,0,.45)}
.tip .tip-head{font-weight:600;margin-bottom:2px}
.chart [data-tip]{cursor:default}.chart .hm[data-tip]:hover,.chart .bar-v[data-tip]:hover{stroke:var(--ink);stroke-width:1.5}
.colophon{margin:8px 0 0;font-size:12.5px;color:var(--muted);display:flex;flex-wrap:wrap;gap:6px 18px;justify-content:space-between}
.colophon .brand{font-family:var(--mono);letter-spacing:.06em;text-transform:uppercase}

@media (max-width:900px){.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}th{position:static}}
@media (max-width:720px){.wrap{padding:0 16px}.band{padding:24px 0 60px}.band .top{flex-wrap:wrap}.band h1{margin-top:24px}.stat .value{font-size:30px}.block{padding:16px;border-radius:12px}.toolbar{width:100%;flex-wrap:wrap}.filter{min-width:0;flex:1 1 160px}.filter kbd{display:none}.cards{grid-template-columns:1fr}.scroll{margin:0 -16px;padding:0 16px}}
@media print{body{background:#fff}.band{background:#fff!important;color:#000;padding:0 0 12px;border-bottom:2px solid #000}.band .subtitle,.band .top,.stat .label,.breakdown .legend{color:#444}.stat .value{color:#000!important}.breakdown .key b{color:#000}.block{break-inside:avoid;box-shadow:none}.toolbar,.shown,.open,.subnav,.chips-row,.btn-share{display:none}.content{margin-top:16px!important}}
`;

const XU_HTML_JS = `
(function(){
  function parseNum(s){var n=parseFloat(String(s).replace(/[^0-9.\\-]/g,""));return isNaN(n)?-Infinity:n}
  function updateShown(id,visible,total){var el=document.querySelector('[data-shown="'+id+'"]');if(el)el.textContent=visible===total?"":"Showing "+visible.toLocaleString()+" of "+total.toLocaleString()}
  document.querySelectorAll("th[data-key]").forEach(function(th){
    var table=th.closest("table"),tbody=table.tBodies[0];
    function sort(){var idx=th.cellIndex,type=th.dataset.type,dir=th.getAttribute("aria-sort")==="descending"?"ascending":"descending";
      table.querySelectorAll("th").forEach(function(o){o.setAttribute("aria-sort","none")});th.setAttribute("aria-sort",dir);
      var rows=Array.prototype.slice.call(tbody.rows);rows.sort(function(a,b){var x=a.cells[idx].dataset.sort,y=b.cells[idx].dataset.sort;
        if(type==="num"){x=parseNum(x);y=parseNum(y);return x-y}if(x===""&&y!=="")return -1;if(y===""&&x!=="")return 1;return String(x).localeCompare(String(y),undefined,{numeric:true,sensitivity:"base"})});
      if(dir==="descending")rows.reverse();rows.forEach(function(r){tbody.appendChild(r)})}
    th.addEventListener("click",sort);th.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();sort()}})});
  function visibleRows(id){var t=document.querySelector('table[data-table="'+id+'"]');return t?Array.prototype.filter.call(t.tBodies[0].rows,function(r){return !r.hidden}):[]}
  function visibleCards(id){return Array.prototype.filter.call(document.querySelectorAll('[data-cards="'+id+'"] .card'),function(c){return !c.hidden})}
  var activeChip={};
  function chipMatches(row,chip){var raw=row.getAttribute("data-c-"+chip.key);if(raw===null)return true;
    switch(chip.op){case "gte":return parseNum(raw)>=chip.value;case "lt":return raw!==""&&parseNum(raw)<chip.value;case "eq":return raw===String(chip.value);case "empty":return raw==="";
      case "daysLt":case "daysGte":{if(!raw)return false;var days=(Date.now()-new Date(raw).getTime())/86400000;return chip.op==="daysLt"?days<chip.value:days>=chip.value}default:return true}}
  function applyFilters(id,kind){var input=document.querySelector('input[data-filter="'+id+'"]'),q=input?input.value.trim().toLowerCase():"",chip=activeChip[id]||null,shown=0,
      items=kind==="table"?document.querySelector('table[data-table="'+id+'"]').tBodies[0].rows:document.querySelectorAll('[data-cards="'+id+'"] .card');
    for(var i=0;i<items.length;i++){var hay=kind==="table"?items[i].textContent:items[i].dataset.search;var hit=(!q||hay.toLowerCase().indexOf(q)>-1)&&(!chip||chipMatches(items[i],chip));items[i].hidden=!hit;if(hit)shown++}updateShown(id,shown,items.length)}
  document.querySelectorAll("input[data-filter]").forEach(function(input){var id=input.dataset.filter,kind=input.dataset.kind;input.addEventListener("input",function(){applyFilters(id,kind)})});
  document.querySelectorAll(".chips-row").forEach(function(rowEl){var id=rowEl.dataset.chips;
    rowEl.querySelectorAll(".chip-btn").forEach(function(btn){btn.addEventListener("click",function(){var on=btn.getAttribute("aria-pressed")==="true";
      rowEl.querySelectorAll(".chip-btn").forEach(function(b){b.setAttribute("aria-pressed","false")});
      if(on){activeChip[id]=null}else{btn.setAttribute("aria-pressed","true");activeChip[id]=JSON.parse(btn.dataset.chip)}applyFilters(id,"table")})})});
  // Chart tooltips: a floating box that follows the pointer over any [data-tip].
  var tip=document.createElement("div");tip.className="tip";tip.hidden=true;document.body.appendChild(tip);
  function placeTip(e){var x=e.clientX+14,y=e.clientY+16;var r=tip.getBoundingClientRect();if(x+r.width>window.innerWidth-8)x=e.clientX-r.width-14;if(y+r.height>window.innerHeight-8)y=e.clientY-r.height-12;tip.style.left=x+"px";tip.style.top=y+"px"}
  document.addEventListener("mouseover",function(e){var el=e.target.closest?e.target.closest("[data-tip]"):null;if(!el)return;tip.innerHTML="";String(el.dataset.tip).split("\\n").forEach(function(line,i){var d=document.createElement("div");if(i===0)d.className="tip-head";d.textContent=line;tip.appendChild(d)});tip.hidden=false;placeTip(e)});
  document.addEventListener("mousemove",function(e){if(!tip.hidden)placeTip(e)});
  document.addEventListener("mouseout",function(e){var el=e.target.closest?e.target.closest("[data-tip]"):null;if(el&&!(e.relatedTarget&&el.contains(e.relatedTarget)))tip.hidden=true});
  var shareData=null;try{shareData=JSON.parse(document.getElementById("xu-share").textContent)}catch(e){}
  function wrapText(ctx,text,maxWidth,maxLines){var words=text.split(" "),lines=[],line="";for(var i=0;i<words.length;i++){var t=line?line+" "+words[i]:words[i];if(ctx.measureText(t).width>maxWidth&&line){lines.push(line);line=words[i]}else line=t}if(line)lines.push(line);
    if(lines.length>maxLines){lines=lines.slice(0,maxLines);lines[maxLines-1]=lines[maxLines-1].replace(/\\s+\\S*$/,"")+"…"}return lines}
  function drawShareCard(d){var W=1200,H=630,c=document.createElement("canvas");c.width=W;c.height=H;var x=c.getContext("2d");
    var bg=x.createLinearGradient(0,0,0,H);bg.addColorStop(0,"#161d33");bg.addColorStop(1,"#0d1220");x.fillStyle=bg;x.fillRect(0,0,W,H);
    var glow=x.createRadialGradient(140,-40,10,140,-40,620);glow.addColorStop(0,"rgba(120,96,255,.45)");glow.addColorStop(1,"rgba(120,96,255,0)");x.fillStyle=glow;x.fillRect(0,0,W,H);
    var glow2=x.createRadialGradient(1120,80,10,1120,80,520);glow2.addColorStop(0,"rgba(46,196,182,.25)");glow2.addColorStop(1,"rgba(46,196,182,0)");x.fillStyle=glow2;x.fillRect(0,0,W,H);
    var mono='600 15px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',sans='-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif';
    x.fillStyle="#b3a6ff";x.fillRect(64,60,12,12);x.fillStyle="#8f9ab3";x.font=mono;x.textBaseline="middle";x.fillText(("x-utils · "+d.tool).toUpperCase(),88,66);x.textAlign="right";x.fillText(d.date,W-64,66);x.textAlign="left";
    x.fillStyle="#f4f6fb";x.font="700 58px "+sans;x.textBaseline="alphabetic";var lines=wrapText(x,d.title,W-128,2),y=170;lines.forEach(function(l){x.fillText(l,64,y);y+=66});
    if(d.subtitle){x.fillStyle="#8f9ab3";x.font="400 24px "+sans;wrapText(x,d.subtitle,W-128,1).forEach(function(l){x.fillText(l,64,y+6)});y+=40}
    var stats=(d.stats||[]).slice(0,4),sy=Math.max(y+56,380),sw=(W-128)/Math.max(stats.length,1);x.strokeStyle="rgba(255,255,255,.14)";x.lineWidth=1;x.beginPath();x.moveTo(64,sy-28);x.lineTo(W-64,sy-28);x.stroke();
    var tones={good:"#5ee0a8",bad:"#ff9a6c",accent:"#b3a6ff"};
    stats.forEach(function(s,i){var sx=64+i*sw;x.fillStyle=tones[s.tone]||"#f4f6fb";x.font="600 54px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";var v=String(s.value);if(v.length>7)x.font="600 38px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";x.fillText(v,sx,sy+30);x.fillStyle="#8f9ab3";x.font="400 19px "+sans;x.fillText(s.label,sx,sy+66);
      if(i){x.beginPath();x.moveTo(sx-20,sy-12);x.lineTo(sx-20,sy+72);x.stroke()}});
    if(d.breakdown&&d.breakdown.length){var total=d.breakdown.reduce(function(a,p){return a+(p.value||0)},0);if(total){var bx=64,by=H-90,bw=W-128;d.breakdown.forEach(function(p){if(!p.value)return;var w=bw*(p.value/total)-3;x.fillStyle=tones[p.tone]||"rgba(255,255,255,.35)";x.beginPath();x.roundRect?x.roundRect(bx,by,Math.max(w,4),12,6):x.rect(bx,by,Math.max(w,4),12);x.fill();bx+=w+3});
      var lx=64;x.font="400 17px "+sans;d.breakdown.forEach(function(p){x.fillStyle=tones[p.tone]||"rgba(255,255,255,.5)";x.fillRect(lx,by+30,10,10);x.fillStyle="#c7cede";var label=p.label+"  "+p.value+"  ·  "+Math.round(100*(p.value||0)/total)+"%";x.fillText(label,lx+18,by+40);lx+=x.measureText(label).width+48})}}
    x.fillStyle="#6b7590";x.font="400 16px "+sans;x.textAlign="right";x.fillText("Made with x-utils · free · runs in your browser · x-utils.com",W-64,H-32);x.textAlign="left";
    return c}
  document.querySelectorAll("button[data-share]").forEach(function(btn){btn.addEventListener("click",function(){if(!shareData)return;var canvas=drawShareCard(shareData),label=btn.querySelector("span"),orig=label.textContent;
    canvas.toBlob(function(blob){if(!blob)return;var url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=(document.title||"x-utils").replace(/[^a-z0-9]+/gi,"-").toLowerCase()+"_share.png";document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(url);a.remove()},1000);label.textContent="Saved";setTimeout(function(){label.textContent=orig},1600)},"image/png")})});
  document.addEventListener("keydown",function(e){if(e.key!=="/"||e.metaKey||e.ctrlKey||e.altKey)return;var t=e.target;if(t&&(t.tagName==="INPUT"||t.tagName==="TEXTAREA"))return;
    var inputs=Array.prototype.slice.call(document.querySelectorAll("input[data-filter]")),y=window.scrollY+80,target=inputs.filter(function(i){return i.getBoundingClientRect().top+window.scrollY<=y}).pop()||inputs[0];if(target){e.preventDefault();target.focus();target.select()}});
  function csvCell(v){v=v==null?"":String(v);if(/^[=+\\-@\\t\\r]/.test(v))v="'"+v;return /[",\\n\\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}
  document.querySelectorAll("button[data-csv]").forEach(function(btn){var id=btn.dataset.csv,kind=btn.dataset.kind;
    btn.addEventListener("click",function(){var lines=[];
      if(kind==="table"){var table=document.querySelector('table[data-table="'+id+'"]'),heads=Array.prototype.map.call(table.tHead.rows[0].cells,function(th){return th.dataset.key});lines.push(heads.map(csvCell).join(","));
        visibleRows(id).forEach(function(r){lines.push(Array.prototype.map.call(r.cells,function(td){var key=td.dataset.key;if(key==="handle"){var h=td.querySelector(".acct-handle");return csvCell(h?h.textContent.replace(/^@/,""):"")}if(key==="url"){var a=td.querySelector("a");return csvCell(a?a.href:"")}return csvCell(td.dataset.sort)}).join(","))})}
      else{lines.push("author,date,text,likes,reposts,replies,views,url");visibleCards(id).forEach(function(c){var h=c.querySelector(".acct-handle"),t=c.querySelector("time"),m=Array.prototype.map.call(c.querySelectorAll(".metric b"),function(b){return b.textContent.replace(/[^0-9.]/g,"")});while(m.length<4)m.push("");lines.push([h?h.textContent.replace(/^@/,""):"",t?t.getAttribute("datetime"):"",c.querySelector(".text").innerText,m[0],m[1],m[2],m[3],c.dataset.url].map(csvCell).join(","))})}
      var blob=new Blob(["\\ufeff"+lines.join("\\n")],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=(document.title||"x-utils").replace(/[^a-z0-9]+/gi,"-").toLowerCase()+"_"+id+".csv";document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(url);a.remove()},1000)})});
  document.querySelectorAll("button[data-copy]").forEach(function(btn){var id=btn.dataset.copy,kind=btn.dataset.kind,label=btn.querySelector("span"),original=label.textContent;
    btn.addEventListener("click",function(){var text;if(kind==="table"){text=visibleRows(id).map(function(r){var h=r.querySelector(".acct-handle");return h?h.textContent.trim():""}).filter(Boolean).join("\\n")}else{text=visibleCards(id).map(function(c){return c.dataset.url}).filter(Boolean).join("\\n")}
      var n=text?text.split("\\n").length:0;function done(ok){label.textContent=ok?"Copied "+n:"Copy failed";btn.classList.toggle("done",ok);setTimeout(function(){label.textContent=original;btn.classList.remove("done")},1800)}
      if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){done(true)},function(){done(false)})}else{var ta=document.createElement("textarea");ta.value=text;document.body.appendChild(ta);ta.select();var ok=false;try{ok=document.execCommand("copy")}catch(e){}ta.remove();done(ok)}})});
})();
`;

// Assembles the full document.
// report = { tool, title, subtitle, generatedAt, stats: [{ label, value, tone?, href? }],
//            breakdown: [{ label, value, tone }], sections: [html], notes: [string] }
function renderHtmlReport(report) {
  // When one figure is long, shrink all numeric figures so the strip stays on one baseline.
  const anyLong = (report.stats || []).some((s) => typeof s.value === "number" && fmtInt(s.value).length > 6);
  const stats = (report.stats || [])
    .map((s) => {
      const isNumber = typeof s.value === "number";
      const text = isNumber ? fmtInt(s.value) : String(s.value);
      const sizeClass = isNumber ? (anyLong ? " is-long" : "") : " is-text";
      const inner = `<span class="value${sizeClass}">${htmlEscape(text)}</span><span class="label">${htmlEscape(s.label)}</span>`;
      const tone = s.tone ? ` tone-${htmlEscape(s.tone)}` : "";
      return s.href ? `<a class="stat${tone}" href="${htmlEscape(s.href)}">${inner}</a>` : `<div class="stat${tone}">${inner}</div>`;
    })
    .join("");
  const generatedAt = report.generatedAt || new Date().toISOString();
  const subnav = htmlSubnav(report.sections || [], report.tool);
  const shareData = {
    tool: report.tool,
    title: report.title,
    subtitle: report.subtitle || "",
    date: fmtDate(generatedAt),
    stats: (report.stats || []).slice(0, 4).map((s) => ({ label: s.label, value: typeof s.value === "number" ? fmtInt(s.value) : String(s.value), tone: s.tone || null })),
    breakdown: (report.breakdown || []).map((p) => ({ label: p.label, value: p.value || 0, tone: p.tone || null })),
  };
  const shareJson = JSON.stringify(shareData).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="${XU_FAVICON}">
<title>${htmlEscape(report.title)}</title>
<style>${XU_HTML_CSS}</style>
</head>
<body class="${subnav ? "has-subnav" : ""}">
<header class="band${subnav ? " has-nav" : ""}">
  <div class="wrap">
    <div class="top"><span class="crumbs"><a class="brand" href="https://x-utils.com/" target="_blank" rel="noopener noreferrer" title="x-utils home"><i></i>x-utils</a><span class="crumb-tool">${htmlEscape(report.tool)}</span></span><span class="actions"><span>${htmlEscape(fmtDate(generatedAt))}</span>${report.share === false ? "" : `<button type="button" class="btn-share" data-share title="Download a 1200×630 image of this summary to share">${XU_ICONS.download}<span>Share image</span></button>`}</span></div>
    <h1>${htmlEscape(report.title)}</h1>
    ${report.subtitle ? `<p class="subtitle">${htmlEscape(report.subtitle)}</p>` : ""}
    ${stats ? `<nav class="stats" aria-label="Summary">${stats}</nav>` : ""}
    ${report.breakdown ? htmlBreakdown(report.breakdown) : ""}
    ${(report.notes || []).map((n) => `<p class="band-note">${htmlEscape(n)}</p>`).join("")}
  </div>
</header>
${subnav}
<main class="wrap content">
  ${(report.sections || []).join("\n")}
  <p class="colophon"><span class="brand"><a href="https://x-utils.com/" target="_blank" rel="noopener noreferrer">x-utils</a> ${htmlEscape(XU_VERSION)}</span><span>Generated ${htmlEscape(generatedAt.replace("T", " ").slice(0, 16))} UTC in your own browser session. Data as shown by x.com at that moment; nothing was sent anywhere.</span></p>
</main>
<script type="application/json" id="xu-share">${shareJson}</script>
<script>${XU_HTML_JS}</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Inline SVG charts for the HTML report. No libraries; colours come from the
// report's CSS variables so every chart follows light and dark mode.
// ---------------------------------------------------------------------------

const XU_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Aggregates posts into a 7x24 grid of { posts, total, avg } (local time).
// Rows follow XU_DAY_LABELS (Monday first).
function postingHeatmap(rows, metric = "interactions") {
  const cells = XU_DAY_LABELS.map(() => Array.from({ length: 24 }, () => ({ posts: 0, total: 0, avg: 0 })));
  for (const r of rows) {
    if (!r.createdAt) continue;
    const d = new Date(r.createdAt);
    const day = (d.getDay() + 6) % 7; // Sunday(0) -> 6
    const cell = cells[day][d.getHours()];
    cell.posts++;
    cell.total += r[metric] || 0;
  }
  let max = 0;
  for (const row of cells) for (const c of row) {
    c.avg = c.posts ? c.total / c.posts : 0;
    if (c.avg > max) max = c.avg;
  }
  return { cells, max };
}

function svgHeatmap(heatmap, { metricLabel = "interactions per post" } = {}) {
  const cell = 26;
  const gap = 4;
  const left = 40;
  const top = 22;
  const width = left + 24 * (cell + gap);
  const height = top + 7 * (cell + gap) + 26;
  const parts = [];
  for (let h = 0; h < 24; h += 3) parts.push(`<text class="ax" x="${left + h * (cell + gap) + cell / 2}" y="14" text-anchor="middle">${String(h).padStart(2, "0")}</text>`);
  heatmap.cells.forEach((row, day) => {
    parts.push(`<text class="ax" x="${left - 10}" y="${top + day * (cell + gap) + cell / 2 + 4}" text-anchor="end">${XU_DAY_LABELS[day]}</text>`);
    row.forEach((c, hour) => {
      const x = left + hour * (cell + gap);
      const y = top + day * (cell + gap);
      const opacity = c.posts ? 0.18 + 0.82 * (heatmap.max ? c.avg / heatmap.max : 0) : 0;
      const slot = `${XU_DAY_LABELS[day]} ${String(hour).padStart(2, "0")}:00 to ${String((hour + 1) % 24).padStart(2, "0")}:00`;
      const tip = c.posts ? `${slot}\n${c.posts} post${c.posts === 1 ? "" : "s"} published in this slot\n${fmtInt(Math.round(c.avg))} ${metricLabel} on average${heatmap.max && c.avg === heatmap.max ? "\nYour best slot" : ""}` : `${slot}\nNo posts in this slot`;
      parts.push(`<rect class="${c.posts ? "hm" : "hm hm-empty"}" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="5"${c.posts ? ` fill-opacity="${opacity.toFixed(2)}"` : ""} data-tip="${htmlEscape(tip)}"><title>${htmlEscape(tip.replace(/\n/g, " · "))}</title></rect>`);
    });
  });
  const ly = top + 7 * (cell + gap) + 16;
  parts.push(`<text class="ax" x="${left}" y="${ly}">fewer ${htmlEscape(metricLabel)}</text>`);
  for (let i = 0; i < 5; i++) parts.push(`<rect class="hm" x="${width - 20 - (4 - i) * 18}" y="${ly - 11}" width="14" height="14" rx="3" fill-opacity="${(0.18 + 0.82 * (i / 4)).toFixed(2)}"/>`);
  parts.push(`<text class="ax" x="${width - 20 - 5 * 18 - 6}" y="${ly}" text-anchor="end">more</text>`);
  return `<svg class="chart chart-heatmap" viewBox="0 0 ${width} ${height}" role="img" aria-label="Posting heatmap by weekday and hour">${parts.join("")}</svg>`;
}

// Vertical bars in the given order. points = [{ label, value, title }].
// Heights use a square-root scale so one viral post does not flatten the rest.
// One bar per post for svgBars, with a three-line tooltip: date and the
// charted metric, the other counters, then an excerpt of the post.
function postBarPoints(rows, metric) {
  const excerpt = (t) => { const text = (t.text || "").replace(/\s+/g, " ").trim(); return text.length > 110 ? `${text.slice(0, 110)}…` : text || "(no text)"; };
  const views = (t) => (t.views ? `${fmtInt(t.views)} views` : "no view count");
  return rows.map((t) => {
    const head = metric === "views" ? `${fmtDate(t.createdAt)} · ${views(t)}` : `${fmtDate(t.createdAt)} · ${fmtInt(t.likes || 0)} likes`;
    const detail = metric === "views"
      ? `${fmtInt(t.likes || 0)} likes · ${t.engagementRate === null || t.engagementRate === undefined ? "no engagement rate" : `${t.engagementRate}% engagement`}`
      : `${fmtInt(t.retweets || 0)} reposts · ${fmtInt(t.replies || 0)} replies · ${views(t)}`;
    return { label: fmtDate(t.createdAt), value: (metric === "views" ? t.views : t.likes) || 0, tip: `${head}\n${detail}\n${excerpt(t)}` };
  });
}

function svgBars(points, { valueLabel = "" } = {}) {
  const n = points.length;
  if (!n) return "";
  const width = 720;
  const height = 150;
  const top = 18;
  const bottom = 26;
  const plotH = height - top - bottom;
  const max = Math.max(1, ...points.map((p) => p.value || 0));
  const slot = width / n;
  const barW = Math.max(2, Math.min(28, slot * 0.68));
  const parts = [`<line class="axis" x1="0" y1="${height - bottom + 0.5}" x2="${width}" y2="${height - bottom + 0.5}"/>`];
  parts.push(`<text class="ax" x="0" y="12">${htmlEscape(fmtInt(max))}${valueLabel ? ` ${htmlEscape(valueLabel)}` : ""} · square-root scale</text>`);
  points.forEach((p, i) => {
    const h = Math.max(1, Math.sqrt((p.value || 0) / max) * plotH);
    const x = i * slot + (slot - barW) / 2;
    const tip = p.tip || p.title || `${p.label}\n${fmtInt(p.value)}${valueLabel ? ` ${valueLabel}` : ""}`;
    parts.push(`<rect class="bar-v" x="${x.toFixed(1)}" y="${(height - bottom - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2" data-tip="${htmlEscape(tip)}"><title>${htmlEscape(tip.replace(/\n/g, " · "))}</title></rect>`);
  });
  const first = points[0].label;
  const last = points[n - 1].label;
  if (first) parts.push(`<text class="ax" x="0" y="${height - 8}">${htmlEscape(first)}</text>`);
  if (last && n > 1) parts.push(`<text class="ax" x="${width}" y="${height - 8}" text-anchor="end">${htmlEscape(last)}</text>`);
  return `<svg class="chart chart-bars" viewBox="0 0 ${width} ${height}" role="img" aria-label="Bar chart">${parts.join("")}</svg>`;
}

// Log-scale buckets for follower counts.
const XU_SIZE_BUCKETS = [
  { label: "< 100", min: 0, max: 100 },
  { label: "100 – 1k", min: 100, max: 1000 },
  { label: "1k – 10k", min: 1000, max: 10000 },
  { label: "10k – 100k", min: 10000, max: 100000 },
  { label: "100k+", min: 100000, max: Infinity },
];

function sizeHistogram(users, key = "followers") {
  const buckets = XU_SIZE_BUCKETS.map((b) => ({ ...b, count: 0 }));
  let unknown = 0;
  for (const u of users) {
    const v = u[key];
    if (typeof v !== "number") {
      unknown++;
      continue;
    }
    const b = buckets.find((x) => v >= x.min && v < x.max);
    if (b) b.count++;
  }
  return { buckets, unknown };
}

function svgHistogram(hist, { noun = "accounts" } = {}) {
  if (!hist.buckets.some((b) => b.count > 0)) return ""; // nothing known, draw nothing
  const width = 520;
  const height = 170;
  const top = 26;
  const bottom = 30;
  const plotH = height - top - bottom;
  const n = hist.buckets.length;
  const slot = width / n;
  const barW = slot * 0.62;
  const max = Math.max(1, ...hist.buckets.map((b) => b.count));
  const parts = [`<line class="axis" x1="0" y1="${height - bottom + 0.5}" x2="${width}" y2="${height - bottom + 0.5}"/>`];
  hist.buckets.forEach((b, i) => {
    const h = b.count ? Math.max(2, (b.count / max) * plotH) : 0;
    const x = i * slot + (slot - barW) / 2;
    const tip = `${b.label} followers\n${fmtInt(b.count)} ${noun}`;
    parts.push(`<rect class="bar-v" x="${x.toFixed(1)}" y="${(height - bottom - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="4" data-tip="${htmlEscape(tip)}"><title>${htmlEscape(tip.replace(/\n/g, " · "))}</title></rect>`);
    parts.push(`<text class="val" x="${(i * slot + slot / 2).toFixed(1)}" y="${(height - bottom - h - 7).toFixed(1)}" text-anchor="middle">${fmtInt(b.count)}</text>`);
    parts.push(`<text class="ax" x="${(i * slot + slot / 2).toFixed(1)}" y="${height - 10}" text-anchor="middle">${htmlEscape(b.label)}</text>`);
  });
  return `<svg class="chart chart-hist" viewBox="0 0 ${width} ${height}" role="img" aria-label="Distribution of account sizes">${parts.join("")}</svg>`;
}

// Line with dots for a short time series. points = [{ date (ISO), value }].
function svgTrend(points, { valueLabel = "" } = {}) {
  const pts = points.filter((p) => typeof p.value === "number").slice(-60);
  if (pts.length < 2) return "";
  const width = 720;
  const height = 170;
  const left = 8;
  const right = 8;
  const top = 20;
  const bottom = 28;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const values = pts.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i) => left + (i / (pts.length - 1)) * plotW;
  const y = (v) => top + plotH - ((v - min) / span) * plotH;
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(pts.length - 1).toFixed(1)},${(top + plotH).toFixed(1)} L${x(0).toFixed(1)},${(top + plotH).toFixed(1)} Z`;
  const parts = [`<path class="area" d="${area}"/>`, `<path class="line" d="${path}"/>`];
  pts.forEach((p, i) => {
    const delta = i ? p.value - pts[i - 1].value : null;
    const tip = `${fmtDate(p.date)}\n${fmtInt(p.value)}${valueLabel ? ` ${valueLabel}` : ""}${delta === null ? "" : `\n${delta >= 0 ? "+" : ""}${fmtInt(delta)} since the previous snapshot`}`;
    parts.push(`<circle class="dot" cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="5" data-tip="${htmlEscape(tip)}"><title>${htmlEscape(tip.replace(/\n/g, " · "))}</title></circle>`);
  });
  parts.push(`<text class="val" x="${x(pts.length - 1).toFixed(1)}" y="${(y(pts[pts.length - 1].value) - 10).toFixed(1)}" text-anchor="end">${fmtInt(pts[pts.length - 1].value)}</text>`);
  parts.push(`<text class="val" x="${x(0).toFixed(1)}" y="${(y(pts[0].value) - 10).toFixed(1)}">${fmtInt(pts[0].value)}</text>`);
  parts.push(`<text class="ax" x="${left}" y="${height - 8}">${htmlEscape(fmtDate(pts[0].date))}</text>`);
  parts.push(`<text class="ax" x="${width - right}" y="${height - 8}" text-anchor="end">${htmlEscape(fmtDate(pts[pts.length - 1].date))}</text>`);
  return `<svg class="chart chart-trend" viewBox="0 0 ${width} ${height}" role="img" aria-label="Trend over time">${parts.join("")}</svg>`;
}

// A section holding one or more chart cards. charts = [{ title, svg, caption }].
function htmlChartSection({ id, title, charts, note = "" }) {
  const cards = charts
    .filter((c) => c && c.svg)
    .map((c) => `<figure class="chart-card${/chart-(heatmap|bars|trend)/.test(c.svg) ? " wide" : ""}"><figcaption><strong>${htmlEscape(c.title)}</strong>${c.caption ? `<span>${htmlEscape(c.caption)}</span>` : ""}</figcaption>${c.svg}</figure>`)
    .join("");
  if (!cards) return "";
  return `
<section class="block" id="${htmlEscape(id)}">
  <header class="block-head"><h2>${htmlEscape(title)}<span class="count num">${charts.filter((c) => c && c.svg).length}</span></h2></header>
  ${note ? `<p class="note">${htmlEscape(note)}</p>` : ""}
  <div class="charts">${cards}</div>
</section>`;
}

// ==== Fans ====
log.banner("fans");
requireXHost();
requirePage([/^\/[A-Za-z0-9_]+\/(followers|verified_followers|followers_you_follow)$/], "https://x.com/<your_handle>/followers");

const owner = pathHandle();
const me = myHandle();
if (me && owner && me.toLowerCase() !== owner.toLowerCase()) {
  log.warn(`You are viewing @${owner}'s followers, not your own (@${me}). "You follow" still refers to you.`);
}

const users = await collectUserList({
  label: "followers",
  delayMs: CONFIG.scrollDelayMs,
  stagnantLimit: CONFIG.stagnantRounds,
  maxItems: CONFIG.maxUsers,
  refetchFirstPage: CONFIG.refetchFirstPage,
});

const fans = users.filter((u) => u.youFollow === false);
const mutuals = users.filter((u) => u.youFollow === true);
const unknown = users.filter((u) => u.youFollow === null);

console.log("");
log.ok(`Followers: ${users.length} · Mutuals: ${mutuals.length} · You do not follow back: ${fans.length}${unknown.length ? ` · Unknown: ${unknown.length}` : ""}`);
printTable(fans, ["handle", "name", "followers", "tweets", "createdAt", "bio"], 30);

const rows = usersToRows(fans, ["handle", "name", "followers", "following", "tweets", "createdAt", "verified", "protected", "bio", "url"]);
const base = outputBaseName("fans", owner);
await writeOutputs(
  base,
  {
    html: renderHtmlReport({
      tool: "fans",
      title: `Followers of @${owner} not followed back`,
      subtitle: `${users.length} followers, ${mutuals.length} mutual, ${fans.length} you do not follow back.`,
      stats: [
        { label: "Followers", value: users.length },
        { label: "Mutuals", value: mutuals.length, tone: "good", href: "#mutuals" },
        { label: "You do not follow back", value: fans.length, tone: "accent", href: "#fans" },
      ],
      notes: [partialListNote(users, "followers")].filter(Boolean),
      breakdown: [
        { label: "Mutuals", value: mutuals.length, tone: "good" },
        { label: "Not followed back", value: fans.length, tone: "accent" },
        { label: "Unknown", value: unknown.length, tone: "neutral" },
      ],
      sections: [
        htmlTableSection({ id: "fans", title: "Follow you, not followed back", columns: ["handle", "name", "followers", "following", "tweets", "createdAt", "verified", "bio", "url"], rows: fans, empty: "You follow back every follower.", chips: XU_USER_CHIPS }),
        htmlChartSection({
          id: "sizes",
          title: "Who they are",
          charts: [{ title: "Size of the accounts you do not follow back", caption: "by follower count", svg: svgHistogram(sizeHistogram(fans), { noun: "accounts" }) }],
        }),
        htmlTableSection({ id: "mutuals", title: "Mutuals", columns: ["handle", "name", "followers", "tweets", "createdAt", "url"], rows: mutuals, chips: XU_USER_CHIPS }),
      ],
    }),
    csv: toCsv(rows),
    json: toJson({ generatedAt: new Date().toISOString(), owner, followers: users.length, mutuals: mutuals.length, fans: rows }),
  },
  CONFIG.outputs,
  { clipboard: CONFIG.copyToClipboard },
);

if (CONFIG.saveSnapshot && owner && currentPath().endsWith("/followers")) {
  saveSnapshot(snapshotKey("followers", owner), makeSnapshot("followers", owner, users));
  log.step("Followers list stored locally for followers-diff.");
}

publishResult("fans", { owner, users, fans, mutuals, unknown }, `${users.length} followers · ${mutuals.length} mutuals · ${fans.length} not followed back`);

})().catch((err) => {
  if (!/^x-utils:/.test(String(err && err.message))) {
    console.error("%c✗ x-utils", "color:#f4212e;font-weight:600", "Failed:", err);
    try {
      const panel = document.querySelector("[data-xu-overlay]");
      if (panel) panel.firstChild.nextSibling.textContent = "Failed: " + (err && err.message ? err.message : err);
    } catch {}
  }
});
