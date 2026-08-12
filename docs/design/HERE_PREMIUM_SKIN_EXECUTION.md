# HERE Premium Skin Execution

## Intent

The goal is NOT to change HERE structurally. The goal is to make the existing product feel more premium by replacing generic visual assets, generic iconography, flat CSS surfaces, and flat animation with a layered material system.

The user should recognize every screen, section, control and route immediately. What changes is the finish, tactility, icon quality, optical depth, and the way motion happens inside the material.

## The six production materials

1. `HERE_OBSIDIAN_SURFACE_v2`
   - deep structural black surface
   - use on existing flat dark substrates only
   - ruby may activate only through the supplied ruby vein mask

2. `HERE_BLACKENED_STEEL_v2`
   - structural hardware/chassis material
   - use on existing nav shells, control housings, frames, rails and borders

3. `HERE_RUBY_GLASS_v2`
   - active-state and energy material
   - use anywhere the current design already uses semantic red

4. `HERE_SMOKED_GLASS_v1`
   - optical separation layer
   - use on sticky/floating UI already layered above media

5. `HERE_PRECISION_CHROME_v2`
   - micro-accent material only
   - use for rims, icon hardware, bevel catches, dividers and short specular moments

6. `HERE_OPTICAL_FILM_v1`
   - media optical layer
   - use over existing photos, video, album artwork and 360/VR surfaces without changing their crop/layout

## Premium asset replacement rule

A reskin absolutely CAN replace low-quality visual assets and generic icons. That is part of this pass.

Preserve the role and location of the existing asset, but replace the visual treatment.

Examples:
- existing bottom-nav home icon -> custom HERE home glyph in the same tab
- existing play triangle -> custom precision play glyph in the same button
- existing sound icon -> custom HERE audio glyph in the same control
- existing generic arrows -> custom chevrons with the same semantic direction/action
- existing progress indicator -> same progress behavior rendered as a ruby inset/channel
- existing avatar/control ring -> same location/function with better material treatment

Do NOT preserve weak stock-looking SVGs just because they are already there. The screen structure stays. The asset quality should improve.

## Icon system rules

All user-facing controls should be audited for generic or inconsistent iconography.

Create one coherent icon family with:
- shared stroke weight
- shared corner treatment
- consistent optical size
- consistent negative-space logic
- no mixed icon-library look
- no emoji as permanent interface icons
- no unnecessary text inside icons

Preferred master format: SVG.

Each icon should expose semantic groups when useful:
- `body`
- `edge`
- `ruby-channel`
- `highlight`

This lets the icon itself receive layered material animation instead of animating as one flat shape.

## Layered material animation architecture

This is the most important implementation rule.

A surface is NOT one texture. Treat each premium component as a stack of independently addressable physical layers.

### Example: premium button

Keep the existing button's placement, dimensions, label and action.

Build the visual skin as layers:

1. **base/housing**
   - Blackened Steel v2
   - fixed in place
   - responds only to environment/grazing light

2. **face/inset**
   - Obsidian v2 or Smoked Glass depending context
   - moves 1-3px inward on press
   - does not scale-bounce

3. **ruby channel**
   - Ruby Glass v2
   - hidden/dim at rest
   - wakes only for hover/active/pressed/semantic state
   - energy can travel through its mask

4. **chrome edge**
   - Precision Chrome v2
   - receives a narrow glint tied to pointer/scroll/light angle
   - does not glow continuously

5. **icon layer**
   - custom SVG glyph
   - body remains stable
   - optional ruby subpath or chrome edge can animate independently

6. **optical highlight**
   - short-lived specular/film response
   - used on press/activation only where it reads as physical light

### Correct animation

Pressing a button should feel like:
- face travels inward slightly
- ruby channel brightens from inside
- chrome edge compresses/disappears on the pressed side
- on release the face returns with restrained inertia
- one small reflected highlight may move across the surface

### Incorrect animation

Do not:
- scale the whole button to 0.94 and call it premium
- pulse the entire surface red
- brighten the whole card
- animate the base texture coordinates excessively
- apply generic box-shadow glow around everything

