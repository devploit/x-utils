// @name Inactive following
// @description Finds the accounts you follow that have not posted in months (or ever). By default it checks only the ones that do not follow you back, one profile request per account.
// @page https://x.com/<your_handle>/following
// == CONFIG ==
const CONFIG = {
  inactiveMonths: 6, // an account is inactive when its newest post is older than this
  onlyNonFollowers: true, // only accounts that do not follow you back (the usual clean-up target). Set to false to check everyone you follow, which takes several times longer
  maxProfiles: Infinity, // cap the number of profiles to check (list order)
  probeDelayMs: 700, // pause between profile requests; raise it if X starts refusing
  probeTimeoutMs: 15000, // popup fallback only: give up on a profile after this long
  outputs: ["html", "csv", "json"], // formats to download: "html" (report), "csv", "json"
  scrollDelayMs: 800,
  stagnantRounds: 8,
  refetchFirstPage: true,
};
// == END CONFIG ==
log.banner("inactive-following");
requireXHost();
requirePage([/^\/[A-Za-z0-9_]+\/following$/], "https://x.com/<your_handle>/following");

const owner = pathHandle();
const users = await collectUserList({
  label: "accounts you follow",
  delayMs: CONFIG.scrollDelayMs,
  stagnantLimit: CONFIG.stagnantRounds,
  refetchFirstPage: CONFIG.refetchFirstPage,
});

let candidates = CONFIG.onlyNonFollowers ? users.filter((u) => u.followsYou === false) : users;
candidates = candidates.slice(0, CONFIG.maxProfiles);
// Accounts whose relationship X never told us about cannot be classified as
// non-followers; say so instead of silently leaving them out.
const unknownRelationship = CONFIG.onlyNonFollowers ? users.filter((u) => u.followsYou === null).length : 0;
if (unknownRelationship) log.warn(`${unknownRelationship} of ${users.length} accounts have no relationship data (X served the list from its cache and the one-by-one lookups did not cover them), so they could not be checked. Reload the page and run again to include them.`);
const cutoff = new Date();
cutoff.setMonth(cutoff.getMonth() - CONFIG.inactiveMonths);

// X refuses to be framed, so profiles are not opened. Instead the tool reuses the
// profile-timeline request the page makes when a profile is visited (observed
// once, by visiting a single profile and coming back) with each account's id.
log.phase("learning-timeline-request");
if (!observedTimelineOp()) {
  xuOverlay.count("Visiting one profile to learn how X loads a timeline…");
  try {
    await bounceAway();
  } catch {
    /* reported by bounceAway */
  }
}
const viaApi = !!observedTimelineOp();
if (!viaApi) log.warn("Could not observe a profile timeline request; falling back to a popup window per account (slow). Allow popups for x.com if asked.");

// X allows roughly 50 profile timeline requests per 15 minutes, so the waits
// between batches dominate the estimate for anything beyond the first batch.
const XU_PROFILE_BATCH = 50;
const perProfileMs = viaApi ? CONFIG.probeDelayMs + 600 : CONFIG.probeDelayMs + 3500;
const batches = Math.max(0, Math.ceil(candidates.length / XU_PROFILE_BATCH) - 1);
const etaMin = Math.max(1, Math.ceil((candidates.length * perProfileMs) / 60000) + batches * 15);
log.info(`Checking ${candidates.length} accounts for their newest post. X allows about ${XU_PROFILE_BATCH} profile checks every 15 minutes, so this takes roughly ${etaMin} min${batches ? ` (${batches} pause${batches === 1 ? "" : "s"} of up to 15 min)` : ""}. Keep this tab open, or set maxProfiles in CONFIG for a quicker first look.`);

const XU_UNAVAILABLE_RE = /account suspended|cuenta suspendida|doesn.t exist|no existe|n.existe pas|existiert nicht|non esiste/i;
const XU_PROTECTED_RE = /posts are protected|publicaciones están protegidas|these posts are protected|posts sont protégés|beiträge sind geschützt/i;
const XU_EMPTY_RE = /hasn.t posted|no ha publicado|n.a pas encore publié|hat noch nichts gepostet|non ha ancora pubblicato/i;
const XU_PINNED_RE = /pinned|fijado|épinglé|angeheftet|fissato|fixado/i;

