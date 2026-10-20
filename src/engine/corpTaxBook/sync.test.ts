import { describe, expect, it } from 'vitest';
import {
  detectGaps,
  donationsFromJournal,
  mergeGaps,
  observedRowsFromLedger,
  placeObservedRows,
  planSettlements,
  reconcileExtractions,
  resolveDonations,
  syncStatus,
  type SyncExtraction,
} from './sync';
import type { Statement } from './statements';
import type { Dismissal } from './dismissals';
import { resolveRate, type TaxRate } from './rates';

const DAY = 86_400_000;
const at = (iso: string) => Date.parse(iso);

describe('placeObservedRows', () => {
  const extraction: SyncExtraction = {
    structureId: 1001,
    moonId: 40,
    extractionStartTime: '2026-07-01T12:00:00.000Z',
    chunkArrivalTime: '2026-07-10T12:00:00.000Z',
    naturalDecayTime: '2026-07-10T15:00:00.000Z',
  };
  const row = (structureId: number, date: string) => ({
    structureId,
    characterId: 7,
    recordedCorporationId: 9,
    typeId: 45490,
    date,
    quantity: 5,
    cachedAt: '2026-07-12T10:00:00.000Z',
  });

  it('stamps the refinery’s system and the moon it was drilling that day', () => {
    const [placed] = placeObservedRows([row(1001, '2026-07-10')], [extraction], { 1001: 30000142 });
    expect(placed).toMatchObject({ solarSystemId: 30000142, moonId: 40 });
  });

  it('omits the moon on a day no Extraction covers, keeping the system', () => {
    const [placed] = placeObservedRows([row(1001, '2026-07-05')], [extraction], { 1001: 30000142 });
    expect(placed.solarSystemId).toBe(30000142);
    expect(placed).not.toHaveProperty('moonId');
  });

  it('lets a per-moon rate resolve for a placed row, and not for an unplaced one', () => {
    const rates: TaxRate[] = [
      { scope: 'corp', pct: 10, effectiveFrom: '2026-01-01' },
      { scope: 'moon', moonId: 40, pct: 5, effectiveFrom: '2026-01-01' },
    ];
    const ctxFor = (r: { date: string; moonId?: number }) => ({
      date: r.date,
      minerId: 'm1',
      moonId: r.moonId,
      recordKey: 'k',
      isGuest: false,
    });
    const [placed] = placeObservedRows([row(1001, '2026-07-10')], [extraction], { 1001: 30000142 });
    expect(resolveRate(rates, ctxFor(placed))).toMatchObject({ pct: 5, scope: 'moon' });
    const [unplaced] = placeObservedRows([row(2002, '2026-07-10')], [extraction], {});
    expect(resolveRate(rates, ctxFor(unplaced))).toMatchObject({ pct: 10, scope: 'corp' });
  });

  it('leaves a refinery with no known Extraction or system as it was, without crashing', () => {
    const input = row(2002, '2026-07-10');
    expect(placeObservedRows([input], [extraction], {})).toEqual([input]);
  });
});

describe('observedRowsFromLedger', () => {
  it('stamps each ledger row with its refinery and the read time', () => {
    const rows = observedRowsFromLedger(
      1001,
      [
        {
          character_id: 7,
          recorded_corporation_id: 9,
          type_id: 45490,
          quantity: 12,
          last_updated: '2026-07-12',
        },
      ],
      '2026-07-12T10:00:00.000Z'
    );
    expect(rows).toEqual([
      {
        structureId: 1001,
        characterId: 7,
        recordedCorporationId: 9,
        typeId: 45490,
        date: '2026-07-12',
        quantity: 12,
        cachedAt: '2026-07-12T10:00:00.000Z',
      },
    ]);
  });

  it('stamps the source corporation on every row when given one', () => {
    const rows = observedRowsFromLedger(
      1001,
      [
        {
          character_id: 7,
          recorded_corporation_id: 9,
          type_id: 45490,
          quantity: 12,
          last_updated: '2026-07-12',
        },
      ],
      '2026-07-12T10:00:00.000Z',
      98000002
    );
    expect(rows[0].sourceCorporationId).toBe(98000002);
  });

  it('drops rows the server would reject: no quantity, a bad date or a non-integer', () => {
    const base = {
      character_id: 7,
      recorded_corporation_id: 9,
      type_id: 1,
      last_updated: '2026-07-12',
    };
    const rows = observedRowsFromLedger(
      1,
      [
        { ...base, quantity: 0 },
        { ...base, quantity: 1.5 },
        { ...base, quantity: 3, last_updated: 'yesterday' },
        { ...base, quantity: 3 },
      ],
      '2026-07-12T10:00:00.000Z'
    );
    expect(rows.map((r) => r.quantity)).toEqual([3]);
  });
});

