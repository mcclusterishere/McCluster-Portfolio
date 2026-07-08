# Equity Uprise OS — System Blueprint v1

**Owner:** Matthew McCluster · matthew@mccluster.org
**Status:** Working constitution. Everything here is the source of truth for how the
platform behaves; the code catches up to this document, not the other way around.
**Date:** July 2026

---

## 0. The one-sentence thesis

The platform is built around **records, not pages**. Every person, space, offer,
deal, booking, payment, right, and proof is a row the system can act on — pages are
just views of those rows. The public site is the storefront; the OS is the store.

---

## 1. The objects (the eight nouns)

Everything in the system is one of these. If a feature can't be expressed as one of
these objects or a relationship between them, it doesn't ship yet.

| Object | What it is | Where it lives today |
|---|---|---|
| **People** | Every human: clients, providers, members, admins. One identity per email (Supabase auth). | `auth.users` + `providers.owner` + `members.owner` |
| **Spaces** | Bookable physical rooms/properties (two properties ready to list). Access windows, house rules, rates. | New table (Phase 2): `spaces` |
| **Offers** | A published capability with a price shape: a service, a package, a space listing, the Limited Offer. | `providers` (services) + `data/providers.json` seed; `spaces` later |
| **Deals** | An agreement in motion: proposal → counter → terms lock → signature → ledger entry. | New tables (Phase 3): `deals`, `deal_terms`, `deal_events` |
| **Bookings** | A scheduled instance of an offer: date, place, parties, status. | `booking_requests` today; grows into `bookings` with calendar holds |
| **Payments** | Money movement records: what was owed, what moved, on which rail (Square), for which deal/booking. | Square is the rail; `payments` mirror table (Phase 3) keyed to Square IDs |
| **Rights** | Who owns what, in what percentage, effective when: splits, work-for-hire transfers, licenses. | New tables (Phase 3): `rights_ledger` |
| **Proof** | Evidence attached to any other object: signed PDFs, IDs verified, photos of the room, delivery receipts, PRO registrations. | New table (Phase 2): `proofs` (object_type, object_id, kind, url, verified_by) |

**Rule:** any object can carry Proof rows. Badges (§6) are computed from Proof, never
hand-assigned without it.

---

## 2. Roles & permissions

Four roles. RLS (already live for the first three) is the wall — the anon key can
only do what policies allow.

| Role | Who | Can |
|---|---|---|
| **Visitor** (anon) | Anyone on the site | Read live listings; file booking requests; opt in to SMS; donate |
| **Provider** | Signed-in talent with a `providers` row | Edit own listing (never self-approve to live); read/work own booking inbox; sign deals they're party to |
| **Member** | Signed-in person with a `members` row | Read/edit own member record; join programming; give residually |
| **Admin** | `matthew@mccluster.org` (JWT-verified via `is_mcc_admin()`) | Everything: approve listings, work all inboxes, set statuses, read SMS list, lock deal terms, verify Proof, issue badges |

**Approval flow (already live):** provider submits → row lands `pending` → admin
reviews in Mission Control → `live` or stays paused. Owners physically cannot flip
their own row to `live` (RLS `with check`).

**Entity decision (July 2026): the network runs on the nonprofit side.** Equity
Uprise operates the whole platform — directory, Collab Room, deals, performance
packets, memberships, tithe — as a **workforce-development and creative-business
education program**: artists and providers learn rights, contracts, pricing, and PRO
reporting by using the system, which is the story that targets government grant and
WIOA-adjacent funding. McCluster Corp (LLC) keeps only the plainly commercial personal
work: web builds, the Limited Offer, day rates. Standing cautions: (1) earned
marketplace revenue at scale is a UBIT question — accountant review before the 33%
engine turns on; (2) money and books never mix between the two entities.

**Payments decision (July 2026): the rail is Stripe.** Stripe Payment Links now
(subscribe, tithe, membership residual, walkthrough — paste into `js/payments.js`);
**Stripe Connect** later for provider payouts, the 33% margin, fee absorption, and
automated 1099s. Existing Square song links stay live until replaced.

---

## 3. Deal engine (the heart)

A Deal moves through fixed states. No skipping states; every transition writes a
`deal_events` row (who, when, what changed) — that's the audit trail.

```
Proposal → Counterproposal (0..n rounds) → Terms Lock → Signature
        → Rights Ledger entry → Release Checklist → Payment & Reporting
```

- **Proposal:** either side drafts from a template (§4). All numbers editable.
- **Counterproposal:** the other side edits; diffs are stored, not overwritten.
- **Terms Lock:** admin (or both parties in later phases) freezes the numbers. After
  lock, the terms are immutable — changes mean a new deal version.
- **Signature:** e-sign on the locked PDF; the signed file is a Proof row.
- **Rights Ledger:** splits/transfers take effect and are queryable forever.
- **Release Checklist:** per-template list (masters delivered, metadata filed, PRO
  registration submitted, space keys returned…). Deal isn't "done" until checked.
- **Payment & Reporting:** Square records reconciled to the deal; PRO packets
  (ASCAP/BMI/SESAC) generated from the Rights Ledger, not from memory.

---

## 4. The three contract templates (v1)

1. **Simple Song Split** — parties, song, percentages (must total 100), PRO/IPI
   numbers per writer (Zakir's are already on file: IPI 01209963535, publishing IPI
   01210406031), effective date. Output: split sheet PDF + rights_ledger rows.
2. **Work-for-Hire Service** — client, provider, scope, rate, deliverables,
   turnaround, full rights transfer on payment. Output: WFH agreement + ledger
   transfer row keyed to the payment record.
