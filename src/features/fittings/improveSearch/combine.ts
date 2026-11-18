/**
 * One result from an Improve search's side runs: the list the panel shows,
 * one checked count for both runs, and for a two-side tank run each side's
 * own figure and the options on neither side.
 */
import { onlyNeutral, onlySide, type ImproveResult } from '@/engine/fittings/improve';
import type { DefenseSide } from '@/engine/fittings/improve';
import type { SideSet } from './plan';

export interface Combined {
  /** The list: the first side's run, without the other side's swaps. */
  listed: ImproveResult;
  /** Calculations across both runs: the total the progress bar showed. */
  checked: number;
  /** Both sides' results, when both ran to the end. */
  sides?: Record<DefenseSide, ImproveResult>;
  /** With `sides`: the options on neither side, shown as "Either". */
  neutral?: ImproveResult;
}

/** `results` are the runs of `sets` that finished, in order (at least the first). */
export function combineSides(
  sets: readonly SideSet[],
  results: readonly ImproveResult[],
  groupOf: (typeId: number) => number | undefined
): Combined {
  const bySide = sets.length === 2;
  // A side counts only the options that put its own tank modules on the fit.
  // "Show best so far" can end the search with one side done: it is filtered but not compared.
  const sided = bySide
    ? results.map((result, i) => onlySide(result, sets[i].side as DefenseSide, groupOf))
    : results;
  // The list drops only the other side's swaps; a weapon or Damage Control swap still counts for Best overall.
  const listed = bySide
    ? onlySide(results[0], sets[0].side as DefenseSide, groupOf, false)
    : results[0];
  // One count for both side runs, the same total the progress bar showed.
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
