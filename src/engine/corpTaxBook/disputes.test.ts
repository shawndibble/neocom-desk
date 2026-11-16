import { describe, expect, it } from 'vitest';
import type { DayCharge } from './charges';
import { disputedTax, disputesToShow, readDisputes, type OreDispute } from './disputes';
import type { Dismissal } from './dismissals';

const dispute = (overrides: Partial<OreDispute> = {}): OreDispute => ({
  id: 'm-a_2026-11-01',
  minerId: 'm-a',
  date: '2026-11-01',
  lines: [
    { recordKey: '60:1000:2026-11-01', typeId: 45490, quantity: 100, payeeName: 'Rival Corp' },
    { recordKey: '77:1000:2026-11-01', typeId: 45491, quantity: 50, payeeName: 'Rival Corp' },
  ],
  by: 60,
  at: '2026-11-03T00:00:00.000Z',
  ...overrides,
});

const dismissal = (targetId: string, overrides: Partial<Dismissal> = {}): Dismissal => ({
  id: `d-${targetId}`,
  scope: 'record',
  targetId,
  by: 1,
  at: '2026-11-04T00:00:00.000Z',
  reason: 'their ore',
  ...overrides,
});

describe('disputesToShow (#6206)', () => {
  it('shows a dispute nobody answered, oldest day first', () => {
    const later = dispute({ id: 'm-b_2026-11-02', minerId: 'm-b', date: '2026-11-02' });
    expect(disputesToShow([later, dispute()], []).map((d) => d.id)).toEqual([
      'm-a_2026-11-01',
      'm-b_2026-11-02',
    ]);
  });

  it('drops one an officer rejected', () => {
    const rejected = dispute({
      resolution: { kind: 'rejected', at: '2026-11-04T00:00:00.000Z', by: 1, reason: 'ours' },
    });
    expect(disputesToShow([rejected], [])).toEqual([]);
  });

  it('drops a day once every line is dismissed, and keeps it while one is not', () => {
    const one = [dismissal('60:1000:2026-11-01')];
    expect(disputesToShow([dispute()], one)).toHaveLength(1);
    const both = [...one, dismissal('77:1000:2026-11-01')];
    expect(disputesToShow([dispute()], both)).toEqual([]);
    // A Miner dismissal made after the day covers it too; a reversed one never does.
    expect(disputesToShow([dispute()], [dismissal('m-a', { scope: 'miner' })])).toEqual([]);
    const reversed = both.map((d) => ({
      ...d,
      reversed: { by: 1, at: '2026-11-05T00:00:00.000Z' },
    }));
    expect(disputesToShow([dispute()], reversed)).toHaveLength(1);
  });
});

describe('readDisputes', () => {
  it('keeps well-formed docs and drops the rest', () => {
    expect(readDisputes([dispute(), { id: 'x' }, null])).toEqual([dispute()]);
  });
});

describe('disputedTax (#6206)', () => {
  const charge = (key: string, oreLines: { typeId: number; quantity: number }[]) =>
    ({
      key,
      oreLines,
      unitPrices: { 45490: 1000, 45491: 2000, 45492: 5000 },
      taxPct: 10,
      taxOwed: 0,
    }) as unknown as DayCharge;

  it('prices only the disputed ore, at the day charge’s prices and rate', () => {
    const charges = [
      // The day also holds ore nobody disputed: it stays billed.
      charge('60:1000:2026-11-01', [
        { typeId: 45490, quantity: 100 },
        { typeId: 45492, quantity: 999 },
      ]),
      charge('77:1000:2026-11-01', [{ typeId: 45491, quantity: 50 }]),
    ];
    // 100 × 1000 × 10% + 50 × 2000 × 10%
    expect(disputedTax(dispute(), charges)).toBe(20_000);
  });

  it('never prices more ore than the charge holds', () => {
    const charges = [
      charge('60:1000:2026-11-01', [{ typeId: 45490, quantity: 40 }]),
      charge('77:1000:2026-11-01', [{ typeId: 45491, quantity: 50 }]),
    ];
    expect(disputedTax(dispute(), charges)).toBe(4_000 + 10_000);
  });

  it('is unknown while a disputed day has no charge in view', () => {
    expect(disputedTax(dispute(), [charge('60:1000:2026-11-01', [])])).toBeUndefined();
  });
});

describe('a waived dispute (#6206)', () => {
  const waived = {
    kind: 'dismissed' as const,
    at: '2026-11-04T00:00:00.000Z',
    by: 1,
    reason: 'theirs',
    amountIsk: 20_000,
  };

  it('reads back and leaves Needs you', () => {
    const [read] = readDisputes([dispute({ resolution: waived })]);
    expect(read.resolution).toEqual(waived);
    expect(disputesToShow([read], [])).toEqual([]);
  });
});
