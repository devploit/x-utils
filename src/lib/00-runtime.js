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
  let nudges = 0;
  let quotaWaits = 0;
  let stopReason = null;
  const finish = (reason, count) => {
    xuDebug.scroll = { ticks, stopReason: reason, collected: count, quotaWaits, retries, nudges };
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
      // Half-way through the patience budget, scroll back up a little and down
      // again: X's "load more" sentinel sometimes needs to re-enter the viewport.
      if (stagnant === Math.ceil(stagnantLimit / 2)) {
        nudges++;
        if (box) box.scrollBy(0, -Math.max(300, box.clientHeight * 0.5));
        else window.scrollBy(0, -Math.max(300, window.innerHeight * 0.5));
        await sleep(400);
      }
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
