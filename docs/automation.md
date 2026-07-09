# The Automation Map — what runs itself, what's next, where it's headed

The doctrine: **every signal files into the database; every response is a
script away.** The intake rail's `kind` column, the analytics `events`
table, the deal statuses, the ledger — these are the hooks the machines
grab. Nothing below requires a server you maintain: it's all database
triggers, edge functions, and GitHub Actions.

## Running today (no hands)

| Machine | Trigger | What it does |
|---|---|---|
| Paid-flip | Stripe webhook → `stripe-webhook` | deal → `paid`, no human |
| Token mint | DB trigger `mint_on_completion` | deal `completed` → 5% provider / 1% buyer in ᴹ |
| Claim Run bonus | RPC, once per account | Operator rank → 5 ᴹ, double-claim impossible |
| Beta bankroll | RPC, once per account | 1,000 ᴹ faucet for the fake-rail promo |
| Token transfers | RPC `transfer_tokens` | person-to-person credit, server-checked balance |
| Connect status stamp | `connect-onboard` on desk boot | `charges_enabled` self-stamps after Stripe verifies |
| First-party analytics | every `MCC_TRACK` call | events mirror into `events`; Mission Control reads live |
| Intake rail | every old mailto door | asks file into `intake`, tagged by kind |
| Catalogue rebuild | GitHub Action on audio push | new master → track pages, manifest, players |
| Deploy mirror | GitHub Action on production push | site → gh-pages, no manual publish |
| Engine gates | audit-engine, audit-static, smoke, walkthrough | every ship self-tests the whole journey |

## Armed, waiting on one key each (your errand list)

| Machine | Blocked on | Then |
|---|---|---|
| Nightly song-stats sweep | `YOUTUBE_KEY` + Spotify creds as GitHub secrets | plays across platforms → `artist_daily_stats` → EU score moves tickers nightly |
| Outbound email answers | Resend DNS verify | intake auto-responses + magic links that always land |

## Next machines to build (in order of payback)

1. **The intake responder** — edge function on a schedule (or pg_cron):
   new `intake` rows get an instant acknowledgment by kind ("fellowship:
   here's the reading list", "quote-web: here's the tier sheet") via
   Resend the moment DNS lands. The `kind` column is already the router.
2. **The listing scorer** — DB trigger on `providers` insert: completeness
   score (name/ticker/headline/blurb/roles/photo), flags junk, sorts your
   review queue hottest-first. Approval stays human; triage goes machine.
3. **The daily digest** — scheduled edge function: yesterday's events,
   new intake by kind, deals moved, tokens moved, listings pending — one
   email to the admin every morning. The owner's paper.
4. **The EU score engine** — nightly Action (fires when song-stats lands):
   plays + heat + deals + ratings → equity_uprise_score → programs race
   on the market like you designed.
5. **The dead-deal sweeper** — pg_cron: deals sitting `proposed` for 14
   days get a nudge event; sitting 30, auto-`declined` with a note. The
   floor stays honest.
6. **The backup courier** — weekly Action: `pg_dump` via Supabase
   connection string → private repo artifact. The whole platform,
   restorable from any laptop.

## The through-line

Every new feature lands with its hook: a table the algorithms can read,
a kind/status column they can route on, an RPC only the server can
write. That's why the next machine is always a script, never a rebuild.
