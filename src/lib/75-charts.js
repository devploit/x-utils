// ---------------------------------------------------------------------------
// Inline SVG charts for the HTML report. No libraries; colours come from the
// report's CSS variables so every chart follows light and dark mode.
// ---------------------------------------------------------------------------

const XU_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Aggregates posts into a 7x24 grid of { posts, total, avg } (local time).
// Rows follow XU_DAY_LABELS (Monday first).
function postingHeatmap(rows, metric = "interactions") {
  const cells = XU_DAY_LABELS.map(() => Array.from({ length: 24 }, () => ({ posts: 0, total: 0, avg: 0 })));
  for (const r of rows) {
    if (!r.createdAt) continue;
    const d = new Date(r.createdAt);
    const day = (d.getDay() + 6) % 7; // Sunday(0) -> 6
    const cell = cells[day][d.getHours()];
    cell.posts++;
    cell.total += r[metric] || 0;
  }
  let max = 0;
  for (const row of cells) for (const c of row) {
    c.avg = c.posts ? c.total / c.posts : 0;
    if (c.avg > max) max = c.avg;
  }
  return { cells, max };
}

function svgHeatmap(heatmap, { metricLabel = "interactions per post" } = {}) {
  const cell = 26;
  const gap = 4;
  const left = 40;
  const top = 22;
  const width = left + 24 * (cell + gap);
  const height = top + 7 * (cell + gap) + 26;
  const parts = [];
  for (let h = 0; h < 24; h += 3) parts.push(`<text class="ax" x="${left + h * (cell + gap) + cell / 2}" y="14" text-anchor="middle">${String(h).padStart(2, "0")}</text>`);
  heatmap.cells.forEach((row, day) => {
    parts.push(`<text class="ax" x="${left - 10}" y="${top + day * (cell + gap) + cell / 2 + 4}" text-anchor="end">${XU_DAY_LABELS[day]}</text>`);
    row.forEach((c, hour) => {
      const x = left + hour * (cell + gap);
      const y = top + day * (cell + gap);
      const opacity = c.posts ? 0.18 + 0.82 * (heatmap.max ? c.avg / heatmap.max : 0) : 0;
      const slot = `${XU_DAY_LABELS[day]} ${String(hour).padStart(2, "0")}:00 to ${String((hour + 1) % 24).padStart(2, "0")}:00`;
      const tip = c.posts ? `${slot}\n${c.posts} post${c.posts === 1 ? "" : "s"} published in this slot\n${fmtInt(Math.round(c.avg))} ${metricLabel} on average${heatmap.max && c.avg === heatmap.max ? "\nYour best slot" : ""}` : `${slot}\nNo posts in this slot`;
      parts.push(`<rect class="${c.posts ? "hm" : "hm hm-empty"}" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="5"${c.posts ? ` fill-opacity="${opacity.toFixed(2)}"` : ""} data-tip="${htmlEscape(tip)}"><title>${htmlEscape(tip.replace(/\n/g, " · "))}</title></rect>`);
    });
  });
  const ly = top + 7 * (cell + gap) + 16;
  parts.push(`<text class="ax" x="${left}" y="${ly}">fewer ${htmlEscape(metricLabel)}</text>`);
  for (let i = 0; i < 5; i++) parts.push(`<rect class="hm" x="${width - 20 - (4 - i) * 18}" y="${ly - 11}" width="14" height="14" rx="3" fill-opacity="${(0.18 + 0.82 * (i / 4)).toFixed(2)}"/>`);
  parts.push(`<text class="ax" x="${width - 20 - 5 * 18 - 6}" y="${ly}" text-anchor="end">more</text>`);
  return `<svg class="chart chart-heatmap" viewBox="0 0 ${width} ${height}" role="img" aria-label="Posting heatmap by weekday and hour">${parts.join("")}</svg>`;
}

