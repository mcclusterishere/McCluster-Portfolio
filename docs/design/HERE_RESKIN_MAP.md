# HERE Reskin Map

## Why this document exists

This is the implementation map for enhancing the existing McCluster Portfolio / HERE experience without redesigning it.

The current site already has a strong product structure: a cinematic 3D-scroll home, sticky hero orbit, 360 and motion interactions, brand-collab scenes, Antisocial experience, booking finale, an app-style bottom bar, audio integration, and a separate streaming-style app surface. The task is to preserve that architecture and reskin the surfaces and motion so the same product feels physically manufactured from black marble, blackened steel, precision chrome, and ruby-lit material channels.

## Current source-of-truth surfaces

### Global shell
Current files:
- `index.html`
- `css/style.css`
- `js/main.js`
- `js/parallax.js`
- `js/polish.js`

Existing behavior to preserve:
- fixed/sticky sections
- scroll-driven scene progression
- hero orbit canvas/video fallback
- film grain
- scroll progress
- sound toggle and audio behavior
- bottom app bar
- reduced-motion behavior

### Home page sections
Preserve the existing composition and flow:
1. preloader
2. hero orbit
3. "Want your own site" offer section
4. loadout / 360 studio experience
5. Brand Collabs / Vaunt scroll scenes + VR band
6. Antisocial experience
7. finale / booking CTA
8. app-style bottom navigation
9. footer / catalogue links

### Streaming app surface
Current file:
- `app.html`

Preserve:
- sticky greeting/filter header
- recently played compact grid
- billboard
- horizontal media rails
- mini-player
- full now-playing sheet
- existing playback behavior

The app surface is already app-like. Do not convert it into a dashboard, console, or unrelated control-room design.

---

# Canonical material palette

## Asset 1 — HERE Obsidian
Role: replace flat black with real black-marble depth.

Use on:
- global page background where flat black is currently dominant
- hero vignette substrate behind media, only where it does not obscure footage
- section plates/scrims that currently read as dead black
- selected card/module wells
- app billboard/rail surfaces where the material can sit behind media

Do not:
- place a visible marble photograph over every section
- reduce image/video contrast
- make veins bright by default

Motion:
- slight parallax in the material grain
- grazing-light reveal tied to scroll/camera angle
- ruby may travel only through the ruby-vein mask in selected moments

## Asset 2 — HERE Blackened Steel
Role: structural framing and manufactured hardware.

Use on:
- `site-head`
- app-style bottom bar
- selected button housings
- framed media/control surfaces
- section separators
- mini-player shell
- now-playing control housings

Do not:
- turn content areas into gray metal slabs
- outline every object in steel

Motion:
- reflections shift with camera/pointer/scroll
- steel itself remains visually heavy and stationary

## Asset 3 — HERE Ruby Core
Role: replace generic flat red with internal ruby energy.

Use on:
- `--ruby` / `--ruby-hot` visual states
- active app-nav destination
- progress bars
- play/active states
- sound toggle active state
- selected CTA seams/inlays
- scroll progress
- Antisocial red moments

Do not:
- create full-card red glows
- turn the site into neon red cyberpunk

Motion:
- internal illumination
- refractive flare
- travelling energy through existing lines/seams

## Asset 4 — HERE Chrome Edge
Role: precise high-end edge response.

Use on:
- selected bevels
- active control rims
- high-value button edges
- app cards/media frames
- nav shell edge catches

Do not:
- chrome-outline every card or section

Motion:
- very narrow grazing sweep
- appears briefly when virtual light catches the edge

## Asset 5 — HERE Signature Mark
Role: materialized identity, not a new logo system.

Use on:
- preloader identity treatment
- existing brand mark moments
- splash/hero identity where already present

Preserve:
- current McCluster placement and hierarchy

Do not:
- restructure the hero around a new logo treatment

## Asset 6 — HERE Ruby Power Line
Role: physical version of existing red lines/progress/dividers.

