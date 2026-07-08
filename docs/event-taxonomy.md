# Event Taxonomy — One Name, One Meaning

Every signal on the platform flows through `MCC_TRACK(name, params)` — and from
there into GA4, the intake mirror, and the on-device model (`MCC_MODEL`). A name
used twice with two meanings poisons all three. These are the rules; the CI audit
(`tools/audit-static.mjs`) enforces the format on every push.

## The rules

1. **Names are `snake_case`**: lowercase letters, digits, underscores. No spaces,
   no dashes, no camelCase. (`cta_click` ✓ · `CTA-Click` ✗)
2. **Names are `object_action` or `surface_action`**: the thing, then what
   happened to it. `offer_view`, `deal_signed`, `packet_built`, `install_tap`.
3. **One name, one meaning, everywhere.** If two surfaces do the same thing they
   fire the same name and differ in `params`, never in the name.
4. **Variation goes in params, not names.** `cta_click {label: "offer-claim"}`,
   not `offer_claim_click`. Params carry: `label` (which control), `page`
   (where), and domain-specific detail (`song`, `dom`, `role`…).
5. **The model reads names + params + pathname.** When naming something new,
   check `MAP` and `GOALS` in js/analytics.js — the name you pick decides which
   interest domain and conversion goal it feeds.

## Intent tiers (what a name should signal)

| Tier | Meaning | Examples |
|---|---|---|
| **Discovery** | Arrived, looked | `*_view`, `dwell`, `app_filter` |
| **Evaluation** | Leaned in | `cta_click`, `foryou_tap`, `vr_gyro_on`, `onboard_quiz` |
| **Conversion** | Walked through the door | `book_call`, `collab_signed`, `talent_listing_saved`, `install_done`, `sound_beacon_tap` |

Conversion-tier events are listed in `GOALS` (analytics.js) so the model stops
selling a bought door. When adding a conversion event, add it there too.

## The live registry (as of July 2026)

Discovery: `offer_view`, `vaunt_universe_view`, `onboard_view`, `collab_view`,
`packet_view`, `talent_view`, `brand_view`, `brand_index_view`,
`resource_pack_view`, `app_view`, `vr_view`, `h3_play`, `dwell`, `app_filter`.

Evaluation: `cta_click`, `foryou_tap`, `exit_intent`, `install_tap`,
`vr_gyro_on`, `vr_skip`, `sound_beacon`, `onboard_role`, `onboard_quiz`,
`offer_billing`, `app_play`, `mstock_dollar`, `collab_terms_saved`,
`packet_built`, `packet_copied`, `collab_propose`, `collab_counter`,
`collab_locked`.

Conversion: `book_call`, `collab_signed`, `talent_listing_saved`,
`member_saved`, `install_done`, `sound_beacon_tap`, `talent_signin_sent`,
`talent_request_accepted` / `_declined` / `_done`, `deal-*` mirrors.