// Vertical bars in the given order. points = [{ label, value, title }].
// Heights use a square-root scale so one viral post does not flatten the rest.
// One bar per post for svgBars, with a three-line tooltip: date and the
// charted metric, the other counters, then an excerpt of the post.
function postBarPoints(rows, metric) {
  const excerpt = (t) => { const text = (t.text || "").replace(/\s+/g, " ").trim(); return text.length > 110 ? `${text.slice(0, 110)}…` : text || "(no text)"; };
  const views = (t) => (t.views ? `${fmtInt(t.views)} views` : "no view count");
  return rows.map((t) => {
    const head = metric === "views" ? `${fmtDate(t.createdAt)} · ${views(t)}` : `${fmtDate(t.createdAt)} · ${fmtInt(t.likes || 0)} likes`;
    const detail = metric === "views"
      ? `${fmtInt(t.likes || 0)} likes · ${t.engagementRate === null || t.engagementRate === undefined ? "no engagement rate" : `${t.engagementRate}% engagement`}`
      : `${fmtInt(t.retweets || 0)} reposts · ${fmtInt(t.replies || 0)} replies · ${views(t)}`;
    return { label: fmtDate(t.createdAt), value: (metric === "views" ? t.views : t.likes) || 0, tip: `${head}\n${detail}\n${excerpt(t)}` };
  });
}

function svgBars(points, { valueLabel = "" } = {}) {
  const n = points.length;
  if (!n) return "";
  const width = 720;
  const height = 150;
  const top = 18;
  const bottom = 26;
  const plotH = height - top - bottom;
  const max = Math.max(1, ...points.map((p) => p.value || 0));
  const slot = width / n;
  const barW = Math.max(2, Math.min(28, slot * 0.68));
  const parts = [`<line class="axis" x1="0" y1="${height - bottom + 0.5}" x2="${width}" y2="${height - bottom + 0.5}"/>`];
  parts.push(`<text class="ax" x="0" y="12">${htmlEscape(fmtInt(max))}${valueLabel ? ` ${htmlEscape(valueLabel)}` : ""} · square-root scale</text>`);
  points.forEach((p, i) => {
    const h = Math.max(1, Math.sqrt((p.value || 0) / max) * plotH);
    const x = i * slot + (slot - barW) / 2;
    const tip = p.tip || p.title || `${p.label}\n${fmtInt(p.value)}${valueLabel ? ` ${valueLabel}` : ""}`;
    parts.push(`<rect class="bar-v" x="${x.toFixed(1)}" y="${(height - bottom - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2" data-tip="${htmlEscape(tip)}"><title>${htmlEscape(tip.replace(/\n/g, " · "))}</title></rect>`);
  });
  const first = points[0].label;
  const last = points[n - 1].label;
  if (first) parts.push(`<text class="ax" x="0" y="${height - 8}">${htmlEscape(first)}</text>`);
  if (last && n > 1) parts.push(`<text class="ax" x="${width}" y="${height - 8}" text-anchor="end">${htmlEscape(last)}</text>`);
  return `<svg class="chart chart-bars" viewBox="0 0 ${width} ${height}" role="img" aria-label="Bar chart">${parts.join("")}</svg>`;
}

// Log-scale buckets for follower counts.
const XU_SIZE_BUCKETS = [
  { label: "< 100", min: 0, max: 100 },
  { label: "100 – 1k", min: 100, max: 1000 },
  { label: "1k – 10k", min: 1000, max: 10000 },
  { label: "10k – 100k", min: 10000, max: 100000 },
  { label: "100k+", min: 100000, max: Infinity },
];

function sizeHistogram(users, key = "followers") {
  const buckets = XU_SIZE_BUCKETS.map((b) => ({ ...b, count: 0 }));
  let unknown = 0;
  for (const u of users) {
    const v = u[key];
    if (typeof v !== "number") {
      unknown++;
      continue;
    }
    const b = buckets.find((x) => v >= x.min && v < x.max);
    if (b) b.count++;
  }
  return { buckets, unknown };
}

