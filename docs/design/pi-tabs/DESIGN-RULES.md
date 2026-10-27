# Neocom Desk — design rules for mockups

Refs: `app-ref/*.png` (origin/main, 2026-10-05).

**Tokens:** bg `#0a0e14` · panel `#11161d` · panel-2 `#161d27` · line `#2a3442` · line-bright `#586c86` · text `#dee7ee` · text-dim `#95a3b4` · text-faint `#5c6b7a` (decorative only) · accent `#57c7f4` · accent-dim `#2e7da3` (fills/borders, never text) · accent-contrast `#04181f` · success `#5fd584` · warning `#f5b94a` · danger `#ff7369` · isk-pos `#4fd98a` · isk-neg `#ff8177`.
Font `'Segoe UI', Roboto, 'Helvetica Neue', Arial, system-ui, sans-serif`. `tracking-widest` = `letter-spacing: .1em`. Radius `2px` everywhere (`rounded-full` only for dots/avatars/meter tracks). Borders 1px.

## 1. Interactive vs display

- **A box means "click me."** Bordered small elements = Button, IconButton, FilterChip, SegmentedControl, Select, TextInput. Static facts get **type + colour**, never a box.
- Read-only data shows as: **StatChip** strips, **micro-headings** (11px uppercase dim), plain text rows split by `1px line` hairlines, **DataTable**, a big tabular number (`30px semibold`, tone colour) beside an 11px dim caption.
- **Panel is the only bordered display container.** Never nest Panels; inside one use `panel-2` fills or hairlines.
- Clickable rows exist (PI colony list: whole row is a button, trailing `›` chevron, hover `panel-2`). No clickable "cards" with shadow/rounded corners.
- Tone colours carry meaning only: success/warning/danger for status, isk-pos/isk-neg for money (with +/− sign), accent only for interactive/selected.
- Exception shipping in PI: VerbTag/TierChip/EstimateBadge (and Advisor fault chips) are static 18px *tags*, smaller than any control. Use sparingly, as labels only.

## 2. Component CSS

**Control heights:** `sm` = 28px desktop / 36px phone; `md` = 36px desktop / 44px phone. Focus: `outline: 2px solid accent; outline-offset: 2px`. Disabled: `opacity: .4`.

- **Panel:** `border:1px solid line; background: rgba(17,22,29,.85); backdrop-filter: blur(4px); radius 2px`. Header: `min-height 36px (44 phone); padding 4px 12px; background panel-2; border-bottom 1px line; flex, space-between, gap 8px`. Title `h2`: 11px, 600, .1em, uppercase, text-dim. `meta` sits after the title (count/DataAgeBadge); `actions` right, `gap 4px`, all `sm`. Body `padding 12px` (or flush for tables).
- **StatChip:** `inline-flex; height 28px; gap 6px; font-size 11px; nowrap`. Label 600 .1em uppercase text-dim; value 500 tabular-nums in tone (text/accent/success/warning/danger). No border, no fill. **StatChips** strip: `gap 12px`, each chip `padding-left 12px`, divider = `1px × 14px` `line` bar vertically centred at its left; first chip on each line has none. Dense: 8px.
- **Button:** `inline-flex; gap 6px; border 1px; radius 2px; 600; .1em; uppercase`. md `px 16px, 12px`; sm `px 10px, 11px`.
  - primary: bg+border accent, text accent-contrast, hover bg `accent/.85` (max one per view)
  - ghost (default): border line, transparent, text; hover border line-bright + bg panel-2
  - accent: border accent, transparent, text accent; hover bg `accent/.10`
  - danger: border `danger/.6`, text danger, never filled; hover border danger + bg `danger/.10`
