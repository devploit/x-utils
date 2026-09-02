# Changelog

All notable changes to x-utils are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- Report: chart tooltips are now a real hover box (weekday and hour slot with post count and average, per-post date, likes, reposts, replies, views and an excerpt, follower deltas on the trend) instead of the browser's slow SVG titles.
- Report: the copy button in tables copies handles when there is an account column and links otherwise (label changes to "Copy links"); it disappears when a table has nothing sensible to copy and reports "Nothing to copy" instead of silently copying an empty string.
- `engagement-report` compares the collected posts with the account's post counter and says so in the report when X served far fewer, with the likely cause.
- Silent rate limits: X's client stops asking for pages, without any error on screen, once the quota for a list operation is used up. Every tool now reads the quota X reports in its regular answers (`x-rate-limit-remaining` and `x-rate-limit-reset`), waits for the announced reset when the page goes quiet with quota at zero, and resumes instead of mistaking the silence for the end of the list.
- Profile timelines that stop far short of the account's post counter are continued directly from the last cursor X delivered, so a run is no longer capped at whatever the page happened to render.
- `xu.debug` now records responses per operation, HTTP status counts, the quota per operation, why scrolling stopped and what the direct continuation did.
- Report: the copy button of a table without an account column really copies the post links now (the previous release shipped the old handler, which copied nothing).
- `engagement-report` states what was collected and what was left out (replies, reposts, other authors, promoted) so the analysed count never looks like a shortfall, and the direct continuation keeps fetching until the analysed posts reach `maxTweets`.
- Scrolling nudges the page (a short scroll up and down) when X's client goes quiet, before giving up on a list.
- Spanish action bars: "elementos guardados" is read as the bookmark count.
- Test fixture from a real 2026 post (a reply, author under `core.user_results`, `views.count`).

## [0.1.0] - 2026-09-02

First public release. Twelve read-only tools that run from the browser console on x.com, with no API keys and nothing leaving the browser. Every tool was verified live against a real account before release.

### Added

- Relationship tools: `non-followers`, `fans`, `followers-diff` (with snapshot history and trend chart), `inactive-following`, `follower-quality`, `blocked-muted-export`.
- Content tools: `bookmarks-export`, `likes-export`, `thread-unroll`, `search-export`, `engagement-report`, `list-members-export`.
- Data collection that reads the rendered page as the source of truth and enriches it with the JSON responses the X web client already downloads.
- Self-contained HTML report: dark masthead with headline, key figures, proportion bar and a "Share image" button that renders a 1200x630 PNG; sticky section navigation; identity cells with avatars and badges; sortable, filterable tables with magnitude bars, quick-filter chips, "Copy handles" and per-section CSV export; reading cards for posts; inline SVG charts (posting heatmap, per-post bars, account-size histogram, follower trend); light and dark mode; print styles.
- In-page progress panel on x.com with a read-only preview button when a run finishes (the interactive report is the downloaded file).
- CSV, JSON and Markdown outputs, with spreadsheet formula neutralisation in CSV.
- Zero-dependency build (`npm run build`), unit tests and a smoke test of the built files (`npm test`), sample reports from fictional data (`npm run examples`), landing page served by Cloudflare (static assets), CI and release workflows.

### Notes on X's current behaviour

- Adapted to X's 2026 user format (no `legacy` block: counts in `relationship_counts` and `tweet_counts`, bio in `profile_bio`), with a real captured object as test fixture.
- Lists load their first page from X's cache, so tools now complete it by re-issuing the page's own list request without cursor, by looking accounts up one by one with the observed profile query, or by visiting one profile and coming back to observe those requests.
- Rate limits: 429 responses are detected directly, the announced reset time is honoured with a countdown, partial lists are flagged as such (and never stored as a diff baseline), and the tools estimate how long big lists take before starting.
- `inactive-following` no longer opens profiles (X refuses frames); it re-issues the profile timeline request per account, about 50 per 15 minutes, and checks only non-followers by default.
- Bookmarks moved to `x.com/i/history` and likes to `x.com/i/history/likes`; both old URLs still work.
- Lists that open as a dialog (list members) are scrolled and read inside the dialog.
- Report: read-only in-page preview (X's CSP blocks scripts in blob pages), masonry cards, media thumbnails, square-root bar charts, brand link to the site.
- Landing page: guided setup with per-tool duration notes, username gating, active section highlighting, "no paid X API" messaging.

[Unreleased]: https://github.com/devploit/x-utils/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/devploit/x-utils/releases/tag/v0.1.0
