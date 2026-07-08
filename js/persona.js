/* ============================================================
   MCC_PERSONA — one persona, every signal.
   The four interactive layers (the duality quiz, the lyric
   markers, the civic poll, the intake flows) each read a person
   differently; this is the shared spine they all write to, so
   the site carries ONE picture instead of four.

   Consent-first, same rules as everything else:
   - Everything lives in THIS browser (localStorage). Nothing is
     sent anywhere, nothing is tied to a name, nothing is a
     diagnosis. GA gets counts of interactions, never values.
   - The balance runs red to blue — the site's own binary:
     locked in the scroll (red) ↔ present in the room (blue).

   API:
     MCC_PERSONA.record(source, key, value)  — any layer logs a signal
     MCC_PERSONA.balance() → { score: -1..1, side, signals }
     MCC_PERSONA.reset()
   ============================================================ */
(function () {
  "use strict";

  var KEY = "mcc_persona_v1";

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { signals: {} }; }
    catch (e) { return { signals: {} }; }
  }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }

  function record(source, key, value) {
    var d = load();
    d.signals[source + ":" + key] = { v: value, t: Date.now() };
    save(d);
    if (window.MCC_TRACK) window.MCC_TRACK("persona_signal", { source: source, page: location.pathname });
  }

  /* the balance: duality answers carry the weight (-2..2 each, red to blue);
     marker flips and civic participation nudge toward "present" — engaging
     with the other side of a saying IS the present-in-the-room move */
  function balance() {
    var d = load();
    var sum = 0, n = 0, nudge = 0, signals = 0;
    Object.keys(d.signals).forEach(function (k) {
      var s = d.signals[k];
      signals++;
      if (k.indexOf("duality:") === 0 && typeof s.v === "number") { sum += s.v / 2; n++; }
      else if (k.indexOf("marker-flip:") === 0) nudge += 0.03;
      else if (k.indexOf("civic:") === 0) nudge += 0.08;
      else if (k.indexOf("intake:") === 0) nudge += 0.05;
    });
    var score = (n ? sum / n : 0) + Math.min(0.25, nudge);
    score = Math.max(-1, Math.min(1, score));
    return {
      score: +score.toFixed(2),
      side: score > 0.15 ? "present" : score < -0.15 ? "scroll" : "between",
      signals: signals,
      answered: n,
    };
  }

  window.MCC_PERSONA = {
    record: record,
    balance: balance,
    reset: function () { try { localStorage.removeItem(KEY); } catch (e) {} },
  };
})();
