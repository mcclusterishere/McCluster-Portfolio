# McCluster Control Room — Backend Plan

This is the design document for the real backend behind the McCluster platform:
user accounts, vendor verification, the fellowship, the psychology-marker layer,
and analytics. The public site in this repo stays static; everything below is
what gets built when the Control Room moves onto its own server and database.
Nothing in this document is implemented as fake front-end — the site links to
real intake forms today and will point at these services when they exist.

---

## 1. Principles

1. **Consent first.** Every piece of personal data is collected in the open,
   with the person told what it's for at the moment they give it.
2. **No covert profiles.** The psychology-marker layer never builds a hidden
   psychological profile of a visitor. Quiz answers are anonymous, aggregate,
   and deletable.
3. **No clinical or medical inference.** Markers describe common behavioral
   patterns in plain English. The system never infers, stores, or implies a
   medical or psychiatric condition.
4. **No political-belief inference.** Marker answers are never used to infer,
   score, or segment anyone's political views. The Equity Uprise side of the
   platform keeps its own explicit, consented data and never borrows from the
   marker layer.
5. **"Save in our blood" means our own database** — a controlled backend DB
   under McCluster's keys, with audit logs, not scattered third-party sheets.
   The current Google-Sheets intake (docs/sheets-backend/) is the interim
   collector; it migrates into the DB below.
6. **Deletable and exportable.** Any account holder can export their data and
   ask for deletion; deletion cascades and is logged.
7. **No secrets in the front end.** The static site carries endpoints only.
   Keys, tokens, and connector credentials live server-side in the connector
   registry (see docs/vendor-connector-plan.md).

## 2. Accounts and approval flow

Registration is application-based — nobody self-provisions into the network.
Applicants choose their password (and the rest of their credentials) at
application time, but the account **sits pending until approved**: it cannot
log in, vote, or appear anywhere until an admin flips it to APPROVED.

```
visitor → submits application (verify.html / interview.html / fellowship.html)
       → chooses email + password up front (hashed immediately, argon2id)
       → record created with status = NEW, account inert
       → admin review in the panel (approve / request-more / reject)
       → APPROVED → account activates, role assigned, welcome email
```

Participation that matters (voting, campaign tools, wearing badges publicly)
requires an account. The only alternative is explicit, plainly-worded opt-in
at the moment of participation — never silent tracking.

Statuses: `NEW → IN_REVIEW → NEEDS_INFO → APPROVED | REJECTED → ACTIVE → SUSPENDED | CLOSED`.
Every transition is written to the audit log with actor, timestamp, and reason.

## 3. Roles

| Role | What it can do |
| --- | --- |
| `admin` | Everything: review queues, badge grants, connector config, audit log |
| `staff` | Review intakes, message applicants, propose badge grants |
| `vendor` | Manage own listing, rates, calendar, connectors, badge applications |
| `fellow` | Fellowship materials, cohort space, ballot participation |
| `artist` | Catalogue entries, civic-anthem submissions |
| `partner` | Campaign/outreach tools scoped to their organization |
| `member` | Basic profile, purchases, subscriptions |

Roles are additive (a vendor can also be a fellow). Authorization is
role + ownership: vendors only ever see their own records.

## 4. Admin panel

One internal panel (never public, own subdomain, SSO + 2FA):

- **Review queue** — every `_form` submission (verification, space-interview,
  fellowship) in one inbox with status controls and canned responses.
- **Badge desk** — grant/revoke badges per vendor, record attestation level
  (self / document / site), attach proof documents, set expiry.
- **Listings** — publish/unpublish vendor pages, edit published rates.
- **Fellowship** — cohort management, two-layer intake results (see
  docs/equity-uprise-platform-plan.md), ballot administration.
- **Analytics** — the consented aggregate dashboards only (section 7).
- **Audit log** — append-only, every admin action recorded.

## 5. Database plan

Postgres. Tables (abridged to the load-bearing columns):

