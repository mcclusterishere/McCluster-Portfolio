# LAYER 4 — THE GO-LIVE SESSION

One sitting. Five blocks. Do them in order, top to bottom. After each block,
open **streetcreditbureau.com/preflight.html** — it probes the real backend and
turns green/red per feature. That page is the truth; this doc is the hand.

Everything here is dashboard work only you can do (keys, money, switches).
The code is already shipped and waiting.

**Before you start — have these four things open in browser tabs:**
- Supabase dashboard → project `fxbkvcrfbbcmrrupdcjt`
- Stripe dashboard (in **live** mode, toggle top-right)
- Your Anthropic key (`sk-ant-...`)
- The repo `docs/` folder (for the function code you'll paste)

---

## BLOCK 1 — Sign-in (the thing that's been broken) · ~5 min

**Why:** the Site URL is still the old github.io address, so every magic link
points at a dead page. This is the single fix that's been blocking every login.

1. Supabase → **Authentication → URL Configuration**
   - **Site URL** → `https://streetcreditbureau.com`  *(delete the github.io one)*
   - **Redirect URLs** → make sure `https://streetcreditbureau.com/**` is listed.
     Remove any `mcclusterishere.github.io/...` entry.
2. Supabase → **Authentication → Sign In / Providers**
   - **Anonymous sign-ins → ON**  *(instant accounts + the RISE quiz memory depend on this)*
   - **Email → Confirm email → OFF**  *(lets the magic link land in one hop)*
3. Save. Go to **streetcreditbureau.com**, request a **fresh** magic link
   (old ones were minted with the wrong URL and are single-use), open it.

**✓ Verify:** you land signed in, no error banner. If a red banner shows, it now
prints the exact reason — screenshot it and send it to me.

---

## BLOCK 2 — The engine · ~2 min

**Why:** builds every table, function, and the score engine the whole app reads.

1. Supabase → **SQL Editor → New query**
2. Paste the **entire** contents of `docs/live-engine.sql` (the file I sent you).
3. **Run.** It's idempotent — if it stops, the error names the `-- [NN] file.sql`
   section right above the failing line; send me that and re-run from there.
4. Supabase → **Database → Extensions** → search `pg_cron` → **Enable**
   *(this runs the nightly score tape).*

**✓ Verify:** preflight's engine rows (market, score, verify, payments…) go green.

---

## BLOCK 3 — The Guide (AI concierge) · ~5 min

**Why:** turns on the ✦ Guide that greets and routes members.

1. Supabase → **Edge Functions → Deploy a new function**
   - Name it **exactly** `the-guide`
   - **Enforce JWT verification → OFF**  *(it checks the caller against GoTrue itself)*
2. Delete the template, paste the `index.ts` from `docs/the-guide.md`, Deploy.
3. Supabase → **Edge Functions → Secrets** → add
   `ANTHROPIC_KEY` = your `sk-ant-...` key.
   *(`SUPABASE_URL` and the service-role key are injected automatically.)*

**✓ Verify:** signed in, open the ✦ Guide on any page and say "hey" — it replies.
Preflight's THE GUIDE row goes green.

---

## BLOCK 4 — Money (Stripe live rails) · ~15 min

**Why:** the card checkout on signed deals, the receipt writer, and the
"get paid by card" door for providers. Entity on Stripe = **McCluster Corp**.

**First, one secret for all three functions:**
Supabase → Edge Functions → Secrets → add `STRIPE_SK` = your `sk_live_...` key.

**4a — `pay-deal`** (builds the checkout link)
- Deploy a new function named exactly `pay-deal`, **JWT OFF**.
- Paste `index.ts` from `docs/stripe-connect.md`. Deploy.

**4b — `stripe-webhook`** (writes the receipt — this is what mints earned credit)
- Stripe → **Developers → Webhooks → Add endpoint**
  - URL: `https://fxbkvcrfbbcmrrupdcjt.supabase.co/functions/v1/stripe-webhook`
  - Events: **`checkout.session.completed`** (that one only)
  - Save → copy the **Signing secret** (`whsec_...`)
- Supabase → add secret `STRIPE_WEBHOOK_SECRET` = that `whsec_...`
- Deploy a new function named exactly `stripe-webhook`, **JWT OFF**
  (Stripe signs the request; the function verifies the signature).
- Paste `index.ts` from `docs/stripe-webhook.md`. Deploy.

**4c — `connect-onboard`** (the provider "get paid by card" door)
- Deploy a new function named exactly `connect-onboard`, **JWT OFF**
  ⚠️ **OFF, not on** — the browser's preflight carries no token; it'd bounce if on.
- Paste `index.ts` from `docs/connect-onboard.md`. Deploy.

**4d — Stripe account settings**
- **Products/services description:** creative-services marketplace + donations.
  *(Not "software," not "credits/tickers/securities.")*
- **Statement descriptor:** `STREETCREDITBUREAU` or `EQUITY UPRISE`.
- ⚠️ **Do NOT** check "501(c)(3) / tax-exempt" — the CT charity reg (CHR.0069693)
  is not the IRS letter. Call money "contributions," never "tax-deductible."
- ⚠️ **Do NOT** launch `buy-eup` (selling E⤴ for cash) — Stripe restricts stored
  value. Services + donations only.

**✓ Verify:** Stripe → send test webhook `checkout.session.completed` → it 200s.
Then on the live site, run a real **4242 4242 4242 4242** test card through a
signed house deal — the done screen shows the receipt, preflight money rows green.

---

## BLOCK 5 — Email deliverability · optional, do later

The built-in mailer works for testing (caps ~3–4/hr, may land in spam). For real
volume, do custom SMTP — full steps in `docs/GO-LIVE.md` §5 (Cloudflare Email
Routing → Zoho/Google for the mailbox → Resend for transactional → Supabase SMTP
Settings). Not needed to prove the platform works.

---

## THE FINISH LINE

When Blocks 1–4 are done, **preflight.html is all green** and the platform is
live: people sign in, the engine scores, the Guide talks, and money moves on
real rails. That's Layer 4 mastered.

If any block sticks, screenshot preflight + the error and send it — each block is
independent, so a snag in one doesn't block the others.