- **IconButton:** square 36px (md) / 28px (sm, row); ghost = `border line; bg panel-2; color text-dim; hover border line-bright, color text`. plain = no border/bg. pressed = `bg accent/.12; border+color accent`. Icons 16–18px Phosphor-style line icons.
- **FilterChip:** sm height, `px 10px; 11px 600 .1em uppercase; gap 6px`; off `border line; bg panel-2; text-dim` (hover line-bright/text); on `border accent-dim; bg accent/.15; color accent`. Optional count 500 tabular.
- **SegmentedControl:** one box `border 1px line; radius 2px; overflow hidden`; segments `px 12px`, 11px 600 .1em uppercase, `border-left 1px line` between; selected `bg accent/.15; color accent`; idle text-dim.
- **TextInput / Select trigger:** `border 1px line-bright; bg panel-2; color text; radius 2px`; md `px 12px; 14px`, sm `px 8px; 12px`; placeholder text-dim. Select: value + caret (text-dim) space-between, ellipsis. Open menu: `bg panel; border line; black/.5 shadow; p 4px`, items 14px, highlight panel-2.
- **Checkbox:** native, 16px, `accent-color: accent`.
- **Tabs / PageTabs:** list `flex; gap 4px; border-bottom 1px line`. Item `height 36px (44 phone); px 12px; 12px 600 .1em uppercase; border-bottom 2px; margin-bottom -1px`. Active `border accent; bg rgba(22,29,39,.6); color text`. Idle transparent border, text-dim, hover bg panel-2/.4.
- **VerbTag:** `height 18px; px 6px; border 1px; radius 2px; 11px 600 .1em uppercase`. add/build/swap/start `border accent/.45; bg accent/.10; accent` · remove/stop same in warning · rebuild `border line-bright; text-dim` · as-is `bg panel-2; text-dim; no border`.
- **TierChip:** 18px, `border line; bg panel-2; text-dim`, 11px uppercase ("P2"). **EstimateBadge:** 18px, `border warning/.6; color warning`, uppercase.
- **LoadMeter:** row `gap 6px`: 11px uppercase dim label · track `height 6px; flex 1; radius 9999px; bg panel-2` with fill accent (warning when tight) · `min-width 28px` right-aligned 11px dim tabular %.
- **DataAgeBadge:** `inline-flex; gap 6px; 11px tabular`; 6px round dot in `currentColor` + "12m ago". <1h text-dim, <24h warning, else danger. Hidden below 768px.
- **InfoTooltip "?":** `16px circle; border 1px line; 10px; text-dim`; hover border line-bright. Bubble: `max-width 224px; bg panel; border line; p 8px; 11px text-dim; shadow`.
- **Inline link:** `color accent; font-weight 500; text-decoration underline`. Text action ("Transactions →", "Clear"): 11px 600 .1em uppercase accent, underline on hover only, no box.
- **EmptyState:** centred column, `gap 8px; padding 40px 16px`; title 14px 600 .1em uppercase text-dim; hint 12px text-dim max-width 384px; optional sm Button below (`mt 8px`).
- **CollapsiblePanel:** Panel whose last header action is a sm ghost IconButton caret; collapsed shows a one-line summary.
- **DataTable:** `width 100%; font-size 12px`. Header row `border-bottom 1px line; text-dim; 600 uppercase` (no fill), `padding 8px 12px`. Cells `padding 6px 12px`; rows divided `1px line`; hover bg panel-2. Numbers right-aligned tabular-nums. Compact: `4px 8px`. **Phone (<640px):** header hidden; each row a block `padding 8px 12px`; primary cell first, 600, no label; other cells `padding 2px 0 2px 112px` with label pinned left (`104px wide; 10px; .1em uppercase; text-dim`); everything left-aligned.
- **TypeIcon:** EVE item icon, source 32/64/128, shown ~20–32px in rows, 64px in headers. No border.

## 3. Page chrome

- **Page header:** `min-height 36px; flex; gap 8px`. h1 `20px 600 .1em uppercase text`, then DataAgeBadge, actions right (`gap 6px`, md ghost IconButtons: settings, refresh). Content area `padding 16px` (8px phone sides), gap ~16px between blocks.
- **PageTabs** directly under the header (see Tabs).
- **Left rail** (≥768px): `width 208px; bg panel/.85; border-right line; sticky full-height`. Brand row (logo + "NEOCOM DESK" 12px 600 uppercase), "Go to… Ctrl K" field, group captions 10px 600 uppercase dim, items `12px 600 .1em uppercase` with icon; active `border line-bright; bg panel-2; color accent`; sub-items normal-case 12px, `border-left 1px` (active accent). Character footer.
- **Mobile bottom nav** (<768px): fixed, `border-top line; bg panel/.95; blur`; 5 equal items (icon over 10px 600 uppercase label); active `border-top 2px accent; bg panel-2; accent`.

## 4. Type, spacing, density

Scale: 11px chips/badges/micro-headings · 12px labels, tables, row text · 14px body · 16px emphasised values · 20px page title · 30px hero numbers only. Micro-heading: `11px 600 .1em uppercase text-dim`. Numbers `tabular-nums`, right-aligned in tables. Spacing: panel p 12px, gaps 8–12px. Detail lines join with " · ". Layering bg → panel → panel-2; shadows only on menus/tooltips. Dark only.

## 5. Do / Don't

Do: Panel + panel-2 header per block · StatChip strips for headline numbers · tables/hairline rows for lists · one primary per view · flat fills (`accent/.15`) · status colour on text.
Don't: border/box around a static fact, count or status word · rounded >2px rectangles, pill shapes · gradients (any), glows, coloured shadows, drop shadows on panels · card grids for data lists · nested panels · accent for decoration · 2px borders (except tab/selection stripe) · emoji · mixed-case micro-headings · big padding/whitespace (this is a dense data tool) · colour as the only signal.
