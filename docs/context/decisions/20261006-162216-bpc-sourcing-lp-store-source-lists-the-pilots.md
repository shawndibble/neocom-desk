# Scope decisions — BPC Sourcing LP Store source lists the pilot's own LP corps

_Recorded 2026-10-06._

- **BPC Sourcing's LP Store source covers only LP corporations the pilot holds points with.** ESI has no "who sells this type" search, so a store the pilot holds no LP with is never read (same limit as Appraisal and Blueprint Acquisition). Off by default, like Market BPOs.
- **An LP row has no ME/TE/runs and no location.** `runs` is `null`, not `-1` (an original). Region, Space and Jump Range filters drop it; the Location column shows the corporation.
- **An LP offer that costs LP while nothing prices that LP is left out.** Its ISK cost alone would sort it as cheap.
- **A row click opens `/market/lp-store/:corp?offer=<id>`.** The LP Store reads `offer` as its selected offer; the link also sets `affordableOnly=0` so an offer the pilot can't yet afford stays listed.
