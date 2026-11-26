import type { OreLine } from '@/engine/miningTax/types';
import { joined } from '@/lib/exportSheets';

export function sumUnits(oreLines: readonly OreLine[]): number {
  return oreLines.reduce((total, line) => total + line.quantity, 0);
}

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

export function oreLinesText(
  oreLines: readonly OreLine[],
  nameOf: (typeId: number) => string
): string | null {
  if (oreLines.length === 0) return null;
  return joined(
    [...oreLines]
      .sort((a, b) => b.quantity - a.quantity)
      .map((line) => `${nameOf(line.typeId)} × ${line.quantity}`)
  );
}
