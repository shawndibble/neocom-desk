/**
 * Extractor output across a program's life, from CCP's published decay curve
 * (https://developers.eveonline.com/docs/guides/pi/ — decay factor 0.012,
 * dogma attribute 1683; noise factor 0.8, attribute 1687).
 *
 * An extractor does not produce `qty_per_cycle` every cycle: output decays
 * over the program, so the naive `qty_per_cycle x cycles` figure overstates a
 * 14-day program by ~150%, and that program's last day yields 8.8% of its
 * first. Every hour of a program is emphatically not worth the same, which is
 * what a bare countdown to `expiry_time` implies.
 *
 * Reads only the fields ADR 0005 lists as fixed at pin install
 * (`qty_per_cycle`, `cycle_time`, `install_time`, `expiry_time`). Nothing here
 * touches `contents[].amount` or `last_cycle_start`, which ESI only refreshes
 * when the colony is opened in the game client.
 *
 * Pure: no fetch/DOM/Dexie, no `Date.now()` — `nowMs` is always a parameter,
 * matching `colonyStatus(programs, nowMs)`. Every projection is a function of
 * an install-time baseline the caller hands in; the engine never infers a
 * counterfactual baseline from a running program's own state.
 */
import type { ExtractorProgram, ExtractorYieldProgram } from './types';

/** Dogma attribute 1683: how fast output falls away over a program. */
export const EXTRACTOR_DECAY_FACTOR = 0.012;
/** Dogma attribute 1687: amplitude of the cosine ripple riding on the decay. */
export const EXTRACTOR_NOISE_FACTOR = 0.8;

/** CCP's curve is expressed in 900-second bars; `t` counts bars, not seconds. */
const BAR_SECONDS = 900;

/** A cycle's width in CCP's 900-second bars — the unit `t` is measured in. */
function barWidthOf(program: ExtractorYieldProgram): number {
  return program.cycleTimeMs / 1000 / BAR_SECONDS;
}

/** True when the program carries a complete, usable install-time baseline. */
export function hasYieldBaseline(program: ExtractorProgram): program is ExtractorYieldProgram {
  const { qtyPerCycle, cycleTimeMs, installTimeMs } = program;
  return (
    typeof qtyPerCycle === 'number' &&
    Number.isFinite(qtyPerCycle) &&
    typeof cycleTimeMs === 'number' &&
    Number.isFinite(cycleTimeMs) &&
    cycleTimeMs > 0 &&
    typeof installTimeMs === 'number' &&
    Number.isFinite(installTimeMs)
  );
}

/**
 * Output of one cycle, transcribed from CCP's `calculateExtractorValues`
 * generator. The three cosine terms are theirs, `sin_a`/`sin_b`/`sin_c`
 * misnomer included — they are what makes the curve ripple instead of decay
 * smoothly, so none of them collapses into the others.
 */
function cycleYield(qtyPerCycle: number, barWidth: number, cycle: number): number {
  const t = (cycle + 0.5) * barWidth;
  const decayValue = qtyPerCycle / (1 + t * EXTRACTOR_DECAY_FACTOR);
  const phaseShift = Math.pow(qtyPerCycle, 0.7);
  const sinA = Math.cos(phaseShift + t * (1 / 12));
  const sinB = Math.cos(phaseShift / 2 + t * 0.2);
  const sinC = Math.cos(t * 0.5);
  const sinStuff = Math.max((sinA + sinB + sinC) / 3, 0);
  const barHeight = decayValue * (1 + EXTRACTOR_NOISE_FACTOR * sinStuff);
  return barWidth * barHeight;
}

/** Number of whole cycles between install and expiry; a partial trailing cycle doesn't count. */
export function programCycleCount(program: ExtractorYieldProgram): number {
  const spanMs = program.expiryTimeMs - program.installTimeMs;
  if (!Number.isFinite(spanMs) || spanMs <= 0) return 0;
  return Math.floor(spanMs / program.cycleTimeMs);
}

/**
 * Per-cycle output for `cycleCount` cycles off this program's install-time
 * baseline. The count is an argument rather than a property of the program:
 * length enters CCP's formula only as how many cycles to walk, so asking what
 * a differently-sized program off the same baseline would yield is the same
 * call with a different count.
 */
export function extractorCycleYields(program: ExtractorYieldProgram, cycleCount: number): number[] {
  const cycles = Math.max(0, Math.floor(cycleCount));
  const barWidth = barWidthOf(program);
  const yields: number[] = [];
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    yields.push(cycleYield(program.qtyPerCycle, barWidth, cycle));
  }
  return yields;
}

function sumCycles(program: ExtractorYieldProgram, fromCycle: number, toCycle: number): number {
  const barWidth = barWidthOf(program);
  let total = 0;
  for (let cycle = fromCycle; cycle < toCycle; cycle += 1) {
    total += cycleYield(program.qtyPerCycle, barWidth, cycle);
  }
  return total;
}

/** Everything the program will have produced by the time it expires. */
export function programTotalYield(program: ExtractorYieldProgram): number {
  return sumCycles(program, 0, programCycleCount(program));
}

/** Cycles finished at `nowMs`, clamped to the program's own span. */
function completedCycles(program: ExtractorYieldProgram, nowMs: number): number {
  const elapsedMs = nowMs - program.installTimeMs;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.min(Math.floor(elapsedMs / program.cycleTimeMs), programCycleCount(program));
}

/** Output already delivered at `nowMs` — a cycle banks only once it completes. */
export function yieldBankedBy(program: ExtractorYieldProgram, nowMs: number): number {
  return sumCycles(program, 0, completedCycles(program, nowMs));
}

/** Output still to come after `nowMs`; zero once the program has expired. */
export function yieldRemaining(program: ExtractorYieldProgram, nowMs: number): number {
  return sumCycles(program, completedCycles(program, nowMs), programCycleCount(program));
}

/**
 * The in-progress cycle's output over the first cycle's — 1.0 at install,
 * falling as the curve decays. An expired program keeps reporting its final
 * cycle's fraction rather than dropping to zero: the number describes how far
 * the curve fell, and "expired" is `extractorState`'s job to say.
 */
export function fractionOfPeak(program: ExtractorYieldProgram, nowMs: number): number {
  const cycleCount = programCycleCount(program);
  if (cycleCount === 0) return 0;
  const barWidth = barWidthOf(program);
  const cycle = Math.min(completedCycles(program, nowMs), cycleCount - 1);
  const peak = cycleYield(program.qtyPerCycle, barWidth, 0);
  if (peak === 0) return 0;
  return cycleYield(program.qtyPerCycle, barWidth, cycle) / peak;
}

/**
 * True once the current cycle's output has fallen strictly below `threshold`
 * of the program's peak. The threshold is the caller's — this engine takes no
 * view on when a program stops being worth leaving up.
 */
export function pastEfficientWindow(
  program: ExtractorYieldProgram,
  nowMs: number,
  threshold: number
): boolean {
  return fractionOfPeak(program, nowMs) < threshold;
}
