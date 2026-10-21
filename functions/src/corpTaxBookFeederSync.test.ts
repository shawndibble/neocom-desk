import { describe, expect, it } from 'vitest';
import {
  FEEDER_FORBIDDEN_STORM,
  FeederStorm,
  MAX_STRUCTURE_LOOKUPS,
  STRUCTURE_RECHECK_MS,
  lookUpRefineryStructures,
  outcomeOf,
  readFeederLedger,
  structuresToLookUp,
  type FeederLedgerRead,
} from './corpTaxBookFeederSync.js';
import type { EsiRead, SyncEsi } from './corpTaxBookSyncEsi.js';

const FEEDER = 98000002;
const ok = <T>(data: T): EsiRead<T> => ({
  kind: 'ok',
  data,
  fetchedAt: '2026-10-18T12:00:00.000Z',
  truncated: false,
});

function fakeEsi(over: Partial<Record<keyof SyncEsi, unknown>> = {}) {
  const calls: string[] = [];
  const esi = {
    observers: async () => (calls.push('observers'), over.observers ?? ok([5001, 5002])),
    ledger: async (_c: number, observer: number) => (
      calls.push(`ledger:${observer}`),
      over.ledger ??
        ok([
          {
            character_id: 9,
            recorded_corporation_id: 3,
            type_id: 45490,
            quantity: 100,
            last_updated: '2026-10-17',
          },
        ])
    ),
    extractions: async () => (calls.push('extractions'), ok([])),
    notifications: async () => (calls.push('notifications'), ok([])),
    journal: async () => (calls.push('journal'), ok([])),
    structureSystem: async () => (calls.push('system'), ok(1)),
    structure: async (id: number) => (
      calls.push(`structure:${id}`),
      (over.structure as ((id: number) => unknown) | undefined)?.(id) ?? {
        kind: 'ok',
        name: `Refinery ${id}`,
        solarSystemId: 30004000,
      }
    ),
    budgetLow: () => Boolean(over.budgetLow),
  } as unknown as SyncEsi;
  return { esi, calls };
}

describe('readFeederLedger', () => {
  it('reads the observers and each refinery, and tags the rows with the feeder', async () => {
    const { esi, calls } = fakeEsi();
    const read = await readFeederLedger(esi, FEEDER, 'tok');
    expect(read).toMatchObject({ kind: 'ok', refineries: 2 });
    if (read.kind !== 'ok') throw new Error('unreachable');
    expect(read.rows.map((r) => [r.structureId, r.sourceCorporationId])).toEqual([
      [5001, FEEDER],
      [5002, FEEDER],
    ]);
    expect(calls).toEqual(['observers', 'ledger:5001', 'ledger:5002']);
  });

  it('never calls an endpoint the ledger-only grant cannot reach', async () => {
    const { esi, calls } = fakeEsi();
    await readFeederLedger(esi, FEEDER, 'tok');
    expect(calls.filter((c) => !/^(observers|ledger)/.test(c))).toEqual([]);
  });

  it('a 403 on the observer list is a refusal and stops at once', async () => {
    const { esi, calls } = fakeEsi({ observers: { kind: 'forbidden' } });
    expect(await readFeederLedger(esi, FEEDER, 'tok')).toEqual({ kind: 'refused' });
    expect(calls).toEqual(['observers']);
  });

  it('the first 403 on a ledger ends that feeder’s read; no partial rows', async () => {
    const { esi, calls } = fakeEsi({ ledger: { kind: 'forbidden' } });
    expect(await readFeederLedger(esi, FEEDER, 'tok')).toEqual({ kind: 'refused' });
    expect(calls).toEqual(['observers', 'ledger:5001']);
  });

  it('a 420/429 is a budget stop, not a refusal', async () => {
    const { esi } = fakeEsi({ ledger: { kind: 'backoff' } });
    expect(await readFeederLedger(esi, FEEDER, 'tok')).toEqual({ kind: 'budget' });
  });

  it('an unanswered refinery abandons the read rather than reading it as empty', async () => {
    const { esi } = fakeEsi({ ledger: { kind: 'unavailable' } });
    expect(await readFeederLedger(esi, FEEDER, 'tok')).toEqual({ kind: 'unavailable' });
  });

  it('stops before the next refinery once the shared budget is low', async () => {
    const { esi, calls } = fakeEsi({ budgetLow: true });
    expect(await readFeederLedger(esi, FEEDER, 'tok')).toEqual({ kind: 'budget' });
    expect(calls).toEqual(['observers']);
  });

  it('a feeder with no refineries reads fine (and clears stale)', async () => {
    const { esi } = fakeEsi({ observers: ok([]) });
    expect(await readFeederLedger(esi, FEEDER, 'tok')).toMatchObject({ kind: 'ok', rows: [] });
  });
});

