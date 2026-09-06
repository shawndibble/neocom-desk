# Neocom Desk — Design System

Dark-only UI inspired by EVE Online's Photon UI (CCP, 2022+) and eveonline.com:
near-black blue-tinted backgrounds, semi-transparent layered panels, hairline 1px
borders, minimal corner rounding, azure/cyan accent, amber caution, red alert,
condensed uppercase micro-headings. Density over whitespace — this is a data tool.

Tokens live in `src/styles/index.css` (`@theme`, Tailwind v4 CSS-first config).
Live reference: hidden `/styleguide` route (`src/routes/Styleguide.tsx`).

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

| Token         | Value     | Use                                                                          |
| ------------- | --------- | ---------------------------------------------------------------------------- |
| `line`        | `#2a3442` | Default hairline. Always 1px. Panel borders, table row separators, dividers. |
| `line-bright` | `#3d4c5f` | Hover/focus-adjacent borders, emphasized separators.                         |

### Text hierarchy

| Token        | Value     | Use                                                                                                                    |
| ------------ | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| `text`       | `#dee7ee` | Primary content, values, numbers.                                                                                      |
| `text-dim`   | `#95a3b4` | Labels, secondary copy, panel headings, table headers.                                                                 |
| `text-faint` | `#5c6b7a` | **Decorative only** (disabled hints, tick marks, watermark glyphs). Below 4.5:1 — never for content someone must read. |

### Accent + status

| Token             | Value     | Use                                                                                                 |
| ----------------- | --------- | --------------------------------------------------------------------------------------------------- |
| `accent`          | `#57c7f4` | Interactive: links, primary buttons, active tab underline, selection, focus rings, progress.        |
| `accent-dim`      | `#2e7da3` | Accent-tinted borders/fills where full accent is too loud (e.g. selected row border). Not for text. |
| `accent-contrast` | `#04181f` | Text/icon color **on** accent fills (primary button label).                                         |
| `success`         | `#5fd584` | Positive status: training active, order filled, "fresh data".                                       |
| `warning`         | `#f5b94a` | Caution: stale data, low skill, expiring booster.                                                   |
| `danger`          | `#ff7369` | Errors, destructive actions, failed fetch.                                                          |

### ISK / market deltas

| Token     | Value     | Use                                              |
| --------- | --------- | ------------------------------------------------ |
| `isk-pos` | `#4fd98a` | Positive ISK amounts, profit, buy < sell margin. |
| `isk-neg` | `#ff8177` | Negative ISK amounts, loss, fees.                |

Distinct from `success`/`danger` so status badges and money never read as the same
signal in one table. Always pair sign or +/− prefix with color (color-blind safety).

### Security status

`securityStatusColor(security)` (`src/engine/securityStatus.ts`) colors a solar
system's security status on the game's own scale: blue-green across highsec
(`success` at 0.5 blending to `accent` at 1.0), amber toward red across lowsec
and nullsec (`warning` approaching 0.5 from below, blending to `danger` at
-1.0 and beyond). The step at exactly 0.5 is deliberate — it mirrors the
game client's own highsec/lowsec boundary, not an interpolation artifact.
Computed, not a fixed token set: call the function rather than hand-picking a
color, and always render the numeric value (`0.9`, `-0.3`, …) alongside the
color — colour is never the only signal (§7).

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

Sources live in `assets/brand/` (not shipped). Everything under
`public/icons/` and `public/brand/` is generated — edit the sources and rerun
`python3 scripts/generate-brand-assets.py`, never hand-patch the output.

- `LogoMark` (`src/components/ui/`) is the mark for UI use: inline SVG, corner
  brackets on `currentColor` so `--color-accent` drives them. Simplified from
  the artwork, because the bevels and glow read as dirt below ~64px.
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
- Touch tier: `h-11` (44px) on a touch viewport. `h-7`/`h-9` are
  mouse-pointer sizes (WCAG 2.2's 24px floor with room to spare, not a thumb
  target) and reusing them on a phone is what made early drafts of the Assets
  page hard to tap. So the scale is **`sm` = `h-9 md:h-7`, `md` = `h-11
md:h-9`** — pointer users never get the 44px box, touch users never get the
  36px one.
- **The scale lives in one file.** `src/components/ui/controlStyles.ts` holds
  it, and every interactive control reads from it: `Button`, `IconButton`,
  `FilterChip`, `TextInput`, `SearchInput`, `NativeSelect`, `SelectTrigger`.
  A toolbar built from a single `size` value therefore lines up by
  construction. Never hand-write `h-6`/`h-8` on a field — those are what this
  replaced, and they are why a `Select` used to sit taller than the
  `Button size="sm"` beside it. `StatChip` and `DataAgeBadge` are the
  deliberate exception at a flat `h-7`: readouts, not targets.
