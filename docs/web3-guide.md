# The M Network Web3 Guide — the full deep dive

The one-sentence thesis: **web3 on this platform inherits the house
laws — the person owns the record, value is earned by real work, and
the platform never holds what it isn't licensed to hold.**

---

## The four layers

### Layer 0 — the closed loop (LIVE)
M Token: 1 token = $1 of *platform credit*. Minted only by the
database on real events (deal completion 5%/1%, the claim-run bonus).
No cash-out, no trading, no float — the Starbucks-stars structure.
**Why it matters legally:** no cash redemption + no secondary market
= no money transmission, no securities offering. This is the
sandbox where the token economy proves itself.

### Layer 1 — the cryptographic record (LIVE as of this build)
**The M Chain** (`data/chain.json`, `tools/chain.mjs`, `chain.html`):
a hash-linked attestation ledger. Every master recording, paper,
synced lyric, and M-Verified badge is committed by SHA-256; every
entry commits to the previous one; the whole thing lives in the
public repo where every git commit timestamps it.

- **Verification is trustless today**: any browser recomputes every
  digest via WebCrypto on chain.html. No server, no company promise.
- **Anchor-ready**: the head digest is a single 32-byte commitment
  to the entire history. When counsel clears an on-chain step, ONE
  attestation of that head (EAS on Base, ~$0.01 of gas) makes the
  full history provable on a public chain retroactively.
- **What this buys artists**: authorship proof ("these exact bytes
  existed, attested, on this date") for every master — the poor
  man's copyright deposit, cryptographically enforceable, free.
- Maintenance: `node tools/chain.mjs build` after adding tracked
  artifacts; `verify` runs with the other gates.

### Layer 2 — dollars on modern rails (the easy route, staged)
The custody question answered — see the full analysis below. The
short version: **pass-through, never custody.** Stripe Connect
Express moves the money; Stripe holds it; the platform routes it
and takes its application fee. When stablecoins join: **Stripe
crypto payouts / Circle programmable payouts** send USDC to sellers
who opt in — the licensed partner does custody and conversion, the
platform still never touches the coin.

### Layer 3 — the token goes public (attorney-gated, LAST)
The Howey wall: if people give money expecting profit from your
efforts, it's a security. Survivable shapes, in order of realism:
1. **Utility-only forever** — the token stays platform credit even
   if it ever gets an on-chain representation. Earned, spent, never
   sold by the platform. (The Starbucks model, on-chain.)
2. **Genuine decentralization later** — only after the network is
   big enough that the "efforts of others" prong fails honestly.
3. What we never do: sell tokens, promise appreciation, list on
   exchanges, or hold customer crypto. Any one of those converts
   the project into a regulated financial business overnight.

---

## THE CUSTODY QUESTION — hold money in the app, or pass it through?

### Option A — true custody (the platform holds user balances)
Users load money in; the app shows a balance; they spend/withdraw.
**What it legally makes you:** a money transmitter. That means
FinCEN MSB registration (federal), **money transmitter licenses in
~49 states individually** (each with bonding, net-worth minimums,
audits — figure $1–3M and 2+ years), BSA/AML program, and if you
ever touch New York, the BitLicense. **Verdict: never do this
directly.** This is the one door that turns a platform into a bank
without a bank's lawyers.

### Option B — white-label pass-through (the answer for now)
**Stripe Connect Express** — already designed into the build
(docs/stripe-connect.md, the pay-deal function):
- The customer pays; **Stripe is the merchant of record and the
  custodian**; the seller's money sits in THEIR Stripe Express
  account, not yours.
- The platform takes its cut as an `application_fee_amount` —
  revenue, not custody.
- Sellers onboard through Stripe's hosted KYC; the platform never
  sees a bank credential.
- **Licensing burden on the platform: none.** Stripe's licenses do
  the work — that's what the white label buys.
- The "balance" the app shows is a *view of their Stripe balance*,
  not money you hold. It feels like holding money in the app; it
  isn't, legally.

### Option C — embedded accounts, the middle path (later, if wanted)
If the product ever truly needs balance-holding (wallets people
park money in), the compliant route is **Banking-as-a-Service**:
Stripe Treasury or a partner like Unit/Increase gives every user an
FDIC-insured account at a partner bank, white-labeled inside your
app. The BANK holds the money; you render the interface. Real
requirements still apply (program agreements, compliance reviews)
but no state-by-state MTL grind. This is the "M Pay feels like
Cash App" endgame — Phase 2 of the rails, not Phase 1.

### Option D — crypto custody
Same trap as A but worse (state MTLs + potential SEC/CFTC).
The compliant versions: **self-custody embedded wallets** (Privy,
Coinbase WaaS — the USER holds keys, you render UI) or **licensed
payout partners** (Stripe/Circle) for stablecoin disbursement.
Platform custody of crypto: never.

### The decision, plainly
1. **Now:** Option B. Stripe Connect pass-through, Square rail
   alongside, M Token as the in-app value layer (closed loop needs
   no license because it never cashes out).
2. **When M Pay needs to feel like a wallet:** Option C via Stripe
   Treasury / a BaaS partner — bank holds, app renders.
3. **Stablecoins:** payouts only, via licensed partners, opt-in.
4. **Never:** the platform holding pooled user funds or keys itself.

---

## The build order from here

| Step | What | Gate |
|---|---|---|
| 1 ✅ | The M Chain (attestations, verification page) | shipped |
| 2 | Stripe account → deploy pay-deal + webhooks → Connect Express onboarding for sellers | Matthew makes the account |
| 3 | Anchor the chain head on Base via EAS (one attestation, pennies) | attorney nod — low risk, but the nod is the pattern |
| 4 | Per-artist attestations self-serve (attest your master when you upload) | after 3 |
| 5 | USDC payout option via Stripe crypto payouts | after 2, attorney nod |
| 6 | Embedded accounts (Stripe Treasury) if wallet-feel is wanted | product need + counsel |
| 7 | Any public token motion | full securities counsel, last |

## The rules that never bend
- The platform never custodies pooled funds or private keys.
- The token never promises profit and is never sold by the platform.
- Every attestation is verifiable by anyone, forever, for free.
- Counsel signs before any layer touches an open network or real
  redemption. The order of operations IS the legal strategy.
