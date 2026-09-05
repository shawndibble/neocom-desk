# Scope decisions — mobile filter sheet: filters and sorts collapse behind one trigger

_Recorded 2026-09-05._

- **Below `md`, a page's filters and sorts move into a bottom sheet opened from
  a funnel icon beside the search box; the search box itself never moves.** A
  filter row that reads as one line on a desktop wraps to four on a 390px
  screen — Wallet's journal is a search box, a ref-type select and two date
  fields — and spends that height above the table it exists to narrow. The
  search box stays in the row because it is the panel's primary affordance and
  hiding it behind a trigger would cost more than the row does.

- **The sheet's edits are a draft; the row's are not.** Inline, an edit commits
  as it is made — the list is right there and the feedback is the point. In the
  sheet the list is behind a modal, so edits accumulate and commit on Apply or
  are dropped on Cancel. The draft is seeded on the open _transition_, not
  whenever `value` changes, so a filter whose options arrive from a fetch
  cannot re-seed mid-edit and discard what the user picked.

- **Sorts go in the sheet with the filters; actions and persisted display
  preferences stay in the row.** A sort select eats the same screen a filter
  select does and answers the same kind of question about the list below it.
  What does not go in is anything that is not a statement about the list:
  Characters' "New group" is an action, and its density chips are a saved
  display preference for the whole page.

  A persisted preference that _is_ a statement about the list — the LP Store's
  trade hub and price basis — does go in, and is written in `FilterBar`'s
  `onChange` and nowhere else. That is what keeps Cancel honest: the draft was
  local until Apply, so there is no store write to roll back.

- **The two surfaces are a conditional render, not a CSS collapse.** This is a
  deliberate exception to `docs/DESIGN.md` §4a's "one DOM at every width",
  which `DataTable`'s stacking follows. Apply/Cancel requires the sheet's
  controls to be bound to different state than the row's, and CSS cannot fork
  state. What is kept instead is the property §4a was protecting: the controls
  are _written_ once, as `children(draft, setDraft)`, so nothing is mounted
  twice and the two surfaces cannot drift.

- **`useIsNarrow` asks a `max-width` question where every other breakpoint hook
  asks `min-width`.** `vitest.setup.ts` stubs `matchMedia` to never match, and
  that default is load-bearing: `Layout` reads a non-matching `(min-width:
48rem)` as mobile, which is what gives the "More sheet" tests a sheet at all.
  A `min-width` filter hook would inherit that and flip every route with a
  filter bar into its sheet branch under test at once, breaking the existing
  route tests that query filter selects directly. Phrased as `(max-width:
47.999rem)`, the same non-matching stub reads as "not narrow" — the inline
  row — and no existing test moves.

- **A Radix overlay inside `Modal` needed a portal container, and gets one from
  context rather than a prop at each call site.** `Modal` runs on the native
  `<dialog>` + `showModal()`, so the dialog is in the browser's top layer and
  everything outside it is inert; a `Select` list portalled to `document.body`
  — Radix's default — renders behind the modal and takes no clicks. Nothing in
  the app had nested the two before. `Modal` now publishes its scroll container
  through `portalContainer.ts` and `SelectContent` reads it, so a select inside
  a modal works with no change at the call site and no new prop to forget.
  `DropdownMenu`, `ContextMenu`, `Popover` and `Tooltip` are untouched, having
  no such call site yet; the fix is one line each when they get one.

- **The trigger states its count as a number, not as an accent tint.**
  `activeCount` renders as a badge on the funnel and repeats inside the
  button's `label`, so "this list is filtered" is neither colour-only (§7) nor
  visual-only. Each route supplies the count from its own defaults —
  `activeWalletJournalFilterCount`, `activeContractsFilterCount` — rather than
  the component deriving it, which would need a defaults object and a
  deep-compare for five call sites. Search text is deliberately excluded from
  every count: the search box is still visible in the row, so attributing it to
  the trigger would name a filter that is not behind it.

- **Four pages convert; the rest are a different shape and are named here so
  the next pass does not re-litigate them.** Converted: Wallet's journal,
  Contracts, the LP Store, Characters. Not converted — Market's location mode
  and hub/region selects live in a `PageHeader` `actions` slot, which is a page
  toolbar rather than a filter row; Assets' per-location sort selects sit in a
  `Panel`'s own header with no search box beside them and already wrap
  deliberately (issue #415); Calendar's date field navigates rather than
  filters; Contacts, Skill Compare and Planetary Industry have chips but no
  search box for a trigger to sit inline with; Mail is down to a single "hide
  read" chip after #514, and a trigger costs exactly the room one chip does.
