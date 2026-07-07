# The M Network — the distribution engine
The M mark is the emblem, the favicon, the seal on every M-Verified badge. The
M Network is McCluster Corp's distribution
company: upload once into our own back office, and the release flows out to
every DSP, with other artists eventually riding the same rails.

## The honest map of the industry doors
Getting "hooked up everywhere" is three separate doors, in order of difficulty:

1. **LabelGrid (or equivalent label-services API)** — open door. LabelGrid sells
   API-driven distribution/label tooling to small labels today. Apply on their
   site as McCluster Corp (EIN 39-4466255, ISRC prefix QT6KV already registered —
   most applicants don't have that). Alternatives with real APIs if their terms
   disappoint: Revelator, FUGA (bigger), Too Lost, Symphonic. **This is the move
   that makes the M Network a real distributor fast**: our back office feeds their API,
   they hold the DSP contracts, we keep our data and margins.
2. **Spotify / Apple / etc. as a direct provider** — hard door. Spotify closed
   open uploads in 2019; direct content-provider status requires an established
   catalog, delivery infrastructure (DDEX), and a business review. The realistic
   path: distribute through the API partner (door 1) while our DDEX pipeline and
   catalog grow, then apply for preferred/direct status with receipts.
3. **Merlin** — the collective that negotiates indie rates with DSPs. Membership
   requires meaningful annual digital revenue (threshold moves; historically
   ~$'000s/yr minimum) and a distribution business in good standing. Apply at
   merlinnetwork.org once the M Network has 12 months of distribution revenue. This is
   a milestone, not a blocker: door 1 partners already pass Merlin rates through.

## What we own regardless of partner: the DDEX spine
DDEX ERN is the industry's release-delivery XML. Every serious pipeline speaks
it. `scripts/ddex-ern.py` generates ERN messages straight from our own catalog
data (releases, tracks, ISRCs, splits from `docs/platform-schema.sql`). That
means:
- our metadata is born delivery-grade, never trapped in a partner's UI,
- switching partners is an export, not a migration,
- direct-provider applications come with "we already speak DDEX" attached.

## The legal shell (Matthew's checklist)
- Register "M Network" (the emblem carries the name) as a DBA/LLC under
  McCluster Corp; get its own bank account.
- Distribution agreement template for signed artists (rights granted, term,
  revenue share, takedown terms). One lawyer pass; reused per artist.
- W-9/W-8 collection + 1099 issuance for artist payouts (the splits ledger in
  the schema is the source of truth).
- Publishing admin: register works with a PRO (BMI/ASCAP) and consider MLC
  membership for mechanicals.

## Build order in this repo
1. Schema already carries the label back office (releases, tracks, ISRC, splits,
   entitlements). ✅
2. `scripts/ddex-ern.py` — ERN generator from release JSON. ✅ (MVP)
3. Release manifests in `data/releases/` — one JSON per release; the generator
   and (later) the partner API sync both read them.
4. When LabelGrid API keys arrive: a delivery script that pushes a release
   manifest + assets through their API. The upload-once dream becomes real here.
5. Artist onboarding form (reuses the lead-capture modal) → artists table.

## What I need from Matthew, in order
1. Apply: LabelGrid (labelgrid.com) — business account as McCluster Corp.
2. Entity name for filings: M Network (confirmed, the emblem is the M).
3. When approved: paste the API credentials into the private config (never the
   public repo) and I wire the delivery pipe.
4. Merlin + direct-provider applications get filed from receipts after the
   first distribution months.
