# McCluster Admin (/admin) — Collections & Fields Map

**Goal:** a login-protected control panel at `/admin` where you edit the whole
site in forms and hit Save. It commits to the repo; the live site rebuilds in
~45s. No code, no middleman.

**Stack:** Sveltia CMS (a modern, single-file admin) on GitHub Pages, with a
tiny free Cloudflare Worker handling the "Log in with GitHub" step. Hosting
stays on GitHub Pages.

**How it works for you:**
> Go to mcclusterishere.github.io/McCluster-Portfolio/admin → "Log in with
> GitHub" → pick a collection → edit fields → Save → done.

---

## Two-part build (why some of this is a refactor)

1. **Already data-driven** (CMS can edit these immediately): Ecosystem Brands,
   Career/Roles, Certifications, Music metadata, the Founding Offer, Payment &
   booking links. These live in `data/*.json` today.
2. **Currently hardcoded in the HTML** (needs a small refactor to become
   editable): most page *copy* — home, hire, fellowship, verification, space
   listing. To make these CMS-editable I move their text into `data/copy/*.json`
   and have each page render from it. Same look, now editable.

I'll ship #1 first (fast, high value), then convert pages in #2 one at a time.

---

## A. CONTENT COLLECTIONS (repeatable lists)

### 1. Ecosystem Brands  → `data/brands.json`
Add / edit / reorder / delete a brand.
- **Segment** (owned & controlled · vendors · affiliates) — dropdown
- **Name**, **Slug**, **Tagline**
- **Logo** (image upload), **Background video**, **Poster image**
- **Summary** (paragraph)
- **Facts** (repeatable: Label + Value)
- **Highlights** (repeatable: Title + Body)
- **Links** (repeatable: Label + URL + opens-in-new-tab)
- **Scored-to song** (optional: Label + URL)
- *(Also: edit the three segment headings + blurbs.)*

### 2. Career / Roles  → `data/roles.json`
- **Title**, **Org**, **Location**, **Dates**, **Slug**
- **Summary**
- **Bullets** (repeatable text)
- **Credentials** (repeatable: Label + file/URL)

### 3. Certifications & Recognition  → `data/roles.json`
- **Label**, **Date**, **Document** (PDF upload / URL)

### 4. Music — song metadata  → `data/song-meta.json`
*(The catalogue list itself auto-builds from the audio files; this edits the
info shown per track.)*
- **Track key**, **Title**, **Album**, **Credits**, **Length**, **ISRC**,
  **℗ line**

### 5. Portfolio Projects (the "Programs" home scroll)  → new `data/programs.json`
*(Refactor: extract the command-scene copy out of index.html.)*
- **Tag** (e.g. "Equity Uprise · The Movement")
- **Title**, **Pitch**, **CTA label + link**, **Logo**, **Scene footage**

---

## B. PAGE COPY (single pages — refactor to `data/copy/*.json`)

### 6. Home  → `data/copy/home.json`
- Hero: eyebrow, title words, subline
- Bio: name, lede, body paragraph, proof links
- Section headers: Services / Programs / Resources kickers + titles
- Finale: heading, buttons, closing line

### 7. Hire page  → `data/copy/hire.json`
- Hero headline + pitch, trust pills, stats
- Services list, Packages (name + scope + CTA), How-it-works, FAQ, proof links

### 8. Founding Offer  → `data/copy/offer.json`  *(mostly data already)*
- Price, term, **spots taken / total** (flip "2 of 3" yourself)
- Deal bullets, Who-it's-for, Deliverables, FAQ, optional ad-budget line

### 9. Fellowship  → `data/copy/fellowship.json`
- Manifesto paragraphs
- **The intake interview questions** (add / edit / reorder / branch)

### 10. Verification  → `data/copy/verify.json`
- Intro copy, entity list, form field labels

### 11. Space Listing  → `data/copy/list-your-space.json`
- Page copy + the space-intake interview questions & price-sheet fields

### 12. Equity Uprise / IP / Ecosystem intros — same pattern, one file each

---

## C. SETTINGS (one-off panels)

### 13. Payment & Booking Links  → new `data/payments.json`  *(move from js/payments.js)*
- Per item (each song, Subscribe, Resource Pack, **Book a Paid Call**):
  **Title**, **Link URL**. Empty link = "coming soon" state, automatically.

### 14. Identifiers / IP record  → new `data/identifiers.json`
- The IP page values (EIN, ISRC, DPID, ISNI, ORCID, UEID, CAGE, etc.) — edit as
  numbers come in.

### 15. Global  → `data/settings.json`
- Analytics ID, contact email, social URLs, default sound on/off

---

## What I need from you
1. **Approve / adjust this map** — add, remove, or rename any collection.
2. Confirm the **build order**: Part 1 (brands, roles, certs, music, offer,
   payment links) first, then page-copy pages one by one.
3. When ready, I set up the GitHub login worker and stand up `/admin`.
