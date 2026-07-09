#!/usr/bin/env node
/* WALKTHROUGH — a brand-new buyer walks the whole front door.
   The cloud is mocked (same style as smoke.mjs) so the walk runs
   anywhere: instant account opens mid-pay, a real deal files, the
   done screen offers the card rail ONLY for payees who truly carry
   it, and the mission-fund link never impersonates a payee.
   Run: python3 -m http.server 8213 &  then  node tools/walkthrough.mjs
   WALK_LIVE=1 skips the mocks and stops at the Stripe redirect.     */
import { createRequire } from "node:module";
const chromium = await (async () => {
  try { return (await import("playwright")).chromium; }
  catch {
    const req = createRequire(import.meta.url);
    const p = req.resolve("playwright", { paths: [process.env.NODE_PATH || "", "/opt/node22/lib/node_modules", "/usr/lib/node_modules"].filter(Boolean) });
    return req(p).chromium;
  }
})();

const B = process.env.SMOKE_BASE || "http://localhost:8213";
const LIVE = process.env.WALK_LIVE === "1";
const failures = [];
const check = (name, cond, detail) => { if (!cond) failures.push(`${name}: ${detail}`); };
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const FAKE_JWT = b64u({ alg: "none" }) + "." + b64u({ sub: "11111111-1111-1111-1111-111111111111", email: "" }) + ".x";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

async function boot(opts = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  const record = { payDeal: null, checkoutHit: false, bookings: 0 };
  page.on("pageerror", (e) => errors.push(e.message));
  if (opts.init) await page.addInitScript(opts.init);
  if (!LIVE) {
    await page.route(/supabase\.co/, (route) => {
      const req = route.request();
      const url = req.url();
      if (url.includes("/auth/v1/signup")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: FAKE_JWT, refresh_token: "r" }) });
      }
      if (url.includes("/rest/v1/deals") && req.method() === "POST") {
        const row = Object.assign({ id: "deal-walk-1", status: "proposed" }, JSON.parse(req.postData() || "{}"));
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify([row]) });
      }
      if (url.includes("/rest/v1/booking_requests")) {
        record.bookings += 1;
        return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
      }
      if (url.includes("/functions/v1/pay-deal")) {
        record.payDeal = JSON.parse(req.postData() || "{}");
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: "https://checkout.stripe.com/c/walk" }) });
      }
      if (url.includes("/functions/v1/connect-onboard")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "resume", url: "https://connect.stripe.com/setup/walk" }) });
      }
      if (url.includes("/rpc/")) return route.fulfill({ status: 204, body: "" });
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
    await page.route(/checkout\.stripe\.com/, (route) => {
      record.checkoutHit = true;
      return route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>checkout</body></html>" });
    });
  }
  // fulfilled, not aborted: the intake mirror fires on propose/booking and
  // an aborted fetch would surface as an unhandled-rejection page error
  await page.route(/google-analytics|script\.google/, (r) => r.fulfill({ status: 200, body: "" }));
  await page.goto(B + "/market.html", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1400);
  return { page, errors, record };
}

