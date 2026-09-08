# Scope decisions — The BPC search autocompletes to one blueprint, which unlocks a per-blueprint summary (issue #608)

_Recorded 2026-09-08 · issue #608._

- **The search box suggests blueprints, and each suggestion carries its offer
  count and best ME/TE.** Typing a name and reading a filtered table cannot
  tell you whether a blueprint has forty copies on contract or none until you
  have already typed the whole name and looked. Putting the count on the
  candidate answers that before the choice, which is the whole reason a
  typeahead beats a filter here.

- **Picking a blueprint is additive — it never replaces browsing.** The
  unfiltered, price-sorted table stays exactly as it shipped, and free-text
  typing still narrows it across every matching blueprint. Only _choosing_ one
  from the suggestions pins a single type and reveals the summary chips and
  the cheapest-by-region strip. Gating the table behind a pick was considered
  and rejected: it would have removed the only way to browse the index without
  already knowing what you wanted.

- **The per-blueprint summary and the region strip describe the filtered rows,
  not every copy of that blueprint.** Narrowing to ME ≥ 10 moves "cheapest" to
  the cheapest ME 10 copy rather than continuing to quote an ME 0 one the
  table below no longer lists. A summary that disagreed with the rows under it
  would read as a data bug.

- **One price expression, `buyout ?? price`, across every readout.**
  `effectivePrice` is what the summary, the region strip and `DataTable`'s
  price sort all use, so the "cheapest" chip always names the first row of the
  table beneath it. This is deliberately _not_ `priceForMaxFilter`, which
  answers a different question — a no-buyout auction has no knowable ceiling
  and must not be disqualified by a max-price filter, but it still has a
  starting bid to display. Same two fields, opposite treatment of the same
  gap, which is why they stay separate functions.

- **The suggestion list is in flow under the filter bar, not a floating
  combobox popover.** `radix-ui` ships no Combobox primitive and DESIGN.md
  forbids hand-rolling focus/portal behaviour, so this follows `SkillPicker`'s
  existing precedent: a list of real buttons, reachable by Tab. What that
  gives up is arrow-key traversal with `aria-activedescendant`; a half-built
  version of that is worse than none, so it is not attempted.

- **The page stays at `/bpc-contracts` for now.** Moving it into Industry as a
  third tab is a reasonable next step — a BPC is an industry input, ME/TE/runs
  are industry vocabulary, and `BuildPlanRecord` already stores the four
  fields the search filters on — but it touches routing, the nav rail, the
  scope table and a 600-line route, none of which this change needs. Kept as
  its own decision rather than a rider on the search redesign.
