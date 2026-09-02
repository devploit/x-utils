// ---------------------------------------------------------------------------
// Export formats: CSV, JSON, Markdown and console tables.
// ---------------------------------------------------------------------------

// Escapes one CSV cell. Arrays are joined with " | ". Cells that a spreadsheet
// would interpret as a formula (=, +, -, @) are prefixed with an apostrophe.
function csvEscape(value) {
  if (value === null || value === undefined) return "";
  let s = Array.isArray(value) ? value.join(" | ") : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows, columns) {
  const cols = columns || Object.keys(rows[0] || {});
  const lines = [cols.join(",")];
  for (const row of rows) lines.push(cols.map((c) => csvEscape(row[c])).join(","));
  return lines.join("\n");
}

function toJson(value) {
  return JSON.stringify(value, null, 2);
}

function fmtInt(n) {
  return n === null || n === undefined ? "" : Number(n).toLocaleString("en-US");
}

function fmtDate(iso) {
  return iso ? String(iso).slice(0, 10) : "";
}

// Prints up to `limit` rows with the given columns.
function printTable(rows, columns, limit = 25) {
  if (!rows.length) {
    log.info("Nothing to show.");
    return;
  }
  const view = rows.slice(0, limit).map((r) => {
    const out = {};
    for (const c of columns) {
      const v = r[c];
      out[c] = Array.isArray(v) ? v.join(" | ") : typeof v === "string" && v.length > 80 ? `${v.slice(0, 77)}...` : v;
    }
    return out;
  });
  console.table(view);
  if (rows.length > limit) log.info(`Showing ${limit} of ${rows.length} rows. The exported file has all of them.`);
}

function mdEscape(text) {
  return String(text || "").replace(/([\\`*_{}[\]<>#|])/g, "\\$1");
}

function tweetToMarkdown(tweet, { heading = "###", index = null } = {}) {
  const who = tweet.author ? `@${tweet.author}` : "unknown";
  const when = fmtDate(tweet.createdAt);
  const title = index !== null ? `${heading} ${index}. ${who} · ${when}` : `${heading} ${who} · ${when}`;
  const lines = [title, "", tweet.text ? tweet.text.split("\n").map((l) => `> ${l}`).join("\n") : "> _(no text)_"];
  if (tweet.media && tweet.media.length) {
    lines.push("");
    for (const m of tweet.media) lines.push(`- media: ${m}`);
  }
  if (tweet.quotedUrl) lines.push("", `- quotes: ${tweet.quotedUrl}`);
  const stats = [];
  if (tweet.likes !== null && tweet.likes !== undefined) stats.push(`${fmtInt(tweet.likes)} likes`);
  if (tweet.retweets !== null && tweet.retweets !== undefined) stats.push(`${fmtInt(tweet.retweets)} reposts`);
  if (tweet.replies !== null && tweet.replies !== undefined) stats.push(`${fmtInt(tweet.replies)} replies`);
  if (tweet.views !== null && tweet.views !== undefined) stats.push(`${fmtInt(tweet.views)} views`);
  lines.push("", `${stats.length ? `${stats.join(" · ")} · ` : ""}[link](${tweet.url})`);
  return lines.join("\n");
}

function tweetsToMarkdown(tweets, { title, subtitle = "" } = {}) {
  const parts = [`# ${title}`, ""];
  if (subtitle) parts.push(subtitle, "");
  parts.push(`_${tweets.length} posts · exported ${todayStamp()} with x-utils_`, "");
  tweets.forEach((t, i) => {
    parts.push(tweetToMarkdown(t, { index: i + 1 }), "");
  });
  return parts.join("\n").trim() + "\n";
}

// A thread reads better as continuous prose than as numbered cards.
function threadToMarkdown(tweets, { author, title }) {
  const first = tweets[0] || {};
  const parts = [`# ${title}`, "", `by @${author} · ${fmtDate(first.createdAt)} · ${tweets.length} posts · [original](${first.url || ""})`, "", "---", ""];
  for (const t of tweets) {
    parts.push(t.text || "_(no text)_", "");
    for (const m of t.media || []) parts.push(`![media](${m})`, "");
    if (t.quotedUrl) parts.push(`> quoting ${t.quotedUrl}`, "");
  }
  parts.push("---", "", `_Unrolled ${todayStamp()} with x-utils_`);
  return parts.join("\n") + "\n";
}

function threadToPlainText(tweets) {
  return tweets.map((t, i) => `${i + 1}/${tweets.length}\n${t.text}${t.media && t.media.length ? `\n${t.media.join("\n")}` : ""}`).join("\n\n");
}
