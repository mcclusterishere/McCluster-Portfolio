# THE EMBASSY PROGRAM — Equity Uprise on their soil

Category D of the platform map: apps we build INSIDE other platforms.
They take nothing from users — they put the floor where people already
are, and every one of them funnels back to the card (rise.html).

## 1. Discord — SHIPPED (supabase/functions/discord-bot)

Serverless slash commands riding the existing Supabase project:
`/tape` (top of the board), `/price <ticker>` (one desk, both stocks +
street credit), `/floor` (what this is + the door to RISE).

Setup, one time, all in the browser:
1. discord.com/developers/applications → **New Application** → name it
   `Equity Uprise`.
2. General Information page → copy **APPLICATION ID** and **PUBLIC KEY**.
   Bot page → **Reset Token** → copy the token.
3. Supabase → Edge Functions → Secrets: `DISCORD_APP_ID`,
   `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`.
4. Dashboard-deploy the function: exact name **discord-bot**, JWT
   verification **OFF** (Discord signs requests with Ed25519 instead —
   the function verifies every one).
5. Back in Discord → General Information → **Interactions Endpoint URL**:
   `https://fxbkvcrfbbcmrrupdcjt.supabase.co/functions/v1/discord-bot`
   Discord pings it to validate — and on that ping the slash commands
   REGISTER THEMSELVES. No CLI, no curl.
6. OAuth2 → URL Generator → scopes `bot` + `applications.commands` →
   open the generated URL → invite it to the server.

Phase 2 (later): the bell posts into a channel — deals landing, money
arriving, visit pings — via a channel webhook secret.

## 2. Reddit — Devvit app (next)

The Devvit account (McClustermcorp) exists. Build = a Devvit **Web**
template app: a live mini-tape widget + a one-question RISE teaser
inside Reddit posts, discovery via r/GamesOnReddit. Needs the Devvit
web IDE or CLI session — a sit-down build, not a paste.
NOTE: Devvit's "automated account" registration flow is for bots; the
OAuth connect app (Mnetwork at reddit.com/prefs/apps) is separate and
already in flight.

## 3. Twitch — extension (after Reddit)

A stream overlay: the live tape riding member streams, viewers tap
through to the floor. Twitch extensions go through review; the asset
is a static overlay page (this repo can host the dev build). Start
when a member streamer exists to wear it.

## 4. Honest ceilings

Spotify has no third-party app surface (the Web API connect is the
ceiling). TikTok/Instagram have no app platforms — those are content
plays plus the OAuth connects already queued behind their reviews.