function svgHistogram(hist, { noun = "accounts" } = {}) {
  if (!hist.buckets.some((b) => b.count > 0)) return ""; // nothing known, draw nothing
  const width = 520;
  const height = 170;
  const top = 26;
  const bottom = 30;
  const plotH = height - top - bottom;
  const n = hist.buckets.length;
  const slot = width / n;
  const barW = slot * 0.62;
  const max = Math.max(1, ...hist.buckets.map((b) => b.count));
  const parts = [`<line class="axis" x1="0" y1="${height - bottom + 0.5}" x2="${width}" y2="${height - bottom + 0.5}"/>`];
  hist.buckets.forEach((b, i) => {
    const h = b.count ? Math.max(2, (b.count / max) * plotH) : 0;
    const x = i * slot + (slot - barW) / 2;
    const tip = `${b.label} followers\n${fmtInt(b.count)} ${noun}`;
    parts.push(`<rect class="bar-v" x="${x.toFixed(1)}" y="${(height - bottom - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="4" data-tip="${htmlEscape(tip)}"><title>${htmlEscape(tip.replace(/\n/g, " · "))}</title></rect>`);
    parts.push(`<text class="val" x="${(i * slot + slot / 2).toFixed(1)}" y="${(height - bottom - h - 7).toFixed(1)}" text-anchor="middle">${fmtInt(b.count)}</text>`);
    parts.push(`<text class="ax" x="${(i * slot + slot / 2).toFixed(1)}" y="${height - 10}" text-anchor="middle">${htmlEscape(b.label)}</text>`);
  });
  return `<svg class="chart chart-hist" viewBox="0 0 ${width} ${height}" role="img" aria-label="Distribution of account sizes">${parts.join("")}</svg>`;
}

// Line with dots for a short time series. points = [{ date (ISO), value }].
function svgTrend(points, { valueLabel = "" } = {}) {
  const pts = points.filter((p) => typeof p.value === "number").slice(-60);
  if (pts.length < 2) return "";
  const width = 720;
  const height = 170;
  const left = 8;
  const right = 8;
  const top = 20;
  const bottom = 28;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const values = pts.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i) => left + (i / (pts.length - 1)) * plotW;
  const y = (v) => top + plotH - ((v - min) / span) * plotH;
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(pts.length - 1).toFixed(1)},${(top + plotH).toFixed(1)} L${x(0).toFixed(1)},${(top + plotH).toFixed(1)} Z`;
  const parts = [`<path class="area" d="${area}"/>`, `<path class="line" d="${path}"/>`];
  pts.forEach((p, i) => {
    const delta = i ? p.value - pts[i - 1].value : null;
    const tip = `${fmtDate(p.date)}\n${fmtInt(p.value)}${valueLabel ? ` ${valueLabel}` : ""}${delta === null ? "" : `\n${delta >= 0 ? "+" : ""}${fmtInt(delta)} since the previous snapshot`}`;
    parts.push(`<circle class="dot" cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="5" data-tip="${htmlEscape(tip)}"><title>${htmlEscape(tip.replace(/\n/g, " · "))}</title></circle>`);
  });
  parts.push(`<text class="val" x="${x(pts.length - 1).toFixed(1)}" y="${(y(pts[pts.length - 1].value) - 10).toFixed(1)}" text-anchor="end">${fmtInt(pts[pts.length - 1].value)}</text>`);
  parts.push(`<text class="val" x="${x(0).toFixed(1)}" y="${(y(pts[0].value) - 10).toFixed(1)}">${fmtInt(pts[0].value)}</text>`);
  parts.push(`<text class="ax" x="${left}" y="${height - 8}">${htmlEscape(fmtDate(pts[0].date))}</text>`);
  parts.push(`<text class="ax" x="${width - right}" y="${height - 8}" text-anchor="end">${htmlEscape(fmtDate(pts[pts.length - 1].date))}</text>`);
  return `<svg class="chart chart-trend" viewBox="0 0 ${width} ${height}" role="img" aria-label="Trend over time">${parts.join("")}</svg>`;
}

// A section holding one or more chart cards. charts = [{ title, svg, caption }].
function htmlChartSection({ id, title, charts, note = "" }) {
  const cards = charts
    .filter((c) => c && c.svg)
    .map((c) => `<figure class="chart-card${/chart-(heatmap|bars|trend)/.test(c.svg) ? " wide" : ""}"><figcaption><strong>${htmlEscape(c.title)}</strong>${c.caption ? `<span>${htmlEscape(c.caption)}</span>` : ""}</figcaption>${c.svg}</figure>`)
    .join("");
  if (!cards) return "";
  return `
<section class="block" id="${htmlEscape(id)}">
  <header class="block-head"><h2>${htmlEscape(title)}<span class="count num">${charts.filter((c) => c && c.svg).length}</span></h2></header>
  ${note ? `<p class="note">${htmlEscape(note)}</p>` : ""}
  <div class="charts">${cards}</div>
</section>`;
}
