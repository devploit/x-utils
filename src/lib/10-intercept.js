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
          noteRateLimit(res.status, (name) => res.headers.get(name));
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
          noteRateLimit(this.status, (name) => this.getResponseHeader(name));
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

// Records X's 429 answers together with the exact reset time it announces in
// x-rate-limit-reset (epoch seconds), so waits can be precise.
function noteRateLimit(status, getHeader) {
  if (status !== 429) return;
  let resetAt = null;
  let limit = null;
  try {
    const reset = Number(getHeader("x-rate-limit-reset"));
    if (reset > 0) resetAt = reset * 1000;
    limit = getHeader("x-rate-limit-limit");
  } catch {
    /* header not exposed */
  }
  xuDebug.rateLimit = { at: Date.now(), resetAt, limit, count: ((xuDebug.rateLimit && xuDebug.rateLimit.count) || 0) + 1 };
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
async function replayListPages(operationNames, needMore, { maxPages = 6, delayMs = 700 } = {}) {
  const name = operationNames.find((n) => xuRequests.has(n));
  xuDebug.replay = { candidates: operationNames, observed: [...xuRequests.keys()], used: name || null, pages: [] };
  if (!name) return 0;
  const req = xuRequests.get(name);
  let cursor;
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
