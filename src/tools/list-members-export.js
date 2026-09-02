// @name List members export
// @description Exports the members (or followers) of any X List and flags which of them you follow.
// @page https://x.com/i/lists/<list_id>/members  (or /followers)
// == CONFIG ==
const CONFIG = {
  outputs: ["html", "csv", "json"], // formats to download: "html" (report), "csv", "json"
  copyToClipboard: false,
  scrollDelayMs: 800, // pause between scroll steps; raise it if X rate-limits you
  stagnantRounds: 8, // stop after this many scroll steps without new accounts
  maxUsers: Infinity,
  refetchFirstPage: true, // bounce Members/Followers tabs so the first page gets full data
};
// == END CONFIG ==
log.banner("list-members-export");
requireXHost();
requirePage([/^\/i\/lists\/\d+\/(members|followers)$/], "https://x.com/i/lists/<list_id>/members");

const [, listId, kind] = currentPath().match(/^\/i\/lists\/(\d+)\/(members|followers)$/);
// Only a visible heading inside the dialog or main column can be the list's
// name, and "List members" style headings are not names either.
const headingEl = [...document.querySelectorAll('[role="dialog"] h2[role="heading"], main h2[role="heading"]')].find((h) => h.offsetParent !== null);
const headingText = headingEl ? headingEl.textContent.trim() : "";
const listName = headingText && headingText.length <= 60 && !/member|miembro|seguidor|follower|abonn|mitglied|membr|atajo|shortcut/i.test(headingText) ? headingText : null;

const users = await collectUserList({
  label: `list ${kind}`,
  delayMs: CONFIG.scrollDelayMs,
  stagnantLimit: CONFIG.stagnantRounds,
  maxItems: CONFIG.maxUsers,
  refetchFirstPage: CONFIG.refetchFirstPage,
});

const notFollowed = users.filter((u) => u.youFollow === false);
const followingYou = users.filter((u) => u.followsYou === true);
console.log("");
log.ok(`List ${listId}${listName ? ` (${listName})` : ""} · ${kind}: ${users.length} · You follow: ${users.length - notFollowed.length - users.filter((u) => u.youFollow === null).length} · You do not follow: ${notFollowed.length} · Follow you: ${followingYou.length}`);
printTable(users, ["handle", "name", "youFollow", "followsYou", "followers", "tweets", "bio"], 30);

const columns = ["handle", "name", "id", "youFollow", "followsYou", "followers", "following", "tweets", "createdAt", "verified", "protected", "bio", "url"];
const rows = usersToRows(users, columns);
await writeOutputs(
  outputBaseName(`list-${kind}`, listId),
  {
    html: renderHtmlReport({
      tool: "list-members-export",
      title: `${listName || `List ${listId}`}: ${kind}`,
      subtitle: `List ${listId}. Accounts flagged with whether you follow them and whether they follow you.`,
      stats: [
        { label: kind === "members" ? "Members" : "Followers", value: users.length },
        { label: "You follow", value: users.filter((u) => u.youFollow === true).length, tone: "good" },
        { label: "You do not follow", value: notFollowed.length, tone: "accent" },
        { label: "Follow you", value: followingYou.length },
      ],
      breakdown: [
        { label: "You follow", value: users.filter((u) => u.youFollow === true).length, tone: "good" },
        { label: "You do not follow", value: notFollowed.length, tone: "accent" },
        { label: "Unknown", value: users.filter((u) => u.youFollow === null).length, tone: "neutral" },
      ],
      sections: [
        htmlTableSection({ id: kind, title: kind === "members" ? "Members" : "Followers", columns: ["handle", "name", "youFollow", "followsYou", "followers", "tweets", "createdAt", "bio", "url"], rows: users, empty: "The list is empty.", chips: [{ label: "You do not follow", key: "youFollow", op: "eq", value: false }, { label: "Follow you", key: "followsYou", op: "eq", value: true }, ...XU_USER_CHIPS] }),
        htmlChartSection({ id: "sizes", title: "Who is on the list", charts: [{ title: "Accounts by follower count", svg: svgHistogram(sizeHistogram(users), { noun: "accounts" }) }] }),
      ],
    }),
    csv: toCsv(rows, columns),
    json: toJson({ generatedAt: new Date().toISOString(), listId, listName, kind, count: users.length, accounts: rows }),
  },
  CONFIG.outputs,
  { clipboard: CONFIG.copyToClipboard },
);

publishResult("listMembers", { listId, listName, kind, users, notFollowed }, `${users.length} ${kind} · you do not follow ${notFollowed.length}`);
