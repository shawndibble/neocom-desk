# Neocom Desk — Design System

Dark-only UI inspired by EVE Online's Photon UI (CCP, 2022+) and eveonline.com:
near-black blue-tinted backgrounds, semi-transparent layered panels, hairline 1px
borders, minimal corner rounding, azure/cyan accent, amber caution, red alert,
condensed uppercase micro-headings. Density over whitespace — this is a data tool.

Tokens live in `src/styles/index.css` (`@theme`, Tailwind v4 CSS-first config).
Live reference: hidden `/styleguide` route (`src/routes/Styleguide.tsx`). Its "Interaction grammar" section (`src/routes/styleguide/InteractionGrammar.tsx`) renders every §6c cue and state with the real primitives; add a new cue there in the same PR that adds it to §6c.

Interactive primitives (menus, selects, dialogs) are built on
[`radix-ui`](https://www.radix-ui.com/)'s unstyled components, styled to this
system's tokens rather than a component library's own defaults — `Select`,
`DropdownMenu`, `ContextMenu` (`src/components/ui/`) wrap them. Reach for a
Radix primitive before hand-rolling focus/keyboard/portal behavior for a new
composite control; icons (§5) are built to compose with it directly.

**Prefer the Radix wrapper over the platform control.** For a select that
means `Select`, always, unless you can say why this one needs the OS picker —
`NativeSelect` is the documented exception, not a peer. The rule used to run
the other way, on the argument that a native mobile picker beats a popover for
a short list. What that missed is that the choice is only invisible in
isolation: two selects side by side in one filter row look identical closed,
then open into two different-looking lists. Consistency across the app is
worth more than a better picker on one control.

## 1. Color tokens

### Background layers (darkest → lightest)

| Token     | Value     | Use                                                                                                  |
| --------- | --------- | ---------------------------------------------------------------------------------------------------- |
| `bg`      | `#0a0e14` | App/page background.                                                                                 |
| `panel`   | `#11161d` | Panel/card surface. Use `bg-panel/85` + `backdrop-blur-sm` for the Photon "glass" look over imagery. |
| `panel-2` | `#161d27` | Raised layer on a panel: table header rows, hover rows, chips, inputs, active tab fill.              |

### Lines

| Token         | Value     | Use                                                                                                                                                                                      |
| ------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `line`        | `#2a3442` | Default hairline. Always 1px. Panel borders, table row separators, dividers.                                                                                                             |
| `line-bright` | `#586c86` | Hover/focus-adjacent borders, emphasized separators, and every field's resting border (3.15:1 against `panel-2` — `line` itself is only 1.35:1, below the 3:1 floor for a visible edge). |

### Text hierarchy

| Token        | Value     | Use                                                                                                                    |
| ------------ | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| `text`       | `#dee7ee` | Primary content, values, numbers.                                                                                      |
| `text-dim`   | `#95a3b4` | Labels, secondary copy, panel headings, table headers.                                                                 |
| `text-faint` | `#5c6b7a` | **Decorative only** (disabled hints, tick marks, watermark glyphs). Below 4.5:1 — never for content someone must read. |

### Accent + status

| Token             | Value     | Use                                                                                                                                       |
| ----------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `accent`          | `#57c7f4` | Interactive: links, primary buttons, active tab underline, selection, focus rings, progress.                                              |
| `accent-dim`      | `#2e7da3` | Accent-tinted borders/fills where full accent is too loud (e.g. selected row border). Not for text.                                       |
| `accent-contrast` | `#04181f` | Text/icon color **on** accent fills (primary button label).                                                                               |
| `selection`       | `#276c8d` | `::selection` fill only — a darkened `accent-dim` so highlighted `text` clears 4.5:1 (`accent-dim` itself is too light for that pairing). |
| `success`         | `#5fd584` | Positive status: training active, order filled, "fresh data".                                                                             |
| `warning`         | `#f5b94a` | Caution: stale data, low skill, expiring booster; a fitting's overheated values.                                                          |
| `danger`          | `#ff7369` | Errors, destructive actions, failed fetch.                                                                                                |

### ISK / market deltas

| Token     | Value     | Use                                              |
| --------- | --------- | ------------------------------------------------ |
| `isk-pos` | `#4fd98a` | Positive ISK amounts, profit, buy < sell margin. |
| `isk-neg` | `#ff8177` | Negative ISK amounts, loss, fees.                |

Distinct from `success`/`danger` so status badges and money never read as the same
signal in one table. Always pair sign or +/− prefix with color (color-blind safety).

### Chart series

| Token                | Value     | Use                                                  |
| -------------------- | --------- | ---------------------------------------------------- |
| `series-order-count` | `#e9a13b` | Daily order count on the Market Price History chart. |

**One token, and it should stay one.** Every other series in that figure borrows
a colour it already owns — price is `accent`, the range band `accent-dim`, the
volume bars `line-bright`, the moving average `text-dim` plus a dash. The order
count had nothing honest to borrow: `warning` would make a data series read as
an alert about the data, and a clock kind (below) names where a _deadline_ came
from, so reusing one would give a single hue two meanings. It sits clear of
`warning` on the orange side and of `kind-industry-job` on the saturated side.

A second entry here is the start of the parallel palette this section forbids —
so before adding one, try telling the new series apart by **form** instead:
dashed against solid, bars against a line, its own strip.

### PI Map what-if

| Token        | Value     | Use                                                                                                                                                     |
| ------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `map-whatif` | `#ff79c6` | The PI Map's "what if I add a planet" highlight: the products and wires a planet type you do not have would unlock. Always with a "+" marker and words. |

One meaning only. It is never a status, never interactive, and never the only signal: the tile
carries a "+" and the accessible name says "unlocked by a Lava planet".

### Plan a move pickups

| Token                   | Value                                   | Use                                                                                                                                                                                                                              |
| ----------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pickup-1` … `pickup-4` | `#6ea8fe` `#b79cff` `#4fd1b5` `#f08fb8` | Plan a move: one hue per pickup location, shared by its rail dot, its slice of the split bar and the picker footer bar. Nominal identity only; the location's name is always written beside it. Slots repeat in order past four. |

Never a status, never interactive. A fifth location reuses the first hue, so the name carries the identity.

### Clock kinds — the one nominal palette

| Token                    | Value     | Use                                     |
| ------------------------ | --------- | --------------------------------------- |
| `kind-calendar-event`    | `#7e9cfd` | Calendar events on the Coming Up board. |
| `kind-skill-training`    | `#d8beff` | Skill-queue completions.                |
| `kind-industry-job`      | `#e59a55` | Industry job deliveries.                |
| `kind-planet-extraction` | `#6fdecd` | PI extractor program ends.              |
| `kind-moon-chunk`        | `#a0a8b8` | Moon chunk arrivals and decays.         |
| `kind-contract-expiry`   | `#f2879f` | Contract expiries.                      |
| `kind-order-expiry`      | `#c9d96a` | Market-order expiries.                  |
| `kind-skill-plan`        | `#e0d0a8` | Projected Skill Plan steps (outlined).  |

Every other color scale in this app is **ordinal or semantic** — `securityStatusColor`
is a position on a numeric scale, `STANDING_TONE` and the severity ladder are
magnitudes. These eight are **nominal**: no order, no magnitude, identity only. They say
which part of the app a deadline came from, and they are read by
`src/components/ui/kindTone.ts` (`KIND_FILL`, `KIND_TEXT`).

- **Other categorical series borrow these tokens**, as the Net Worth layers and the D-Scan
  Fleet board's roles do (their legends name each one), instead of minting hues.
- **This is meant to be the app's only nominal set.** The next categorical thing that
  genuinely needs color extends these tokens rather than minting a parallel palette —
  the fork is the failure mode the Mail decision named when it refused per-folder hues.
- Every hue sits **≥ 20 ΔE from `accent`, `success`, `warning` and `danger`**, so a
  category can never be mistaken for a status tone. Check that distance before adding
  or changing one.
- **Color is never the identity on its own** (§7). Each of these appears next to the
  kind's own glyph or its written name — the filter menu carries a swatch beside every
  label and is the legend for the whole set.

### Security status

`securityStatusColor(security)` (`src/engine/securityStatus.ts`) colors a solar
system's security status on the game client's own scale. Highsec runs
`warning` yellow at 0.5, through `success` green at 0.7, to `accent` blue at
1.0. Lowsec is orange, a point partway along `warning`→`danger` that deepens
from 0.4 to 0.1 without reaching red. Every nullsec system (0.0 and below) is
flat `danger` red. The steps at 0.5 and 0.0 are deliberate — they mirror the
game's own band boundaries, not an interpolation artifact.
Computed, not a fixed token set: call the function rather than hand-picking a
color, and always render the numeric value (`0.9`, `-0.3`, …) alongside the
color — colour is never the only signal (§7).

### Kill heat

`shipKillHeatColor(kills)` (`src/engine/route/killHeat.ts`) tints Route
Safety's last-hour ship-kill count: default text at none, blending to
`warning` yellow at 3, orange (halfway along `warning`→`danger`) at 6, and
`danger` red from 10. Any pod kill in the last hour is `danger` red outright.
Computed like `securityStatusColor`; the count is always printed beside the
color (§7).

### Kind of space

| Token            | Value     | Use       |
| ---------------- | --------- | --------- |
| `success`        | `#5fd584` | Highsec.  |
| `warning`        | `#f5b94a` | Lowsec.   |
| `space-nullsec`  | `#7e9cfd` | Nullsec.  |
| `space-wormhole` | `#d8beff` | Wormhole. |

Nominal identity for where a kill happened (a pilot's kill chart and counts, the Local list). Red is not
one of them: `danger` stays on the Threat verdict, so nullsec cannot be mistaken for it. The space name
is always written beside the colour. `space-nullsec` and `space-wormhole` share their hex with
`kind-calendar-event` and `kind-skill-training`, so those rows' contrast ratios apply.

### Ratio meters

`ratioMeterColor(pct)` (`src/engine/pilotList/meterColor.ts`) fills the Danger, Fleet size and Kills vs
losses meters: gray at 0, muted blue at 22, sage green at 42, soft yellow at 60, muted orange at 80 and
a dusty red at 100, blended between. Every stop is desaturated so the Threat verdict stays the loudest
red on the profile, and nothing warm shows until a value passes about half. The readout beside the
fill is plain `text`, and the figure is always printed, so colour is never the only signal.

### Ore value ramp

`oreValueTiers` (`src/engine/survey/valueTier.ts`) colours the Mining Survey's
ore bars by unit price, between the cheapest and dearest ore on the field
(dearest always orange, cheapest always gray when more than one price): gray
(`line-bright`), blue (`accent`), yellow (`warning`) and orange (halfway along
`warning`→`danger`), dearer left to right. It borrows Kill heat's yellow and
orange rather than adding tokens. The ISK and percent are printed beside every
bar, and a legend line names the ramp (§7).

### Damage types

| Token           | Value     | Use                          |
| --------------- | --------- | ---------------------------- |
| `dmg-em`        | `#4f9fe8` | EM damage and resist.        |
| `dmg-thermal`   | `#e0524a` | Thermal damage and resist.   |
| `dmg-kinetic`   | `#a3adb8` | Kinetic damage and resist.   |
| `dmg-explosive` | `#e8a13d` | Explosive damage and resist. |

A second nominal set, and a deliberate exception to the clock-kind rule above.
These colours belong to the game rather than to this app. Every EVE player
reads blue, red, grey and orange as EM, Thermal, Kinetic and Explosive on
sight, so recolouring them to keep clear of the status tones would cost more
than the clash does. That's the same reasoning that lets security status
follow the game's own scale. `dmg-thermal` sits close to `danger`, so:

- Use them only for damage types: resist bars, damage profiles, damage
  breakdowns. Never for status, and never for anything else that happens to
  come in fours.
- Always pair each one with its written type name or its percentage (§7). A
  resist bar prints its number, and a legend names the four.
- Where a red means "over budget" or "can't use", it is `danger` on its own
  element, never a damage-type fill.

Added with the Fittings section — see
`docs/context/decisions/20260924-150509-fittings-section-a-fitter-after-all.md`.

### Ship Tree (ISIS)

| Token           | Value     | Use                                                    |
| --------------- | --------- | ------------------------------------------------------ |
| `mastery-elite` | `#e8b84a` | Mastery V, and nothing else: tile, badge, dot, legend. |
| `omega`         | `#d9a72c` | The Ω "needs an Omega clone" mark, and nothing else.   |

The Ship Tree (Ships › Tree) is a replica of the in-game one (ISIS), drawn
from in-game screenshots — a game-art surface, and a documented exception to
this palette and to §3 and §6, for the same reason as damage types: players
read it as the game draws it. The exception covers
`src/features/fittings/shipTree/shipTree.css` and the surfaces it styles —
the map, its tiles, lines and hover card, and the ladder's tiles — and
nothing else. There it allows:

- The game's own palette, as raw values in that one file, not app tokens.
- Hard-stop `linear-gradient` corner brackets on tiles and the map's 1px
  grid — drawings, not fades (see §6).
- A `radial-gradient` mask that feathers each hull render into its tile.
- The Mastery V tile's gold glow (`box-shadow`), the class label's
  `text-shadow`, and the Mastery badge ring's 1.5px border.

The two golds are tokens because the app chrome around the tree (the Ship
Info window, the legend, search results) carries the same marks. Outside
`shipTree.css`, only those two tokens come from the game; everything else is
the app's own. Always pair them with a written label — "Mastery V", "Needs an
Omega clone" (§7). Scope decision:
`docs/context/decisions/20260926-135538-fittings-ship-tree-tab-and-ship-info-window.md`.

### Blueprints

| Token            | Value     | Use                                                      |
| ---------------- | --------- | -------------------------------------------------------- |
| `blueprint-copy` | `#ea86ea` | The **BPC** badge on Assets item rows, and nothing else. |

Its **BPO** sibling is plain `accent`, the convention Industry's owned
blueprints already use. A copy needed a hue of its own: grey read as "no
kind", and every existing token already means something — a clock kind or a
status tone would give one hue two meanings. It sits ≥ 34 ΔE from every other
colour token and at 7.3:1 on `panel-2`. Always paired with the written "BPO"
/ "BPC" label (§7).

## 2. Typography

No bundled fonts, no new deps — system stack approximating EVE's condensed sans
(Shentox / Eve Sans Neue):

- `--font-sans` / `--font-display`: `'Segoe UI', Roboto, 'Helvetica Neue', Arial, ui-sans-serif, system-ui, sans-serif`

Rules:

- Micro-headings (panel titles, table headers, tab labels, buttons): uppercase,
  `text-xs` or `text-[0.6875rem]`, `font-semibold`, `tracking-widest` (approximates the
  condensed EVE feel via letterspaced small caps rather than a condensed face).
- Body/data: normal case, `text-sm` default.
- Numbers (ISK, quantities, SP): `tabular-nums`, right-aligned in tables.
- Type scale, at the 16px browser-default root: `text-[0.6875rem]` chips/badges ·
  12px `text-xs` labels/headers ·
  14px `text-sm` body/data (default) · 16px `text-base` emphasized values ·
  20px `text-xl` page titles · 30px `text-3xl` hero numbers only. Written in
  `rem`, never `px` — a literal `text-[11px]` would not scale with the root
  and inverts the hierarchy against its `rem` neighbours. The root itself is
  user-adjustable: Settings' text-size control (`useFontScale`,
  `src/lib/fontScale.ts`) sets `<html>`'s font-size as a percentage, so this
  whole scale — and the rem-based spacing scale alongside it — grows or
  shrinks together rather than just the text.

## 2b. Brand assets

Sources live in `assets/brand/` (not shipped). Most of `public/icons/` and
`public/brand/` is generated — edit the sources and rerun
`python3 scripts/generate-brand-assets.py`, never hand-patch the output. The
script writes exactly `icon-192`, `icon-512`, `icon-512-maskable`,
`apple-touch-icon-180`, `favicon.ico` and `brand/lockup.png`.

Two files in that directory are **not** generated and are the exceptions to the
rule above — rerunning the script will not update them, and it will not
clobber them either:

- `favicon.svg` is hand-drawn vector, because a raster favicon cannot carry
  `prefers-color-scheme` or scale to whatever size a browser asks for.
- `badge-96.png` is a hand-drawn silhouette of the mark's own positive
  space -- the hull hexagon as a ring, a solid star inside it, everything
  else punched out -- rather than a filled shape with the star cut from it
  (see `notificationOptions.ts` for why it drops the diamond and the corner
  traces).

Both are drawn from `logo-mark.png`'s geometry, so a change to the artwork's
shape has to be carried into them by hand.

- `LogoMark` (`src/components/ui/`) is the mark for UI use: inline SVG, corner
  brackets on `currentColor` so `--color-accent` drives them. Simplified from
  the artwork, because the bevels and glow read as dirt below ~64px. Its path
  data is shared with `favicon.svg` — the same mark must not differ between
  the tab strip and the app, so the two files change together. `favicon.svg`
  is where the geometry is documented: which numbers are measured off the
  artwork (the shape) and which are deliberately heavier than it (the stroke
  widths, tuned so the mark survives a 16px tab strip).
- `public/brand/lockup.png` is the full mark-plus-wordmark artwork. Unused by
  any route today (the login page now uses `LogoMark` plus the text wordmark,
  like everywhere else) but kept for future marketing use — it is still the
  one place the wordmark exists as art rather than as text, which is why the
  rule above still holds: no font is bundled.
- App icons carry an opaque `--color-bg` plate, the mark at 78% of the canvas.
  All of them centre on the hexagon, never on the artwork's bounding box: the
  glow pools under the bottom vertex, so the box reaches further down than the
  mark does and centring it sits the hexagon high and right.
- The maskable variant is sized against the mask's safe circle (80% of the
  canvas) rather than the square edge, at 98% of its radius — the constraint a
  launcher actually applies is radial, and fitting the hexagon's circumradius
  to it fills the cropped icon under any mask shape without a corner being
  bitten. Only the glow spills past, which is what a glow does anyway.