3. **Space Booking Agreement** — space, renter, access window (start/end datetime,
   before smart locks this is the enforcement layer: no window row, no entry),
   rate, deposit, house rules acknowledgment. Output: booking + agreement PDF.

---

## 5. Money rules

- **Rails:** Square for everything (subscriptions, tithe, residual giving, paid
  calls). Supabase stores mirrors/receipts, never card data.
- **Marketplace margin:** platform lists provider work at **provider rate + 33%**.
- **"We Bet On You" program:** selected providers keep 100% of their own rate; the
  client pays the marked-up platform price; the platform's margin funds the program.
  Exclusivity applies while enrolled. ⚠️ **Legal flag (standing):** the instinct that
  "the client must never be told the rate is lower elsewhere" is a consumer-disclosure
  risk — run the program's client-facing language past a lawyer before enrollment
  opens. Price the package honestly as a package; don't warrant anything about
  provider street rates.
- **The tithe:** 10% ask on completed network work — voluntary, honor-system, framed
  exactly as "we don't tax, we ask a tithe." Recorded per booking
  (`booking_requests.tithe_pct`), paid through the nonprofit's Square.
- **Internal economics (not public):** hired videographers $50/hr (3 hrs/wk/client =
  $450/wk at 3 clients); Matthew's solo venture rate $100/hr; studio package $125/hr
  (includes $25/hr studio rent to the partner space). Limited Offer margin is the
  spread between $14,400/yr client revenue and ~$23,400/yr fully-hired delivery cost
  — which is why the offer holds at exactly 3 clients while Matthew still shoots, and
  why after 3 clients the model flips to day rates + productized web work.

---

## 6. Badge tiers (a compliance funnel, not decoration)

Each badge = specific Proof rows verified by admin. A profile shows only what it has
earned. Order matters — each tier presumes the ones before it.

1. **Identity Verified** — government ID checked against the account email.
2. **Rights Ready** — PRO affiliation + IPI numbers on file (writers/artists).
3. **Booking Ready** — rates, availability, and cancellation terms published.
4. **Studio Verified** — space inspected; photos + access-window rules on file.
5. **Engineer Verified** — portfolio session reviewed; gear list on file.
6. **Performance Ready** — live footage proof + tech rider on file.
7. **Equity Uprise Approved** — the top seal: everything above plus a completed deal
   through the platform with clean release checklist.

---

## 7. Booking rules

- Every booking starts as a request (`booking_requests`, already live: anyone can
  file; the provider works their own inbox; admin sees all).
- **Space bookings** add an access window: entry is only legitimate inside
  `[access_start, access_end]`. Until smart locks land, the window is enforced by
  humans holding keys — but the *record* exists from day one, so locks are a swap-in,
  not a redesign.
- SMS opt-in is consent-first: the exact TCPA consent line shown at opt-in is stored
  verbatim (`sms_optins.consent`). No opt-in row, no text. The list is readable only
  by admin/service role.

---

## 8. Admin flow (Mission Control, already live)

Magic-link sign-in → JWT email check → tabs: **Listings** (approve/pause),
**Requests** (accept/decline/done), **Members** (activate/board-track), **Texts**
(list size), **Cockpit** (GA, Square, Supabase, repo). Every approval the platform
needs a human for happens here. The MCP server (`tools/mcp/server.mjs`) exposes the
same spine to AI assistants: list providers, file bookings, work statuses — the
"speak to the platform" layer.

---

## 9. First ten records to onboard

1. **McCluster** — master demo profile (already seeded in `data/providers.json`).
2. **Zakir / Decibel Studios** — first real provider page (pub info on file).
3. **Space #1** — first property, with photos, rates, access-window rules.
4. **Space #2** — second property, same treatment.
5. **The three Limited Offer clients** (as People + Deals as they sign; 1 claimed).
6. **First "We Bet On You" provider** — after the legal language clears.
7. **Board members** — as Members with `board` status via members.html.
8. **First split-sheet deal** — a real Vaunt-EP split through the Simple Song Split
   template (Matthew × Zakir) as the proving run.

---

## 10. Phases (mapped to what's already built)

| Phase | Scope | Status |
|---|---|---|
| **1. Storefront + spine** | Site, providers directory, booking requests, SMS list, members, Mission Control, MCP | ✅ Built (this repo + Supabase live) |
| **2. Proof & spaces** | `proofs` + `spaces` tables, badge computation, the two properties listed, access windows | Next build |
| **3. Deal engine** | `deals`/`deal_terms`/`deal_events`/`rights_ledger`/`payments` mirror, three templates, e-sign, release checklists | After Square links + Pro tier |
| **4. Money automation** | Square webhooks → payments mirror; tithe tracking; PRO reporting packets | Requires Cloudflare Worker |
| **5. "We Bet On You"** | Program enrollment, margin accounting, exclusivity terms | After legal review |
| **6. Scale** | Smart locks, multi-admin, provider self-serve deals, purchasable "site like this" product, day-rate landers | After the 3 clients are signed |

---

## 10.5 The Kingdom (private)

Behind every entity in this document stands the tribe — **referenced publicly
only as "the kingdom," in a holy register, never by name**. Its registration,
EIN, and documents stay off this repo and off the site permanently. Public
touchpoints are limited to reverent one-liners (footers, closing lines) and
the gold-lit lyric bars (chieftain / tribal) on the Heal the 3 experience.
The citation and registration papers live with Matthew only.

## 11. Standing constraints (do not violate)

- No AI attribution anywhere public.
- No secrets in the repo — anon key only; RLS is the wall; service key stays in env.
- Consent-first data: nothing texted, saved, or published about a person without a
  recorded opt-in or explicit authorization.
- Nonprofit and LLC money never mix.
- Orphan pages stay orphaned until there's a better plan.
