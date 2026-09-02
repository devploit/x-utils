// @name Followers diff
// @description Compares your followers (or following) list with the previous run and reports who left, who arrived and who renamed.
// @page https://x.com/<your_handle>/followers  (or /following)
// == CONFIG ==
const CONFIG = {
  outputs: ["html", "csv", "json"], // formats to download for the changes: "html" (report), "csv", "json"
  downloadSnapshot: true, // also download the full snapshot as JSON (survives cleared browser storage)
  copyToClipboard: false,
  scrollDelayMs: 800, // pause between scroll steps; raise it if X rate-limits you
  stagnantRounds: 8, // stop after this many scroll steps without new accounts
  maxUsers: Infinity, // stop early after this many accounts (partial lists produce misleading diffs)
  refetchFirstPage: true, // bounce tabs so the first page also gets IDs (more reliable diffs)
  saveSnapshot: true, // replace the stored snapshot with this run
  previousSnapshot: null, // paste a previously downloaded snapshot object here to compare against it instead of local storage
};
// == END CONFIG ==
log.banner("followers-diff");
requireXHost();
requirePage([/^\/[A-Za-z0-9_]+\/(followers|following)$/], "https://x.com/<your_handle>/followers or /following");

const owner = pathHandle();
const kind = currentPath().endsWith("/followers") ? "followers" : "following";
const key = snapshotKey(kind, owner);
const previous = CONFIG.previousSnapshot || loadSnapshot(key);

if (previous) log.info(`Comparing against the ${kind} snapshot taken ${previous.takenAt} (${previous.count} accounts).`);
else log.info(`No previous ${kind} snapshot for @${owner}. This run creates the baseline.`);

const users = await collectUserList({
  label: kind,
  delayMs: CONFIG.scrollDelayMs,
  stagnantLimit: CONFIG.stagnantRounds,
  maxItems: CONFIG.maxUsers,
  refetchFirstPage: CONFIG.refetchFirstPage,
});

const snapshot = makeSnapshot(kind, owner, users);
const base = outputBaseName(`${kind}-diff`, owner);
let result = { owner, kind, current: users, previous, diff: null, history: [] };

// A list X cut short must never replace the stored baseline or enter the history:
// it would make everyone who was not served look like they left.
const partial = !!partialListNote(users, kind);
if (partial) {
  CONFIG.saveSnapshot = false;
  log.warn("This run is partial, so the stored snapshot and the history are left untouched. Run again later to update them.");
}

// One point per run so the report can draw the trend across all snapshots.
const history = CONFIG.saveSnapshot ? appendHistory(historyKey(kind, owner), { takenAt: snapshot.takenAt, count: users.length }) : loadHistory(historyKey(kind, owner));
result.history = history;
const trendSection = history.length >= 2
  ? htmlChartSection({ id: "trend", title: "Over time", note: `${history.length} snapshots taken with this tool in this browser.`, charts: [{ title: `${kind === "followers" ? "Followers" : "Following"} per snapshot`, svg: svgTrend(history.map((p) => ({ date: p.takenAt, value: p.count })), { valueLabel: kind }) }] })
  : "";

