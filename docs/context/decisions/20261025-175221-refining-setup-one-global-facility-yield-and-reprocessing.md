# Scope decisions — Refining setup: one global facility yield and reprocessing tax

_Recorded 2026-10-25._

- **One global Refining Setup, not per-station presets.** A Facility Yield % and a Reprocessing Tax %, set once. It reuses the synced `sync.oreRefiningStructureRate` key for yield (0 still means NPC 50%) and adds a tax key. Presets would need a picker everywhere the rate shows. This reverses the v1 decision (`20260906-180034-reprocessing-v1-...`, #537) that the structure rate and tax are not modelled.
- **The yield field is the facility's base, before skills and implants.** The engine multiplies skills and implants on top as it does today. It is never the pilot's final yield, and the modal says so.
- **Tax is an ISK fee on the refined value, not a cut of quantities.** The output list keeps full quantities. Per the EVE University wiki; the exact in-game formula is community-derived and unconfirmed, so refined values stay labelled estimates.
- **Every 50% assumption reads the setup:** Appraisal's Refine stat and column, the open-order reprocess exit, the mining-yield refined value, and the ore decision and Buy Ore dialogs, which drop their own structure-rate field for the same two inline numbers. Also a Settings entry.
- **Entry point: the two numbers sit inline beside the Refine stat in Appraisal's strip and edit in place.** Facility Yield % and Reprocessing Tax % show as text and swap to a field on click, the `EditableValue` primitive (docs/DESIGN.md §6c: Enter or blur saves, Escape cancels). No modal and no 3-dot item, since the Refine column is already in the picker. They show only when the stat does (a row refines). An info tooltip says where to find each number, in text only with no quoted client field labels until confirmed in-game.
- **Parked:** Refine lines in the Buy/Split/Sell cards, refined-output row detail and totals strip, and the column picker always listing Refine.
