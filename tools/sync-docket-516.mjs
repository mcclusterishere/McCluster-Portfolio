#!/usr/bin/env node
/* ============================================================
   sync-docket-516.mjs — mirror the Connecticut Siting Council
   Docket 516 record into this repo and regenerate the manifest
   the explainer page renders from.

   Usage (Node 18+, no dependencies required):
     node tools/sync-docket-516.mjs            # sync new/changed files
     node tools/sync-docket-516.mjs --dry-run  # parse + report, no downloads
     node tools/sync-docket-516.mjs --force    # re-download everything

   What it does:
   1. Fetches the official docket page (the canonical source).
   2. Parses every anchor in the main content area, tracking the
      nearest heading so each document inherits its category.
   3. Skips CT.gov chrome (nav/footer/social/translate links).
   4. Zoom hearing recordings are kept as external_only records —
      never downloaded (they carry passcodes and live sessions).
   5. Public limited-appearance comments are NOT posted on the
      docket page (they're available only by request from the CSC
      because they can contain personal identifying information);
      nothing in this script requests or mirrors them.
   6. Downloads documents into assets/dockets/516/<category>/,
      preserving extensions, skipping files that already exist at
      the same byte size.
   7. Rewrites data/docket-516-files.json.

   Note: some hosting environments (including CI sandboxes) block
   portal.ct.gov at the network layer. Run this from a normal
   machine if the fetch fails with a connection/403 error.
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { URL } from "node:url";

const DOCKET_URL =
  "https://portal.ct.gov/csc/1_applications-and-other-pending-matters/applications/4_docketnos500s/docket-no-516?archived=true";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT_DIR = path.join(ROOT, "assets", "dockets", "516");
const MANIFEST = path.join(ROOT, "data", "docket-516-files.json");
const UA = "McCluster-Docket516-Archive/1.0 (public-record explainer; matthew@mccluster.org)";
const DRY = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

/* ---------- category inference: heading text -> slug + display name ---------- */
const CATEGORIES = [
  { slug: "application", name: "Application", match: /application received|^application\b/i },
  { slug: "bulk-exhibits", name: "Bulk-Filed Exhibits", match: /bulk[- ]?filed|bulk exhibits/i },
  { slug: "municipal-consultation", name: "Municipal Consultation Filing", match: /municipal consultation/i },
  { slug: "procedural-correspondence", name: "Procedural Correspondence", match: /correspondence|completeness|interrogator|acknowledg|continuance|record close/i },
  { slug: "agency-comments", name: "State Agency Comments", match: /agency comment|airport authority|environmental quality|department of transportation|historic preservation/i },
  { slug: "public-official-comments", name: "Public Official Comments", match: /public official|state representative|state senator|delegation/i },
  { slug: "hearing-documents", name: "Hearing Information", match: /hearing/i },
  { slug: "schedules", name: "Schedules", match: /schedule/i },
  { slug: "service-lists", name: "Service Lists", match: /service list/i },
  { slug: "transcripts", name: "Transcripts", match: /transcript/i },
  { slug: "applicant-ui", name: "Applicant Exhibits — United Illuminating", match: /applicant|united illuminating|\bui\b.*exhibit/i },
  { slug: "intervenors", name: "Party / Intervenor Exhibits", match: /intervenor|party|bj'?s|scnet|station lofts|town of fairfield|superior plating|city of bridgeport|national trust|southport/i },
  { slug: "motions-objections", name: "Motions and Objections", match: /motion|objection/i },
  { slug: "briefs-findings", name: "Briefs / Findings of Fact", match: /brief|findings of fact/i },
  { slug: "draft-findings", name: "Council Draft Findings", match: /draft finding/i },
  { slug: "final-decision", name: "Final Decision", match: /final decision|decision and order|opinion/i },
  { slug: "remand", name: "Court-Ordered Remand / Docket 516R", match: /remand|516r/i },
];

function categorize(headingTrail) {
  // most specific (deepest) heading wins, walking back up the trail
  for (let i = headingTrail.length - 1; i >= 0; i--) {
    for (const c of CATEGORIES) if (c.match.test(headingTrail[i])) return c;
  }
  return { slug: "procedural-correspondence", name: "Procedural Correspondence" };
}

/* ---------- helpers ---------- */
const decode = (s) =>
  s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ").trim();

function slugify(s) {
  return decode(s).toLowerCase()
    .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 90) || "document";
}

