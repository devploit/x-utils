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
  if (op) {
    xuDebug.responses[op] = (xuDebug.responses[op] || 0) + 1;
    if (status !== 200) xuDebug.responses[`${op}:${status}`] = (xuDebug.responses[`${op}:${status}`] || 0) + 1;
  }
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
// `progress()` returns how much has been collected; two pages in a row without
// progress mean X is repeating itself, so the loop stops instead of burning quota.
async function replayListPages(operationNames, needMore, { maxPages = 6, delayMs = 700, fromCursor = false, progress = null, label = "items" } = {}) {
  const name = operationNames.find((n) => xuRequests.has(n));
  xuDebug.replay = { candidates: operationNames, observed: [...xuRequests.keys()], used: name || null, fromCursor: !!(fromCursor && name && xuCursors.has(name)), pages: [] };
  if (!name) return 0;
  const req = xuRequests.get(name);
  let cursor = fromCursor && xuCursors.has(name) ? xuCursors.get(name) : undefined;
  let waited = false;
  let lastProgress = progress ? progress() : null;
  let flatPages = 0;
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
    if (response.status === 429 && !waited) {
      // Same quota as the page itself: honour the reset X announced, once, then retry this cursor.
      waited = true;
      const wait = rateLimitWait(0, { blindMs: 60000 });
      log.warn(`X rate-limited the direct requests after ${pages} page${pages === 1 ? "" : "s"}. Waiting ${fmtDuration(Math.round(wait / 1000))} for the reset, then continuing.`);
      await countdown(wait, (left) => xuOverlay.count(`Rate limited by X · resuming in ${fmtDuration(left)}`));
      xuDebug.rateLimit = null;
      pages--;
      continue;
    }
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
    const nextCursor = findBottomCursor(json);
    // Give the interceptor's own clone().text() chain time to deliver the page.
    await sleep(delayMs);
    if (progress) {
      const now = progress();
      flatPages = now > lastProgress ? 0 : flatPages + 1;
      lastProgress = now;
      // Keep the panel and console alive between pages: this can take minutes.
      const quota = xuDebug.quota[name];
      const left = quota && typeof quota.remaining === "number" ? ` · ${quota.remaining} request${quota.remaining === 1 ? "" : "s"} left before X's limit` : "";
      xuOverlay.count(`Working… page ${pages} requested · ${now.toLocaleString("en-US")} ${label} so far${left}`);
      if (pages % 5 === 0) log.step(`Still working: ${pages} pages requested, ${now} ${label} so far${left}.`);
      if (flatPages >= 2) {
        xuDebug.replay.stoppedBy = "no progress";
        log.step(`X's last two pages added nothing new; the timeline has no more to give.`);
        break;
      }
    }
    if (!nextCursor || nextCursor === cursor) {
      xuDebug.replay.stoppedBy = nextCursor ? "repeated cursor" : "no cursor";
      break;
    }
    cursor = nextCursor;
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
