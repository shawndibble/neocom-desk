# Mobile audit rubric

The axes a run walks over every chosen surface, and the greps that surface
candidates for each. **A grep hit is a candidate, never a finding** — every one
is verified by reading the component and asking what it does at 390px.

Everything here is measured at **390×844**. 412×915 (Pixel 8) crosses no
different breakpoint; re-check arithmetic there only when a finding turns on
whether a row fits.

Tailwind breakpoints in play: `sm` = 640px, `md` = 768px. Both target phones
are below both, so `sm:` and `md:` prefixes are **desktop-only** styling and
un-prefixed classes are what a phone gets.

---

## A. Touch targets (DESIGN.md §3)

The scale is `sm` = `h-9 md:h-7`, `md` = `h-11 md:h-9`, and it lives in exactly
one file: `src/components/ui/controlStyles.ts`. Pointer users get the compact
box; touch users get 44px. `StatChip` and `DataAgeBadge` are the deliberate
exceptions at a flat `h-7` — readouts, not targets.

Look for:

- Interactive elements with a hand-written height instead of a `controlStyles`
  tier. `h-6`/`h-8` are what the scale replaced.
- A bare `<button>` or `<a>` doing a control's job without `Button`,
  `IconButton` or a `controlStyles` class — an icon drawn at 16px with no
  padding is a 16px target.
- Two adjacent tap targets with no gap between them, where a thumb hits both.
- A row where one control sits at a different height than its neighbours — a
  sign one of them skipped the shared scale.

```
grep -rn 'h-6\|h-8' src --include='*.tsx' | grep -iv 'md:h-\|icon\|svg'
grep -rn '<button' src/routes src/features --include='*.tsx' | grep -v 'className'
```

## B. Tables that must stack (DESIGN.md §4a)

`DataTable` defaults to `responsive="stack"`: below `sm` each row becomes a
labelled card (`.dt-stack`). `responsive="table"` opts out and is allowed in
**exactly two cases** — the columns _are_ the content (a matrix where a card
per row makes cross-row comparison unscannable), or the row already fits 390px
unaided (roughly two short columns).

Look for:

- Every `responsive="table"` call site, checked against those two cases. A list
  of records does not earn a sideways scroll; a matrix does.
- A hand-rolled `<table>` that never goes through `DataTable` — it gets no
  stacking at all.
- **Self-alignment**: `text-right`, `justify-end`, `items-end` or a
  `flex … items-end` wrapper rendered by a cell itself. `.dt-stack` overrides a
  column's `align: 'right'` but cannot reach alignment a cell applies to its own
  children, so those keep hugging the card's right edge while plain cells start
  at the label gutter, and the card reads as a zigzag. The fix is holding it
  behind `sm:` (`items-start sm:items-end`).
- A stacked card whose first line is not the row's identity. The card's top line
  is what a scrolling thumb reads; an id or a timestamp there costs the scan.

```
grep -rn 'responsive="table"' src --include='*.tsx'
grep -rn '<table' src --include='*.tsx'
grep -rn 'text-right\|justify-end\|items-end' src/routes src/features --include='*.tsx' \
  | grep -v 'sm:text-right\|sm:justify-end\|sm:items-end'
```

## C. Filters (DESIGN.md §4b)

`FilterBar` keeps the search box in the row below `md` and collapses everything
else behind one funnel `IconButton` into a `Modal placement="sheet"`, whose
edits are a draft committed with Apply or dropped with Cancel. A page earns it
once its search box shares a row with **two or more** other controls.

Look for:

- A filter row over that threshold not using `FilterBar` — four stacked rows of
  controls above the table they narrow is most of a 390px screen.
- A `FilterBar` whose sheet is missing a control the row has, or vice versa —
  they are written once as `children(draft, setDraft)` precisely so they cannot
  drift.
- A toolbar (sort, density, view mode, bulk actions) that wraps to three lines
  at 390px.

```
grep -rln 'FilterBar' src/routes src/features --include='*.tsx'
grep -rn 'SearchInput' src/routes src/features --include='*.tsx'
```

## D. Reach and navigation

The phone tab bar is `md:hidden` in `src/app/Layout.tsx`, with a fixed tab count
plus **More**, which opens a `Modal placement="sheet"` holding everything the
bar has no room for (`mobileSheetPaths`).

Look for:

- A route reachable only from a desktop-rail affordance — unreachable on a
  phone is the highest-severity class this skill files.
- A sub-nav (`OverviewSubNav`, `SkillsSubNav`, `CorpSubNav`) that overflows or
  clips at 390px.
