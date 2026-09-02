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