describe('detectGaps', () => {
  const base = { startDate: '2026-01-01', retentionDays: 30 };

  it('reports no gap on the first sync: nothing was ever missed', () => {
    expect(
      detectGaps({
        ...base,
        lastSyncAt: null,
        now: at('2026-07-20T00:00:00Z'),
        structureIds: [1],
        oldestEsiDate: {},
      })
    ).toEqual([]);
  });

  it('reports no gap while the last sync is still inside ESI retention', () => {
    const gaps = detectGaps({
      ...base,
      lastSyncAt: at('2026-07-10T12:00:00Z'),
      now: at('2026-07-20T00:00:00Z'),
      structureIds: [1],
      oldestEsiDate: {},
    });
    expect(gaps).toEqual([]);
  });

  it('reports the days between the last sync and what ESI still holds, per refinery', () => {
    const gaps = detectGaps({
      ...base,
      lastSyncAt: at('2026-06-01T12:00:00Z'),
      now: at('2026-07-20T00:00:00Z'),
      structureIds: [1, 2],
      oldestEsiDate: {},
    });
    // ESI holds 21 Jun - 20 Jul (30 days); the sync day is partial, so it is lost too.
    expect(gaps).toEqual([
      { structureId: 1, from: '2026-06-01', to: '2026-06-20' },
      { structureId: 2, from: '2026-06-01', to: '2026-06-20' },
    ]);
  });

  it('shrinks the gap when ESI turns out to hold older rows than assumed', () => {
    const gaps = detectGaps({
      ...base,
      lastSyncAt: at('2026-06-01T12:00:00Z'),
      now: at('2026-07-20T00:00:00Z'),
      structureIds: [1],
      oldestEsiDate: { 1: '2026-06-10' },
    });
    expect(gaps).toEqual([{ structureId: 1, from: '2026-06-01', to: '2026-06-09' }]);
  });

  it('never reaches back before the book started', () => {
    const gaps = detectGaps({
      startDate: '2026-06-10',
      retentionDays: 30,
      lastSyncAt: at('2026-06-01T12:00:00Z'),
      now: at('2026-07-20T00:00:00Z'),
      structureIds: [1],
      oldestEsiDate: {},
    });
    expect(gaps).toEqual([{ structureId: 1, from: '2026-06-10', to: '2026-06-20' }]);
  });
});

describe('mergeGaps', () => {
  it('keeps earlier gaps, since lost history stays lost, and joins overlapping ones', () => {
    expect(
      mergeGaps(
        [
          { structureId: 1, from: '2026-05-01', to: '2026-05-05' },
          { structureId: 1, from: '2026-06-01', to: '2026-06-10' },
        ],
        [
          { structureId: 1, from: '2026-06-01', to: '2026-06-20' },
          { structureId: 2, from: '2026-06-01', to: '2026-06-02' },
        ]
      )
    ).toEqual([
      { structureId: 1, from: '2026-05-01', to: '2026-05-05' },
      { structureId: 1, from: '2026-06-01', to: '2026-06-20' },
      { structureId: 2, from: '2026-06-01', to: '2026-06-02' },
    ]);
  });

  it('joins gaps that touch, and keeps only the newest twenty', () => {
    expect(
      mergeGaps(
        [{ structureId: 1, from: '2026-06-01', to: '2026-06-05' }],
        [{ structureId: 1, from: '2026-06-06', to: '2026-06-07' }]
      )
    ).toEqual([{ structureId: 1, from: '2026-06-01', to: '2026-06-07' }]);
    const many = Array.from({ length: 25 }, (_, i) => ({
      structureId: 1,
      from: `2026-01-${String(i + 1).padStart(2, '0')}`,
      to: `2026-01-${String(i + 1).padStart(2, '0')}`,
    })).map((g, i) => (i % 2 ? g : { ...g, structureId: i + 10 }));
    expect(mergeGaps([], many).length).toBeLessThanOrEqual(20);
  });
});

describe('syncStatus', () => {
  const last = { at: at('2026-07-17T00:00:00Z'), byCharacterId: 5, byName: 'Ann', gaps: [] };
  it('is never before the first sync', () => {
    expect(syncStatus(null, 0)).toEqual({ kind: 'never' });
  });
  it('is fresh up to three days and stale after', () => {
    expect(syncStatus(last, last.at + 3 * DAY).kind).toBe('fresh');
    const stale = syncStatus(last, last.at + 3 * DAY + 1);
    expect(stale).toMatchObject({ kind: 'stale', byName: 'Ann', byCharacterId: 5 });
  });
  it('carries how long ago it was and any gaps', () => {
    const gaps = [{ structureId: 1, from: '2026-06-01', to: '2026-06-02' }];
    expect(syncStatus({ ...last, gaps }, last.at + 2 * DAY)).toMatchObject({
      ageMs: 2 * DAY,
      gaps,
    });
  });
});