## 3. Spacing & radius

- Spacing: Tailwind v4's default `rem`-based scale (`--spacing: 0.25rem`;
  not overridden by this project's `@theme` block, which only sets
  colors/fonts) — sizes below are the values at the browser-default 16px
  root and scale with it. Dense defaults — panel padding `p-3`, table cell
  `px-3 py-1.5` (header `px-3 py-2`), control heights `h-7` (28px, compact) /
  `h-9` (36px, default). `DataTable`'s `density="compact"` option tightens
  both to `px-2 py-1`, for tables embedded in already-dense surfaces (e.g.
  the build-plan materials table inside a `Panel`).
- Touch tier: `h-11` (44px) on a touch viewport — below `md` _or_ on a coarse
  pointer (`@custom-variant touch (@media (pointer: coarse))` in `index.css`),
  so a touch tablet or laptop keeps it at every width (`md:h-7 touch:h-9`; the
  `touch:` variant is declared after `md:` and wins above it). `h-7`/`h-9` are
  mouse-pointer sizes (WCAG 2.2's 24px floor with room to spare, not a thumb
  target) and reusing them on a phone is what made early drafts of the Assets
  page hard to tap. So the scale is **`sm` = `h-9 md:h-7 touch:h-9`, `md` =
  `h-11 md:h-9 touch:h-11`** — pointer users never get the 44px box, touch users never get the
  36px one.
  **Exception: a link inside a dense identity block stays text height.** The pilot
  profile's header (corporation and alliance, the zKillboard link) is three tight
  lines beside a portrait; a 44px box around each link spread them apart and
  hid the portrait's neighbours more than it helped a thumb. They keep the
  text line (`#2520` first gave them 44px; this reverses that). It is an
  exception for that header, not for a link in a table row or a button, and
  it holds on a coarse-pointer tablet as much as on a phone. It stays inside
  WCAG 2.5.8: the corporation and alliance are links in a line of text, which
  the criterion exempts, and the zKillboard link sits a `gap-x-3` away from
  its neighbours.
- **The scale lives in one file.** `src/components/ui/controlStyles.ts` holds
  it, and every interactive control reads from it: `Button`, `IconButton`,
  `FilterChip`, `TextInput`, `SearchInput`, `NativeSelect`, `SelectTrigger`.
  A toolbar built from a single `size` value therefore lines up by
  construction. Never hand-write `h-6`/`h-8` on a field — those are what this
  replaced, and they are why a `Select` used to sit taller than the
  `Button size="sm"` beside it. `StatChip` and `DataAgeBadge` are the
  deliberate exception at a flat `h-7`: readouts, not targets, so they keep
  a control's height (to sit level beside one) without its box.
- A control that would otherwise get `md` for its own sake (a primary
  action, a pin/target toggle) but sits paired beside an `sm` control in the
  same small toolbar — Market's `ItemPriceAlertBell` next to its Info
  `IconButton` — takes `sm` too. Two adjacent icon buttons at different
  heights reads as a layout bug before it reads as an intentional touch-target
  choice, and the mismatch is more visible than the few extra millimeters of
  target size. Prefer this only where the controls sit in the same visual
  row and the sibling's own size wasn't itself an oversight.
- Radius: **minimal**. `rounded-xs` (2px) for panels, buttons, chips, inputs.
  `rounded-full` only for avatars, dots, spinners. Never `rounded-md`+ on rectangles.
- Borders: always 1px (`border`), never 2px. The one exception is a **state
  stripe** — the 2px edge that marks an active tab (`tabItemClassName`'s
  `border-b-2`), a grouped order's severity (`OpenOrdersPanel`'s
  `GROUP_ACCENT`) or the selected mail (`Mail.tsx`). Those are not the box's
  border; they are a selection marker that happens to be drawn as one, and at
  1px they disappear into the hairlines around them.

## 4. Component inventory

Built in `src/components/ui/` (✓) or planned (○):

