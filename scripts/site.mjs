// Builds one landing page per tool (<slug>.html at the repo root, served as
// /<slug> by Cloudflare) plus sitemap.xml, from scripts/site-content.mjs.
// The pages borrow the stylesheet, navigation and footer of index.html so
// the two never drift apart. Run with `npm run site`.
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE_URL, TOOL_PAGES } from "./site-content.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const index = await readFile(path.join(root, "index.html"), "utf8");

const pick = (re, what) => {
  const m = index.match(re);
  if (!m) throw new Error(`Could not find ${what} in index.html`);
  return m[0];
};
const style = pick(/<style>[\s\S]*?<\/style>/, "the stylesheet");
const nav = pick(/<nav class="nav"[\s\S]*?<\/nav>/, "the navigation").replace(/href="#/g, 'href="/#');
const footer = pick(/<footer>[\s\S]*?<\/footer>/, "the footer");
const favicon = pick(/<link rel="icon"[^>]*>/, "the favicon");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/<\//g, "<\\/")}</script>`;

// PNG dimensions straight from the IHDR chunk (no image library needed).
async function pngSize(file) {
  const buf = await readFile(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const toolNames = new Map(TOOL_PAGES.map((p) => [p.slug, p]));
const distTools = new Set((await readdir(path.join(root, "dist"))).filter((f) => f.endsWith(".js")).map((f) => f.replace(/\.js$/, "")));

const extraCss = `
.tool-hero{align-items:start;padding-bottom:64px}
.tool-hero .kicker{display:inline-block;font:600 12px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:#5ee0a8;margin-bottom:14px}
.tool-hero h1{font-size:clamp(32px,4.2vw,50px)}
.tool-hero .hero-shot{transform:none;margin-top:8px}
.facts{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:22px 24px;color:var(--band-ink);display:grid;gap:14px;margin-top:8px}
.facts div{display:grid;grid-template-columns:110px minmax(0,1fr);gap:12px;font-size:15px}
.facts b{color:var(--band-muted);font:600 12px var(--mono);letter-spacing:.06em;text-transform:uppercase;padding-top:3px}
.facts .mono{word-break:break-all}
.bullets{margin:0;padding:0;list-style:none;display:grid;gap:12px;max-width:72ch}
.bullets li{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;color:var(--ink);font-size:16px}
.bullets li svg{color:var(--good);margin-top:4px}
.section{margin-bottom:64px}
.related{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
.related a.card{display:block;padding:18px 20px;color:var(--ink);text-decoration:none}
.related a.card:hover{border-color:var(--accent)}
.related a.card b{display:block;margin-bottom:6px}
.related a.card span{color:var(--muted);font-size:14.5px}
.crumbs{font-size:13.5px;color:var(--band-muted);margin:26px 0 0}.crumbs a{color:var(--band-muted)}.crumbs a:hover{color:var(--band-ink)}
.faq details{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin-bottom:10px}
.faq summary{cursor:pointer;font-weight:600}.faq details p{margin:10px 0 0;color:var(--muted);max-width:72ch}
@media (max-width:860px){.tool-hero{grid-template-columns:1fr}.facts div{grid-template-columns:1fr;gap:4px}}
`;

const check = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7"/></svg>';

function renderPage(p) {
  const url = `${SITE_URL}/${p.slug}`;
  const steps = [
    { name: `Open ${p.needs.label} on X`, text: `On a computer, log in to X and open ${p.needs.url}. If the page was already open, reload it right before pasting: the tool reads the list as X loads it.` },
    { name: "Open the browser console", text: "Press Cmd+Option+I on a Mac or F12 on Windows and Linux, then click the Console tab." },
    { name: "Copy the script", text: "Use the copy button on this page. The script is plain text you can read; it lives at x-utils.com/dist/" + p.tool + ".js." },
    { name: "Paste it in the console and press Enter", text: "The first time, the browser asks you to type \"allow pasting\" first. Type it, press Enter, paste again." },
    { name: "Wait, then open your report", text: p.time + " The report and a CSV land in your Downloads folder." },
  ];
  const image = p.screenshot ? `${SITE_URL}/docs/assets/${p.screenshot}.png` : `${SITE_URL}/docs/assets/social-preview.png`;
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "x-utils", item: `${SITE_URL}/` }, { "@type": "ListItem", position: 2, name: p.h1, item: url }] },
    { "@context": "https://schema.org", "@type": "HowTo", name: p.title, description: p.description, totalTime: "PT5M", tool: { "@type": "HowToTool", name: "A desktop browser" }, step: steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.name, text: s.text })) },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: p.faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ];
  const shot = p.screenshot ? `<a class="hero-shot" href="/${p.sample}" aria-label="Open the sample report">${p.shotTag}</a>` : `<div class="facts"><div><b>Needs</b><span class="mono">${esc(p.needs.url)}</span></div><div><b>Takes</b><span>${esc(p.time)}</span></div><div><b>You get</b><span>An HTML report you can sort and filter, a CSV and a JSON file, saved in your Downloads folder.</span></div></div>`;
  const related = p.related.map((slug) => { const r = toolNames.get(slug); return `<a class="card" href="/${r.slug}"><b>${esc(r.h1)}</b><span>${esc(r.lead.split(". ")[0])}.</span></a>`; }).join("\n      ");
  return `<!doctype html>
<!-- Generated by scripts/site.mjs from scripts/site-content.mjs. Edit those, not this file. -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(p.title)} · x-utils</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:image" content="${image}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@devploit">
<meta name="twitter:creator" content="@devploit">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:image" content="${image}">
${favicon}
${jsonLd.map(ld).join("\n")}
${style.replace("</style>", `${extraCss}</style>`)}
</head>
<body>
<header class="band">
  <div class="wrap">
    ${nav}
    <p class="crumbs"><a href="/">x-utils</a> › <a href="/#tools">Tools</a> › ${esc(p.h1)}</p>
    <div class="hero tool-hero">
      <div>
        <span class="kicker">Free tool for X (Twitter) · ${p.group === "content" ? "your content" : "your relationships"}</span>
        <h1>${esc(p.h1)}</h1>
        <p>${esc(p.lead)}</p>
        <div class="pills"><span class="pill">${check}no X API to pay for</span><span class="pill">${check}no install</span><span class="pill">${check}password never asked</span><span class="pill">${check}only reads, changes nothing</span></div>
        <button class="cta" type="button" data-copy="${p.tool}"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg><span>Copy the script</span></button>${p.sample ? `<a class="cta quiet" href="/${p.sample}">See a sample report</a>` : `<a class="cta quiet" href="#run">How to run it</a>`}
      </div>
      ${shot}
    </div>
  </div>
</header>
<main class="content wrap">
  <section class="section" id="what">
    <h2>What you get</h2>
    <p class="lead">A self-contained HTML report you can sort, filter and share, plus a CSV for spreadsheets and a JSON file. Everything is built in your browser from what X already shows you when you scroll.</p>
    <ul class="bullets">
      ${p.bullets.map((b) => `<li>${check}<span>${esc(b)}</span></li>`).join("\n      ")}
    </ul>
  </section>
  <section class="section" id="run">
    <h2>How to run it</h2>
    <p class="lead">Five steps, on a computer. The <a href="/#start">guided setup on the home page</a> adapts them to your system and username.</p>
    <div class="card gsteps">
      ${steps.map((s, i) => `<div class="gstep"><div><h3>${esc(s.name)}</h3><p>${esc(s.text)}</p>${i === 0 ? `<div class="row"><span class="urlbox">${esc(p.needs.url)}</span></div>` : ""}${i === 2 ? `<div class="row"><button class="btn primary" type="button" data-copy="${p.tool}"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg><span>Copy the script</span></button><a class="btn" href="/dist/${p.tool}.js" target="_blank" rel="noopener">Open it as a file instead</a></div>` : ""}</div></div>`).join("\n      ")}
    </div>
  </section>
  <section class="section" id="safety">
    <h2>Why this is safe</h2>
    <div class="safety">
      <div class="card"><b>${check}No password, ever</b><p>The script runs inside the X tab where you are already logged in. It never asks for, reads or stores your password, cookies or keys.</p></div>
      <div class="card"><b>${check}Nothing is sent anywhere</b><p>There is no server behind this. The report and the spreadsheet are written straight into your Downloads folder.</p></div>
      <div class="card"><b>${check}It only reads</b><p>No tool follows, unfollows, blocks, likes, posts or deletes anything. It scrolls and takes notes, like a very fast assistant looking at your screen.</p></div>
      <div class="card"><b>${check}Anyone can read it</b><p>The code is open, short, in plain JavaScript and <a href="https://github.com/devploit/x-utils">published on GitHub</a>. If you know a developer, ask them to look.</p></div>
    </div>
  </section>
  <section class="section faq" id="faq">
    <h2>Questions</h2>
    ${p.faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n    ")}
    <p class="lead" style="margin-top:14px">More answers in the <a href="/#help">help section</a>.</p>
  </section>
  <section class="section" id="related">
    <h2>Related tools</h2>
    <div class="related">
      ${related}
    </div>
  </section>
  ${footer}
</main>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>
(function(){
  var toast=document.getElementById("toast"),timer;
  function say(msg){toast.textContent=msg;toast.classList.add("show");clearTimeout(timer);timer=setTimeout(function(){toast.classList.remove("show")},4200)}
  function copyText(text){if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(text);
    return new Promise(function(resolve,reject){var ta=document.createElement("textarea");ta.value=text;ta.setAttribute("readonly","");ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();var ok=false;try{ok=document.execCommand("copy")}catch(e){}ta.remove();ok?resolve():reject(new Error("execCommand failed"))})}
  document.querySelectorAll("[data-copy]").forEach(function(btn){btn.addEventListener("click",function(){var id=btn.dataset.copy,label=btn.querySelector("span")||btn,orig=label.textContent;
    if(location.protocol==="file:"){window.open("dist/"+id+".js","_blank");say("Opened the script in a new tab. Select all, copy, then paste it into the X console.");return}
    label.textContent="Copying…";
    fetch("/dist/"+id+".js").then(function(r){if(!r.ok)throw new Error(r.status);return r.text()}).then(function(text){if(text.indexOf("x-utils")<0)throw new Error("unexpected content");return copyText(text)}).then(function(){label.textContent="Copied";say("Copied. Now go to the X page, click in the console and paste.");setTimeout(function(){label.textContent=orig},2600)})
    .catch(function(){label.textContent=orig;say("Could not copy automatically. Use 'Open it as a file instead', select everything and copy.")})})});
})();
</script>
</body>
</html>
`;
}

