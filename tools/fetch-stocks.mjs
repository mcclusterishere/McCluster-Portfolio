#!/usr/bin/env node
/* MARKET SWEEP — real prices for the outside board.
   Reads data/realstocks.json for the watchlist, pulls each symbol's
   daily history from stooq (free CSV, no key), and writes back price,
   day change, and a 30-close spark series. Runs on the GitHub runner
   (.github/workflows/realstocks.yml) — the site only ever reads the
   committed JSON, so no keys, no CORS, no third party in the browser.
   Run: node tools/fetch-stocks.mjs                                  */
import { readFileSync, writeFileSync } from "node:fs";

const PATH = new URL("../data/realstocks.json", import.meta.url).pathname;
const book = JSON.parse(readFileSync(PATH, "utf8"));

async function history(sym) {
  const url = "https://stooq.com/q/d/l/?s=" + sym.toLowerCase() + "&i=d";
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const lines = (await r.text()).trim().split("\n").slice(1); // drop header
  const closes = lines
    .map((l) => +l.split(",")[4])
    .filter((n) => Number.isFinite(n) && n > 0);
  if (closes.length < 2) throw new Error("no quotes");
  return closes.slice(-30);
}

let hits = 0;
for (const row of book.rows) {
  // affiliate portals carry no exchange symbol — they're a link, not a quote
  if (row.portal || !row.sym) continue;
  try {
    const closes = await history(row.sym);
    const last = closes[closes.length - 1];
    const prev = closes[closes.length - 2];
    row.price = +last.toFixed(2);
    row.chg = +(((last - prev) / prev) * 100).toFixed(2);
    row.series = closes.map((c) => +c.toFixed(2));
    row.dark = false;
    hits++;
    console.log(row.label, "→", row.price, "(" + row.chg + "%)");
  } catch (e) {
    // a symbol that moved exchanges or delisted goes dark, never fake
    row.dark = true;
    console.log(row.label, "→ dark:", String(e.message || e));
  }
}

book.updated = new Date().toISOString();
writeFileSync(PATH, JSON.stringify(book, null, 2) + "\n");
console.log("SWEEP " + (hits ? "DONE — " + hits + "/" + book.rows.length + " symbols landed." : "DARK — nothing answered; the board shows its last truth."));
