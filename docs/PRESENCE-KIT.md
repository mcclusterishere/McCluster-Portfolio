# The Presence Kit — one identity, everywhere

Google (and ChatGPT/Perplexity) build a person-entity by matching the **same
name + same official site + same facts** across the open web. This kit makes that
consistent. Copy the blurbs verbatim; the point is that they're identical.

## The one-line description (use this exact string everywhere)

> Creative director and founder of McCluster Corp and the Equity Uprise civic
> fellowship. Recognized by the State of Georgia and the City of Bridgeport.
> Building the Street Credit Bureau. streetcreditbureau.com

## The three bios (short / medium / long)

**Short (social bios, ~140 chars):**
> Creative director · founder of McCluster Corp & Equity Uprise · recognized by GA & Bridgeport · building the Street Credit Bureau

**Medium (~55 words — LinkedIn About, Crunchbase, directories):**
> Matthew McCluster is a creative director, photographer, web designer, and
> songwriter based in Connecticut and Georgia. He founded McCluster Corp and the
> Equity Uprise civic fellowship — recognized in 2025 by the State of Georgia and
> the City of Bridgeport — and is the architect of the Street Credit Bureau.

**Long:** use the biography copy at https://streetcreditbureau.com/matthew-mccluster.html

**Always link to:** `https://streetcreditbureau.com/matthew-mccluster.html`
**Always spell the name:** Matthew McCluster

---

## 1. Wikidata (the attainable Knowledge-Panel trigger)

Create at wikidata.org → Special:NewItem. This is what actually feeds Google's
panel, and your identifiers ARE the references it needs.

| Field / property | Value |
|---|---|
| Label (en) | Matthew McCluster |
| Description (en) | American creative director and founder of McCluster Corp |
| Also known as | McCluster |
| `instance of` (P31) | human |
| `sex or gender` (P21) | male |
| `country of citizenship` (P27) | United States of America |
| `occupation` (P106) | creative director; photographer; songwriter; web designer |
| `official website` (P856) | https://streetcreditbureau.com/ |
| `ISNI` (P213) | 0000 0005 2956 3111 |
| `ORCID iD` (P496) | 0009-0000-8988-8955 |
| `employer` / `founder of` | McCluster Corp (create a second item, or link if it exists) |
| `award received` (P166) | (add the GA & Bridgeport proclamations, citing the government sources) |

Add each identifier as a reference on the statements. Once the item exists,
Google's Knowledge Graph can pick it up within weeks.

## 2. Google Search Console + Business Profile

- **Search Console** (see `docs/NAME-SEO.md`): verify domain → submit sitemap →
  Request Indexing on the biography, FAQ, and newsroom pages. Do this first.
- **Google Business Profile** — if you'll take local clients, create one for
  McCluster Corp (service-area business, CT/GA). It's a strong local-SEO + entity
  signal and can surface a mini-panel for the business.

## 3. The profile network (create these; link the site on each)

Each is a high-authority domain that Google trusts as a cross-reference. Priority
order:

1. **LinkedIn** — personal profile. Name, the medium bio, site in the "Contact"
   and featured link. Highest-authority backlink of the set.
2. **Crunchbase** — a person profile + a McCluster Corp company profile. Founders
   are exactly what Crunchbase indexes; it ranks well for names.
3. **MusicBrainz** — an artist entry for the Here / PRIM3 catalogue (ISRC prefix
   QT6KV). Feeds music knowledge graphs and streaming metadata.
4. **Muck Rack / Qwoted** — a journalist-facing profile; also where you answer
   reporter queries (see `docs/PRESS-KIT.md`).
5. **F6S and Wellfound (AngelList)** — founder/startup profiles, well-indexed.
6. **Gravatar** — one profile that propagates your photo + bio across hundreds of
   sites that use it (WordPress comments, etc.). Cheap, wide reach.
7. **About.me** — a simple, fast-ranking one-page profile that links everything.
8. **Google Scholar** — claim it via your SSRN author ID (9761733) if you have
   papers there.

On every one: same name, the medium bio, and `streetcreditbureau.com/matthew-mccluster.html`
as the website. Do not vary the spelling or the description — variation splits the entity.

## 4. What's already on-site working for you

- `matthew-mccluster.html` — the canonical biography (Person schema).
- `who-is-matthew-mccluster.html` — FAQ page (FAQPage schema → wins "People also
  ask" and gets quoted by AI answer engines).
- `newsroom.html` — dated recognition hub (NewsArticle schema → freshness + a
  place press can link).
- Homepage `<noscript>` bio so crawlers/AI that don't run the canvas still read the entity.
- All four interlinked, in the sitemap, cross-linked from the homepage.

## The order to do it

1. **Search Console → Request Indexing** (today — turns "built" into "indexed").
2. **Wikidata item** (this week — the panel trigger).
3. **LinkedIn + Crunchbase + About.me + Gravatar** (this week — the authority set).
4. **Press push** (`docs/PRESS-KIT.md`) — the coverage that unlocks the rest, including Wikipedia.
5. Add every piece of coverage back into `newsroom.html`. It compounds.
