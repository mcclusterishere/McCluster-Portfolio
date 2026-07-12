# GO-LIVE — the owner's one list

Everything only you can do (dashboards, keys, money). The live scoreboard for
all of it is **streetcreditbureau.com/preflight.html** — it probes the real
backend and shows green/red per feature. Work top to bottom; check preflight
after each block.

Legal shape (decided): **Street Credit Bureau is a program of McCluster Corp**
(the existing CT charity). SCB is the brand; McCluster Corp is the entity that
holds the EIN, the bank, and the Stripe account.

---

## 1. Sign-in (the thing that's been broken)

Supabase → **Authentication → URL Configuration**:
- **Site URL** = `https://streetcreditbureau.com`  ← *this was still the old github.io URL; that's why links died.*
- **Redirect URLs** must include `https://streetcreditbureau.com/**` (already added ✓). Remove the old `mcclusterishere.github.io/...` one.
- **Authentication → Sign In / Providers** → **Anonymous sign-ins ON** (instant accounts + RISE depend on it).

Then request a **fresh** magic link (old ones are single-use and were built with the wrong Site URL). If it still doesn't land, the page now shows a **red banner with the exact reason** — read it and tell me.

Rate limits: the built-in mailer caps ~3–4/hr and lands in spam. For real volume, do **custom SMTP** (§5).

## 2. The Guide (AI concierge) — 5 min

Full code + steps: `docs/the-guide.md`.
1. SQL Editor → paste `docs/guide-schema.sql`.
2. Edge Functions → deploy a function named exactly **`the-guide`** → paste `index.ts` from the doc → **JWT verification OFF**.
3. Secret `ANTHROPIC_KEY` = your Anthropic key.
- Verify: preflight's "THE GUIDE" row goes green, or open the ✦ Guide signed in.

## 3. The engine — SQL pastes

The full dependency-ordered ladder is `docs/PASTE-ORDER.md` (run top to bottom; re-running is safe). The pieces preflight will flag if missing:
`market-schema.sql` · `green-light.sql` · `nameplate.sql` · `payments-schema.sql` · `verify-schema.sql` · `traps-engine.sql` · `score-schema.sql` (the Bureau) · `one-tape.sql` · `we-driver.sql` · `desk-imprint.sql`.
Then enable **pg_cron** so the nightly tape scores (command in `docs/one-tape.sql`).

## 4. Money — Stripe (live rails)

Entity on Stripe = **McCluster Corp**; SCB is the brand + statement descriptor.
- Deploy edge functions: **`pay-deal`** (`docs/stripe-connect.md`), **`stripe-webhook`** (`docs/stripe-webhook.md`, set `STRIPE_WEBHOOK_SECRET`), **`connect-onboard`** (`docs/connect-onboard.md`, JWT ON). All use `STRIPE_SK`.
- Products/services description: creative-services marketplace + donations (not "software," not "credits/tickers").
- Statement descriptor: `STREETCREDITBUREAU` or `EQUITY UPRISE`.
- **Do NOT** check "501(c)(3) / tax-exempt" unless McCluster Corp holds the **IRS determination letter** — the CT charity registration (CHR.0069693) is not the same thing. Call money "contributions," not "tax-deductible."
- **Do NOT** launch `buy-eup` (selling E⤴ for cash) on this account — Stripe restricts stored value. Services + donations only.
- Finish the 4242 test on a signed house deal once webhook is live.

## 5. Email + deliverability (fixes magic links at volume)

Domain is on Cloudflare:
1. **Receive:** Cloudflare → Email → Email Routing → forward `matthew@streetcreditbureau.com` to your inbox (auto-adds MX + SPF).
2. **Send from it:** Zoho Mail (free) or Google Workspace ($6/mo).
3. **Transactional (magic links, receipts):** **Resend** → verify `streetcreditbureau.com` (gives DKIM) → plug into Supabase → Authentication → **SMTP Settings**.
4. Add a **DMARC** record (`v=DMARC1; p=none; rua=mailto:matthew@streetcreditbureau.com`). If the mailbox provider and Resend both send, their SPF/DKIM have to coexist — send me the DNS panel and I'll give exact records.

## 6. Housekeeping

- GitHub Pages → tick **Enforce HTTPS** once the cert has issued.
- GA4 + Search Console verify (analytics already reports; just confirm the property).
- Paste the 3 embassy links into the IG / TikTok / YouTube bios.

---

**Verify anything:** open `preflight.html` — it's the live truth. For the-guide
specifically, the browser-console test (instant account → call the function →
print the reply) confirms it end-to-end without needing to be signed in.
