# Scope decisions — Improve remembers Job, Space and Rigs on this device (issue #5567)

_Recorded 2026-10-29 · issue #5567._

- **Job, Space and Rigs are remembered on this device, like Reach, never on the Fitting.** Job defaults to PvE, Space to Dangerous (a wrong Safe can cost a ship). Rigs now default to on and are remembered once the pilot changes the tick, under a new key (`fittingsImproveRigs`) that holds a value only after a choice, so no earlier default can stick. This supersedes the older line that Rigs are not remembered and start unticked (`20261024-224626`).
- **The Makeover runs once, for the chosen Defense side, and only on Reach Rework with a goal other than Cheaper.** It follows the single-swap search, is skipped by "Show best so far" during that search, and must beat the best single swap. Comparing both sides would double its 300 calculations for a figure the side comparison does not use.
- **A tick wins the slots it shares.** Ticking a single swap or a Makeover row unticks any ticked pick on a shared slot, the same rule single swaps already follow. All Makeover rows start ticked.
