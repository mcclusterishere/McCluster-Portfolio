/* MCC_DIST — the Distribution Desk engine.
   A member says which platforms they distribute/earn through (per
   industry), deep-links to that platform's reports/bank, and uploads
   the earnings-report CSV. We parse the CSV to a real total and file
   it as their self-reported income (desk-verifiable, never cash-out
   credit). Dynamic per industry off data/distributors.json. */
(function () {
  "use strict";
  function S() { return window.MCC_SUPA; }
  var regCache = null;

  function registry() {
    if (regCache) return Promise.resolve(regCache);
    return fetch("data/distributors.json", { cache: "no-cache" })
      .then(function (r) { return r.json(); })
      .then(function (j) { regCache = j; return j; })
      .catch(function () { return { industries: [], distributors: [] }; });
  }

  function authedFetch(path, opts) {
    opts = opts || {};
    return S().token().then(function (t) {
      if (!t) throw new Error("signed out");
      return fetch(S().url + "/rest/v1/" + path, {
        method: opts.method || "GET",
        headers: Object.assign({ apikey: S().key, Authorization: "Bearer " + t, "Content-Type": "application/json" }, opts.prefer ? { Prefer: opts.prefer } : {}),
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + " " + t.slice(0, 140)); });
      return r.status === 204 ? null : r.json().catch(function () { return null; });
    });
  }

  function mine() {
    return S().token().then(function (t) {
      return fetch(S().url + "/rest/v1/rpc/my_distribution", {
        method: "POST", headers: { apikey: S().key, Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: "{}",
      });
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  function connect(rec) {
    return authedFetch("member_connections", {
      method: "POST", prefer: "resolution=merge-duplicates,return=representation",
      body: { distributor_id: rec.distributor_id, distributor: rec.distributor, industry: rec.industry, handle: rec.handle || "", reports_url: rec.reports_url || "" },
    });
  }
  function disconnect(id) { return authedFetch("member_connections?distributor_id=eq." + encodeURIComponent(id), { method: "DELETE" }); }

  function fileReport(rec) {
    return authedFetch("earnings_reports", { method: "POST", prefer: "return=minimal",
      body: { distributor_id: rec.distributor_id, distributor: rec.distributor, period: rec.period || "", gross: +rec.gross || 0, currency: rec.currency || "USD", rows: rec.rows || 0, filename: rec.filename || "" } });
  }

  /* ---- a small, quote-aware CSV parser + earnings detection ---- */
  function splitLine(line, delim) {
    var out = [], cur = "", q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else { if (c === '"') q = true; else if (c === delim) { out.push(cur); cur = ""; } else cur += c; }
    }
    out.push(cur); return out;
  }
  function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.\-]/g, "")); return isFinite(n) ? n : NaN; }

  function parseCsv(text) {
    var lines = String(text || "").replace(/\r/g, "").split("\n").filter(function (l) { return l.trim() !== ""; });
    if (lines.length < 2) return { gross: 0, rows: 0, currency: "USD", period: "", ok: false };
    // delimiter: whichever the header has most of
    var head0 = lines[0];
    var delim = [",", "\t", ";"].sort(function (a, b) { return (head0.split(b).length) - (head0.split(a).length); })[0];
    var head = splitLine(lines[0], delim).map(function (h) { return h.trim().toLowerCase(); });
    var AMT = ["earnings", "amount", "revenue", "net", "payout", "royalt", "income", "paid", "total", "gross", "usd", "value", "proceeds"];
    var DATE = ["date", "period", "month", "reporting", "sale"];
    var amtIdx = -1, dateIdx = -1, bestScore = -1;
    head.forEach(function (h, i) {
      var score = -1;
      AMT.forEach(function (k, ki) { if (h.indexOf(k) !== -1) score = Math.max(score, AMT.length - ki); });
      if (score > bestScore) { bestScore = score; amtIdx = i; }
      DATE.forEach(function (k) { if (dateIdx === -1 && h.indexOf(k) !== -1) dateIdx = i; });
    });
    var gross = 0, rows = 0, period = "", cur = "USD";
    if (/[€]/.test(text)) cur = "EUR"; else if (/[£]/.test(text)) cur = "GBP";
    for (var r = 1; r < lines.length; r++) {
      var cols = splitLine(lines[r], delim);
      if (amtIdx >= 0) { var v = num(cols[amtIdx]); if (isFinite(v)) { gross += v; } }
      else { // no obvious column — take the largest numeric in the row
        var mx = NaN; cols.forEach(function (c) { var n = num(c); if (isFinite(n) && (!isFinite(mx) || n > mx)) mx = n; });
        if (isFinite(mx)) gross += mx;
      }
      if (!period && dateIdx >= 0 && cols[dateIdx]) period = String(cols[dateIdx]).trim().slice(0, 20);
      rows++;
    }
    return { gross: Math.round(gross * 100) / 100, rows: rows, currency: cur, period: period, ok: true, amountColumn: amtIdx >= 0 ? head[amtIdx] : null };
  }

  function readFile(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result || "")); };
      fr.onerror = function () { rej(new Error("couldn't read the file")); };
      fr.readAsText(file);
    });
  }

  window.MCC_DIST = {
    registry: registry, mine: mine, connect: connect, disconnect: disconnect,
    fileReport: fileReport, parseCsv: parseCsv, readFile: readFile,
  };
})();
