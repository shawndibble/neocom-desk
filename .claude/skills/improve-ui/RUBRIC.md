# UI audit rubric

The axes a run walks over every chosen surface, and the greps that turn up
candidates. **A grep hit is a candidate, never a finding.** Verify each one by
reading the component and looking at the screenshot.

This lane measures at **1440×900** and **1024×768**. Tailwind breakpoints:
`sm` = 640px, `md` = 768px, `lg` = 1024px, `xl` = 1280px. Un-prefixed classes
are what a phone gets, and anything below `md` belongs to `/improve-mobile-ux`.

---

## A. Hierarchy: is the answer first?

Every surface exists to answer a question: "how much ISK", "what finishes
next", "which order got undercut". Measure what the first viewport answers in
two seconds.

Look for:

- **No focal point.** Every panel carries the same visual weight, so nothing
  says where to look. The page's headline figure belongs in `PageHeader` or a
  `StatChip` row, not inside the third panel.
- **Chrome above content.** Toolbars, banners, explanatory copy or tabs push
  the first row of data below the fold at 900px tall.
- **Headline buried in a table.** A total, a count or a status the page exists
  to report appears only as a row, or only after scrolling.
- **More than one primary.** DESIGN.md §6 allows one `primary` button per
  view; two of them compete for attention.
- **Text tiers misused.** Values in `text-dim`, labels in `text`, or content
  someone has to read set in `text-faint` (DESIGN.md: decorative only).

```
grep -rn 'variant="primary"' src/routes src/features --include='*.tsx'
grep -rn 'text-faint' src/routes src/features --include='*.tsx'
```

## B. Flow and grouping

Reading order should match task order, and things that act together should
sit together.

Look for:

- **Action far from its object.** A button that acts on a selection sits in
  the page header while the selection is three panels down, or a filter sits
  above a different table than the one it narrows.
- **Scattered siblings.** Related controls are split across toolbars, or one
  concept (a character's jobs, a hub's prices) is spread over panels the eye
  has to stitch back together.
- **Panel order.** Panels follow the order they were built in rather than the
  order someone uses them. The daily glance should come before the rare
  deep-dive.
- **Dead ends.** A figure the user will want to act on (an expiring order, an
  idle slot) with no link or action to the surface that fixes it.
- **Modal depth.** A task that needs a modal on top of a modal, or a slide-over
  that hides the context the user is editing against.

## C. Whitespace rhythm

DESIGN.md: **"Density over whitespace — this is a data tool."** In this lane,
whitespace means **rhythm**, not room. Gaps should mean something: the same
relationship gets the same gap everywhere, and a bigger gap marks a bigger
boundary. A finding here makes spacing consistent and meaningful, and usually
makes the page _denser_, not sparser.

Look for:

- **Off-scale or ad-hoc gaps.** Sibling panels separated by `gap-3` on one
  route and `gap-4` or `space-y-6` on its neighbour. Padding that isn't
  `Panel`'s `p-3` on a panel-like box. Arbitrary `[…px]` spacing.
- **Proximity that lies.** A label closer to the field below it than to its
  own. A section heading equidistant from the block it titles and the one
  above it.
- **Dead zones at width.** At 1440 a single-column page stretches a 3-column
  table to full width, or leaves a large empty region beside short content.
  The fix is a sensible max width or a second column of real data, not
  padding.
- **Cramped outliers.** One toolbar or card with no gap between controls while
  every other one uses the shared spacing. Here the rule favours the added
  gap, because it restores the rhythm.

A finding that genuinely argues for **more** room than DESIGN.md allows
bypasses the "taste without a cost" and "unprovable" kill-tests below. Those
two would drop almost every breathing-room finding before anyone weighs it.
Instead it goes straight to the hostile reviewer, pre-marked `ESCALATE`. The
finding names the screenshot region and what the eye struggles with there, and
it is filed `ready-for-human` with the trade stated. The user asked for this
axis, and only a human can overrule DESIGN.md's density rule.

```
grep -rnE '\b(p|m)[xytblrse]?-\[|\bgap(-[xy])?-\[|\bspace-[xy]-\[' src --include='*.tsx'
grep -rhoE '\b(gap|space-y)-[0-9.]+\b' src/routes --include='*.tsx' | sort | uniq -c | sort -rn
```

## D. Alignment

Edges that almost line up read as a mistake. Edges that line up read as
design.

Look for:

- **Ragged left edges.** Panel headings, table first columns and toolbar
  starts that sit a few pixels apart down the page. Compare `boundingBox().x`
  values in the render.
- **Mixed control heights in one row.** A control that skipped the shared
  `controlStyles` tier (DESIGN.md §3: a toolbar built from one `size` value
  lines up by construction).
