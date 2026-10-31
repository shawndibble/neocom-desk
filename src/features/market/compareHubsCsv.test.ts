import { describe, it, expect } from 'vitest';
import { TRADE_HUBS } from '@/market/hubs';
import { compareHubsCsvColumns } from './compareHubsCsv';
import type { CompareHubRow } from './compareHubsRows';
import type { HubId } from './useCompareHubs';

const t = (k: string, opts?: Record<string, unknown>) =>
  opts?.hub ? `${k}:${String(opts.hub)}` : k;

const ids = TRADE_HUBS.map((hub) => hub.id);
const quote = (sell: number | null, buy: number | null, loading = false) => ({
  sell,
  buy,
  loading,
});

function row(overrides: Partial<CompareHubRow> = {}): CompareHubRow {
  const quotes = Object.fromEntries(
    ids.map((id) => [id, quote(100, 90)])
  ) as CompareHubRow['quotes'];
  const unreachable = Object.fromEntries(
    ids.map((id) => [id, false])
  ) as CompareHubRow['unreachable'];
  return {
    typeId: 1,
    itemName: 'Rifter',
    quotes,
    unreachable,
    bestSellHub: 'jita',
    bestBuyHub: 'amarr',
    ...overrides,
  } as CompareHubRow;
}

const jumps = Object.fromEntries(ids.map((id, i) => [id, i === 0 ? null : i])) as Record<
  HubId,
  number | null
>;
const columns = compareHubsCsvColumns(t, { jumps, ownHub: 'amarr' });
const valuesOf = (r: CompareHubRow) =>
  Object.fromEntries(columns.map((c) => [c.header, c.value(r)]));

describe('compareHubsCsvColumns', () => {
  it('exports sell, buy, jumps and status per hub, then best hubs and your hub', () => {
    expect(columns).toHaveLength(1 + ids.length * 4 + 3);
    const values = valuesOf(row());
    const jita = TRADE_HUBS[0].systemName;
    expect(values[`market.compare.hubSellColumn:${jita}`]).toBe(100);
    expect(values[`market.compare.hubJumpsColumn:${jita}`]).toBeNull();
    expect(values[`market.compare.hubJumpsColumn:${TRADE_HUBS[1].systemName}`]).toBe(1);
    expect(values['market.compare.columnBestSellHub']).toBe(jita);
    expect(values['market.compare.columnYourHub']).toBe(
      TRADE_HUBS.find((hub) => hub.id === 'amarr')!.systemName
    );
  });

  it('tells an unreachable hub from one with no sellers', () => {
    const first = TRADE_HUBS[0];
    const status = `market.compare.hubStatusColumn:${first.systemName}`;
    const unreachable = row({
      quotes: { ...row().quotes, [first.id]: quote(null, null) },
      unreachable: { ...row().unreachable, [first.id]: true },
    });
    expect(valuesOf(unreachable)[status]).toBe('market.compare.exportUnreachable');
    const noSellers = row({ quotes: { ...row().quotes, [first.id]: quote(null, 50) } });
    expect(valuesOf(noSellers)[status]).toBe('market.compare.noSellers');
    const loading = row({ quotes: { ...row().quotes, [first.id]: quote(null, null, true) } });
    expect(valuesOf(loading)[status]).toBeNull();
    expect(valuesOf(row())[status]).toBeNull();
  });
});
