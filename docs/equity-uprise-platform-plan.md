# Equity Uprise — Civic Platform Plan

Equity Uprise turns policy, music, media, and voter outreach into one
operating system. This document is the design for that system's backend.
The public site carries the manifesto, the fellowship terminal, and the
platform CTAs; everything below gets built on the Control Room backend
(docs/control-room-backend-plan.md) under the same consent-first rules.

## 1. What the platform does

- **Policy** — the docket work: filings, citations, recommendations,
  public-record explainers (see the Docket 516 archive page).
- **Music & media** — civic anthems: original tracks and videos submitted by
  artists and put to work in campaigns, with rights and credits tracked.
- **Voter outreach** — organized, consented contact lists and campaign tools
  for events, canvasses, and turnout pushes.
- **The fellowship** — the free policy fellowship that trains organizers.

Public CTAs on the home page map to real intake routes:
Apply for a Profile → verification intake; Join the Policy Fellowship →
fellowship terminal; Submit a Civic Anthem / Launch an Outreach Campaign →
email intake today, platform forms later; Vendor/Partner and Admin logins →
access requests until the backend ships.

## 2. Fellowship intake — two layers, no diagnosis

The fellowship interview is **not** a psychological assessment. It has two
explicit, labeled layers:

1. **Organizing Style + Skills Intake** — what you're good at, what you want
   to work on, hours you can give, tools you know. Plain questions, answers
   visible to the applicant, editable any time.
2. **Fellowship Readiness Interview** — a conversation about commitment,
   collaboration, and expectations, scheduled with a human.

Hard lines: no personality scoring, no marker data, no covert traits.
The psychology-marker layer on the music pages is a separate, anonymous
art/education feature and never feeds fellowship decisions.

**Where the application lives:** in the party's own backend (once the
endpoint is live), in the applicant's browser storage, and in a downloadable
copy the applicant keeps — the fellowship terminal already writes all three.
Their words stay theirs.

**Layer 3 — the Accepted Fellows Portal.** After acceptance, fellows get a
logged-in portal with a deeper intake: placement interview (which policy
lane, which campaigns, which skills to grow), availability planning, and
cohort assignments. Deeper means more detailed about the *work* — it is
still not a psychological assessment, and marker data still never enters it.

## 3. The ballot

Members vote on priority questions (the terminal already narrows a ballot to
picked priorities). On the backend: `ballots` + `ballot_votes` — one vote per
member, the member can see and change their own vote until close, tallies are
published in aggregate only.

## 4. Voter and campaign data — the rules

- **Consent only.** Contact records come from people who signed up with
  Equity Uprise or from files a partner lawfully owns and imports.
- **Never scrape** voter rolls or third-party sites into the platform.
- **Never expose** voter data publicly or to other partners; every list is
  scoped to the campaign that imported it.
- **Never commingle**: imported campaign lists, member records, and
  marker-layer analytics live in separate stores with no joins.
- **No belief inference.** No scoring of individuals' political views —
  from markers, from music taste, from anything.

## 5. Connector architecture (campaign side)

Imports are file- and API-based, always initiated by the partner. The pitch
is real: a partner with an approved profile can bring their own campaign
data into the platform and run their outreach through Equity Uprise as if it
were their own system.

- **CSV import** — the workhorse; column mapping UI, dedupe, source tag.
- **VoteBuilder / VAN export import** — partners who work in VoteBuilder
  export their lists and walk them in via the CSV mapper (VAN's own export
  formats get first-class column presets). Imports stay scoped to that
  partner's campaign, per the rules above — the platform never pulls from
  VoteBuilder directly and never re-shares an imported list.
- **Google Sheets** — a partner's existing organizing sheet, read on a schedule.
- **Calendar imports** — event schedules for canvass/outreach planning.

Same registry and secret-store rules as the vendor connectors
(docs/vendor-connector-plan.md): tokens server-side, minimum scopes,
audit-logged, instantly disconnectable.

## 6. Roles on this side

- `fellow` — fellowship materials, cohort space, ballot
- `artist` — anthem submissions, rights/credit records
- `partner` — their own campaign(s) and imported lists only
- `staff` / `admin` — review queues, ballots, publishing

## 7. What gets measured

Aggregate, consented, bucket-size-protected (min 20): fellowship intake
starts/completes, ballot participation rates, anthem submissions, event
RSVPs and attendance, outreach volume per campaign. Nothing per-person is
reported; nothing from the marker layer crosses over.
