# BLOCK OPS — deploy record

- **Play URL:** https://merry-puffin-231.higgsfield.gg/
- **game_id:** `65b294b5-111e-42d4-a4b2-f785204c1153` (pass this back to
  `deploy_game` to update in place — never omit it on an update or a
  second game with a new URL is created)
- **Mode:** rules (solo stub `logic.js`)
- **Zip layout:** `logic.js`, `index.html`, `strings.js`, `assets/` at the
  archive root (`cd game && zip -r ../block-ops.zip logic.js index.html strings.js assets`)
- **Upload path:** the build box has no egress — call `media_upload` for a
  slot, dispatch `.github/workflows/game-upload.yml` with the presigned
  URL as the `upload_url` input, then `media_confirm` (type `file`) and
  `deploy_game` with the permanent zip URL.
- **Card art:** thumbnail + favicon are Higgsfield generations (see
  `design/assets.csv`); the raw asset URLs live in `raw-manifest.json`.
- **v1 scope note:** ships silent by decision — no audio assets; polish
  budget went to feel (hit-pause, shake, streak flash). Audio is the first
  v2 candidate.
