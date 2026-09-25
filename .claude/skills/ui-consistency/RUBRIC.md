# Consistency rubric

The axes a run sweeps, the canonical pattern each checks against, the greps
that surface candidates, and the kill-tests. **A grep hit is a candidate,
never a finding.** Read the component and confirm it before counting it.

Run every grep against `origin/main`, over the **surfaces**: every place the
app renders UI, minus `src/components/ui/` (the primitives define the
canonical patterns, so they are not a surface to audit). `src/app` holds the
nav rail, the phone tab bar and the More sheet, which is where a glyph most
plainly means "this page". Shell state does not persist between Bash calls,
so start each call with the array:

```
S=(src/routes src/features src/app src/components ':!src/components/ui' ':!*.test.tsx')
git grep -n -E '<pattern>' origin/main -- "${S[@]}"
```

Some greps below carry a hit count, measured when this rubric was written, to
show expected noise. If a grep returns zero, either the axis is clean or the
grep is broken. If it returns thousands, it needs tightening before it is
usable. In both cases, fix the grep here.

The rules themselves live in `docs/DESIGN.md`. This file cites sections rather
than restating them. When the two disagree, DESIGN.md wins, and the rubric
line is stale: fix it in the same PR as the step 8 ledger update.

---

## A. Control heights and alignment (DESIGN.md §3)

Canonical: every interactive control sizes itself from
`src/components/ui/controlStyles.ts` through its `size` prop. Controls sharing
a row share a `size`, so they line up by construction.

Look for:

- A hand-written height on anything interactive (`h-6`, `h-7`, `h-8`, `h-9`,
  `h-10`, `h-11`, `size-*` on a button) instead of a tier.
- One toolbar, filter row or `Panel` `actions` slot mixing `size="sm"` and
  `size="md"`. So do a `size`-less control (which defaults to one tier) and a
  `sm` one side by side.
- A raw element sitting in a row of primitives: a `<Link>` styled as a button
  beside a `Button`, or a plain `<input>` beside a `TextInput`.
- Vertical misalignment: `items-start` or `items-baseline` on a row of
  controls, where `items-center` is what the rest of the app uses.
- The same control at different sizes on different pages for the same job.
  A Refresh button is `sm` on one `Panel` header and `md` on the next.

```
git grep -n -E '\b(min-)?h-(6|7|8|9|10|11|\[[^]]+\])\b|\bsize-(6|7|8|9|10|11)\b' origin/main -- "${S[@]}"
git grep -n -E 'size="(sm|md)"' origin/main -- "${S[@]}"
git grep -n -E '\bitems-(start|baseline|end)\b' origin/main -- "${S[@]}"
```

Heights can also come from padding. A `py-*` on a control-like element with no
`h-*` sizes itself from its text, and it drifts whenever the font does. Check
the elements the first grep turns up for this.

For the second grep, group the hits by file. A file with both values in one
JSX parent is the candidate.

## B. Primitive reuse (DESIGN.md §4, §4b)

Canonical: the `src/components/ui/` inventory (`index.ts`, plus `icons.tsx`
and `tabStyles.ts`, which the barrel does not re-export) and the entity links
in `src/features` (axis E). A job a primitive
exists for is done by that primitive.

Look for:

- A bare `<button>`, `<select>` or `<input>` in a feature file, doing the job
  of `Button`/`IconButton`, `Select` or `TextInput`/`SearchInput`.
- A hand-rolled search box (a magnifier glyph beside an input) instead of
  `SearchInput`.
- A hand-rolled tab strip (an underline on the active item) instead of `Tabs`
  or the `tabStyles.ts` classes.
- A route whose top line is not a `PageHeader`. The documented exceptions are
  `CharacterHeader` and `FittingHeader`.
- A nested `Panel`.
- An empty list or table with no `EmptyState`.
- An ISK figure formatted by hand instead of `IskAmount`.
- A filter row not built on `FilterBar`, or a toggle pill not built on
  `FilterChip`.
- A spinner, badge or chip re-implemented locally.

