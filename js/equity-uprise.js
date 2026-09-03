(function () {
  'use strict';

  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function track(label, data) {
    if (window.MCC_TRACK) {
      window.MCC_TRACK('equity_uprise_institutional', Object.assign({ label: label, page: 'equity-uprise' }, data || {}));
    }
  }

  /* ---------- workspace views ---------- */
  var viewButtons = qa('[data-eu-view]');
  var viewPanels = qa('[data-eu-panel]');
  var topTitle = q('[data-eu-view-title]');
  var viewLabels = {
    overview: 'Overview',
    cases: 'Case Files',
    policy: 'Policy Intelligence',
    media: 'Media Archive',
    proof: 'Proof Room',
    partner: 'Partner Desk'
  };

  function setView(name, pushHash) {
    if (!viewLabels[name]) name = 'overview';
    viewButtons.forEach(function (button) {
      button.classList.toggle('is-active', button.getAttribute('data-eu-view') === name);
      button.setAttribute('aria-current', button.getAttribute('data-eu-view') === name ? 'page' : 'false');
    });
    viewPanels.forEach(function (panel) {
      var active = panel.getAttribute('data-eu-panel') === name;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
    if (topTitle) topTitle.textContent = viewLabels[name];
    if (pushHash && history.replaceState) history.replaceState(null, '', '#' + name);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    track('view_change', { view: name });
  }

  viewButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      setView(button.getAttribute('data-eu-view'), true);
    });
  });

  var initial = (location.hash || '').replace('#', '');
  setView(viewLabels[initial] ? initial : 'overview', false);

  window.addEventListener('hashchange', function () {
    var name = (location.hash || '').replace('#', '');
    if (viewLabels[name]) setView(name, false);
  });

  /* buttons that jump to another app view */
  qa('[data-eu-jump]').forEach(function (button) {
    button.addEventListener('click', function () {
      setView(button.getAttribute('data-eu-jump'), true);
    });
  });

  /* ---------- case file selector ---------- */
  var caseButtons = qa('[data-eu-case]');
  var casePanels = qa('[data-eu-case-panel]');
  function setCase(name) {
    caseButtons.forEach(function (button) {
      button.classList.toggle('is-active', button.getAttribute('data-eu-case') === name);
    });
    casePanels.forEach(function (panel) {
      panel.classList.toggle('is-active', panel.getAttribute('data-eu-case-panel') === name);
    });
    track('case_open', { case_file: name });
  }
  caseButtons.forEach(function (button) {
    button.addEventListener('click', function () { setCase(button.getAttribute('data-eu-case')); });
  });
  if (caseButtons.length) setCase(caseButtons[0].getAttribute('data-eu-case'));

  /* ---------- policy accordion ---------- */
  qa('[data-eu-policy]').forEach(function (row) {
    var trigger = q('[data-eu-policy-trigger]', row);
    if (!trigger) return;
    trigger.addEventListener('click', function () {
      var opening = !row.classList.contains('is-open');
      qa('[data-eu-policy]').forEach(function (other) {
        other.classList.remove('is-open');
        var otherTrigger = q('[data-eu-policy-trigger]', other);
        if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false');
      });
      if (opening) {
        row.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        track('policy_open', { topic: row.getAttribute('data-eu-policy') });
      }
    });
  });

  /* ---------- native Equity Uprise music engine ---------- */
  var audio = q('#euAudio');
  var play = q('#euPlay');
  var progress = q('#euProgress');
  var current = q('#euCurrent');
  var duration = q('#euDuration');
  var nowTitle = q('#euNowTitle');
  var nowArtist = q('#euNowArtist');
  var trackButtons = qa('[data-eu-track-src]');
  var selectedTrack = -1;

  function formatTime(seconds) {
    if (!isFinite(seconds)) return '0:00';
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function selectTrack(index, autoplay) {
    if (!audio || !trackButtons[index]) return;
    var button = trackButtons[index];
    selectedTrack = index;
    trackButtons.forEach(function (b, i) { b.classList.toggle('is-active', i === index); });
    audio.src = button.getAttribute('data-eu-track-src');
    audio.load();
    if (nowTitle) nowTitle.textContent = button.getAttribute('data-eu-track-title') || 'Untitled';
    if (nowArtist) nowArtist.textContent = button.getAttribute('data-eu-track-artist') || 'McCluster';
    if (progress) progress.value = 0;
    if (current) current.textContent = '0:00';
    if (duration) duration.textContent = '0:00';
    updateMediaSession(button);
    track('music_select', { track: button.getAttribute('data-eu-track-title') || '' });
    if (autoplay) {
      var promise = audio.play();
      if (promise && promise.catch) promise.catch(function () {});
    }
  }

  function updateMediaSession(button) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: button.getAttribute('data-eu-track-title') || 'Equity Uprise',
        artist: button.getAttribute('data-eu-track-artist') || 'McCluster',
        album: 'Equity Uprise · Docket 516R',
        artwork: [
          { src: 'assets/img/equity-uprise-logo.png', sizes: '512x512', type: 'image/png' }
        ]
      });
    } catch (e) {}
  }

  function syncPlayState() {
    if (!play || !audio) return;
    play.textContent = audio.paused ? '▶' : 'Ⅱ';
    play.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  }

  if (audio) {
    audio.addEventListener('loadedmetadata', function () {
      if (duration) duration.textContent = formatTime(audio.duration);
      if (progress) progress.max = Math.max(1, Math.floor(audio.duration || 1));
    });
    audio.addEventListener('timeupdate', function () {
      if (current) current.textContent = formatTime(audio.currentTime);
      if (progress && !progress.matches(':active')) progress.value = Math.floor(audio.currentTime || 0);
    });
    audio.addEventListener('play', function () { syncPlayState(); track('music_play', { index: selectedTrack }); });
    audio.addEventListener('pause', syncPlayState);
    audio.addEventListener('ended', function () {
      if (selectedTrack >= 0 && selectedTrack < trackButtons.length - 1) selectTrack(selectedTrack + 1, true);
      else { audio.currentTime = 0; syncPlayState(); }
    });
  }

  if (play && audio) {
    play.addEventListener('click', function () {
      if (selectedTrack < 0 && trackButtons.length) selectTrack(0, false);
      if (audio.paused) audio.play().catch(function () {}); else audio.pause();
    });
  }
  if (progress && audio) {
    progress.addEventListener('input', function () { audio.currentTime = Number(progress.value) || 0; });
  }
  trackButtons.forEach(function (button, index) {
    button.addEventListener('click', function () {
      if (selectedTrack === index && audio && !audio.paused) audio.pause();
      else if (selectedTrack === index && audio) audio.play().catch(function () {});
      else selectTrack(index, true);
    });
  });
  if (trackButtons.length) selectTrack(0, false);

  if ('mediaSession' in navigator && audio) {
    try {
      navigator.mediaSession.setActionHandler('play', function () { audio.play(); });
      navigator.mediaSession.setActionHandler('pause', function () { audio.pause(); });
      navigator.mediaSession.setActionHandler('seekbackward', function () { audio.currentTime = Math.max(0, audio.currentTime - 10); });
      navigator.mediaSession.setActionHandler('seekforward', function () { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 10); });
    } catch (e) {}
  }

  /* ---------- October 5 film drawer ---------- */
  var dialog = q('#euVideoDialog');
  var frame = q('#euVideoFrame');
  qa('[data-eu-video-open]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (!dialog || !frame) return;
      frame.src = 'https://www.youtube.com/embed/Tum9BPmGjEY?autoplay=1&rel=0';
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
      track('film_open', { film: 'equity-uprise-2025' });
    });
  });
  function closeDialog() {
    if (!dialog) return;
    if (dialog.close) dialog.close(); else dialog.removeAttribute('open');
    if (frame) frame.src = '';
  }
  qa('[data-eu-video-close]').forEach(function (button) { button.addEventListener('click', closeDialog); });
  if (dialog) {
    dialog.addEventListener('click', function (event) { if (event.target === dialog) closeDialog(); });
    dialog.addEventListener('close', function () { if (frame) frame.src = ''; });
  }

  /* ---------- outbound evidence / engagement analytics ---------- */
  qa('[data-eu-track]').forEach(function (el) {
    el.addEventListener('click', function () {
      track(el.getAttribute('data-eu-track') || 'click', {
        href: el.getAttribute('href') || ''
      });
    });
  });
})();
