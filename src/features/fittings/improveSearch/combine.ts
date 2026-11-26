import { onlyNeutral, onlySide, type ImproveResult } from '@/engine/fittings/improve';
import type { DefenseSide } from '@/engine/fittings/improve';
import type { SideSet } from './plan';

export interface Combined {
  listed: ImproveResult;
  checked: number;
  sides?: Record<DefenseSide, ImproveResult>;
  neutral?: ImproveResult;
}

export function combineSides(
  sets: readonly SideSet[],
  results: readonly ImproveResult[],
  groupOf: (typeId: number) => number | undefined
): Combined {
  const bySide = sets.length === 2;
  const sided = bySide
    ? results.map((result, i) => onlySide(result, sets[i].side as DefenseSide, groupOf))
    : results;
  const listed = bySide
    ? onlySide(results[0], sets[0].side as DefenseSide, groupOf, false)
    : results[0];
  const checked = results.reduce((sum, result) => sum + result.checked, 0);
  if (!bySide || results.length !== 2) return { listed, checked };
  return {
    listed,
    checked,
    sides: { [sets[0].side]: sided[0], [sets[1].side]: sided[1] } as Record<
      DefenseSide,
      ImproveResult
    >,
    neutral: onlyNeutral(results[0], groupOf),
  };
}