```
git grep -n -E '<(button|select|input)\b' origin/main -- "${S[@]}"
git grep -n -E '\bIcon\.Search\b' origin/main -- "${S[@]}"
git grep -n -E 'border-b-2' origin/main -- "${S[@]}"
git grep -L 'PageHeader' origin/main -- src/routes ':!*.test.tsx'
git grep -n -E 'toLocaleString|Intl\.NumberFormat' origin/main -- "${S[@]}"
```

Bare `radix-ui` and `@phosphor-icons/react` imports fail lint
(`eslint.config.js`). The rule matches those exact specifiers only, so a deep
import (`@phosphor-icons/react/dist/csr/X`) in a feature file still passes.
Sweep for that one:
`git grep -n -E "from '(radix-ui|@phosphor-icons/react)/" origin/main -- "${S[@]}"`.

## C. Icon semantics (DESIGN.md §5)

Canonical: one glyph, one meaning, app-wide. When there is none written down,
use the settled map in LEDGER.md. Where the ledger is silent, the majority
usage is the meaning.

`icons.tsx` re-exports each Phosphor glyph under a **semantic alias**
(`export const Refresh = withWeight(ArrowClockwise)`). Surfaces import the
module whole and render `<Icon.Refresh …>`, or pass `icon={Icon.Refresh}`.
That gives the map two layers, and drift can happen in each:

- **One glyph, several aliases.** A Phosphor glyph wrapped under aliases that
  mean different things. For example, `Copy` wraps both `Duplicate` and
  `CopyToClipboard`, so the user sees one picture for two actions.
- **One alias, several meanings.** `Icon.Close` for both "close the dialog"
  and "clear the field". `Icon.Pin` for both "favourite" and "required".
- **One meaning, several aliases.** Refresh drawn with two different arrows.
  "Open externally" drawn two ways. "More actions" drawn as both vertical and
  horizontal dots.
- **A meaning with no icon where its peers have one.** Row actions that carry
  a leading glyph on one page and none on the next.
- **Status glyphs off their tone.** `SeverityIcon` and `StandingIcon` exist so
  a warning glyph is always warning-toned. Look for a hand-coloured one.
- **Emoji or dingbats** used as icons (§5 forbids them).
- **Sizing.** A glyph sized with a raw pixel number instead of
  `ICON_SIZE.sm/md/lg`.

```
# glyphs wrapped by more than one alias
git show origin/main:src/components/ui/icons.tsx | grep -oE '^export const [A-Z]\w+ = withWeight\(\w+\)' \
  | sed -E 's/export const (\w+) = withWeight\((\w+)\)/\2 \1/' | sort \
  | awk '{a[$1]=a[$1]" "$2; c[$1]++} END{for(k in c) if(c[k]>1) print k":"a[k]}'
# every site per alias: read each one and write down what it means there
for n in $(git show origin/main:src/components/ui/icons.tsx | grep -oE '^export const [A-Z]\w+ = withWeight' | cut -d' ' -f3); do
  echo "== $n"; git grep -n -E "\bIcon\.$n\b" origin/main -- "${S[@]}"; done
git grep -n -E 'size=\{?[0-9]+' origin/main -- "${S[@]}"
git grep -n -P '[\x{2190}-\x{21FF}\x{2600}-\x{27BF}\x{1F300}-\x{1FAFF}]' origin/main -- "${S[@]}" src/i18n | grep -v -E ':\s*(//|\*|/\*)'   # ~15
```

When this rubric was written, the first command printed 8 shared glyphs,
among them `Copy` (Duplicate, CopyToClipboard), `Target` (three aliases) and
`Check` (Done, Select). Sharing a glyph is not a finding on its own: two
aliases can name the same meaning in two contexts. It is a finding when a
user would read the two as different actions.

Once a glyph is confirmed single-meaning across the app, record it in
LEDGER.md's settled icon map.

## D. Context menus and row actions (DESIGN.md §4 `RowActionsMenu`)

Canonical: an entity that has actions offers them the same way everywhere it
appears. That means a right-click `*ContextMenu` built on `RowActionsMenu`,
plus its visible `RowMoreActions` twin (`DataTable`'s `rowMoreActions`, or
placed by hand beside the row, never inside a row `<button>`).

