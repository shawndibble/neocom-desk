/** Shared wording helpers for the Goal Planner's rail and results. */
import type { PiData } from '@/sde/types';

const UNITS_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });

/** Units (an hourly rate, a daily goal) the same way everywhere on the tab. */
export function formatUnits(value: number): string {
  return UNITS_FORMAT.format(value);
}

/** A planetary commodity's name off the payload: a schematic's output, or a P0. */
export function commodityName(typeId: number, pi: PiData): string {
  return (
    pi.schematics[String(typeId)]?.name ??
    pi.raw.find((resource) => resource.typeID === typeId)?.name ??
    String(typeId)
  );
}

/**
 * A typed non-negative decimal, with "," read as the decimal separator (a
 * pilot's locale keyboard). Null for blank or anything that is not a plain
 * number — never a partial parse of garbage.
 */
export function parseDecimal(text: string): number | null {
  const normalised = text.trim().replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(normalised)) return null;
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}
