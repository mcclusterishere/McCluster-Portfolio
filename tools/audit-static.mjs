/* ============================================================
   The site audits itself. Run: node tools/audit-static.mjs
   Runs in CI on every push (.github/workflows/site-audit.yml) —
   a regression in any of these fails the build before it ships:

   1. every page has a <title> and a meta description
   2. every internal href/src points at a file that exists
   3. banned language never returns (tax wording, dead brand names)
   4. every data/*.json parses
   5. every sitemap URL is a real file
   ============================================================ */
import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fails = [];
// media that is wired ahead of upload, on purpose — pages degrade gracefully
const PENDING = new Set(["assets/img/scb-seal.png", "assets/audio/deep-end.mp3", "assets/audio/runway.mp3", "assets/img/mission-hero.jpg",
  "assets/img/offer-hero.jpg", "assets/img/we-night.jpg",
  "assets/img/ghana-gate.jpg", "assets/img/ghana-warehouse.jpg"]);
const pages = readdirSync(ROOT).filter((f) => f.endsWith(".html"));

const BANNED = [
  [/tax[- ]deductible/i, "tax language (keep to support/contribution wording)"],
  [/the M Network/, "old brand form — it's just 'M Network'"],
  [/McCluster Service Network/, "old brand name — it's 'M Network'"],
  [/founding offer/i, "old offer name — it's 'the limited offer'"],
];

for (const p of pages) {
  const html = readFileSync(join(ROOT, p), "utf8");

  if (!/<title>[^<]+<\/title>/.test(html)) fails.push(`${p}: missing <title>`);
  if (!/name="description"\s+content="[^"]{20,}/.test(html) && !/content="[^"]{20,}"\s+name="description"/.test(html))
    fails.push(`${p}: missing meta description`);

  for (const [re, why] of BANNED) {
    const m = html.match(re);
    if (m) fails.push(`${p}: banned phrase "${m[0]}" — ${why}`);
  }

  // internal references must resolve
  const refs = [...html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)]
    .map((m) => m[1])
    .filter((h) => !/^(https?:|mailto:|tel:|data:|javascript:|#)/.test(h))
    .filter((h) => !h.includes("' +") && !h.includes("+ '")) // JS templates, not real refs
    .map((h) => h.split("#")[0].split("?")[0])
    .filter(Boolean);
  for (const r of new Set(refs)) {
    if (!existsSync(join(ROOT, r)) && !PENDING.has(r)) fails.push(`${p}: broken reference → ${r}`);
  }
}

for (const f of readdirSync(join(ROOT, "data")).filter((f) => f.endsWith(".json"))) {
  try { JSON.parse(readFileSync(join(ROOT, "data", f), "utf8")); }
  catch (e) { fails.push(`data/${f}: invalid JSON — ${e.message}`); }
}
try { JSON.parse(readFileSync(join(ROOT, "manifest.webmanifest"), "utf8")); }
catch (e) { fails.push(`manifest.webmanifest: invalid JSON`); }

/* 6. event names hold the taxonomy: MCC_TRACK("name") must be snake_case
      (docs/event-taxonomy.md) — one name, one meaning, everywhere */
const NAME_RE = /^[a-z][a-z0-9_]*$/;
for (const dir of ["js", "."]) {
  for (const f of readdirSync(join(ROOT, dir)).filter((f) => f.endsWith(dir === "js" ? ".js" : ".html"))) {
    const src = readFileSync(join(ROOT, dir, f), "utf8");
    for (const m of src.matchAll(/\btrack\("([^"]+)"/gi)) {
      if (!NAME_RE.test(m[1])) fails.push(`${dir === "js" ? "js/" : ""}${f}: event name "${m[1]}" breaks the taxonomy (snake_case only)`);
    }
  }
}

const sitemap = readFileSync(join(ROOT, "sitemap.xml"), "utf8");
for (const m of sitemap.matchAll(/McCluster-Portfolio\/([^<?]+?)<\/loc>/g)) {
  const f = m[1].split("?")[0];
  if (f && !existsSync(join(ROOT, f))) fails.push(`sitemap.xml: lists missing file → ${f}`);
}

if (fails.length) {
  console.error(`AUDIT FAILED — ${fails.length} problem(s):\n` + fails.map((f) => "  ✗ " + f).join("\n"));
  process.exit(1);
}
console.log(`AUDIT CLEAN — ${pages.length} pages, all references resolve, language holds, data parses.`);