/* ---- leg 1: the brand-new buyer pays the house by card ---- */
{
  const { page, errors, record } = await boot();
  check("buyer", await page.$("#mccTour"), "first-visit tour missing");
  await page.click("[data-tour-skip]");
  await page.click('a.mk__jump[href="#pay"]');
  await page.click('[data-k="5"]');
  await page.click("#mpSend");
  await page.waitForTimeout(400);
  await page.fill("#shSearch", "McCluster");
  await page.waitForTimeout(200);
  await page.click('.mp__row:has-text("Matthew McCluster")');
  await page.waitForTimeout(300);

  if (LIVE) {
    console.log("LIVE walk: stopped at the payee step — finish by hand with a 4242.");
  } else {
    // the mid-flow door: instant account, keypad and payee survive
    const doorBtn = await page.$('#shDoor button.btn--ruby');
    check("buyer", doorBtn, "inline door did not mount for the signed-out buyer");
    await doorBtn.click();
    await page.waitForTimeout(600);
    check("buyer", await page.$eval("#shDoor", (el) => el.children.length === 0), "door did not clear after the account opened");
    await page.fill("#shTitle", "Walkthrough deposit");
    await page.click("#shGo");
    await page.waitForTimeout(600);
    const railBtn = await page.$('#shPayRail button.btn--ruby');
    check("buyer", railBtn, "done screen offered no card button for the house payee");
    check("buyer", !(await page.content()).includes("MBVeuzoo"), "the mission-fund link leaked into the pay flow");
    if (railBtn) {
      await railBtn.click();
      await page.waitForTimeout(900);
      check("buyer", record.payDeal && record.payDeal.deal_id === "deal-walk-1", "pay-deal not called with the filed deal");
      // all-in pricing: the buyer punched 5 → that IS the price; the
      // payee's net comes out of it (5 / 1.095 = 4.57)
      check("buyer", record.payDeal && record.payDeal.price === 5, "buyer's one price drifted: " + (record.payDeal && record.payDeal.price));
      check("buyer", record.payDeal && record.payDeal.amount === 4.57, "payee net drifted: " + (record.payDeal && record.payDeal.amount));
      check("buyer", record.payDeal && !("provider_acct" in record.payDeal), "house payment must NOT carry provider_acct");
      check("buyer", record.checkoutHit, "checkout redirect never attempted");
    }
    check("buyer", errors.length === 0, "page errors: " + errors.join(" | "));
  }
  await page.close();
}

/* ---- leg 2: a payee with no rail gets the truth, not a donation link ---- */
if (!LIVE) {
  const { page, errors } = await boot();
  await page.click("[data-tour-skip]");
  await page.click('a.mk__jump[href="#pay"]');
  await page.click('[data-k="7"]');
  await page.click("#mpSend");
  await page.waitForTimeout(400);
  await page.fill("#shSearch", "Cohiba");
  await page.waitForTimeout(200);
  await page.click('.mp__row:has-text("K-Cohiba")');
  await page.waitForTimeout(300);
  await page.fill("#shContact", "Josiah · 555-0100");
  await page.click("#shGo");
  await page.waitForTimeout(600);
  const html = await page.content();
  check("norail", !(await page.$('#shPayRail button')), "card button appeared for a payee with no rail");
  check("norail", !html.includes("MBVeuzoo"), "mission-fund link impersonated the payee");
  check("norail", (await page.$eval("#shPayRail", (el) => el.textContent)).includes("rail"), "the no-rail truth line is missing");
  check("norail", errors.length === 0, "page errors: " + errors.join(" | "));
  await page.close();
}

/* ---- leg 3: the Connect door wears all three states ---- */
if (!LIVE) {
  const states = [
    [{ slug: "walk", name: "Walk Test", roles: ["Photo"] }, "Set up payouts", "fresh desk"],
    [{ slug: "walk", name: "Walk Test", roles: ["Photo"], stripe_acct: "acct_walk" }, "Finish setting up", "mid-onboarding desk"],
    [{ slug: "walk", name: "Walk Test", roles: ["Photo"], stripe_acct: "acct_walk", charges_enabled: true }, "Card rail live", "live desk"],
  ];
  for (const [me, expect, label] of states) {
    const { page, errors } = await boot({ init: `localStorage.setItem("mcc_debug_listing", ${JSON.stringify(JSON.stringify(me))}); localStorage.setItem("mcc_tour_done","1");` });
    await page.click('a.mk__jump[href="#yours"]');
    await page.waitForTimeout(500);
    const body = await page.$eval("#mpYou", (el) => el.textContent);
    check("connect", body.includes(expect), `${label}: expected "${expect}" on the desk card`);
    check("connect", errors.length === 0, `${label}: page errors: ` + errors.join(" | "));
    await page.close();
  }
}

await browser.close();

if (failures.length) {
  console.error(`WALKTHROUGH FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("WALKTHROUGH CLEAN — a stranger toured the floor, opened an account mid-payment, filed a real deal, reached card checkout for the house, got the truth for an unarmed desk, and every Connect state painted.");