- Radius: **minimal**. `rounded-xs` (2px) for panels, buttons, chips, inputs.
  `rounded-full` only for avatars, dots, spinners. Never `rounded-md`+ on rectangles.
- Borders: always 1px (`border`), never 2px.

## 4. Component inventory

Built in `src/components/ui/` (✓) or planned (○):

| Component         | Status | Purpose / usage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Panel`           | ✓      | Base surface. Optional uppercase title header + actions slot; the header carries a `panel-2` fill and sits at the `md` control height, so it reads as the panel's own toolbar and anchors a flush table to the frame. Everything lives in a Panel; don't nest Panels — use `panel-2` fills inside.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `Button`          | ✓      | `primary` (accent fill — max one per view), `ghost` (default; hairline border), `danger` (destructive; outline red, never filled). Sizes `sm`/`md`. `align` is `center` by default; `start` is for a full-width button stacked in a column (the Skill Plan tools sidebar), where centred labels of differing lengths leave the leading icons jagged. It has to be a prop rather than a class override — see the JSDoc on `Button.tsx` for why.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `StatChip`        | ✓      | Tiny label+value pair (ISK balance, SP, data counts). Tones: default/accent/success/warning/danger. Rows of chips form a stat strip under a page title. Fixed height, so the chip never shrinks or wraps its own text: put the strip in a plain `flex flex-wrap gap-2` and let whole chips move to the next line. Don't reach for `flex-nowrap` + `overflow-x-auto` to keep a strip on one line — a hidden horizontal scroller loses stats the user has no reason to go looking for.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `DataAgeBadge`    | ✓      | Relative age of API-derived data ("12m ago"). Required on every ESI-backed view — but hidden below `md`: on a phone-width header it crowds out the title and actions, and Settings' Data Age tab lists the same information for every view at once. Auto-tones: <1h dim, 1–24h warning, >24h danger.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `EmptyState`      | ✓      | Centered title+hint+optional action for empty lists / not-yet-fetched views. Never show a bare empty table.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `Tabs`            | ✓      | Controlled horizontal tab bar, accent underline on active. For peer views within a page (e.g. Orders: Open / History). Not for navigation — that's the router.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `Spinner`         | ✓      | Accent arc, sizes sm/md/lg. Inline or centered while loading; prefer skeleton-free simple spinner + DataAgeBadge of last cached data.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Tooltip`         | ✓      | Accessible hover/focus tooltip (`role="tooltip"` + `aria-describedby`) around a single focusable trigger. Radix-backed (ADR 0008): collision-aware placement flips/shifts to stay on-screen and portals to `document.body`, so it's never clipped by a viewport edge or a scrolling ancestor. The bubble is `max-w-56` with no fixed width: it shrink-wraps its text and only wraps past 14rem, so a one-word tooltip is one word wide. `InfoTooltip` variant renders a small "?" button for labeling jargon (ME/TE, EIV, SCC, cost index, Remaps available, StatChip's `tooltip` prop) — 16px glyph over a 24px invisible touch target, so §3's floor holds without changing layout or overlapping a neighbouring control (`HistoryViewSelect` sits one `gap-1` away). On touch the bubble is revealed by a touch-and-hold, or by a plain tap under `openOnTap` — set that on any trigger whose only job is explaining (`InfoTooltip` sets it itself whenever the "?" has no `onClick`), never on one whose tap already does something. A touch-revealed bubble has no timeout: it stays up until a tap outside, a scroll, Escape, or another tap on the same `openOnTap` trigger. |
| `Modal`           | ✓      | Native `<dialog>` + `showModal()`. Platform-supplied focus trap, inert background, Escape-to-close and `::backdrop` — never hand-roll a focus trap. `placement="center"` (default), `"sheet"` (bottom-anchored, mobile nav) or `"wide"` (`max-w-5xl`, for multi-column content such as a comparison matrix). Escape and backdrop click both close.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `DataTable`       | ✓      | Dense table: hairline-underlined uppercase header row (no fill — matches every shipped table), hairline row separators, tabular-nums right-aligned numerics, row hover `panel-2`. No empty branch — callers branch to `EmptyState` themselves. Sorting is opt-in per column via `sortValue`: a column that declares one gets a clickable header (`aria-sort`, ascending/descending toggle, missing values sink to the end); a table that declares none behaves exactly as before. Below `sm` each row collapses into a labelled card — see §4a.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `CharacterAvatar` | ✓      | ESI portrait, `rounded-xs` (house radius, §3), 1px `line` ring; sizes `sm`/`md`/`lg`; accent ring when selected. Decorative by default — pass `alt` only for standalone use.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `FilterBar`       | ✓      | A page's filter row: search box plus its filters inline on a pointer viewport, everything but the search collapsed behind one funnel trigger below `md`, where the sheet's edits are a draft committed with Apply or dropped with Cancel. Filters are written once, as `children(draft, setDraft)`, so the two surfaces cannot drift. `FilterField` captions a control in the sheet only. Reach for it wherever a search box shares its row with selects, date fields or chips — see §4b.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `FilterChip`      | ✓      | Toggleable filter pill. `StatChip`'s dimensions, but interactive: a real `<button>` with `aria-pressed`, accent when on, optional trailing count.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SkillBar`        | ✓      | 5-segment level indicator (filled accent squares = trained, warning segment = training, `line` = untrained).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `LogoMark`        | ✓      | The app mark, inline SVG. Decorative (`aria-hidden`) — every placement sits beside the app name. Size it with `size-*`; corner brackets follow `currentColor`, defaulting to accent. Simplified from the artwork, see §2b.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `IconButton`      | ✓      | Icon-only control with a real accessible name: `label` sets both `aria-label` and the `Tooltip` text, so the two can't drift; `tooltip` shortens the visible bubble only, for a row of per-item actions whose `label` names the item ("Delete Rifter run") but whose tooltip should read "Delete" — it must stay a substring of `label` (WCAG 2.5.3). `pressed` makes it a toggle (`aria-pressed`). `variant`: `ghost` (default, hairline box) / `plain` (no box, for a control nested inside a row). `size`: `md` (default, the `h-11 md:h-9` touch tier, §3) / `sm` (`h-9 md:h-7`, nested-in-a-row). Forwards its ref and spreads unknown props onto the `<button>` — pass it to a Radix `Trigger`'s `asChild` and it works. Prefer this over a bare icon `<Button>` whenever there's no visible label text.                                                                                                                                                                                                                                                                                                                                                                      |
| `PageHeader`      | ✓      | A route's top line: `title` (the page's one `<h1>`), `meta` beside it (the view's `DataAgeBadge`, a count), `actions` right-aligned. Every route uses it — that is what keeps the title, the data age and the controls in the same place page to page. One exception: the three Character-overview tabs (Overview / Clones / Employment History) share `features/character/CharacterHeader` instead, which puts the character's identity and SP where the title would go and keeps the whole block identical as you move between the tabs; a title there would only restate the tab beneath it. It carries no `meta` or `actions` of its own — those tabs hang their `DataAgeBadge` and Refresh on the `Panel` toolbar below the tab strip instead, so nothing above the tabs changes from tab to tab.                                                                                                                                                                                                                                                                                                                                                                              |
| `TextInput`       | ✓      | Single-line field. `size` `sm`/`md` from the shared scale (§3); width is the caller's (`className`). A field holding a number big enough to need separators is `type="text"` + `inputMode`, masked by `src/lib/numberMask.ts` — grouped at rest, plain while focused. `type="number"` cannot hold "338,600", and reformatting under the caret makes a field unusable, so the swap happens on focus and blur. Industry's sourcing fields are the worked example.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `SearchInput`     | ✓      | The one search box: `type="search"`, leading magnifier, fixed at `md`. Use it for every filter-as-you-type field, so they don't drift apart again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `NativeSelect`    | ✓      | A real `<select>` in the house treatment, `appearance-none` with our own caret. **The exception, not the default — reach for `Select` first.** It has no product call sites today, only the Styleguide entry above; it exists for a case that can argue for the OS picker specifically (a very long list on mobile, say). They are styled identically closed, so nothing is gained visually; what is lost is that its open list is the OS menu, which reads as a seam next to any `Select`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `Select`          | ✓      | Radix listbox (ADR 0004): focus movement, typeahead, roving tabindex. **The default select.** `SelectTrigger` takes the same `size` as every other control. `SelectGroup` + `SelectLabel` are the `<optgroup>` equivalent. Two things a `<select>` gives free and this does not: the trigger is a `<button>`, so a wrapping `<label>` or `htmlFor` will not name it — pass `aria-label`; and its values are strings only, so coerce numbers on the way in and out. The trigger never wraps: it is a fixed-height control, so a label wider than the box ellipsizes rather than spilling onto a second line. Size the trigger to its widest expected label; truncation is the safety net, not the plan.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Disclosure`      | ✓      | ARIA disclosure row; caller owns the expanded state so "expand all" can drive it. Its `Caret` is exported for the two surfaces that own too much of their own frame to use the whole component (Skills group headers, the Market Group tree) but must still point the same way.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## 4a. Tables on a phone

A dense table cannot stay a table on a 390px screen. Measured before the fix:
a six-column row rendered 505px wide, which scrolled the whole page sideways
**and** squeezed the name column to 74px, breaking one item name over five
lines. Both failures at once — so neither "let it scroll" nor "let it squash"
was an option.

`DataTable` therefore collapses below `sm` (`responsive="stack"`, the
default): the header row hides, each row becomes a card, one cell becomes the
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

- **One DOM at every width.** The collapse is pure CSS (`.dt-stack` in
  `src/styles/index.css`) — no `sm:hidden`/`hidden sm:flex` pair, nothing
  rendered twice, same rule the Assets page follows. Labels come from
  `data-label`, so they can't drift from the headers, and they add no i18n
  strings.
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
of records does not — or the row is already narrow enough to fit a 390px
screen unaided, roughly two short columns. The contract detail modal's
Included/Requested item tables are that second case: an icon + name and a
quantity fit as they are, so stacking would only spend a 6.5rem gutter on
"QUANTITY: 744" and turn a scannable list into one card per item.

`SkillCompare`'s character-by-skill matrix used to opt out for the
columns-are-the-content reason above, but #406 moved it back to the default
stack: a mobile card per skill, with one level line per compared character,
is a fine trade once the page's own "differing only" toggle keeps the row
count down to what's actually worth scanning — and a sideways-scrolling
matrix couldn't show more than about two characters on a 390px screen
anyway, so the opt-out was buying less than it looked like.

## 4b. Filters on a phone

A filter row is fine at 1280px and is most of the screen at 390px. Wallet's
journal filters — a search box, a ref-type select and two date fields — wrap
to four stacked rows above the table they exist to narrow.

`FilterBar` is the answer, and a page reaches for it once its search box shares
a row with enough filters that collapsing them buys back real height — two or
more controls, in practice. Below `md` it keeps the search box in
the row (it is the panel's primary affordance) and collapses everything else
behind one funnel `IconButton`; that opens a `Modal placement="sheet"` holding
the same controls, stacked full width, over a sticky Apply / Cancel bar.

Three things about it are deliberate:

- **The sheet is a draft, the row is not.** Inline, an edit lands on the page
  immediately, which is right when the list is visible beside the control. In
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

## 6. Usage rules

- **Dark only.** No light theme. `color-scheme: dark` is set globally.
- **No gradients, anywhere.** Flat fills only (`bg-accent/10`, `bg-panel-2`,
  …). Depth comes from the layering step below, not a fade.
- Layering: `bg` → `panel` → `panel-2`. Depth via background steps + hairlines,
  not shadows. Shadows only for popovers/menus (`shadow-lg shadow-black/50`).
- One `primary` button per view; everything else `ghost`.
- Accent = interactive/selected. Don't use accent for static decoration.
- Status colors carry meaning; never use them decoratively. ISK amounts use
  `isk-pos`/`isk-neg`, not success/danger.
- Density: tables are the norm; avoid card grids for data lists.
- Every API-derived view shows a `DataAgeBadge` — hidden below `md`, where
  Settings' Data Age tab carries the same information instead.

## 7. Accessibility

- Contrast (WCAG AA ≥ 4.5:1 for text) — measured ratios:

| Pair                                           | Ratio                 |
| ---------------------------------------------- | --------------------- |
| `text` on `bg` / `panel` / `panel-2`           | 15.45 / 14.50 / 13.53 |
| `text-dim` on `bg` / `panel` / `panel-2`       | 7.53 / 7.07 / 6.60    |
| `accent` on `bg` / `panel`                     | 10.02 / 9.41          |
| `success` on `bg` / `panel`                    | 10.44 / 9.80          |
| `warning` on `bg` / `panel`                    | 10.98 / 10.31         |
| `danger` on `bg` / `panel`                     | 7.28 / 6.84           |
| `isk-pos` / `isk-neg` on `panel`               | 10.05 / 7.49          |
| `accent-contrast` on `accent` (primary button) | 9.42                  |
| `text-faint` on `bg` (decorative only)         | 3.54 ⚠                |

- `text-faint` and `accent-dim` fail AA by design — restricted to non-text decoration.
- Hairlines are decorative (1.5–2:1); interactive boundaries always carry a text label
  that meets AA on its own.
- Focus: visible `outline-accent` ring on all interactive elements (never `outline-none`
  without replacement).
- Color never the sole signal: ISK deltas keep signs, statuses keep words/icons.
- Tabs: full `role="tablist"` semantics + arrow-key navigation.
- Spinners expose `role="status"`; DataAgeBadge exposes absolute timestamp via
  `<time dateTime>` + `title`.
