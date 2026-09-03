// Generates sample HTML reports with fictional data into docs/examples/.
// Run with `npm run examples`. Nothing here touches X or real accounts.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The output must be byte-identical on every machine and every day (CI checks
// that docs/examples/ is fresh), so freeze the clock and the time zone before
// loading anything that formats dates.
const GENERATED_AT = "2026-09-02T09:41:00.000Z";
process.env.TZ = "UTC";
Date.now = () => Date.parse(GENERATED_AT);

const { graphqlTweet, graphqlUser, loadLib } = await import("../tests/helpers.mjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "docs", "examples");
const lib = await loadLib();

// Deterministic pseudo-random so the examples are stable across runs.
let seed = 42;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => Math.floor(min + rand() * (max - min));

const FIRST = ["Ada", "Marta", "Julián", "Nora", "Tomás", "Lena", "Iker", "Sofía", "Pau", "Irene", "Hugo", "Clara", "Mateo", "Elena", "Bruno", "Alba", "Leo", "Vera", "Dani", "Olivia", "Sam", "Noa", "Max", "June", "Ana", "Tim", "Rita", "Enzo", "Kai", "Mila"];
const LAST = ["Ferrer", "Okafor", "Lindqvist", "Ruiz", "Tanaka", "Moreau", "Haddad", "Novak", "García", "Byrne", "Costa", "Weber", "Silva", "Dubois", "Rossi", "Nakamura", "Petrova", "Ortiz", "Brandt", "Kaur"];
const ROLES = ["Staff engineer", "Product designer", "Security researcher", "Indie hacker", "Data scientist", "Founder", "PM", "Writer", "ML engineer", "Photographer", "SRE", "Journalist"];
const TOPICS = ["distributed systems", "typography", "threat intel", "climate tech", "open source", "coffee", "LLM evals", "cycling", "compilers", "urbanism", "chess", "synths"];
const BIO_SHAPES = [
  (r, t) => `${r}. Writing about ${t} and whatever breaks in production.`,
  (r, t) => `${r} · ${t} · opinions are my own`,
  (r, t) => `${r} by day, ${t} by night. Prev @somewhere.`,
  () => "",
  (r, t) => `Building tools for ${t}. DMs open.`,
  (r) => `${r}. he/him`,
  (r, t) => `${t} enthusiast. ${r} at a company you have heard of.`,
];

function fakeUser(i, { followedBy, following = true }) {
  const first = pick(FIRST);
  const last = pick(LAST);
  const handle = `${first}${pick(["", "_", "."])}${last}${rand() < 0.3 ? between(1, 99) : ""}`.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 15);
  const tier = rand();
  const followers = tier < 0.5 ? between(40, 900) : tier < 0.85 ? between(900, 20000) : between(20000, 400000);
  const year = between(2008, 2026);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][between(0, 12)];
  const raw = graphqlUser({
    id: String(1000 + i),
    handle,
    name: `${first} ${last}`,
    followers,
    following: between(80, 3000),
    tweets: between(0, 30000),
    createdAt: `Wed ${month} ${between(1, 28)} 10:00:00 +0000 ${year}`,
    followedBy,
    following_: following,
    bio: pick(BIO_SHAPES)(pick(ROLES), pick(TOPICS)),
    avatar: `https://pbs.twimg.com/profile_images/${1000 + i}/avatar_normal.jpg`,
  });
  raw.is_blue_verified = rand() < 0.18;
  raw.privacy.protected = rand() < 0.06;
  return { ...lib.normalizeUser(raw), enriched: true };
}

// ---- non-followers example ------------------------------------------------
const following = Array.from({ length: 38 }, (_, i) => fakeUser(i, { followedBy: rand() < 0.62 }));
const nonFollowers = following.filter((u) => u.followsYou === false);
const mutuals = following.filter((u) => u.followsYou === true);
const owner = "devploit";

