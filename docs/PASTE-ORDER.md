# THE PASTE ORDER — the engine's assembly manual

One list, one order. Every schema paste in `docs/`, in dependency order.
Each file is safe to re-run. When in doubt, run the whole ladder top to
bottom — the two SEAL files at the end re-assert the safe version of
everything, so the ladder always converges to the hardened engine no
matter what ran before.

## The ladder

| # | File | What it opens | Needs |
|---|------|---------------|-------|
| 1 | `platform-schema.sql` | core plumbing, touch_updated_at | — |
| 2 | `network-schema.sql` | providers, booking_requests | 1 |
| 3 | `admin-schema.sql` | `is_mcc_admin()` — the desk's key | 2 |
| 4 | `collab-schema.sql` | deals, performances | 2 |
| 5 | `market-schema.sql` | deal kinds/statuses, tickers, spaces | 4 |
| 6 | `intake-schema.sql` · `agreement-schema.sql` · `analytics-schema.sql` · `proofs-schema.sql` · `push-schema.sql` · `messages-schema.sql` · `ratings-schema.sql` · `music-schema.sql` · `sync-schema.sql` · `verify-schema.sql` | the middle organs (any order) | 2–5 |
| 7 | `mtoken-schema.sql` | the E-Up ledger + the SAFE mint | 5 |
| 8 | `mtoken-transfer.sql` | transfers + beta bankroll | 7 |
| 9 | `reserve-schema.sql` | earned test, cash-outs, reserve books | 7 |
| 10 | `fund-schema.sql` | the One Percent Fund | 7 |
| 11 | `house-schema.sql` | the shelf (EARNED-only claims) | 9 |
| 12 | `gauntlet-schema.sql` | the Trap milestones + my_mission | 7 |
| 13 | `claimrun-bonus.sql` | the 5 E⤴ operator bonus | 7 |
| 14 | `referral-schema.sql` | the plug economy | 7 |
| 15 | `heat-schema.sql` | deduped play counter | — |
| 16 | `social-schema.sql` | posts, supporters, follows, comments | 2 |
| 17 | `social2-schema.sql` | reactions + the Wire feed | 16 |
| 18 | `civic-schema.sql` then `civic2-schema.sql` | civic HQ (2 supersedes 1) | 3 |
| 19 | `control-schema.sql` | proposals + one-head-one-vote | 3 |
| 20 | `people-schema.sql` · `admin-power.sql` · `brain-schema.sql` · `worker-schema.sql` · `guide-schema.sql` | the desk's eyes + the AI organs | 3 |
| 21 | `payments-schema.sql` | card-rail columns + lockdown | 2 |
| 22 | `equity-schema.sql` | deal_payments + equity pool + safe mint | 7, 21 |
| 23 | `records-schema.sql` | records + the relationship table + mint_profile | 3 |
| 24 | `identifiers-schema.sql` | the identifier locker + identity power | 3 |
| 24b | `identifiers2-schema.sql` | locker goes dynamic (any category's identifiers) | 24 |
| 24c | `badges-schema.sql` | the multicolored M-Verified seals, held & verified | 3 |
| 25 | `web3-schema.sql` | treasury + academy + gas grants | 24 |
| 26 | `vault-schema.sql` | the reserve that only fills + my_wallet | 7, 22 |
| 26b | `distribution-schema.sql` | member_connections + earnings_reports + my_distribution | 3 |
| 26d | `signals-schema.sql` | external_signals + my_signals (the outside world) | 24b |
| 26c | `rescale-schema.sql` | THE GREAT RESCALE — reset to zero (earned/purchased survive), bankroll retired, the 1,000 E⤴ Trap | all of 1–26 |
| 27 | **`hardening-schema.sql`** | **SEAL #1 — re-asserts every safe function** | all |
| 28 | **`score-schema.sql`** | **SEAL #2 — the score engine + my_card()** | all |

## The law of the ladder

- **27 and 28 always run last.** They are the authoritative last word:
  whatever older file gets re-pasted later, re-running the two seals
  restores the hardened engine.
- **Nothing mints unbacked.** Earned credit prints only against
  `deal_payments` — the row the Stripe webhook writes on the service
  role. No browser, no member, no admin typo can forge it.
- **One ledger, colored by `reason`.** `is_earned_reason()` is the only
  place the earned test lives. New spend reasons that should feed the
  Vault get added in ONE place: `vault_intake()`.
- **The score reads only hardened spines.** If a new metric can be
  written by an anonymous curl loop, it does not enter `street_score()`
  until it's deduped or verified.

## Edge functions (dashboard-deploy, exact names)

| Function | JWT verification | Secrets used |
|---|---|---|
| `stripe-webhook` | OFF (Stripe signs) | STRIPE_SK, STRIPE_WHSEC |
| `pay-deal` | OFF (checks GoTrue inside) | STRIPE_SK |
| `buy-eup` | OFF (checks GoTrue inside) | STRIPE_SK |
| `connect-onboard` | ON | STRIPE_SK |
| `the-brain` | OFF (admin check inside) | ANTHROPIC_KEY |
| `the-guide` | OFF (member check inside) | ANTHROPIC_KEY |
| `signal-sweep` | OFF (desk/cron secret inside) | SPOTIFY_ID, SPOTIFY_SECRET, YOUTUBE_KEY, LASTFM_KEY, SWEEP_SECRET |
| `scan-proof` | OFF (member check inside) | ANTHROPIC_KEY |

## Dashboard switches

- Authentication → **Anonymous sign-ins ON** (instant accounts)
- Authentication → Email → **Confirm email OFF** (password door)
- Database → Extensions → **pg_cron ON** (the nightly score tape)
