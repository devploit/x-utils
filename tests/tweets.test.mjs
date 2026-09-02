import { test } from "node:test";
import assert from "node:assert/strict";
import { graphqlTweet, graphqlUser, loadLib } from "./helpers.mjs";

const lib = await loadLib();

test("normalizeTweet expands t.co links, strips media links and decodes entities", () => {
  const media = [{ type: "photo", url: "https://t.co/pic", media_url_https: "https://pbs.twimg.com/media/abc.jpg" }];
  const t = lib.normalizeTweet(graphqlTweet({ text: "Look &amp; see https://t.co/abc https://t.co/pic", media }));
  assert.equal(t.text, "Look & see https://example.com/post");
  assert.deepEqual(t.media, ["https://pbs.twimg.com/media/abc.jpg?name=orig"]);
  assert.deepEqual(t.mediaTypes, ["photo"]);
  assert.deepEqual(t.links, ["https://example.com/post"]);
  assert.equal(t.author, "alice");
  assert.equal(t.url, "https://x.com/alice/status/1001");
  assert.equal(t.views, 1000);
  assert.equal(t.createdAt, "2026-09-01T10:00:00.000Z");
});

test("normalizeTweet prefers the long-form note text and picks the best video variant", () => {
  const media = [
    {
      type: "video",
      url: "https://t.co/vid",
      media_url_https: "https://pbs.twimg.com/thumb.jpg",
      video_info: {
        variants: [
          { content_type: "application/x-mpegURL", url: "https://video.twimg.com/playlist.m3u8" },
          { content_type: "video/mp4", bitrate: 256000, url: "https://video.twimg.com/low.mp4" },
          { content_type: "video/mp4", bitrate: 2176000, url: "https://video.twimg.com/high.mp4" },
        ],
      },
    },
  ];
  const t = lib.normalizeTweet(graphqlTweet({ text: "short https://t.co/vid", note: "This is the full long-form text of the post.", media }));
  assert.equal(t.text, "This is the full long-form text of the post.");
  assert.deepEqual(t.media, ["https://video.twimg.com/high.mp4"]);
});

test("normalizeTweet rewrites reposts with the original author and full text", () => {
  const original = graphqlTweet({ id: "77", author: graphqlUser({ handle: "source" }), text: "the whole original text without truncation", urls: [] });
  const t = lib.normalizeTweet(graphqlTweet({ id: "78", text: "RT @source: the whole original text withou…", urls: [], retweeted: original }));
  assert.equal(t.isRetweet, true);
  assert.equal(t.text, "RT @source: the whole original text without truncation");
  assert.equal(t.retweetedUrl, "https://x.com/source/status/77");
});

test("normalizeTweet unwraps TweetWithVisibilityResults", () => {
  const inner = graphqlTweet({ id: "90" });
  delete inner.__typename;
  const t = lib.normalizeTweet({ __typename: "TweetWithVisibilityResults", tweet: inner });
  assert.equal(t.id, "90");
});

test("normalizeTweet records reply and quote metadata", () => {
  const quoted = graphqlTweet({ id: "5", author: graphqlUser({ handle: "q" }) });
  const t = lib.normalizeTweet(graphqlTweet({ id: "6", inReplyTo: "4", quoted }));
  assert.equal(t.isReply, true);
  assert.equal(t.inReplyToId, "4");
  assert.equal(t.isQuote, true);
  assert.equal(t.quotedUrl, "https://x.com/q/status/5");
});

test("parseMetricsLabel understands English and Spanish action-bar labels", () => {
  assert.deepEqual(lib.parseMetricsLabel("12 replies, 3 reposts, 45 likes, 2 bookmarks, 1,234 views"), { replies: 12, retweets: 3, likes: 45, bookmarks: 2, views: 1234 });
  assert.deepEqual(lib.parseMetricsLabel("1 respuesta, 2 reposteos, 3 me gusta, 4.567 reproducciones"), { replies: 1, retweets: 2, likes: 3, bookmarks: null, views: 4567 });
  assert.deepEqual(lib.parseMetricsLabel(""), { replies: null, retweets: null, likes: null, bookmarks: null, views: null });
});

test("expandUrls replaces every occurrence of a short link", () => {
  assert.equal(lib.expandUrls("a https://t.co/x b https://t.co/x", [{ url: "https://t.co/x", expanded_url: "https://long.example" }]), "a https://long.example b https://long.example");
  assert.equal(lib.expandUrls("plain", undefined), "plain");
});

test("mergeTweetRecords keeps DOM promoted flag and fills metrics from the API", () => {
  const dom = { id: "1", text: "", likes: null, media: ["https://pbs/thumb.jpg"], promoted: true, source: "dom" };
  const api = { id: "1", text: "full", likes: 10, media: [], source: "api" };
  const merged = lib.mergeTweetRecords(dom, api);
  assert.equal(merged.text, "full");
  assert.equal(merged.likes, 10);
  assert.deepEqual(merged.media, ["https://pbs/thumb.jpg"], "an empty API array must not erase DOM media");
  assert.equal(merged.promoted, true);
  assert.equal(merged.enriched, true);
});

test("normalizeTweet drops the trailing link to the quoted post from the text", () => {
  const quoted = graphqlTweet({ id: "5", author: graphqlUser({ handle: "q" }), urls: [] });
  const t = lib.normalizeTweet(graphqlTweet({ id: "6", text: "Look at this https://t.co/qq", urls: [{ url: "https://t.co/qq", expanded_url: "https://x.com/q/status/5" }], quoted }));
  assert.equal(t.text, "Look at this");
  assert.equal(t.quotedUrl, "https://x.com/q/status/5");
});