const nonFollowersHtml = lib.renderHtmlReport({
  tool: "non-followers",
  title: `Accounts @${owner} follows that do not follow back`,
  subtitle: `${following.length} accounts followed, ${mutuals.length} mutual, ${nonFollowers.length} not following back.`,
  generatedAt: GENERATED_AT,
  stats: [
    { label: "Following", value: following.length },
    { label: "Mutuals", value: mutuals.length, tone: "good", href: "#mutuals" },
    { label: "Not following back", value: nonFollowers.length, tone: "bad", href: "#non-followers" },
  ],
  breakdown: [
    { label: "Mutuals", value: mutuals.length, tone: "good" },
    { label: "Not following back", value: nonFollowers.length, tone: "bad" },
  ],
  notes: ["Sample report with fictional accounts. Avatars fall back to initials because the profiles do not exist."],
  sections: [
    lib.htmlTableSection({ id: "non-followers", title: "Not following you back", columns: ["handle", "name", "followers", "following", "tweets", "createdAt", "verified", "bio", "url"], rows: nonFollowers, empty: "Everyone you follow follows you back.", chips: lib.XU_USER_CHIPS }),
    lib.htmlChartSection({
      id: "sizes",
      title: "Who they are",
      charts: [
        { title: "Size of the accounts not following back", caption: "by follower count", svg: lib.svgHistogram(lib.sizeHistogram(nonFollowers), { noun: "accounts" }) },
        { title: "Size of your mutuals", caption: "by follower count", svg: lib.svgHistogram(lib.sizeHistogram(mutuals), { noun: "accounts" }) },
      ],
    }),
    lib.htmlTableSection({ id: "mutuals", title: "Mutuals", columns: ["handle", "name", "followers", "tweets", "createdAt", "url"], rows: mutuals, chips: lib.XU_USER_CHIPS }),
  ],
});