// Preferred: one timeline request per account, same as opening the profile.
// On 429, wait until the reset X announces (or 15 minutes when it does not) and
// retry; give up on the run only after three such waits.
let rateLimitWaits = 0;
async function probeWithApi(user, checked, total) {
  if (!user.id) return { status: "no id", lastPostAt: null };
  let result = await replayUserTimeline(user.id);
  while (/HTTP 429/.test(result.status) && rateLimitWaits < 3) {
    rateLimitWaits++;
    const wait = rateLimitWait(0, { blindMs: 15 * 60 * 1000 });
    log.warn(`X paused profile checks (about ${XU_PROFILE_BATCH} per 15 minutes). ${checked} of ${total} done; waiting ${fmtDuration(Math.round(wait / 1000))} before continuing…`);
    await countdown(wait, (left) => xuOverlay.count(`Rate limited by X · ${checked} of ${total} checked · resuming in ${fmtDuration(left)}`));
    xuDebug.rateLimit = null;
    result = await replayUserTimeline(user.id);
  }
  if (!result.tweets) return { status: result.status === "ok" ? "unavailable" : result.status, lastPostAt: null };
  return { status: "ok", lastPostAt: newestPostDate(result.tweets, user.pinnedIds) };
}

// Last resort: reuse one popup window for every profile and read the newest post.
let probeWindow = null;
function newestVisiblePost(doc) {
  const dates = [];
  for (const article of doc.querySelectorAll('article[data-testid="tweet"]')) {
    const context = article.querySelector('[data-testid="socialContext"]');
    if (context && XU_PINNED_RE.test(context.textContent)) continue;
    const tweet = readTweetArticle(article);
    if (tweet && tweet.createdAt) dates.push(tweet.createdAt);
  }
  return dates.sort().pop() || null;
}
async function probeWithPopup(handle) {
  const url = `${location.origin}/${handle}`;
  if (!probeWindow || probeWindow.closed) probeWindow = window.open(url, "xu-probe", "width=1100,height=900");
  else probeWindow.location.href = url;
  if (!probeWindow) return { status: "blocked", lastPostAt: null };
  const started = Date.now();
  await sleep(1500);
  for (;;) {
    await sleep(500);
    let doc = null;
    try {
      doc = probeWindow.document;
    } catch {
      doc = null;
    }
    if (doc && doc.location && doc.location.pathname.toLowerCase() === `/${handle.toLowerCase()}`) {
      const newest = newestVisiblePost(doc);
      if (newest) return { status: "ok", lastPostAt: newest };
      const text = doc.body ? doc.body.innerText : "";
      if (XU_UNAVAILABLE_RE.test(text)) return { status: "unavailable", lastPostAt: null };
      if (XU_PROTECTED_RE.test(text)) return { status: "protected", lastPostAt: null };
      if (XU_EMPTY_RE.test(text)) return { status: "ok", lastPostAt: null };
    }
    if (Date.now() - started > CONFIG.probeTimeoutMs) return { status: "timeout", lastPostAt: null };
  }
}

log.phase("checking-profiles");
const results = [];
let consecutiveFailures = 0;
for (let i = 0; i < candidates.length; i++) {
  const user = candidates[i];
  let probe;
  if (user.tweets === 0) {
    probe = { status: "ok", lastPostAt: null }; // X already says this account never posted
  } else {
    probe = viaApi ? await probeWithApi(user, i, candidates.length) : await probeWithPopup(user.handle);
    consecutiveFailures = probe.status === "ok" ? 0 : consecutiveFailures + 1;
    if (/HTTP 429/.test(probe.status) || consecutiveFailures >= 8) {
      log.warn(`X keeps refusing profile checks (${probe.status}). Stopping here with ${results.length} of ${candidates.length} accounts checked; the report marks the rest as unchecked. Run again later for them.`);
      for (const rest of candidates.slice(i)) results.push({ ...rest, lastPostAt: null, daysSinceLastPost: null, probeStatus: "not checked", inactive: false });
      break;
    }
    await sleep(CONFIG.probeDelayMs);
  }
  const days = probe.lastPostAt ? daysSince(probe.lastPostAt) : null;
  const inactive = probe.status === "ok" && (probe.lastPostAt === null || new Date(probe.lastPostAt) < cutoff);
  results.push({ ...user, lastPostAt: probe.lastPostAt, daysSinceLastPost: days, probeStatus: probe.status, inactive });
  const shown = probe.status === "ok" ? (probe.lastPostAt ? `${days} days ago` : "never posted") : probe.status;
  log.step(`${i + 1}/${candidates.length} @${user.handle}: ${shown}`);
  xuOverlay.count(`Checked ${i + 1} of ${candidates.length} accounts`);
}
if (probeWindow && !probeWindow.closed) probeWindow.close();

