# K — Build-vs-Buy Library Survey

Repo: `/Users/shawndibble/Documents/neocom-desk` @ commit `c38389f`.
Investigation only. No repo files were created, edited, or staged. The bundle
measurements below (§1, §10a, §10b) were taken at that commit; several of the
findings have since shipped — each is marked ALREADY DONE where that's the case.

---

## Headline

**One new dependency has since been accepted, not yet installed: `radix-ui`
(size unmeasured). Everything else on this list is a BUILD/NATIVE call, 0 KB.**

The single largest bundle finding on this list was not a library to add — it
was a library already installed and shipping ~3× more than it needed to. That
finding has already been acted on: aliasing `firebase/firestore` →
`firebase/firestore/lite` (§10a, **shipped**) and deferring the rest of
Firebase off the entry-chunk critical path (§10b, **shipped**) together
removed roughly the 102.5 + 58 KB gzip this survey measured at commit
`c38389f`, before either fix landed — see §10a/§10b for the as-shipped state.

Since this survey, `docs/adr/0004-radix-for-menu-primitives-only.md` (Accepted
2026-08-30) adopted the single `radix-ui` package for ContextMenu, DropdownMenu
and Select — three surfaces this survey didn't anticipate needing a listbox for
row-by-row. `radix-ui` is not yet in `package.json`, so there is no code
contradiction today, but this brief's headline can no longer say "recommended
new dependencies: none." See the Radix note under §4 for how that ADR's choice
relates to (and does not overturn) this survey's native-first verdicts.

---

## 1. Measured baseline — what shipped at commit `c38389f`

**Superseded by §10a/§10b, both since shipped** — this attribution predates the
`firestore/lite` swap and the Firebase entry-chunk deferral, so it no longer
describes the current bundle. Kept as the historical baseline the rest of this
survey's savings figures were measured against.

`dist/assets/index-D0GV_9Lb.js` was **1,125,510 bytes raw / 334.2 KB gzip in a
single chunk** (no code splitting) at that commit. To attribute it, I built the real
`vite.config.ts` with a `manualChunks` overlay from a scratch config
(`--outDir` pointed outside the repo; the repo config was not touched):

| Chunk                                 | raw KB | **gzip KB** | % of JS |
| ------------------------------------- | -----: | ----------: | ------: |
| `firebase/firestore` (full SDK)       |  384.4 |  **109.25** | **32%** |
| `react` + `react-dom`                 |  178.7 |       56.46 |     16% |
| app code (all of `src/`)              |  164.4 |       43.04 |     13% |
| `dexie`                               |  103.9 |       34.23 |     10% |
| `firebase/auth`                       |   97.1 |       29.45 |      9% |
| `firebase/app` + `firebase/functions` |   58.7 |       21.37 |      6% |
| `i18next` + `react-i18next`           |   48.8 |       15.97 |      5% |
| `@dnd-kit/*`                          |   47.7 |       15.69 |      5% |
| `react-router`                        |   39.4 |       14.15 |      4% |
| misc vendor + zustand + runtime       |    7.1 |        3.09 |      1% |
| **total JS**                          |        |   **342.7** |         |
| CSS (`index-CjfybfQF.css`)            |   29.0 |        6.14 |         |

(Chunked total 342.7 vs single-chunk 334.2 — splitting costs ~8 KB of shared
gzip dictionary. Use 334 KB as the real baseline.)

