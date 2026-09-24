# Scope decisions — yearly remap on cooldown is placed by the optimizer, not dropped (issue #1404)

_Recorded 2026-09-23 · issue #1404._

- **An on-cooldown yearly remap is fed to `placeRemaps` as one extra allocation (`remapCount = bonus + 1`, still capped at `MAX_SUPPORTED_REMAPS`) plus a `timedRemap: { notBeforeSeconds }` floor — seconds from plan start to the cooldown's end.** Rules out ignoring the yearly remap entirely while it's on cooldown, and rules out placing it anywhere in the plan (the pre-#1404 bug: raising "Remaps available" by hand let the optimizer schedule a remap the player can't actually do yet).
- **The floor binds only the LAST allocation the optimizer places, never an earlier one.** In EVE the player chooses which remap to spend, so the later one is always the one worth holding back for the cooldown; bonus remaps (every earlier allocation) stay free to place anywhere. Conservative run-edge rule: the timed remap lands at the first run edge on or after the cooldown date, not necessarily the tightest legal boundary inside a run — always feasible, occasionally leaves a few seconds of slack on the table.
- **With 2+ bonus remaps already at the cap, the yearly one is dropped instead of spent.** The cap stays at `MAX_SUPPORTED_REMAPS` (2); spending the bonus remaps (unconstrained) beats forcing a 3rd, timed-and-therefore-worse allocation into the plan.
