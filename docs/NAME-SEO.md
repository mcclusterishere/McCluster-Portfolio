# Owning "Matthew McCluster" — the playbook

What I built on-site, and the off-site moves only you can do. Honest about
what's achievable and what isn't.

## What's live on the site now

- **`matthew-mccluster.html`** — a dedicated, text-rich, static biography page
  (no JS gating, real headings, real prose). This is the page built to be the
  top hit for your name. H1 = "Matthew McCluster", title carries the name, and
  every fact is verifiable.
- **Entity graph** — one canonical `Person` (`@id` shared with the homepage) with
  your awards, credentials, and identifiers (ISNI, ORCID, SSRN), plus a
  `BreadcrumbList` and the `McCluster Corp` `Organization`. This is what feeds a
  Google Knowledge Panel.
- **Authority citations** — the page links out to your ORCID and ISNI registry
  pages. Those are the cross-references Google's Knowledge Graph trusts.
- **Crawl paths** — in `sitemap.xml` at priority 0.95, linked from the homepage
  footer, the résumé, and the ecosystem page with the anchor text "Matthew McCluster".

## The 3 moves that actually get you indexed & ranked (do these)

1. **Google Search Console — the #1 lever.**
   - Go to search.google.com/search-console → add `streetcreditbureau.com` →
     verify with a **DNS TXT record on Cloudflare** (2 min).
   - Submit `sitemap.xml`.
   - **URL Inspection** → paste `https://streetcreditbureau.com/matthew-mccluster.html`
     → **Request Indexing**. This gets the page crawled in *days*, not weeks.
   - Do the same for the homepage. This is what turns "built" into "indexed."

2. **Wikidata — the attainable "Wikipedia."**
   Wikidata is Wikipedia's structured-data sibling and has a *far* lower bar — it
   accepts you on the strength of your existing identifiers, and it feeds Google's
   Knowledge Panel directly. Create an item at wikidata.org/wiki/Special:NewItem:
   - Label: **Matthew McCluster** · Description: *American creative director and founder of McCluster Corp*
   - `instance of` → **human**
   - `occupation` → creative director; photographer; songwriter
   - `country of citizenship` → United States
   - `official website` → https://streetcreditbureau.com/
   - `ISNI` → 0000 0005 2956 3111 · `ORCID iD` → 0009-0000-8988-8955
   - Add the proclamations as `award received` with the government sources as references.
   The identifiers *are* the references — that's why they matter.

3. **One name, one link, everywhere (entity consistency).**
   Google merges you into one entity by matching the *same* name + the *same*
   official site across the web. On every profile — Instagram, YouTube, TikTok,
   LinkedIn, Crunchbase, **MusicBrainz** (for the Here/PRIM3 catalogue), and any
   press — list the site as `streetcreditbureau.com` and spell the name exactly
   "Matthew McCluster." Inconsistency splits the entity and kills the panel.

## The honest truth about Wikipedia

You **cannot** get a Wikipedia article by building a website, and you should not
write one about yourself (it's a conflict of interest and gets deleted).
Wikipedia requires **significant coverage in multiple independent, reliable
sources** — real journalism, not your own pages or government proclamations
(those are primary sources and usually don't count on their own).

The real path: **earn press first.** The proclamations, the Equity Uprise
fellowship, and the Whip Equipped web series are legitimate local-news hooks —
pitch Connecticut and Georgia outlets. Once a few independent articles exist,
*then* the notability bar is met and an independent editor can write the article
(or you request one at Wikipedia's Articles for Creation). Until then, **Wikidata
is the win** — it's what actually shows up in Google.

## After it's indexed

- When a Knowledge Panel appears, **claim it** ("Claim this knowledge panel" —
  verify via one of your linked social accounts).
- Keep publishing under the name (the site, socials, any press) and keep the
  links consistent. Ranking for a name is on-site quality + consistent
  cross-references + a little time.
