// SQUARE-WEBHOOK — today's rail learns to mark itself. Square sends
// payment.updated on every checkout; if the payer put the deal id
// (or exact deal title) in the note, the matching deal flips to
// 'paid' automatically. Best-effort matching by design: the note is
// human-typed, so unmatched payments simply stay for manual marking.
// Secrets: SQUARE_SIGNATURE_KEY, SB_URL, SB_SERVICE_KEY.
// Square dashboard → Developers → Webhooks → subscribe payment.updated
// to this function's URL.
import { createHmac } from "node:crypto";

const SIG_KEY = Deno.env.get("SQUARE_SIGNATURE_KEY")!;
const SB_URL = Deno.env.get("SB_URL")!;
const SB_KEY = Deno.env.get("SB_SERVICE_KEY")!;
const NOTIFY_URL = Deno.env.get("SQUARE_NOTIFY_URL") || ""; // this function's public URL

Deno.serve(async (req) => {
  const body = await req.text();

  // Square signs sha256-HMAC over (notification_url + body)
  const sig = req.headers.get("x-square-hmacsha256-signature") || "";
  const expected = createHmac("sha256", SIG_KEY).update(NOTIFY_URL + body).digest("base64");
  if (sig !== expected) return new Response("bad signature", { status: 401 });

  const event = JSON.parse(body);
  if (event?.type === "payment.updated") {
    const p = event?.data?.object?.payment;
    if (p?.status === "COMPLETED") {
      const note: string = (p.note || "").trim();
      const cents: number = p?.amount_money?.amount || 0;
      if (note) {
        // 1) note carries a deal id (uuid) — exact flip
        const uuid = note.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        let url = uuid
          ? `${SB_URL}/rest/v1/deals?id=eq.${uuid[0]}&status=eq.signed`
          // 2) else: exact title match on a signed deal with the same fee
          : `${SB_URL}/rest/v1/deals?title=eq.${encodeURIComponent(note)}&status=eq.signed` +
            `&terms->>fee=eq.${(cents / 100).toString()}`;
        const r = await fetch(url, {
          method: "PATCH",
          headers: {
            apikey: SB_KEY,
            Authorization: `Bearer ${SB_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({ status: "paid" }),
        });
        const rows = r.ok ? await r.json() : [];
        console.log("square match:", note.slice(0, 40), "→", rows.length, "deal(s) flipped");
      }
    }
  }
  return new Response("ok");
});