if (previous) {
  const diff = diffUserLists(previous.users || [], users);
  const gainedLabel = kind === "followers" ? "New followers" : "Newly followed";
  const lostLabel = kind === "followers" ? "Unfollowed you" : "No longer followed";
  console.log("");
  log.ok(`${kind === "followers" ? "Followers" : "Following"}: ${previous.count} → ${users.length} · ${gainedLabel}: ${diff.added.length} · ${lostLabel}: ${diff.removed.length} · Renamed: ${diff.renamed.length}`);
  if (diff.removed.length) {
    log.info(`${lostLabel}:`);
    printTable(diff.removed, ["handle", "name"], 50);
  }
  if (diff.added.length) {
    log.info(`${gainedLabel}:`);
    printTable(diff.added, ["handle", "name", "followers", "tweets", "createdAt"], 50);
  }
  if (diff.renamed.length) {
    log.info("Renamed accounts:");
    console.table(diff.renamed);
  }
  const rows = [
    ...diff.removed.map((u) => ({ change: "removed", handle: u.handle, name: u.name, id: u.id, url: `https://x.com/${u.handle}` })),
    ...diff.added.map((u) => ({ change: "added", handle: u.handle, name: u.name, id: u.id, url: `https://x.com/${u.handle}` })),
    ...diff.renamed.map((r) => ({ change: "renamed", handle: r.to, name: `was @${r.from}`, id: r.id, url: `https://x.com/${r.to}` })),
  ];
  await writeOutputs(
    base,
    {
      html: renderHtmlReport({
        tool: "followers-diff",
        title: `${kind === "followers" ? "Follower" : "Following"} changes for @${owner}`,
        subtitle: `Compared with the snapshot taken ${fmtDate(previous.takenAt)}.`,
        stats: [
          { label: `Before (${fmtDate(previous.takenAt)})`, value: previous.count },
          { label: "Now", value: users.length },
          { label: gainedLabel, value: diff.added.length, tone: "good", href: "#added" },
          { label: lostLabel, value: diff.removed.length, tone: "bad", href: "#removed" },
          { label: "Renamed", value: diff.renamed.length, href: "#renamed" },
        ],
        notes: [partialListNote(users, kind), partialListNote(users, kind) ? "Because the list is partial, accounts that were not served look like they left. Do not trust the removed list from this run." : null].filter(Boolean),
        breakdown: [
          { label: gainedLabel, value: diff.added.length, tone: "good" },
          { label: lostLabel, value: diff.removed.length, tone: "bad" },
        ],
        sections: [
          trendSection,
          htmlTableSection({ id: "removed", title: lostLabel, columns: ["handle", "name", "id"], rows: diff.removed, empty: "Nobody left." }),
          htmlTableSection({ id: "added", title: gainedLabel, columns: ["handle", "name", "followers", "tweets", "createdAt", "url"], rows: diff.added, empty: "Nobody new.", chips: XU_USER_CHIPS }),
          htmlTableSection({ id: "renamed", title: "Renamed accounts", columns: ["handle", "name", "id"], rows: diff.renamed.map((r) => ({ handle: r.to, name: `was @${r.from}`, id: r.id })), empty: "No renames." }),
        ],
      }),
      csv: toCsv(rows, ["change", "handle", "name", "id", "url"]),
      json: toJson({ generatedAt: new Date().toISOString(), owner, kind, previousTakenAt: previous.takenAt, previousCount: previous.count, currentCount: users.length, ...diff }),
    },
    CONFIG.outputs,
    { clipboard: CONFIG.copyToClipboard },
  );
  result.diff = diff;
} else {
  console.log("");
  log.ok(`Baseline created with ${users.length} ${kind}. Run this tool again later to see what changed.`);
  if (CONFIG.outputs.includes("html")) {
    await writeOutputs(base, {
      html: renderHtmlReport({
        tool: "followers-diff",
        title: `${kind === "followers" ? "Followers" : "Following"} baseline for @${owner}`,
        subtitle: "First run. Run followers-diff again later and the report will show who left, who arrived and who renamed.",
        stats: [{ label: kind === "followers" ? "Followers" : "Following", value: users.length }],
        sections: [trendSection, htmlTableSection({ id: "baseline", title: "Snapshot", columns: ["handle", "name", "followers", "tweets", "createdAt", "url"], rows: users, chips: XU_USER_CHIPS })],
      }),
    }, ["html"]);
  }
}

if (CONFIG.saveSnapshot) {
  if (saveSnapshot(key, snapshot)) log.step(`Snapshot stored in this browser under "${key}".`);
}
if (CONFIG.downloadSnapshot) {
  saveFile(`${outputBaseName(`${kind}-snapshot`, owner)}.json`, toJson(snapshot), "application/json");
}

publishResult("followersDiff", result, result.diff ? `${users.length} ${kind} · +${result.diff.added.length} · -${result.diff.removed.length}` : `Baseline saved: ${users.length} ${kind}`);