let written = 0;
for (const p of TOOL_PAGES) {
  if (!distTools.has(p.tool)) throw new Error(`Page ${p.slug} points at a tool that is not built: ${p.tool}`);
  for (const r of p.related) if (!toolNames.has(r)) throw new Error(`Page ${p.slug} relates to unknown page ${r}`);
  if (p.screenshot) {
    const { width, height } = await pngSize(path.join(root, "docs", "assets", `${p.screenshot}.png`));
    p.shotTag = `<img src="/docs/assets/${p.screenshot}.webp" width="${width}" height="${height}" alt="Sample ${esc(p.h1.toLowerCase())} report produced by x-utils" fetchpriority="high">`;
  }
  await writeFile(path.join(root, `${p.slug}.html`), renderPage(p));
  written++;
}

const examples = (await readdir(path.join(root, "docs", "examples"))).filter((f) => f.endsWith(".html")).sort();
const urls = [
  `<url><loc>${SITE_URL}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
  ...TOOL_PAGES.map((p) => `<url><loc>${SITE_URL}/${p.slug}</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>`),
  ...examples.map((f) => `<url><loc>${SITE_URL}/docs/examples/${f}</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>`),
];
await writeFile(path.join(root, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
console.log(`${written} tool pages and sitemap.xml written.`);
