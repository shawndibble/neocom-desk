# Scope decisions — Courier contracts are a sibling mode of Contract Search, not a merged item+courier filter (issue #910)

_Recorded 2026-09-12 · issue #910._

- **Courier and Items are two modes of the Search tab, not one merged result
  set.** #910's acceptance criteria asked for "the merged item+courier
  filter/search engine logic", and the two corpora do not merge: a haul has no
  `typeId`, quantity or price, and an offer has no route, reward, collateral or
  days-to-complete. A single filter over both would be one whose every field is
  unanswerable by half its rows, and a single table would leave half its columns
  blank whichever row you looked at — the "filter with a mode flag" shape
  `engine/contracts/contractSearch.ts` was itself split out of `bpcSearch.ts` to
  avoid. So `filterCourierContracts` is its own pure module beside
  `filterContractOffers`, and `CourierResults.tsx` its own component beside the
  item body of `ContractSearchPanel.tsx`. The ticket's _intent_ — courier
  contracts reachable from the Search tab, with courier-appropriate filters that
  do not clutter the item UI — is what got built. This rules out one union row
  type and one filter object with a `kind` discriminator.

- **The mode switch is a chip pair, not a second tab bar.** The Contracts page's
  own History/Search tab strip sits immediately above this panel — which is why
  the panel carries no title of its own — and a full-width tablist stacked under
  it reads as the same stutter. Rules out nesting `Tabs` inside the tab, and
  rules out a third page-level tab (the ticket asked to extend the Search tab,
  not to add a sibling to it).

- **Courier endpoints are named from the local SDE snapshots only, never
  through ESI.** `stations.json` names an NPC station with no request and
  `systems.json` gives its system and region; a location in neither is a player
  structure, and resolving those would mean one `/universe/structures/{id}` per
  distinct id against an ACL that refuses most of them — hundreds of 403s
  against ESI's shared 100-errors-per-minute budget, which is the exact probe
  `sde/npcStations.ts` exists to remove. An unresolved endpoint therefore shows
  its raw id and carries no destination region, which drops it out of a
  destination-region filter rather than letting it claim a region it may not be
  in. Rules out reusing `character/contractLocationName.ts` here; that resolver
  is right for the handful of locations on one Character's own contracts and
  wrong across a public snapshot.

- **Both snapshots load together on tab open, rather than the courier one
  loading on first use.** ADR 0013's live pull put courier and loan contracts
  together under 620 against ~370k offer rows, so the courier snapshot is a
  single chunk doc — deferring it would buy nothing and cost a fetch on the way
  into the mode. Rules out a per-mode lazy read and the mode-switch spinner that
  comes with it.

- **No summary strip, no ISK/m³ column, no detail modal.** None is in #910's
  acceptance criteria; the "detail view" it mentions describes a surface the
  Search tab has never had. Worth revisiting as follow-ups — ISK/m³ in
  particular is the figure a hauler actually compares jobs on — but each one
  adds a seam and a test that the ticket did not ask for.