describe('donationsFromJournal', () => {
  const entry = (over = {}) => ({
    id: 1,
    date: '2026-07-12T10:00:00Z',
    ref_type: 'player_donation',
    description: '',
    amount: 5_000_000,
    first_party_id: 90000001,
    second_party_id: 98000001,
    reason: 'MT-1',
    ...over,
  });

  it('keeps ISK sent in by a player and carries the reason', () => {
    expect(donationsFromJournal([entry()], 2, 98000001)).toEqual([
      {
        refId: 1,
        division: 2,
        characterId: 90000001,
        amount: 5_000_000,
        at: '2026-07-12T10:00:00.000Z',
        reason: 'MT-1',
      },
    ]);
  });

  it('skips other ref types, outgoing money and the corporation’s own transfers', () => {
    const rows = donationsFromJournal(
      [
        entry({ ref_type: 'bounty_prizes' }),
        entry({ amount: -5 }),
        entry({ first_party_id: 98000001 }),
        entry({ amount: undefined }),
        entry({ first_party_id: undefined }),
      ],
      1,
      98000001
    );
    expect(rows).toEqual([]);
  });
});

const statement = (over: Partial<Statement> & { id: string; minerId: string }): Statement =>
  ({
    code: `MT-${over.id}`,
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    coversFrom: '2026-07-01',
    coversThrough: '2026-07-31',
    issuedAt: '2026-08-01T00:00:00Z',
    hubId: 'jita',
    oreForm: 'compressed',
    lines: [],
    amount: 10_000_000,
    ...over,
  }) as Statement;

describe('resolveDonations', () => {
  const book = {
    miners: [],
    statements: [statement({ id: 's1', minerId: 'solo:7', code: 'MT-AB12' })],
    knownCharacterIds: new Set([7]),
  };
  const donation = (characterId: number, reason?: string) => ({
    refId: 1,
    division: 1,
    characterId,
    amount: 10,
    at: '2026-08-02T00:00:00.000Z',
    reason,
  });

  it('pins a donation carrying a Statement code to that Statement, from any character', () => {
    expect(resolveDonations([donation(99, 'pay MT-AB12 thanks')], book)[0]).toMatchObject({
      minerId: 'solo:7',
      statementId: 's1',
    });
  });

  it('credits a known miner and leaves a stranger unmatched', () => {
    const [known, stranger] = resolveDonations([donation(7), donation(99)], book);
    expect(known).toMatchObject({ minerId: 'solo:7' });
    expect(known.statementId).toBeUndefined();
    expect(stranger.minerId).toBeUndefined();
  });
});

describe('planSettlements', () => {
  const s1 = statement({ id: 's1', minerId: 'solo:7', amount: 10_000_000 });
  const pay = (over = {}) => ({
    id: 'p1',
    minerId: 'solo:7',
    characterId: 7,
    amount: 10_000_000,
    at: '2026-08-02T00:00:00Z',
    source: 'donation' as const,
    ...over,
  });
  const input = { miners: [], dismissals: [] as Dismissal[], alreadyPaid: new Set<string>() };

  it('settles a Statement a donation covered', () => {
    expect(planSettlements({ ...input, statements: [s1], payments: [pay()] })).toEqual(['s1']);
  });

  it('settles within the tolerance and leaves a short payment open', () => {
    expect(
      planSettlements({ ...input, statements: [s1], payments: [pay({ amount: 9_950_000 })] })
    ).toEqual(['s1']);
    expect(
      planSettlements({ ...input, statements: [s1], payments: [pay({ amount: 5_000_000 })] })
    ).toEqual([]);
  });

  it('does not count what an officer marked not tax', () => {
    expect(
      planSettlements({ ...input, statements: [s1], payments: [pay({ notTaxAmount: 10_000_000 })] })
    ).toEqual([]);
  });

  it('skips Statements already settled, and payments assigned to no Miner', () => {
    expect(
      planSettlements({
        ...input,
        alreadyPaid: new Set(['s1']),
        statements: [s1],
        payments: [pay()],
      })
    ).toEqual([]);
    expect(
      planSettlements({ ...input, statements: [s1], payments: [pay({ minerId: undefined })] })
    ).toEqual([]);
  });

  it('applies a donation to the oldest of a Miner’s Statements first', () => {
    const old = statement({ id: 's0', minerId: 'solo:7', issuedAt: '2026-07-01T00:00:00Z' });
    expect(planSettlements({ ...input, statements: [s1, old], payments: [pay()] })).toEqual(['s0']);
  });

  it('settles a Statement whose every day an active dismissal waived', () => {
    const lined = statement({
      id: 's2',
      minerId: 'solo:7',
      amount: 4_000_000,
      lines: [
        {
          kind: 'mined',
          date: '2026-07-05',
          chargeKey: '7:1001:2026-07-05',
          structureId: 1001,
          oreLines: [],
          estimatedValue: 0,
          tax: 4_000_000,
        },
      ],
    });
    const dismissal: Dismissal = {
      id: 'd1',
      scope: 'record',
      targetId: '7:1001:2026-07-05',
      by: 1,
      at: '2026-08-03T00:00:00Z',
      reason: 'x',
    };
    expect(
      planSettlements({ ...input, statements: [lined], payments: [], dismissals: [dismissal] })
    ).toEqual(['s2']);
    expect(
      planSettlements({
        ...input,
        statements: [lined],
        payments: [],
        dismissals: [{ ...dismissal, reversed: { by: 1, at: '2026-08-04T00:00:00Z' } }],
      })
    ).toEqual([]);
  });
});

