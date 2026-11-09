# Scope decisions — Colony card says what is brought in per day (issue #6041)

_Recorded 2026-11-09 · issue #6041._

- **A colony's expanded card lists "Brought in": each factory input nothing on the colony extracts or makes, with units and m³ a day and "to keep all N running".** "Imported" is judged from pin configuration alone (extractor product, factory schematics), never measured rates, so an extractor with an unknown rate still counts as local and its input gets no line (`engine/pi/importedInputs.ts`; not `factoryBalance`'s `inputs-not-local`, which reads measured rates). Factories sharing an input sum into one line; lines order by m³ a day. Per-colony lines only: no cross-colony weekly haul total. Wording never says short or starved (see `20260906-100845-*`).