Look for:

- **Holes in the entity matrix** (below). An entity with a context menu on one
  surface and none on another that shows it.
- **A context menu with no `RowMoreActions` twin.** Keyboard and touch users
  cannot reach it (WCAG 2.1.1).
- **Divergent menus for one entity.** The same item's menu with different
  entries, in a different order, or worded differently on two surfaces.
  Usually a local copy of the items instead of the shared hook.
- **Actions only in a hover-revealed button**, with no menu equivalent.
- **A one-off `DropdownMenu`** in a row doing what the entity's context menu
  already does.

```
git grep -l -E 'ContextMenu' origin/main -- src/features src/routes
git grep -n -E 'RowActionsMenu|RowMoreActions|rowMoreActions' origin/main -- src
git grep -n -E 'onContextMenu' origin/main -- "${S[@]}"
```

## E. Cross-links (DESIGN.md §6 "Accent = interactive")

Canonical: an entity name that can lead somewhere does, everywhere, through
the entity's own link component. An item leads to the Market
(`MarketItemLink`). An issuer leads to their info (`IssuerLink`). An LP corp
leads to its store (`LpStoreLink`). A character or corp leads to its info
(`PublicInfoModal`). A skill leads to `SkillDetailModal`.

Look for:

- **An entity name that is a link on one surface and plain text on another**
  showing the same entity. This is the main source of matrix holes.
- **A hand-built `<Link to="/market...">`** instead of `MarketItemLink`. It
  loses the region and hub carry-over.
- **Link styling drift.** A link not in accent, or accent text that is not a
  link (§6: accent means interactive, so accent static text lies).
- **A link that opens a modal on one page and navigates on another** for the
  same entity.
- **External links** (zKillboard, EVE Who, Dotlan) offered for an entity on one
  surface and not another, or with a different external-link glyph.

```
git grep -n -E "to=\{?[\`'\"]/market" origin/main -- "${S[@]}"
git grep -n -E 'MarketItemLink|IssuerLink|LpStoreLink|PublicInfoModal|SkillDetailModal' origin/main -- src
git grep -n -E 'target="_blank"' origin/main -- "${S[@]}"
git grep -n -E 'text-accent' origin/main -- "${S[@]}"
```

## F. Tokens (DESIGN.md §1, §3, §6)

Canonical: the tokens in `src/styles/index.css` and the rules in §3/§6.

Look for:

- `rounded-sm`, `rounded`, `rounded-md` or larger on a rectangle. The house
  radius is `rounded-xs`; `rounded-full` is for avatars, dots and spinners
  only.
- `border-2` outside a documented state stripe.
- Any gradient. `.calendar-map-past` is the one exception.
- A shadow outside a popover or menu.
- More than one `variant="primary"` in one view.
- A raw Tailwind palette colour (`text-red-400`, `bg-slate-800`) or a hex/rgb
  literal instead of a token.
- `success`/`danger` on an ISK figure where `isk-pos`/`isk-neg` belong.
- Accent used as static decoration.
- The same status shown in two different tones on two pages.

```
git grep -n -P '\brounded(-(sm|md|lg|xl|2xl|3xl))?(?![-\w])' origin/main -- "${S[@]}"   # ~17 of ~320 rounded-*
git grep -n -E 'border-2|border-[a-z]-2' origin/main -- src
git grep -n -E 'gradient' origin/main -- src
git grep -n -E '\bshadow(-[a-z]+)?\b' origin/main -- "${S[@]}"
git grep -n -E 'variant="primary"' origin/main -- "${S[@]}"
git grep -n -E '(text|bg|border)-(red|green|blue|yellow|amber|slate|gray|zinc|neutral|emerald|sky|cyan|orange)-[0-9]{2,3}' origin/main -- src
git grep -n -E "\[#[0-9a-fA-F]{3,8}\]|\[rgba?\(|['\"]#[0-9a-fA-F]{3,8}['\"]|['\"]rgba?\(" origin/main -- "${S[@]}"   # ~14; a bare '#abc' also matches every '#123' issue ref
```

