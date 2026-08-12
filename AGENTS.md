# McCluster Portfolio / HERE Agent Handoff

## Current visual task: RESKIN, NOT REDESIGN

The existing McCluster Portfolio / HERE experience is the product. Preserve its layout, page structure, content hierarchy, navigation, copy, media, scroll flow, interaction model, album/visual/360/civic sections, and working behavior.

The current task is to make the existing experience feel more physical, cinematic, luxurious, and materially real without turning it into a different app.

If the result looks like a new dashboard, sci-fi control room, game HUD, or totally different website, the implementation has gone too far.

## Required design map before implementation

Before changing visual code, read:

- `docs/design/HERE_RESKIN_MAP.md`

That file maps the actual current HERE structure, including `index.html`, `app.html`, the sticky/scroll systems, hero orbit, 360/VR experience, Brand Collabs, Antisocial, finale, bottom app bar, streaming app surface, and the exact material assets that belong on each existing region.

Do not implement from the asset names alone. The map is the source of truth for WHERE each material belongs and what must remain untouched.

## Core rule

**Keep the design. Upgrade the material language and motion language.**

Use the supplied HERE material assets to reskin existing surfaces and interactions. Do not use them as an excuse to invent new screens, new navigation, new product metaphors, or new content architecture.

The intended transformation is:

`existing HERE experience`
+
`realistic obsidian / blackened steel / chrome / ruby material behavior`
+
`more cinematic, physically plausible motion`
=
`enhanced HERE`

Not:

`existing HERE`
->
`completely different industrial dashboard`

## Canonical reskin assets

The implementation set is intentionally smaller than the full experimental asset library.

### 1. HERE Obsidian
Use for:
- existing black backgrounds
- section surfaces
- dark card/module surfaces
- selected hero surfaces
- areas that currently read as flat black

Purpose:
Replace dead flat black with real black-marble depth, roughness, micro-variation, and subtle recessed vein structure.

Important:
- Do not paste a marble photograph over the site.
- Use the supplied PBR maps/material package.
- The stone should remain mostly dark and restrained.
- Ruby energy may travel through the dedicated ruby-vein mask while the stone itself stays stable.

### 2. HERE Blackened Steel
Use for:
- existing frames
- rails
- borders
- button housings
- navigation shells
- structural separators
- industrial trim already implied by the current design

Purpose:
Make structural black areas feel manufactured and heavy rather than like CSS rectangles.

Important:
- Steel should reveal itself through reflection, roughness, brushing, and grazing light.
- Do not turn the whole interface gray or metallic.
- Most steel should remain near-black at rest.

### 3. HERE Ruby Core
Use for:
- the existing red accent language
- active states
- selected navigation states
- line energy
- subtle status lights
- key transitions
- existing red highlights that deserve physical depth

Purpose:
Ruby is the living energy of HERE. It replaces generic flat red glow with something that feels internal, refractive, and physically embedded.

Important:
- Ruby should not become neon.
- Do not glow entire cards or entire sections.
- Activate only intended channels, inlays, seams, veins, or masks.
- Light should feel like it exists inside the material.

### 4. HERE Chrome Edge
Use for:
- existing edge highlights
- bevels
- precise separators
- selected control borders
- small hardware moments

Purpose:
Add expensive, precise grazing-light behavior.

Important:
- Chrome is an accent, not a dominant material.
- It should nearly disappear at rest and appear when light/viewing angle catches it.
- Avoid outlining everything in chrome.

### 5. HERE Signature Mark
Use for:
- the existing HERE / McCluster identity where appropriate
- hero branding moments
- splash/loading identity moments

Purpose:
Bring the logo into the same physical material system without changing the brand architecture.

Important:
- Preserve the existing brand placement and role.
- Do not rebuild the entire hero around the mark.
- Keep material layers separately addressable where possible.

### 6. HERE Ruby Power Line
Use for:
- existing dividers
- progress paths
- red line motifs
- scroll-linked accents
- connection lines between already-existing sections when it fits the current composition

Purpose:
Turn an existing red line/transition into a physical recessed energy path.

Important:
- Do not add unnecessary conduit lines everywhere.
- Use only where the current design already supports a line/divider/connection concept.

### 7. HERE Industrial Module Tile
Use only where the current experience already has a card, module, project tile, or media container that benefits from deeper material treatment.

Purpose:
Provide a physical chassis around existing content without changing the content layout.

