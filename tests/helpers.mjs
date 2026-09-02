// Loads src/lib/* into a plain object so pure functions can be unit-tested in
// Node. The runtime only touches browser globals at call time, never at load.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const libDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "lib");

let cached = null;

export async function loadLib() {
  if (cached) return cached;
  const files = (await readdir(libDir)).filter((f) => f.endsWith(".js")).sort();
  const source = (await Promise.all(files.map((f) => readFile(path.join(libDir, f), "utf8")))).join("\n");
  const names = new Set(["log"]);
  for (const m of source.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) names.add(m[1]);
  for (const m of source.matchAll(/^const\s+(XU_[A-Z0-9_]+|xuDebug|xuRequests|xuCursors)\s*=/gm)) names.add(m[1]);
  const factory = new Function(`${source}\nreturn { ${[...names].join(", ")} };`);
  cached = factory();
  return cached;
}

// Minimal GraphQL user result in the 2025+ field layout (core/avatar/relationship_perspectives).
export function graphqlUser({ id = "42", handle = "alice", name = "Alice", followers = 120, following = 80, tweets = 900, createdAt = "Wed Oct 10 20:19:24 +0000 2018", followedBy = true, following_ = false, avatar = "https://pbs.twimg.com/profile_images/1/x_normal.jpg", bio = "hello" } = {}) {
  return {
    __typename: "User",
    rest_id: id,
    core: { name, screen_name: handle, created_at: createdAt },
    avatar: { image_url: avatar },
    is_blue_verified: false,
    privacy: { protected: false },
    relationship_perspectives: { followed_by: followedBy, following: following_ },
    legacy: { description: bio, followers_count: followers, friends_count: following, statuses_count: tweets, favourites_count: 10, listed_count: 1, media_count: 5 },
  };
}

export function graphqlTweet({ id = "1001", author = graphqlUser(), text = "Hello world https://t.co/abc", createdAt = "Mon Sep 01 10:00:00 +0000 2026", likes = 5, retweets = 1, replies = 2, quotes = 0, views = "1000", inReplyTo = null, urls = [{ url: "https://t.co/abc", expanded_url: "https://example.com/post" }], media = [], quoted = null, retweeted = null, note = null } = {}) {
  const tweet = {
    __typename: "Tweet",
    rest_id: id,
    core: { user_results: { result: author } },
    views: { count: views },
    legacy: {
      full_text: text,
      created_at: createdAt,
      favorite_count: likes,
      retweet_count: retweets,
      reply_count: replies,
      quote_count: quotes,
      bookmark_count: 0,
      conversation_id_str: "1000",
      in_reply_to_status_id_str: inReplyTo,
      in_reply_to_screen_name: inReplyTo ? author.core.screen_name : null,
      entities: { urls, hashtags: [], user_mentions: [], media },
      extended_entities: media.length ? { media } : undefined,
      lang: "en",
    },
  };
  if (quoted) tweet.quoted_status_result = { result: quoted };
  if (retweeted) tweet.legacy.retweeted_status_result = { result: retweeted };
  if (note) tweet.note_tweet = { note_tweet_results: { result: { text: note, entity_set: { urls, hashtags: [], user_mentions: [] } } } };
  return tweet;
}

// Wraps entries the way a timeline response does.
export function timelineResponse(results) {
  return {
    data: {
      user: {
        result: {
          timeline: {
            timeline: {
              instructions: [
                {
                  type: "TimelineAddEntries",
                  entries: results.map((r, i) => ({ entryId: `entry-${i}`, content: { itemContent: r.__typename === "User" ? { user_results: { result: r } } : { tweet_results: { result: r } } } })),
                },
              ],
            },
          },
        },
      },
    },
  };
}