Use on:
- scroll progress
- existing red rules and separators
- selected playback progress
- active-state rails
- section transition accents that already have a line motif

Do not:
- add decorative power lines where no line exists now

## Asset 7 — HERE Industrial Module Tile
Role: optional skin for existing cards/containers.

Use selectively on:
- the `wantsite` offer shell if it preserves current layout
- selected project/media cards
- app billboard frame
- app rail cards only when the module treatment does not overpower artwork

Do not:
- wrap every section in a giant industrial chassis

## Asset 8 — HERE Control Button
Role: mechanically reskin existing buttons.

Use on:
- `head-cta`
- `wantsite__btn`
- finale CTA buttons
- app play buttons / now-playing primary play control
- other high-value controls already present

Preserve:
- label
- action
- position
- hierarchy

Motion:
- face depresses slightly into housing
- chrome edge compresses
- ruby wakes internally

No scale-bounce toy motion.

## Asset 9 — HERE Ruby Status Indicator
Role: semantic state only.

Use only for:
- sound on/off
- loading/playing/connected state if current UI already represents a state

Do not add decorative status lights.

## Asset 10 — HERE Service Glyph System
Role: replace generic iconography only where current iconography already exists.

Use on:
- app bar if the current SVG icons are deliberately swapped and the labels stay the same
- selected service/action icons

Do not create new icon grids or new navigation.

## Asset 14 — HERE Industrial Navigation Rail
Role: optional visual skin for the existing bottom app bar or compact app tabs.

HIGH RISK.

Use only if:
- same five destinations remain
- same labels remain
- same route behavior remains
- the current bar still feels like the same app

Do not restructure navigation to showcase this asset.

---

# Screen-by-screen reskin map

## 1. Preloader
Current behavior:
- split M mark
- count to 100
- hot/blazing states
- mindfulness exercise

Reskin:
- keep the same sequence
- place mark over subtle Obsidian substrate
- Blackened Steel can frame only the mark zone, not the whole screen
- replace broad red glow with Ruby Core internal light
- use Chrome Edge as a quick edge catch at 85-100%

Do not replace the preloader with a new loading object in this pass.

## 2. Hero orbit
Current behavior:
- full-screen orbit canvas/video
- vignette
- hero copy
- HUD
- offer chip

Reskin:
- footage remains dominant
- Obsidian appears only in HUD/overlay substrate and frame edges
- Ruby Core upgrades the red accent language
- Chrome Edge may lightly catch the HUD/offer chip perimeter
- no giant industrial frame around the hero
- no new hero controls

## 3. Want-your-own-site offer
Current behavior:
- offer copy
- feature list
- CTA

Reskin:
- can become one of the clearest examples of the material system
- use an Obsidian inner surface
- Blackened Steel shell only if it preserves current geometry
- Ruby power line in the current glow/CTA accent area
- Chrome only on a few high-value edges
- same copy and CTA flow

## 4. Loadout / 360 studio
Current behavior:
- canvas/video/scroll scene

Reskin:
- do not cover the scene with heavy material panels
- only HUD, compass, controls, labels, and edge hardware receive material treatment
- Ruby activation for motion-enabled states
- Blackened Steel for controls
- Chrome for compass/control edge catches

The 360 media itself stays visually primary.

## 5. Brand Collabs / Vaunt
Current behavior:
- scroll scenes
- canvas backgrounds
- VR band
- panels + scene count

Reskin:
- keep all scene timing and story order
- panel surfaces can receive restrained Obsidian depth
- scene count and control chrome can use precision metal
- Ruby Core can drive active scene indicators
- no conversion to media cartridges in this pass

## 6. Antisocial experience
Current behavior:
- dark cinematic section
- red/phone/sound cues
- play CTA

Reskin:
- this is where Ruby Core can be strongest
- black stays mostly visual-media driven
- use Ruby energy in existing ring/sound/CTA motifs
- use Chrome Edge on the play control
- do not turn the whole section into a machine dashboard

