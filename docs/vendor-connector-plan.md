# Who Did The Shoot — Vendor Backend & Connector Plan

Design for the vendor side of the network: how a verified space plugs its
real business systems into the McCluster platform. Documentation only —
none of this is faked in the static site.

## 1. Vendor types

- **Photo / video studio** (cycs, naturals, rooftops, lighting rigs)
- **Recording studio** (rooms, engineers, mic lockers)
- **Event / broadcast venue** (stages, ballrooms, broadcast floors)
- **Mobile service vendor** (comes to the client: photo, sound, stream kits)
- **Specialist** (engineer, editor, colorist, MC — people, not rooms)

Each type maps to the entity types and required identifiers already defined in
`js/entities.js`, and to the badge sets in `data/service-badges.json`.

## 2. What a vendor account holds

- listing (copy, photos, section, published rates — the network page)
- badge file (granted badges, attestation level, proof, expiry)
- availability (calendar source or manual windows)
- booking pipeline (inquiries → holds → confirmed → completed)
- payout preferences (Square/Stripe reference, never raw bank data in our DB)

## 3. Connector options

Vendors connect the tools they already use. Every connector is optional and
scoped to that vendor's own data.

| Connector | What it does |
| --- | --- |
| Google Calendar | Two-way availability sync; bookings land on their calendar |
| Square | Deposits and payments through the vendor's own Square account |
| Stripe | Same, for Stripe shops |
| Google Sheets | Nightly export of their bookings/inquiries to their sheet |
| Gmail | Send booking confirmations from their own address |
| Meta Pixel | Their ad attribution on their listing page (their pixel, their listing only) |
| TikTok Pixel | Same, TikTok |
| Mailchimp | Push opted-in inquirers to the vendor's list |
| Slack | Booking notifications into their workspace |
| Webhook | Generic POST on booking events to any URL they control |
| Custom API | For chains/franchises with their own systems |

## 4. Connector registry (the security model)

- One registry table (`connectors`) holds provider + status + a `config_ref`.
- `config_ref` points into a server-side secret store (encrypted, access-logged).
  **Secrets never appear in the front end, in this repo, or in client-side
  JavaScript.** The static site ships with empty endpoint constants only.
- OAuth-based connectors (Google, Square, Stripe, Slack, Mailchimp) store
  refresh tokens in the secret store; scopes are the minimum for the job.
- Pixel connectors are content-only (an ID rendered on the vendor's own
  listing page) — they get no access to network data.
- Every connector call is written to the audit log (who, what, when, status).
- A vendor can disconnect any connector instantly; tokens are revoked and the
  registry row is closed, not deleted (audit trail).

## 5. Booking flow with connectors

```
client books on listing page
  → hold created in Control Room
  → Google Calendar connector writes the hold
  → Square/Stripe connector takes the deposit
  → Slack/Gmail connectors notify the vendor
  → completion → Sheets export + review request
```

Any missing connector degrades gracefully to email — the flow never depends
on a third party being connected.

## 6. Rollout

1. Manual concierge phase (today): intakes via interview.html, bookings by email.
2. Calendar + Square first (they close the loop for most rooms).
3. Webhook + Sheets next (cheap, covers the long tail).
4. Pixels and list tools last, once listings carry real traffic.