describe('reconcileExtractions', () => {
  const esi = {
    structure_id: 1001,
    moon_id: 40,
    extraction_start_time: '2026-07-01T12:00:00Z',
    chunk_arrival_time: '2026-07-10T12:00:00Z',
    natural_decay_time: '2026-07-10T15:00:00Z',
  };
  const note = (type: string, timestamp: string, payload: object) => ({
    type,
    timestamp,
    payload: { structureId: 1001, moonId: 40, ...payload },
  });

  it('uploads what ESI lists', () => {
    expect(reconcileExtractions([esi], [], [])).toEqual<SyncExtraction[]>([
      {
        structureId: 1001,
        moonId: 40,
        extractionStartTime: '2026-07-01T12:00:00.000Z',
        chunkArrivalTime: '2026-07-10T12:00:00.000Z',
        naturalDecayTime: '2026-07-10T15:00:00.000Z',
      },
    ]);
  });

  it('adds the chunk’s ore from the started notification, as units of 10 m³', () => {
    const started = note('MoonminingExtractionStarted', '2026-07-01T12:00:05Z', {
      readyTimeMs: at('2026-07-10T12:00:00Z'),
      autoTimeMs: at('2026-07-10T15:00:00Z'),
      oreVolumes: [{ typeId: 45490, volumeM3: 1_000_005 }],
    });
    expect(reconcileExtractions([esi], [started], [])[0].oreLines).toEqual([
      { typeId: 45490, quantity: 100_000 },
    ]);
  });

  it('adds when the laser was fired or the extraction cancelled, to the extraction they fall in', () => {
    const fired = note('MoonminingLaserFired', '2026-07-10T13:00:00Z', {});
    const cancelled = note('MoonminingExtractionCancelled', '2026-07-05T00:00:00Z', {});
    expect(reconcileExtractions([esi], [fired], [])[0].laserFiredAt).toBe(
      '2026-07-10T13:00:00.000Z'
    );
    expect(reconcileExtractions([esi], [cancelled], [])[0].cancelledAt).toBe(
      '2026-07-05T00:00:00.000Z'
    );
  });

  it('ignores notifications for another refinery or moon', () => {
    const fired = {
      ...note('MoonminingLaserFired', '2026-07-10T13:00:00Z', {}),
      payload: { structureId: 2, moonId: 40 },
    };
    expect(reconcileExtractions([esi], [fired], [])[0].laserFiredAt).toBeUndefined();
  });

  it('keeps an extraction ESI no longer lists, from its started notification, under the stored start time', () => {
    const started = note('MoonminingExtractionStarted', '2026-07-01T12:00:09Z', {
      readyTimeMs: at('2026-07-10T12:00:00Z'),
      autoTimeMs: at('2026-07-10T15:00:00Z'),
    });
    const stored = [
      {
        structureId: 1001,
        moonId: 40,
        extractionStartTime: '2026-07-01T12:00:00.000Z',
        chunkArrivalTime: '2026-07-10T12:00:00.000Z',
      },
    ];
    const [x] = reconcileExtractions([], [started], stored);
    expect(x.extractionStartTime).toBe('2026-07-01T12:00:00.000Z');
    expect(reconcileExtractions([], [started], [])[0].extractionStartTime).toBe(
      '2026-07-01T12:00:09.000Z'
    );
  });

  it('reuses the stored start time when ESI’s own differs from the stored one by seconds', () => {
    const stored = [
      {
        structureId: 1001,
        moonId: 40,
        extractionStartTime: '2026-07-01T12:00:03.000Z',
        chunkArrivalTime: '2026-07-10T12:00:00.000Z',
      },
    ];
    expect(reconcileExtractions([esi], [], stored)[0].extractionStartTime).toBe(
      '2026-07-01T12:00:03.000Z'
    );
  });
});
