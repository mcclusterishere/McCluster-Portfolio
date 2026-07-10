#!/usr/bin/env node
/* AUDIT-ENGINE — the engine room's own inspector.
   Where audit-static checks the pages' words and links, this checks the
   machinery: every JS file parses, every <script src> resolves, no page
   carries a duplicate DOM id (the silent killer of getElementById), no
   JSON in data/ is broken, and no page double-fetches the same data file
   more than the allowed number of times.
   Run: node tools/audit-engine.mjs                                     */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const problems = [];

const pages = readdirSync(ROOT).filter((f) => f.endsWith(".html"));
const jsFiles = readdirSync(join(ROOT, "js")).filter((f) => f.endsWith(".js")).map((f) => "js/" + f);
const dataFiles = readdirSync(join(ROOT, "data")).filter((f) => f.endsWith(".json")).map((f) => "data/" + f);

/* 1 · every engine file parses */
for (const f of jsFiles) {
  try { execFileSync("node", ["--check", join(ROOT, f)], { stdio: "pipe" }); }
  catch (e) { problems.push(`${f}: does not parse — ${String(e.stderr).split("\n")[0]}`); }
}

/* 2 · every data file is valid JSON */
for (const f of dataFiles) {
  try { JSON.parse(readFileSync(join(ROOT, f), "utf8")); }
  catch (e) { problems.push(`${f}: broken JSON — ${e.message}`); }
}

for (const page of pages) {
  const html = readFileSync(join(ROOT, page), "utf8");

  /* 3 · duplicate DOM ids: getElementById silently picks the first —
     a duplicate is a bug waiting behind a working demo */
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set(), dupes = new Set();
  for (const id of ids) (seen.has(id) ? dupes.add(id) : seen.add(id));
  for (const id of dupes) problems.push(`${page}: duplicate DOM id "${id}"`);

  /* 4 · every <script src> resolves to a real file */
  for (const m of html.matchAll(/<script src="([^"?]+)/g)) {
    if (m[1].startsWith("http")) continue;
    if (!existsSync(join(ROOT, m[1]))) problems.push(`${page}: <script src="${m[1]}"> missing`);
  }

  /* 5 · the same data file fetched more than twice on one page is a
     redundancy the floor cache exists to remove */
  const fetches = {};
  for (const m of html.matchAll(/fetch\("([^"]+\.json)"/g)) fetches[m[1]] = (fetches[m[1]] || 0) + 1;
  for (const [f, n] of Object.entries(fetches)) {
    if (n > 2) problems.push(`${page}: fetches ${f} ${n}× — route it through the shared cache`);
  }
}

/* 6 · native feel is law: every page carries the canonical viewport —
   a page that re-enables pinch/double-tap zoom breaks the app illusion */
const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">';
for (const page of pages) {
  const html = readFileSync(join(ROOT, page), "utf8");
  if (!html.includes(VIEWPORT)) problems.push(`${page}: viewport meta is not the canonical no-zoom string`);
}

/* 6b · the positioning holds: retired copy can never sneak back.
   The economy's law is 1,000 E⤴ (100,000 pts) for everything, the
   bankroll is dead, and the fund never states a percentage. */
const STALE = [
  [/beta.?bankroll/i, "the beta bankroll is retired"],
  [/One Percent Fund/i, "the fund is the Community Fund now — no percentages"],
  [/(^|[^0-9.,])5(\.00)? ?E⤴[^0-9]*(flat|maximum|total|hard cap)/i, "the Trap pays 1,000 E⤴ now, not 5"],
];
for (const page of [...pages, ...jsFiles]) {
  const src = readFileSync(join(ROOT, page), "utf8");
  for (const [rx, why] of STALE) {
    if (rx.test(src)) problems.push(`${page}: stale positioning (${why})`);
  }
}

/* 7 · inline scripts parse too (extracted and checked as modules-ish) */
for (const page of pages) {
  const html = readFileSync(join(ROOT, page), "utf8");
  let i = 0;
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    i++;
    try { new Function(m[1]); }
    catch (e) { problems.push(`${page}: inline script #${i} does not parse — ${e.message}`); }
  }
}

if (problems.length) {
  console.error(`ENGINE AUDIT FAILED — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`ENGINE AUDIT CLEAN — ${jsFiles.length} engine files, ${pages.length} pages, ${dataFiles.length} data files: everything parses, no duplicate ids, no dead scripts, no redundant fetches.`);
