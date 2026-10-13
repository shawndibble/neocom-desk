# Scope decisions — BPC Sourcing searches every source by default and lists free sources first

_Recorded 2026-10-13._

- **Source defaults to every toggle (Contracts, Contract BPOs, Market BPOs, LP Store, Community, Owned).** A search should look everywhere; Community and LP cost a pilot with none nothing. Rules out the old "contracts + owned" default. A pilot's remembered Source pick (`bpcSourcingSources`) still wins, and a Source chip appears only when the pick is not all six.
- **An Owned row's Price sorts as 0, like a Community row.** It sorted last (Infinity), so once the result cap (200) applied, a pilot's own blueprints fell off the list. Free sources now lead the default Price sort.
- **A blueprint only the pilot owns, or only a Community shares, is a search suggestion.** Suggestions and the type search were built from contract rows alone, so such a blueprint could not be found by name.
- **On a phone, Export and Refresh sit on the search row, not in a panel header of their own, and the Source chip names a count past two picks.** The header held nothing else and pushed results down a row; a long list ran the chip off the screen.