// ---- follower-quality example --------------------------------------------
const followers = Array.from({ length: 30 }, (_, i) => fakeUser(100 + i, { followedBy: true, following: rand() < 0.5 }));
for (let i = 0; i < 7; i++) {
  const u = followers[i];
  Object.assign(u, { defaultAvatar: true, avatar: null, tweets: i < 4 ? 0 : between(1, 2), bio: "", followers: between(0, 4), following: between(400, 2000), createdAt: `2026-08-${String(between(10, 30)).padStart(2, "0")}T08:00:00.000Z`, handle: `${u.handle.slice(0, 6)}${between(100000, 999999)}` });
}
const scored = followers.map((u) => ({ ...u, ...lib.scoreUserQuality(u, {}, Date.parse(GENERATED_AT)) })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
const suspicious = scored.filter((u) => u.score !== null && u.score >= 5);

const qualityHtml = lib.renderHtmlReport({
  tool: "follower-quality",
  title: `Follower quality for @${owner}`,
  subtitle: "Each follower scored with transparent signals. Score 5 or higher is flagged as suspicious.",
  generatedAt: GENERATED_AT,
  stats: [
    { label: "Followers", value: followers.length },
    { label: "Suspicious", value: suspicious.length, tone: "bad", href: "#suspicious" },
    { label: "Looks fine", value: followers.length - suspicious.length, tone: "good", href: "#all" },
  ],
  breakdown: [
    { label: "Looks fine", value: followers.length - suspicious.length, tone: "good" },
    { label: "Suspicious", value: suspicious.length, tone: "bad" },
  ],
  notes: ["Sample report with fictional accounts."],
  sections: [
    lib.htmlTableSection({ id: "suspicious", title: "Suspicious followers", columns: ["handle", "name", "score", "reasons", "followers", "following", "tweets", "createdAt", "url"], rows: suspicious, empty: "No follower crossed the suspicious threshold.", chips: [{ label: "Score 8+", key: "score", op: "gte", value: 8 }, { label: "Never posted", key: "tweets", op: "eq", value: 0 }, { label: "Default avatar", key: "defaultAvatar", op: "eq", value: true }, { label: "Joined this month", key: "createdAt", op: "daysLt", value: 30 }] }),
    lib.htmlChartSection({ id: "sizes", title: "Your audience by size", charts: [{ title: "Followers by their own follower count", svg: lib.svgHistogram(lib.sizeHistogram(followers), { noun: "followers" }) }] }),
    lib.htmlTableSection({ id: "all", title: "All scored followers", columns: ["handle", "name", "score", "reasons", "followers", "following", "tweets", "createdAt", "url"], rows: scored, chips: [{ label: "Score 5+", key: "score", op: "gte", value: 5 }, { label: "Score 0", key: "score", op: "eq", value: 0 }, ...lib.XU_USER_CHIPS] }),
  ],
});

// ---- followers-diff example ------------------------------------------------
const diffHistory = [1180, 1194, 1201, 1198, 1230, 1262, 1259, 1301].map((count, i) => ({ takenAt: new Date(Date.parse(GENERATED_AT) - (7 - i) * 7 * 86400000).toISOString(), count }));
const diffAdded = Array.from({ length: 9 }, (_, i) => fakeUser(400 + i, { followedBy: true }));
const diffRemoved = Array.from({ length: 4 }, (_, i) => fakeUser(500 + i, { followedBy: false }));
const diffHtml = lib.renderHtmlReport({
  tool: "followers-diff",
  title: `Follower changes for @${owner}`,
  subtitle: `Compared with the snapshot taken ${lib.fmtDate(diffHistory[6].takenAt)}.`,
  generatedAt: GENERATED_AT,
  stats: [
    { label: `Before (${lib.fmtDate(diffHistory[6].takenAt)})`, value: diffHistory[6].count },
    { label: "Now", value: diffHistory[7].count },
    { label: "New followers", value: diffAdded.length, tone: "good", href: "#added" },
    { label: "Unfollowed you", value: diffRemoved.length, tone: "bad", href: "#removed" },
    { label: "Renamed", value: 1, href: "#renamed" },
  ],
  breakdown: [
    { label: "New followers", value: diffAdded.length, tone: "good" },
    { label: "Unfollowed you", value: diffRemoved.length, tone: "bad" },
  ],
  notes: ["Sample report with fictional accounts."],
  sections: [
    lib.htmlChartSection({ id: "trend", title: "Over time", note: `${diffHistory.length} snapshots taken with this tool in this browser.`, charts: [{ title: "Followers per snapshot", svg: lib.svgTrend(diffHistory.map((p) => ({ date: p.takenAt, value: p.count })), { valueLabel: "followers" }) }] }),
    lib.htmlTableSection({ id: "removed", title: "Unfollowed you", columns: ["handle", "name", "id"], rows: diffRemoved, empty: "Nobody left." }),
    lib.htmlTableSection({ id: "added", title: "New followers", columns: ["handle", "name", "followers", "tweets", "createdAt", "url"], rows: diffAdded, empty: "Nobody new.", chips: lib.XU_USER_CHIPS }),
    lib.htmlTableSection({ id: "renamed", title: "Renamed accounts", columns: ["handle", "name", "id"], rows: [{ handle: "nora_ferrer", name: "was @nora_f", id: "1042" }], empty: "No renames." }),
  ],
});

// ---- bookmarks example ----------------------------------------------------
const POSTS = [
  ["The best debugging advice I ever got: before you change anything, write down what you expect to see. Then look.\n\nHalf the time the bug is in the expectation.", 2140, 310, 88, 184000],
  ["We migrated 400 services off the old queue in six weeks. Thread on what worked, what did not, and the one decision I would reverse. 🧵", 5400, 1200, 210, 612000],
  ["Typography tip: your line length is probably too long. 60 to 75 characters. Measure it. Fix it. Everything else gets easier.", 890, 140, 32, 74000],
  ["Reminder that \"we'll add tests later\" is a decision to never add tests, made by someone who does not want to say it out loud.", 12800, 2600, 410, 1450000],
  ["Published: a plain-English walkthrough of how TLS certificate validation actually works, with every failure mode I have seen in the wild. Link below.", 640, 190, 21, 58000],
  ["I built a small tool that turns my bookmarks into a searchable page. Turns out I have bookmarked the same three articles nine times.", 310, 22, 15, 21000],
  ["Unpopular opinion: most dashboards should be a single number and a sentence explaining whether it is good or bad.", 3300, 480, 260, 390000],
  ["Coffee brewing is just a distributed systems problem with better failure modes.", 1500, 210, 44, 96000],
];
const bookmarks = POSTS.map(([text, likes, retweets, replies, views], i) => {
  const author = fakeUser(200 + i, { followedBy: rand() < 0.5 });
  const raw = graphqlTweet({
    id: String(1700000000000 + i * 7919),
    author: graphqlUser({ id: author.id, handle: author.handle, name: author.name, avatar: author.avatar }),
    text,
    urls: [],
    createdAt: `Mon Aug ${String(28 - i * 3).padStart(2, "0")} ${String(8 + i).padStart(2, "0")}:15:00 +0000 2026`,
    likes,
    retweets,
    replies,
    quotes: Math.round(retweets / 6),
    views: String(views),
    media: i === 1 ? [{ type: "video", url: "https://t.co/vid", media_url_https: "https://pbs.twimg.com/thumb.jpg", video_info: { variants: [{ content_type: "video/mp4", bitrate: 2176000, url: "https://video.twimg.com/ext_tw_video/1/pu/vid/1280x720/sample.mp4" }] } }] : [],
  });
  raw.legacy.full_text = i === 1 ? `${text} https://t.co/vid` : text;
  const tweet = lib.normalizeTweet(raw);
  if (i === 3) tweet.isReply = true;
  if (i === 6) tweet.isRetweet = true;
  return tweet;
});
const bookmarkAuthors = new Set(bookmarks.map((t) => t.author.toLowerCase()));

const bookmarksHtml = lib.renderHtmlReport({
  tool: "bookmarks-export",
  title: `Bookmarks of @${owner}`,
  generatedAt: GENERATED_AT,
  stats: [
    { label: "Bookmarks", value: bookmarks.length },
    { label: "Authors", value: bookmarkAuthors.size },
    { label: "With media", value: bookmarks.filter((t) => t.media.length).length },
  ],
  notes: ["Sample report with fictional posts and accounts."],
  sections: [lib.htmlCardsSection({ id: "bookmarks", title: "Bookmarks", tweets: bookmarks, note: "Newest bookmark first, as shown by X." })],
});

// ---- engagement example ---------------------------------------------------
const OWN_POSTS = [
  "Shipped: the report now shows who unfollowed you since last time. No API, no password, runs in your browser.",
  "Hot take: most \"growth\" advice is just \"post at 9am on Tuesday\" wearing a trench coat.",
  "Thread: everything I learned auditing 40k follower lists for bots. The signals that matter and the ones that do not. 🧵",
  "Reminder that a bookmark is a promise to your future self that you will almost certainly break.",
  "New blog post: reading X's GraphQL responses from the browser console, and why it is safer than an API key.",
  "Unpopular opinion: engagement rate matters more than followers, and views matter more than both.",
  "Small joy: a table that sorts when you click the header. That is it. That is the post.",
  "If your dashboard needs a tutorial, it is not a dashboard, it is a course.",
  "Deleted 1,200 old posts with a script last night. Felt like cleaning a garage I did not know I had.",
  "Question for the timeline: what is the one tool you would pay for on X if it did not need your password?",
  "The best keyboard shortcut is the one you use without noticing. Ours is / to search.",
  "I unfollowed 300 accounts that had not posted in a year. My timeline is readable again.",
  "Your follower count is a vanity metric. Your mutuals count is a relationship metric. Track the second one.",
  "Wrote a bot detector in 60 lines. The hard part was not the code, it was deciding what \"suspicious\" means.",
  "PSA: the console in your browser is the most underrated tool on your computer. Learn three things about it this week.",
  "Every export tool should produce a file you would actually open twice. Most produce a CSV you open once, in fear.",
  "Today's lesson: if a page already downloads the data, you do not need the API. You need patience and a scroll bar.",
  "Rewrote the report header four times. The version that survived says the result in one sentence. Ship that.",
  "Dark mode is not a feature. Respecting the system setting is the feature.",
  "Counted: 38% of the accounts I follow have not posted this year. Unfollowing feels rude until you see the number.",
  "A good table has three properties: it sorts, it filters, and it does not need a legend.",
  "Blocked list exported, muted list exported. Two files X never lets you download, now in my backups.",
  "The magic number for me: post at 20:00, Sundays. Your number is different. Measure yours.",
  "Reading X's GraphQL responses is like reading someone's diary, except it is your own account and it is public.",
  "Metric I care about this month: replies per thousand views. It measures conversation, not applause.",
  "Threads still work. What does not work is a thread with no reason to be a thread.",
  "The report that made me delete the most: inactive accounts. The report that made me smile the most: fans.",
  "Zero dependencies is a feature. Every dependency is a future afternoon you did not plan for.",
  "You do not need a growth hack. You need to know which three posts worked and why. Then do that again.",
  "Automating the boring part of X took a weekend. Explaining why it is safe took a README.",
  "Hot take: bookmarks are the best signal of what you actually value. Likes are just applause.",
  "Data point: replies get 4x the engagement rate of quotes on my account. Yours may differ. Check.",
  "Shipped an HTML report that works offline. Tables, cards, dark mode, one file. No servers involved.",
  "Ranking my own posts by engagement rate was humbling. The long thread lost to a one-liner about coffee.",
];
const own = fakeUser(300, { followedBy: true });
own.handle = owner;
own.name = "devploit";
const ownPosts = Array.from({ length: 36 }, (_, i) => {
  const daysAgo = i * 2 + between(0, 2);
  const date = new Date(Date.parse(GENERATED_AT) - daysAgo * 86400000);
  date.setUTCHours([8, 9, 12, 18, 21][between(0, 5)], between(0, 60), 0, 0);
  const viral = rand() < 0.12;
  const views = viral ? between(150000, 900000) : between(1500, 40000);
  const likes = Math.round(views * (viral ? 0.03 : 0.012) * (0.6 + rand()));
  const isReply = false;
  const raw = graphqlTweet({
    id: String(1800000000000 + i * 7919),
    author: graphqlUser({ id: own.id, handle: owner, name: own.name, avatar: own.avatar }),
    text: OWN_POSTS[i % OWN_POSTS.length],
    urls: [],
    createdAt: date.toUTCString().replace(/^(\w+), (\d+) (\w+) (\d+) (\d+:\d+:\d+) GMT$/, "$1 $3 $2 $5 +0000 $4"),
    likes,
    retweets: Math.round(likes * (0.12 + rand() * 0.2)),
    replies: Math.round(likes * (0.05 + rand() * 0.1)),
    quotes: Math.round(likes * 0.03),
    views: String(views),
    media: [],
  });
  const tweet = lib.normalizeTweet(raw);
  tweet.isReply = isReply;
  return tweet;
});
const stats = lib.engagementStats(ownPosts);
const byLikes = [...stats.rows].sort((a, b) => (b.likes || 0) - (a.likes || 0));
const chronological = stats.rows.filter((t) => t.createdAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const engagementHtml = lib.renderHtmlReport({
  tool: "engagement-report",
  title: `Engagement of @${owner}`,
  subtitle: `${stats.totals.posts} newest posts, reposts excluded.`,
  generatedAt: GENERATED_AT,
  stats: [
    { label: "Posts", value: stats.totals.posts },
    { label: "Likes", value: stats.totals.likes },
    { label: "Views", value: stats.totals.views },
    { label: "Median engagement", value: `${stats.averages.engagementRate}%` },
    { label: "Best hour (local)", value: stats.bestHourLocal },
    { label: "Best weekday", value: stats.bestWeekday },
  ],
  notes: ["Sample report with fictional posts."],
  sections: [
    lib.htmlChartSection({
      id: "patterns",
      title: "Patterns",
      note: "Times are your local time zone.",
      charts: [
        { title: "When your posts perform", caption: "average interactions per post by weekday and hour", svg: lib.svgHeatmap(lib.postingHeatmap(stats.rows)) },
        { title: "Likes per post", caption: "oldest to newest", svg: lib.svgBars(lib.postBarPoints(chronological, "likes"), { valueLabel: "likes" }) },
        { title: "Views per post", caption: "oldest to newest", svg: lib.svgBars(lib.postBarPoints(chronological, "views"), { valueLabel: "views" }) },
      ],
    }),
    lib.htmlCardsSection({ id: "top", title: "Top 10 by likes", tweets: byLikes.slice(0, 10), numbered: true }),
    lib.htmlTableSection({ id: "all", title: "All posts", columns: ["createdAt", "text", "likes", "retweets", "replies", "quotes", "views", "engagementRate", "url"], rows: byLikes, note: "Click a column header to re-rank.", chips: [{ label: "Above median likes", key: "likes", op: "gte", value: stats.medians.likes || 0 }, { label: "10k+ views", key: "views", op: "gte", value: 10000 }, { label: "Engagement over 2%", key: "engagementRate", op: "gte", value: 2 }, { label: "Last 30 days", key: "createdAt", op: "daysLt", value: 30 }] }),
  ],
});

await mkdir(outDir, { recursive: true });
const files = { "non-followers.html": nonFollowersHtml, "follower-quality.html": qualityHtml, "bookmarks-export.html": bookmarksHtml, "engagement-report.html": engagementHtml, "followers-diff.html": diffHtml };
for (const [name, html] of Object.entries(files)) {
  // Hosted samples: a search-friendly title and description instead of the personal one a real run gets.
  const label = { "non-followers.html": "Who does not follow you back", "follower-quality.html": "Follower quality", "bookmarks-export.html": "Bookmarks export", "engagement-report.html": "Engagement report", "followers-diff.html": "Who unfollowed me" }[name];
  const page = html
    .replace(/<title>[^<]*<\/title>/, `<title>Sample report: ${label} · x-utils</title>`)
    .replace("<title>", `<meta name="description" content="A sample x-utils report (${label}), built from made-up accounts and posts. Sort the tables, use the filters, try the buttons."><title>`);
  await writeFile(path.join(outDir, name), page);
  console.log(`wrote docs/examples/${name} (${(html.length / 1024).toFixed(1)} KB)`);
}