- `users` (id, email, name, created_at, status)
- `roles` (user_id, role, granted_by, granted_at)
- `intakes` (id, form_kind, payload_json, status, submitted_at, reviewed_by)
- `vendors` (id, user_id, entity_type, legal_name, identifiers_json, listing_status)
- `vendor_rates` (vendor_id, item, price, unit, published)
- `badges` (id, badge_key, vendor_id, attestation_level, proof_ref, granted_by, granted_at, expires_at, revoked_at)
- `listings` (vendor_id, section, page_slug, published_at)
- `fellows` (id, user_id, cohort, intake_layer1_json, intake_layer2_json, status)
- `ballots` (id, question, options_json, opens_at, closes_at)
- `ballot_votes` (ballot_id, user_id, choice, cast_at) — one row per member, visible to the member, tallied in aggregate
- `anthems` (id, artist_user_id, title, isrc, status)
- `campaigns` (id, partner_id, kind, config_json, status)
- `connectors` (id, owner_kind, owner_id, provider, config_ref, status) — config_ref points at the secret store, never inline
- `marker_events` (id, marker_id, event, option_index, page, ts) — **no user_id, no session_id, no IP**
- `orders` (id, user_id, product, amount, square_ref, status)
- `audit_log` (id, actor_id, action, subject_kind, subject_id, detail_json, ts) — append-only
- `deletion_requests` (id, user_id, requested_at, completed_at)

Backups nightly, encrypted at rest, keys held by McCluster only.

## 6. Consent-first data rules (the hard lines)

- Do **not** sell identifiable personal data. Ever.
- Do **not** create secret psychological profiles.
- Do **not** infer medical or clinical disorders.
- Do **not** infer political beliefs from psychology-marker answers.
- Marker quiz answers are stored **only** as anonymous aggregate rows
  (`marker_events`), never joined to accounts.
- Every account can self-export (JSON) and request deletion; deletion completes
  within 30 days and is logged in `deletion_requests`.
- Dark patterns are out: no pre-checked boxes, no guilt copy on opt-outs, no
  countdown timers on consent.

## 6a. Profile badges — worn or hidden, the member's call

Completing a marker's deeper quiz earns that marker's badge. Today the badge
lives only in the visitor's own browser (localStorage) with a worn/hidden
choice made at the moment it's earned; the registry page lets them flip it any
time. When accounts ship, a member can import their device badges to their
profile — imports are explicit, and the worn/hidden setting is honored
server-side (`profile_badges`: user_id, badge_kind, badge_key, worn,
earned_at). Vendor badges surface on vendor profiles the same way. Hidden
badges are invisible to everyone including admins' public views; they exist
only so the member can flip them back on.

## 6b. Monetization boundary — what the data business is and isn't

The surveys and marker quizzes feed **statistics**, and statistics are the
product: aggregate, anonymized insight reports (e.g. "which markers get the
most deeper-quiz completions per track", "what services sections convert").
Those aggregates can be published, licensed, or used to price sponsorships.

The hard line, restated from section 6: we do not build or sell per-person
advertising profiles, and we do not map an individual's quiz answers to ad
targeting. If an advertiser wants reach, they buy placement against
aggregate segments (minimum bucket 20, no identity attached) — the same way
radio sells drive-time without selling the drivers.

## 7. Analytics — consented aggregates only

Allowed segments (aggregate, minimum bucket size 20):

- song plays / completes per track
- marker opens, deeper-quiz starts/completes per marker id
- badge clicks and explainer views per badge
- intake starts/completes per form
- purchase conversion per product
- page/section reach on the scroll

Explicitly avoided: covert scoring of individuals, microtargeting,
selling or sharing profiles, per-person marker histories, and any join
between marker answers and identity.

The front-end interface is already in place: `window.MCC_TRACK(name, params)`
in `js/analytics.js`, with a dormant `TRACK_ENDPOINT` constant that will point
at the Control Room collector (`POST /collect`, anonymous JSON) when it ships.

## 8. Event vocabulary (current)

`song_start`, `song_stop`, `cta_click`, `service_click`, `badge_click`,
`badge_explainer_view`, `psych_marker_open`, `psych_marker_close`,
`psych_marker_deep_click`, `psych_quiz_start`, `psych_quiz_answer`,
`psych_quiz_complete`, `psych_registry_view`, plus docket-archive events
(see the docket explainer page).

## 9. Migration path

1. Today: static site + Google Apps Script intake (docs/sheets-backend/).
2. Next: stand up the DB + admin panel; Apps Script forwards into it.
3. Then: switch `INTAKE_ENDPOINT` constants to the Control Room API,
   enable `TRACK_ENDPOINT`, retire the sheet to read-only archive.
