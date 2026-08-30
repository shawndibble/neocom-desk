# NeoCom Desk — Design System

Dark-only UI inspired by EVE Online's Photon UI (CCP, 2022+) and eveonline.com:
near-black blue-tinted backgrounds, semi-transparent layered panels, hairline 1px
borders, minimal corner rounding, azure/cyan accent, amber caution, red alert,
condensed uppercase micro-headings. Density over whitespace — this is a data tool.

Tokens live in `src/styles/index.css` (`@theme`, Tailwind v4 CSS-first config).
Live reference: hidden `/styleguide` route (`src/routes/Styleguide.tsx`).

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
- Type scale, at the browser-default 16px root: `text-[0.6875rem]` chips/badges ·
  12px `text-xs` labels/headers ·
  14px `text-sm` body/data (default) · 16px `text-base` emphasized values ·
  20px `text-xl` page titles · 30px `text-3xl` hero numbers only. Written in
  `rem`, never `px` — a literal `text-[11px]` would not scale with the root
  and inverts the hierarchy against its `rem` neighbours.

## 3. Spacing & radius

- Spacing: Tailwind v4's default `rem`-based scale (`--spacing: 0.25rem`;
  not overridden by this project's `@theme` block, which only sets
  colors/fonts) — sizes below are the values at the browser-default 16px
  root and scale with it. Dense defaults — panel padding `p-3`, table cell
  `px-3 py-1.5`, control heights `h-7` (28px, compact) / `h-9` (36px, default).
- Radius: **minimal**. `rounded-xs` (2px) for panels, buttons, chips, inputs.
  `rounded-full` only for avatars, dots, spinners. Never `rounded-md`+ on rectangles.
- Borders: always 1px (`border`), never 2px.

## 4. Component inventory

Built in `src/components/ui/` (✓) or planned (○):

| Component         | Status | Purpose / usage                                                                                                                                                                                                                                                                                          |
| ----------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Panel`           | ✓      | Base surface. Optional uppercase title header + actions slot. Everything lives in a Panel; don't nest Panels — use `panel-2` fills inside.                                                                                                                                                               |
| `Button`          | ✓      | `primary` (accent fill — max one per view), `ghost` (default; hairline border), `danger` (destructive; outline red, never filled). Sizes `sm`/`md`.                                                                                                                                                      |
| `StatChip`        | ✓      | Tiny label+value pair (ISK balance, SP, data counts). Tones: default/accent/success/warning/danger. Rows of chips form a stat strip under a page title.                                                                                                                                                  |
| `DataAgeBadge`    | ✓      | Relative age of API-derived data ("12m ago"). Required on every ESI-backed view. Auto-tones: <1h dim, 1–24h warning, >24h danger.                                                                                                                                                                        |
| `EmptyState`      | ✓      | Centered title+hint+optional action for empty lists / not-yet-fetched views. Never show a bare empty table.                                                                                                                                                                                              |
| `Tabs`            | ✓      | Controlled horizontal tab bar, accent underline on active. For peer views within a page (e.g. Orders: Open / History). Not for navigation — that's the router.                                                                                                                                           |
| `Spinner`         | ✓      | Accent arc, sizes sm/md/lg. Inline or centered while loading; prefer skeleton-free simple spinner + DataAgeBadge of last cached data.                                                                                                                                                                    |
| `Tooltip`         | ✓      | Accessible hover/focus tooltip (`role="tooltip"` + `aria-describedby`) around a single focusable trigger. `InfoTooltip` variant renders a small "?" button for labeling jargon (ME/TE, EIV, SCC, cost index, Remaps available, StatChip's `tooltip` prop).                                               |
| `Modal`           | ✓      | Native `<dialog>` + `showModal()`. Platform-supplied focus trap, inert background, Escape-to-close and `::backdrop` — never hand-roll a focus trap. `placement="center"` (default) or `"sheet"` (bottom-anchored, mobile nav). Escape and backdrop click both close.                                     |
| `DataTable`       | ✓      | Dense table: hairline-underlined uppercase header row (no fill — matches every shipped table), hairline row separators, tabular-nums right-aligned numerics, row hover `panel-2`. Presentational only — callers pre-sort and branch to `EmptyState` themselves; sorting lands when a call site needs it. |
| `CharacterAvatar` | ✓      | ESI portrait, `rounded-xs` (house radius, §3), 1px `line` ring; sizes `sm`/`md`/`lg`; accent ring when selected. Decorative by default — pass `alt` only for standalone use.                                                                                                                             |
| `FilterChip`      | ✓      | Toggleable filter pill. `StatChip`'s dimensions, but interactive: a real `<button>` with `aria-pressed`, accent when on, optional trailing count.                                                                                                                                                        |
| `SkillBar`        | ✓      | 5-segment level indicator (filled accent squares = trained, warning segment = training, `line` = untrained).                                                                                                                                                                                             |

## 5. Usage rules

- **Dark only.** No light theme. `color-scheme: dark` is set globally.
- Layering: `bg` → `panel` → `panel-2`. Depth via background steps + hairlines,
  not shadows. Shadows only for popovers/menus (`shadow-lg shadow-black/50`).
- One `primary` button per view; everything else `ghost`.
- Accent = interactive/selected. Don't use accent for static decoration.
- Status colors carry meaning; never use them decoratively. ISK amounts use
  `isk-pos`/`isk-neg`, not success/danger.
- Density: tables are the norm; avoid card grids for data lists.
- Every API-derived view shows a `DataAgeBadge`.

## 6. Accessibility

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
