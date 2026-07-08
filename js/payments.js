/* ============================================================
   Payment links — Square (nonprofit account).
   Create links in Square Dashboard → Online Checkout → Payment
   Links (one per song; a recurring link for the subscription),
   then paste each URL into `link` below. Buttons stay in a
   "coming soon" state while a link is empty.
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
