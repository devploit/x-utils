# x-utils design (batch 1: read-only tools)

Date: 2026-09-02. Status: implemented in v0.1.0.

## Goal

A set of copy-paste browser console scripts that make the X (Twitter) web client do useful things the official API charges for: relationship audits (who does not follow back, who left, who looks like a bot, who went silent) and content exports (bookmarks, likes, threads, searches, engagement, list members). English-only code and output. No API keys, no credentials leaving the browser, no extra requests beyond what the page already makes.

## Non-goals for this batch

Anything that mutates account state (unfollow, block, mute, delete, like, list edits). Those come in batch 2 with mandatory dry-run and pacing. Also out of scope: userscript managers, browser extensions, and reading the user's data archive (kept as a possible input for batch 2).

## Approaches considered

1. **DOM scraping only** (what the original one-off script did). Simple and robust to JSON changes, but it only yields handle, name and badges. Bot detection, inactivity and reliable diffs (IDs) are impossible.
2. **Call X's internal GraphQL API directly** with the session cookies. Rich data, but requires query IDs and feature flags that change constantly, and it issues requests the page would not make, which increases rate-limit and account risk.
3. **Observe the page's own responses (chosen)**: patch `fetch` and `XMLHttpRequest` in the tab, parse every `/i/api/` JSON the client downloads while auto-scrolling, and walk the JSON generically for objects that look like users or tweets. Zero extra requests, full data. The DOM stays the source of truth for membership and order because the client renders every cell as it scrolls; JSON only enriches. The DOM is also the fallback when the JSON shape changes.

Known cost of approach 3: the first page is downloaded before the script is pasted. Mitigation: `bounceTabs()` switches to a sibling tab and back to force a re-fetch where tabs exist; otherwise those rows are reported as DOM-only.

## Architecture

- `src/lib/*.js`: shared runtime, concatenated in filename order. Plain top-level functions; browser globals are touched only inside functions so the same source loads in Node for tests.
  - `00-runtime`: logging, `sleep`, date helpers, page guards, `saveFile`, `writeOutputs`, `publishResult`, `autoScroll`, `bounceTabs`, retry-button handling.
  - `10-intercept`: `installInterceptor` (fetch + XHR), `collectEntities` (generic JSON walk; marks tweets nested inside other tweets).
  - `20-users`: `normalizeUser` (new and legacy GraphQL layouts plus REST), `readUserCell` (DOM), `mergeUserRecords`, `createUserCollector`, `collectUserList`.
  - `30-tweets`: `normalizeTweet` (note text, media, reposts, quotes, visibility wrappers), `readTweetArticle` (DOM), `parseMetricsLabel`, `createTweetCollector`, `collectTweetTimeline`.
  - `40-export`: CSV (with formula neutralisation), JSON, Markdown renderers, `printTable`.
  - `50-store`: localStorage snapshots and `diffUserLists` (ID first, handle second, rename detection).
  - `60-analysis`: `scoreUserQuality`, `buildThreadChain`, `engagementStats`.
  - `70-html`: self-contained HTML report (inline CSS/JS; only avatars and media load from X): dark masthead with headline, summary figures linking to sections, a stacked proportion bar (`report.breakdown`) and notes; sticky section navigation derived from the sections (`htmlSubnav`); per-section filter (`/` shortcut), copy-visible-handles and export-visible-CSV buttons; identity cells (avatar with initials fallback, name, verified/protected badges, handle); sortable and filterable tables with log-scaled magnitude bars under counts and a "copy visible handles" button (`htmlTableSection`); reading cards for posts with metric icons (`htmlCardsSection`); `renderHtmlReport`. All values escaped; only plain http(s) URLs become links. Verified with headless Chrome screenshots in light, dark and 390px widths.
  - `75-charts`: inline SVG charts themed by CSS variables: `postingHeatmap` + `svgHeatmap` (7x24 weekday/hour), `svgBars` (per-post series), `sizeHistogram` + `svgHistogram` (log buckets of follower counts), `svgTrend` (snapshot history), `htmlChartSection`.
  - `00-runtime` also hosts `xuOverlay`, the in-page progress panel (CSSOM-styled to respect X's CSP) that shows status, counts and an "Open report" button fed by a Blob URL of the HTML report.
  - `70-html` additionally renders quick-filter chips (declarative `{key, op, value}` evaluated client-side against `data-c-*` row attributes), per-section CSV export of the visible rows, and a "Share image" button that draws a 1200x630 PNG on a canvas from JSON embedded in the page.
  - `50-store` keeps a per-list count history (`appendHistory`) so `followers-diff` can chart the trend across runs.
- Distribution: `index.html` landing page for GitHub Pages (copy buttons fetch `dist/` same-origin), `docs/assets/social-preview.{html,png}`, CI workflow (build, test, verify `dist/` and `docs/examples/` are fresh) and a release workflow on `v*` tags that zips `dist/` and publishes the changelog section.
- `src/tools/*.js`: one file per tool. Header comments (`@name`, `@description`, `@page`), a `CONFIG` block between markers, then the body, which runs inside an async IIFE.
- `scripts/build.mjs`: emits `dist/<tool>.js` = banner + CONFIG + runtime + body, syntax-checks each output with `vm.Script`, verifies `XU_VERSION` matches `package.json`, writes `dist/manifest.json`.
- `tests/`: `node:test` unit tests for pure functions (loaded via `new Function` over the concatenated lib) and a smoke test that runs every dist file in a fake non-x.com context and expects a clean refusal.

## Data flow

1. Tool validates host and path, resolves the owner handle from the URL or the nav bar.
2. `collectUserList` / `collectTweetTimeline` install the interceptor, optionally bounce tabs, then `autoScroll` until the harvested count stops growing for N rounds, clicking Retry on rate-limit banners.
3. Collector merges DOM rows (authoritative) with API records by handle (users) or ID (tweets).
4. Tool filters and analyses, prints a summary and `console.table`, writes files via Blob downloads, stores snapshots when relevant, and publishes the result on `window.xu`.

## Error handling

- Wrong host or page: explicit message with the expected URL, then a tagged `x-utils:` error that the bundle's catch suppresses (no stack noise).
- Unexpected failures: printed with the stack by the bundle's catch.
- Interceptor handler exceptions are caught per response and logged as warnings; they never break the page's own fetch.
- Clipboard failures degrade to a warning; downloads are the primary output.
- `inactive-following` reports per-profile probe status (`ok`, `unavailable`, `protected`, `timeout`, `blocked`) and switches from iframe to popup once if frames are refused.

## Testing

- Unit: normalisation of both GraphQL layouts and REST users, nested tweet detection, merge rules (true never degrades), CSV escaping and formula neutralisation, Markdown rendering, diff and rename detection, quality scoring, thread reconstruction (reply chain and DOM-order fallback), engagement statistics.
- Build smoke: every dist file parses, has CONFIG before the runtime, and refuses to run off-host without an uncaught error.
- Not covered by automation: live behaviour against x.com (selectors, JSON shapes, tab bouncing, iframe policy). These must be verified manually on each tool after a build and after any X redesign.

## Follow-ups

- Batch 2 (mutating tools) with dry-run, pacing and confirmation.
- Optional: read `dist/manifest.json` to generate the README table.
- Optional: a bookmarklet loader that fetches the latest dist file, once the repository is public.
