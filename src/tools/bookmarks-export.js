// @name Bookmarks export
// @description Exports your bookmarks to Markdown, CSV and JSON with author, text, date, metrics and media links.
// @page https://x.com/i/history  (X moved bookmarks here; the old /i/bookmarks URL also works)
// == CONFIG ==
const CONFIG = {
  outputs: ["html", "md", "csv", "json"], // formats to download: "html" (report), "md", "csv", "json"
  scrollDelayMs: 900, // pause between scroll steps; raise it if X rate-limits you
  stagnantRounds: 10, // stop after this many scroll steps without new posts
  maxTweets: Infinity, // stop early after this many posts
  skipPromoted: true, // drop ads that X injects into the timeline
};
// == END CONFIG ==
log.banner("bookmarks-export");
requireXHost();
requirePage([/^\/i\/(history|bookmarks)(\/\d+)?$/], "https://x.com/i/history (your bookmarks)");

const owner = myHandle();
const folder = (currentPath().match(/^\/i\/(?:history|bookmarks)\/(\d+)$/) || [])[1] || null;

let tweets = await collectTweetTimeline({
  label: "bookmarks",
  delayMs: CONFIG.scrollDelayMs,
  stagnantLimit: CONFIG.stagnantRounds,
  maxItems: CONFIG.maxTweets,
  refetchFirstPage: true, // bookmark folders render as tabs when you have any
});
if (CONFIG.skipPromoted) tweets = tweets.filter((t) => !t.promoted);

console.log("");
log.ok(`Bookmarks exported: ${tweets.length}`);
printTable(tweets, ["createdAt", "author", "text", "likes", "url"], 20);

const base = outputBaseName("bookmarks", owner, folder && `folder-${folder}`);
const authors = new Set(tweets.map((t) => (t.author || "").toLowerCase()).filter(Boolean));
await writeOutputs(base, {
  html: renderHtmlReport({
    tool: "bookmarks-export",
    title: `Bookmarks of @${owner || "me"}${folder ? ` (folder ${folder})` : ""}`,
    stats: [
      { label: "Bookmarks", value: tweets.length },
      { label: "Authors", value: authors.size },
      { label: "With media", value: tweets.filter((t) => t.media && t.media.length).length },
    ],
    sections: [htmlCardsSection({ id: "bookmarks", title: "Bookmarks", tweets, note: "Newest bookmark first, as shown by X.", empty: "No bookmarks were found." })],
  }),
  md: tweetsToMarkdown(tweets, { title: `Bookmarks of @${owner || "me"}${folder ? ` (folder ${folder})` : ""}` }),
  csv: toCsv(tweetsToRows(tweets), XU_TWEET_COLUMNS),
  json: toJson({ generatedAt: new Date().toISOString(), owner, folder, count: tweets.length, tweets }),
}, CONFIG.outputs);

publishResult("bookmarks", { owner, folder, tweets }, `${tweets.length} bookmarks exported`);
