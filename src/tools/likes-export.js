// @name Likes export
// @description Exports the posts you liked to Markdown, CSV and JSON.
// @page https://x.com/i/history/likes  (X moved likes here; the old /<handle>/likes URL also works)
// == CONFIG ==
const CONFIG = {
  outputs: ["html", "md", "csv", "json"], // formats to download: "html" (report), "md", "csv", "json"
  scrollDelayMs: 900, // pause between scroll steps; raise it if X rate-limits you
  stagnantRounds: 10, // stop after this many scroll steps without new posts
  maxTweets: 2000, // stop early after this many posts (likes lists can be huge)
  skipPromoted: true, // drop ads that X injects into the timeline
  refetchFirstPage: true, // bounce profile tabs so the first page gets full data
};
// == END CONFIG ==
log.banner("likes-export");
requireXHost();
requirePage([/^\/i\/history\/likes$/, /^\/[A-Za-z0-9_]+\/likes$/], "https://x.com/i/history/likes (your likes)");

const owner = pathHandle() || myHandle();

let tweets = await collectTweetTimeline({
  label: "liked posts",
  delayMs: CONFIG.scrollDelayMs,
  stagnantLimit: CONFIG.stagnantRounds,
  maxItems: CONFIG.maxTweets,
  refetchFirstPage: CONFIG.refetchFirstPage,
});
if (CONFIG.skipPromoted) tweets = tweets.filter((t) => !t.promoted);

console.log("");
log.ok(`Liked posts exported: ${tweets.length}`);
printTable(tweets, ["createdAt", "author", "text", "likes", "url"], 20);

const authors = new Set(tweets.map((t) => (t.author || "").toLowerCase()).filter(Boolean));
await writeOutputs(outputBaseName("likes", owner), {
  html: renderHtmlReport({
    tool: "likes-export",
    title: `Posts liked by @${owner}`,
    stats: [
      { label: "Liked posts", value: tweets.length },
      { label: "Authors", value: authors.size },
      { label: "With media", value: tweets.filter((t) => t.media && t.media.length).length },
    ],
    sections: [htmlCardsSection({ id: "likes", title: "Liked posts", tweets, note: "Most recently liked first, as shown by X.", empty: "No liked posts were found." })],
  }),
  md: tweetsToMarkdown(tweets, { title: `Posts liked by @${owner}` }),
  csv: toCsv(tweetsToRows(tweets), XU_TWEET_COLUMNS),
  json: toJson({ generatedAt: new Date().toISOString(), owner, count: tweets.length, tweets }),
}, CONFIG.outputs);

publishResult("likes", { owner, tweets }, `${tweets.length} liked posts exported`);