Plus `public/data/*.json`: **2.29 MB** — `blueprints.json` 1.42 MB,
`types.json` 712 KB, `skills.json` 106 KB. All precached by the PWA
(vite.config.ts's PWA `globPatterns` includes `json`), so first load is
already ~2.6 MB before any new dependency.

### Candidate library costs (measured, not looked up)

Each entry bundled standalone with esbuild `--bundle --minify --format=esm`,
React/ReactDOM externalized, `NODE_ENV=production`, then `gzip -9`. Real
marginal cost in-app is ~10% lower (shared gzip dictionary).

| Package                             | Version | Published  | raw KB | **gzip KB** | Ships CSS | React 19 peer  | `sideEffects` |
| ----------------------------------- | ------- | ---------- | -----: | ----------: | --------- | -------------- | ------------- |
| `@tanstack/react-table` (core+sort) | 9.2.4   | 2026-08-28 |   41.0 |    **13.5** | no        | `>=18` ✓       | `false` ✓     |
| `@tanstack/react-virtual`           | 3.14.10 | 2026-08-18 |   24.3 |     **7.5** | no        | explicit ^19 ✓ | `false` ✓     |
| `react-window` (List)               | 2.3.0   | 2026-07-20 |    8.7 |     **3.4** | no        | explicit ^19 ✓ | unset ⚠       |
| `@radix-ui/react-popover`           | 1.1.23  | 2026-07-24 |   70.1 |    **25.2** | no        | explicit ^19 ✓ | `false` ✓     |
| Radix popover + dialog + checkbox   | 1.1/1.3 | 2026-07-31 |   79.4 |    **27.5** | no        | ✓              | `false` ✓     |
| `@base-ui/react` — Popover **only** | 1.7.0   | 2026-08-04 |  126.7 |    **44.3** | no        | ^17\|18\|19 ✓  | `false` ✓     |
| `@base-ui/react` — 5 components     | 1.7.0   | 2026-08-04 |  223.0 |    **74.9** | no        | ✓              | `false` ✓     |
| `react-hotkeys-hook`                | 5.3.3   | 2026-06-26 |    6.6 |     **2.7** | no        | `>=16.8` ✓     | `false` ✓     |
| `fast-xml-parser`                   | 5.11.1  | 2026-08-27 |   64.5 |    **21.6** | n/a       | n/a            | n/a           |
| `txml` (`txml/txml` `parse`)        | 6.0.1   | 2026-08-14 |    4.7 |     **2.0** | n/a       | n/a            | n/a           |
| `pako` (`ungzip`)                   | 3.0.1   | 2026-07-06 |   30.9 |    **10.4** | n/a       | n/a            | n/a           |
| `papaparse`                         | 5.7.0   | 2026-08-24 |   24.8 |     **7.3** | n/a       | n/a            | n/a           |

All are actively maintained (every one published within the last 3 months).
Maintenance health is **not** the reason to decline any of them.

Two compat notes that matter:

- **`@base-ui/react` declares `date-fns@^4` and `@date-fns/tz@^1.2` as
  peerDependencies.** For a project with zero date-library need (§9), that is a
  bad smell on top of being 44.3 KB gzip for a single popover.
- **`@tanstack/react-table` 9.x is a rewritten API.** `useReactTable` /
  `getCoreRowModel` / `flexRender` no longer exist on the main entry — v9 uses
  `useTable` + `tableFeatures` + `createSortedRowModel` + `<FlexRender>`, with
  the v8 API quarantined behind `@tanstack/react-table/legacy`. Adopting today
  means adopting a <1-year-old API surface with a migration already behind it.

---

## Recommendation table

| #   | Surface                                      | Verdict                       | Library + version                           |    gzip KB | Why                                                                                                                                                                                                                              |
| --- | -------------------------------------------- | ----------------------------- | ------------------------------------------- | ---------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Dense sortable `DataTable`                   | **BUILD — SHIPPED**           | — (TanStack Table 9.2.4 declined)           |          0 | Built as `components/ui/DataTable.tsx`, adopted by Wallet (journal + transactions), Contracts, Orders. `Market.tsx` and `MaterialsTable.tsx` are the two remaining hand-written tables.                                          |
| 2   | List virtualization                          | **BUILD / NATIVE**            | — (`content-visibility: auto`)              |          0 | 511 skills × 10 chars is not a virtualization problem. Assets is unbounded — fix with a cap, not a virtualizer.                                                                                                                  |
| 3   | Keyboard shortcuts                           | **BUILD**                     | — (`react-hotkeys-hook` 5.3.3 declined)     |          0 | Lib gives the easy half (matcher, input guard). The registry, OS labels, i18next routing, and help sheet are yours regardless.                                                                                                   |
| 4a  | Dialogs (shortcuts sheet, settings, import)  | **NATIVE — SHIPPED**          | `<dialog>.showModal()`                      |          0 | Built as `components/ui/Modal.tsx`; `ImportClipboardDialog` and the mobile "More" sheet in `Layout.tsx` both use it now.                                                                                                         |
| 4b  | Popovers (bell, filter chips)                | **NATIVE**                    | Popover API (`popover` attr)                |          0 | Light dismiss + Escape + top layer, Baseline widely available Apr 2025.                                                                                                                                                          |
| 4c  | Checkbox                                     | **NATIVE**                    | `<input type=checkbox>` + `appearance-none` |          0 | Radix Checkbox only restyles a box Tailwind v4 already restyles. Native keeps form semantics.                                                                                                                                    |
| 4d  | Scope picker                                 | **NATIVE, conditional**       | — (Radix if true listbox)                   |   0 / 27.5 | Checkbox list in a `<dialog>` = native. Only a real `aria-activedescendant` listbox justifies Radix.                                                                                                                             |
| 4e  | Menu-family (context menu, dropdown, select) | **BUY — accepted (ADR 0004)** | `radix-ui`                                  | unmeasured | Not covered by this survey (Market Browser context menu wasn't scoped here). Decided separately; doesn't overturn 4a–4c's native verdicts, which the ADR itself keeps.                                                           |
| 5   | CSV serialization                            | **BUILD — SHIPPED**           | — (`papaparse` 5.7.0 declined)              |          0 | Built as `src/lib/csv.ts`, BOM and formula-injection guard included. `toCsv` owns the BOM — do not prepend one at the call site.                                                                                                 |
| 6   | XML parsing (`.emp`)                         | **NATIVE**                    | `DOMParser` at a feature-layer seam         |          0 | Browser `DOMParser` cannot do XXE at all; `fast-xml-parser` has 4 CVEs. Native wins the _security_ axis.                                                                                                                         |
| 7   | Gzip decompression                           | **NATIVE**                    | `DecompressionStream('gzip')`               |          0 | Baseline widely available since May 2023. `pako` buys nothing and is worse for bomb defence.                                                                                                                                     |
| 8   | "What's new" panel                           | **BUILD**                     | — (structured JSON)                         |          0 | A Markdown body cannot go through i18next — a renderer fights CLAUDE.md, costs 18–40 KB, and adds XSS surface.                                                                                                                   |
| 9   | Date / duration formatting                   | **ALREADY HAVE / NATIVE**     | `Intl.NumberFormat` + `src/lib/duration.ts` |          0 | Everything needed is `Date.parse` + `toLocaleString` + `Intl.NumberFormat`. A date lib would be a regression.                                                                                                                    |
| 10a | Firestore SDK size                           | **SWAP — SHIPPED**            | `firebase/firestore/lite`                   | **−102.5** | No `onSnapshot` anywhere; every API used exists in `lite`. `firebaseApp.ts` and `planSync.ts` both import from `firebase/firestore/lite` now.                                                                                    |
| 10b | Firebase in entry chunk                      | **DEFER — SHIPPED**           | `await import('./planSync')`                |    **−58** | `src/sync/index.ts` is now the code-splitting boundary it recommends: every Firebase-reaching export is a thin `await import('./planSync')` wrapper; `App.tsx`'s `triggerSync` import resolves to that wrapper, not to Firebase. |
| 10c | Route code splitting                         | **BUILD**                     | `React.lazy`                                |   −(large) | Still no route-level splitting anywhere in the repo — one entry chunk for all routes.                                                                                                                                            |
| 10d | Triplicated `formatIsk`                      | **BUILD — SHIPPED**           | consolidate into `src/lib/isk.ts`           |         ~0 | Done for `formatIsk`/`clampIskZero`. `formatPercent`/`formatSignedPercent` (§10e) have not followed yet — still duplicated between `features/industry/format.ts` and `features/market/format.ts`.                                |

**Aggregate gzip cost of everything recommended for purchase at survey time: 0
KB — now one unmeasured exception (`radix-ui`, §4e), decided after this survey
and outside its scope.**
**Aggregate gzip saved by the removals in §10: ~100–160 KB (30–48% of the
pre-Phase-0 JS) — §10a and §10b have both since shipped; §10c has not.**

---

## 1. Dense sortable `DataTable` — **BUILD, shipped**

This shipped as `src/components/ui/DataTable.tsx` (a `DataTableColumn<T>`
descriptor — `id`, `header`, `align?`, `className?`, `cellClassName?`,
`render` — plus `rows`, `rowKey`, `rowClassName`, and an accessible `label`).
It's deliberately presentational: no sort state or `aria-sort` inside it, since
every call site pre-sorts its own rows in a `useMemo` before handing them to
the table (see the sort call sites below) — a narrower, and arguably better,
scope than the `useState`-sort-plus-`aria-sort` design this section originally
proposed.

Adopted at four of the original six call sites: Wallet's journal and
transactions tables (`src/routes/Wallet.tsx`, two `DataTable` uses), Contracts
(`src/routes/Contracts.tsx`), and Orders (`src/routes/Orders.tsx`, two
`DataTable` uses for current orders and history). **Two remain hand-written
`<table>` markup and are what's actually left to do here:**
`src/routes/Market.tsx` and `src/features/industry/MaterialsTable.tsx`.

The "hard" part TanStack Table would have solved — sorting — was already
solved without it, 6 lines at a time, with plain `Array.prototype.sort`, and
still is at the surviving call sites:

- `Wallet.tsx`'s journal/transaction `useMemo`s (date desc)
- `Mail.tsx`'s header sort
- `Assets.tsx`'s entries-by-name then groups-by-label sort
- `features/industry/jobs.ts`'s job-list sort

(`CurrentQueuePanel.tsx`, cited here in the original survey, no longer sorts
anything — check before reusing that citation.)

**Condition that would flip this to BUY:** column pinning, column grouping
(multi-row headers), column resizing, or faceted filter value sets. Still
worth checking against `Market.tsx`'s and `MaterialsTable.tsx`'s actual needs
before assuming `DataTable` as shipped covers them as-is — but note that even a
flip would mean TanStack v9's new API, not the v8 examples most tutorials show.

## 2. List virtualization — **BUILD / NATIVE**, with one real caveat

Honest answer on the row counts:

- **Skill comparison grid.** `public/data/skills.json` contains **511 skills**
  (counted). 511 rows × 10 characters = ~5,100 cells. That is a normal DOM.
  Chrome renders it in well under a frame budget on any machine that can run
  this app. Virtualizing it costs 7.5 KB gzip plus the permanent complexity of
  measurement, scroll restoration, and sticky headers-inside-a-virtual-list —
  for no user-visible gain.
- **Wallet journal / transactions.** Transactions are **explicitly bounded in
  code**: `src/esi/endpoints.ts`'s `getCharacterWalletTransactions` caps the
  cursor walk at `MAX_TRANSACTION_PAGES = 5`, with a comment stating full
  history is unbounded and only recent activity is wanted. The journal fetcher
  in the same file does fetch every X-Page, but ESI only retains ~30 days of
  journal, so it lands in the low thousands. Neither needs a virtualizer; if
  the journal ever feels slow, apply the same explicit page cap the
  transactions endpoint already sets a precedent for.
- **Assets — this one is genuinely unbounded.**
  `src/features/character/assets.ts` calls `loadWithCache(…, () =>
getCharacterAssets(characterId))`, which goes through `src/esi/paginated.ts`'s
  `fetchAllPages` — which fetches **every** page (1,000 assets each), with no
  cap of the kind `getCharacterWalletTransactions` sets for itself.
  `src/routes/Assets.tsx` then maps every location group, and every asset
  inside each group, into an `<li>`, unbounded. A hauler or industry alt with
  20k+ assets renders 20k list items on one page.

For assets, reach for virtualization **last**, not first. Cheaper fixes in order:

1. `Assets.tsx`'s search input already filters — default to
   showing only the top N location groups, expand on click.
2. `content-visibility: auto` + `contain-intrinsic-size: auto 26px` on each
   `<li>` (or on each location `<Panel>`). Zero JS, zero dependency, and the
   browser skips layout+paint for off-screen rows. Baseline (newly available)
   since Sep 2024 — Chrome 85, Firefox 125, Safari 18. Note it is _not_ yet
   Baseline widely available, so treat it as a progressive enhancement: on an
   old Safari you get today's behavior, which is what ships now anyway.
3. Only if 1 and 2 are insufficient: **`react-window` 2.3.0 at 3.4 KB gzip**
   beats TanStack Virtual (7.5 KB) for a plain fixed-height list, which is all
   this is. But note that both fight the grouped-by-location structure — you
   would have to flatten groups into a single index space with sticky headers,
   which is more work than options 1 and 2 combined.

## 3. Keyboard shortcuts — **BUILD** (closest call on this list)

`react-hotkeys-hook` 5.3.3 is 2.7 KB gzip, zero runtime dependencies,
`sideEffects: false`, published 2026-06-26. It is a good library and it does
handle the "don't fire inside text inputs" requirement correctly —
`enableOnFormTags` defaults to off, so `input`/`textarea`/`select` are excluded
unless you opt in.

But look at what it does _not_ do, which is the majority of the stated
requirement:

- **No app-wide registry.** You still need a module that owns the list of
  shortcuts so the help sheet can enumerate them. The library registers hooks
  imperatively at each call site; there is no introspectable list.
- **No OS-correct labels.** Nothing in the library turns `mod+k` into `⌘K` on
  macOS and `Ctrl+K` elsewhere. That is yours:
  `navigator.userAgentData?.platform ?? navigator.platform` → `/mac|iphone|ipad/i`
  → `⌘`/`⌥`/`⇧`/`⌃` vs `Ctrl`/`Alt`/`Shift`.
- **No i18next routing.** Shortcut _descriptions_ are UI strings and must go
  through i18next per CLAUDE.md. The registry has to hold i18n keys, not text.

So you write the registry, the label renderer, and the help sheet regardless.
What is left for the library is one `window.addEventListener('keydown')`, a
`{ key, meta, ctrl, shift, alt }` matcher, and a
`target instanceof HTMLElement && (target.isContentEditable ||
['INPUT','TEXTAREA','SELECT'].includes(target.tagName))` guard. That is ~50
lines, and the matcher belongs in `src/engine`-adjacent pure code
(`src/lib/shortcuts.ts`) where it can be TDD'd with plain objects — exactly the
project's stated preference.

Shape it as: `src/lib/shortcuts.ts` (pure — `parseCombo`, `matchesCombo`,
`formatCombo(combo, platform)`; fully unit-testable, no DOM) +
`src/app/ShortcutProvider.tsx` (one listener, registry in context) +
`useShortcut(id, handler)`. The help sheet then just maps over the registry.

If the team disagrees and wants the dependency, 2.7 KB is cheap and I would not
fight it — this is the one BUY on the list I would call defensible.

## 4. Popover / dialog / checkbox primitives — **NATIVE**, split by focus management

Accessibility is the right reason to consider buying. It is also the reason
native wins here, because the platform now does the specific hard parts.

Apply one test per surface: **does it need focus containment and an inert
background?**

| Surface                          | Needs focus trap?   | Verdict                    |
| -------------------------------- | ------------------- | -------------------------- |
| Shortcuts help sheet             | yes (modal)         | `<dialog>.showModal()`     |
| Settings panel                   | yes (modal)         | `<dialog>.showModal()`     |
| Import clipboard dialog (exists) | yes (modal)         | `<dialog>.showModal()`     |
| Activity-log bell popover        | no (dismissable)    | Popover API                |
| Filter chips — _dropdown_ form   | no (dismissable)    | Popover API                |
| Filter chips — _toggle_ form     | no overlay at all   | `<button aria-pressed>`    |
| Scope picker                     | depends — see below | native unless true listbox |

**`<dialog>` + `showModal()`** is Baseline **widely available** since March 2022
(Chrome 98, Firefox 98, Safari 15.4; >95% global). It gives, for free: top-layer
placement (no z-index war), `::backdrop`, Escape-to-close firing a `cancel`
event, initial focus into the dialog, background marked `inert` so nothing
behind is clickable, tabbable, or reachable by a screen reader, and the implicit
`dialog` role with modal semantics. Note the nuance the W3C APA group settled:
`showModal()` does not "trap" focus in the literal sense (you can still tab to
browser chrome) — it makes the rest of the page inert, which is the behavior you
actually want and is _more_ correct than a JS focus-trap library.

**This has already shipped as `src/components/ui/Modal.tsx`**, built on
`<dialog>`/`showModal()` exactly as recommended. Both of the surfaces this
section flagged as live defects when written now render through it:
`ImportClipboardDialog` and the mobile "More" sheet in `Layout.tsx` both import
and use `Modal`, so the hand-rolled `role="dialog"` divs with no focus
containment no longer exist. Nothing left to do here.

**Popover API** (`popover` attribute + `popovertarget` on the trigger) is
Baseline **widely available** since April 2025 (Chrome/Edge 2023, Safari 17.4,
Firefox 125). It gives top-layer placement, light dismiss (click outside),
Escape, and automatic `aria-expanded`/`aria-details` wiring between trigger and
popover via `popovertarget`. It does **not** give a focus trap and does **not**
give menu/listbox ARIA roles — which is precisely correct for a bell popover and
a filter dropdown, both of which should stay non-modal. Position it with plain
`position: absolute` inside a `position: relative` wrapper; do **not** depend on
CSS anchor positioning yet (still not cross-browser).

**One caveat on "filter chips":** the toggle form shipped, and it went the way
this section recommended: `src/components/ui/FilterChip.tsx` is exactly
`<button type="button" aria-pressed={selected}>` styled with `StatChip`-like
tones — no overlay, no Popover API, no dependency. Only the "chip opens a menu
of values" variant (a dropdown, not a toggle) would still need the Popover
verdict above; nothing in the repo builds that variant today.

**Checkbox: use `<input type="checkbox">`.** Radix Checkbox exists to let you
style a box that historically could not be styled. Tailwind v4 styles a real
checkbox fine (`appearance-none size-4 rounded-xs border border-line
checked:bg-accent checked:border-accent-dim focus-visible:outline-2
focus-visible:outline-accent`, plus a `::after` or an inline SVG check). Native
keeps the form association, the indeterminate property, the label click target,
and the screen-reader announcement — all things the Radix version reimplements.
Zero justification to spend 2.3 KB (the marginal Radix-checkbox cost) on this.

**Scope picker — the only conditional.** If it renders a list of ESI scopes with
a checkbox each inside a `<dialog>`, it is native and needs nothing. If the
design calls for a true single-select listbox with roving `tabindex`, typeahead,
and `aria-activedescendant`, that is the one pattern in this list where writing
it correctly is genuinely error-prone and a primitive earns its cost.

**If you must buy, buy Radix, not Base UI.** Measured:
`@radix-ui/react-popover` + `react-dialog` + `react-checkbox` = **27.5 KB gzip**
(and 25.2 KB of that is Popover alone — the other two are nearly free once
Floating UI is in). `@base-ui/react` is **44.3 KB gzip for Popover alone** and
**74.9 KB for five components** — 2.7× Radix for the same job, plus it declares
`date-fns` and `@date-fns/tz` as peers. On a 334 KB budget, Base UI is
disqualifying. Both ship zero CSS and are `sideEffects: false`, so
tree-shakeability is a wash. Radix declares explicit `^19.0` React peers and its
React-19 issues (composed-ref infinite loop, Presence update-depth) are fixed in
current releases. Headless UI and Ark UI both bundle equivalent Floating UI
machinery and were not measured because neither could beat 27.5 KB, and 27.5 KB
is already more than the native path costs (zero).

**Since this survey: `docs/adr/0004-radix-for-menu-primitives-only.md`
(Accepted 2026-08-30)** made this exact "if you must buy, buy Radix" call — but
for a different surface than anything measured above. The ADR adopts the
single `radix-ui` package for ContextMenu, DropdownMenu and Select (a
right-click context menu and a real listbox for the Market Browser), none of
which this survey's dialog/popover/checkbox table above covers. The
`@radix-ui/react-popover`/`-dialog`/`-checkbox` numbers measured here (27.5 KB
combined) are the wrong figure to cite for that decision — they're different
packages. `radix-ui` isn't in `package.json` yet, so its actual bundle cost is
unmeasured. The ADR does not overturn any verdict in this section: it keeps the
native `Modal` and CSS-based `Tooltip` as-is and reaches for Radix only where
this survey's own criteria (roving `tabindex`, typeahead,
`aria-activedescendant`) are actually met.

## 5. CSV serialization — **BUILD, shipped**. Clean kill.

The three stated requirements are RFC 4180 escaping, formula-injection
sanitization, and a BOM. `papaparse` 5.7.0 (7.3 KB gzip) is a _parser_ — its
`unparse` does RFC 4180 quoting, but:

- **No CSV library does formula-injection sanitization.** CSV injection is an
  Excel/Sheets behavior (a cell starting `=`, `+`, `-`, `@`, tab, or CR is
  evaluated as a formula), not anything the CSV spec addresses. Papa will
  happily write `=cmd|'/c calc'!A1`.
- **No BOM by default.** Something has to prepend one.

So buying the library solves one of three requirements, and it is the one that
is a 6-line function. This shipped as `src/lib/csv.ts` (67 lines, pure, no
DOM, TDD-able exactly like `src/lib/duration.ts`):

- quote a field iff it contains `"`, `,`, `\r`, or `\n`; double any inner `"`
- prefix `'` when the raw value's first character is in `= + - @ \t \r`
  (applied before quoting, and to header cells too)
- join rows with `\r\n` per RFC 4180
- **`toCsv` owns the BOM** — it prepends `﻿` itself before returning the
  string. Do not prepend a second one when building the `Blob`; that writes two
  BOMs into every exported file.

Download without a dependency: `src/lib/download.ts`'s `downloadTextFile`
wraps `toCsv`'s output straight into `new Blob([text], { type:
'text/csv;charset=utf-8' })` → `URL.createObjectURL` → a synthetic `<a
download>` click → a deferred `URL.revokeObjectURL`. `src/lib/downloadCsv.ts`
composes the two, with a closed `CsvSurface` union naming every export
surface. The Blob/`URL` half is DOM, the serializer stays pure in `src/lib` —
same split the codebase already uses.

## 6. XML parsing of untrusted `.emp` / plan `.xml` — **NATIVE `DOMParser`**

**The security framing in the brief inverts once you check it.** The intuition
is "browser XML parser = XXE risk, JS parser = safe." The opposite is true:

- **Browser `DOMParser` does not resolve external entities. At all.** There is
  no network fetch, no local file read, no `SYSTEM`/`PUBLIC` identifier
  resolution in any browser's `parseFromString` for `text/xml` or
  `application/xml`. XXE is structurally impossible, not merely disabled by a
  flag you might forget to set. It is also the most-attacked, most-fuzzed,
  most-hardened XML parser you have access to. (Behavior for _internal_
  `<!ENTITY>` declarations varies more across engines, so do not rely on it —
  bound it with the input size cap in point 2 below, which you need anyway.)
- **`fast-xml-parser` has a real advisory history**: CVE-2023-26920 (prototype
  pollution via `__proto__` in a tag or attribute name — exactly the untrusted
  input in scope here), CVE-2023-34104 (ReDoS), CVE-2024-41818 (ReDoS in
  currency parsing), CVE-2026-41650 (builder comment/CDATA injection). Paying
  **21.6 KB gzip** to move from a hardened browser parser to a JS parser with
  that track record is the wrong direction on the axis the brief cares about.
- **`txml` 6.0.1** is only **2.0 KB gzip** (using the `txml/txml` subpath), which
  is genuinely attractive on size. But it is a hand-written non-validating
  scanner maintained by one person and has had a fraction of the security
  scrutiny. For _untrusted user-uploaded files_, "small and unscrutinized" is
  worse than "large and scrutinized," and native is both scrutinized and free.

**The `src/engine` purity rule does not force this decision.** CLAUDE.md bans
DOM _imports_ in `src/engine` — it does not require every byte of parsing to
live there. The codebase already has the right pattern for this: `src/engine/
import/eftFit.ts` and `skillPlanPaste.ts` are pure functions over a `string`,
with the clipboard/DOM half sitting in `src/features/skills/planner/
clipboardImport.ts` and `ImportClipboardDialog.tsx`. Mirror it:

```
src/features/skills/import/empFile.ts   ← DOM allowed. DOMParser → plain DTO
                                          { entries: Array<{ name, level, priority?, note? }> }
