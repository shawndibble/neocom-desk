# Scope decisions — Mining opens on the Overview tab

_Recorded 2026-09-24._

- **Mining opens on Overview, and Overview comes before Tax in the tab bar.**
  The nav link (bare `/mining`, and the legacy `/moon-mining` redirect) now
  lands on `/mining/overview`, reversing #1304's "Tax (default)" call. Links
  that mean the tax ledger, such as the dashboard's Mining tax card, point at
  `/mining/tax` explicitly and do not rely on the default.
