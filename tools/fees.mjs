/* ============================================================
   The fee engine — the math behind "we process on the provider's
   behalf and eat the fees."

   The model: the provider's rate is untouchable. The platform
   collects (rate + booking fee) from the customer, pays the card
   processor out of its own pocket, and remits 100% of the rate to
   the provider. The booking fee is the only knob — this script
   finds the number that keeps the platform whole.

   Run:
     node tools/fees.mjs                       → the standard table
     node tools/fees.mjs 240                   → one booking at $240
     node tools/fees.mjs 240 --rail=paypal     → same, on PayPal
     node tools/fees.mjs --volume=40 --avg=180 → monthly picture
     node tools/fees.mjs --breakeven           → fee % that zeroes every rail

   Internal only — customer surfaces just say "booking fees apply."
   ============================================================ */

const RAILS = {
  // rate = % of charge; fixed = flat per transaction (USD).
  // Standard published online card-not-present pricing, July 2026.
  stripe:          { label: "Stripe",                    rate: 0.029,  fixed: 0.30 },
  stripe_connect:  { label: "Stripe Connect (express)",  rate: 0.029,  fixed: 0.30, note: "+ $2/mo per active connected account + 0.25% payout" , extraPct: 0.0025, monthlyPerProvider: 2 },
  paypal:          { label: "PayPal (checkout)",         rate: 0.0349, fixed: 0.49 },
  paypal_platform: { label: "PayPal Commerce Platform",  rate: 0.0349, fixed: 0.49, note: "marketplace onboarding; per-partner pricing negotiable" },
  square:          { label: "Square (online)",           rate: 0.029,  fixed: 0.30 },
};

const BOOKING_FEE = { pct: 0.05, min: 2 }; // the current knob: 5%, $2 floor

function processing(amount, rail) {
  const r = RAILS[rail];
  return amount * (r.rate + (r.extraPct || 0)) + r.fixed;
}
function bookingFee(amount, knob = BOOKING_FEE) {
  return Math.max(amount * knob.pct, knob.min);
}
function line(amount, rail, knob = BOOKING_FEE) {
  const fee = bookingFee(amount, knob);
  const charge = amount + fee;                 // what the customer pays
  const cost = processing(charge, rail);       // what the processor takes from US
  const platform = fee - cost;                 // what's left after we eat it
  return { amount, fee, charge, cost, platform, providerGets: amount };
}
function breakevenPct(amount, rail) {
  // smallest fee % (no floor) where fee covers processing on (amount+fee)
  const r = RAILS[rail], k = r.rate + (r.extraPct || 0);
  return (k * amount + r.fixed) / (amount * (1 - k));
}

const $ = (n) => "$" + n.toFixed(2);
const pct = (n) => (n * 100).toFixed(2) + "%";
const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=")[1] : dflt;
};
const rail = flag("rail", "stripe");
const tickets = args.filter((a) => !a.startsWith("--")).map(Number).filter(Boolean);
const SIZES = tickets.length ? tickets : [45, 90, 135, 180, 240, 380, 500, 1000];

if (args.includes("--breakeven")) {
  console.log("\nBREAK-EVEN BOOKING FEE — the % where the fee exactly covers the processor\n");
  for (const key of Object.keys(RAILS)) {
    console.log(RAILS[key].label.padEnd(28) + SIZES.map((s) => pct(breakevenPct(s, key)).padStart(8)).join(""));
  }
  console.log("ticket sizes:".padEnd(28) + SIZES.map((s) => ("$" + s).padStart(8)).join(""));
  console.log("\nRead: anything above the number is margin; the $-floor covers small tickets.");
  process.exit(0);
}

const vol = +flag("volume", 0), avg = +flag("avg", 0);
if (vol && avg) {
  console.log("\nMONTHLY PICTURE — " + vol + " bookings/mo @ ~$" + avg + " avg, rail: " + RAILS[rail].label + "\n");
  const l = line(avg, rail);
  const providers = +flag("providers", 5);
  const fixedMonthly = (RAILS[rail].monthlyPerProvider || 0) * providers;
  console.log("Gross booked value:      " + $(l.amount * vol));
  console.log("Booking fees collected:  " + $(l.fee * vol));
  console.log("Processing paid by us:   " + $(l.cost * vol) + (fixedMonthly ? " + " + $(fixedMonthly) + " account fees" : ""));
  console.log("Providers receive:       " + $(l.amount * vol) + "  (100% of their rate, always)");
  console.log("Platform nets:           " + $(l.platform * vol - fixedMonthly) + "/mo");
  if (RAILS[rail].note) console.log("Note: " + RAILS[rail].note);
  process.exit(0);
}

console.log("\nTHE FEE TABLE — booking fee " + pct(BOOKING_FEE.pct) + " (floor $" + BOOKING_FEE.min + "), rail: " + RAILS[rail].label);
console.log("Provider always receives 100% of the rate; the platform pays the processor.\n");
console.log("rate".padStart(8) + "fee".padStart(9) + "customer".padStart(11) + "processor".padStart(11) + "platform".padStart(11) + "  provider");
for (const s of SIZES) {
  const l = line(s, rail);
  console.log($(l.amount).padStart(8) + $(l.fee).padStart(9) + $(l.charge).padStart(11) +
    ("-" + $(l.cost)).padStart(11) + $(l.platform).padStart(11) + ("  " + $(l.providerGets) + " ✓"));
}
console.log("\nCompare rails on one ticket:  node tools/fees.mjs 240 --rail=paypal");
console.log("Find the break-even fee:      node tools/fees.mjs --breakeven");
console.log("Monthly model:                node tools/fees.mjs --volume=40 --avg=180 --providers=6\n");
