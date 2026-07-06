# Docket 516 Explainer Archive — Plan & Operations

The public page is `docket-516.html`: a plain-English guide and manifest-driven
evidence room for Connecticut Siting Council Docket No. 516 (United Illuminating's
115-kV railroad transmission line rebuild, Fairfield ↔ Bridgeport). The CT.gov
docket page is and remains the canonical source; our page is an organized
explainer and archive index, not a substitute for the official record.

Official source:
https://portal.ct.gov/csc/1_applications-and-other-pending-matters/applications/4_docketnos500s/docket-no-516?archived=true

## How it fits together

- `docket-516.html` — renders everything from the manifest: grouped case-file
  cards with search + filters (title, category, date/year, party/source, type),
  the plain-English explainer cards, the timeline, and the 516R callout.
- `data/docket-516-files.json` — the manifest (flat array, one record per
  document). Every record carries title, category, date, source agency, the
  official URL, the local mirror path (when downloaded), and a short summary.
- `tools/sync-docket-516.mjs` — the sync script that builds the manifest and
  downloads the documents into `assets/dockets/516/<category>/`.
- `assets/dockets/516/` — the local mirror, one folder per category.

## Running the sync

```
node tools/sync-docket-516.mjs             # sync new/changed documents
node tools/sync-docket-516.mjs --dry-run   # parse and report without downloading
node tools/sync-docket-516.mjs --force     # re-download everything
```

Node 18+ (native fetch), no npm dependencies. The script parses the docket
page's main content area, tracks the nearest heading to infer each document's
category, infers dates from link text, slugs filenames, skips files already on
disk at the same size, rewrites the manifest, and prints a summary (found /
downloaded / skipped / external-only / failed).

**Note on where to run it:** managed sandboxes and some CI runners block
portal.ct.gov at the network layer (the state's CDN also rate-limits datacenter
IPs). Run the sync from a normal machine, then commit the manifest and the
downloaded files. Until the first sync runs, the manifest ships with one
external-only record per category that points at the official page, so the
explainer stays honest and useful.

## What is never mirrored

- **Public limited-appearance comments.** The Council doesn't post them because
  they can contain personal identifying information — they're available only by
  request from the CSC office. This archive does not request, hold, or mirror
  them, ever.
- **Zoom hearing recordings.** They're kept as external-only records linking to
  the official page (they carry meeting passcodes); only documents are
  downloaded.
- **CT.gov site chrome** — nav, footer, social, translate links are excluded
  by the parser.

## Size management

Transcripts and application volumes are large PDFs. GitHub blocks files over
100 MB and slows past ~1 GB per repo. If a sync pushes the mirror past that,
options in order: keep the biggest volumes external-only (flip `download` to
false in the script's category rules), move the mirror to a release asset or
LFS, or split the archive into its own repo and point the Local Copy buttons
there. The manifest structure doesn't change in any of those cases.

## Analytics

The page emits (via the standard `MCC_TRACK` wrapper, dormant until an
analytics destination is configured): `docket_page_view`, `docket_search`,
`docket_filter`, `docket_document_click`, `docket_local_copy_click`,
`docket_official_source_click`, `docket_category_open`,
`docket_timeline_click` — every payload tagged `docket: "516"`.
