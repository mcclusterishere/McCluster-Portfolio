# McCluster Portfolio — Changelog

A running record of what changed, when, and — where it matters — how it
affects the way the site *feels*. Newest first. Commit hashes reference
this repo's history (`git log` has the full detail).

## 2026-07-06 — Privacy pass

- All commit messages scrubbed of tooling metadata across the full
  history of every branch.
- Working reference photos (`assets/ref/`, 48 MB) removed from the
  repository and purged from history — the site never displayed them,
  and the media workflows pull from the CDN, not the repo.
- The public site now streams 128 kbps audio encodes (12 MB total).
  Full-quality masters stay offline with the label; Square buyers get
  the real files. The old full-bitrate files were purged from history.
- Note: commit hashes changed twice today because history rewriting
  re-hashes every commit. References below are current.

## 2026-07-06 — The scroll feel investigation

**What happened:** the main-page scroll started feeling "less native" —
long black stretches between the cinematic sections.

**Root cause:** commit `666396c` added the Catalogue + System
Identification section directly onto the main page, between the 360
studio pan and the process strip. That inserted roughly two screens of
static typographic black into what had been an unbroken film-to-film
chain. Nothing else about the scroll engine changed — the scrub, pinning,
and crossfades were untouched. The flow broke because a long non-visual
section landed in the middle of it.

**Fix (this deploy):**
- The Catalogue section is removed from the main page. The main-page flow
  is back to exactly its pre-catalogue rhythm: hero orbit → 360 studio →
  process strip → services → portfolio command scroll → finale.
- The full catalogue + System Identification now lives on its own page,
  `catalogue.html`, linked from the header nav on the main page.
- Every song page now carries its record info at the top of the page
  (length, credits, ℗ McCluster Corp, ISRC prefix, link to the full
  catalogue) — so the song data lives with the song.
- The `.stats` spacing experiment from the same working session was
  reverted to the original values.

**One other feel-related change to be aware of** (shipped 2026-07-06
morning, commit `2ef15cd`): the preloader now opens the site after the
first 48 hero frames instead of all 161, and streams the rest during the
scroll. On a fast connection this is invisible; on a slow connection a
very fast scroller can briefly outrun the stream, and the orbit holds its
newest loaded frame until frames catch up. That trade bought a ~2.5×
faster site open. If the hold ever bothers you, the gate number is one
constant (`heroGate` in `js/main.js`).

## 2026-07-06 earlier deploys

- `3746c7f` — **Got WiFi karaoke**: full 38-bar lyric page from the
  DistroKid time codes; while the track plays, the page scrolls itself
  and each bar lights on cue. Engine works on any song page via `data-t`
  attributes.
- `666396c` — **Catalogue on the main page** (superseded — see above).
- `04f084f` — **Sound back to opt-in** via the toggle (reviewer feedback:
  auto-starting music reads wrong for corporate visitors). The iOS
  unlock-retry hardening stays.
- `70b2e5c` — **Dealer Plates iPad fix**: iOS could silently reject one
  of six simultaneous audio unlocks (always Dealer Plates, last in the
  list); unlocks now retry on later taps.
- `5256fd9` — **Book a Paid Call** gates (finale button + Consultation
  tile), pending the Square Appointments URL.
- `f5500da` — Got WiFi Square payment link wired.
- `2ef15cd` — **Performance pass**: preloader gates on 48 frames
  (8.2 MB → 2.6 MB blocking payload), heavy PNGs re-encoded to WebP/JPEG
  derivatives (4.3 MB of eager images → 180 KB lazy), site opens ~5 s at
  5 Mbps instead of ~14 s. Auto-arm sound also shipped here and was
  reverted later the same day (`04f084f`).

## 2026-07-05 (selected)

- `4e4f7ed` — **Mouse parallax**: near the end of each slide's scroll
  band the held frame leans toward the cursor, lyrics counter-drift, a
  soft light follows the pointer. Desktop pointers only.
- `4e90256` / `371703b` — **The Extraction storyboard**: the Antisocial
  helicopter segment became 8 stills, one per bar, served as lazy JPEGs.
- Earlier that day: Vaunt remix page, WIDER 210 money-glitch scene,
  Bell 525 extraction film, GM-call scene, Shiloh citations scene,
  Dealer Plates evidence-locker animations, flip-plate product scene,
  red HondaJet opener with the real Vaunt app, per-song loading screens,
  GA4 analytics wrapper (dormant until an ID is set), Whip Equipped
  interactive-series panel, referral links, and the full performance/
  lazy-loading architecture. See `git log` for the blow-by-blow.
