/* MCC_SOCIAL — the page's social engine.
   Creators post, supporters follow and comment, creators export their
   fan book. Everything rides PostgREST directly; RLS in the database
   (docs/social-schema.sql) is the wall — the UI only mirrors it.
   Fans can't post because the DATABASE says so, not a hidden button. */
(function () {
  "use strict";
  function S() { return window.MCC_SUPA; }
  function anonH() { return { apikey: S().key, Authorization: "Bearer " + S().key, "Content-Type": "application/json" }; }
  function rest(path, opts, authed) {
    opts = opts || {};
    var go = function (headers) {
      return fetch(S().url + "/rest/v1/" + path, {
        method: opts.method || "GET",
        headers: Object.assign(headers, opts.prefer ? { Prefer: opts.prefer } : {}),
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + " " + t.slice(0, 140)); });
        return r.status === 204 ? null : r.json().catch(function () { return null; });
      });
    };
    if (!authed) return go(anonH());
    return S().token().then(function (t) {
      return go({ apikey: S().key, Authorization: "Bearer " + t, "Content-Type": "application/json" });
    });
  }

  window.MCC_SOCIAL = {
    /* ---- the feed ---- */
    posts: function (slug) {
      return rest("posts?slug=eq." + encodeURIComponent(slug) + "&select=*&order=created_at.desc&limit=50");
    },
    post: function (slug, body) {
      return rest("posts", { method: "POST", body: { slug: slug, body: body }, prefer: "return=representation" }, true)
        .then(function (rows) { return rows && rows[0]; });
    },
    delPost: function (id) {
      return rest("posts?id=eq." + id, { method: "DELETE" }, true);
    },

    /* ---- the room under each post ---- */
    comments: function (postIds) {
      if (!postIds.length) return Promise.resolve([]);
      return rest("comments?post_id=in.(" + postIds.join(",") + ")" +
        "&select=id,post_id,body,created_at,supporter,supporters(handle,name)&order=created_at.asc");
    },
    comment: function (postId, body) {
      return rest("comments", { method: "POST", body: { post_id: postId, body: body } }, true);
    },
    delComment: function (id) {
      return rest("comments?id=eq." + id, { method: "DELETE" }, true);
    },

    /* ---- supporters & follows ---- */
    me: function () {
      var u = window.MCC_AUTH && window.MCC_AUTH.user && window.MCC_AUTH.user();
      if (!u) return Promise.resolve(null);
      return rest("supporters?owner=eq." + u.id + "&select=*", {}, true)
        .then(function (rows) { return (rows && rows[0]) || null; })
        .catch(function () { return null; });
    },
    become: function (handle, name) {
      var ready = (window.MCC_AUTH.user && window.MCC_AUTH.user())
        ? Promise.resolve()
        : window.MCC_AUTH.signInAnon();
      return ready.then(function () {
        return rest("supporters", {
          method: "POST", prefer: "return=representation",
          body: { handle: handle.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24), name: (name || "").slice(0, 60) },
        }, true).then(function (rows) { return rows && rows[0]; });
      });
    },
    followers: function (slug) {
      return rest("follows?creator_slug=eq." + encodeURIComponent(slug) + "&select=supporter")
        .then(function (rows) { return (rows || []).length; }).catch(function () { return 0; });
    },
    amFollowing: function (slug) {
      var u = window.MCC_AUTH.user && window.MCC_AUTH.user();
      if (!u) return Promise.resolve(false);
      return rest("follows?creator_slug=eq." + encodeURIComponent(slug) + "&supporter=eq." + u.id + "&select=supporter", {}, true)
        .then(function (rows) { return !!(rows && rows.length); }).catch(function () { return false; });
    },
    follow: function (slug) {
      return rest("follows", { method: "POST", body: { creator_slug: slug } }, true);
    },
    unfollow: function (slug) {
      var u = window.MCC_AUTH.user();
      return rest("follows?creator_slug=eq." + encodeURIComponent(slug) + "&supporter=eq." + u.id, { method: "DELETE" }, true);
    },

    /* ---- the fan book: yours to take with you ---- */
    exportFans: function () {
      return rest("rpc/my_supporters", { method: "POST", body: {} }, true).then(function (rows) {
        rows = rows || [];
        var csv = "handle,name,followed_at,comments\n" + rows.map(function (r) {
          return [r.handle, (r.name || "").replace(/,/g, " "), r.followed_at || "", r.comment_count].join(",");
        }).join("\n");
        return { rows: rows, csv: csv };
      });
    },
  };
})();
