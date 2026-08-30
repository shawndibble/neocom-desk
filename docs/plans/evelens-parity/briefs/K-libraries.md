# K — Build-vs-Buy Library Survey

Repo: `/Users/shawndibble/Documents/neocom-desk` @ `feat/evelens-parity-plan` (c38389f)
Investigation only. No repo files were created, edited, or staged.

---

## Headline

**Recommended new dependencies: none. Total BUY cost: 0 KB gzip.**

The single largest bundle finding on this list is not a library to add — it is a
library already installed and shipping ~3× more than it needs to. Aliasing
`firebase/firestore` → `firebase/firestore/lite` removes **102.5 KB gzip, ~30%
of the entire JS payload** (measured, §10a). That is worth more than every other
item in this survey combined, and it is a two-line change.

---

## 1. Measured baseline — what actually ships today

`dist/assets/index-D0GV_9Lb.js` is **1,125,510 bytes raw / 334.2 KB gzip in a
single chunk** (no code splitting). To attribute it, I built the real
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
(`vite.config.ts:37-42`, `globPatterns` includes `json`), so first load is
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

| #   | Surface                                     | Verdict                   | Library + version                           |    gzip KB | Why                                                                                                                            |
| --- | ------------------------------------------- | ------------------------- | ------------------------------------------- | ---------: | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Dense sortable `DataTable`                  | **BUILD**                 | — (TanStack Table 9.2.4 declined)           |          0 | Headless table emits no markup; the duplication is markup, not logic. Sorting is already 6 lines of `.sort()`.                 |
| 2   | List virtualization                         | **BUILD / NATIVE**        | — (`content-visibility: auto`)              |          0 | 511 skills × 10 chars is not a virtualization problem. Assets is unbounded — fix with a cap, not a virtualizer.                |
| 3   | Keyboard shortcuts                          | **BUILD**                 | — (`react-hotkeys-hook` 5.3.3 declined)     |          0 | Lib gives the easy half (matcher, input guard). The registry, OS labels, i18next routing, and help sheet are yours regardless. |
| 4a  | Dialogs (shortcuts sheet, settings, import) | **NATIVE**                | `<dialog>.showModal()`                      |          0 | Focus containment + inert + Escape + top layer + `::backdrop`, free. Fixes two live a11y bugs.                                 |
| 4b  | Popovers (bell, filter chips)               | **NATIVE**                | Popover API (`popover` attr)                |          0 | Light dismiss + Escape + top layer, Baseline widely available Apr 2025.                                                        |
| 4c  | Checkbox                                    | **NATIVE**                | `<input type=checkbox>` + `appearance-none` |          0 | Radix Checkbox only restyles a box Tailwind v4 already restyles. Native keeps form semantics.                                  |
| 4d  | Scope picker                                | **NATIVE, conditional**   | — (Radix if true listbox)                   |   0 / 27.5 | Checkbox list in a `<dialog>` = native. Only a real `aria-activedescendant` listbox justifies Radix.                           |
| 5   | CSV serialization                           | **BUILD**                 | — (`papaparse` 5.7.0 declined)              |          0 | No CSV library does formula-injection sanitization or BOM. The hard 2/3 stays yours.                                           |
| 6   | XML parsing (`.emp`)                        | **NATIVE**                | `DOMParser` at a feature-layer seam         |          0 | Browser `DOMParser` cannot do XXE at all; `fast-xml-parser` has 4 CVEs. Native wins the _security_ axis.                       |
| 7   | Gzip decompression                          | **NATIVE**                | `DecompressionStream('gzip')`               |          0 | Baseline widely available since May 2023. `pako` buys nothing and is worse for bomb defence.                                   |
| 8   | "What's new" panel                          | **BUILD**                 | — (structured JSON)                         |          0 | A Markdown body cannot go through i18next — a renderer fights CLAUDE.md, costs 18–40 KB, and adds XSS surface.                 |
| 9   | Date / duration formatting                  | **ALREADY HAVE / NATIVE** | `Intl.NumberFormat` + `src/lib/duration.ts` |          0 | Everything needed is `Date.parse` + `toLocaleString` + `Intl.NumberFormat`. A date lib would be a regression.                  |
| 10a | Firestore SDK size                          | **SWAP (removal)**        | `firebase/firestore/lite`                   | **−102.5** | No `onSnapshot` anywhere; every API used exists in `lite`. Measured.                                                           |
| 10b | Firebase in entry chunk                     | **DEFER (removal)**       | `await import('@/sync')`                    |    **−58** | `App.tsx:7` pulls all of Firebase into the critical path.                                                                      |
| 10c | Route code splitting                        | **BUILD**                 | `React.lazy`                                |   −(large) | 14 routes, one 334 KB chunk.                                                                                                   |
| 10d | Triplicated `formatIsk`                     | **BUILD**                 | consolidate into `src/lib/isk.ts`           |         ~0 | Three copies, one of which documents the duplication in its own header.                                                        |