| Component                                  | Status | Purpose / usage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Panel`                                    | ✓      | Base surface. Optional uppercase title header + `actions` slot; the header carries a `panel-2` fill and sits at the `md` control height, so it reads as the panel's own toolbar and anchors a flush table to the frame. Beside the title, `meta` holds the panel's one-line read — a count, a total, a countdown, or the one control that names _whose_ data is being read (the Character filter), which is what keeps a folded panel legible. `leading` holds a control belonging to the title itself. Controls in `actions` are `size="sm"`; a route's `PageHeader` actions keep the default size. Everything lives in a Panel; don't nest Panels — use `panel-2` fills inside.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `Button`                                   | ✓      | `primary` (accent fill — max one per view), `ghost` (default; hairline border), `accent` (accent outline, no fill — marks the one control an empty view is waiting on, e.g. Payees on an empty Mining Tax tab), `danger` (destructive; outline red, never filled). Sizes `sm`/`md`. `align` is `center` by default; `start` is for a full-width button stacked in a column (the Skill Plan tools sidebar), where centred labels of differing lengths leave the leading icons jagged. It has to be a prop rather than a class override — see the JSDoc on `Button.tsx` for why. States come from the shared recipe in `controlStyles.ts` (§6c): 120ms colour-only transition, a pressed step darker than hover per variant, 2px outset focus ring, `opacity-40 cursor-not-allowed` for `disabled` and `aria-disabled` (no `pointer-events-none`, so a disabled Button's tooltip opens; an `aria-disabled` click does nothing). `loading` lays a `Spinner size="sm"` over the label (the label keeps its width, so nothing shifts), sets `aria-disabled` and `aria-busy`, and ignores clicks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `StatChip` / `StatChips`                   | ✓      | Tiny static label+value readout (ISK balance, SP, data counts): an uppercase dim micro-heading label, then the value in `font-medium`. No border and no fill — a box means clickable (§6). Tones colour the value: default/accent/success/warning/danger. Two or more chips go in a `StatChips` strip, which owns the spacing and draws a short `line` hairline between neighbours; the chip that starts a line, first or wrapped, never shows one. Keep controls out of the strip (they'd get a divider too): put them beside it in the parent row. Fixed height, so the chip never shrinks or wraps its own text: the strip wraps and whole chips move to the next line. `tooltip` adds an `InfoTooltip` after the label: "?" explains the label's term; `tooltipGlyph="info"` draws an "i" for a note on the value (the Skill Plan header's Remap savings, when What-If Implants shrink it). Don't reach for `flex-nowrap` + `overflow-x-auto` to keep a strip on one line — a hidden horizontal scroller loses stats the user has no reason to go looking for.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `DataAgeBadge`                             | ✓      | Relative age of API-derived data ("12m ago"). Required on every ESI-backed view — but hidden below `md`: on a phone-width header it crowds out the title and actions, and Settings' Data Age tab lists the same information for every view at once. Auto-tones: <1h dim, 1–24h warning, >24h danger. The absolute timestamp (and any `note`) is a `Tooltip` on a focusable `<time>`, tap-to-open on touch; no dotted underline, the dot and age are the cue. `tooltip={false}` renders plain text for a badge inside a button (`Disclosure` `trailing`), where it loses the timestamp.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `EmptyState`                               | ✓      | Centered title+hint+optional action for empty lists / not-yet-fetched views. Never show a bare empty table. A filtered-to-zero state (a non-search filter is active and can be the cause) puts a `Button size="sm"` labelled `common.resetFilters` in `action`; search-only lists omit it, the search box is the way out. A small card inside a grid of cards (the corp board's Kind Cards) is not a list view: its empty state is one dim `<p className="px-3 py-2.5 text-xs text-text-dim">` sentence, so an empty card stays short.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Tabs`                                     | ✓      | Controlled horizontal tab bar, accent underline on active. For peer views within a page (e.g. Orders: Open / History). Not for navigation — that's the router. The bar scrolls sideways rather than squeezing when it outgrows its frame, and `Tabs` scrolls the selected tab into view when the selection changes from outside it (a deep link). The scroller is a wrapper around the tablist, never the tablist itself: the active item's `-mb-px` hangs 1px past the bar to cover the baseline, and a scroll container clips exactly that. Real `NavLink` sub-navigation borrows the same classes from `components/ui/tabStyles.ts` — `tabScrollerClassName` around `tabListClassName` — so the four bars cannot drift apart again; a sub-nav gets the scrolling, not the scroll-into-view, which has no selection to react to. Pressed `active:` fill, inset focus ring, shared recipe transition. A page with four or more tabs (counted on the full list) shows `PageViewPicker` in its `PageHeader` title row instead of the strip below `sm` (`PageHeader`'s `views` prop; the page drops its strip with `usesViewPicker`). **Linked to its panel (a11y):** `Tabs` requires `tabsId` (from `useTabsId()`) and `label` (the tablist's accessible name). The selected tab gets `aria-controls` pointing at the panel; the content region must be rendered with `<TabPanel tabsId tabId>` — or, where an extra wrapper `<div>` would disturb a flex/grid/`space-y` parent, `useTabPanelProps(tabsId, tabId)` spread onto the existing container (merge its `className` with `cx`). The panel is `role="tabpanel"`, named by its tab (`aria-labelledby`), `tabIndex={0}`, and carries the shared inset focus ring (`focusRingInsetClassName`, keyboard focus only). Inactive tabs have no `aria-controls`, since their panel is not rendered. When tab bar and content live in different components, pass `tabsId` down as a prop.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Spinner`                                  | ✓      | Accent arc, sizes sm/md/lg. Inline or centered while loading; prefer skeleton-free simple spinner + DataAgeBadge of last cached data. When a route may show one, and where it may sit, is §6a. `delayMs` holds the arc back (same-size `aria-hidden` placeholder, no `role="status"`) for a load usually served from cache that can still go to the network, so a warm open never flashes one; ~200ms, beside visible loading text. Under `prefers-reduced-motion: reduce` it turns at half speed rather than stopping, since it carries status.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `Tooltip`                                  | ✓      | Accessible hover/focus tooltip (`role="tooltip"` + `aria-describedby`) around a single focusable trigger. Radix-backed (ADR 0008): collision-aware placement flips/shifts to stay on-screen and portals to `document.body`, so it's never clipped by a viewport edge or a scrolling ancestor. The bubble is `max-w-56` with no fixed width: it shrink-wraps its text and only wraps past 14rem, so a one-word tooltip is one word wide. `content` is usually a string; a node is allowed for the rare bubble that must lead with something the reader cannot miss (the industry materials table's make-or-buy verdict is bold over its reasoning), never to lay out a panel — 14rem of undismissable, unscrollable hover is the wrong home for a list, and on touch it is only reachable by long-press. `InfoTooltip` variant renders a small "?" button for labeling jargon (ME/TE, EIV, SCC, cost index, Remaps available, StatChip's `tooltip` prop) — a 16px circle in a button that is itself 24px (WCAG 2.5.8 and §3's floor; never a pseudo-element hit area), its `-m-1` margin keeping a 16px footprint so layout doesn't change and it never overlaps a neighbouring control (`HistoryViewSelect` sits one `gap-1` away). On touch the bubble is revealed by a touch-and-hold, or by a plain tap under `openOnTap` — set that on any trigger whose only job is explaining (`InfoTooltip` is tooltip-only and always sets it; a trigger that opens a dialog is an ⓘ `IconButton`), never on one whose tap already does something. A click on the trigger and a blur always close the bubble, whatever Radix last rendered: Radix's controlled state drops a close that matches its stale `open`, so an open and a close in one tick (a modal handing focus back and taking it again) left the PI settings gear's bubble over its modal, eating the first Escape. A touch-revealed bubble has no timeout: it stays up until a tap outside, a scroll, Escape, or another tap on the same `openOnTap` trigger. Touch-and-hold belongs to one thing at a time: inside a row menu (`RowActionsMenu`, whose context menu Radix also opens on a long-press) `TooltipHoldContext` turns the hold reveal off for every tooltip in the row, so a hold on a row's ⋮ or remove button opens the menu alone, and a hold inside a row menu never shows a tooltip. There is no per-trigger override. Outside a row menu a hold on an `IconButton` or `FilterChip` shows its label; the hold is 700ms with a 10px slop, matching Radix's context menu. `IskAmount` is tap-reveal everywhere except inside a tappable row: A hand-built clickable row (not a `DataTable`) wraps its content in `RowTappableContext.Provider value` itself. `DataTable` provides `RowTappableContext` to the body cells of a row with `onRowClick` only (not the header, group headers, expansion content, or an expand-only row; `Modal`, `SlideOver` and `Popover` reset it), and there the tap opens the row (exact value in its detail) while hover and focus still show the bubble. `IskAmount` is a tab stop. On a dense surface (the PI Plan panels) wrap its figures in `IskFigureGroup`: one tab stop per group, arrow keys / Home / End between figures (roving tabindex), each still revealing its exact value on focus. A screen reader gets the exact figure as text either way. |
| `ExternalLink`                             | ✓      | A link that leaves Neocom Desk (§6c): `<a target="_blank" rel="noopener noreferrer">` with a trailing `Icon.External` (Phosphor `ArrowSquareOut`, about 0.85em, `aria-hidden`) and a visually hidden "(opens in a new tab)". `variant="inline"` (default) is `inlineLinkClassName`; `variant="quiet"` is a footer link (text colour, underline on hover). `ExternalMark` is the icon plus hidden text on its own, for a `Button` that calls `window.open` (Add to Google Calendar). The only place `target="_blank"` is written; a same-origin page (the privacy page) is a plain same-tab `<a>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `HintText`                                 | ✓      | Text with a tooltip (§6c): a focusable `<span>` with a dotted underline (`decoration-current/70`, `underline-offset-2`, `cursor-help`) inside a `Tooltip` with `openOnTap`. Tone and type come from `className`; the underline follows the text colour. `desktopOnly` limits the cue and the tap to `sm` and up, for a name that only truncates there. A trigger that opens a popover on click is not this: it is field chrome with a trailing `CaretDown`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ChartTooltipShell`                        | ✓      | The bubble around a recharts hover readout: the same surface, text and padding as `Tooltip`'s bubble (`border-line bg-panel p-2 text-[0.6875rem] text-text-dim shadow-lg`), plus `tabular-nums`. Titles and figures that should stand out say `text-text`. Every chart's tooltip content uses it; `features/chartTooltipShell.test.ts` guards that.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `Modal`                                    | ✓      | Native `<dialog>` + `showModal()`. Platform-supplied focus trap, inert background, Escape-to-close and `::backdrop` — never hand-roll a focus trap. `placement="center"` (default), `"sheet"` (bottom-anchored, mobile nav) or `"wide"` (`max-w-5xl`, for multi-column content such as a comparison matrix). Escape, backdrop click and Back all close it; Back works because `useOverlayHistory` (`src/lib`) gives every open `Modal` one state-marked history entry that any other close removes again (`closeOnBack={false}` opts out for a modal already backed by a URL, such as the `info` param). A `sheet` / `sheet-full` also has a decorative grabber and swipes down to dismiss (a drag of the grabber or header past 80px, or a fast flick; reduced motion snaps with no animation), and pads its bottom by `env(safe-area-inset-bottom)`. Closing returns focus to what held it at open; `returnFocusFallback` names where it goes when nothing did or that element is gone (a sheet a link on another tab opened: the PI product drawer focuses the product on the map).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `SlideOver`                                | ✓      | Non-modal panel over one edge of the page (Radix `Dialog`, `modal={false}`): no backdrop, nothing inert, an outside click never closes it — Escape, its close button or Back do (it adopts `useOverlayHistory`, and pads its bottom edge by `env(safe-area-inset-bottom)`). `closeOnBack={false}`, as on `Modal`, only for a panel a URL already backs (the PI Map's `?product=` drawer), so Back pops that entry instead of a second one of its own. For a panel the page behind must keep steering, such as the Fittings module browser (the Ring retargets it; items drag out of it onto the Ring). `side` left or right. Opening focuses the panel itself (never the Close button, whose tooltip would open on that programmatic focus and eat the first Escape); closing returns focus to whatever held it when the panel opened, when that is still on the page, else to `returnFocusFallback` when given (as on `Modal`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `DataTable`                                | ✓      | Dense table: hairline-underlined uppercase header row (no fill — matches every shipped table), hairline row separators, tabular-nums right-aligned numerics, row hover `panel-2`. No empty branch — callers branch to `EmptyState` themselves. Sorting is opt-in per column via `sortValue`: a column that declares one gets a clickable header (`aria-sort`, ascending/descending toggle, missing values sink to the end); a table that declares none behaves exactly as before. Below `sm` a table whose rows are records read as a unit collapses into labelled cards (a table read across its columns, such as a compare table or roster, stays a table: `responsive="table"`, shedding low-value columns with `phoneHidden`, only when the table has no Columns menu: with one, those columns start unticked on a phone via `useColumnVisibility`'s `phoneOffByDefault` and ticking one shows it) — see §4a. `exportable` (usually spread from `useTableExport(...).tableProps`) makes every row menu grow an "Export table" submenu — or, with no row menus, gives the table a right-click menu of its own — exporting the rows in on-screen sort order. The table-level export menu is not a row menu (§6c) and stays where export is genuinely useful; a read-only or ledger display table where export means nothing does not set `exportable`. `selectedRowKey` marks the one selected row: `aria-current="true"` plus `selectedRowClassName` (`controlStyles.ts`: a 2px accent left border drawn as a real border so it survives forced colours, a `panel-2` fill, an accent primary-cell label), on table rows and phone cards alike; hover only fills, so it never reads as selected. A touch held for the context-menu delay (700ms) swallows the click that follows on lift (`liftAfterHold.ts`), so a row's long-press menu never also opens the row. `rowClickable(row)` opts single rows out of `onRowClick` (no pointer cursor, tab stop or Enter/Space), so a row that can't open anything never looks clickable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `TableActionsMenu` / `TableExportProvider` | ✓      | Every data table's export, one way in: the `TableActionsMenu` in the table block's title bar (Panel `actions`, a section heading row, PageHeader actions). Export is a menu's only job there, so it is a download-icon button ("Export {name}") opening **Download CSV / Download Excel (.xlsx) / Copy for Google Sheets / Excel** directly (`ExportTableItems`); a table with no row menus gets the same flat items on right-click. Only a menu with other actions nests them in an **Export table ▸** submenu (`ExportTableSub`): the row menus `DataTable`'s `exportable` appends it to, and a `TableActionsMenu` given `children` (which then shows ⋮, or, with `triggerText`, a labelled button: grid icon, the word, caret: a page's named Tools menu). Wire both from one `useTableExport({ surface, rows, columns })`. A list that isn't a `DataTable` (a virtualized list, a raw `<table>`) wraps its rows in `TableExportProvider` so their `RowActionsMenu`s get the submenu too. Replaces per-surface "Export CSV" icon buttons — never add one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `CharacterAvatar`                          | ✓      | ESI portrait, `rounded-xs` (house radius, §3), 1px `line` ring; sizes `sm`/`md`/`lg`; accent ring when selected. Decorative by default — pass `alt` only for standalone use.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `Fields`                                   | ✓      | Labelled controls lined up as a label column and a control column, with a hint under the control (§6, "Stacked controls line up"). `variant="compact"` (stats column) or `"form"` (Settings panels; stacks below `lg`). Each `Field` row is a subgrid, so a hairline runs across it and a stacked row keeps its label, control and note together. `htmlFor` makes the label a real `<label>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `FilterBar`                                | ✓      | A page's filter row: search box, view `actions` (a table's column picker) and one funnel trigger, on one line at every width. The funnel reveals the filters — a box under the row on a pointer viewport, edits committing immediately; a bottom sheet below `md`, edits a draft committed with Apply or dropped with Cancel. Scrim, Escape, the close button and Back with a changed draft ask "Discard filter changes?" (Keep editing / Discard) inside the sheet, never `window.confirm`; Cancel always discards. The Apply bar is padded by the safe-area inset. Filters are written once, as `children(draft, setDraft)`, so the two surfaces cannot drift. `FilterField` captions a control in the sheet only. `actions` never goes in the draft; its controls act immediately. Every searchable table uses it, with its column picker in `actions` — see §4b.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `FilterChip`                               | ✓      | Toggleable filter pill. `StatChip`'s height, but interactive, so it keeps the chip box: a real `<button>` with `aria-pressed`, accent when on, optional trailing count. `tooltip` explains a rule the label has no room for — which rows the filter removes, or why a disabled chip is inert; it wraps the chip's own `<button>` in a `Tooltip`, so it arrives as `aria-describedby` and the visible label stays the accessible name. A chip that is `disabled` _and_ carries a `tooltip` reports `aria-disabled` rather than the native attribute: a natively disabled button takes no hover and no focus, so the bubble explaining why it is inert could never be read by either route. The click does nothing either way. `openOnTap` is deliberately off: the tap toggles the filter, so touch reads the bubble by touch-and-hold (outside a row menu; inside one the hold is the menu's and shows nothing). A hand-built toggle chip — one that needs content `FilterChip` can't carry, like Skill Compare's avatar-and-spinner character chips or the Ship Tree's `FactionBar` emblems — takes its on/off state tint from the shared `toggleChipStateClassName(selected)` in `controlStyles.ts` rather than spelling the classes out, so it can't drift from `FilterChip`. An "on" chip takes a stronger accent tint on hover; pressed is a step darker; disabled is `opacity-40 cursor-not-allowed` for `disabled` and `aria-disabled`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `SegmentedControl`                         | ✓      | Pick exactly one of 2–4 views: one joined `role="group"` of `aria-pressed` buttons, selected segment in `FilterChip`'s accent tint, height from the control scale via `size` (`md` default; `fill` stretches it; `uppercase={false}` for unit labels like `30d`). Use it instead of `FilterChip` when exactly one option is always on (a chip toggles a filter independently), instead of `Tabs` when it switches a view inside a panel rather than navigating between places, and instead of `Select` when there are few enough options that one tap beats open-then-pick. An idle segment fills `panel-2` on hover and a step darker on press; a segment takes `disabled` (`opacity-40 cursor-not-allowed`); inset focus ring.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `SkillBar`                                 | ✓      | 5-segment level indicator (filled accent squares = trained, warning segment = training, `line` = untrained).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `LogoMark`                                 | ✓      | The app mark, inline SVG. Decorative (`aria-hidden`) — every placement sits beside the app name. Size it with `size-*`; corner brackets follow `currentColor`, defaulting to accent. Simplified from the artwork, see §2b.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `IconButton`                               | ✓      | Icon-only control with a real accessible name: `label` sets both `aria-label` and the `Tooltip` text, so the two can't drift; `tooltip` shortens the visible bubble only, for a row of per-item actions whose `label` names the item ("Delete Rifter run") but whose tooltip should read "Delete" — text there must stay a substring of `label` (WCAG 2.5.3). It takes a node as well as a string, for a bubble that _explains_ rather than names: 2.5.3 binds visible label text to the accessible name, and an icon-only control has no visible text for it to bind, so a bubble that says something `label` does not is legitimate here and nowhere a visible label exists. `pressed` makes it a toggle (`aria-pressed`). `variant`: `ghost` (default, hairline box) / `plain` (no box, for a control nested inside a row). `size`: `md` (default, the `h-11 md:h-9` touch tier, §3) / `sm` (`h-9 md:h-7 touch:h-9`, nested-in-a-row) / `row` (`size-11 md:size-7 touch:size-11`: a row's own ⋮ or inline action — the dense size for a pointer, the 44px touch tier on a phone). Forwards its ref and spreads unknown props onto the `<button>` — pass it to a Radix `Trigger`'s `asChild` and it works. Prefer this over a bare icon `<Button>` whenever there's no visible label text. `tone="warning"` is the amber caution treatment (the Ω "Omega only" badge); `openOnTap` makes a plain tap reveal the tooltip, for an icon that only explains (see `Tooltip`). `visibleLabel` shows that text beside the icon from `md` up (icon-only below; tier 2 of §6c Header controls; keep it a substring of `label`). Every tone (`default`, `danger`, `positive`, `warning`) has a hover and a pressed step; a `pressed` toggle keeps a (stronger) hover; disabled has neither.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `textActionClassName`                      | ✓      | Class helper for a borderless uppercase accent text action ("Clear day", "Dismiss all", "Use detected") on a `<button>` or a router `Link`. Use it instead of a `Button` when the control is a text-only affordance in a header or row and a bordered box would be noise. Per-site extras (`gap-1`, `justify-end`, `whitespace-nowrap`) go in its argument; there is no variant. A unit test fails on any hand-rolled `text-accent` + `uppercase` + `hover:underline` class string.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `plainTextActionClassName`                 | ✓      | Class helper for a quiet text action: body-colour text, solid underline at rest, no box, no accent ("Choose permissions" under "Log in"). The secondary action off a primary control, on a `<button>` or a router `Link`. Not for a link in a sentence (`inlineLinkClassName`) or an uppercase header action (`textActionClassName`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `EntityLink` / `entityLinkClassName`       | ✓      | A clickable entity name (§6c "Entities"): accent at rest, underline on hover and focus, always a real `<a href>`. Each link below points at its type's default destination; a page with a recorded override (§6c "Entities", Overrides) links elsewhere with the same recipe. `entityLinkClassName(extra?)` (`ui/entityLinkClassName.ts`) is the class recipe (`ItemInfoLink`'s, `MarketItemLink`'s and `JumpsLink`'s default). `CharacterLink`, `CorporationLink`, `AllianceLink`, `SkillLink`, `ItemInfoLink` and `SystemLink` (`features/entities`) are react-router `Link`s that forward their ref and spread anchor props. All but `SystemLink` point at the _current_ page plus `?info=<kind>-<id>` (`lib/entityInfo.ts`); `EntityInfoRoute`, mounted once in `App.tsx`, opens `PublicInfoModal`/`SkillDetailModal`/`ItemInfoModal` (Item Detail) from it. `ItemInfoLink` is the default for an item name; `MarketItemLink` is only for a page whose context is market. Close goes back when the app pushed the entry, else replaces the URL without `info`; Back closes. The stores' `open` navigate too, so menus and the palette share the URL. `SystemLink` goes to Route Safety.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `RowActionsMenu` / `RowMoreActions`        | ✓      | Only for a row that passes §6c's restraint rules (two or more real actions not reachable elsewhere); a row without them has neither. A row's actions from one definition, two ways in (WCAG 2.1.1): `RowActionsMenu` is the right-click menu around a row and publishes its items; `RowMoreActions` anywhere under it is the visible, Tab-reachable "More actions" `IconButton` (`plain`, `row`: 44px on a phone, 28px on a pointer) opening a dropdown of the _same_ items. Write items with `MenuItem`/`MenuSub`/`MenuSubTrigger`/`MenuSubContent`, plus `MenuSeparator` between groups and `MenuRadioGroup`/`MenuRadioItem` for a pick-one choice (a module's state), which render as whichever menu family they land in (`DropdownMenuRadioItem`/`ContextMenuRadioItem` underneath). Any hand-placed ⋮ trigger uses `size="row"` too. Below `md` every submenu (`MenuSub`, and `DropdownMenuSub`/`ContextMenuSub` directly) opens in place — its items expand under the trigger, indented, in the same panel, with ArrowRight/Enter to open and ArrowLeft back to the trigger — since a phone has no room for a panel beside the menu; above it, a side panel capped to the room on its side. Menus scroll rather than leave the screen. `DataTable`'s `rowMoreActions` adds the button as a trailing column; hand-built rows place `RowMoreActions` themselves — beside a row `<button>`, never inside it. `onOpenChange` reaches both menus. `tooltip` makes the trigger explain itself on hover and focus (a Fittings Ring tile), with its touch-and-hold the menu's. `linksKeepBrowserMenu` (also on `ItemContextMenu`) leaves a right-click or touch-and-hold on a link or text field inside the row to the browser's own menu (§6c "Entities", guardrail 2); set it on any row whose names are links.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `PageHeader`                               | ✓      | A route's top line: `title` (the page's one `<h1>`), `meta` beside it (the view's `DataAgeBadge`, a count), `actions` right-aligned. Every route uses it — that is what keeps the title, the data age and the controls in the same place page to page. Controls in `actions` keep the default (md) size, as the `Panel` row says — a route never sets `size="sm"` there (a source-scan test enforces it). One exception: the three Character-overview tabs (Overview / Clones / Employment History) share `features/character/CharacterHeader` instead, which puts the character's identity and SP where the title would go and keeps the whole block identical as you move between the tabs; a title there would only restate the tab beneath it. It carries no `meta` or `actions` of its own — those tabs hang their `DataAgeBadge` and Refresh on the `Panel` toolbar below the tab strip instead, so nothing above the tabs changes from tab to tab.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `TextInput`                                | ✓      | Single-line field. `size` `sm`/`md` from the shared scale (§3); width is the caller's (`className`). A field holding a number big enough to need separators is `type="text"` + `inputMode`, masked by `src/lib/numberMask.ts` — grouped at rest, plain while focused. `type="number"` cannot hold "338,600", and reformatting under the caret makes a field unusable, so the swap happens on focus and blur. Industry's sourcing fields are the worked example. An ISK amount the user types also accepts `b`/`m`/`t` shorthand (`parseIskAmount`) and, where the layout has room, echoes the parsed exact figure underneath — `IskInput` does both (`echo={false}` in a fixed-height strip).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `TextArea`                                 | ✓      | Multi-line field. Owns only the chrome (field base, full width, `p-2`) plus a `mono` flag; font size, `rows`, placeholder and label stay with the caller — the paste boxes keep their own density. A raw `<textarea>` outside `src/components/ui` is a lint error.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SearchInput`                              | ✓      | The one search box: `type="search"`, leading magnifier, fixed at `md`. Use it for every filter-as-you-type field, so they don't drift apart again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `Checkbox` / `Radio`                       | ✓      | The native checkbox and radio in the house recipe: 16px square (`size-4 shrink-0`), pointer cursor, `accent-accent`, and one disabled treatment (`cursor-not-allowed opacity-50`). Both forward every native input prop and `ref`. A first-line nudge (`mt-0.5`) or focus outline is the caller's `className`; a deliberately different locked look (`CustomizePermissionsDialog`, locked by policy rather than busy) overrides with `disabled:…!`. A raw `<input type="checkbox">` / `<input type="radio">` outside `src/components/ui` is a lint error. Disabled is now `opacity-40 cursor-not-allowed` (was `opacity-50`) and the control carries the 2px outset focus ring.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `NativeSelect`                             | ✓      | A real `<select>` in the house treatment, `appearance-none` with our own caret. **The exception, not the default — reach for `Select` first.** It has no product call sites today, only the Styleguide entry above; it exists for a case that can argue for the OS picker specifically (a very long list on mobile, say). They are styled identically closed, so nothing is gained visually; what is lost is that its open list is the OS menu, which reads as a seam next to any `Select`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Select`                                   | ✓      | Radix listbox (ADR 0004): focus movement, typeahead, roving tabindex. **The default select.** `SelectTrigger` takes the same `size` as every other control. `SelectGroup` + `SelectLabel` are the `<optgroup>` equivalent. Two things a `<select>` gives free and this does not: the trigger is a `<button>`, so a wrapping `<label>` or `htmlFor` will not name it — pass `aria-label`; and its values are strings only, so coerce numbers on the way in and out. The trigger never wraps: it is a fixed-height control, so a label wider than the box ellipsizes rather than spilling onto a second line. Size the trigger to its widest expected label; truncation is the safety net, not the plan.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Disclosure`                               | ✓      | ARIA disclosure row; caller owns the expanded state so "expand all" can drive it. `labelAccessory` puts an interactive extra (an `InfoTooltip`) beside the label: the toggle button then wraps only caret + label (a button can't nest one), the row itself takes the click, the accessory's clicks don't toggle, and `trailing` stays in the button's accessible name via an `sr-only` copy. Its `Caret` is exported for the surfaces that own too much of their own frame to use the whole component (Skills group headers, the Market Group tree, the Fittings Charges tab's module sections) but must still point the same way.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**The open Fitting is the other `PageHeader` exception.** With a Fitting open, `features/fittings/FittingHeader` takes its place: the Fitting's name is the page's `<h1>` and its identity, controls and headline numbers stay in one block while the editor below changes view. With nothing open, the Fittings Start screen uses `PageHeader` as usual.

