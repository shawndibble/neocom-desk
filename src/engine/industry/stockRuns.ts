import { MAX_JOB_RUNS } from './types';

export interface StockRunsRow {
  typeID: number;
  quantity: number;
}

export interface MaxRunsFromStockInput {
  rowsAt: (runs: number) => readonly StockRunsRow[];
  availableFor: (typeID: number) => number;
  maxRuns?: number;
}

export interface MaxRunsFromStock {
  runs: number;
  limiting: number | null;
}

function firstShortRow(
  rows: readonly StockRunsRow[],
  availableFor: (typeID: number) => number
): number | undefined {
  return rows.find(({ typeID, quantity }) => quantity > availableFor(typeID))?.typeID;
}

export function maxRunsFromStock({
  rowsAt,
  availableFor,
  maxRuns = MAX_JOB_RUNS,
}: MaxRunsFromStockInput): MaxRunsFromStock {
  const cap = Math.max(1, Math.floor(maxRuns));
  const shortAt = (runs: number) => firstShortRow(rowsAt(runs), availableFor);

  if (rowsAt(1).length === 0) return { runs: 0, limiting: null };
  const shortAtOne = shortAt(1);
  if (shortAtOne !== undefined) return { runs: 0, limiting: shortAtOne };

  let covered = 1;
  let short: number | undefined;
  let beyond = 1;
  while (covered < cap) {
    beyond = Math.min(covered * 2, cap);
    short = shortAt(beyond);
    if (short !== undefined) break;
    covered = beyond;
  }
  if (covered >= cap) return { runs: cap, limiting: null };

  while (beyond - covered > 1) {
    const mid = Math.floor((covered + beyond) / 2);
    const midShort = shortAt(mid);
    if (midShort === undefined) covered = mid;
    else {
      beyond = mid;
      short = midShort;
    }
  }
  return { runs: covered, limiting: short ?? null };
}
