// @name Thread unroll
// @description Reconstructs a thread from any post in it and exports it as clean Markdown, plain text and JSON.
// @page https://x.com/<handle>/status/<id>  (any post of the thread)
// == CONFIG ==
const CONFIG = {
  outputs: ["html", "md", "txt", "json"], // formats to download: "html" (report), "md", "txt", "json"
  copyToClipboard: true, // copy the Markdown to the clipboard as well
  scrollDelayMs: 900, // pause between scroll steps
  stagnantRounds: 6, // stop after this many scroll steps without new posts
  maxTweets: 300, // safety cap for very long conversations
  stopAfterStrangers: 30, // stop once this many posts by other people follow the author's last post
};
// == END CONFIG ==
log.banner("thread-unroll");
requireXHost();
requirePage([/^\/[A-Za-z0-9_]+\/status\/\d+/], "https://x.com/<handle>/status/<id>");

const focalId = currentPath().match(/\/status\/(\d+)/)[1];
const focalAuthor = pathHandle();

const collected = await collectTweetTimeline({
  label: "posts in conversation",
  delayMs: CONFIG.scrollDelayMs,
  stagnantLimit: CONFIG.stagnantRounds,
  maxItems: CONFIG.maxTweets,
  refetchFirstPage: true, // leave through a profile link and come back so X re-sends the conversation with reply metadata
  expandThreads: true, // click "Show more replies" / "Show this thread" while scrolling
  // The conversation below a thread is other people's replies; stop once the author has gone quiet.
  stopWhen: (tweets) => {
    const author = (focalAuthor || "").toLowerCase();
    const seen = tweets.filter((t) => !t.offscreen); // only what has actually scrolled past
    let strangers = 0;
    for (let i = seen.length - 1; i >= 0 && (seen[i].author || "").toLowerCase() !== author; i--) strangers++;
    return strangers >= CONFIG.stopAfterStrangers;
  },
});

const thread = buildThreadChain(collected, focalId);
if (!thread.tweets.length) {
  log.error("Could not find the focal post in the collected data. Scroll to the top of the page and run again.");
  throw new Error("x-utils: focal tweet missing");
}
if (thread.method === "dom-order") log.warn("Reply metadata was unavailable; the thread was rebuilt from on-screen order and may include the author's unrelated replies.");
if (thread.tweets.length === 1) log.warn("Only one post by the author was found. Either this is not a thread or X did not load the continuation.");

const author = thread.author || (focalAuthor || "").toLowerCase();
const first = thread.tweets[0];
const title = `Thread by @${author}${first && first.text ? `: ${first.text.split("\n")[0].slice(0, 80)}` : ""}`;

console.log("");
log.ok(`Thread by @${author}: ${thread.tweets.length} posts (${thread.method}).`);
printTable(thread.tweets, ["createdAt", "text", "likes", "url"], 50);

const markdown = threadToMarkdown(thread.tweets, { author, title });
await writeOutputs(
  outputBaseName("thread", author, focalId),
  {
    html: renderHtmlReport({
      tool: "thread-unroll",
      title,
      subtitle: `A thread by @${author}, ${thread.tweets.length} posts, starting ${fmtDate(first && first.createdAt)}.`,
      stats: [
        { label: "Posts", value: thread.tweets.length },
        { label: "Author", value: `@${author}` },
        { label: "Likes on first post", value: first && first.likes !== null && first.likes !== undefined ? first.likes : "·" },
        { label: "Rebuilt from", value: { "reply-chain": "reply chain", "reply-chain+order": "reply chain + screen order", "dom-order": "on-screen order", "focal-only": "single post" }[thread.method] || thread.method },
      ],
      notes: thread.method === "dom-order" ? ["Reply metadata was unavailable; the order follows what was on screen and may include unrelated replies by the author."] : [],
      sections: [htmlCardsSection({ id: "thread", title: "Thread", tweets: thread.tweets, numbered: true })],
    }),
    md: markdown,
    txt: threadToPlainText(thread.tweets),
    json: toJson({ generatedAt: new Date().toISOString(), author, focalId, method: thread.method, count: thread.tweets.length, tweets: thread.tweets }),
  },
  CONFIG.outputs,
  { clipboard: CONFIG.copyToClipboard },
);

publishResult("thread", { author, focalId, method: thread.method, tweets: thread.tweets, conversation: collected }, `Thread by @${author}: ${thread.tweets.length} posts`);
