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
