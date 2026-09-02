// @name Engagement report
// @description Ranks your recent posts by likes, reposts, replies and views, and summarises averages, medians and your best posting slot.
// @page https://x.com/<your_handle>  (use /with_replies to include replies)
// == CONFIG ==
const CONFIG = {
  maxTweets: 300, // how many of the newest posts to analyse
  includeRetweets: false, // reposts of other people's posts are not your engagement
  topN: 15, // rows shown in the console rankings
  outputs: ["html", "csv", "json"], // formats to download: "html" (report), "csv", "json"
  scrollDelayMs: 900,
  stagnantRounds: 8,
  refetchFirstPage: true, // bounce profile tabs so the first page gets full metrics
};
// == END CONFIG ==
log.banner("engagement-report");
requireXHost();
requirePage([/^\/[A-Za-z0-9_]+(\/with_replies)?$/], "https://x.com/<your_handle> or /with_replies");

const profile = pathHandle();
if (!profile) {
  log.error("Open a profile page first.");
  throw new Error("x-utils: no profile");
}
const includeReplies = currentPath().endsWith("/with_replies");

const isOwn = (t) => !t.promoted && (t.author || "").toLowerCase() === profile.toLowerCase() && (CONFIG.includeRetweets || !t.isRetweet) && (includeReplies || !t.isReply);
const collected = await collectTweetTimeline({
  label: "posts",
  delayMs: CONFIG.scrollDelayMs,
  stagnantLimit: CONFIG.stagnantRounds,
  maxItems: CONFIG.maxTweets,
  refetchFirstPage: CONFIG.refetchFirstPage,
  counts: isOwn,
});

const own = collected.filter(isOwn);
const stats = engagementStats(own);
// Say what was left out, so the analysed count never looks like a shortfall.
const leftOut = { replies: 0, reposts: 0, others: 0, promoted: 0 };
for (const t of collected) {
  if (isOwn(t)) continue;
  if (t.promoted) leftOut.promoted++;
  else if ((t.author || "").toLowerCase() !== profile.toLowerCase()) leftOut.others++;
  else if (t.isRetweet && !CONFIG.includeRetweets) leftOut.reposts++;
  else if (t.isReply && !includeReplies) leftOut.replies++;
}
const leftOutParts = [
  leftOut.replies ? `${fmtInt(leftOut.replies)} ${leftOut.replies === 1 ? "reply" : "replies"} (open the "Replies" tab to include them)` : null,
  leftOut.reposts ? `${fmtInt(leftOut.reposts)} repost${leftOut.reposts === 1 ? "" : "s"} (set includeRetweets: true to include them)` : null,
  leftOut.others ? `${fmtInt(leftOut.others)} by other accounts` : null,
  leftOut.promoted ? `${fmtInt(leftOut.promoted)} promoted` : null,
].filter(Boolean);
const scopeNote = leftOutParts.length ? `${fmtInt(collected.length)} posts collected; ${fmtInt(own.length)} analysed. Left out: ${leftOutParts.join(", ")}.` : null;
if (scopeNote) log.info(scopeNote);
// The profile's own post count tells us whether X cut the timeline short.
const profileRecord = collected.profileRecord || null;
const expectedPosts = profileRecord && typeof profileRecord.tweets === "number" ? Math.min(profileRecord.tweets, CONFIG.maxTweets) : null;
const limited = !!(xuDebug.rateLimited || xuDebug.rateLimit || (xuDebug.scroll && xuDebug.scroll.quotaWaits) || (xuDebug.direct && xuDebug.direct.pages && xuDebug.direct.after === xuDebug.direct.before));
const partialNote = expectedPosts && collected.length < expectedPosts * 0.7
  ? `X served ${fmtInt(collected.length)} posts, while this account's counter says about ${fmtInt(profileRecord.tweets)} (that number includes replies, which the Posts tab hides). ${limited ? "X's limit on profile timelines got in the way during this run: wait 15 minutes and run again for the full picture." : "If that looks low, wait 15 minutes and run again: X caps how many timeline pages it serves per quarter hour."}`
  : null;
if (partialNote) log.warn(partialNote);
const withViews = stats.rows.filter((r) => r.views !== null && r.views !== undefined).length;

console.log("");
log.ok(`@${profile}: ${stats.totals.posts} posts analysed${includeReplies ? " (replies included)" : ""}.`);
console.table({
  "Total likes": fmtInt(stats.totals.likes),
  "Total reposts": fmtInt(stats.totals.retweets),
  "Total replies": fmtInt(stats.totals.replies),
  "Total views": fmtInt(stats.totals.views),
  "Average likes / post": stats.averages.likes,
  "Median likes / post": stats.medians.likes,
  "Average views / post": fmtInt(stats.averages.views),
  "Median engagement rate (%)": stats.averages.engagementRate,
  "Best hour to post (local)": stats.bestHourLocal,
  "Best weekday": stats.bestWeekday,
});
if (withViews < stats.rows.length) log.info(`${stats.rows.length - withViews} posts have no view count (X only counts views on posts from late 2022 onwards); engagement rates ignore them.`);