## 4a. Tables on a phone

A dense table cannot stay a table on a 390px screen. Measured before the fix:
a six-column row rendered 505px wide, which scrolled the whole page sideways
**and** squeezed the name column to 74px, breaking one item name over five
lines. Both failures at once — so neither "let it scroll" nor "let it squash"
was an option.

`DataTable` therefore collapses below `sm` (`responsive="stack"`, the
default) unless comparing across columns is the point (compare tables,
matrices, rosters, wide numeric tables): those stay tables that scroll
sideways with the key column pinned (`responsive="table"` + `stickyStart`,
§6c Restraint). With cards: the header row hides, each row becomes a card, one cell becomes the
card's **title**, and every other cell prints its column header into a left
gutter.

The title is the first column by default, which is usually right. Where
reading order and identity disagree, mark the identifying column
`primary: true` rather than resorting the table — the row keeps its column
order at every width and the card hoists that cell with CSS `order`. Wallet's
journal is the case that motivated it: a ledger should lead with its date on
desktop, but a card titled "9/1/2026, 9:34:21 PM" says nothing, so `refType`
("Bounty prizes") titles it and the date becomes a labelled field.

Three rules hold this together:

- **One DOM at every width.** The collapse is CSS (`.dt-stacked` in
  `src/styles/index.css`) — no `sm:hidden`/`hidden sm:flex` pair, nothing
  rendered twice, same rule the Assets page follows. Labels come from
  `data-label`, so they can't drift from the headers, and they add no i18n
  strings. The one thing JS decides is _when_: `DataTable` sets the
  `dt-stacked` class below `sm` (`useIsPhone`), or wherever the caller says
  with `stacked` — a table that measures its own width and is narrower than
  its columns on a wide screen. Hauling does: on a tablet with the rail open
  its panel is slimmer than a phone's (ADR 0017). A table that forces cards
  this way picks its own `max-sm:`/`sm:` cell classes in JS, since those
  still follow the viewport.
