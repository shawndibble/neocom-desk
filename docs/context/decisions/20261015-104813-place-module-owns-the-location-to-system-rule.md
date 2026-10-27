# Scope decisions — Place module owns the location-to-system rule; Assets jumps stay lazy

_Recorded 2026-10-15._

- **One Place module (`src/features/places`) owns "a location becomes a name, a system, a security and jumps away".** Assets, My Ships, Clones, the Move plan and `route/placeSystem` each re-implemented the station / structure / solar-system dispatch and the `noLocation` / `noRoute` fallbacks. The seam is a `PlaceSource`, backed in production by the existing station, structure and system loaders. The Assets jumps-away call (round 14) is unchanged: the page still hands the hook only pinned, visible and drilled-into stations, so the lazy fan-out bound stays page-owned and the hook never widens it.
- **Jumps are keyed by route basis and origin, and the other facts are not.** A new basis or a moved Character recounts jumps only; a Place's name, system and security are read once per Character scope. My Ships no longer blanks names and security when the basis changes, only the counts.
- **Clones' one-shot loader and its jumps effect stay as they are** beyond using `resolvePlace`: their Places are resolved inside a snapshot load, not lazily per row, so the hook would re-read what the loader already has.
