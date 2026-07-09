/* ============================================================
   Payment links — ONE register for the cause.
   Everything outside the three main offerings (the Limited Offer,
   web builds, and photo/video day bookings) is a SUGGESTED
   contribution through the nonprofit's live mission-fund link.
   One link, one ledger, every button live. `suggest` is the
   suggested amount shown on the button; givers set their own.
   ============================================================ */

var MCC_DONATE = "https://square.link/u/MBVeuzoo?src=sheet";

window.PAYMENTS = {
  "whodidtheshoot": {
    title: "Who Did The Shoot",
    page: "song-who-did-the-shoot.html",
    link: MCC_DONATE,
    suggest: "$3",
  },
  "antisocial": {
    title: "Antisocial",
    page: "song-antisocial.html",
    link: MCC_DONATE,
    suggest: "$3",
  },
  "environmental-injustice": {
    title: "Environmental Injustice",
    page: "song-environmental-injustice.html",
    link: MCC_DONATE,
    suggest: "$3",
  },
  "gotwifi": {
    title: "Got WiFi",
    page: "song-got-wifi.html",
    link: MCC_DONATE,
    suggest: "$3",
  },
  "vaunt": {
    title: "Vaunt (Acoustic)",
    page: "song-vaunt.html",
    link: MCC_DONATE,
    suggest: "$3",
  },
  "dealerplates": {
    title: "Dealer Plates (A-Side)",
    page: "song-dealer-plates.html",
    link: MCC_DONATE,
    suggest: "$3",
  },
  "subscribe": {
    title: "Back the catalogue",
    link: MCC_DONATE,
    label: "Back the catalogue \u00b7 any amount",
  },
  // The $20 identifier walkthrough (Square payment link). After purchase,
  // send buyers the unlisted walkthrough page.
  "idguide": {
    title: "Identifier Resource Pack",
    link: MCC_DONATE,
    label: "Give what's fair \u00b7 get the pack",
  },
  // The mission fund — live Square link (nonprofit). Hero, footer, and
  // the Equity Uprise pages all point here. Support / contribution
  // language only — no tax wording on the site or in the Square copy.
  "donate": {
    title: "Support the Mission",
    link: "https://square.link/u/MBVeuzoo?src=sheet",
  },
  // The 10% tithe on completed network bookings (Square payment link,
  // variable amount). The Talent App shows "Give the tithe" once set.
  "tithe": {
    title: "The Network Tithe",
    link: MCC_DONATE,
  },
  // Residual membership giving (Square recurring payment link). The
  // Members App shows "Start your residual" the moment this exists.
  "membership": {
    title: "Member Residual Giving",
    link: MCC_DONATE,
  },
  // Square Appointments booking page for the paid inquiry call:
  // Dashboard → Appointments → create a paid "Inquiry Call" service with
  // prepayment required, then paste the online booking URL here.
  "bookcall": {
    title: "Book a Paid Call",
    link: "",
  },
};

/* ============================================================
   The Stripe rail — the platform's own card checkout, LIVE.
   The publishable key is public by design (it can only create
   tokens, never move money). The SECRET key lives only in the
   Supabase edge-function vault — never in this repo, never in
   a browser. payDeal() asks the deployed pay-deal function for
   a Checkout session and walks the buyer there.

   rail(p) is the single source of truth for WHO can take a card:
   the house (money lands on the platform's own account) or a
   provider Stripe has verified (destination charge to their acct).
   Everyone else runs the payment note — a card button must never
   render unless it truly pays the named payee.
   ============================================================ */
window.STRIPE_PK = "pk_test_51TrMvCLaNrHsnVOb2T9QPoPsBdCDxzFuE1CLft3NzTK7Z93MYDTTIRFKDYFZMlIvVEviDBJsFF92X4BV5Bi9LzPa00bp46W0w7";
window.MCC_STRIPE = {
  HOUSE: { "mccluster": 1, "equity-uprise": 1 },

  rail: function (p) {
    if (!p) return { card: false, acct: null, square: null, house: false };
    var house = !!window.MCC_STRIPE.HOUSE[p.slug || p.id] || p.entity === "program";
    var connected = !!p.stripe_acct && p.charges_enabled === true;
    return {
      card: house || connected,
      acct: house ? null : (connected ? p.stripe_acct : null),
      square: p.square || null,
      house: house,
    };
  },

  /* the provider's own door: asks connect-onboard for a Stripe-hosted
     Express onboarding link (or the account's live status). Caller must
     be signed in — the function verifies the token against GoTrue. */
  connectOnboard: function () {
    var S = window.MCC_SUPA;
    if (!S || !S.url || !S.token || !S.token()) return Promise.resolve(null);
    return fetch(S.url + "/functions/v1/connect-onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: S.key, Authorization: "Bearer " + S.token() },
      body: "{}",
    }).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  },

  payDeal: function (deal, rail) {
    var S = window.MCC_SUPA;
    if (!S || !S.url) return Promise.resolve(null);
    var body = {
      deal_id: deal.id,
      amount: (deal.terms && deal.terms.fee) || 0,
      title: deal.title || deal.kind || "M Network deal",
    };
    if (rail && rail.acct) body.provider_acct = rail.acct;
    return fetch(S.url + "/functions/v1/pay-deal", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: S.key, Authorization: "Bearer " + S.key },
      body: JSON.stringify(body),
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.url) { location.href = j.url; return true; }
        return null;
      })
      .catch(function () { return null; });
  },
};