- **It lives in the `utilities` layer.** A cascade layer beats every earlier
  layer regardless of specificity, so from `components` these rules would lose
  to the `px-3`/`text-right`/`whitespace-nowrap` utilities on the very cells
  they re-lay-out.
- **Roles are explicit.** `display: block` strips the implicit ARIA table
  roles in real browsers, so `DataTable` writes `role="table"`/`rowgroup`/
  `row`/`columnheader`/`cell` itself.
- **A cell never right-aligns itself below `sm`.** `align: 'right'` on a
  column is handled — `.dt-stack td` overrides `text-right`. What it cannot
  reach is alignment a cell renders for itself: a `flex … items-end` wrapper,
  a `justify-end`, a `text-right` input. Those keep hugging the card's right
  edge while plain cells start at the 7rem gutter, and the card reads as a
  zigzag instead of label/value pairs. Hold that alignment behind `sm:`
  (`items-start sm:items-end`) — Industry's materials table is the worked
  example.

Opt out with `responsive="table"` in two cases, and no others. Either the
columns _are_ the content — a matrix where a card per row would make
cross-row comparison unscannable; a matrix earns its sideways scroll, a list
of records does not — or the table is read-only display whose columns fit a
390px screen: a few short columns, with no row controls to make a card worth
its gutter. Where a read-only table is a column or three too wide, mark the
low-value columns `phoneHidden: true`: they drop below `sm` (CSS only,
`max-sm:hidden` on the th and tds), so the table stays a compact table
instead of becoming one card per row. `phoneHidden` is inert in the stacked
layout, and a hidden column still sorts and exports. `mobileSort` is likewise
inert in table mode (the header sort buttons are on screen, so no sort bar
renders). The contract detail modal's Included/Requested item tables are the
original case: an icon + name and a quantity fit as they are, so stacking
would only spend a 6.5rem gutter on "QUANTITY: 744" and turn a scannable list
into one card per item.

`SkillCompare`'s character-by-skill matrix used to opt out for the
columns-are-the-content reason above, but #406 moved it back to the default
stack: a mobile card per skill, with one level line per compared character,
is a fine trade once the page's own "differing only" toggle keeps the row
count down to what's actually worth scanning — and a sideways-scrolling
matrix couldn't show more than about two characters on a 390px screen
anyway, so the opt-out was buying less than it looked like.

### Dense cards, phone sort and phone grouping (opt-in)

Three further props exist for a long list a reader _scans_ on a phone rather
than reads — Courier Search, with hundreds of offers, is the case that
motivated them. Each is strictly opt-in: a table passing none of them renders
exactly the markup above.

- **`stackLayout="dense"`** replaces the labelled card with a two-line one.
  Line one is the primary cell with the `cardCorner` cell _in flow_ at its
  right (bold, unwrapped — the headline figure, not a decorative icon as in
  the labelled card). Line two is every other cell inline at 11px in
  `text-dim`, `·`-separated, with no column labels; a column's `stackAffix`
  (`{ before: 'Qty ' }`, `{ after: ' reward' }`) supplies the word a bare
  number needs. The active sort column's meta value turns `text` and bold
  (`dt-sorted`, set on every sorted cell and inert everywhere else), since
  there is no header row to show the sort on. A control column sets
  `stackEdge` to stay off that 11px line: `'start'` (a tick box) is pinned
  left and centred across both lines, `'end'` (a quantity box) closes line
  two at its right end (Hauling), and `'below'` takes a full-width third
  line of its own for a value and its control (Thera's signature pair and
  Copy). An `expandableRow`'s chevron cell joins
  the actions on line one (none at all with `hideIcon`). A table with no
  chevron and no `end` box can add `className="dt-actions-pinned-only"` to
  pin the More actions button to the right edge across both lines, so line
  one stays text-tall, keeping the figure in flow on line one, hiding the
  expand chevron (line two runs the card's full width, so a chevron beside
  the button would sit off its axis or on the text; the whole card is the
  tap target), draws the ⋮ in the text colour, and gives it a 44px gutter of its own: the Range cell ellipsizes before text could meet the button (Market order book). A table with
  a tick box, a chevron and an `end` box can add `className="dt-dense-tight"` instead: the tick
  box, title, figure and button share line one, centred on each other (the
  button's 44px target overhangs rather than heightening the line), and line
  two centres on a 28px `end` box (Hauling). A table with a tick box and no
  chevron can add `className="dt-dense-lead"`: the box sits on the title's line with a small
  gap, the card keeps its ordinary left padding so line two starts under the box, and a
  coarse pointer's 44px target overhangs the padding instead of widening the cell (Mining
  Tax). BPC Sourcing uses `dt-dense-tight` too,
  with neither box: its `cardCorner` is an ISK amount, wider than the
  pinned corner's room for a standing icon. The box is under §3's 36px
  touch tier on purpose: at 36px its height set the meta line's and opened a
  gap under the title, which is what the card's reader complained about. A
  cell holding only a `data-dense-omit` value (an empty cell's dash, a word
  the card says another way) is left off the meta line. Still CSS
  (`.dt-stack-dense`); `stackColumns` is ignored.
- **`mobileSort`** (+ optional `stackSummary`, e.g. "214 offers") renders an
  `sm:hidden` bar above the table with a native `<select>` ("Sort: Price ↑")
  driving the same sort state as the header buttons. The stacked card hides
  the header row and every sort button with it, so without this a sortable
  table is unsortable on a phone. A real `<select>` rather than `Select`
  because the phone should get the OS picker, laid invisibly over its own
  label because the closed control's text differs from its options'.
- **`groupBy`** folds rows sharing a non-null key behind one full-width
  toggle row (collapsed by default, `defaultExpanded` to seed), with expanded
  members indented on the `panel` fill. Groups keep the table's sort: each
  sits where its best-ranked member did (`groupSortedRows`). Phone only —
  desktop has the width to compare those rows side by side.

The sort bar and grouping are **deliberate exceptions to "one DOM at every
width"**, for the same kind of reason `FilterBar` is (§4b): the bar replaces
controls CSS has hidden and cannot re-present, and a collapsed group's
members are _not rendered_ — CSS could hide them on a phone only by also
deciding their fate on desktop, where they must always show. Grouping reads
`useIsPhone`, so it tracks the same `sm` line as the stack. One consequence:
a `highlightRowKey` pointing inside a collapsed group has no row to scroll
to.

One narrower exception lives in a column's own `render`: a stacked card's
**title may change content when every row shares the primary value**. BPC
Sourcing with one blueprint picked lists only that blueprint, so a phone card
titled with its name says the same thing on every row; there the title reads
the copy's "ME 10 · TE 20 · 5 runs" instead. It is decided in JS with
`useIsPhone` (the line `DataTable` stacks at), so the cell still holds one
title at any width. Never a `sm:hidden` pair. Where the phone only needs
_less_ of the same text (a long station name), cut it with CSS instead.

## 4b. Filters

A filter row is fine at 1280px and is most of the screen at 390px. Wallet's
journal filters — a search box, a ref-type select and two date fields — wrap
to four stacked rows above the table they exist to narrow. Inline at desktop
width they wrapped too, and pushed the column picker off the search box's line.

