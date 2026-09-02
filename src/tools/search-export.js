// @name Search export
// @description Exports the results of an X search (any query, any tab) to CSV, JSON and Markdown.
// @page https://x.com/search?q=<your query>&f=live
// == CONFIG ==
const CONFIG = {
  outputs: ["html", "csv", "json"], // formats to download: "html" (report), "csv", "json", "md"
  scrollDelayMs: 1000, // pause between scroll steps; search is rate-limited more aggressively
  stagnantRounds: 10, // stop after this many scroll steps without new posts
  maxTweets: 500, // stop early after this many posts
  skipPromoted: true, // drop ads that X injects into the results
  refetchFirstPage: true, // bounce Top/Latest tabs so the first page gets full data
};
// == END CONFIG ==
log.banner("search-export");
requireXHost();
requirePage(["/search"], "https://x.com/search?q=...");

const params = new URLSearchParams(location.search);
const query = params.get("q") || "";
const tab = { live: "latest", user: "people", media: "media", list: "lists" }[params.get("f")] || "top";
if (!query) log.warn("No q= parameter in the URL; exporting whatever the page shows.");
log.info(`Query: ${query || "(none)"} · Tab: ${tab}`);

let tweets = await collectTweetTimeline({
  label: "results",
  delayMs: CONFIG.scrollDelayMs,
  stagnantLimit: CONFIG.stagnantRounds,
  maxItems: CONFIG.maxTweets,
  refetchFirstPage: CONFIG.refetchFirstPage,
});
if (CONFIG.skipPromoted) tweets = tweets.filter((t) => !t.promoted);

console.log("");
log.ok(`Results exported: ${tweets.length}`);
printTable(tweets, ["createdAt", "author", "text", "likes", "retweets", "url"], 20);

const authors = new Set(tweets.map((t) => (t.author || "").toLowerCase()).filter(Boolean));
await writeOutputs(outputBaseName("search", query, tab), {
  html: renderHtmlReport({
    tool: "search-export",
    title: `Search: ${query || "(no query)"}`,
    subtitle: `Results from the ${tab} tab, as shown by X.`,
    stats: [
      { label: "Results", value: tweets.length },
      { label: "Authors", value: authors.size },
      { label: "Tab", value: tab },
    ],
    sections: [htmlCardsSection({ id: "results", title: "Results", tweets, empty: "The search returned no posts." })],
  }),
  csv: toCsv(tweetsToRows(tweets), XU_TWEET_COLUMNS),
  json: toJson({ generatedAt: new Date().toISOString(), query, tab, count: tweets.length, tweets }),
  md: tweetsToMarkdown(tweets, { title: `Search results for "${query}"`, subtitle: `Tab: ${tab}` }),
}, CONFIG.outputs);

publishResult("search", { query, tab, tweets }, `${tweets.length} results exported`);