## G. Labels and wording

Canonical: `CONTEXT.md`'s glossary for concept names. For action verbs, the
majority wording in `src/i18n/locales/en.json`.

Look for:

- **One action, two verbs.** "Remove" and "Delete", "Refresh" and "Reload",
  "Copy" and "Copy to clipboard", "View in Market" and "Open in Market".
- **One concept, two names.** A glossary term in one place and a synonym in
  another (CLAUDE.md: use its terms exactly).
- **Casing drift.** Title Case buttons on one page and sentence case on the
  next. Panel titles are uppercase by the primitive; a title uppercased by
  hand in the string is drift.
- **Ellipsis drift.** A dialog-opening action with "…" on one page and
  without on another.
- **Hardcoded strings** bypassing i18next (CLAUDE.md).
- **Duplicate keys.** Two `en.json` keys with the same English value for the
  same action. The fix shares one key. The one-liner prints ~300 pairs, and
  most are legitimate: a column header and a filter label may share a word.
  Keep only **action verbs** (buttons, menu items).

```
git show origin/main:src/i18n/locales/en.json > <scratchpad>/en.json
node -e "const f=require(process.argv[1]);const m={};(function w(o,p){for(const k in o){const v=o[k],q=p?p+'.'+k:k;typeof v==='string'?(m[v]=m[v]||[]).push(q):w(v,q)}})(f,'');for(const v in m)if(m[v].length>1)console.log(JSON.stringify(v),m[v].join(' '))" <scratchpad>/en.json
git grep -n -E '>[A-Z][a-z]+( [A-Za-z]+)*<' origin/main -- "${S[@]}"
```

Read `en.json` from `origin/main` rather than a working tree, which may be
stale.

---

## The entity matrix (axes C, D, E)

Rows are entities, columns are what each surface offers. Fill one row per
surface that shows the entity:

| Entity    | Surface | Name links? (to where) | Context menu? | `RowMoreActions`? | Icon / avatar? | External links? |
| --------- | ------- | ---------------------- | ------------- | ----------------- | -------------- | --------------- |
| Item      | …       |                        |               |                   |                |                 |
| Character | …       |                        |               |                   |                |                 |

The entities: **Item** (type), **Character**, **Corporation**, **Alliance**,
**Contract**, **Market order**, **Skill**, **Build plan**, **Mail**,
**Notification**, **Location** (station/structure/system).

Find each entity's surfaces by grepping for its existing primitives, then for
its ID prop (`typeId`, `characterId`, `corporationId`, `contractId`,
`orderId`, `skillId`, `locationId`/`systemId`). A surface rendering that ID
with none of the entity's primitives is the likeliest hole.

A hole is a finding only when the entity's full treatment makes sense there.
A read-only chart tooltip needs no context menu. Record every justified hole
as an exception in LEDGER.md, so the next run does not re-flag it.

---

## Standing kill-tests

Each is a settled decision. A finding that re-proposes one is dead:

- **Readouts at a flat `h-7`.** `StatChip` and `DataAgeBadge` (§3) are
  deliberately exempt from the control scale, in their own strip or header
  `meta`. A readout sitting _inline in a row of controls_, where it visibly
  mismatches a `Button` beside it, is still a finding under axis A.
- **State stripes at 2px.** The active tab, a grouped order's severity, the
  selected mail (§3).
- **The calendar hatch.** `.calendar-map-past` is the one gradient (§6).
- **`PageHeader` exceptions.** `CharacterHeader` and `FittingHeader` (§4).
- **`Select` over `NativeSelect`.** This is decided (DESIGN.md preamble).
  "Use the native picker here" is dead.
- **`DataAgeBadge` hidden below `md`.** Deliberate (§4, §6).
- **Mobile layout and the touch tier.** These belong to `/improve-mobile-ux`.
- **Density over whitespace.** A consistency fix that adds padding "to match"
  must match toward the denser site, not the airier one.
- **Lint-enforced patterns.** Bare `radix-ui` and `@phosphor-icons/react`
  imports (axis B covers the deep-import gap).
