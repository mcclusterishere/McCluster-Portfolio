#!/usr/bin/env node
/* SMOKE — the whole engine, started cold, watched for fire.
   Boots every load-bearing page in a real browser with the cloud
   mocked, asserts zero page errors and the load-bearing organs
   present, and counts network calls so a regression that starts
   double-fetching gets caught here, not on a visitor's data plan.
   Run: python3 -m http.server 8213 &  then  node tools/smoke.mjs   */
import { createRequire } from "node:module";
/* playwright may live in the project or in the global tree — take either */
const chromium = await (async () => {
  try { return (await import("playwright")).chromium; }
  catch {
    const req = createRequire(import.meta.url);
    const p = req.resolve("playwright", { paths: [process.env.NODE_PATH || "", "/opt/node22/lib/node_modules", "/usr/lib/node_modules"].filter(Boolean) });
    return req(p).chromium;
  }
})();

const B = process.env.SMOKE_BASE || "http://localhost:8213";
const failures = [];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

async function boot(path, opts = {}) {
  const page = await browser.newPage({ viewport: opts.viewport || { width: 390, height: 844 } });
  const errors = [];
  const netCounts = {};
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to fetch|net::|favicon/i.test(m.text())) errors.push(m.text());
  });
  page.on("request", (r) => {
    const u = r.url().replace(/\?.*/, "");
    netCounts[u] = (netCounts[u] || 0) + 1;
  });
  await page.route(/supabase\.co/, (route) => {
    const url = route.request().url();
    if (url.includes("/track_plays")) return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    if (url.includes("/rpc/")) return route.fulfill({ status: 204, body: "" });
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route(/google-analytics|script\.google/, (r) => r.abort());
  if (opts.blockVideo) await page.route(/assets\/video/, (r) => r.abort());
  // THE VELVET ROPE: app pages require an E⤴ Card — smoke walks in
  // holding one, like every real member past the landing pages
  await page.goto(B + "/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate((wantWalk) => {
    try { localStorage.setItem("mcc_rise", JSON.stringify({ entry: "create", arch: ["culture", "signal"], v: {}, at: "smoke" })); } catch (e) {}
    // THE DOCK WALK is its own tested invariant on the market boot; every
    // other page walks in already classed, like a member on day two
    if (!wantWalk) try { localStorage.setItem("mcc_dock_walk", "1"); } catch (e) {}
  }, !!opts.dockwalk);
  await page.goto(B + path, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(opts.settle || 1200);
  return { page, errors, netCounts };
}

function check(name, cond, detail) {
  if (!cond) failures.push(`${name}: ${detail}`);
}

/* ---- the checks, page by page ---- */

// the front page: hero canvas, appbar, get-your-profile splash
{
  const { page, errors } = await boot("/index.html", { viewport: { width: 1280, height: 800 }, blockVideo: true, settle: 1800 });
  check("index", errors.length === 0, "page errors: " + errors.join(" | "));
  check("index", await page.$("#getprofile"), "get-your-profile splash missing");
  check("index", await page.$(".appbar"), "appbar missing");
  await page.close();
}

// the music house: three rooms, heat chart, registry, player
{
  const { page, errors } = await boot("/app.html");
  const door = await page.$(".sp__door");
  if (door) { await page.click('[data-door="quiet"]'); await page.waitForTimeout(400); }
  check("app", errors.length === 0, "page errors: " + errors.join(" | "));
  check("app", (await page.$$("#pills .sp__pill")).length === 3, "expected 3 room pills");
  check("app", (await page.$$("#heat .heat__row")).length >= 5, "heat chart underpopulated");
  check("app", (await page.$$("#regList .reg__row")).length >= 8, "registry underpopulated");
  await page.click(".sp__rtile");
  await page.waitForTimeout(600);
  check("app", await page.$eval("#mini", (el) => el.classList.contains("is-on")), "player mini bar did not engage");
  await page.close();
}

// the market: one shared floor fetch, the first-visit tour, all panes alive
{
  const { page, errors, netCounts } = await boot("/market.html", { settle: 1800, dockwalk: true });
  check("market", errors.length === 0, "page errors: " + errors.join(" | "));
  // a cold boot MUST open THE DOCK WALK — the gate that teaches the bar's
  // grammar (2 taps morph · 1 tap goes · 2 taps back · 3 through); the
  // whole lesson is driven here so the gate stays a tested invariant
  const walk = await page.$(".dockwalk");
  check("market", walk, "the dock walk gate did not appear on a cold boot");
  if (walk) {
    await page.click("#dwBtn"); // Show me
    await page.evaluate(() => { const t = document.querySelector('.appbar__tab[data-appnav="we"]'); t.click(); t.click(); });
    await page.waitForTimeout(500);
    check("market", await page.$(".appbar--morph"), "double-tap did not morph the bar");
    await page.click('.appbar [data-dock]'); // one tap on a slot (travel off in class)
    await page.waitForTimeout(200);
    await page.evaluate(() => { const t = document.querySelector('.appbar__tab[data-appnav="we"]'); t.click(); t.click(); });
    await page.waitForTimeout(500);
    check("market", !(await page.$(".appbar--morph")), "double-tap did not bring the main bar back");
    await page.click("#dwBtn"); // I got it — open the doors
    await page.waitForTimeout(300);
    check("market", !(await page.$(".dockwalk")), "the gate did not lift after the lesson");
  }
  // …and the tour follows the lesson — it waits its turn behind the walk
  await page.waitForTimeout(1400);
  const tour = await page.$("#mccTour");
  check("market", tour, "first-visit tour did not appear after the dock walk");
  if (tour) {
    await page.click("[data-tour-skip]");
    await page.waitForTimeout(300);
  }
  const provFetches = Object.entries(netCounts).filter(([u]) => u.endsWith("providers.json")).map(([, n]) => n)[0] || 0;
  check("market", provFetches === 1, `providers.json fetched ${provFetches}× — the cache should make it exactly 1`);
  check("market", (await page.$$(".xc__row")).length >= 6, "floor underpopulated");
  // THE ONE TAPE: movers exist only for desks with real tape lines — an
  // empty movers strip on a young tape is the honest state, not a bug
  const dashRows = await page.evaluate(() => (window.MCC_ROWS || []).filter((r) => !r.onTape).length);
  check("market", dashRows > 0 || (await page.$$(".xc__mover")).length > 0, "floor shows neither dashes nor movers");
  // the consolidated rail: five jumps; #build opens through the Money
  // pane's inline door — walking it that way IS the test
  for (const pane of ["pay", "build", "yours", "providers"]) {
    await page.click(pane === "build" ? 'a[href="#build"]' : `a.mk__jump[href="#${pane}"]`);
    await page.waitForTimeout(300);
    const visible = await page.$eval("#" + pane, (el) => getComputedStyle(el).display !== "none");
    check("market", visible, `pane #${pane} did not show`);
  }
  // keypad → sheet
  await page.click('a.mk__jump[href="#pay"]');
  await page.click('[data-k="5"]');
  await page.click("#mpSend");
  await page.waitForTimeout(400);
  check("market", await page.$eval("body", (b) => b.classList.contains("sheet-open")), "pay sheet did not open");
  await page.close();
}

// spaces: grid paints from local seed even with the cloud dark
{
  const { page, errors } = await boot("/spaces.html");
  check("spaces", errors.length === 0, "page errors: " + errors.join(" | "));
  check("spaces", (await page.$$("#spGrid .sp__card")).length >= 2, "spaces grid underpopulated");
  await page.close();
}

// a song page: audio present, heat armed
{
  const { page, errors } = await boot("/song-dealer-plates.html", { blockVideo: true });
  check("song", errors.length === 0, "page errors: " + errors.join(" | "));
  check("song", await page.evaluate(() => !!window.MCC_HEAT), "heat counter not loaded");
  await page.close();
}

// the redirects hold (card in hand — card-less traffic ropes to RISE by law)
for (const [from, to] of [["/pay.html?to=x&amt=5", "market.html"], ["/talent.html", "market.html"], ["/catalogue.html", "app.html"]]) {
  const page = await browser.newPage();
  await page.goto(B + "/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    try { localStorage.setItem("mcc_rise", JSON.stringify({ entry: "create", arch: ["culture", "signal"], v: {}, at: "smoke" })); } catch (e) {}
    try { localStorage.setItem("mcc_dock_walk", "1"); } catch (e) {}
  });
  await page.goto(B + from, { waitUntil: "load" });
  await page.waitForTimeout(800);
  check("redirect", page.url().includes(to), `${from} landed on ${page.url()}`);
  await page.close();
}

await browser.close();

if (failures.length) {
  console.error(`SMOKE FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("SMOKE CLEAN — front page, music house, market (1 shared fetch), spaces, song world, and all redirects run without a single error.");