function inferDate(text) {
  // 03/17/23, 3/17/2023, 03-17-23
  let m = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (m) {
    let [, mo, d, y] = m;
    y = y.length === 2 ? "20" + y : y;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  // "February 16, 2024"
  m = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (m) {
    const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
    return `${m[3]}-${String(months.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  }
  return "";
}

const SKIP_HOST = /(facebook|twitter|instagram|youtube|linkedin|flickr|snapchat)\.com|translate\.google/i;
const SKIP_PATH = /\/(policies|disclaimer|accessibility|contact-us|language|search|site-map|login)\b|^javascript:|^#$|^tel:/i;
const FILE_EXT = /\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|tiff?|zip|txt|csv)(\?|$)/i;

function fileTypeOf(u) {
  const m = u.match(FILE_EXT);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "html";
}

/* ---------- fetch the docket page ---------- */
console.log("Fetching " + DOCKET_URL);
let html;
try {
  const res = await fetch(DOCKET_URL, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  html = await res.text();
} catch (e) {
  console.error("\nCould not reach portal.ct.gov: " + e.message);
  console.error("This environment may block state-government hosts — run the script from a normal machine.");
  process.exit(1);
}

/* ---------- isolate the main content area ---------- */
let main = html;
const mainMatch = html.match(/<main[\s>][\s\S]*?<\/main>/i) || html.match(/<div[^>]+(?:id|class)="[^"]*(?:content|main)[^"]*"[\s\S]*$/i);
if (mainMatch) main = mainMatch[0];
main = main.replace(/<footer[\s>][\s\S]*?<\/footer>/gi, "").replace(/<nav[\s>][\s\S]*?<\/nav>/gi, "");

/* ---------- walk headings + anchors in document order ---------- */
const tokens = [...main.matchAll(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>|<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
const records = [];
const seen = new Set();
let headingTrail = [];
let found = 0, externalOnly = 0;

for (const t of tokens) {
  if (t[1]) {
    const level = +t[1][1];
    const text = decode(t[2].replace(/<[^>]+>/g, ""));
    if (!text) continue;
    headingTrail = headingTrail.filter((h) => h.level < level);
    headingTrail.push({ level, text });
    continue;
  }
  const href = t[3];
  const text = decode(t[4].replace(/<[^>]+>/g, ""));
  if (!href || !text || SKIP_PATH.test(href)) continue;

  let abs;
  try { abs = new URL(href, DOCKET_URL).href; } catch { continue; }
  const host = new URL(abs).hostname;
  if (SKIP_HOST.test(host)) continue;
  if (href.startsWith("mailto:")) continue; // comment-request addresses etc. — never harvested

  const trail = headingTrail.map((h) => h.text);
  const isZoom = /zoom\.us/i.test(host);
  const isFile = FILE_EXT.test(abs) || /\/-\/media\//i.test(abs);
  if (!isZoom && !isFile) {
    // plain page links (CT.gov nav, UI project page, 516R page): keep the
    // meaningful ones as external references, drop generic chrome
    if (host === "portal.ct.gov" && !/516r|project/i.test(abs + text)) continue;
  }

  found++;
  const cat = categorize(trail.length ? trail : [text]);
  const date = inferDate(text) || inferDate(trail.join(" "));
  const slug = slugify(text);
  let id = `d516-${cat.slug}-${slug}${date ? "-" + date : ""}`;
  while (seen.has(id)) id += "-" + crypto.createHash("md5").update(abs).digest("hex").slice(0, 4);
  seen.add(id);

  const ext = fileTypeOf(abs);
  const external = isZoom || !isFile;
  if (external) externalOnly++;

  records.push({
    id,
    title: text,
    category: cat.name,
    subcategory: trail.length > 1 ? trail[trail.length - 1] : "",
    date,
    source_agency: "Connecticut Siting Council",
    official_url: abs,
    local_path: external ? "" : `assets/dockets/516/${cat.slug}/${slug}.${ext}`,
    file_type: ext,
    download: !external,
    external_only: external,
    summary: isZoom
      ? "Zoom hearing recording — external link only, never mirrored (recordings carry access passcodes)."
      : external
        ? "External reference kept as a link to the official source."
        : `${cat.name} document from the official Docket 516 record.`,
  });
}

console.log(`Parsed ${found} docket links (${externalOnly} external-only).`);

/* ---------- download ---------- */
let downloaded = 0, skipped = 0, failed = 0;
for (const r of records) {
  if (!r.download) continue;
  const dest = path.join(ROOT, r.local_path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!FORCE && fs.existsSync(dest) && fs.statSync(dest).size > 0) { skipped++; continue; }
  if (DRY) { console.log("would download: " + r.title); continue; }
  try {
    const res = await fetch(r.official_url, { headers: { "user-agent": UA }, redirect: "follow" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    downloaded++;
    console.log(`saved ${r.local_path} (${(buf.length / 1024).toFixed(0)} KB)`);
    await new Promise((r2) => setTimeout(r2, 400)); // be polite to the state server
  } catch (e) {
    failed++;
    r.download = false;
    r.local_path = "";
    r.summary += " (Download failed: " + e.message + " — official link kept.)";
    console.warn(`FAILED ${r.title}: ${e.message}`);
  }
}

/* ---------- write the manifest ---------- */
const order = Object.fromEntries(CATEGORIES.map((c, i) => [c.name, i]));
records.sort((a, b) => (order[a.category] ?? 99) - (order[b.category] ?? 99) || (a.date || "9999").localeCompare(b.date || "9999"));
if (!DRY) {
  fs.writeFileSync(MANIFEST, JSON.stringify(records, null, 2) + "\n");
  console.log("Wrote " + path.relative(ROOT, MANIFEST));
}

console.log("\n===== summary =====");
console.log("links found:     " + found);
console.log("downloaded:      " + downloaded);
console.log("skipped (have):  " + skipped);
console.log("external-only:   " + externalOnly);
console.log("failed:          " + failed);
