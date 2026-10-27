/**
 * Pure "what did this row actually mine" logic for the Mining Yield
 * Overview's optional Ore breakdown / Units columns (issue #1282) — split out
 * the same way `volume.ts` split from `volumeDisplay.tsx`, so it stays
 * unit-testable without React Testing Library.
 */
import type { OreLine } from '@/engine/miningTax/types';

/** Total units mined across every ore line in a row, regardless of type. */
export function sumUnits(oreLines: readonly OreLine[]): number {
  return oreLines.reduce((total, line) => total + line.quantity, 0);
}

/**
 * "Bitumens, Zeolites +2" — the two largest lines by quantity, named, with
 * the rest counted rather than dropped. A single line names itself with no
 * "+0"; no lines at all reads as the table's usual em dash.
 */
export function oreBreakdownSummary(
  oreLines: readonly OreLine[],
  typeNames: ReadonlyMap<number, string>
): string {
  if (oreLines.length === 0) return '—';
  const byQuantityDesc = [...oreLines].sort((a, b) => b.quantity - a.quantity);
  const names = byQuantityDesc.map((line) => typeNames.get(line.typeId) ?? `#${line.typeId}`);
  const shown = names.slice(0, 2);
  const remaining = names.length - shown.length;
  return remaining > 0 ? `${shown.join(', ')} +${remaining}` : shown.join(', ');
}
