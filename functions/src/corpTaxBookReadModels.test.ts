import { describe, expect, it } from 'vitest';
import { READ_MODELS_SCHEMA, buildReadModels, movesReadModels } from './corpTaxBookReadModels.js';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const notice = (
  id: string,
  minerId: string,
  dates: string[],
  issuedAt = '2026-11-10T00:00:00Z'
) => ({
  id,
  minerId,
  issuedAt,
  lines: dates.map((date) => ({ date, tax: 100 })),
});

describe('buildReadModels on Running accounts', () => {
  const inputs = {
    startDate: '2026-10-01',
    expiryHours: {},
    extractions: [],
    accounts: [
      {
        id: 'g1',
        owed: 300,
        paid: 1000,
        days: 2,
        oldest: '2026-11-01',
        unpaidDays: [
          { date: '2026-11-01', owed: 100, tax: 100 },
          { date: '2026-11-02', owed: 200, tax: 200 },
        ],
        at: '2026-11-15T00:00:00Z',
      },
      { id: 'solo:5', owed: 0, paid: 0, days: 0, at: '2026-11-15T00:00:00Z' },
    ],
    payments: [
      { id: 'p1', minerId: 'g1', source: 'donation', amount: 1000, at: '2026-11-05T00:00:00Z' },
      { id: 'p2', minerId: 'g1', source: 'donation', amount: 150, at: '2026-11-16T00:00:00Z' },
      { id: 'p3', minerId: 'solo:5', source: 'manual', amount: 40, at: '2026-11-17T00:00:00Z' },
      { id: 'p4', source: 'donation', amount: 9, at: '2026-11-17T00:00:00Z' },
    ],
    notices: [
      notice('n-old', 'g1', ['2026-10-20']),
      notice('n-open', 'g1', ['2026-11-01', '2026-11-02'], '2026-11-12T00:00:00Z'),
    ],
    declarations: [
      { id: 'x1', statementId: 'n-open', kind: 'contract', at: '2026-11-13T00:00:00Z' },
      { id: 'x2', statementId: 'n-old', kind: 'contract', resolution: { kind: 'confirmed' } },
    ],
  };

  it('reads each Miner’s owed off the account an officer’s tab recorded, less what they paid since', () => {
    const { minerList } = buildReadModels(inputs, NOW);
    expect(minerList.schema).toBe(READ_MODELS_SCHEMA);
    expect(READ_MODELS_SCHEMA).toBe(2);
    const g1 = minerList.miners.find((m) => m.minerId === 'g1')!;
    // 150 paid since the record: the oldest day (100) and half of the next.
    expect(g1).toMatchObject({ owed: 150, credit: 0, lastPaidAt: '2026-11-16T00:00:00Z' });
    // Money paid beyond what the record said was owed is credit.
    expect(minerList.miners.find((m) => m.minerId === 'solo:5')).toMatchObject({
      owed: 0,
      credit: 40,
      lastPaidAt: '2026-11-17T00:00:00Z',
    });
  });

  it('lists a Miner’s Late notices still unsettled, each with its declarations', () => {
    const g1 = buildReadModels(inputs, NOW).minerList.miners.find((m) => m.minerId === 'g1')!;
    // Every day n-old listed is paid; n-open still lists an unpaid day.
    expect(g1.unsettled).toEqual([
      {
        id: 'n-open',
        issuedAt: '2026-11-12T00:00:00Z',
        declarations: [inputs.declarations[0]],
      },
    ]);
    expect(g1.unresolvedDeclarations).toEqual([inputs.declarations[0]]);
  });

  it('counts a notice of a Miner with no recorded account as unsettled', () => {
    const { minerList } = buildReadModels(
      { ...inputs, accounts: [], notices: [notice('n1', 'solo:9', ['2026-11-01'])] },
      NOW
    );
    expect(
      minerList.miners.find((m) => m.minerId === 'solo:9')?.unsettled.map((u) => u.id)
    ).toEqual(['n1']);
  });

  it('keeps the overview’s unmatched payments', () => {
    expect(buildReadModels(inputs, NOW).overview.unmatchedPayments).toEqual([inputs.payments[3]]);
  });
});

describe('movesReadModels', () => {
  it('rebuilds after what the docs are built from changes, and not otherwise', () => {
    for (const action of [
      'recordAccounts',
      'issueLateNotice',
      'declare',
      'assignPayment',
      'regroupMiner',
    ])
      expect(movesReadModels({ action })).toBe(true);
    expect(movesReadModels({ action: 'updateSettings', patch: { startDate: '2026-10-01' } })).toBe(
      true
    );
    expect(movesReadModels({ action: 'updateSettings', patch: { hubId: 'jita' } })).toBe(false);
    for (const action of ['recordLateNoticeMail', 'recordCheckpoints', 'addRate', 'writeOff'])
      expect(movesReadModels({ action })).toBe(false);
  });
});