- **Numbers not right-aligned or not `tabular-nums`.** Magnitudes can't be
  compared down a column. Also check that header alignment matches the cells'.
- **Baseline drift.** An icon, a badge and a text label in one row that don't
  share a centre line (`items-center` missing, or an icon with its own
  margin).
- **Split panes with mismatched headers.** Two panels side by side whose header
  bars differ in height, so their first rows start at different y positions.

```
grep -rnE '<(Button|button|Select|SelectTrigger|TextInput|SearchInput|input)\b[^>]*\bh-[0-9]' src/routes src/features --include='*.tsx'
grep -rn "align: 'right'" src --include='*.tsx' | head
```

## E. Consistency

The same concept should look the same everywhere.

Look for:

- **One idea, two renderings.** ISK shown through `IskAmount` on one page and a
  hand-formatted string on another. A status shown as a `StatChip` here and as
  coloured text there. An empty state built with `EmptyState` here and as a
  bare `<p>` there.
- **Hand-rolled primitives.** A bordered div doing `Panel`'s job, a `<table>`
  bypassing `DataTable`, a custom tab strip bypassing `Tabs`.
- **Token drift.** Raw hex, `rounded-md` or larger on a rectangle, 2px borders
  that aren't a state stripe, shadows on anything but a popover (DESIGN.md §3
  and §6).
- **Vocabulary drift.** A label that disagrees with the `CONTEXT.md` glossary
  or with the same label on another page.

```
grep -rn '#[0-9a-fA-F]\{6\}' src/routes src/features --include='*.tsx'
grep -rn 'rounded-\(md\|lg\|xl\)' src/routes src/features --include='*.tsx'
grep -rn '<table\|shadow-' src/routes src/features --include='*.tsx'
```

## F. Clean by default, powerful on demand

The default view should be simple, and the power should still be one step
away.

Look for:

- **Everything at once.** Every column, filter and option shown by default,
  when most visits need four. Candidates for `ColumnPickerMenu`, `FilterBar`,
  `Disclosure` or `CollapsiblePanel`.
- **Missing expected power.** A data list with no sort, no search past about
  30 rows, no export where siblings have one, no bulk action where users
  clearly repeat one per row. Compare against sibling surfaces: if Wallet can
  filter by date and Contracts can't, that gap is a finding.
- **Hidden-for-good.** A useful feature reachable only by a context menu or a
  hover, with nothing visible hinting it exists.
- **Settings in the wrong place.** A per-view preference that lives only in
  `/settings`, or a global one repeated on every page.

## G. States

Look for:

- **Empty states that stop the user.** The empty state explains nothing, or
  names a fix it gives no button for.
- **Loading that shifts layout.** Content jumps when data lands (DESIGN.md §6a
  has the route-loading contract).
- **Errors and stale data.** A failed refresh that fails silently, or a
  `DataAgeBadge` missing from an API-derived view (DESIGN.md §6).
- **The long-value case.** A 15-digit ISK figure or a 40-character item name
  that wraps a row, overflows a chip, or shoves its neighbours.

## H. Data display

Tables are the default for data lists (DESIGN.md §6: avoid card grids). A
chart earns its place only when a shape answers the question faster than
numbers do. Load the `dataviz` skill before judging one.

Look for:

- **A picture of numbers already on screen,** or a chart without a stated
  question.
- **Colour carrying meaning alone.** ISK needs `isk-pos`/`isk-neg` plus a
  sign; status colours are never decoration (DESIGN.md §1, §6).
- **Raw identifiers** where a name belongs: `Type #33573`, a raw ref-type
  string, a bare structure id.
- **Units and precision.** Mixed precision in one column, unlabelled units,
  percentages and absolutes mixed together.

---

## Standing kill-tests

Apply these before a finding reaches the hostile reviewer. Each one kills a
whole class of finding, not one case.

- **Taste without a cost.** "Would look cleaner" with no answer to "what does
  the user fail to see or do?" dies.
- **Restyling the system.** New colours, fonts, radius, gradients, shadows, a
  light theme or an imported component library are decided against in
  DESIGN.md. They are not findings.
- **The OS picker is a reversed decision.** `Select` everywhere, deliberately.
- **Card grids for data lists.** DESIGN.md §6 prefers tables. A finding that
  converts a table to cards at pointer width must argue it as `ESCALATE`.
- **Phone-only.** It belongs to the phone lane; hand it over, don't file it.
- **Documented oddity.** A layout with a decision file or a header comment
  explaining it is deliberate. Argue against the reasoning or drop it.
- **Unprovable.** If no spec or unit test can assert the fix, the next
  refactor undoes it. Narrow the finding until one can.
