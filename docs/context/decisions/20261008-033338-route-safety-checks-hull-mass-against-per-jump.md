# Scope decisions — Route Safety checks hull mass against per-jump hole and Ansiblex limits (issue #2906)

_Recorded 2026-10-08 · issue #2906._

- **The only hard claim is the per-jump limit.** A hull heavier than a hole type's `wormholeMaxJumpMass` (dogma 1385), or than an Ansiblex's 1.48 Mt, is flagged "Too heavy ... limit X". EVE-Scout gives no remaining mass or Stable/Reduced/Critical status, so total mass (1383) is never presented as what a hole has left, and an unknown type or K162 gets no cue.
- **Ansiblex 1.48 Mt is verified**, not wiki-only: dogma attribute 2798 (`gateMaxJumpMass`) on type 35841 in the SDE.
- **The ship is a device-local pick, hull mass only.** No active-ship read (it needs a new ESI scope and a re-grant) and no cargo mass in v1; no ship picked means no mass cue, so nothing changes for pilots who never pick one. Mass limits are baked into `wormholeMass.json` / `shipMass.json` by `scripts/build-sde.mjs`.
