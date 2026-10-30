# Scope decisions — Place Nicknames are an Assets-only personal label (issue #5605)

_Recorded 2026-10-30 · issue #5605._

- **A Place Nickname is shown on the Assets page only (Items, Ships, Move).** It is applied where Assets draws a location name, never in place resolution (`src/features/places`, the station / structure name loaders). App-wide was rejected: there is no shared place-name renderer, and a nickname injected at a loader would reach other people (Communities' blueprint library push writes the resolved location name), mail, shares, copy text and the names frozen into Industry plans.
- **Renamed from the drilled-in station heading with the faint in-place pencil,** as Clones does. Not on the location list rows: they already carry a link and a pin.
- **One nickname per location for the user, synced,** like clone nicknames: trimmed, 64-character cap, clearing removes it, last write wins across devices.
- **The real name stays visible** as a dim second line and in the tooltip. **CSV keeps the real name** and adds a Nickname column.
- **Corp Assets is unchanged.**
