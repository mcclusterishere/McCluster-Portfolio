/* ============================================================
   MCC_NET — the M Network's data layer.
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
      return anon("providers?status=eq.live&order=created_at.asc&select=id,slug,name,headline,blurb,area,roles,badge_color,href,book");
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
        "I agree to receive occasional text messages from McCluster / the M Network " +
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
      return authed("booking_requests?id=eq." + id, { method: "PATCH", body: { status: status }, prefer: "return=minimal" });
    },
  };
})();