src/engine/import/empPlan.ts            ← pure. DTO → PlanEntry[], validation,
                                          skill-name resolution, error rows.
                                          TDD, same shape as skillPlanPaste.ts
```

Both halves stay testable — Vitest already runs jsdom (vite.config.ts's test
`environment: 'jsdom'`), which provides `DOMParser`, so even the adapter has
real unit tests without a browser.

Two things you must still write, and neither is a parser concern:

1. **`parsererror` detection.** `DOMParser` reports malformed XML by returning a
   document containing a `<parsererror>` element rather than throwing. Check
   `doc.querySelector('parsererror')` and surface a clean error — this is the
   one native footgun.
2. **Size caps.** Decompression bombs and 500 MB files are defended by byte
   limits on the input, not by the choice of parser. Cap the compressed file
   (e.g. reject `File.size > 5 MB` before reading) and cap decompressed bytes
   while streaming (§7). `fast-xml-parser` would not help with either — and
   `pako.ungzip` would actively hurt, since it materializes the whole
   decompressed buffer before you can count it.

## 7. Gzip decompression — **NATIVE `DecompressionStream('gzip')`**

Baseline **widely available since May 2023**: Chrome 80, Edge 80, Firefox 113,
Safari 16.4. Every browser capable of running React 19 and Vite 8's output
target has it. There is no meaningful population of users who would get the
`pako` fallback, so shipping `pako` (**10.4 KB gzip**) to serve zero users is
pure cost. **No fallback needed. Do not add `pako`.**

Native is also _safer_ for this specific use case, which is the part worth
stating explicitly: `pako.ungzip(buffer)` decompresses everything into memory
before returning, so you cannot enforce a decompressed-size limit — a 1 MB
`.emp.gz` that expands to 4 GB takes the tab down before your check runs.
`DecompressionStream` is a `TransformStream`, so you can count bytes as they
flow and abort mid-stream:

```
file.stream()
  .pipeThrough(new DecompressionStream('gzip'))
  .pipeThrough(byteLimitTransform(MAX_DECOMPRESSED))  // ~15 lines, errors past N
  .pipeThrough(new TextDecoderStream())