## Embedded animation by material mask

Animations should target texture/material masks directly.

Examples:
- Obsidian: animate `ruby-vein-mask`, not the marble base
- Blackened Steel: animate `grazing-light-mask` / environment light angle, not base color
- Ruby Glass: animate `active-mask`, `emissive-mask`, `caustic-mask`, or `flare-mask`
- Smoked Glass: animate reflection/Fresnel response and optical density, not the entire glass panel opacity constantly
- Precision Chrome: animate `edge-glint-mask` / environment response
- Optical Film: animate reflection, flare, edge refraction or light angle, never recolor the underlying media

If a supplied map exists for the physical feature being animated, use that map rather than animating the entire element.

## Current screen priorities

### Bottom app navigation

Keep existing tabs and routes.
Replace generic icons with a coherent HERE custom SVG family.

Suggested material stack:
- chassis: Blackened Steel
- optional top optical layer: Smoked Glass
- inactive icons: low-luminance Chrome/neutral
- selected icon/tab accent: Ruby Glass
- active indicator: ruby inset, not red background flood

### Streaming app header and pills

Keep exact structure.
- sticky backplate: Smoked Glass + subtle Blackened Steel support
- pill active state: Ruby Glass inset
- pill inactive: dark surface with tiny chrome edge catch

### Mini-player

Keep exact placement and playback behavior.
- shell: Blackened Steel
- inner optical panel: Smoked Glass
- progress: Ruby Glass channel
- play/pause and like glyphs: replace with custom SVG family
- album art: Optical Film only

### Full now-playing sheet

Keep same sheet interaction and control placement.
- background: Obsidian underneath existing color treatment
- album art: Optical Film
- primary play control: layered premium button architecture
- scrubber: ruby inset/channel
- supporting icons: custom HERE SVG set
- chrome only on high-value control edges

### Home / hero / scroll experience

Do not restructure it.
- media stays dominant
- replace generic HUD/control icons where needed
- Optical Film over video/canvas only where perceptible
- Ruby Glass for existing red accents
- Obsidian/Steel only on existing overlay structures

### 360 / VR controls

Keep the existing interaction model.
Upgrade only:
- compass/control glyphs
- motion button
- skip/down control
- status indicator
- control surfaces/material response

Do not add a new VR portal or dashboard.

## Icon audit requirement

Before visual implementation, produce an inventory of EVERY user-facing icon currently in:
- `index.html`
- `app.html`
- shared navigation/footer controls
- player controls
- 360/VR controls

For each icon, record:
- selector/location
- semantic action
- keep/redraw decision
- proposed new HERE glyph name
- material layers used

Do not mix old generic icons with new custom icons in a finished surface unless there is a deliberate reason.

## Animation audit requirement

Inventory current animation classes/keyframes/JS motion that affect:
- buttons
- navigation
- player controls
- progress indicators
- hover states
- scroll reveals
- HUD indicators
- 360/VR controls

For each, classify:
- keep as-is
- material-enhance
- replace flat effect with layered material response

Do not change scroll choreography unless specifically authorized.

## Performance architecture

Use progressive enhancement.

Baseline:
- semantic HTML
- SVG icons
- CSS masks/backgrounds
- CSS custom properties for light angle / pointer position / state

Enhanced:
- requestAnimationFrame only for active/visible elements
- IntersectionObserver to stop material animation off-screen
- pointer/device orientation values throttled and shared globally

High fidelity:
- WebGL/WebGPU only where the app already has canvas/3D/VR or where a very small isolated renderer adds real value

Never put the full interface into one canvas.

## Acceptance test

A successful pass should produce this reaction:

"Same app. Same layout. Same content. But every control, icon, surface and animation suddenly feels custom, premium and physically built."

Failure conditions:
- layout changes noticeably
- new dashboard metaphors appear
- media gets boxed in
- controls move around
- generic icons remain mixed with premium ones
- whole surfaces pulse instead of material sublayers
- ruby becomes neon decoration
- chrome becomes visually dominant
- mobile performance gets worse