- A primary action sitting at the top of a long scroll, where the thumb is at
  the bottom.
- A destructive action adjacent to a routine one at thumb size.

## E. Data legibility at a glance

The half of the goal no DESIGN.md rule covers: a phone user is glancing, not
studying. What the screen answers in two seconds is the measure.

Look for:

- **ISK without sign and colour.** DESIGN.md mandates `isk-pos`/`isk-neg` plus
  an explicit `+`/`−` (colour alone fails colour-blind readers). The wallet
  journal does this correctly and is the reference implementation.
- **Raw identifiers** where a name belongs — `Type #33573`, a ref-type like
  `contract_price_payment_corp`, a bare structure id. Unreadable anywhere,
  fatal on a phone where there is no second column for context.
- **Numbers that need a ruler.** Long ISK figures without `tabular-nums` or
  thousands separators; a percentage and an absolute in the same column.
- **A card with more than a handful of lines.** Stacking a 12-column table
  produces a 12-line card; below the fold nothing is scannable. The fix is
  hiding secondary columns below `sm` (`hidden sm:table-cell`) with the detail
  behind a tap, not shrinking the text.
- **Panels above the fold that are not the answer.** A 40-row current skill
  queue above the editor someone opened the page for. Collapse to header plus
  total by default on a phone.
- **A total that is off-screen.** The sum a page exists to report belongs above
  its rows, not after them.
- **Empty and error states that stop the user.** A refresh that silently fails,
  an empty state describing a fix it gives no button for.

## F. Gestures, overflow and the viewport itself

- **Horizontal page scroll.** Nothing but a deliberate `overflow-x-auto`
  container may exceed the viewport. A fixed pixel width, a `whitespace-nowrap`
  header row or a wide `min-w-` is the usual cause.
- **Hover-only information.** A `title` tooltip, a hover-revealed action, a
  hover-only row control — a touch device has no hover. `Tooltip` handles this
  with touch-and-hold, and `openOnTap` for a trigger whose only job is
  explaining; a raw `title=` attribute does not.
- **Drag as the only affordance.** `EntryList`'s reorder handles are the worked
  example: focusable buttons with no key handler, so reorder is pointer-only.
- **A modal taller than the viewport** with its confirm button below the fold
  and no sticky footer.
- **Sticky elements stacking** until the content area is a letterbox: a sticky
  header, a sticky filter row and a fixed tab bar at 844px tall.

```
grep -rn 'title=' src/routes src/features --include='*.tsx' | grep -v 'Tooltip\|label='
grep -rn 'onMouseEnter\|group-hover' src/routes src/features --include='*.tsx'
grep -rn 'w-\[\|min-w-\[' src --include='*.tsx'
```

---

## Standing kill-tests

Apply these before a finding reaches the hostile reviewer. Each one kills a
class, not a case.

- **Density over whitespace.** DESIGN.md's opening line. More padding, bigger
  gaps, or dropping columns "to breathe" is pre-rejected. A bigger _touch
  target_ is a different claim and survives.
- **The OS picker is a reversed decision.** `Select` everywhere, deliberately;
  `NativeSelect` has no product call sites. "Native picker on phones" is dead.
- **The desktop layout is the control.** A mobile fix that reflows pointer
  width is a regression, however good it looks at 390px.
- **CSS forks style, not state.** `DataTable` keeps one DOM at every width;
  `FilterBar` is a conditional render because Apply/Cancel needs its own state.
  A finding asking for a separate mobile component tree must argue state, not
  taste.
- **No phone workflow, no ticket.** Serve the glance — a wallet balance, a job
  timer, an order that got undercut. A workflow nobody performs on a phone
  (building a material tree, comparing five characters' skills) earns less than
  one that is checked between docks.
- **A picture of data already on screen** is not a mobile fix.
- **Unprovable at 390px.** If no narrow-viewport spec can assert the fix, an
  agent cannot show it worked and the next refactor undoes it.
- **Hand-computed row height is not evidence.** `padding + font-size` arithmetic
  routinely undercounts: an arbitrary `text-[…]` size with no paired `leading-*`
  inherits this app's ambient 1.5 line-height rather than the tighter one a
  `text-xs`/`text-sm` utility sets explicitly, and a multi-line grid's true
  height is the tallest cell in each row, not the one you eyeballed. A
  touch-target finding whose whole case is "this looks like it's under 44px on
  paper" needs a real render (a Playwright `boundingBox()`, same bar as
  #1160's own requirement) before it reaches the hostile reviewer — two
  candidate findings this way turned out to measure 48-50px in practice.
