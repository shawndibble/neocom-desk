/**
 * Prices how often a pilot reinstalls an extractor program, in units-per-hour
 * terms, off `extraction.ts`'s decay curve — nothing else in the engine
 * compares one program length against another.
 *
 * `extraction.ts` establishes that output decays with **elapsed time since
 * install**, not with a fixed lifetime: `programCycleCount`/`programTotalYield`
 * take an install-time baseline and a span and tell you what that span
 * yielded. A reinstall resets the clock to zero, so the pilot's real choice
 * is a cadence — restart every day, every week, every two weeks — not a
 * program length. `restartCadenceYield` answers that choice directly: for
 * each candidate cadence it builds the counterfactual program CCP's own
 * formula would run for exactly that long off the *same* install-time
 * baseline (`qtyPerCycle`, `cycleTimeMs`, `installTimeMs` — never the
 * program's actual `expiryTimeMs`, which is why two programs of different
 * lengths off the same baseline price a given cadence identically; see the
 * "prices the cadence, not the program length" test), and reads
 * `sustainedRatePerHour` off it. No decay math is reimplemented here —
 * every number comes from `extraction.ts`'s own exports, so this module
 * cannot drift from the curve it is pricing.
 *
 * A program with no install-time baseline returns an empty array rather than
 * a default rate — the same refusal `hasYieldBaseline` and
 * `sustainedRatePerHour` already make (`extraction.ts`). There is no "typical"
 * cadence to fall back to.
 *
 * ## This table is a floor, not the whole effect
 *
 * Restarting more often has a second cost this module does not price:
 * EVE University reports a longer program also *starts* from a lower
 * per-cycle figure at the same location (~30,000/cycle at a 1-hour program
 * vs ~20,000/cycle at 24 hours) — a different mechanic from the in-program
 * decay curve above, and one CCP has not published a formula for.
 * `docs/research/pi-cpu-power-mechanics.md` (§4) records that gap after
 * looking for a primary source and not finding one, so it stays unmodeled
 * here rather than guessed at: every ratio this module reports is therefore
 * a floor on how much restarting more often actually costs, never an
 * overstatement.
 *
 * Not in scope: recommending a cadence. The pilot sets it; this only prices
 * what they set.
 *
 * Pure: no fetch/DOM/Dexie, no `Date.now()` — every input is a parameter,
 * matching `extraction.ts`.
 */
import { hasYieldBaseline, sustainedRatePerHour } from './extraction';
import type { ExtractorProgram, ExtractorYieldProgram } from './types';

const HOUR_MS = 3_600_000;

/** One candidate restart cadence, priced against the best of the set it was asked alongside. */
export interface RestartCadenceYield {
  /** The cadence itself, in hours — echoed back from the input, not derived. */
  hours: number;
  /** Sustained units/hour a program restarted this often would average, off the caller's own baseline. */
  unitsPerHour: number;
  /** This cadence's `unitsPerHour` over the best cadence's in the same call — 1.0 for the best. */
  relativeToBest: number;
}

/**
 * Prices each of `cadences` (in hours) against `program`'s own install-time
 * baseline. Empty input, or a program with no usable baseline
 * (`hasYieldBaseline`), yields an empty array — never a default.
 */
export function restartCadenceYield({
  program,
  cadences,
}: {
  program: ExtractorProgram;
  cadences: readonly number[];
}): RestartCadenceYield[] {
  if (!hasYieldBaseline(program) || cadences.length === 0) return [];

  const rates = cadences.map((hours) => ({
    hours,
    unitsPerHour: sustainedRateForCadence(program, hours),
  }));
  const best = Math.max(0, ...rates.map((rate) => rate.unitsPerHour));

  return rates.map((rate) => ({
    ...rate,
    relativeToBest: best > 0 ? rate.unitsPerHour / best : 0,
  }));
}

/**
 * The sustained rate of the counterfactual program that restarts every
 * `cadenceHours` off `program`'s own baseline — same `qtyPerCycle`,
 * `cycleTimeMs` and `installTimeMs`, only `expiryTimeMs` replaced. Delegates
 * to `sustainedRatePerHour` for the actual curve walk.
 */
function sustainedRateForCadence(program: ExtractorYieldProgram, cadenceHours: number): number {
  const shadowProgram: ExtractorYieldProgram = {
    ...program,
    expiryTimeMs: program.installTimeMs + cadenceHours * HOUR_MS,
  };
  return sustainedRatePerHour(shadowProgram);
}
