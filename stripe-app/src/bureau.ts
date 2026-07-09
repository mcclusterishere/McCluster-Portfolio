/* THE BUREAU'S ENGINE, MERCHANT EDITION.
   The same five-book model as the platform's streetscore.js (see
   docs/street-score.md and the white paper), re-grounded in what a
   Stripe account can witness about itself:

     Payment history 35%  — charges that succeeded and stayed
                            (disputes and refunds read against it)
     Cash flow       20%  — how many of the last 6 months saw money move
     Community word  20%  — lives on M Network (ratings); here it shows
                            as "unwitnessed" until the merchant joins —
                            no record ≠ bad record, so it floors neutral
     Behavior        15%  — dispute rate + refund discipline
     Tenure          10%  — account age, capped at 3 years

   Design laws carried over: empty books start neutral-low, never
   zero; the weakest weighted book speaks as the next move; the
   score belongs to the merchant and never leaves their dashboard. */

export interface ChargeLite {
  status: string;
  amount: number;
  refunded: boolean;
  disputed: boolean;
  created: number; // unix seconds
}

export interface Book {
  key: string;
  label: string;
  weight: number;
  value: number; // 0–100
  tip: string;
}

export interface BureauReport {
  score: number;
  band: string;
  books: Book[];
  next: string;
  sample: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function appraise(charges: ChargeLite[], accountCreated?: number): BureauReport {
  const ok = charges.filter((c) => c.status === "succeeded");
  const disputes = charges.filter((c) => c.disputed).length;
  const refunds = charges.filter((c) => c.refunded).length;

  /* payment history: kept money over attempted money */
  const payment = charges.length
    ? clamp01((ok.length - disputes * 3 - refunds * 0.5) / charges.length)
    : 0.35; // the empty book starts neutral-low, never zero

  /* cash flow: months of the last six with at least one kept charge */
  const now = Date.now() / 1000;
  const months = new Set(
    ok
      .filter((c) => now - c.created < 183 * 86400)
      .map((c) => new Date(c.created * 1000).toISOString().slice(0, 7)),
  );
  const cash = charges.length ? clamp01(months.size / 6) : 0.3;

  /* community word: witnessed on M Network, not here — neutral floor */
  const community = 0.3;

  /* behavior: dispute discipline */
  const behavior = charges.length
    ? clamp01(1 - (disputes / Math.max(1, charges.length)) * 8)
    : 0.35;

  /* tenure: account age, 3 years to fill the book */
  const tenure = accountCreated
    ? clamp01((now - accountCreated) / (3 * 365 * 86400))
    : 0.2;

  const books: Book[] = [
    { key: "payment", label: "Payment history", weight: 0.35, value: Math.round(payment * 100),
      tip: "Money that arrives and stays. Fewer disputes and refunds keep this book heavy." },
    { key: "cash", label: "Cash flow", weight: 0.2, value: Math.round(cash * 100),
      tip: "Consistency beats size — a charge kept in each of the last six months fills this book." },
    { key: "community", label: "Community word", weight: 0.2, value: Math.round(community * 100),
      tip: "Witnessed on M Network — client and peer ratings on real deals. Claim your page to open this book." },
    { key: "behavior", label: "Behavior", weight: 0.15, value: Math.round(behavior * 100),
      tip: "Dispute discipline. Answer fast, resolve clean, keep the rate near zero." },
    { key: "tenure", label: "Tenure", weight: 0.1, value: Math.round(tenure * 100),
      tip: "Time in good standing. This book fills itself — just stay open." },
  ];

  const unit = books.reduce((a, b) => a + b.weight * (b.value / 100), 0);
  const score = Math.round(300 + 550 * clamp01(unit));
  const band = score >= 760 ? "Excellent" : score >= 670 ? "Good" : score >= 580 ? "Building" : "Starting";
  const next = books
    .slice()
    .sort((a, b) => a.weight * a.value - b.weight * b.value)[0].tip;

  return { score, band, books, next, sample: charges.length };
}
