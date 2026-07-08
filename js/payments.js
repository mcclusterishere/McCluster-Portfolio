/* ============================================================
   Payment links. The rail is STRIPE going forward (nonprofit
   account): create links at dashboard.stripe.com → Payment Links
   (one-time for songs/tithe with "customer chooses price",
   recurring for subscribe/membership) and paste each URL into
   `link` below. Buttons stay "coming soon" while a link is empty.
   The song links below are legacy Square links that already work —
   replace them with Stripe links whenever, no code change needed.
   Later phase: Stripe Connect for provider payouts + 1099s.
   ============================================================ */

window.PAYMENTS = {
  "whodidtheshoot": {
    title: "Who Did The Shoot",
    page: "song-who-did-the-shoot.html",
    link: "https://square.link/u/oMwMSDM2",
  },
  "antisocial": {
    title: "Antisocial",
    page: "song-antisocial.html",
    link: "https://square.link/u/Z2m6DaNA",
  },
  "environmental-injustice": {
    title: "Environmental Injustice",
    page: "song-environmental-injustice.html",
    link: "https://square.link/u/pEAZJkJ4",
  },
  "gotwifi": {
    title: "Got WiFi",
    page: "song-got-wifi.html",
    link: "https://square.link/u/ihcmtexP",
  },
  "vaunt": {
    title: "Vaunt (Acoustic)",
    page: "song-vaunt.html",
    link: "https://square.link/u/NIsDAInw",
  },
  "dealerplates": {
    title: "Dealer Plates (A-Side)",
    page: "song-dealer-plates.html",
    link: "https://square.link/u/pn1Tqzbv",
  },
  "subscribe": {
    title: "Subscribe",
    link: "",
  },
  // The $20 identifier walkthrough (Square payment link). After purchase,
  // send buyers the unlisted walkthrough page.
  "idguide": {
    title: "Identifier Walkthrough",
    link: "",
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
    link: "",
  },
  // Residual membership giving (Square recurring payment link). The
  // Members App shows "Start your residual" the moment this exists.
  "membership": {
    title: "Member Residual Giving",
    link: "",
  },
  // Square Appointments booking page for the paid inquiry call:
  // Dashboard → Appointments → create a paid "Inquiry Call" service with
  // prepayment required, then paste the online booking URL here.
  "bookcall": {
    title: "Book a Paid Call",
    link: "",
  },
};
