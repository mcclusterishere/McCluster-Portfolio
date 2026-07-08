/* ============================================================
   The vault keeper — backs up every Supabase table to JSON.
   Run: SUPABASE_SERVICE_KEY=... node tools/backup.mjs [outdir]

   Runs weekly in CI (.github/workflows/backup.yml) with the key
   held as a repo SECRET; the export is stored as a workflow
   ARTIFACT (90-day retention), never committed — booking contacts
   and the SMS list are consent-bound PII and stay out of git.
   ============================================================ */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const URL_ = "https://fxbkvcrfbbcmrrupdcjt.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) {
  console.error("SUPABASE_SERVICE_KEY is required (never commit it — env/secret only).");
  process.exit(1);
}

const TABLES = [
  "providers", "booking_requests", "members", "sms_optins",
  "deals", "performances", "device_state",
];

const outdir = process.argv[2] || "backup-out";
mkdirSync(outdir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

let failures = 0;
for (const t of TABLES) {
  try {
    const r = await fetch(`${URL_}/rest/v1/${t}?select=*`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const rows = await r.json();
    writeFileSync(join(outdir, `${t}-${stamp}.json`), JSON.stringify(rows, null, 1));
    console.log(`✓ ${t}: ${rows.length} rows`);
  } catch (e) {
    failures++;
    console.error(`✗ ${t}: ${e.message} (table may not exist yet — run its schema)`);
  }
}
writeFileSync(join(outdir, `MANIFEST-${stamp}.json`), JSON.stringify({
  at: new Date().toISOString(), tables: TABLES, project: URL_,
}, null, 1));
console.log(failures ? `Done with ${failures} table(s) skipped.` : "Vault sealed — full export complete.");
process.exit(failures === TABLES.length ? 1 : 0);
