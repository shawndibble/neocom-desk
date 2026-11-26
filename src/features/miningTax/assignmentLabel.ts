import type { MiningTaxAssignmentRecord } from '@/db';

export function normalizeLabel(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

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

export function labelWithoutSystem(label: string, systemName: string): string {
  const prefix = `${systemName} - `;
  return label.startsWith(prefix) && label.length > prefix.length
    ? label.slice(prefix.length)
    : label;
}
