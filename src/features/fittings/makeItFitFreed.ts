import { overageOf, RESOURCES, usedOf, type Resource } from '@/engine/fittings/makeItFit';
import type { FittingStats } from '@/engine/fittings/types';
import { formatNumber } from '@/lib/numberLocale';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const TOTAL_KEY = {
  cpu: 'cpuTotal',
  powergrid: 'powergridTotal',
  calibration: 'calibrationTotal',
} as const;

export const totalOf = (stats: FittingStats, resource: Resource): number =>
  stats[TOTAL_KEY[resource]] ?? 0;

/** Whole units: a budget readout never needs decimals, and a fraction over still reads as over. */
const whole = (value: number) => formatNumber(Math.max(1, Math.round(value)));

export interface OverBudget {
  resource: Resource;
  used: number;
  total: number;
  over: number;
}

/** Every budget the Fitting is over, in CPU, powergrid, calibration order. */
export function overBudgets(before: FittingStats): OverBudget[] {
  return RESOURCES.flatMap((resource) => {
    const over = overageOf(before, resource);
    return over > 0
      ? [{ resource, used: usedOf(before, resource), total: totalOf(before, resource), over }]
      : [];
  });
}

export const unitOf = (resource: Resource, t: Translate): string =>
  t(`fittings.makeItFit.unit.${resource}`);

export const roundedAmount = (value: number): string => formatNumber(Math.round(value));

/**
 * What a fix does for the budget the pilot clicked "Fix" on: "Frees 38 tf" when it
 * lowers what the Fitting uses (a swap), "Adds 42 tf" when it raises what the ship
 * has (an implant), both when it does both; null when it does neither.
 */
export function freedLabel(
  before: FittingStats | null,
  after: FittingStats,
  resource: Resource | null,
  t: Translate
): string | null {
  if (!before || !resource) return null;
  const unit = unitOf(resource, t);
  const freed = usedOf(before, resource) - usedOf(after, resource);
  const added = totalOf(after, resource) - totalOf(before, resource);
  const parts = [
    freed > 0 ? t('fittings.makeItFit.frees', { amount: whole(freed), unit }) : null,
    added > 0 ? t('fittings.makeItFit.adds', { amount: whole(added), unit }) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}