Important:
- This is optional.
- Do not replace every section with this component.
- Preserve the existing dimensions, hierarchy, copy, and media dominance.
- HTML content remains semantic and responsive inside the material shell.

### 8. HERE Control Button
Use to reskin existing buttons and primary controls.

Purpose:
Make existing interactions feel mechanical and physical.

Important:
- Same label.
- Same action.
- Same placement.
- Same hierarchy.
- Only upgrade surface, press depth, ruby state, and specular response.
- Avoid scale-bounce toy animation.

### 9. HERE Ruby Status Indicator
Use only where the current experience actually has a status, active state, playback state, connected state, loading state, or similar semantic state.

Do not add status lights merely because the asset exists.

### 10. HERE Service Glyph System
Use to replace generic icons only where icons already exist or are clearly required by the current UI.

Do not create new icon-heavy navigation just to showcase the glyph family.

### 14. HERE Industrial Navigation Rail
**Optional and high-risk.**

Use only if the existing navigation can be visually skinned with this material idea while preserving its current information architecture and interaction flow.

Do not restructure navigation just to use this asset.

## Experimental assets that are NOT part of the current reskin

Do not introduce the following into the current pass unless the owner explicitly asks for a redesign or new feature:

- 11 Credential Plate
- 12 Media Cartridge
- 13 Ruby Token
- 15 Obsidian Loading Object
- 16 Holographic Panel
- 17 Command Console
- 18 Project Vault
- 19 Data Core
- 20 Cinematic Transition Gate

These may be useful later, but they are redesign/new-feature concepts, not required to reskin the current HERE app.

## Motion reskin rules

The existing animations and choreography should remain recognizable. Upgrade HOW they feel rather than changing WHAT the interface does.

Examples:

- existing fade -> material/light reveal across Obsidian
- existing slide -> heavy panel motion with realistic inertia
- existing red highlight -> Ruby Core illumination inside the same existing shape
- existing hover -> small grazing Chrome reflection or subtle material parallax
- existing active state -> ruby channel/inlay activation
- existing scroll reveal -> change virtual light/camera relationship across the same content

Do not turn every scroll event into a new cinematic set piece.

## Material-aware animation

Never animate an entire texture when only one physical material region should move.

Examples:
- ruby veins glow; marble does not pulse
- polished edge catches light; whole card does not brighten
- button face recesses; outer housing stays fixed
- internal ruby core breathes; surrounding steel remains stable

Use semantic masks, SVG groups, named meshes, emissive maps, normal maps, roughness maps, and separate material assignments where available.

## Responsive app rule

The current product must remain responsive and functional on phones, tablets, and desktop.

Do not sacrifice:
- readable content
- tap targets
- navigation clarity
- media playback
- existing routes
- existing scroll behavior
- accessibility
- reduced-motion support
- performance

3D/WebGL/WebGPU is progressive enhancement. Do not move the whole app into a canvas.

## Visual target

The goal is:

**the current HERE app, but it feels as if its existing interface is physically manufactured from black marble, blackened steel, precision chrome, and ruby-lit material channels.**

The user should still recognize the same site immediately.

The ideal reaction is:

"This is my same site, but now it feels expensive, dimensional, cinematic, and real."

Not:

"Where did my site go?"

## Claude work protocol

Before implementation:
1. read `docs/design/HERE_RESKIN_MAP.md`
2. inspect the existing live/app layout and current source structure
3. identify existing surfaces, buttons, navigation, cards, dividers, red accents, and animations
4. map each existing UI element to at most one or two material assets
5. produce a reskin plan without changing page architecture
6. implement the material system progressively
7. compare before/after screenshots at the same viewport sizes

Do not begin by creating new sections or replacing existing layouts.

## Acceptance test

Before calling the pass complete, answer all of these:

- Is the existing page hierarchy still intact?
- Is the existing navigation still intact?
- Is the existing copy still intact unless explicitly edited?
- Are the existing media and portfolio sections still the star?
- Did the assets enhance existing surfaces rather than create new product metaphors?
- Can a user familiar with HERE immediately recognize it as the same product?
- Did ruby remain an accent/energy material instead of taking over the screen?
- Did Obsidian/Steel/Chrome create physical depth without making the site visually heavy or unreadable?
- Are motion and 3D progressive enhancements rather than dependencies?

If the answer to the recognition question is no, stop. The work became a redesign and must be rolled back to the reskin boundary.
