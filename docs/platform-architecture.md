# The McCluster Platform — from landing page to app

## What this is
The cinematic site stays as the front door. Behind it, the platform becomes a real
multimedia app: a catalogue you browse, a player that follows you, accounts that
remember you, a feed that brings you back, and paid tiers. This document is the
build order and the reasoning, so every session (and every future contributor)
builds toward the same thing.

## The stack call
Static GitHub Pages cannot run a server, and we are not leaving it — it serves the
heavy media free and fast. The dynamic layer rides on **Supabase** (managed
Postgres + Auth + Row Level Security + Storage):

- **Why not a custom server**: nothing to patch, nothing to babysit, free tier to
  start, and the browser talks to it directly — the static site stays the whole app.
- **Why not Firebase**: Postgres and RLS give us real relational data (playlists,
  entitlements, feed) with per-row security instead of rule spaghetti.
- **Cost curve**: $0 to start → $25/mo Pro when real traffic arrives → scales past
  anything this needs before a team exists.

The frontend NEVER holds a secret. The Supabase anon key is public by design;
Row Level Security is the wall. Payments stay on Square-hosted links (no card data
ever touches us). The one rule carried over from the consent layer: quiz/poll
answers stay device-local or consented-endpoint only, never joined to identity.

## The layers
1. **Catalogue** — `data/platform.json` is the single source of truth for every
   piece of media (songs, films, experiences, civic records). The app reads it
   statically today; it syncs into the `catalogue` table when the backend lands.
   Adding media = one JSON entry. Never hardcode media into pages again.
2. **Data access** — `js/backend.js` exposes `MCC_DB` (get/set/like/progress).
   Driver A: localStorage (live now — resume points, likes, recents work offline).
   Driver B: Supabase (same interface; flips on when the keys are pasted in).
   Every feature codes against MCC_DB and gets accounts "for free" later.
3. **The app shell** — `app.html`: browse rows built from the catalogue, a
   persistent bottom player (play/pause/scrub/next), continue-listening, likes.
4. **Accounts** (first backend milestone) — Supabase magic-link auth. State moves
   from device to account; same MCC_DB calls.
5. **The feed** — posts table + RSS. The retention engine, announced drops.
6. **Entitlements** — `purchases` table keyed to Square receipts + subscriber
   tier; gates unlock catalogue entries (Heal the 3 early access, the identifier
   walkthrough, subscriber-only films).
7. **Uploads** (later) — Supabase Storage for member submissions (fellowship
   evidence, community stories) with per-user buckets.

## Matthew's one action to light up layer 4
Create the free project (5 minutes): supabase.com → Sign in with GitHub →
New project (name: mccluster, region: US East) → Settings → API → send:
1. the Project URL (https://xxxx.supabase.co)
2. the `anon` public key
Then the SQL in `docs/platform-schema.sql` gets pasted into their SQL editor once,
and accounts, sync, and the feed go live with no redeploy of the media layer.

## Order of battle
| Milestone | Needs | Unlocks |
|---|---|---|
| App shell + catalogue + local state | nothing (ships now) | the app feel, offline |
| Accounts + synced state | Supabase keys | login, cross-device resume |
| Feed | same | drops, comeback loop, RSS |
| Entitlements | Square links + a lookup rule | paid unlocks, subscriber tier |
| Uploads | same | community submissions |
