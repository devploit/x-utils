// @name Fans
// @description Lists the accounts that follow you but you do not follow back.
// @page https://x.com/<your_handle>/followers
// == CONFIG ==
const CONFIG = {
  outputs: ["html", "csv", "json"], // formats to download: "html" (report), "csv", "json"
  copyToClipboard: true, // also copy the first format to the clipboard
  scrollDelayMs: 800, // pause between scroll steps; raise it if X rate-limits you
  stagnantRounds: 8, // stop after this many scroll steps without new accounts
  maxUsers: Infinity, // stop early after this many accounts
  refetchFirstPage: true, // bounce tabs so the first page also gets full profile data
  saveSnapshot: true, // store the list locally so followers-diff can compare later
};
// == END CONFIG ==
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