**Aggregate gzip cost of everything recommended for purchase: 0 KB.**
**Aggregate gzip saved by the removals in §10: ~100–160 KB (30–48% of current JS).**

---

## 1. Dense sortable `DataTable` — **BUILD**

There are **six** near-identical hand-written tables in the repo, all sharing
byte-for-byte the same Tailwind class strings:

- `src/features/industry/MaterialsTable.tsx:24`
- `src/routes/Wallet.tsx:172` and `src/routes/Wallet.tsx:234`
- `src/routes/Contracts.tsx:107`
- `src/routes/Orders.tsx:78`
- `src/routes/Market.tsx:266`

The repeated string in every one of them is the header
(`className="px-3 py-2 font-semibold uppercase"`, right-aligned variant for
numerics) and the cell (`className="px-3 py-1.5 ..."`, plus
`text-right tabular-nums` on numbers). The wrapper is always
`<table className="w-full text-xs">` / `<thead><tr className="border-b border-line
text-left text-text-dim">` / `<tbody className="divide-y divide-line">`.

That duplication is **markup and class strings**. TanStack Table is headless: it
returns row models and header objects and you still write every `<th>`, every
`<td>`, and every Tailwind class by hand. It would remove **zero** of the six
duplications while adding 13.5 KB gzip and a v9-migration surface.

Meanwhile the "hard" part it does solve — sorting — is already solved, 6 lines
at a time, with plain `Array.prototype.sort`:

- `src/routes/Wallet.tsx:89` and `:93` (journal / transactions by date desc)
- `src/routes/Mail.tsx:59`
- `src/routes/Assets.tsx:113-115` (entries by name, then groups by label)
- `src/features/industry/jobs.ts:40`
- `src/features/skills/planner/CurrentQueuePanel.tsx:56`

Build `src/components/ui/DataTable.tsx` with a `Column<T>` descriptor
(`{ id, header, align?: 'left'|'right', sortKey?: (row: T) => string | number,
render: (row: T) => ReactNode }`), a `useState` sort key + direction, the
`aria-sort` attribute on the active `<th>`, and `EmptyState`/`Spinner` slots.
Roughly 90 lines. It owns the class strings the six call sites currently repeat
— which is the actual deliverable.

**Condition that flips this to BUY:** column pinning, column grouping (multi-row
headers), column resizing, or faceted filter value sets. I cannot see the 19
briefs, so I cannot rule those out. If any brief needs two or more of them,
re-evaluate — but note that even then you would want TanStack v9's new API, not
the v8 examples most tutorials show.

## 2. List virtualization — **BUILD / NATIVE**, with one real caveat

Honest answer on the row counts:

- **Skill comparison grid.** `public/data/skills.json` contains **511 skills**
  (counted). 511 rows × 10 characters = ~5,100 cells. That is a normal DOM.
  Chrome renders it in well under a frame budget on any machine that can run
  this app. Virtualizing it costs 7.5 KB gzip plus the permanent complexity of
  measurement, scroll restoration, and sticky headers-inside-a-virtual-list —
  for no user-visible gain.
- **Wallet journal / transactions.** Transactions are **explicitly bounded in
  code**: `src/esi/endpoints.ts:284` caps the cursor walk at
  `MAX_TRANSACTION_PAGES = 5`, with a comment stating full history is unbounded
  and only recent activity is wanted. The journal
  (`src/esi/endpoints.ts:255-262`) does fetch every X-Page, but ESI only retains
  ~30 days of journal, so it lands in the low thousands. Neither needs a
  virtualizer; if the journal ever feels slow, apply the same explicit page cap
  the transactions endpoint already sets a precedent for.
- **Assets — this one is genuinely unbounded.**
  `src/features/character/assets.ts:8` calls `loadWithCache(…, () =>
getCharacterAssets(characterId))`, which goes through
  `src/esi/paginated.ts:11` `fetchAllPages` — which fetches **every** page
  (1,000 assets each), with no cap of the kind
  `getCharacterWalletTransactions` sets for itself. `src/routes/Assets.tsx:164`
  then maps every location group and `:167` maps every asset inside it into an
  `<li>`, unbounded. A hauler or industry alt with 20k+ assets renders 20k list
  items on one page.