`FilterBar` is the answer, and every table with a search box uses it. The row
is always the same three things, in this order, on one line at every width:
the search box (the panel's primary affordance), the table's column picker in
`actions` (`ColumnPickerMenu`, state from `createColumnVisibilitySetting` in
`src/lib/columnVisibility.ts`), and one funnel `IconButton`. Every filter sits
behind the funnel. On a pointer viewport it opens a box under the row; below
`md` it opens a `Modal placement="sheet"` holding the same controls, stacked
full width, over a sticky Apply / Cancel bar.

Three things about it are deliberate:

- **The sheet is a draft, the box is not.** In the pointer-width box an edit
  lands on the page immediately, which is right when the list is visible
  below the control. In
  the sheet the list is behind the modal, so edits accumulate and commit on
  Apply. A route with a persisted preference in its filters (the LP Store's
  trade hub and price basis) writes it in `onChange` and nowhere else, so
  Cancel has no store write to undo.
- **It is a conditional render, not a CSS collapse** — deliberately unlike
  `DataTable` in §4a. "One DOM at every width" cannot hold here: Apply/Cancel
  needs the sheet's controls bound to different state than the row's, and CSS
  cannot fork state. What is preserved instead is that the controls are
  _written_ once, as `children(draft, setDraft)`, so no control is mounted
  twice and neither surface can drift.
- **The trigger carries a number, not a tint.** `activeCount` renders as a
  badge and repeats inside the button's `label`, so "this list is filtered"
  survives a viewer who cannot tell the two border colours apart (§7). Each
  route supplies the count from its own defaults; there is no generic
  deep-compare.

Two shapes are _not_ this component. Controls that live in a `PageHeader`
`actions` slot rather than beside a search box (Market's location mode) are a
page toolbar, not a filter row. So are the sort selects in a `Panel`'s own
header (Assets' per-location sort) — they already wrap sensibly and have no
search box to sit inline with. And a lone chip (Mail's "hide read") is not
worth a trigger: the trigger costs the same room the chip does.

One sanctioned repeat: a phone list a reader scans by outcome may show its
status `FilterChip`s as a horizontally scrolling row (`sm:hidden`) under the
`FilterBar`, writing the same committed filter the sheet does, so a tap is one
step instead of three. Contracts History is the case (All plus one chip per
status present). Desktop keeps only the funnel; the sheet's chips stay.

A **status dot** (`size-2 rounded-full bg-current`, `aria-hidden`, phone only)
may lead a dense card's title in the row's status tone, so a scan down the list
reads outcome at a glance. It is never the only cue: the status word stays on
the card's meta line.

## 5. Icons

Pack: [Phosphor](https://phosphoricons.com) (`@phosphor-icons/react`), weight
`light` throughout. Import from `src/components/ui/icons.tsx` — never
`@phosphor-icons/react` directly in a feature file; that module is what pins
the weight and the `rem`-based sizing (`Icon.ICON_SIZE.sm/md/lg`) so every
glyph in the app matches, and it's the one place to touch if the pack ever
changes. Add a re-export there for a glyph the app doesn't have yet, rather
than reaching for a one-off import.

Why Phosphor `light` over the alternatives: it's the only shortlisted pack
(Phosphor, Lucide, Tabler, Radix Icons) with a genuinely 1px-native stroke
face rather than a thinned-down 2px default, which is what this system's
hairline-everywhere rule (§3, "Borders: always 1px, never 2px") needs — a
default-weight icon next to a 1px border reads heavier than everything around
it. MIT-licensed, tree-shakes per icon under Vite, and every icon takes
`size`/`weight`/`color` as plain props (`currentColor` by default, so
`--color-accent` drives it the same way `LogoMark` does).

Radix compatibility: this app's menus, selects and dialogs (`Select`,
`DropdownMenu`, `ContextMenu`) are built on `radix-ui`'s primitives. A
Phosphor icon is a plain SVG component with no opinion about its parent, so
it drops into a Radix `Trigger`/`Item`/`Content` exactly like any other
child — no wrapper needed. `IconButton` (§4) is the one place that _does_
need to compose with Radix directly (an icon-only `DropdownMenuTrigger`,
say): it forwards its ref and spreads unprimary props, so
`<DropdownMenuTrigger asChild><IconButton icon={...} label="..." /></DropdownMenuTrigger>`
works and Radix's cloned `aria-expanded`/`data-state` land on the real button.

Rules:

- Icon-only control → `IconButton`, never a bare `<button>` wrapping a glyph.
- Icon beside its own visible text label (a menu item, a nav link) → the icon
  is decorative, `aria-hidden="true"`, no separate label needed.
- Never emoji or dingbat characters as icons — SVG only, matching the rest of
  this system's illustration style (DESIGN.md's brand assets, §2b).
- A typed character ("+", "−", "Aa", "✓") is not an icon; icon-only controls
  take an `Icon.*` glyph (`Icon.Decrease` / `Icon.Increase` for a stepper). Lint
  rejects JSX text that is only "−", "+" or "Aa".
- Sort direction is always the glyph trio: `Icon.Sort` (faint) on a sortable
  column that isn't sorting, `Icon.Ascending` / `Icon.Descending` (accent) on
  the active one, sized `ICON_SIZE.sm`, with the direction in the accessible
  name ("Profit, sorted descending"). A "↑" / "↓" text arrow appears only where
  a native `<option>` can't render an icon (`DataTable`'s stacked-mode sort
  select); lint rejects it in every other `src` `.tsx` file.

**Exception — the Fitting Add panel's filter and slot icons.** The module
browser's Hull/Resources/Skills toggles and its "Fits this slot" toggle
(`FittingAddPanel.tsx`) use CCP's own in-game Fitting-window icons as raster
PNGs (`public/images/fitting/{hull,resource,skill}.png` and
`slot-{high,medium,low,rig}.png`), not Phosphor SVGs, composed through
`IconButton` as `<img>` children — the same "read as the game draws it"
reasoning as the Ship Tree (§1): these are copied from a specific in-game
control, not drawn to this system's own illustration style, so a Phosphor
glyph would say something else at a glance than what the pilot already knows
from the client. The exception is scoped to exactly those `<img>` elements and
nothing else in the panel — its search icon, close button and every other
glyph stay Phosphor as normal (a subsystem slot, which has no in-game rack
icon, keeps a text chip). The Fitting Ring's turret and launcher hardpoint
icons (`public/images/fitting/hardpoint-{turret,launcher}.png`) fall under the
same exception: one heads each kind's hardpoint pips on the rim, and the same
one badges each high-slot tile whose module takes that hardpoint. Scope decisions:
`docs/context/decisions/20260927-104252-fitting-add-panel-hull-resource-skill-filter-icons.md`,
`docs/context/decisions/20260930-173310-fitting-add-panel-slot-icon-replaces-fits-this.md`.

## 6. Usage rules

- **Ellipsis is one glyph.** A `*Placeholder` string starting "Search" ends in a
  single "…" (U+2026), and progress strings ("Checking…") use it too — never
  three ASCII dots. A key that doubles as an `aria-label` stays bare. Guarded
  by `src/i18n/placeholderEllipsis.test.ts`.
- **Dark only.** No light theme. `color-scheme: dark` is set globally.
- **No gradients, anywhere.** Flat fills only (`bg-accent/10`, `bg-panel-2`,
  …). Depth comes from the layering step below, not a fade.
  - One exception (and its one sibling below), and it is not a fade: `.calendar-map-past`
    (`styles/index.css`) draws a 45° hairline hatch with a
    `repeating-linear-gradient`, because CSS has no other one-declaration way
    to make a texture. The rule exists to keep depth coming from layering
    rather than from soft colour ramps; a hatch has no ramp — every stop is
    hard, and it reads as "not available", which no flat fill can say without
    being mistaken for "empty". Reach for this only where a surface must look
    unavailable rather than merely dim.
    Its one sibling is `.route-strip-hole`, Route Safety's wormhole jump
    on the route strip: a step with no security of its own to colour it,
    hatched so it never reads as a system of some security band. An Ansiblex
    jump's strip cell is no hatch: a flat `bg-panel-2` edged top and bottom
    in the bridge row's dashed `border-line-bright`.
  - The Ship Tree's corner brackets, grid and render mask (`shipTree.css`)
    are hard-stop drawings under its own exception — §1 "Ship Tree (ISIS)".
- Layering: `bg` → `panel` → `panel-2`. Depth via background steps + hairlines,
  not shadows. Shadows only for popovers/menus (`shadow-lg shadow-black/50`).
- One `primary` button per view; everything else `ghost`.
- Accent = interactive/selected. Don't use accent for static decoration.
- **A box means "you can click this."** A small inline element drawn with a
  border (the edge of a `Button`, `Select`, `TextInput`, `FilterChip`) is how
  a reader recognises a control, so never draw one around static content: a
  status word ("incomplete"), a count, a label, a headline figure. Emphasise
  static content with type and colour instead: a status tone on the text,
  `font-semibold`, or the uppercase micro-heading treatment (§2). This rule
  covers inline elements sized like a control. A panel's, table's or
  section's hairlines divide regions, and nobody reads them as buttons.
  The other side of the rule: a `<button>` that opens a picker (the stats
  column's Implants trigger) wears the field chrome (`fieldBaseClassName` +
  a `fieldSizeClassName` size), so it reads as the control it is.
- **Stacked controls line up; they never just wrap.** When a panel body puts
  two or more labelled controls on separate lines, lay them out as a
  two-column grid (`grid-cols-[max-content_minmax(0,1fr)]`): labels in the
  left column, controls in the right, every select in the group one width,
  and a control's own action ("Manage", "Appraise") after it on the same
  line (it drops beneath the control only when the column is too narrow
  for both). The `FilterBar` sheet (§4b) is not covered: it captions each
  filter above a full-width control.
  An explanation of the current value goes dim beneath its control, in the
  control column, never beside it. Controls that land on new lines only
  because the row ran out of room look accidental. A picker that renders its
  own label takes a `field` or `bare` prop so the grid supplies the label.
  Its accessible name still says what it is, and so does a shortened
  action's ("Manage" keeps "Manage targets" as its `aria-label`).
  The grid lines controls up within one block. Neighbouring blocks don't
  have to share an x position. The grid is `Fields` / `Field`
  (`src/components/ui/Fields.tsx`); never re-roll it. Its `compact` look is
  the stats column's (`StatFields` / `StatField` are its names there). Its
  `form` look is every Settings panel's: semibold labels, a hairline between
  rows, the hint dim under the control, and the label stacked over its
  control below `lg`. A lone checkbox row there takes `inline`, so on a phone
  the box stays on the label's line instead of sitting alone beneath it.
- **One separator inside a detail line.** A dim line that strings facts
  together (charge · range · duration · reload) joins them with a spaced
  middle dot, " · ", never commas or slashes. In the stats column `joinDetail`
  (`statKit.tsx`) does it and drops empty parts.
- **The fitting stats column is built from one kit.** Each section's row is
  shaded `panel-2` with an uppercase micro-heading title and a
  `text-sm font-semibold` headline figure. Section bodies use only the
  pieces in `features/fittings/StatFacts.tsx` and `statKit.tsx`:
  - `StatRows` / `StatRow` for one row per module. A row has two lines: the
    name, then a dim detail line with the figure at its right. Hairlines go
    between rows. Only a row with nothing to detail (a total) sits on one
    line, and it asks for that with `inline` rather than by leaving `detail`
    empty. A total is a hand-built `<li className={statRowClassName(true)}>`
    around `StatRowContent`, which gives it the brighter hairline.
  - `Facts` for label/value pairs.
  - `StatGroup` for a labelled run inside a section.
  - `StatFields` / `StatField` for the pickers on top, with `sm` controls
    `STAT_FIELD_WIDTH` wide (see "Stacked controls line up" above).
  - `StatNote` for footnotes and empty states.

  That keeps the column to three sizes: 14px headlines, 12px names and
  values, 11px for everything dim. Add a piece to the kit rather than
  hand-styling a new section.

- **In-sentence links underline at rest.** An accent link inside a sentence or
  a definition list uses `inlineLinkClassName` (`controlStyles.ts`:
  `text-accent font-medium underline`) — colour must not be the only cue
  (WCAG 1.4.1). Add touch-size extras alongside it, don't fork the recipe. It
  means navigation only; an in-sentence _action_ (Undo, Set runs) is a
  `textActionClassName` button. A table-cell entity name is accent at rest
  with a hover underline; it goes to its entity type's default unless the
  page records an override (§6c "Entities").
  `textActionClassName` stays the recipe for uppercase text actions.
- **A control that opens a modal or navigates is a `Button`.** A text action
  (`textActionClassName`) is not for it. One exception: when the view already
  has a primary `Button` and this is a secondary action off that primary (the
  "Choose permissions…" under "Log in"), the secondary may be a text action,
  so the two don't read as a pair of competing boxes. It stays a `<button>`
  (or a `Link` for navigation), never a bare accent word. That secondary is
  `plainTextActionClassName` (white, underlined), so it doesn't compete with
  the accent primary. On a page whose only accent control is "Log in", a
  navigation `Link` like "Open Neocom Desk" is a plain `Button` look, not
  accent.
  `inlineLinkClassName.test.ts` fails on a hand-rolled `text-accent underline`.
- Status colors carry meaning; never use them decoratively. ISK amounts use
  `isk-pos`/`isk-neg`, not success/danger.
- Density: tables are the norm; avoid card grids for data lists.
- Every API-derived view shows a `DataAgeBadge` — hidden below `md`, where
  Settings' Data Age tab carries the same information instead.

## 6a. Loading a route

What a route may show while its data is on the way. The rules are ordered: the
first one that applies wins.

- **Page chrome always renders immediately.** The `PageHeader`, its
  `DataAgeBadge`, tabs, filter and export controls, and the Refresh button are
  drawn on the first frame, whatever the data is doing. A route must never
  collapse to a bare centered spinner once the active Character is known — the
  spinner belongs in the content region below the chrome, never in place of it.
- **A route already viewed this session renders its last content immediately,
  with no spinner.** `useRouteSnapshot`'s `cacheKey` option retains the view's
  last composed snapshot in `lib/routeSnapshotCache.ts` and returns it on the
  next visit's first frame, while the loader re-reads behind it. Every
  read-only Character route passes a `cacheKey`; a new one must too.
- **Spin only when there is genuinely nothing to show.** Gate on
  `loading && !data`, never on `loading` alone — `loading` is also true during a
  refresh and during a background revalidation, both of which already have rows
  on screen. Spinning on `loading` alone throws away content the user was
  reading.
- **Prefer a spinner to a skeleton** (§4, `Spinner`), paired with the
  `DataAgeBadge` of whatever is cached.

Known limit, deliberately not papered over: retention is in-memory and
session-lived, so the **first** visit to a route after an app load still spins
while the view composes its snapshot. `app/prefetch.ts` warms the Dexie
`esiCache` at boot, so that work is local rather than network-bound, but it
warms endpoints, not composed view snapshots. `app/routeWarm.ts` narrows the
window where it can — a rail link composes its route on hover and on focus, so
the click often lands warm — but only for the routes listed in
`ROUTE_WARMERS`, and it buys the pointer's travel time rather than guaranteeing
anything. Making a first visit reliably instant means either warming route
loaders at boot or persisting snapshots across reloads — both are real projects
with their own burst and schema-drift tradeoffs, not something to add to a
route ad hoc.

## 6b. Route transitions

- **The route outlet fades in. That is the whole effect.** Layout's
  `useRouteFade` animates the outlet on every pathname change, skipping it
  under `prefers-reduced-motion: reduce`.
- **Opacity only — never a transform.** The outlet is the entire main content
  area, so any movement reads as the whole app sliding rather than a page turn.
- **Animate the element; never re-key the outlet to replay a CSS animation.**
  Restarting a CSS animation requires a new element, and six `ROUTE_ELEMENTS`
  entries in `app/App.tsx` match more than one pathname (`/corp/assets/*`,
  the tabbed pages' `<path>/*` splats, and the four `:param` routes). React Router keeps one
  component instance across those, so a `key` would throw away Assets' search,
  filters and selection on every drill-down and re-run its loader — churn far
  worse than the fade is worth.
- **Do not reach for `document.startViewTransition()` here.** It was tried and
  removed (PR #878): it cross-fades a snapshot of the outgoing page against
  the incoming one, so it needs both laid out at their true size — but a route
  reaches its real height only once its data lands, and a route with nothing
  retained is a short spinner at transition time. The incoming snapshot was
  captured at the wrong size, scaled to the outgoing page's box for the length
  of the fade, then snapped to its true layout when the transition ended. That
  is the jumping it looked like it would prevent. Chromium's guidance is to
  finish loading before starting a view transition, which a route whose data
  arrives asynchronously cannot do.
- The `@view-transition { navigation: auto }` rule in `styles/index.css` is
  unrelated and stays: it covers full **cross-document** reloads (the
  service-worker update `ReloadPrompt` triggers), where the browser has both
  fully-laid-out documents and the problem above does not arise.

## 6c. Interaction grammar

A pilot should be able to tell what they can click, hover, tap or hold, and
what it will do, before they try it. Two rules govern everything below:

- **Visible at rest.** The cue shows without hover. Hover, cursor and colour
  can reinforce it but never carry it alone: a phone has no hover and no
  cursor, and colour alone fails WCAG 1.4.1.
- **One meaning per cue.** Every cue in the vocabulary below has exactly one
  meaning. A new surface picks the cue for its intent instead of inventing
  one.

**Familiar look, our own content.** How a link, button, tooltip, menu or
gesture _looks and behaves_ follows what pilots already know from the web
and other EVE tools (zKillboard, EveWho, EVE Tycoon, the client). _Where_ a
link goes and _what_ a view shows is Neocom Desk's own. When this section is
silent, follow the platform convention (WCAG 2.2, WAI-ARIA APG, Apple HIG,
Material, Windows).

**Deep links that name a field.** A link whose job is "set this value" (the PI "Set the rate on Plan" link, `#customs`) opens the view with the section expanded and the first field focused, so the pilot lands on the control, not a page that merely mentions it.

**Wire focus (PI Map).** Hover or focus on a planet or product tile thickens its own wires and dots their two ends; every other wire steps back. A wire that jumps a tier is dashed. All wires show at rest, so this only reinforces (touch gets it on tap focus).

Some primitives named here are still being built during the rollout. Until
one exists, follow the rule it encodes. Where §3 or a §4 component row describes
older behaviour (the touch tier keyed on width alone, hold-to-reveal inside
rows, `opacity-50` for a disabled
`Checkbox`/`Radio`), §6c is the target. The rollout PR that changes a primitive also updates its §4
row.

**Bulk selection.** A list where one action applies to many rows (Settings ›
Permissions: grant several at once) puts a leading checkbox only on rows the
action can still apply to, with Select all / Select none above the list and a
count-labelled button ("Grant selected (3)") that appears once a row is ticked.
The per-row action stays. Ticks belong to the context they were made in and
clear when it changes (a different Character).

### Cue vocabulary

| Cue                                                  | Means only                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accent text                                          | Clickable                                                                                                                                                                                                                                                                                                                                                                 |
| Solid underline at rest                              | A link inside a sentence (`inlineLinkClassName`)                                                                                                                                                                                                                                                                                                                          |
| Accent text, no underline, tooltip naming the press  | A value that flips in place (Survey Done at: EVE time / your own clock) — no navigation, so not a link                                                                                                                                                                                                                                                                    |
| Trailing `Icon.External` (Phosphor `ArrowSquareOut`) | Leaves Neocom Desk (`ExternalLink`)                                                                                                                                                                                                                                                                                                                                       |
| Tinted pill, the level's word inside                 | A computed verdict, never clickable (`ThreatBadge`, the band's chips); the word always shows, colour is never the only signal                                                                                                                                                                                                                                             |
| Wash and left edge on a Local list row               | The row's Threat level, so a Dangerous pilot stands out on a phone card: red edge (and border and glow on a phone card) for Dangerous, no red background; a faint amber wash and edge for Active, none for Low threat or Inactive. Additive to the badge, never the only signal; a Dangerous badge is filled solid (`accent-contrast` on `danger`, ≈7:1)                  |
| Page title with a trailing `CaretDown`, no field box | Opens the page's list of views (`PageViewPicker`): a phone, a page with 4+ tabs (Skills, Industry, Market). It replaces the tab strip, never sits beside it; the page's filters keep their own controls                                                                                                                                                                   |
| Dotted underline                                     | Has a tooltip (`HintText`)                                                                                                                                                                                                                                                                                                                                                |
| "?" circle                                           | Explains a term (`InfoTooltip`): a tooltip, never a dialog                                                                                                                                                                                                                                                                                                                |
| ⓘ `IconButton`                                       | Opens Show Info or an explanation modal                                                                                                                                                                                                                                                                                                                                   |
| Faint pencil after a value                           | Edit this value in place                                                                                                                                                                                                                                                                                                                                                  |
| "…" ending a label                                   | Opens a dialog that needs more input or a confirmation before the action runs (Windows' rule). Not on a button that only shows a window (Show info, Payees, Settings), and never on an icon-only button.                                                                                                                                                                  |
| Amber warning mark (`Icon.Warn`, `text-warning`)     | A figure that leans on a default the pilot has not confirmed ('Assuming NPC station fees'), or one page's total that disagrees with another's by design (a member plan's owned count against its Build Group's; the line links to the other page). The adjacent "Set fee…" button opens a popover (a bottom sheet on a phone) to confirm it; once set the mark goes away. |
| Trailing `CaretRight` on a row                       | Goes to another page or view                                                                                                                                                                                                                                                                                                                                              |
| Leading caret that rotates                           | Expands in place (`Disclosure`'s `Caret`)                                                                                                                                                                                                                                                                                                                                 |
| Trailing rotating chevron, right edge                | Navigation expanders (rail pages with views, the More sheet's hidden pages) keep a trailing rotating chevron at the right edge, not the leading caret used for in-content disclosures (owner decision, Oct 2026)                                                                                                                                                          |
| + at a faded rail row's right edge                   | Pins a page the short rail leaves out: the "N more pages" row opens the hidden pages flat, in place, faded; the + shows one permanently. Customize is the mode with a Shown/Hidden toggle on every row. Ctrl K and Recent reach hidden pages without either                                                                                                               |
| `CaretDown` inside field chrome                      | Opens a list to pick from                                                                                                                                                                                                                                                                                                                                                 |
| Paired carets in `IconButton`s                       | Pages (previous / next month, a wizard's step back)                                                                                                                                                                                                                                                                                                                       |
| ⋮                                                    | The row's or table's action menu, only where it holds two or more real actions (⋯ is only the phone nav's More)                                                                                                                                                                                                                                                           |
| Accent 2px left border                               | Selected                                                                                                                                                                                                                                                                                                                                                                  |
| Hue on a rail dot and a bar slice                    | Which pickup location a stack, card or share of the load belongs to (Plan a move); the location's name is always beside it, never colour alone                                                                                                                                                                                                                            |
| `Icon.Pending` (Hourglass)                           | Pending: awaiting an answer (new)                                                                                                                                                                                                                                                                                                                                         |
| A box sized like a field                             | A control (§6)                                                                                                                                                                                                                                                                                                                                                            |
| Warning box with a `Button` "Retry"                  | A read failed and nothing is cached: the data is unknown, not empty (PI `EsiDidntAnswer`). Retry re-runs the read                                                                                                                                                                                                                                                         |

No typed arrow (`→` `↗` `›`) ends a link label; leaving the app is `Icon.External`, a row that goes elsewhere is a trailing `CaretRight`.

Retired meanings, each with its replacement:

| Retired                                               | Use instead                                                                             |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Dashed underline to mark an editable value            | The pencil                                                                              |
| Bare `CaretLeft` for "back to the parent"             | A labelled breadcrumb                                                                   |
| ⓘ as a static status glyph (`Icon.Tip`)               | `WarningCircle` or `Lightbulb`                                                          |
| Accent left bar for "loaded" or "in use"              | A status word                                                                           |
| A gear that navigates                                 | The gear opens _this page's_ settings modal; link to Settings with labelled text        |
| `textActionClassName` that navigates or opens a modal | A `Button`; a secondary action beside an existing primary `Button` may be a text action |

### Scope readout

A surface that reads more than the active Character says so on screen, in one
form with two looks. **Choosable:** the Character filter, whose "All" label
carries the count ("All characters · 4"). **Fixed:** `CharacterScopeReadout`,
an unboxed micro-label with the same icon and words — "All characters · 4",
"Aria Vale only" (only where the surface could read another Character, not on a single-Character panel like the Wallet Journal), "Corp · Master Wallet". When a read leaves Characters out it
says "All characters · 3 of 4" with a warning icon, and its tooltip names who
is missing. Never clickable; if the pilot can change the scope, use the filter.

### Origin crumb

A page opened from another surface's drill-in (the Wallet chart, for Assets,
Wallet Journal and Open orders) shows a "‹ Wallet" link (`WalletOriginCrumb`)
beside its scope readout, only when route state says it arrived that way.
Browser Back is unchanged; the crumb is a labelled way up, not a second Back.

### Entities

- **Look:** every clickable entity name is accent at rest, underlined on
  hover and focus. A non-clickable name stays in text colour. A column is
  all links or none.
- **Real links:** the name is a real `<a href>` with its own URL, even when
  it opens a modal. Middle-click and Ctrl+click open a new tab, and Back
  closes the modal.

| Entity                      | Default destination                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| Item type                   | Show info (`?info=type-<id>`, Item Detail), unless the page is market context (Market browser) |
| Character, corp or alliance | Show Info (`PublicInfoModal`)                                                                  |
| Skill                       | Skill modal                                                                                    |
| Contract                    | Contract modal (the accent type cell)                                                          |
| Solar system                | Route Safety, with that system as the destination                                              |
| Station                     | Not clickable                                                                                  |

The table is the destination for a name that stands alone. **Unless the row
has its own primary action** (Restraint, below): then the name is not a link,
and the entity link lives in the opened modal or detail, or the page the row
opens.

**Item names: Show info by default, Market when the page is market
context.** An item name that stands alone opens the item's Show info
(`ItemInfoLink`: a real `<a href="…?info=type-<id>">`, global like entity
info). Market stays one step away: "View in Market" in the row's ⋮ or context
menu, an "Open in Market" button in the Show info header, and the Show info's
best sell and best buy figures, which are in-sentence links (accent, solid
underline; they are figures, not names) into the Market browser keeping the
page's hub or region. The name keeps linking to Market (`MarketItemLink`)
where the page is about market or prices: the Market browser surfaces
(Variations, Quickbar, Compare), Order book, Hauling detail, Appraisal and
unpriced-cost views, price-led Loyalty Store and Mining Tax valuation lines.

**Destination follows the page.** The table is each type's default. A page
whose job isn't the default's may override it with whatever answers the
page's question. For example, an item on Planetary Industry opens its PI
product detail, while on Market or Contracts it opens Market; a character on
Mail could open the thread with them. Hard guardrails:

1. **Same cue.** Accent at rest, underline on hover and focus, a real
   `<a href>` (new tab, copy link work). What a link does is always a URL.
2. **The rest one step away.** Destinations the page didn't pick go in the
   row's or tile's ⋮ (right-click and touch-and-hold on the row or tile; on
   the name itself the browser's link menu still wins). A displaced
   destination counts toward the ⋮'s two real actions (Restraint, below);
   where the row still doesn't earn a ⋮, the detail the link opens carries
   them.
3. **One destination per entity type per page.** Every column, tile and
   card on the page; never mixed.
4. **Recorded, or it's a defect.** Name the page and the override in its
   DESIGN.md section or a scope decision, and list it under Overrides below.
5. **Unsure whether to override: use the default.**

How to choose:

- What is the pilot asking on this page?
- Where is the answer for this entity? If it's the default, stop.
- What stays one step away, and where (⋮ or the detail)?
- Record it in the same PR.

Overrides:

| Page                                     | Entity     | Opens                                                                                                                | One step away                   | Recorded in                                                                                                                 |
| ---------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Planetary Industry (Plan, Map, Colonies) | Item type  | PI product detail: the Map tab with that product's drawer open, by URL (from Plan and Colonies too)                  | Market, Show info (⋮ or drawer) | `docs/context/decisions/20261005-212941-entity-link-destination-follows-the-page-pi-item.md`; `?product=` (`piProductHref`) |
| Planetary Industry (Colonies)            | Own colony | The Map tab with that colony's richness drawer open, by URL (`?planet=`, `piPlanetHref`): the optional resource pick | Plan this colony                | `docs/context/decisions/20261006-001359-planet-richness-override-narrows-a-colonys-advice.md`                               |

Rows:

- **A row that navigates** is a real link ending in a trailing `CaretRight`
  (faint at rest, accent on hover).
- **A row that opens a modal** carries its cue on the primary cell (the
  accent entity name). The row click is a pointer convenience.
- **A row that selects** for a detail pane shows the selected treatment.
  Where having nothing selected is a valid state (the PI Map's traced
  product), a click on the selected row clears it, the same as a toggle;
  closing its detail pane does not. When such a row is a link, Space clicks
  it as Enter does.
- **A row with a menu** shows the ⋮ (`rowMoreActions`) only if the menu
  passes the restraint rules below. Right-click and touch-and-hold open the
  same menu, never the only way in. A row without a ⋮ has no custom menu.
- **A tile that holds a state** (a fitted module on the Fittings Ring): a
  click steps it to its next reachable state, wrapping to the first, the way
  the game cycles a module. The menu's State submenu lists the same states;
  selecting the tile for the Add panel is the menu's job. An empty tile
  selects on click. Enter/Space keep selecting; `S` on a focused tile cycles.
  A touch long-press or a drag never cycles, and Back undoes a cycle like any
  fitting edit.
  The tile's border colour _is_ the state (grey offline, blue online, green
  active, amber overheated), so it never changes on hover — a hover recolour
  reads as a state change. Hover and focus show the pointer cursor, the one
  tooltip (name, state, and what a click does, only where a click does
  something) and, from the keyboard, the focus ring. A four-swatch legend
  under the Ring names the colours, since touch has no hover. A tile that
  holds no state (an empty slot, a cargo item) may keep its hover border.

### Header controls

Three tiers decide how a page-header or toolbar control is labelled:

1. **Scope and mode controls** (a series/layer picker, a view toggle) carry a visible text label at every width; truncate it rather than drop it. The Character scope trigger is the exception: icon-only below `md` (portrait or `AllCharacters` glyph), text from `md` up, and its menu names the options.
2. **Frequent actions** (Columns, filter, export) show icon + text from `md` up (`IconButton visibleLabel`, or the `showLabel` / `triggerLabel` opt-ins on `ColumnPickerMenu`, `TableActionsMenu`, `FilterBar`) and stay the conventional icon below `md`.
3. **Rare actions** share one ⋮ "More actions" menu with text items (only with two or more real actions). Refresh stays a standalone icon beside the `DataAgeBadge`.

The Fittings editor header applies tier 3: Compare and Copy stats sit in its ⋮ menu on desktop, and on a phone that menu also holds Rename, the Fittings menu's items, Export and the Alpha/Omega and Mastery badges as text (the icon badges stay in the header from `md` up). Its Save is the one primary control, and says where it saves.

**The alerts bell** (`AlertsBell`) sits last in the header's control cluster on every page (`PageHeader`, and `CharacterHeader` / `FittingHeader`, which stand in for it). It is a link to `/alerts` showing the unread count, and it renders nothing at all at zero, so a phone header's corner stays clear. It is not one of the three tiers: it is navigation, not an action.

### Restraint: decide by what is already there

The cues above say what a control means. They never say a row needs one.
Decide by the surroundings: a control that repeats what the row already does
is clutter, and clutter hides the actions that matter.

- **A row's primary action beats name links inside it.** When a click on a
  row (or phone card) opens a modal, opens a detail pane, selects or expands,
  an entity name inside it (item, system, character, corp) is not a link: it
  is plain text, with the primary cell's accent cue marking the row's
  handle: the name carries the accent entity-name style so it still reads as
  clickable, but the click is the row's. The entity link (Market, Show Info,
  Route Safety) lives in the opened modal or detail. A name is a link only
  where the row has no primary action of its own, or where the name is the
  only action. A link that steals the click from the row it sits in makes
  "click the name" mean something different from "click the row".
  Recorded exception: Colonies rows expand on a row-body click while their
  planet and product names stay links
  (`docs/context/decisions/20261006-093301-colonies-row-click-expands-despite-inner-links.md`).
- **Check first.** Before adding any cue or control, check whether the row
  click, a visible link or name, a header action, a bulk action or the detail
  view already gives that action. If it does, add nothing.
- **A row gets a ⋮ only for two or more real actions** that can't be reached
  elsewhere in one tap. Show info, Copy, View in Market, a duplicate of a
  visible control and a duplicate of the row click do not count, except a
  destination the page's link override displaced ("Entities"): no longer one
  tap away, it counts. A menu with nothing worth a ⋮ is deleted (the
  `RowActionsMenu` or `rowContextMenu` too), not hidden: a row without a ⋮
  has no custom right-click or touch-and-hold menu, and the browser's own
  menu still copies text.
- **A chart mark may have a one-item right-click menu** when a visible,
  keyboard-reachable control elsewhere does the same thing (the Survey's
  "Remove scan" on a chart node, with Remove/Restore in the scan list below the
  page). The menu is a shortcut, never the only way in; touch-and-hold opens it.
- **One trailing control cluster per row**, at the right edge, never
  mid-row. A › caret beside a ⋮ is redundant: drop the caret. A destructive ×
  beside a ⋮ is a mis-tap hazard: fold Delete into the menu as a danger item,
  or separate it from the ⋮.
- **Read-only display tables** (figures and text, no row click, no real
  actions) get no ⋮, no caret, no actions column and no row menu. They also
  skip `exportable`: the table-level Export menu isn't a row menu and stays
  where export is useful, but a ledger or figures table where export means
  nothing doesn't set it.
- **Cards or table on a phone is a separate call**, and interactivity doesn't
  decide it. A table stays a plain table (`responsive="table"`, scrolling
  sideways, key column pinned with `stickyStart`) when comparing across
  columns is the point: compare tables, matrices, rosters, wide numeric
  tables, interactive or not. Stacked cards are for tables where each row is
  a record read as a unit (title plus a few fields: a mail row, order,
  contract, offer) and the columns are text-heavy and need no cross-column
  comparison. Interactive vs read-only decides only the controls above.
- **Duplicates.** When a per-row text action and a menu item do the same
  thing, keep the visible one and drop the menu item.
- **Say where it went.** A PR that removes a control names the alternate home
  for what it did (the row click, the detail view, the header).

### Tooltips, external links, numbers

- **Tooltips:**
  - Use `Tooltip`, `InfoTooltip` or `HintText`. Native `title=` is out:
    touch, keyboard and screen-reader users can't reach it.
  - Tooltip content is never essential.
  - A disabled control's reason uses `aria-disabled`, so the bubble stays
    reachable, plus visible text where the reason matters.
- **External links** use `ExternalLink`, which renders:
  - a trailing `Icon.External`
  - `target="_blank" rel="noopener noreferrer"`
  - a visually hidden "(opens in a new tab)"

  A button that calls `window.open` carries the same icon. New tabs are for
  third-party sites only; our own pages, including same-origin static pages,
  open in the same tab.

- **ISK** has two forms:
  - full `formatIsk(…, 2)` where the exact figure is the point (ledgers,
    wallet, contract price)
  - `IskAmount` everywhere else

  The B/M/K suffix is the cue that the exact value is one hover or tap away.
  No other compact formatter renders on screen.

  Where a panel holds many `IskAmount`s, wrap them in `IskFigureGroup`: one
  tab stop per group, arrow keys / Home / End between figures (roving
  tabindex), the exact value showing on focus. Arrows act only while a figure
  has focus, so inputs in the panel keep theirs.

### Touch and hold

| Gesture        | Means                                                                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tap            | The same as a click. On an explain-only trigger ("?", `HintText`, an `IskAmount` outside a tappable row) it toggles the bubble.                                                                                             |
| Touch and hold | Opens the row's or tile's menu (the same as its ⋮) wherever a menu exists, and then never a tooltip. On a control with no menu (an icon button, a chip), hold shows its label. On a link, the browser's own link menu wins. |
| Drag           | Only from a visible grip (`touch-none`, 4px activation distance).                                                                                                                                                           |
| Swipe down     | Dismisses a bottom sheet (with a visible grabber).                                                                                                                                                                          |
| Back / Escape  | Closes the top overlay.                                                                                                                                                                                                     |
| Tap outside    | Closes a menu, popover or sheet. A sheet holding unsaved edits asks before discarding them.                                                                                                                                 |
| Double tap     | Nothing. Controls set `touch-action: manipulation`, so there is no zoom delay.                                                                                                                                              |

- **Touch sizing follows the input, not only the width.** Menu items and Select items are `touch:min-h-11`; a bare checkbox or radio gets its 44px target from its wrapping label (`touchCheckboxLabelClassName`, or a `tappableRowClassName` row) — never a pseudo-element or overlay; drag grips grow a 44px-tall hit area along the vertical axis only (`gripHitAreaClassName`), and the CompareDrawer's resize separator is itself 44px tall on touch (`resizeHandleTouchClassName`). No hit area may overlap another target (WCAG 2.5.8). Inline submenus apply on coarse pointers too, and Fittings' HTML5 drag requires a fine pointer. The 44px tier
  applies below `md` _or_ on `(pointer: coarse)`, so a touch laptop or tablet
  is treated as touch. Menu items, select items, checkboxes (through a 44px
  label row) and drag grips meet it too.
- **Phone cards:**
  - The whole card is the primary action, and its title carries the accent
    cue.
  - ⋮ is pinned top-right at 44px, only when the row has one.
  - `DataTable` draws a selected card's accent border itself.
  - A tap that fires as the finger lifts after a long-press is ignored.
- **Bottom sheets** all behave the same way:
  - a grabber and swipe-down to dismiss
  - tap the scrim, the close button, Back or Escape to close
  - `env(safe-area-inset-bottom)` under the footer

### States and motion

Every interactive element takes its states from one shared recipe in
`controlStyles.ts`, which every primitive composes:

- **Transition:** colour properties only, 120ms ease-out. Press snaps in at
  40ms. Overlays take 200–250ms. A control never animates a transform.
- **Hover:** one step brighter. Rows and ghost controls use the `panel-2`
  fill and no other. Raw CSS `:hover` goes inside `@media (hover: hover)` so
  it never sticks after a tap.
- **Pressed:** a colour step darker than hover (`active:`). On touch, this is
  the tap feedback.
- **Focus:** a 2px accent outline on every interactive element, navigation
  included.
  - Outset (`outline-offset-2`) on boxed controls and inline links.
  - Inset (`-outline-offset-2`) on full-bleed rows, tabs and nav items.
  - `scroll-padding` keeps a focused row clear of sticky headers and the
    phone tab bar (WCAG 2.4.11).
- **Disabled:** `opacity-40` and `cursor-not-allowed`. When there's a reason
  to show, use `aria-disabled` plus a tooltip instead of the native
  attribute.
- **Loading:** `Button loading` puts a small `Spinner` in place of the
  leading icon and locks the width. The button is `aria-disabled` while it
  runs, and the start and result are announced through a toast or a polite
  live region.
- **Selected / on:**
  - A toggle (`aria-pressed`) takes the accent tint.
  - A selected row takes the accent left border, the `panel-2` fill and an
    accent label. Mark a single active row `aria-current="true"` and a
    multi-select row `aria-selected`.
  - Selected must never look like hover.
- **Reduced motion:** under `prefers-reduced-motion: reduce` there are no
  transitions, no smooth scroll and no pulse. A `Spinner` keeps turning at
  half speed because it carries status.

## 7. Accessibility

- Contrast (WCAG AA ≥ 4.5:1 for text) — measured ratios:

| Pair                                                             | Ratio                 |
| ---------------------------------------------------------------- | --------------------- |
| `text` on `bg` / `panel` / `panel-2`                             | 15.45 / 14.50 / 13.53 |
| `text-dim` on `bg` / `panel` / `panel-2`                         | 7.53 / 7.07 / 6.60    |
| `accent` on `bg` / `panel`                                       | 10.02 / 9.41          |
| `success` on `bg` / `panel`                                      | 10.44 / 9.80          |
| `warning` on `bg` / `panel`                                      | 10.98 / 10.31         |
| `danger` on `bg` / `panel`                                       | 7.28 / 6.84           |
| `isk-pos` / `isk-neg` on `panel`                                 | 10.05 / 7.49          |
| `accent-contrast` on `accent` (primary button)                   | 9.42                  |
| `text-faint` on `bg` (decorative only)                           | 3.54 ⚠                |
| `line-bright` on `panel-2` (resting field border, non-text ≥3:1) | 3.15                  |
| `::selection` fill / `text`                                      | 4.64                  |

Clock-kind tokens (§1) color countdown **text**, so all eight are measured on all three
surfaces — `bg` / `panel` / `panel-2`:

| Token                    | Ratios                |
| ------------------------ | --------------------- |
| `kind-calendar-event`    | 7.42 / 6.97 / 6.51    |
| `kind-skill-training`    | 11.72 / 11.01 / 10.27 |
| `kind-industry-job`      | 8.37 / 7.86 / 7.33    |
| `kind-planet-extraction` | 11.98 / 11.25 / 10.50 |
| `kind-moon-chunk`        | 8.09 / 7.60 / 7.09    |
| `kind-contract-expiry`   | 8.05 / 7.56 / 7.05    |
| `kind-order-expiry`      | 12.54 / 11.78 / 10.99 |
| `kind-skill-plan`        | 12.67 / 11.90 / 11.10 |
| `space-nullsec`          | 7.42 / 6.97 / 6.51    |
| `space-wormhole`         | 11.72 / 11.01 / 10.27 |

Ship Tree golds (§1), also used as text, on `bg` / `panel` / `panel-2`:

| Token           | Ratios              |
| --------------- | ------------------- |
| `mastery-elite` | 10.49 / 9.85 / 9.19 |
| `omega`         | 8.76 / 8.23 / 7.68  |

- `text-faint` and `accent-dim` fail AA by design — restricted to non-text decoration.
- Hairlines are decorative (1.5–2:1), except a field's resting border
  (`line-bright`, 3.15:1 — the non-text 3:1 floor, not the 4.5:1 text one):
  that edge has to be visible on its own since an empty field carries no text
  yet. Every other interactive boundary still carries a text label that meets
  AA independently of its border.
- Focus: visible `outline-accent` ring on all interactive elements (never `outline-none`
  without replacement).
  The exception is a non-interactive `tabIndex={-1}` target that only takes focus
  programmatically — a page's `<h1>`, the route outlet (`app/routeFocus.ts`) and a retried
  read's result (`useRetryFocus`: Retry keeps focus while the read runs or fails again, then
  focus moves to the result, never to `<body>`) —
  which uses `focus:outline-none`: a ring there reads as a control that isn't one.
- Color never the sole signal: ISK deltas keep signs, statuses keep words/icons,
  clock kinds keep their glyph and their written name.
- **The nominal palette (§1) is reinforcement, never the signal.** Eight hues cannot be
  made mutually distinct under dichromacy while staying inside this palette's
  lightness/chroma band; measured separation is ΔE ≥ 28 under normal vision and
  ≥ 21 under protanopia, but industry/orders fall to ΔE 12 under deuteranopia and
  industry/contracts to 10 under tritanopia. That is acceptable **because** nothing is
  encoded by hue alone — it is why the rail's rows carry `KIND_ICON` and the kind's
  name, the filter menu carries labels beside its swatches, and the map and ticker
  name their kinds in `aria-label`. Do not add a surface that paints these hues with
  nothing beside them. `kind-moon-chunk` (a cool grey) was measured for normal vision
  only (ΔE ≥ 30 from every other tone); it leans on the glyph and name like the rest.
- Tabs: full `role="tablist"` semantics + arrow-key navigation.
- Spinners expose `role="status"`; DataAgeBadge exposes absolute timestamp via
  `<time dateTime>` + a `Tooltip`.
