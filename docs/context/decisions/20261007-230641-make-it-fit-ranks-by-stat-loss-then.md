# Scope decisions — Make it fit ranks by stat loss, then ISK within 5% (issue #2828)

_Recorded 2026-10-07 · issue #2828._

- **Make it fit orders options by relative loss of damage, tank and speed; options within 5% (`STAT_TOLERANCE`) of the smallest loss are ordered by ISK delta, unpriced last.** The smallest swap is the one that costs the fit least, but a trivially different stat loss shouldn't beat a much cheaper part. Pairs of swaps are tried only when no single swap fits (capped at 40 estimated pairs, each recalculated whole). Implants and skills to train are not part of this list; the Implant Finder and What to train already own them.