describe('outcomeOf', () => {
  it('only a refusal is stale; ESI trouble is inconclusive', () => {
    const cases: [FeederLedgerRead, string][] = [
      [{ kind: 'ok', rows: [], refineries: 0, truncated: false }, 'ok'],
      [{ kind: 'refused' }, 'stale'],
      [{ kind: 'budget' }, 'none'],
      [{ kind: 'unavailable' }, 'none'],
    ];
    for (const [read, outcome] of cases) expect(outcomeOf(read)).toBe(outcome);
  });
});

describe('FeederStorm', () => {
  it('trips after a run of refusals and a good read resets it', () => {
    const storm = new FeederStorm();
    for (let i = 0; i < FEEDER_FORBIDDEN_STORM - 1; i++) storm.record('stale');
    expect(storm.tripped).toBe(false);
    storm.record('ok');
    for (let i = 0; i < FEEDER_FORBIDDEN_STORM - 1; i++) storm.record('stale');
    expect(storm.tripped).toBe(false);
    storm.record('stale');
    expect(storm.tripped).toBe(true);
  });
});

describe('structuresToLookUp (#4654)', () => {
  const NOW = Date.parse('2026-10-20T12:00:00Z');
  const fresh = NOW - STRUCTURE_RECHECK_MS + 60_000;
  const old = NOW - STRUCTURE_RECHECK_MS - 60_000;

  it('looks up a refinery that is new, and leaves alone one read or refused this week', () => {
    expect(
      structuresToLookUp(
        [5001, 5002, 5003],
        {
          '5002': { name: 'Efa VII - Tatara', solarSystemId: 30004000, checkedAt: fresh },
          '5003': { checkedAt: fresh, denied: true },
        },
        NOW
      )
    ).toEqual([5001]);
  });

  it('re-reads a name, or retries a refusal, once a week has passed', () => {
    expect(
      structuresToLookUp(
        [5002, 5003],
        {
          '5002': { name: 'Efa VII - Tatara', solarSystemId: 30004000, checkedAt: old },
          '5003': { checkedAt: old, denied: true },
        },
        NOW
      )
    ).toEqual([5002, 5003]);
  });

  it('looks up at most a capped number a run, each once', () => {
    const ids = Array.from({ length: MAX_STRUCTURE_LOOKUPS + 5 }, (_, i) => 6000 + i);
    expect(structuresToLookUp([...ids, 6000], undefined, NOW)).toEqual(
      ids.slice(0, MAX_STRUCTURE_LOOKUPS)
    );
  });
});

describe('lookUpRefineryStructures (#4654)', () => {
  const NOW = Date.parse('2026-10-20T12:00:00Z');

  it('keeps the name and system, and remembers a 403 or 404 as refused', async () => {
    const { esi, calls } = fakeEsi({
      structure: (id: number) => (id === 5002 ? { kind: 'denied' } : undefined),
    });
    expect(await lookUpRefineryStructures(esi, [5001, 5002], 'tok', NOW)).toEqual({
      '5001': { name: 'Refinery 5001', solarSystemId: 30004000, checkedAt: NOW },
      '5002': { checkedAt: NOW, denied: true },
    });
    expect(calls).toEqual(['structure:5001', 'structure:5002']);
  });

  it('remembers nothing for an unanswered lookup, so the next run tries again', async () => {
    const { esi } = fakeEsi({ structure: () => ({ kind: 'unavailable' }) });
    expect(await lookUpRefineryStructures(esi, [5001], 'tok', NOW)).toEqual({});
  });

  it('stops at a 420/429 or a low shared budget', async () => {
    const backoff = fakeEsi({ structure: () => ({ kind: 'backoff' }) });
    expect(await lookUpRefineryStructures(backoff.esi, [5001, 5002], 'tok', NOW)).toEqual({});
    expect(backoff.calls).toEqual(['structure:5001']);
    const low = fakeEsi({ budgetLow: true });
    expect(await lookUpRefineryStructures(low.esi, [5001], 'tok', NOW)).toEqual({});
    expect(low.calls).toEqual([]);
  });
});
