#!/usr/bin/env node
/* THE M CHAIN — layer 1 of the web3 stack, running today.
   A hash-linked attestation ledger: every entry commits to the one
   before it, every file attestation carries the SHA-256 of the exact
   bytes, and the whole chain lives in git — publicly timestamped,
   content-addressed, tamper-evident. No blockchain required to be
   cryptographically real; the digest format is anchor-ready, so the
   day counsel clears an on-chain step, the latest digest is the only
   thing that needs to touch a chain (one EAS attestation on Base).

   node tools/chain.mjs build   → attest any tracked artifact/badge not yet on the chain
   node tools/chain.mjs verify  → recompute every digest and file hash; fail loudly     */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const CHAIN = join(ROOT, "data/chain.json");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
/* the digest commits to every field of the entry except itself */
const digestOf = (e) =>
  sha256(JSON.stringify([e.i, e.prev, e.at, e.type, e.subject, e.claim, e.path || "", e.sha256 || ""]));

/* ---- what the chain watches ---- */
function trackedFiles() {
  const sets = [
    ["assets/audio", ".mp3", "recording", "Master recording — authorship and existence of these exact bytes"],
    ["assets/papers", ".pdf", "paper", "Published paper — the document of record"],
    ["data/lyrics", ".ttml", "lyrics", "Synchronized lyric — the written work, timecoded"],
  ];
  const out = [];
  for (const [dir, ext, type, claim] of sets) {
    if (!existsSync(join(ROOT, dir))) continue;
    for (const f of readdirSync(join(ROOT, dir)).filter((x) => x.endsWith(ext)).sort()) {
      out.push({ type, subject: f.replace(ext, ""), claim, path: dir + "/" + f });
    }
  }
  return out;
}
function trackedBadges() {
  const seed = JSON.parse(readFileSync(join(ROOT, "data/providers.json"), "utf8"));
  return (seed.providers || [])
    .filter((p) => p.verified && p.verified !== "pending")
    .map((p) => ({
      type: "badge",
      subject: p.slug || p.id,
      claim: "M-Verified · " + p.verified + " — issued on the M Network to " + p.name,
    }));
}

function load() {
  try { return JSON.parse(readFileSync(CHAIN, "utf8")); } catch { return { note: "The M Chain — hash-linked attestations. Rebuild/verify with tools/chain.mjs. Never edit by hand.", entries: [] }; }
}

function build() {
  const chain = load();
  const have = new Set(chain.entries.map((e) => e.type + ":" + e.subject + ":" + (e.path || "")));
  let prev = chain.entries.length ? chain.entries[chain.entries.length - 1].digest : "genesis";
  let added = 0;

  const candidates = [...trackedFiles(), ...trackedBadges()];
  for (const c of candidates) {
    const key = c.type + ":" + c.subject + ":" + (c.path || "");
    if (have.has(key)) continue;
    const e = {
      i: chain.entries.length,
      prev,
      at: new Date().toISOString(),
      type: c.type,
      subject: c.subject,
      claim: c.claim,
    };
    if (c.path) { e.path = c.path; e.sha256 = sha256(readFileSync(join(ROOT, c.path))); }
    e.digest = digestOf(e);
    chain.entries.push(e);
    prev = e.digest;
    added++;
    console.log(`  + [${e.type}] ${e.subject}  ${e.digest.slice(0, 16)}…`);
  }
  chain.head = prev;
  chain.built_at = new Date().toISOString();
  writeFileSync(CHAIN, JSON.stringify(chain, null, 1));
  console.log(added ? `CHAIN GREW — ${added} new attestation(s), head ${prev.slice(0, 20)}…` : "CHAIN UNCHANGED — everything tracked is already attested.");
}

function verify() {
  const chain = load();
  let prev = "genesis";
  const problems = [];
  for (const e of chain.entries) {
    if (e.prev !== prev) problems.push(`#${e.i} ${e.subject}: broken link (prev mismatch)`);
    if (digestOf(e) !== e.digest) problems.push(`#${e.i} ${e.subject}: digest does not match its own contents`);
    if (e.path) {
      if (!existsSync(join(ROOT, e.path))) problems.push(`#${e.i} ${e.subject}: file missing — ${e.path}`);
      else if (sha256(readFileSync(join(ROOT, e.path))) !== e.sha256)
        problems.push(`#${e.i} ${e.subject}: FILE BYTES CHANGED since attestation — ${e.path}`);
    }
    prev = e.digest;
  }
  if (chain.head && chain.head !== prev) problems.push("head digest does not match the last entry");
  if (problems.length) {
    console.error(`CHAIN BROKEN — ${problems.length} problem(s):`);
    for (const p of problems) console.error("  ✗ " + p);
    process.exit(1);
  }
  console.log(`CHAIN VERIFIED — ${chain.entries.length} attestations, every link holds, every file matches its bytes. Head: ${prev.slice(0, 20)}…`);
}

const cmd = process.argv[2] || "verify";
if (cmd === "build") build();
else verify();
