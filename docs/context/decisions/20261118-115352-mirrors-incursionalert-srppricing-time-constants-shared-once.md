# Scope decisions — Mirrors: incursionAlert, srpPricing, time constants shared once

_Recorded 2026-11-18._

- **`incursionAlert`, `incursionState` (`INCURSION_STATES`) and `srpPricing` now live once in `functions/src`; `src/` re-exports them.** Byte-compare tests deleted. Continues the 20261117 decision.
- **One time-constants file: `functions/src/timeConstants.ts` (`MINUTE_MS`, `HOUR_MS`, `DAY_MS`).** Replaces ten private copies in `functions/src` (incl. `vettingTypes.ts`); `src/lib/age.ts` re-exports it.
- **Corp Tax Book engine mirrors (`corpTaxBookEngine`, `corpTaxBookSyncEngine`) stay mirrored, deliberately.** About 48 of the ~125 mirrored symbols differ from their `src/engine/corpTaxBook` twin (narrower structural types, `Mirror*`/`Alloc*` shapes, different imports), and ~25 have no `src` twin. Sharing them is a type redesign of ~25 modules, not a re-export; own ticket. Parity tests stay.
