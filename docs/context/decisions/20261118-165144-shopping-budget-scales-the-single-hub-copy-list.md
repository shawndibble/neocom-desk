# Scope decisions — Shopping budget scales the single-hub copy list (issue #6388)

_Recorded 2026-11-18 · issue #6388._

- **The budget scales the whole-group copy of a single-hub Build Group, never a mixed-hub group's per-hub lists.** A budget is one pool of ISK; a mixed group is bought at several stops, so splitting it across hubs would be a guess. Member and per-hub copies stay unscaled.
- **Blueprint Acquisition rows neither cost budget nor scale.** They are bought by contract, not multibuy.
- **No minimum-lot rounding.** No lot size is carried on a material line; quantities round down to whole units only.
