# Scope decisions — Owned stock scope is a nested hangar and container picker (issue #2941)

_Recorded 2026-10-08 · issue #2941. Amends the container-exclusion decision of issue #2869._

- **One nested picker replaces the separate "containers excluded" control.** Stations carry a caret and a tri-state checkbox; corp hangars 1-7 and containers nest under their station. On a phone the picker is a bottom sheet with Apply and Cancel.
- **Inclusion is added beside the legacy exclusion, not instead of it.** A "selected" scope keeps `locations` (a station counted whole) and the #2869 `excludedContainers` (still honoured, shown as a partial station). It gains optional `hangars` (a hangar division at a station) and `containers` (container `item_id`s), which count only stock inside them for a station that is not in `locations`. Every saved scope counts the same as before; no Dexie schema bump and `ownedStockLocationKey` is unchanged.
- **Unchecking a hangar under a whole station narrows it** to the other hangars and the containers outside that one, since a whole station cannot say "all but one division". Unchecking a container still writes `excludedContainers`.
- **Rows without a hangar flag stay station-level.** Personal assets, and any cached corp row lacking `CorpSAG1-7`, belong to no hangar and are counted only when their station is selected whole. Hangars appear in the picker only for stock that carries the flag. A corp office folder is not a container.
