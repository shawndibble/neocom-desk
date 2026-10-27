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

- **Suggestion counts respect every filter except the blueprint itself.**
  Counting against the raw snapshot let a suggestion read "40 offers" and the
  summary one click later read "2", once a region or a min ME was set. The
  stats are built from rows pre-filtered by the other fields, memoised on
  those fields so typing does not rebuild the index per keystroke.

- **An "offer" is one contract row, and that is the word every surface uses.**
  Not "copies": a contract can put `quantity: 3` up at one price, so a count
  of rows is not a count of copies, and the table's own Qty column already
  shows the difference. Counting rows is right — a row is what a buyer
  chooses between — so only the noun needed fixing.

- **One price expression across every readout.**
  `effectivePrice` is what the summary, the region strip and `DataTable`'s
  price sort all use, so the "cheapest" chip always names the first row of the
  table beneath it. This is deliberately _not_ `priceForMaxFilter`, which
  answers a different question — a no-buyout auction has no knowable ceiling
  and must not be disqualified by a max-price filter, but it still has a
  starting bid to display. Same two fields, opposite treatment of the same
  gap, which is why they stay separate functions.

  The price **column's sort** was pointed at `effectivePrice` as part of this,
  which fixes a defect that predates the change: EVE Ref's CSV carries a
  buyout on non-auction contracts whenever the field parses
  (`functions/src/publicContracts.ts`), and `isAuction` comes separately from
  the contract type — so an item_exchange row with `buyout: 0` sorted to the
  top of the table at `0` while rendering at its real price.

- **The suggestion list is in flow under the filter bar, not a floating
  combobox popover.** `radix-ui` ships no Combobox primitive and DESIGN.md
  forbids hand-rolling focus/portal behaviour, so this follows `SkillPicker`'s
  existing precedent: a list of real buttons, reachable by Tab. What that
  gives up is arrow-key traversal with `aria-activedescendant`; a half-built
  version of that is worse than none, so it is not attempted.

- **The search is Industry's third tab, not a main-nav route.** Both homes had
  a real claim: Market owns the verb ("I am shopping for something"), Industry
  owns the workflow and the vocabulary. Industry wins on a tie-break —
  Market's claim is fixable with a signpost and Industry's is not. A tab strip
  reading Build Plans / Records / BPC Sourcing is a workflow; Market / Open /
  History / Blueprints is three tabs about order books and one about
  contracts. ME/TE/runs are meaningless outside manufacturing, and are
  `BuildPlanRecord`'s own fields.

- **Market pays off the shopping instinct with one line, not a tab.** A
  blueprint _original_ can be sold on the market; a **copy** cannot. So an
  empty sell book on a blueprint is the one case where "no one is selling
  this" actively misleads, and that empty state now says copies are traded on
  contract and links to the search. Shown only there — on a blueprint, with no
  station filter narrowing the book — because anywhere else it is an advert.

- **`/bpc-contracts` stays as a redirect**, and Industry's tab moved into
  `?tab=`. The tab was component state, which gives a deep link nowhere to
  land; Plans stays out of the URL as the default, so a visit that never
  touched the strip does not acquire a query string.
