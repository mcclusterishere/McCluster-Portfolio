(function () {
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function qsa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  // Reveal dense sections only when they enter view.
  var revealNodes = qsa('.eu-reveal');
  if (!reduced && 'IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealNodes.forEach(function (node) { revealObserver.observe(node); });
  } else {
    revealNodes.forEach(function (node) { node.classList.add('is-visible'); });
  }

  // Highlight the current chapter in the sticky evidence-room navigation.
  var navLinks = qsa('.eu-record-nav a[href^="#"]');
  var sections = navLinks.map(function (a) {
    return document.querySelector(a.getAttribute('href'));
  }).filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    var activeObserver = new IntersectionObserver(function (entries) {
      var visible = entries.filter(function (e) { return e.isIntersecting; })
        .sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; });
      if (!visible.length) return;
      var id = '#' + visible[0].target.id;
      navLinks.forEach(function (a) {
        a.classList.toggle('is-active', a.getAttribute('href') === id);
      });
    }, { threshold: [0.18, 0.35, 0.55], rootMargin: '-20% 0px -62% 0px' });
    sections.forEach(function (section) { activeObserver.observe(section); });
  }

  // Respect the site's existing analytics helper when available.
  document.querySelectorAll('[data-eu-track]').forEach(function (el) {
    el.addEventListener('click', function () {
      if (window.MCC_TRACK) {
        window.MCC_TRACK('equity_uprise_evidence_click', {
          label: el.getAttribute('data-eu-track'),
          page: 'equity-uprise'
        });
      }
    });
  });
})();
