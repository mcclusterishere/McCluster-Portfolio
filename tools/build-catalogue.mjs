#!/usr/bin/env node
/* ============================================================
   build-catalogue.mjs — the catalogue builds itself.

   Scans assets/audio/*.mp3, reads its metadata from
   data/song-meta.json, measures each file's real duration, and
   writes data/catalogue.json — the list catalogue.html renders.

   The rule:
   - a song in song-meta.json whose mp3 is present  -> listed, timed, "Own it"
   - a song flagged "soon": true                    -> listed as upcoming
   - an mp3 with no metadata                         -> still listed, title
                                                        derived from its filename
   - "catalogue": false                              -> kept out of the QT6KV
                                                        catalogue (release-only cuts)

   Drop a new mp3 in assets/audio/ (and, ideally, add its row to
   song-meta.json) and it shows up on the next build. The GitHub
   Action .github/workflows/build-catalogue.yml runs this on every
   push that touches the audio folder or the metadata.

   Usage: node tools/build-catalogue.mjs        (Node 18+, needs ffprobe or ffmpeg)
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUDIO_DIR = path.join(ROOT, "assets", "audio");
const META_FILE = path.join(ROOT, "data", "song-meta.json");
const OUT_FILE = path.join(ROOT, "data", "catalogue.json");

/* ---------- find something that can read a duration ---------- */
function ffprobeDuration(file) {
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
    const s = parseFloat(out.trim());
    if (s > 0) return s;
  } catch (e) { /* fall through */ }
  // fall back to any ffmpeg on PATH, then the sandbox's imageio build
  const ffmpegs = ["ffmpeg"];
  try {
    const glob = path.join("/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries");
    if (fs.existsSync(glob)) for (const f of fs.readdirSync(glob)) if (f.startsWith("ffmpeg")) ffmpegs.push(path.join(glob, f));
  } catch (e) {}
  for (const bin of ffmpegs) {
    try {
      execFileSync(bin, ["-i", file], { encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] });
    } catch (err) {
      const m = String(err.stderr || "").match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (m) return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
    }
  }
  return 0;
}

function mmss(sec) {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m + ":" + String(s === 60 ? 0 : s).padStart(2, "0");
}

function titleFromSlug(slug) {
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

/* ---------- read metadata + the files that actually exist ---------- */
const meta = JSON.parse(fs.readFileSync(META_FILE, "utf8"));
const songs = meta.songs || {};
const present = fs.existsSync(AUDIO_DIR)
  ? new Set(fs.readdirSync(AUDIO_DIR).filter(function (f) { return f.endsWith(".mp3"); }).map(function (f) { return f.replace(/\.mp3$/, ""); }))
  : new Set();

const rows = [];
const seen = new Set();

// metadata-driven entries (present files + known-upcoming songs)
Object.keys(songs).forEach(function (slug) {
  const s = songs[slug];
  if (s.catalogue === false) { seen.add(slug); return; }
  const has = present.has(slug);
  if (!has && !s.soon) return; // no file and not flagged upcoming -> skip
  seen.add(slug);
  const dur = has ? ffprobeDuration(path.join(AUDIO_DIR, slug + ".mp3")) : 0;
  rows.push({
    slug: slug,
    title: s.title || titleFromSlug(slug),
    credit: s.credit || "",
    album: s.album || "",
    page: s.page || "",
    length: has ? mmss(dur) : "soon",
    available: has,
    order: s.order != null ? s.order : 999,
  });
});

// any mp3 present with no metadata at all — surface it automatically
Array.from(present).sort().forEach(function (slug) {
  if (seen.has(slug)) return;
  const dur = ffprobeDuration(path.join(AUDIO_DIR, slug + ".mp3"));
  rows.push({
    slug: slug,
    title: titleFromSlug(slug),
    credit: "",
    album: "Unfiled",
    page: "",
    length: mmss(dur),
    available: true,
    order: 500,
  });
  console.log("new track found (no metadata yet): " + slug);
});

rows.sort(function (a, b) { return a.order - b.order || a.title.localeCompare(b.title); });
rows.forEach(function (r, i) { r.no = String(i + 1).padStart(2, "0"); });

const outMeta = {
  generated_at: new Date().toISOString(),
  isrc_prefix: meta.isrc_prefix || "",
  count: rows.length,
  tracks: rows,
};
fs.writeFileSync(OUT_FILE, JSON.stringify(outMeta, null, 2) + "\n");

console.log("Wrote " + path.relative(ROOT, OUT_FILE) + " — " + rows.length + " tracks:");
rows.forEach(function (r) { console.log("  " + r.no + "  " + r.title + "  " + (r.length || "") + "  [" + (r.album || "—") + "]"); });
