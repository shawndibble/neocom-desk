import type { MiningTaxAssignmentRecord } from '@/db';

/** A typed "Moon / structure" label as stored: trimmed, with blank meaning none. */
export function normalizeLabel(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Labels already used for this Payee in this system, most recently mined
 * first, so a pilot re-tags the same moon with one pick instead of retyping.
 */
export function labelSuggestions(
  assignments: readonly MiningTaxAssignmentRecord[],
  payeeId: string,
  solarSystemId: number
): string[] {
  const latest = new Map<string, string>();
  for (const a of assignments) {
    if (a.payeeId !== payeeId || a.solarSystemId !== solarSystemId || !a.label) continue;
    const seen = latest.get(a.label);
    if (seen === undefined || a.date > seen) latest.set(a.label, a.date);
  }
  return [...latest].sort((x, y) => (x[1] < y[1] ? 1 : x[1] > y[1] ? -1 : 0)).map(([l]) => l);
}
