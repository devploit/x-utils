// @name Follower quality
// @description Scores your followers with bot-like signals (default avatar, no posts, brand-new account, absurd follow ratio) and lists the suspicious ones.
// @page https://x.com/<your_handle>/followers
// == CONFIG ==
const CONFIG = {
  suspiciousScore: 5, // rows scoring this or higher are reported as suspicious
  minFollowers: 5, // fewer followers than this adds to the score
  minTweets: 3, // fewer posts than this adds to the score
  maxFollowRatio: 20, // following / followers above this adds to the score
  newAccountDays: 30, // accounts younger than this add to the score
  outputs: ["html", "csv", "json"], // formats to download: "html" (report), "csv", "json"
  scrollDelayMs: 800,
  stagnantRounds: 8,
  maxUsers: Infinity,
  refetchFirstPage: true, // needed: scoring requires the profile data that comes from the network
};
// == END CONFIG ==
log.banner("follower-quality");
requireXHost();
requirePage([/^\/[A-Za-z0-9_]+\/(followers|verified_followers)$/], "https://x.com/<your_handle>/followers");

const owner = pathHandle();
const users = await collectUserList({
  label: "followers",
  delayMs: CONFIG.scrollDelayMs,
  stagnantLimit: CONFIG.stagnantRounds,
  maxItems: CONFIG.maxUsers,
  refetchFirstPage: CONFIG.refetchFirstPage,
});

const scored = users.map((u) => {
  const { score, reasons } = scoreUserQuality(u, CONFIG);
  return { ...u, score, reasons };
});
const unscored = scored.filter((u) => u.score === null);
const suspicious = scored.filter((u) => u.score !== null && u.score >= CONFIG.suspiciousScore).sort((a, b) => b.score - a.score);
const clean = scored.length - unscored.length - suspicious.length;

console.log("");
log.ok(`Followers: ${users.length} · Suspicious (score ≥ ${CONFIG.suspiciousScore}): ${suspicious.length} · Looks fine: ${clean}${unscored.length ? ` · Not scored (no profile data): ${unscored.length}` : ""}`);
if (unscored.length) log.warn("Rows without profile data are usually the first page. Reload the page and paste the tool again right away to include them.");
printTable(suspicious, ["handle", "name", "score", "reasons", "followers", "following", "tweets", "createdAt"], 40);

const columns = ["handle", "name", "score", "reasons", "followers", "following", "tweets", "createdAt", "defaultAvatar", "verified", "youFollow", "bio", "url"];
const rows = usersToRows(scored.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)), columns);
await writeOutputs(
  outputBaseName("follower-quality", owner),
  {
    html: renderHtmlReport({
      tool: "follower-quality",
      title: `Follower quality for @${owner}`,
      subtitle: `Each follower scored with transparent signals. Score ${CONFIG.suspiciousScore} or higher is flagged as suspicious.`,
      stats: [
        { label: "Followers", value: users.length },
        { label: "Suspicious", value: suspicious.length, tone: "bad", href: "#suspicious" },
        { label: "Looks fine", value: clean, tone: "good", href: "#all" },
        { label: "Not scored", value: unscored.length, href: "#unscored" },
      ],
      breakdown: [
        { label: "Looks fine", value: clean, tone: "good" },
        { label: "Suspicious", value: suspicious.length, tone: "bad" },
        { label: "Not scored", value: unscored.length, tone: "neutral" },
      ],
      notes: [partialListNote(users, "followers"), unscored.length ? "Rows without profile data (usually the first page) could not be scored. Reload the page and run the tool again right away to include them." : null].filter(Boolean),
      sections: [
        htmlTableSection({ id: "suspicious", title: "Suspicious followers", columns: ["handle", "name", "score", "reasons", "followers", "following", "tweets", "createdAt", "url"], rows: suspicious, empty: "No follower crossed the suspicious threshold.", chips: [{ label: "Score 8+", key: "score", op: "gte", value: 8 }, { label: "Never posted", key: "tweets", op: "eq", value: 0 }, { label: "Default avatar", key: "defaultAvatar", op: "eq", value: true }, { label: "Joined this month", key: "createdAt", op: "daysLt", value: 30 }] }),
        htmlChartSection({
          id: "sizes",
          title: "Your audience by size",
          charts: [{ title: "Followers by their own follower count", svg: svgHistogram(sizeHistogram(users), { noun: "followers" }) }],
        }),
        htmlTableSection({ id: "all", title: "All scored followers", columns: ["handle", "name", "score", "reasons", "followers", "following", "tweets", "createdAt", "url"], rows: scored.filter((u) => u.score !== null), chips: [{ label: "Score 5+", key: "score", op: "gte", value: 5 }, { label: "Score 0", key: "score", op: "eq", value: 0 }, ...XU_USER_CHIPS] }),
        htmlTableSection({ id: "unscored", title: "Not scored", columns: ["handle", "name", "url"], rows: unscored, empty: "Every follower had profile data." }),
      ],
    }),
    csv: toCsv(rows, columns),
    json: toJson({ generatedAt: new Date().toISOString(), owner, thresholds: CONFIG, followers: users.length, suspicious: suspicious.length, accounts: rows }),
  },
  CONFIG.outputs,
);

publishResult("followerQuality", { owner, scored, suspicious, unscored }, `${users.length} followers · ${suspicious.length} suspicious · ${clean} look fine`);
