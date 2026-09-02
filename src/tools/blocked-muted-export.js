// @name Blocked & muted export
// @description Exports your blocked or muted accounts to CSV/JSON so the lists exist outside of X.
// @page https://x.com/settings/blocked/all  (or https://x.com/settings/muted/all)
// == CONFIG ==
const CONFIG = {
  outputs: ["html", "csv", "json"], // formats to download: "html" (report), "csv", "json"
  copyToClipboard: false,
  scrollDelayMs: 800, // pause between scroll steps; raise it if X rate-limits you
  stagnantRounds: 8, // stop after this many scroll steps without new accounts
  maxUsers: Infinity,
};
// == END CONFIG ==
log.banner("blocked-muted-export");
requireXHost();
requirePage([/^\/settings\/(blocked|muted)(\/all|\/imported)?$/], "https://x.com/settings/blocked/all or https://x.com/settings/muted/all");

const kind = currentPath().includes("/blocked") ? "blocked" : "muted";
const owner = myHandle();

const users = await collectUserList({
  label: `${kind} accounts`,
  delayMs: CONFIG.scrollDelayMs,
  stagnantLimit: CONFIG.stagnantRounds,
  maxItems: CONFIG.maxUsers,
  refetchFirstPage: true, // no tabs here, so the tool leaves via a profile link and comes back, then looks accounts up one by one
});

console.log("");
log.ok(`${kind === "blocked" ? "Blocked" : "Muted"} accounts: ${users.length}`);
printTable(users, ["handle", "name", "followers", "tweets", "createdAt", "bio"], 30);

const columns = ["handle", "name", "id", "followers", "following", "tweets", "createdAt", "verified", "protected", "bio", "url"];
const rows = usersToRows(users, columns);
await writeOutputs(
  outputBaseName(`${kind}-accounts`, owner),
  {
    html: renderHtmlReport({
      tool: "blocked-muted-export",
      title: `${kind === "blocked" ? "Blocked" : "Muted"} accounts of @${owner || "me"}`,
      stats: [{ label: kind === "blocked" ? "Blocked" : "Muted", value: users.length }],
      sections: [htmlTableSection({ id: kind, title: `${kind === "blocked" ? "Blocked" : "Muted"} accounts`, columns: ["handle", "name", "followers", "tweets", "createdAt", "bio", "url"], rows: users, empty: `You have no ${kind} accounts.` })],
    }),
    csv: toCsv(rows, columns),
    json: toJson({ generatedAt: new Date().toISOString(), owner, kind, count: users.length, accounts: rows }),
  },
  CONFIG.outputs,
  { clipboard: CONFIG.copyToClipboard },
);

publishResult(`${kind}Accounts`, { owner, kind, users }, `${users.length} ${kind} accounts exported`);
