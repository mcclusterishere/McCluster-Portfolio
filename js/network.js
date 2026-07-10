/* ============================================================
   MCC_NET — M Network's data layer.
   Providers, booking requests, and the SMS list, over the same
   Supabase REST surface as everything else (MCC_SUPA from
   backend.js). RLS is the wall: anonymously you can read live
   listings, file a request, and opt in to texts — nothing else.

   Every write also mirrors to the intake endpoint (the Sheet)
   so nothing is lost while the cloud tables are young.
   ============================================================ */
(function () {
  "use strict";

  var S = window.MCC_SUPA;

  function anonHeaders() {
    return { apikey: S.key, Authorization: "Bearer " + S.key, "Content-Type": "application/json" };
  }
  function anon(path, opts) {
    opts = opts || {};
    var h = anonHeaders();
    if (opts.prefer) h.Prefer = opts.prefer;
    return fetch(S.url + "/rest/v1/" + path, {
      method: opts.method || "GET", headers: h,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) {
      if (!r.ok) throw new Error("net " + r.status);
      return r.status === 204 ? null : r.json().catch(function () { return null; });
    });
  }
  function authed(path, opts) {
    opts = opts || {};
    return S.token().then(function (t) {
      if (!t) throw new Error("signed out");
      var h = { apikey: S.key, Authorization: "Bearer " + t, "Content-Type": "application/json" };
      if (opts.prefer) h.Prefer = opts.prefer;
      return fetch(S.url + "/rest/v1/" + path, {
        method: opts.method || "GET", headers: h,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    }).then(function (r) {
      if (!r.ok) throw new Error("net " + r.status);
      return r.status === 204 ? null : r.json().catch(function () { return null; });
    });
  }
  function mirror(row) {
    // best-effort copy to the intake Sheet so nothing is ever silently lost
    if (!window.INTAKE_ENDPOINT) return;
    try {
      fetch(window.INTAKE_ENDPOINT, { method: "POST", mode: "no-cors", body: JSON.stringify(row), keepalive: true });
    } catch (e) {}
  }

  window.MCC_NET = {
    /* the public directory: live listings only (RLS enforces it too) */
    listProviders: function () {
      // ticker/terms/space/photo ride along when the columns exist;
      // older schemas answer the progressively smaller selects
      var base = "providers?status=eq.live&order=created_at.asc&select=";
      return anon(base + "id,slug,name,headline,blurb,area,roles,badge_color,href,book,terms,ticker,space,photo,square,stripe_acct,charges_enabled,id_verified")
        .catch(function () { return anon(base + "id,slug,name,headline,blurb,area,roles,badge_color,href,book,terms,ticker,space,photo,square,stripe_acct,charges_enabled"); })
        .catch(function () { return anon(base + "id,slug,name,headline,blurb,area,roles,badge_color,href,book,terms,ticker,space,photo"); })
        .catch(function () { return anon(base + "id,slug,name,headline,blurb,area,roles,badge_color,href,book,terms,ticker"); })
        .catch(function () { return anon(base + "id,slug,name,headline,blurb,area,roles,badge_color,href,book"); });
    },

    /* the front desk: anyone can file a booking request */
    requestBooking: function (req) {
      var row = {
        provider_id: req.provider_id || null,
        provider_slug: req.provider_slug || "",
        name: req.name, contact: req.contact,
        date_wanted: req.date_wanted || "", details: req.details || "",
      };
      mirror(Object.assign({ _form: "booking-request" }, row));
      return anon("booking_requests", { method: "POST", body: row, prefer: "return=minimal" });
    },

    /* the text list the platform owns — consent line stored verbatim */
    smsOptIn: function (phone, source) {
      var consent =
        "I agree to receive occasional text messages from McCluster / M Network " +
        "about bookings, drops, and events. Msg & data rates may apply. Reply STOP to opt out.";
      mirror({ _form: "sms-optin", phone: phone, source: source || "" });
      return anon("sms_optins", {
        method: "POST", prefer: "resolution=ignore-duplicates,return=minimal",
        body: { phone: phone, consent: consent, source: source || "" },
      });
    },

    /* the talent app: a signed-in provider manages their own listing */
    myListing: function () {
      return authed("providers?owner=eq." + S.uid() + "&select=*").then(function (rows) {
        return rows && rows[0] ? rows[0] : null;
      });
    },
    saveListing: function (fields) {
      return window.MCC_NET.myListing().then(function (mine) {
        if (mine) {
          return authed("providers?id=eq." + mine.id, { method: "PATCH", body: fields, prefer: "return=representation" })
            .then(function (rows) { return rows && rows[0]; });
        }
        fields.owner = S.uid();
        fields.slug = fields.slug ||
          (fields.name || "provider").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") +
          "-" + Math.random().toString(36).slice(2, 6);
        mirror(Object.assign({ _form: "provider-listing" }, fields));
        return authed("providers", { method: "POST", body: fields, prefer: "return=representation" })
          .then(function (rows) { return rows && rows[0]; });
      });
    },

    /* the members app: one record per signed-in member of the organization */
    /* a second listing under the same owner: the business trades as its
       own ticker, separate from the person who runs it */
    createBusiness: function (fields) {
      fields.owner = S.uid();
      fields.slug = fields.slug ||
        (fields.name || "business").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") +
        "-" + Math.random().toString(36).slice(2, 6);
      mirror(Object.assign({ _form: "business-listing" }, fields));
      return authed("providers", { method: "POST", body: fields, prefer: "return=representation" })
        .then(function (rows) { return rows && rows[0]; });
    },

    myMember: function () {
      return authed("members?owner=eq." + S.uid() + "&select=*").then(function (rows) {
        return rows && rows[0] ? rows[0] : null;
      });
    },
    saveMember: function (fields) {
      return window.MCC_NET.myMember().then(function (mine) {
        if (mine) {
          return authed("members?id=eq." + mine.id, { method: "PATCH", body: fields, prefer: "return=representation" })
            .then(function (rows) { return rows && rows[0]; });
        }
        fields.owner = S.uid();
        mirror(Object.assign({ _form: "member-application", email: S.email() }, fields));
        return authed("members", { method: "POST", body: fields, prefer: "return=representation" })
          .then(function (rows) { return rows && rows[0]; });
      });
    },

    /* the inbox: requests against the signed-in provider's listing */
    myRequests: function () {
      return window.MCC_NET.myListing().then(function (mine) {
        if (!mine) return [];
        return authed("booking_requests?provider_id=eq." + mine.id + "&order=created_at.desc&select=*");
      });
    },
    setRequestStatus: function (id, status) {
      return authed("booking_requests?id=eq." + id, { method: "PATCH", body: { status: status }, prefer: "return=representation" });
    },

    /* the Collab Room: propositions between the network's artists.
       Terms travel as one JSON document; every counter is kept in
       terms.history; signatures collect until both sides have signed. */
    myTerms: function () {
      return window.MCC_NET.myListing().then(function (mine) {
        return (mine && mine.terms) || {};
      });
    },
    saveTerms: function (terms) {
      return window.MCC_NET.saveListing({ terms: terms });
    },
    myDeals: function () {
      return window.MCC_NET.myListing().then(function (mine) {
        var slug = mine ? mine.slug : "___none___";
        return authed("deals?or=(from_owner.eq." + S.uid() + ",to_slug.eq." + encodeURIComponent(slug) + ")&order=updated_at.desc&select=*")
          .then(function (rows) { return { mine: mine, rows: rows || [] }; });
      });
    },
    propose: function (deal) {
      deal.from_owner = S.uid();
      mirror(Object.assign({ _form: "deal-proposed", email: S.email() }, {
        kind: deal.kind, title: deal.title, to_slug: deal.to_slug,
      }));
      return authed("deals", { method: "POST", body: deal, prefer: "return=representation" })
        .then(function (rows) { return rows && rows[0]; });
    },
    counterDeal: function (id, terms) {
      return authed("deals?id=eq." + id, {
        method: "PATCH", prefer: "return=minimal",
        body: { terms: terms, status: "countered", signatures: [] },
      });
    },
    setDealStatus: function (id, status) {
      return authed("deals?id=eq." + id, { method: "PATCH", body: { status: status }, prefer: "return=minimal" });
    },
    signDeal: function (deal, side, legalName) {
      var sigs = (deal.signatures || []).filter(function (s) { return s.by !== side; });
      sigs.push({ by: side, name: legalName, email: S.email(), at: new Date().toISOString() });
      var both = ["from", "to"].every(function (k) {
        return sigs.some(function (s) { return s.by === k; });
      });
      mirror({ _form: "deal-signed", deal: deal.id, by: side, name: legalName, email: S.email() });
      return authed("deals?id=eq." + deal.id, {
        method: "PATCH", prefer: "return=minimal",
        body: { signatures: sigs, status: both ? "signed" : deal.status },
      });
    },

    /* the thread: visitor communication, both ways, inside the deal */
    messages: function (dealId) {
      return authed("messages?deal_id=eq." + encodeURIComponent(dealId) + "&order=created_at.asc&select=*");
    },
    sendMessage: function (dealId, body, fromName) {
      return authed("messages", {
        method: "POST", prefer: "return=minimal",
        body: { deal_id: dealId, from_owner: S.uid(), from_name: fromName || "", body: body },
      });
    },

    /* the performance log: one row per show, PRO-packet ready */
    myPerformances: function () {
      return authed("performances?owner=eq." + S.uid() + "&order=created_at.desc&select=*");
    },
    logPerformance: function (row) {
      row.owner = S.uid();
      mirror(Object.assign({ _form: "performance", email: S.email() }, row));
      return authed("performances", { method: "POST", body: row, prefer: "return=minimal" });
    },

    /* reputation: public to read; clients need the receipts to speak */
    listRatings: function (slug) {
      return anon("ratings?subject_slug=eq." + encodeURIComponent(slug) + "&select=role,stars,note,created_at");
    },
    rate: function (r) {
      r.rater = S.uid();
      mirror(Object.assign({ _form: "rating" }, r));
      return authed("ratings?on_conflict=subject_slug,rater", {
        method: "POST", body: r, prefer: "resolution=merge-duplicates,return=minimal",
      });
    },

    /* Mission Control: the admin surface. RLS (docs/admin-schema.sql) only
       answers these for the admin's own signed-in JWT — for anyone else
       every one of these comes back empty or refused. */
    /* the Wire — the floor's open feed. Reads ride the same posts table
       the pages use; writing requires a listing (RLS checks the slug). */
    feed: function () {
      return anon("posts?order=created_at.desc&select=id,slug,body,created_at&limit=60");
    },
    feedPost: function (slug, body) {
      return authed("posts", { method: "POST", body: { slug: slug, body: body }, prefer: "return=representation" })
        .then(function (rows) { return rows && rows[0]; });
    },

    /* the distro: members upload tracks; fans back the artist directly.
       The bucket streams publicly; the row on the rack carries the ask. */
    tracksFresh: function () {
      return anon("tracks?order=at.desc&select=id,owner,slug,title,path,price,at&limit=24");
    },
    tracksBySlug: function (slug) {
      return anon("tracks?slug=eq." + encodeURIComponent(slug) + "&order=at.desc&select=id,slug,title,path,price,at&limit=40");
    },
    myTracks: function () {
      return authed("tracks?owner=eq." + S.uid() + "&order=at.desc&select=*");
    },
    trackUrl: function (path) {
      return S.url + "/storage/v1/object/public/tracks/" + path;
    },
    trackUpload: function (file, title, price) {
      return window.MCC_NET.myListing().then(function (mine) {
        if (!mine) throw new Error("no listing");
        return S.token().then(function (t) {
          if (!t) throw new Error("signed out");
          var path = S.uid() + "/" + Date.now() + "-" +
            String(file.name || "track").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-64);
          return fetch(S.url + "/storage/v1/object/tracks/" + path, {
            method: "POST",
            headers: { apikey: S.key, Authorization: "Bearer " + t, "Content-Type": file.type || "audio/mpeg" },
            body: file,
          }).then(function (r) {
            if (!r.ok) throw new Error("vault " + r.status);
            return authed("tracks", { method: "POST", prefer: "return=representation",
              body: { slug: mine.slug, title: title, path: path, price: +price || 0, kind: file.type || "" } });
          }).then(function (rows) { return rows && rows[0]; });
        });
      });
    },
    trackKill: function (id) {
      return authed("tracks?id=eq." + id, { method: "DELETE", prefer: "return=representation" });
    },

    /* mission proofs: the file goes to the private vault (only the owner
       and the desk can ever read it), the row goes on the docket */
    proofFile: function (file, mission, note) {
      return S.token().then(function (t) {
        if (!t) throw new Error("signed out");
        var path = S.uid() + "/" + Date.now() + "-" +
          String(file.name || "proof").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
        return fetch(S.url + "/storage/v1/object/proofs/" + path, {
          method: "POST",
          headers: { apikey: S.key, Authorization: "Bearer " + t, "Content-Type": file.type || "application/octet-stream" },
          body: file,
        }).then(function (r) {
          if (!r.ok) throw new Error("vault " + r.status);
          return authed("mission_proofs", { method: "POST", prefer: "return=representation",
            body: { mission: mission, note: note || "", kind: file.type || "", path: path } });
        }).then(function (rows) { return rows && rows[0]; });
      });
    },

    admin: {
      listings: function () { return authed("providers?order=created_at.desc&select=*"); },
      setListing: function (id, status, note) {
        var body = { status: status };
        if (note !== undefined) body.review_note = note;
        return authed("providers?id=eq." + id, { method: "PATCH", body: body, prefer: "return=representation" });
      },
      deals: function () { return authed("deals?order=updated_at.desc&select=*"); },
      grind: function () { return authed("device_state?select=owner,model,updated_at&order=updated_at.desc"); },
      requests: function () { return authed("booking_requests?order=created_at.desc&select=*"); },
      setRequest: function (id, status) {
        return authed("booking_requests?id=eq." + id, { method: "PATCH", body: { status: status }, prefer: "return=representation" });
      },
      members: function () { return authed("members?order=created_at.desc&select=*"); },
      setMember: function (id, status) {
        return authed("members?id=eq." + id, { method: "PATCH", body: { status: status }, prefer: "return=representation" });
      },
      sms: function () { return authed("sms_optins?order=created_at.desc&select=phone,source,created_at&limit=12"); },
      events: function (limit) { return authed("events?order=at.desc&select=at,name,path,uid&limit=" + (limit || 1500)); },
      /* the People room: one dossier per member, computed in the database */
      dossier: function () { return authed("rpc/member_dossier", { method: "POST", body: {} }); },
      /* the worker's nightly snapshots — platform history beyond event retention */
      pulseLog: function () { return authed("pulse_log?order=day.desc&select=*&limit=120"); },
      intake: function () { return authed("intake?order=at.desc&select=*&limit=200"); },
      house: function () { return authed("house_claims?order=at.desc&select=*,house_offers(title,price)"); },
      cashouts: function () { return authed("cashout_requests?order=at.desc&select=*&limit=100"); },
      setCashout: function (id, status) {
        return authed("cashout_requests?id=eq." + id, { method: "PATCH", body: { status: status }, prefer: "return=representation" });
      },
      setHouseClaim: function (id, status) {
        return authed("house_claims?id=eq." + id, { method: "PATCH", body: { status: status }, prefer: "return=representation" });
      },
      setIntake: function (id, status) {
        return authed("intake?id=eq." + id, { method: "PATCH", body: { status: status }, prefer: "return=representation" });
      },
      /* the proof docket: list, rule, open the file, call the AI eyes */
      proofs: function () { return authed("mission_proofs?order=at.desc&select=*&limit=100"); },
      setProof: function (id, status, verdict) {
        var body = { status: status };
        if (verdict !== undefined) body.verdict = verdict;
        return authed("mission_proofs?id=eq." + id, { method: "PATCH", body: body, prefer: "return=representation" });
      },
      proofUrl: function (path) {
        return S.token().then(function (t) {
          return fetch(S.url + "/storage/v1/object/sign/proofs/" + path, {
            method: "POST",
            headers: { apikey: S.key, Authorization: "Bearer " + t, "Content-Type": "application/json" },
            body: JSON.stringify({ expiresIn: 3600 }),
          }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
            return j && j.signedURL ? S.url + "/storage/v1" + j.signedURL : null;
          });
        });
      },
      /* the horn: how many ears are armed, and speak into all of them */
      pushSubs: function () { return authed("push_subs?select=id&limit=1000"); },
      pushSend: function (title, body, url, to) {
        return S.token().then(function (t) {
          return fetch(S.url + "/functions/v1/push-send", {
            method: "POST",
            headers: { apikey: S.key, Authorization: "Bearer " + t, "Content-Type": "application/json" },
            body: JSON.stringify({ action: "send", title: title, body: body, url: url || "", to: to || "" }),
          }).then(function (r) {
            return r.json().catch(function () { return null; }).then(function (j) {
              if (r.ok) return j;
              return { error: (j && (j.error || j.message)) || ("net " + r.status) };
            });
          });
        });
      },
      scanProof: function (id) {
        return S.token().then(function (t) {
          return fetch(S.url + "/functions/v1/scan-proof", {
            method: "POST",
            headers: { apikey: S.key, Authorization: "Bearer " + t, "Content-Type": "application/json" },
            body: JSON.stringify({ id: id }),
          }).then(function (r) {
            return r.json().catch(function () { return null; }).then(function (j) {
              if (r.ok) return j;
              return { error: (j && (j.error || j.message)) || ("net " + r.status) };
            });
          });
        });
      },
    },
  };
})();
