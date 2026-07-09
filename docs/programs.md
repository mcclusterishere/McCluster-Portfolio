# Programs on the floor — engagement is their fuel

A **program** is an organization that trades on the exchange like a
person or a business does — Equity Uprise ($EU) is the first. Set
`"entity": "program"` on the provider row and the floor treats it
differently in exactly one way: **the crowd moves its price.**

## The engagement channel

Every provider row may carry `"tracks": [...]` — the catalogue slugs
whose plays belong to it. The floor reads the live Heat counter
(`track_plays`) and bends the last price by the crowd:

| Who | Cap on the bend | Curve |
|---|---|---|
| Program | +35% | `log10(1 + plays) × 0.16` |
| Person / business | +8% | `log10(1 + plays) × 0.04` |

Programs compete against each other on money AND on movement — the
only user type where content interaction is a big share of the line.
People get a nudge from the same plays, never a shove; their price
still runs on real work (deals, bookings, the grind).

## Anyone can be on the chart — claiming it is the door in

Rows with `"claimed": false` are **outsiders**: public metrics on a
real chart, running whether they've joined or not (K-Cohiba today).
The list shows an `unclaimed` tag; the ticker sheet shows the claim
card — "This is me — claim the ticker" → `claim.html?who=slug`.
Making a profile = claiming yourself on the chart.

## Streaming platforms join the same channel (staged)

The point system is built to take **plays on every platform**, not
just this one. The plan (see the strategy conversation, 2026-07-09):
a nightly GitHub Action polls the free APIs — Spotify (popularity,
followers), YouTube (views), Deezer (fans), Last.fm (listeners) —
snapshots into a `song_stats` table, and those numbers flow into the
same `tracks → engagement` channel the Heat uses today. External
streams then literally move tickers on the floor. Needs: free
Spotify + YouTube API keys from Matthew. Paid fallback if deeper
data is ever wanted: Viberate (~$20/mo), never Songstats pricing.