For assets, reach for virtualization **last**, not first. Cheaper fixes in order:

1. The search input at `src/routes/Assets.tsx:139` already filters — default to
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

This is not hypothetical improvement — it fixes two live defects:

- `src/features/skills/planner/ImportClipboardDialog.tsx:61-64` renders
  `role="dialog" aria-modal="true"` on a plain `<div>` with **no focus
  containment, no inert background, and no Escape handler at all**. A screen
  reader user can tab straight out of it into the page behind.
- `src/app/Layout.tsx:60-64` (the mobile "More" sheet) has the same
  `role="dialog" aria-modal="true"` `<div>` and **no focus containment**; it
  bolts on a manual Escape listener at `src/app/Layout.tsx:126-132`, a manual
  initial-focus effect at `src/app/Layout.tsx:53-55` (`firstLinkRef.current
?.focus()`), and a manual backdrop-click handler at `:64`. All of those
  hand-rolled behaviors are free with `<dialog>` + `::backdrop`.

**Popover API** (`popover` attribute + `popovertarget` on the trigger) is
Baseline **widely available** since April 2025 (Chrome/Edge 2023, Safari 17.4,
Firefox 125). It gives top-layer placement, light dismiss (click outside),
Escape, and automatic `aria-expanded`/`aria-details` wiring between trigger and
popover via `popovertarget`. It does **not** give a focus trap and does **not**
give menu/listbox ARIA roles — which is precisely correct for a bell popover and
a filter dropdown, both of which should stay non-modal. Position it with plain
`position: absolute` inside a `position: relative` wrapper; do **not** depend on
CSS anchor positioning yet (still not cross-browser).

**One caveat on "filter chips":** the brief lists them under popovers, but chips
are often a _selection state_ surface rather than an overlay. If the 19 briefs
mean multi-select toggle chips (click to include/exclude a ref type, a status, a
hub), that is a row of `<button type="button" aria-pressed={on}>` styled with the
existing `StatChip` tones — **no overlay, no Popover API, no dependency**. Only
the "chip opens a menu of values" variant needs the Popover verdict above. Worth
confirming which one the brief means before anyone builds an overlay.

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

## 5. CSV serialization — **BUILD**. Clean kill.

The three stated requirements are RFC 4180 escaping, formula-injection
sanitization, and a BOM. `papaparse` 5.7.0 (7.3 KB gzip) is a _parser_ — its
`unparse` does RFC 4180 quoting, but:

- **No CSV library does formula-injection sanitization.** CSV injection is an
  Excel/Sheets behavior (a cell starting `=`, `+`, `-`, `@`, tab, or CR is
  evaluated as a formula), not anything the CSV spec addresses. Papa will
  happily write `=cmd|'/c calc'!A1`.
- **No BOM by default.** You prepend `﻿` yourself either way.

So buying the library solves one of three requirements, and it is the one that
is a 6-line function. The whole thing is ~40 lines in `src/lib/csv.ts`, pure,
no DOM, TDD-able exactly like `src/lib/duration.ts`:

- quote a field iff it contains `"`, `,`, `\r`, or `\n`; double any inner `"`
- prefix `'` when the raw value's first character is in `= + - @ \t \r`
  (apply _before_ quoting, and apply to header cells too)
- join rows with `\r\n` per RFC 4180
- caller prepends `﻿` when building the `Blob`

Download without a dependency: `new Blob(['﻿' + csv, { type:
'text/csv;charset=utf-8' })` → `URL.createObjectURL` → a synthetic `<a download>`
click → `URL.revokeObjectURL`. The Blob/`URL` half is DOM, so it lives in a
component or `src/app`, while the serializer stays pure in `src/lib` — same
split the codebase already uses.

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

