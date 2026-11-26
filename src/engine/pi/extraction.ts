import type { ExtractorProgram, ExtractorYieldProgram } from './types';
import { DAY_MS, HOUR_MS } from '@/lib/age';

export const EXTRACTOR_DECAY_FACTOR = 0.012;
export const EXTRACTOR_NOISE_FACTOR = 0.8;

const BAR_SECONDS = 900;

function barWidthOf(program: ExtractorYieldProgram): number {
  return program.cycleTimeMs / 1000 / BAR_SECONDS;
}

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

export function programCycleCount(program: ExtractorYieldProgram): number {
  const spanMs = program.expiryTimeMs - program.installTimeMs;
  if (!Number.isFinite(spanMs) || spanMs <= 0) return 0;
  return Math.floor(spanMs / program.cycleTimeMs);
}

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

export function programTotalYield(program: ExtractorYieldProgram): number {
  return sumCycles(program, 0, programCycleCount(program));
}

export function sustainedRatePerHour(program: ExtractorYieldProgram): number {
  const cycles = programCycleCount(program);
  if (cycles === 0) return 0;
  const hours = (cycles * program.cycleTimeMs) / HOUR_MS;
  return hours > 0 ? programTotalYield(program) / hours : 0;
}

function completedCycles(program: ExtractorYieldProgram, nowMs: number): number {
  const elapsedMs = nowMs - program.installTimeMs;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.min(Math.floor(elapsedMs / program.cycleTimeMs), programCycleCount(program));
}

export function yieldBankedBy(program: ExtractorYieldProgram, nowMs: number): number {
  return sumCycles(program, 0, completedCycles(program, nowMs));
}

export function fractionOfPeak(program: ExtractorYieldProgram, nowMs: number): number {
  const cycleCount = programCycleCount(program);
  if (cycleCount === 0) return 0;
  const barWidth = barWidthOf(program);
  const cycle = Math.min(completedCycles(program, nowMs), cycleCount - 1);
  const peak = cycleYield(program.qtyPerCycle, barWidth, 0);
  if (peak === 0) return 0;
  return cycleYield(program.qtyPerCycle, barWidth, cycle) / peak;
}

export function fractionOfFirstDayRate(program: ExtractorYieldProgram, nowMs: number): number {
  const at = Math.min(nowMs, program.expiryTimeMs);
  if (!(at - program.installTimeMs >= DAY_MS)) return 1;
  const firstDayYield = yieldBankedBy(program, program.installTimeMs + DAY_MS);
  if (firstDayYield <= 0) return 1;
  return (yieldBankedBy(program, at) - yieldBankedBy(program, at - DAY_MS)) / firstDayYield;
}

export function pastEfficientWindow(
  program: ExtractorYieldProgram,
  nowMs: number,
  threshold: number
): boolean {
  return fractionOfFirstDayRate(program, nowMs) < threshold;
}
