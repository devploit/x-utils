// ---------------------------------------------------------------------------
// Tweets: normalisation of API objects, DOM article parsing and the timeline
// collector that merges both sources.
// ---------------------------------------------------------------------------

function expandUrls(text, urls) {
  let out = text || "";
  for (const u of urls || []) {
    if (u && u.url && u.expanded_url) out = out.split(u.url).join(u.expanded_url);
  }
  return out;
}

function bestVideoVariant(variants) {
  return (variants || [])
    .filter((v) => v.content_type === "video/mp4" && v.url)
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0] || null;
}

// Returns [{ type, url, tco }] for the media attached to a tweet.
function extractMedia(mediaList) {
  const out = [];
  for (const m of mediaList || []) {
    if (!m) continue;
    let url = null;
    if (m.type === "photo" && m.media_url_https) url = `${m.media_url_https}?name=orig`;
    else if ((m.type === "video" || m.type === "animated_gif") && m.video_info) {
      const best = bestVideoVariant(m.video_info.variants);
      url = best ? best.url : m.media_url_https || null;
    } else url = m.media_url_https || null;
    if (url) out.push({ type: m.type || "media", url, tco: m.url || null });
  }
  return out;
}

function tweetUrl(handle, id) {
  return handle ? `https://x.com/${handle}/status/${id}` : `https://x.com/i/status/${id}`;
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Normalises a GraphQL Tweet result (already unwrapped from visibility wrappers).
function normalizeTweet(raw) {
  const tweet = unwrapTweet(raw);
  const legacy = tweet.legacy || {};
  const authorRaw = tweet.core && tweet.core.user_results && tweet.core.user_results.result;
  const author = authorRaw ? normalizeUser(authorRaw) : null;
  const note = tweet.note_tweet && tweet.note_tweet.note_tweet_results && tweet.note_tweet.note_tweet_results.result;
  const entities = (note && note.entity_set) || legacy.entities || {};
  const media = extractMedia((legacy.extended_entities || legacy.entities || {}).media);

  let text = expandUrls((note && note.text) || legacy.full_text || "", entities.urls);
  for (const m of media) if (m.tco) text = text.split(m.tco).join("").trim();
  text = decodeHtmlEntities(text);

  const retweeted = legacy.retweeted_status_result && unwrapTweet(legacy.retweeted_status_result.result);
  const quoted = tweet.quoted_status_result && unwrapTweet(tweet.quoted_status_result.result);
  let retweetedTweet = null;
  if (retweeted && retweeted.legacy) {
    retweetedTweet = normalizeTweet(retweeted);
    text = `RT @${retweetedTweet.author || "unknown"}: ${retweetedTweet.text}`;
  }
  const quotedTweet = quoted && quoted.legacy ? normalizeTweet(quoted) : null;
  // X appends the quoted post's link to the text; the card already shows it as "Quoting".
  if (quotedTweet) {
    const quotedLink = new RegExp(`\\s*https?://(?:x|twitter)\\.com/[A-Za-z0-9_]+/status/${quotedTweet.id}(?:\\?\\S*)?\\s*$`);
    text = text.replace(quotedLink, "").trim();
  }

  const id = String(tweet.rest_id || legacy.id_str || "");
  const handle = author ? author.handle : null;
  return {
    id,
    url: tweetUrl(handle, id),
    author: handle,
    authorName: author ? author.name : null,
    authorId: author ? author.id : legacy.user_id_str || null,
    authorAvatar: author ? author.avatar : null,
    createdAt: parseTwitterDate(legacy.created_at),
    text,
    lang: legacy.lang || null,
    replies: num(legacy.reply_count),
    retweets: num(legacy.retweet_count),
    likes: num(legacy.favorite_count),
    quotes: num(legacy.quote_count),
    bookmarks: num(legacy.bookmark_count),
    views: tweet.views && tweet.views.count !== undefined ? num(tweet.views.count) : null,
    isRetweet: !!retweetedTweet,
    isQuote: !!quotedTweet || !!legacy.is_quote_status,
    isReply: !!legacy.in_reply_to_status_id_str,
    inReplyToId: legacy.in_reply_to_status_id_str || null,
    inReplyToUser: legacy.in_reply_to_screen_name || null,
    conversationId: legacy.conversation_id_str || null,
    quotedUrl: quotedTweet ? quotedTweet.url : null,
    retweetedUrl: retweetedTweet ? retweetedTweet.url : null,
    media: media.map((m) => m.url),
    mediaTypes: media.map((m) => m.type),
    hashtags: (entities.hashtags || []).map((h) => h.text),
    mentions: (entities.user_mentions || []).map((m) => m.screen_name),
    links: (entities.urls || []).map((u) => u.expanded_url).filter(Boolean),
    source: "api",
  };
}

// Parses the accessible label of a tweet's action bar, e.g.
// "12 replies, 3 reposts, 45 likes, 2 bookmarks, 1234 views".
function parseMetricsLabel(label) {
  const grab = (re) => {
    const m = (label || "").match(re);
    return m ? num(m[1].replace(/[.,\s]/g, "")) : null;
  };
  return {
    replies: grab(/([\d.,\s]+)\s*(repl|respuesta|comentario|réponse|antwort|rispost)/i),
    retweets: grab(/([\d.,\s]+)\s*(repost|retweet|reposteo|republicaci|partage)/i),
    likes: grab(/([\d.,\s]+)\s*(like|me gusta|j'aime|gefällt|mi piace)/i),
    bookmarks: grab(/([\d.,\s]+)\s*(bookmark|marcador|(?:elementos? )?guardado|signet|lesezeichen|segnalibr)/i),
    views: grab(/([\d.,\s]+)\s*(view|visualizaci|vue|ansicht|reproducci)/i),
  };
}

const XU_REPOST_CONTEXT_RE = /\b(reposted|retweeted|reposteó|retwitteó|a reposté|hat repostet|ha ripostato)\b/i;
const XU_AD_LABEL_RE = /^(ad|promoted|anuncio|promocionado|sponsorisé|anzeige|sponsorizzato)$/i;

// Text of a rendered post. X splits long links into several spans that
// innerText joins with line breaks, so links are rebuilt without whitespace and
// emoji images are replaced by their alt text.
function readTweetText(el) {
  if (!el) return "";
  const parts = [];
  const walk = (node) => {
    if (node.nodeType === 3) {
      parts.push(node.nodeValue);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    if (tag === "BR") {
      parts.push("\n");
      return;
    }
    if (tag === "IMG") {
      parts.push(node.getAttribute("alt") || "");
      return;
    }
    if (tag === "A") {
      parts.push(node.textContent.replace(/\s+/g, ""));
      return;
    }
    for (const child of node.childNodes) walk(child);
  };
  walk(el);
  return parts.join("").replace(/[ \t]+\n/g, "\n").trim();
}

// Parses one `article[data-testid="tweet"]` element.
function readTweetArticle(article) {
  const timeEl = article.querySelector('a[href*="/status/"] time');
  const link = timeEl ? timeEl.closest("a") : article.querySelector('a[href*="/status/"]');
  if (!link) return null;
  const match = link.getAttribute("href").match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)/);
  if (!match) return null;
  const [, author, id] = match;

  const textEl = article.querySelector('[data-testid="tweetText"]');
  const nameEl = article.querySelector('[data-testid="User-Name"] a[href^="/"] span');
  const avatarEl = article.querySelector('[data-testid^="UserAvatar-Container"] img, [data-testid="Tweet-User-Avatar"] img');
  const group = article.querySelector('[role="group"][aria-label]');
  const context = article.querySelector('[data-testid="socialContext"]');
  const promoted = [...article.querySelectorAll("span")].some((s) => XU_AD_LABEL_RE.test(s.textContent.trim()));
  // Photos of a quoted post live inside a nested role="link" card; skip them.
  // The same photo can also be rendered twice at different sizes, so dedupe by path.
  const seenMedia = new Set();
  const media = [];
  for (const el of article.querySelectorAll('[data-testid="tweetPhoto"] img, video')) {
    if (el.closest('[role="link"][tabindex="0"]') && el.closest('[role="link"][tabindex="0"]') !== article) continue;
    const src = el.tagName === "VIDEO" ? el.getAttribute("poster") || el.src : el.src;
    if (!src) continue;
    const key = src.split("?")[0];
    if (seenMedia.has(key)) continue;
    seenMedia.add(key);
    media.push(src);
  }
  return {
    id,
    url: tweetUrl(author, id),
    author,
    authorName: nameEl ? nameEl.textContent.trim() : null,
    authorAvatar: avatarEl ? avatarEl.getAttribute("src") : null,
    createdAt: timeEl ? timeEl.getAttribute("datetime") : null,
    text: readTweetText(textEl),
    ...parseMetricsLabel(group ? group.getAttribute("aria-label") : ""),
    isRetweet: !!(context && XU_REPOST_CONTEXT_RE.test(context.textContent)),
    isReply: false,
    promoted,
    media,
    source: "dom",
  };
}

function mergeTweetRecords(domTweet, apiTweet) {
  if (!apiTweet) return { ...domTweet, enriched: false };
  const merged = { ...domTweet };
  for (const [key, value] of Object.entries(apiTweet)) {
    if (value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0 && Array.isArray(merged[key]) && merged[key].length)) merged[key] = value;
  }
  merged.promoted = !!domTweet.promoted;
  merged.source = "dom+api";
  merged.enriched = true;
  return merged;
}

// Collects the tweets of the current timeline. DOM order is authoritative for
// what was on screen; API-only top-level tweets (pre-rendered off-screen) are
// appended so nothing the client downloaded is lost.
function createTweetCollector() {
  const dom = new Map(); // id -> dom record
  const api = new Map(); // id -> api record (top-level only)
  const nested = new Map(); // id -> api record for quoted/retweeted tweets
  const users = new Map(); // lower-case handle -> user, for author enrichment

  function harvestDom(root = document) {
    for (const article of root.querySelectorAll('article[data-testid="tweet"]')) {
      const tweet = readTweetArticle(article);
      if (!tweet) continue;
      if (!xuDebug.sampleArticle) xuDebug.sampleArticle = article.outerHTML.slice(0, 20000);
      const previous = dom.get(tweet.id);
      if (!previous) dom.set(tweet.id, tweet);
      else if (!previous.text && tweet.text) previous.text = tweet.text;
    }
    return dom.size + [...api.keys()].filter((id) => !dom.has(id)).length;
  }

  const opIds = new Map(); // GraphQL operation -> top-level tweet ids it delivered

  function ingestJson(json, url = "") {
    xuDebug.apiResponses++;
    const found = collectEntities(json);
    if (!xuDebug.sampleTweet && found.tweets.length) xuDebug.sampleTweet = found.tweets[0].raw;
    if (!xuDebug.sampleUser && found.users.length) xuDebug.sampleUser = found.users[0];
    const op = String(url).match(/\/graphql\/[^/]+\/([A-Za-z0-9_]+)/);
    for (const raw of found.users) {
      const user = normalizeUser(raw);
      if (user.handle) users.set(user.handle.toLowerCase(), user);
    }
    for (const { raw, nested: isNested } of found.tweets) {
      const tweet = normalizeTweet(raw);
      if (!tweet.id) continue;
      (isNested ? nested : api).set(tweet.id, tweet);
      if (!isNested && op) {
        if (!opIds.has(op[1])) opIds.set(op[1], new Set());
        opIds.get(op[1]).add(tweet.id);
      }
    }
    return found.tweets.length;
  }

  // Operations ranked by overlap with what is on screen (see createUserCollector).
  function listOps() {
    return [...opIds.entries()]
      .map(([op, ids]) => ({ op, hits: [...ids].filter((id) => dom.has(id)).length }))
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .map((x) => x.op);
  }

  function missingCount() {
    return [...dom.keys()].filter((id) => !api.has(id) && !nested.has(id)).length;
  }

  function list() {
    const out = [];
    for (const [id, domTweet] of dom) out.push(mergeTweetRecords(domTweet, api.get(id) || nested.get(id)));
    for (const [id, apiTweet] of api) if (!dom.has(id)) out.push({ ...apiTweet, promoted: false, enriched: true, offscreen: true });
    return out;
  }

  return {
    harvestDom,
    ingestJson,
    list,
    listOps,
    missingCount,
    users,
    get size() {
      return dom.size;
    },
  };
}

// Same role as diagnoseUsers: make a format change visible and actionable.
function diagnoseTweets(tweets, enriched) {
  if (!tweets.length) {
    log.warn(`No posts were found on this page. Seen ${xuDebug.apiResponses} API responses. Make sure the timeline is visible, then run again. If it keeps failing, run copy(JSON.stringify(xu.debug)) and open an issue with the result.`);
    return;
  }
  const withText = tweets.filter((t) => t.text).length;
  const withLikes = tweets.filter((t) => typeof t.likes === "number").length;
  const withViews = tweets.filter((t) => typeof t.views === "number").length;
  const withAuthor = tweets.filter((t) => t.author).length;
  const problems = [];
  if (withText < tweets.length / 2) problems.push("post text could not be read");
  if (enriched && !withLikes) problems.push("like counts are missing from X's post data");
  if (enriched && !withViews) problems.push("view counts are missing from X's post data");
  if (withAuthor < tweets.length / 2) problems.push("authors could not be read");
  if (!enriched) problems.push("no post data was received from X (only what was on screen)");
  if (problems.length) {
    const keys = xuDebug.sampleTweet ? Object.keys(xuDebug.sampleTweet).join(", ") : "none captured";
    log.warn(`Heads-up: ${problems.join("; ")}. X may have changed its format. Raw post keys seen: ${keys}. To help fix it, run copy(JSON.stringify(xu.debug)) in this console and paste the result in a GitHub issue.`);
  }
}

const XU_SHOW_MORE_RE = /^(show (more )?replies|show this thread|mostrar (más )?respuestas|mostrar este hilo|afficher (plus de )?réponses|weitere antworten anzeigen|mostra (altre )?risposte)$/i;

// `counts(tweet)` says which collected posts the tool will keep (e.g. the
// profile's own originals); the direct continuation aims at that number.
async function collectTweetTimeline({ label = "tweets", stagnantLimit = 8, delayMs = 900, maxItems = Infinity, refetchFirstPage = true, expandThreads = false, completeMissing = true, stopWhen = null, counts = null } = {}) {
  const collector = createTweetCollector();
  const uninstall = installInterceptor((json, url) => collector.ingestJson(json, url));
  const startPath = currentPath();
  try {
    if (refetchFirstPage) {
      let bounced = await bounceTabs();
      if (!bounced) bounced = await bounceAway();
      if (!bounced) log.step("Could not make X reload this timeline; will re-request the first page instead.");
    }
    if (currentPath() !== startPath) {
      log.error(`The page changed to ${currentPath()} before collecting. Open ${startPath} again and re-run.`);
      throw new Error("x-utils: page changed");
    }
    await autoScroll({
      harvest: () => collector.harvestDom(contentRoot()),
      stagnantLimit,
      delayMs,
      maxItems,
      label,
      beforeScroll: expandThreads ? () => clickButtons(XU_SHOW_MORE_RE, { max: 2, once: true }) : null,
      shouldStop: stopWhen ? () => stopWhen(collector.list()) : null,
    });
    // A profile whose counter says there is much more than what X's page
    // loaded: ask for the following pages directly, from the last cursor X gave.
    const owner = pathHandle(startPath);
    const ownerRecord = owner ? collector.users.get(owner.toLowerCase()) : null;
    const target = ownerRecord && typeof ownerRecord.tweets === "number" ? Math.min(ownerRecord.tweets, maxItems) : null;
    const kept = () => (counts ? collector.list().filter(counts).length : collector.list().length);
    if (target && !stopWhen && kept() < target * 0.7) {
      const ops = collector.listOps().filter((n) => /Tweets|Timeline/i.test(n));
      const before = kept();
      if (ops.length) {
        xuOverlay.count(`X stopped at ${before.toLocaleString("en-US")} ${label}; requesting the rest directly…`);
        log.step(`X's page stopped at ${before} ${label} while the account counter says about ${ownerRecord.tweets}; requesting more pages directly.`);
        const pages = await replayListPages(ops, () => kept() < target, { fromCursor: true, maxPages: Math.ceil((target - before) / 10) + 2, delayMs: 1200 });
        const after = kept();
        xuDebug.direct = { before, after, pages, ops, target };
        if (after > before) log.info(`Fetched ${pages} more page${pages === 1 ? "" : "s"} directly: ${after - before} additional ${label}.`);
        else log.step(`Direct requests added nothing (X answered ${pages} page${pages === 1 ? "" : "s"}); keeping the ${before} ${label} from the page.`);
      } else {
        xuDebug.direct = { before, after: before, pages: 0, ops: [], target };
      }
    }
    if (completeMissing && collector.missingCount() > 0) {
      const before = collector.missingCount();
      xuOverlay.count(`Completing ${before} ${label} that loaded before the tool started…`);
      const listLike = /Tweets|Bookmarks|Likes|Search|TweetDetail|ListLatest|Timeline/i;
      let ops = collector.listOps().filter((n) => listLike.test(n));
      if (!ops.length) ops = [...xuRequests.keys()].filter((n) => listLike.test(n));
      const pages = await replayListPages(ops, () => collector.missingCount() > 0);
      const after = collector.missingCount();
      xuDebug.completed = { before, after, pages, ops };
      if (pages) log.info(`Re-requested ${pages} page${pages === 1 ? "" : "s"} of the timeline to complete ${before - after} of ${before} ${label} that loaded before the tool started.`);
      else log.step(`Could not re-request the first page (no timeline request was observed); ${before} ${label} stay DOM-only.`);
    }
  } finally {
    uninstall();
  }
  const tweets = collector.list();
  const enriched = tweets.filter((t) => t.enriched).length;
  log.info(`Collected ${tweets.length} ${label} (${enriched} with full API data).`);
  // On a profile page, hand the owner's account record to the tool (post count, etc.).
  const owner = pathHandle(startPath);
  if (owner && collector.users.has(owner.toLowerCase())) Object.defineProperty(tweets, "profileRecord", { value: collector.users.get(owner.toLowerCase()), enumerable: false });
  diagnoseTweets(tweets, enriched);
  return tweets;
}

const XU_TWEET_COLUMNS = ["id", "createdAt", "author", "authorName", "text", "likes", "retweets", "replies", "quotes", "bookmarks", "views", "isRetweet", "isReply", "isQuote", "media", "links", "url"];

function tweetsToRows(tweets, columns = XU_TWEET_COLUMNS) {
  return tweets.map((t) => {
    const row = {};
    for (const c of columns) row[c] = t[c] === undefined ? null : t[c];
    return row;
  });
}
