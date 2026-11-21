import { describe, expect, it } from 'vitest';
import { absorbedMinerIds, planRekey, soloTargets, type RekeyRecord } from './corpTaxBookRekey.js';

const rec = (collection: string, id: string, data: Record<string, unknown>): RekeyRecord => ({
  collection,
  id,
  data,
});

describe('absorbedMinerIds', () => {
  it('names the absorbed groups and a solo id per character, never the target', () => {
    expect(absorbedMinerIds('solo:1', [1, 2, 3], ['g9'])).toEqual(['g9', 'solo:2', 'solo:3']);
  });
  it('lists each id once', () => {
    expect(absorbedMinerIds('g1', [1, 2], ['solo:2', 'g9', 'g9'])).toEqual([
      'solo:2',
      'g9',
      'solo:1',
    ]);
  });
});

describe('planRekey', () => {
  const base = {
    target: 'g1',
    targetUids: ['char:1', 'char:2'],
    existingDisputeIds: new Set<string>(),
  };

  it('points a record at the target and widens its readers to the whole group', () => {
    const writes = planRekey({
      ...base,
      records: [
        rec('statements', 's1', { minerId: 'solo:2', uids: ['char:2'] }),
        rec('payments', 'p1', { minerId: 'solo:2' }),
      ],
    });
    expect(writes).toEqual([
      {
        kind: 'update',
        collection: 'statements',
        id: 's1',
        fields: { minerId: 'g1', uids: ['char:1', 'char:2'] },
      },
      { kind: 'update', collection: 'payments', id: 'p1', fields: { minerId: 'g1' } },
    ]);
  });

  it('moves a miner-scoped dismissal by targetId, and leaves a record-scoped one alone', () => {
    const writes = planRekey({
      ...base,
      records: [
        rec('dismissals', 'd1', { scope: 'miner', targetId: 'solo:2', uids: ['char:2'] }),
        rec('dismissals', 'd2', { scope: 'record', targetId: '2:x' }),
      ],
    });
    expect(writes).toEqual([
      {
        kind: 'update',
        collection: 'dismissals',
        id: 'd1',
        fields: { targetId: 'g1', uids: ['char:1', 'char:2'] },
      },
    ]);
  });

  it('moves a dispute to the id its new Miner would file, unless that day is already taken', () => {
    const records = [
      rec('disputes', 'solo_2_2026-11-01', {
        minerId: 'solo:2',
        date: '2026-11-01',
        uids: ['char:2'],
      }),
    ];
    expect(planRekey({ ...base, records })).toEqual([
      {
        kind: 'move',
        collection: 'disputes',
        fromId: 'solo_2_2026-11-01',
        toId: 'g1_2026-11-01',
        data: { minerId: 'g1', date: '2026-11-01', uids: ['char:1', 'char:2'] },
      },
    ]);
    expect(planRekey({ ...base, records, existingDisputeIds: new Set(['g1_2026-11-01']) })).toEqual(
      [
        {
          kind: 'update',
          collection: 'disputes',
          id: 'solo_2_2026-11-01',
          fields: { minerId: 'g1', uids: ['char:1', 'char:2'] },
        },
      ]
    );
  });

  it('drops the absorbed Miner recorded figures: account and checkpoint', () => {
    const writes = planRekey({
      ...base,
      records: [rec('accounts', 'solo:2', {}), rec('accountCheckpoints', 'solo:2', {})],
    });
    expect(writes).toEqual([
      { kind: 'delete', collection: 'accounts', id: 'solo:2' },
      { kind: 'delete', collection: 'accountCheckpoints', id: 'solo:2' },
    ]);
  });

  it('moves a Late notice like any record carrying a minerId', () => {
    expect(
      planRekey({ ...base, records: [rec('lateNotices', 'n1', { minerId: 'solo:2', uids: [] })] })
    ).toEqual([
      {
        kind: 'update',
        collection: 'lateNotices',
        id: 'n1',
        fields: { minerId: 'g1', uids: ['char:1', 'char:2'] },
      },
    ]);
  });
});

describe('soloTargets', () => {
  it('maps the solo id of every grouped character to its group, for the backfill', () => {
    const miners = [
      { id: 'g1', characterIds: [1, 2] },
      { id: 'solo:5', characterIds: [5, 6] },
    ];
    expect(soloTargets(miners)).toEqual(
      new Map([
        ['solo:1', 'g1'],
        ['solo:2', 'g1'],
        ['solo:6', 'solo:5'],
      ])
    );
  });

  it('leaves out a guest Character still waiting to confirm', () => {
    expect(soloTargets([{ id: 'g1', characterIds: [1, 2], pendingConfirmation: [2] }])).toEqual(
      new Map([['solo:1', 'g1']])
    );
  });
});