const byLikes = [...stats.rows].sort((a, b) => (b.likes || 0) - (a.likes || 0));
const chronological = stats.rows.filter((t) => t.createdAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
const byViews = [...stats.rows].sort((a, b) => (b.views || 0) - (a.views || 0));
const byRate = stats.rows.filter((r) => r.engagementRate !== null).sort((a, b) => b.engagementRate - a.engagementRate);
log.info(`Top ${CONFIG.topN} by likes:`);
printTable(byLikes, ["createdAt", "text", "likes", "retweets", "replies", "views", "url"], CONFIG.topN);
log.info(`Top ${CONFIG.topN} by views:`);
printTable(byViews, ["createdAt", "text", "views", "likes", "engagementRate", "url"], CONFIG.topN);
if (byRate.length) {
  log.info(`Top ${CONFIG.topN} by engagement rate (interactions / views):`);
  printTable(byRate, ["createdAt", "text", "engagementRate", "interactions", "views", "url"], CONFIG.topN);
}

const columns = ["id", "createdAt", "text", "likes", "retweets", "replies", "quotes", "bookmarks", "views", "interactions", "engagementRate", "isReply", "isQuote", "media", "url"];
await writeOutputs(outputBaseName("engagement", profile), {
  html: renderHtmlReport({
    tool: "engagement-report",
    title: `Engagement of @${profile}`,
    subtitle: `${stats.totals.posts} newest posts${includeReplies ? ", replies included" : ""}${CONFIG.includeRetweets ? ", reposts included" : ""}.`,
    stats: [
      { label: "Posts", value: stats.totals.posts },
      { label: "Likes", value: stats.totals.likes },
      { label: "Views", value: stats.totals.views },
      { label: "Median engagement", value: stats.averages.engagementRate === null ? "·" : `${stats.averages.engagementRate}%` },
      { label: "Best hour (local)", value: stats.bestHourLocal || "·" },
      { label: "Best weekday", value: stats.bestWeekday || "·" },
    ],
    notes: [scopeNote, partialNote, withViews < stats.rows.length ? `${stats.rows.length - withViews} posts have no view count. X only counts views on posts from late 2022 onwards, so older posts are left out of the engagement rate.` : null].filter(Boolean),
    sections: [
      htmlChartSection({
        id: "patterns",
        title: "Patterns",
        note: "Times are your local time zone.",
        charts: [
          { title: "When your posts perform", caption: "average interactions per post by weekday and hour", svg: svgHeatmap(postingHeatmap(stats.rows)) },
          { title: "Likes per post", caption: "oldest to newest", svg: svgBars(postBarPoints(chronological, "likes"), { valueLabel: "likes" }) },
          { title: "Views per post", caption: "oldest to newest", svg: svgBars(postBarPoints(chronological, "views"), { valueLabel: "views" }) },
        ],
      }),
      htmlCardsSection({ id: "top", title: `Top ${Math.min(10, byLikes.length)} by likes`, tweets: byLikes.slice(0, 10), numbered: true }),
      htmlTableSection({
        id: "all",
        title: "All posts",
        columns: ["createdAt", "text", "likes", "retweets", "replies", "quotes", "views", "engagementRate", "url"],
        rows: byLikes,
        note: "Click a column header to re-rank.",
        chips: [
          { label: "Above median likes", key: "likes", op: "gte", value: stats.medians.likes || 0 },
          { label: "10k+ views", key: "views", op: "gte", value: 10000 },
          { label: "Engagement over 2%", key: "engagementRate", op: "gte", value: 2 },
          { label: "Last 30 days", key: "createdAt", op: "daysLt", value: 30 },
        ],
      }),
    ],
  }),
  csv: toCsv(tweetsToRows(byLikes, columns), columns),
  json: toJson({ generatedAt: new Date().toISOString(), profile, includeReplies, totals: stats.totals, averages: stats.averages, medians: stats.medians, bestHourLocal: stats.bestHourLocal, bestWeekday: stats.bestWeekday, posts: byLikes }),
}, CONFIG.outputs);

publishResult("engagement", { profile, stats, posts: byLikes }, `${stats.totals.posts} posts analysed · ${fmtInt(stats.totals.likes)} likes · ${fmtInt(stats.totals.views)} views`);
