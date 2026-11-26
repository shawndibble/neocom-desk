import { createLocalSetting } from '@/lib/useLocalSetting';
import type { HaulingViewRow } from './haulingView';

export interface HaulingLane {
  fromHub: string;
  toHub: string;
  item: string;
  profit: number;
}

export interface HaulingSummary {
  fetchedAt: number;
  lanes: HaulingLane[];
}

export const MAX_SUMMARY_LANES = 3;

type SummaryRow = Pick<HaulingViewRow, 'name' | 'profitPerUnit' | 'suggestedUnits'> & {
  fromHub: { id: string };
  toHub: { id: string };
};

export function summarizeHaulingRows(
  rows: readonly SummaryRow[],
  fetchedAt: number
): HaulingSummary | null {
  const best = new Map<string, HaulingLane>();
  for (const row of rows) {
    const profit = row.profitPerUnit * row.suggestedUnits;
    if (!(profit > 0)) continue;
    const key = `${row.fromHub.id}>${row.toHub.id}`;
    if (profit > (best.get(key)?.profit ?? 0)) {
      best.set(key, { fromHub: row.fromHub.id, toHub: row.toHub.id, item: row.name, profit });
    }
  }
  const lanes = [...best.values()].sort((a, b) => b.profit - a.profit).slice(0, MAX_SUMMARY_LANES);
  return lanes.length === 0 ? null : { fetchedAt, lanes };
}

function parseSummary(raw: unknown): HaulingSummary | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { fetchedAt, lanes } = raw as Partial<HaulingSummary>;
  if (typeof fetchedAt !== 'number' || !Array.isArray(lanes)) return null;
  const valid = lanes.filter(
    (l): l is HaulingLane =>
      typeof l === 'object' &&
      l !== null &&
      typeof l.fromHub === 'string' &&
      typeof l.toHub === 'string' &&
      typeof l.item === 'string' &&
      typeof l.profit === 'number'
  );
  return valid.length === 0 ? null : { fetchedAt, lanes: valid.slice(0, MAX_SUMMARY_LANES) };
}

export const useHaulingSummary = createLocalSetting<HaulingSummary | null>({
  key: 'haulingLastScan',
  defaultValue: null,
  parse: parseSummary,
});

export function rememberHaulingSummary(summary: HaulingSummary): void {
  const { value, setValue } = useHaulingSummary.getState();
  if (value !== null && JSON.stringify(value) === JSON.stringify(summary)) return;
  void setValue(summary);
}
