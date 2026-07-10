/* The policy sweep — the automated policy engine's fetch arm.
   Pulls the freshest moving bills for the states on our watch from
   the OpenStates v3 API (free key: openstates.org/accounts/signup)
   and commits them to data/policy.json. The site never talks to the
   API — it reads the committed JSON, and the git history IS the
   archive: every sweep is a snapshot, forever.
   Env: OPENSTATES_KEY (GitHub Actions secret). */
import { writeFileSync, readFileSync } from "node:fs";

const KEY = process.env.OPENSTATES_KEY || "";
const OUT = new URL("../data/policy.json", import.meta.url);
const STATES = ["ga", "ct", "ny", "ca", "tx", "fl"]; // the watch list — grow it any time

if (!KEY) {
  console.log("OPENSTATES_KEY not set — the board stays dark (never fake).");
  process.exit(0);
}

const bills = [];
for (const st of STATES) {
  const url =
    "https://v3.openstates.org/bills?jurisdiction=" + st +
    "&sort=updated_desc&per_page=8&apikey=" + KEY;
  try {
    const r = await fetch(url, { headers: { "X-API-KEY": KEY } });
    if (!r.ok) { console.error(st, "answered", r.status); continue; }
    const j = await r.json();
    for (const b of j.results || []) {
      bills.push({
        id: b.id,
        state: st.toUpperCase(),
        bill: b.identifier || "",
        title: (b.title || "").slice(0, 200),
        updated: b.updated_at || "",
        action: (b.latest_action_description || "").slice(0, 160),
        action_date: b.latest_action_date || "",
        url: b.openstates_url || "",
        subjects: (b.subject || []).slice(0, 4),
      });
    }
    console.log(st.toUpperCase(), "→", (j.results || []).length, "bills");
  } catch (e) {
    console.error(st, "failed:", e.message);
  }
  await new Promise((res) => setTimeout(res, 800)); // stay polite on the free tier
}

let prev = {};
try { prev = JSON.parse(readFileSync(OUT, "utf8")); } catch {}
if (!bills.length) {
  console.log("no bills landed — keeping the previous board");
  process.exit(0);
}
writeFileSync(OUT, JSON.stringify({
  updated: new Date().toISOString(),
  note: "The moving docket: freshest bills on the watch-list states, via the policy sweep (tools/fetch-policy.mjs). The git history of this file is the archive.",
  states: STATES.map((s) => s.toUpperCase()),
  bills,
}, null, 2));
console.log("policy.json written:", bills.length, "bills (was", (prev.bills || []).length + ")");
