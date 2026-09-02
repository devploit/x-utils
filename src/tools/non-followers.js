// @name Non-followers
// @description Lists the accounts you follow that do not follow you back.
// @page https://x.com/<your_handle>/following
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
log.banner("non-followers");
requireXHost();
requirePage([/^\/[A-Za-z0-9_]+\/following$/], "https://x.com/<your_handle>/following");

const owner = pathHandle();
const me = myHandle();
if (me && owner && me.toLowerCase() !== owner.toLowerCase()) {
  log.warn(`You are viewing @${owner}'s list, not your own (@${me}). "Follows you" still refers to you.`);
}

const users = await collectUserList({
  label: "accounts you follow",
  delayMs: CONFIG.scrollDelayMs,
  stagnantLimit: CONFIG.stagnantRounds,
  maxItems: CONFIG.maxUsers,
  refetchFirstPage: CONFIG.refetchFirstPage,
});

const nonFollowers = users.filter((u) => u.followsYou === false);
const mutuals = users.filter((u) => u.followsYou === true);
const unknown = users.filter((u) => u.followsYou === null);

console.log("");
log.ok(`Following: ${users.length} · Mutuals: ${mutuals.length} · Not following you back: ${nonFollowers.length}${unknown.length ? ` · Unknown: ${unknown.length}` : ""}`);
printTable(nonFollowers, ["handle", "name", "followers", "tweets", "createdAt", "bio"], 30);

const rows = usersToRows(nonFollowers, ["handle", "name", "followers", "following", "tweets", "createdAt", "verified", "protected", "bio", "url"]);
const base = outputBaseName("non-followers", owner);
await writeOutputs(
  base,
  {
    html: renderHtmlReport({
      tool: "non-followers",
      title: `Accounts @${owner} follows that do not follow back`,
      subtitle: `${users.length} accounts followed, ${mutuals.length} mutual, ${nonFollowers.length} not following back.`,
      stats: [
        { label: "Following", value: users.length },
        { label: "Mutuals", value: mutuals.length, tone: "good", href: "#mutuals" },
        { label: "Not following back", value: nonFollowers.length, tone: "bad", href: "#non-followers" },
      ],
      notes: [partialListNote(users, "accounts you follow")].filter(Boolean),
      breakdown: [
        { label: "Mutuals", value: mutuals.length, tone: "good" },
        { label: "Not following back", value: nonFollowers.length, tone: "bad" },
        { label: "Unknown", value: unknown.length, tone: "neutral" },
      ],
      sections: [
        htmlTableSection({ id: "non-followers", title: "Not following you back", columns: ["handle", "name", "followers", "following", "tweets", "createdAt", "verified", "bio", "url"], rows: nonFollowers, empty: "Everyone you follow follows you back.", chips: XU_USER_CHIPS }),
        htmlChartSection({
          id: "sizes",
          title: "Who they are",
          charts: [
            { title: "Size of the accounts not following back", caption: "by follower count", svg: svgHistogram(sizeHistogram(nonFollowers), { noun: "accounts" }) },
            { title: "Size of your mutuals", caption: "by follower count", svg: svgHistogram(sizeHistogram(mutuals), { noun: "accounts" }) },
          ],
        }),
        htmlTableSection({ id: "mutuals", title: "Mutuals", columns: ["handle", "name", "followers", "tweets", "createdAt", "url"], rows: mutuals, chips: XU_USER_CHIPS }),
      ],
    }),
    csv: toCsv(rows),
    json: toJson({ generatedAt: new Date().toISOString(), owner, following: users.length, mutuals: mutuals.length, nonFollowers: rows }),
  },
  CONFIG.outputs,
  { clipboard: CONFIG.copyToClipboard },
);

if (CONFIG.saveSnapshot && owner) {
  saveSnapshot(snapshotKey("following", owner), makeSnapshot("following", owner, users));
  log.step("Following list stored locally for followers-diff.");
}

publishResult("nonFollowers", { owner, users, nonFollowers, mutuals, unknown }, `${users.length} following · ${mutuals.length} mutuals · ${nonFollowers.length} not following back`);