const inactive = results.filter((r) => r.inactive).sort((a, b) => (b.daysSinceLastPost || Infinity) - (a.daysSinceLastPost || Infinity));
const unresolved = results.filter((r) => r.probeStatus !== "ok");
console.log("");
log.ok(`Checked ${results.length} accounts · Silent for ${CONFIG.inactiveMonths}+ months: ${inactive.length} · Could not check: ${unresolved.length}`);
printTable(inactive, ["handle", "name", "lastPostAt", "daysSinceLastPost", "followsYou", "followers", "tweets"], 40);
if (unresolved.length) {
  log.info("Could not check (suspended, protected, refused or timed out):");
  printTable(unresolved, ["handle", "probeStatus", "followsYou"], 40);
}

const columns = ["handle", "name", "lastPostAt", "daysSinceLastPost", "inactive", "probeStatus", "followsYou", "followers", "following", "tweets", "createdAt", "bio", "url"];
const rows = usersToRows(results, columns);
await writeOutputs(
  outputBaseName("inactive-following", owner),
  {
    html: renderHtmlReport({
      tool: "inactive-following",
      title: `Silent accounts @${owner} follows`,
      subtitle: `Accounts with no post in the last ${CONFIG.inactiveMonths} months, out of ${results.length} checked${CONFIG.onlyNonFollowers ? " (only accounts that do not follow back)" : ""}.`,
      stats: [
        { label: "Checked", value: results.length },
        { label: `Silent ${CONFIG.inactiveMonths}+ months`, value: inactive.length, tone: "bad", href: "#inactive" },
        { label: "Active", value: results.length - inactive.length - unresolved.length, tone: "good", href: "#active" },
        { label: "Could not check", value: unresolved.length, href: "#unresolved" },
      ],
      breakdown: [
        { label: "Active", value: results.length - inactive.length - unresolved.length, tone: "good" },
        { label: "Silent", value: inactive.length, tone: "bad" },
        { label: "Could not check", value: unresolved.length, tone: "neutral" },
      ],
      notes: [
        partialListNote(users, "accounts you follow"),
        CONFIG.onlyNonFollowers ? "Only accounts that do not follow you back were checked. Set onlyNonFollowers to false in the script's CONFIG to check everyone you follow." : null,
        unknownRelationship ? `${unknownRelationship} accounts had no relationship data and were not checked. Reload the X page before running the tool again to include them.` : null,
      ].filter(Boolean),
      sections: [
        htmlTableSection({ id: "inactive", title: "Silent accounts", columns: ["handle", "name", "lastPostAt", "daysSinceLastPost", "followsYou", "followers", "tweets", "url"], rows: inactive, note: "Sorted by longest silence. Accounts that never posted appear with no last-post date.", empty: "Everyone checked has posted recently.", chips: [{ label: "Never posted", key: "lastPostAt", op: "empty" }, { label: "Silent 1+ year", key: "daysSinceLastPost", op: "gte", value: 365 }, { label: "Does not follow you", key: "followsYou", op: "eq", value: false }, { label: "10k+ followers", key: "followers", op: "gte", value: 10000 }] }),
        htmlTableSection({ id: "active", title: "Active accounts", columns: ["handle", "name", "lastPostAt", "daysSinceLastPost", "followsYou", "followers", "url"], rows: results.filter((r) => r.probeStatus === "ok" && !r.inactive) }),
        htmlTableSection({ id: "unresolved", title: "Could not check", columns: ["handle", "name", "probeStatus", "followsYou", "url"], rows: unresolved, note: "Suspended, protected, refused by X or timed out.", empty: "Every account could be checked." }),
      ],
    }),
    csv: toCsv(rows, columns),
    json: toJson({ generatedAt: new Date().toISOString(), owner, inactiveMonths: CONFIG.inactiveMonths, onlyNonFollowers: CONFIG.onlyNonFollowers, checked: results.length, inactive: inactive.length, accounts: rows }),
  },
  CONFIG.outputs,
);

publishResult("inactiveFollowing", { owner, results, inactive, unresolved }, `${results.length} checked · ${inactive.length} silent for ${CONFIG.inactiveMonths}+ months`);