## 7. Finale / booking
Current behavior:
- LOCK IN statement
- booking/quote/subscribe actions

Reskin:
- use the Control Button treatment on primary actions
- Obsidian can subtly deepen the section substrate
- Ruby Core marks the primary action
- Chrome Edge separates action hierarchy

No new modal or new conversion flow.

## 8. Bottom app bar
Current behavior:
- Home
- Collabs
- Antisocial
- Ecosystem
- Hire

Reskin:
- labels and destinations stay exactly the same
- current tab shapes can be skinned with Blackened Steel / Obsidian
- selected tab can use Ruby Core
- optional Asset 14 only if the bar still reads as the same five-tab bar

Do not change destinations or add a center orb/token.

## 9. Streaming app (`app.html`)
This is a separate but related surface and should also be reskinned, not redesigned.

### Sticky header + filter pills
- Obsidian/Steel substrate
- active pill = Ruby Core
- Chrome Edge only on selected/active state

### Recently played tiles
- preserve 2-column compact grid
- only deepen backgrounds/material response

### Billboard
- keep media dominant
- use Chrome Edge/Blackened Steel as subtle frame
- Ruby only on CTA/metadata accent

### Horizontal rails
- do not replace cards with industrial modules wholesale
- preserve current card sizing and media-first appearance
- optional shallow material frame only

### Mini-player
- strong candidate for Blackened Steel + Ruby status/progress
- keep exact position and behavior

### Full now-playing sheet
- preserve sheet interaction and controls
- remove flat gradient feeling by using dark material response behind the art and controls
- Ruby Core for active playback states
- Chrome Edge around high-value controls
- keep album art dominant

---

# Motion map

The existing motion system already has value. The enhancement is about replacing generic CSS effects with material-aware responses.

## Keep
- existing scroll timing
- sticky section durations
- hero orbit progression
- VR interactions
- play sheet motion
- app rail behavior
- reduced-motion fallbacks

## Upgrade
- flat fade -> light/material reveal
- flat red glow -> internal Ruby Core illumination
- simple border highlight -> Chrome grazing reflection
- generic dark surface -> Obsidian/Steel roughness + normal response
- button scale -> physical face depression
- progress bar -> Ruby Power Line / internal energy path

## Performance rule
Do not put the entire app in WebGL. Use WebGL/WebGPU only where the existing 3D/canvas/VR system already justifies it or where a small isolated material renderer materially improves realism.

DOM/CSS remains the product layer.

---

# Explicitly out of scope for this pass

Do not implement these experimental concepts during the reskin:
- 11 Credential Plate
- 12 Media Cartridge
- 13 Ruby Token
- 15 Obsidian Loading Object
- 16 Holographic Panel
- 17 Command Console
- 18 Project Vault
- 19 Data Core
- 20 Cinematic Transition Gate

They may be used later for new features, but they are not part of the current visual enhancement.

---

# Claude execution instructions

1. Inspect `index.html`, `app.html`, `css/style.css`, `js/main.js`, `js/parallax.js`, `js/polish.js`, and `js/vr360.js` before touching layout.
2. Produce a before-map of the actual existing selectors/components you plan to skin.
3. Do not alter page order, section hierarchy, app-bar destinations, copy, or media flows in the first implementation pass.
4. Implement the four base materials first: Obsidian, Blackened Steel, Ruby Core, Chrome Edge.
5. Apply those materials to existing selectors before adding any optional component wrappers.
6. Only then consider assets 5-10 and optional 14 where the current UI already has a matching role.
7. Preserve media dominance. Photography, video, 360 content, music, and project imagery remain the star.
8. Compare before/after screenshots at identical desktop and mobile viewport sizes.
9. If a screenshot no longer looks immediately recognizable as the same HERE product, roll back the structural change.
10. Treat every proposed new component as a redesign unless it clearly skins an existing component one-to-one.

## Final acceptance line

The correct result is: **same HERE product, materially upgraded.**

If the user has to relearn the site, the implementation failed.