```

The `byteLimitTransform` is the only code you write, and it is the code that
actually provides the bomb defence.

## 8. Markdown / changelog rendering — **BUILD, structured JSON**

There is no changelog, "what's new", or release-notes anything in the repo today
(grepped `src/`, `docs/`, `public/` — zero hits), so this is fully greenfield and
there is no existing Markdown corpus forcing a renderer.

A Markdown renderer is the wrong tool here for a reason that goes beyond bundle
size: **CLAUDE.md requires all UI strings to go through i18next.** A Markdown
document body is a UI string that fundamentally cannot go through i18next — you
would be shipping a parallel, untranslatable content channel that permanently
violates a stated project invariant. Even English-only-for-now, it desyncs the
catalog and makes the eventual second locale strictly harder.

The cost is also real: `marked` + `dompurify` is ~18 KB gzip _and_ introduces a
`dangerouslySetInnerHTML` XSS surface into an app that currently has none;
`react-markdown` + `remark` is ~40 KB gzip. Either is 5–12% of the entire JS
budget to render text you author yourself.

Instead, `src/data/whatsNew.ts`:

```ts
export const WHATS_NEW: ReadonlyArray<{
  version: string;
  date: string;                       // ISO
  entries: ReadonlyArray<{ kind: 'added' | 'fixed' | 'changed'; key: string }>;
}> = [ … ];
```

Render with a ~40-line component: version heading, `<DataAgeBadge>`-style
`<time>`, and a `<ul>` of `t(entry.key)` with a per-`kind` `StatChip` tone
(`success` / `warning` / default — tokens already exist per `docs/DESIGN.md` §1).
Every string routes through i18next, zero dependencies, zero XSS surface, and it
composes with the existing design system instead of injecting foreign HTML into
a design system built on hairlines and `rounded-xs`.

## 9. Date / duration formatting — **ALREADY HAVE / NATIVE**

**`Intl.NumberFormat` is already in use and used correctly** — every formatter
is built once at module scope rather than per render: `src/lib/isk.ts`'s
`formatIsk` (post-§10d consolidation), plus `features/industry/format.ts`'s and
`features/market/format.ts`'s own `PERCENT_FORMAT`/`VOLUME_FORMAT` constants —
the percent/volume formatters §10d's "not done yet" leaves still duplicated.
Nothing to change on the memoization pattern itself, only the remaining
duplication (§10d/§10e).

**Nothing in the codebase is hand-rolling something `Intl` does better.** I
checked all 20 `toLocale*` call sites and both formatter families. Two
deliberate non-`Intl` implementations, and both should stay:

**`src/lib/duration.ts` — keep it. Do not migrate to `Intl.DurationFormat`.**
Its "1d 1h 2m" output does resemble `Intl.DurationFormat` `style: 'narrow'`, but
two things argue against:

1. **Availability.** `Intl.DurationFormat` only reached Baseline _newly
   available_ on 2025-03-04 (Chrome 129 Sep 2024, Safari 16.4, Firefox 136 Mar
   2025). It will not be Baseline _widely available_ until ~Sep 2027. For a
   PWA served to a long tail of installed browsers, that is a real regression
   risk for zero gain.
2. **It encodes domain rules Intl will not reproduce.** `duration.ts:13-15`
   drops leading zero units but _always_ pushes minutes unconditionally — 0
   seconds renders `0m`, not an empty string; and `duration.ts:7`
   (`Math.max(0, …)`) clamps negatives to zero so a just-completed job never
   renders "-3m". Both are asserted in `src/lib/duration.test.ts`
   ("floors negative or zero to 0m"). `Intl.DurationFormat` gives you neither
   for free, so migrating means keeping the same conditional logic _plus_ adding
   a formatter and a compat floor.

**`src/components/ui/DataAgeBadge.tsx` — keep it. Do not migrate to
`Intl.RelativeTimeFormat`.** This is the flag the brief asked for. `formatAge`
at `DataAgeBadge.tsx:15-21` is _deliberately_ not using `Intl` — it routes every
age string through i18next with `{ count }` plurals (`common.age.justNow`,
`common.age.minutes`, `common.age.hours`, `common.age.days`).
`Intl.RelativeTimeFormat` generates its own strings from ICU locale data, which
would **bypass i18next entirely** and violate the CLAUDE.md i18n rule. The
comment on line 14 records that hardcoded English here was already filed and
fixed once as BUG #8 — reintroducing browser-generated strings would reopen it
in a subtler form. Leave it exactly as it is.

**A date library here would be a mistake.** Every date operation in this
codebase is one of three things: parse an ISO-8601 string from ESI
(`new Date(entry.date)`), diff two instants in milliseconds
(`now - date.getTime()`, `Date.parse(a) - Date.parse(b)` at
`features/industry/jobs.ts:40`), or format for display
(`toLocaleString()`/`toLocaleDateString()`, 20 call sites). There is **no**
timezone conversion, **no** calendar arithmetic (add-months, business days,
week-of-year), and **no** parsing of ambiguous or non-ISO formats — the three
things date libraries actually exist for. `date-fns` (6–15 KB gzip depending on
imports), `dayjs` (~3 KB + plugins), or `luxon` (~20 KB) would all buy a wrapper
around `Date.parse` and `toLocaleString`. Decline on sight.

Worth noting as a compounding argument: **adopting Base UI (§4) would drag
`date-fns` in as a declared peer dependency** — a date library entering the tree
sideways, for a project that needs none.

## 10. Other findings

### (a) THE FINDING: Firestore full SDK where `lite` suffices — **−102.5 KB gzip — SHIPPED**

`src/sync/firebaseApp.ts` and `src/sync/planSync.ts` both import from
`firebase/firestore/lite` today. The measurement and reasoning below describe
the state at commit `c38389f`, before the swap.

`firebase/firestore` is **109.25 KB gzip, 32% of the entire JS bundle** — the
single largest thing this app ships. It is the full realtime SDK, including the
WebChannel transport, the local persistence layer, the mutation queue, and the
snapshot listener machinery.

**None of that is used.** Verified:

- `grep -rn "onSnapshot" src functions/src` → **zero matches**. No realtime
  listeners anywhere.
- `planSync.ts`'s Firestore import block (at the time of this measurement)
  imports exactly: `collection, deleteDoc, doc, getDocs, query, setDoc, where`,
  plus the `CollectionReference` and `Firestore` types.
- `firebaseApp.ts`'s `getFirebaseApp`/`getSyncFirestore` accessors import
  `getFirestore`.
- `docs/ARCHITECTURE.md:86-92` describes sync as an explicit on-demand
  fetch → merge → push cycle — by design, not by accident.

**Every one of those eight symbols exists in `firebase/firestore/lite`** —
verified by runtime import against `firebase@12.18.0`, the exact version in
`package.json`, not inferred from the build succeeding:

| Symbol                                      | in `firestore/lite`                                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `collection`, `deleteDoc`, `doc`, `getDocs` | ✓ ✓ ✓ ✓                                                                                                                                  |
| `query`, `setDoc`, `where`, `getFirestore`  | ✓ ✓ ✓ ✓                                                                                                                                  |
| `onSnapshot`                                | **absent** — which is the guard rail: if anyone later adds a realtime listener, the build breaks loudly rather than silently regressing. |

The aliased build also emits **zero** unresolved-import or missing-export
warnings (grepped the full build output, not just the tail).

I measured the swap by aliasing `firebase/firestore` → `firebase/firestore/lite`
in a scratch Vite config and rebuilding:

| Chunk                               | full SDK gzip | `lite` gzip |       delta |
| ----------------------------------- | ------------: | ----------: | ----------: |
| firestore                           |        109.25 |   **21.50** |  **−87.75** |
| firebase core (`app` + `functions`) |         21.37 |    **6.75** |  **−14.62** |
| firebase auth                       |         29.45 |       29.36 |       −0.09 |
| **total JS bundle**                 |    **342.70** |  **240.23** | **−102.47** |

**−102.5 KB gzip — a 30% reduction of the entire JavaScript payload — from
changing two import specifiers** in `firebaseApp.ts` and `planSync.ts`. The
core chunk shrinks too because the full SDK pulls `@firebase/webchannel-wrapper`
and the gRPC-ish transport into shared code.

The one thing to confirm before merging (now merged): `firebase/firestore/lite`
has no offline persistence. Given `docs/ARCHITECTURE.md` states editable data
is Dexie-authoritative and Firestore is a sync transport only, that was a
non-issue — worth confirming an ADR (alongside 0001/0002) or `ARCHITECTURE.md`
itself now records this choice, since it shipped without one being cited here.

### (b) Firebase is in the entry chunk — a further **~−58 KB gzip** off first load — **SHIPPED**

This section originally found that lazy _initialization_ in
`src/sync/firebaseApp.ts` did not keep Firebase out of the initial bundle,
because the module graph reached it eagerly from `App.tsx`, `Industry.tsx`, and
`SkillPlans.tsx` importing the sync barrel statically.

**That's fixed now.** `src/sync/index.ts`'s own header comment states the
intent directly: it is "the Firebase code-splitting boundary" — `planSync.ts`
statically imports Firebase, so every export that can reach it
(`triggerSync`, `scheduleSync`, `markPlanDeleted`, `markBuildPlanDeleted`,
`setSyncedSetting`) is a thin `async`/`await import('./planSync')` wrapper.
`status.ts` and `uid.ts` (Firebase-free) stay synchronous exports, so
`useSyncStatus`'s `subscribeSyncStatus` and the nav sync dot still work at
first paint without pulling Firebase in — exactly the further split this
section flagged as a prerequisite, also done.

`App.tsx`'s `import { triggerSync } from '@/sync'` therefore no longer reaches
Firebase statically; the Firebase weight loads on first sync, not first paint,
same outcome this section recommended.

**Combined (a) + (b), both shipped: first-load JS dropped from the ~334 KB
gzip measured at `c38389f` toward the ~175 KB this section estimated** (not
re-measured post-ship for this brief — re-measuring is a good sanity check but
not required to close this item).

### (c) No route-level code splitting — still open

Still true: no `React.lazy` anywhere in the repo (grepped). The exact chunk
size cited in the original measurement (1.13 MB / 334 KB gzip) predates the
Phase-0 work in (a)/(b) and the added `Settings`/`Styleguide` routes, so don't
cite it — the qualitative finding stands, the number doesn't. `React.lazy` +
`<Suspense>` around the route elements in `src/app/App.tsx` is free and already
supported by React Router 7. The highest-value split is still `@dnd-kit`
(**15.7 KB gzip**), reachable only from `src/features/skills/planner/` — i.e.
exactly the `/skills/plans` route. Every other route pays for a drag-and-drop
library it cannot use.

### (d) `formatIsk` existed three times — **SHIPPED**

Consolidated into `src/lib/isk.ts`'s `formatIsk(value, decimals = 0)` plus an
exported `clampIskZero` epsilon clamp. `features/character/format.ts` no longer
has its own copy — it now imports `clampIskZero` from `@/lib/isk` for
`iskToneClass` and documents in its own comment that the two must agree.
`features/industry/format.ts` and `features/market/format.ts` both import
`formatIsk` from `@/lib/isk` rather than defining it locally; the header
comment that used to call out the duplication in `features/market/format.ts`
is gone along with the duplication.

**Not done yet:** `formatPercent`/`formatSignedPercent` are still duplicated
between `features/industry/format.ts` and `features/market/format.ts` — this
recommendation's other half is still open.

### (e) `formatCostIndex` bypasses `Intl` — still open

`features/industry/format.ts`'s `formatCostIndex` still uses
`(index * 100).toFixed(2)` while its neighbour `formatPercent` uses
`Intl.NumberFormat`. Harmless today (cost indices are < 1), but inconsistent
and it will not group thousands if the input shape ever changes. Fold it into
the shared formatter alongside the `formatPercent` consolidation from (d).

### (f) Reverse check — any dependency droppable?

I checked all 12 runtime dependencies. **Nothing is dead.** Details worth
knowing:

- **`zustand`** — 0.42 KB gzip across three stores
  (`stores/activeCharacter.ts`, `stores/publicInfo.ts`,
  `features/market/hub.ts`). Effectively free. Keep.
- **`@dnd-kit/*`** — 15.7 KB gzip, genuinely used but from only 3 files on 1
  route. Don't drop; `React.lazy` it (see (c)).
- **`dexie-react-hooks`** — used in 6 files. Keep.
- **`react-router-dom`** — in React Router 7 this package is a thin re-export of
  `react-router`. Switching the import specifier is cosmetic and saves nothing
  measurable; not worth a diff.
- **`i18next` + `react-i18next`** — 15.97 KB gzip for a single English catalog is
  the one arguably-overpriced dependency in the tree. But it is a CLAUDE.md
  invariant and the catalog is wired through every component; replacing it with
  a hand-rolled `t()` would save ~14 KB and cost the plural handling that
  `DataAgeBadge` (§9) already depends on. **Not recommended** — listed only
  because the brief asked for the reverse check to be honest.
- **`firebase`** — see (a) and (b), both shipped: `firestore/lite` and deferred
  off the entry chunk. Not droppable — it's the sync transport (ADR 0001) —
  but it's now shrunk and deferred as recommended.

---

## Method notes / caveats

- Bundle figures for candidates are **measured, not looked up**: each package was
  installed at its current version into a scratch directory and bundled with
  `esbuild --bundle --minify --format=esm --jsx=automatic`, React and ReactDOM
  externalized, `process.env.NODE_ENV="production"`, then `gzip -9`. Real
  marginal cost inside the app bundle is roughly 10% lower because of shared
  gzip dictionary and shared React internals.
- The baseline attribution and the `firestore/lite` delta come from building the
  **actual repo** with a `manualChunks` overlay supplied by a scratch config
  file outside the repo, with `build.outDir` redirected to scratch. `vite.config.ts`
  was not modified and `dist/` was not overwritten.
- Baseline/browser-support claims (`<dialog>`, Popover API, `DecompressionStream`,
  `Intl.DurationFormat`, `content-visibility`) were verified against current
  sources rather than recalled; each is stated with its Baseline tier
  (_newly available_ vs _widely available_) because that distinction changes the
  verdict for `Intl.DurationFormat` and `content-visibility`.
- I could not see the 19 feature briefs. The only verdict that materially
  depends on them is §1 (`DataTable`); its flip condition is stated explicitly.