Both halves stay testable — Vitest already runs jsdom (`vite.config.ts:47`
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

**`Intl.NumberFormat` is already in use and used correctly** — three modules
build a memoized formatter at module scope rather than per render:
`src/features/character/format.ts:3`, `src/features/industry/format.ts:1`,
`src/features/market/format.ts:8`. Nothing to change there except the
duplication (§10d).

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

### (a) THE FINDING: Firestore full SDK where `lite` suffices — **−102.5 KB gzip**

`firebase/firestore` is **109.25 KB gzip, 32% of the entire JS bundle** — the
single largest thing this app ships. It is the full realtime SDK, including the
WebChannel transport, the local persistence layer, the mutation queue, and the
snapshot listener machinery.

**None of that is used.** Verified:

- `grep -rn "onSnapshot" src functions/src` → **zero matches**. No realtime
  listeners anywhere.
- `src/sync/planSync.ts:32-42` imports exactly:
  `collection, deleteDoc, doc, getDocs, query, setDoc, where`, plus the
  `CollectionReference` and `Firestore` types.
- `src/sync/firebaseApp.ts:7` imports `getFirestore`.
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
changing two import specifiers** (`src/sync/firebaseApp.ts:7` and
`src/sync/planSync.ts:42`). The core chunk shrinks too because the full SDK
pulls `@firebase/webchannel-wrapper` and the gRPC-ish transport into shared
code.

The one thing to confirm before merging: `firebase/firestore/lite` has no
offline persistence. Given `docs/ARCHITECTURE.md:12-14` states editable data is
Dexie-authoritative and Firestore is a sync transport only, that is a non-issue —
but it deserves an explicit line in an ADR alongside 0001/0002.

### (b) Firebase is in the entry chunk — a further **~−58 KB gzip** off first load

Lazy _initialization_ in `src/sync/firebaseApp.ts` does not keep Firebase out of
the initial bundle, because the module graph reaches it eagerly:

`src/app/App.tsx:7` → `import { triggerSync } from '@/sync'` →
`src/sync/index.ts:4-14` re-exports from `./planSync` →
`src/sync/planSync.ts:32-42` top-level `import … from 'firebase/firestore'`.

Two other eager entry points: `src/routes/Industry.tsx:6` and
`src/routes/SkillPlans.tsx:8`.

Converting those three to `await import('@/sync')` inside the handlers that
actually fire a sync moves the remaining Firebase weight (post-(a): 21.5 lite
firestore + 29.4 auth + 6.8 core ≈ **57.7 KB gzip**) entirely off the critical
path — it would load on first sync, not first paint. Note
`src/app/syncStatus.ts:18`, `SyncErrorNote.tsx:2`, `SyncStatusDot.tsx:2` import
only _types_ from `@/sync`, which are erased at build and do not pull anything
in; `src/app/useSyncStatus.ts:2` imports the runtime `subscribeSyncStatus`, so
that one needs the status subscription split out of `planSync.ts` first (it has
no Firebase dependency of its own).

**Combined (a) + (b): first-load JS goes from ~334 KB gzip to roughly 175 KB.**

### (c) No route-level code splitting

`dist/` is one 1.13 MB / 334 KB gzip chunk for 14 routes. `React.lazy` +
`<Suspense>` around the route elements in `src/app/App.tsx` is free and already
supported by React Router 7. The highest-value split is `@dnd-kit` (**15.7 KB
gzip**), which is reachable only from `src/features/skills/planner/` —
`EntryList.tsx`, `reorder.ts`, `markers.ts` — i.e. exactly one route
(`/skills/plans`). Every other route pays for a drag-and-drop library it cannot
use.

### (d) `formatIsk` exists three times

- `src/features/character/format.ts:21` — 2 decimals, with a `ZERO_EPSILON`
  clamp for float noise
- `src/features/industry/format.ts:8` — 0 decimals
- `src/features/market/format.ts:14` — 0 decimals

`src/features/market/format.ts:1-6` **explicitly documents the duplication in
its own header comment** ("Kept local to this feature … which already duplicate
each other"). `src/lib/` already exists as the home for exactly this kind of
shared formatter — `duration.ts` was consolidated there in commit 117eab0 for
the same reason. One `src/lib/isk.ts` with
`formatIsk(value, { decimals = 0 } = {})` plus the epsilon clamp (which the
other two silently lack, so they can render `-0` today) retires all three, and
`formatPercent`/`formatSignedPercent` should follow.

### (e) `formatCostIndex` bypasses `Intl`

`src/features/industry/format.ts:19` uses `(index * 100).toFixed(2)` while its
immediate neighbour `formatPercent` uses `Intl.NumberFormat`. Harmless today
(cost indices are < 1), but inconsistent and it will not group thousands if the
input shape ever changes. Fold it into the shared formatter from (d).

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
- **`firebase`** — see (a) and (b). The action is to shrink and defer it, not
  drop it.

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
