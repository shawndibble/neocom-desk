import { DAY_MS } from '@/lib/age';
import { describe, expect, it } from 'vitest';
import {
  detectGaps,
  donationsFromJournal,
  mergeGaps,
  observedRowsFromLedger,
  placeObservedRows,
  billableStoredRows,
  storedRowsWanted,
  reconcileExtractions,
  restampPlan,
  stampExtractionIds,
  syncStatus,
  moonOnDay,
  toEngineExtraction,
  type SyncExtraction,
} from './sync';
import { resolveRate, type TaxRate } from './rates';

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
    expect(syncStatus(last, last.at + 3 * DAY_MS).kind).toBe('fresh');
    const stale = syncStatus(last, last.at + 3 * DAY_MS + 1);
    expect(stale).toMatchObject({ kind: 'stale', byName: 'Ann', byCharacterId: 5 });
  });
  it('carries how long ago it was and any gaps', () => {
    const gaps = [{ structureId: 1, from: '2026-06-01', to: '2026-06-02' }];
    expect(syncStatus({ ...last, gaps }, last.at + 2 * DAY_MS)).toMatchObject({
      ageMs: 2 * DAY_MS,
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

describe('stored rows a held or new donation is matched against (moon owner mining)', () => {
  // Shaped like a real book: started 2026-11-12 billing from 2026-11-01, its Miner's ore all
  // mined at two moon owners' refineries (rows the moon owner reads store, tagged with the owner).
  const BOOK = 98837836;
  const ME = 91262608;
  const feeders = [
    { corporationId: 98847985, coveragePeriods: [{ from: '2026-11-01' }] },
    { corporationId: 98847903, coveragePeriods: [{ from: '2026-11-01' }] },
  ];
  const fed = (date: string, quantity: number, source = 98847985) => ({
    structureId: 1054576755229,
    characterId: ME,
    recordedCorporationId: BOOK,
    typeId: 46281,
    date,
    quantity,
    sourceCorporationId: source,
  });
  const stored = [
    fed('2026-11-01', 72137),
    fed('2026-11-02', 16037),
    fed('2026-11-06', 93419, 98847903),
    fed('2026-11-07', 10116, 98847903),
    fed('2026-11-11', 53869),
  ];
  const book = { miners: [], startDate: '2026-11-01' };
  const held = (id: string, at: string) => ({ id, characterId: ME, at });

  it('wants the rows of a held donation’s Miner from the book’s start, only if paid since', () => {
    const wanted = storedRowsWanted({
      ...book,
      held: [
        held('j5_26177051185', '2026-10-21T17:38:23.000Z'),
        held('j5_26226487580', '2026-11-02T22:38:44.000Z'),
      ],
      senders: [],
    });
    expect(wanted).toEqual(new Map([[ME, '2026-11-01']]));
    // Paid before the book's start: no mining it bills could have been owed then.
    expect(
      storedRowsWanted({
        ...book,
        held: [held('j5_26177051185', '2026-10-21T17:38:23.000Z')],
        senders: [],
      }).size
    ).toBe(0);
  });

  it('keeps a moon owner’s rows only inside its coverage, and the wanted days only', () => {
    const outside = { ...fed('2026-11-03', 500), sourceCorporationId: 98847921 };
    const own = { ...fed('2026-11-04', 500), sourceCorporationId: undefined };
    const rows = billableStoredRows(
      [...stored, outside, own, { ...fed('2026-11-02', 5), characterId: 9 }],
      new Map([[ME, '2026-11-02']]),
      BOOK,
      [...feeders, { corporationId: 98847921, coveragePeriods: [{ from: '2026-11-05' }] }]
    );
    expect(rows.map((r) => r.date)).toEqual([
      '2026-11-02',
      '2026-11-06',
      '2026-11-07',
      '2026-11-11',
      '2026-11-04',
    ]);
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

  describe('the chunk’s ore from the notifications sent once it arrives', () => {
    const ore = (volumeM3: number) => ({ oreVolumes: [{ typeId: 45492, volumeM3 }] });
    const finished = note('MoonminingExtractionFinished', '2026-07-10T12:00:01Z', {
      autoTimeMs: at('2026-07-10T15:00:00Z'),
      ...ore(2_000_000),
    });

    it('takes it from Extraction finished, Laser fired or Automatic fracture', () => {
      const fired = note('MoonminingLaserFired', '2026-07-10T13:00:00Z', ore(3_000_000));
      const auto = note('MoonminingAutomaticFracture', '2026-07-10T15:00:00Z', ore(4_000_000));
      expect(reconcileExtractions([esi], [finished], [])[0].oreLines).toEqual([
        { typeId: 45492, quantity: 200_000 },
      ]);
      expect(reconcileExtractions([esi], [fired], [])[0].oreLines).toEqual([
        { typeId: 45492, quantity: 300_000 },
      ]);
      expect(reconcileExtractions([esi], [auto], [])[0].oreLines).toEqual([
        { typeId: 45492, quantity: 400_000 },
      ]);
    });

    it('lets the started notification win, whichever comes first', () => {
      const started = note('MoonminingExtractionStarted', '2026-07-01T12:00:05Z', {
        readyTimeMs: at('2026-07-10T12:00:00Z'),
        autoTimeMs: at('2026-07-10T15:00:00Z'),
        ...ore(1_000_000),
      });
      for (const notes of [
        [started, finished],
        [finished, started],
      ])
        expect(reconcileExtractions([esi], notes, [])[0].oreLines).toEqual([
          { typeId: 45492, quantity: 100_000 },
        ]);
    });

    it('ignores one for another chunk of the same moon', () => {
      const later = note('MoonminingExtractionFinished', '2026-08-10T12:00:00Z', {
        autoTimeMs: at('2026-08-10T15:00:00Z'),
        ...ore(2_000_000),
      });
      expect(reconcileExtractions([esi], [later], [])[0].oreLines).toBeUndefined();
    });

    it('gives it to a stored extraction ESI no longer lists, under its stored start', () => {
      const stored = {
        structureId: 1001,
        moonId: 40,
        extractionStartTime: '2026-07-01T12:00:00.000Z',
        chunkArrivalTime: '2026-07-10T12:00:00.000Z',
        naturalDecayTime: '2026-07-10T15:00:00.000Z',
      };
      expect(reconcileExtractions([], [finished], [stored])).toEqual([
        { ...stored, oreLines: [{ typeId: 45492, quantity: 200_000 }] },
      ]);
      // One that already holds its ore, or that no notification names, is not uploaded again.
      const held = { ...stored, oreLines: [{ typeId: 45492, quantity: 1 }] };
      expect(reconcileExtractions([], [finished], [held])).toEqual([]);
      expect(reconcileExtractions([], [], [stored])).toEqual([]);
    });
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

describe('extractionId stamping', () => {
  const pull: SyncExtraction = {
    structureId: 1001,
    moonId: 40,
    extractionStartTime: '2026-07-01T12:00:00.000Z',
    chunkArrivalTime: '2026-07-10T12:00:00.000Z',
    naturalDecayTime: '2026-07-10T15:00:00.000Z',
  };
  const id = `1001_${Date.parse('2026-07-01T12:00:00.000Z')}`;
  const row = (date: string, over: Record<string, unknown> = {}) => ({
    structureId: 1001,
    characterId: 7,
    recordedCorporationId: 9,
    typeId: 45490,
    date,
    quantity: 5,
    cachedAt: '2026-07-12T10:00:00.000Z',
    ...over,
  });

  it('stamps each day from the fracture through the expiry day, and no other', () => {
    const days = ['2026-07-09', '2026-07-10', '2026-07-12', '2026-07-13'];
    const stamped = stampExtractionIds(
      days.map((d) => row(d)),
      [pull]
    );
    expect(stamped.map((r) => r.extractionId)).toEqual([undefined, id, id, undefined]);
    expect(stamped[0]).not.toHaveProperty('extractionId');
  });

  it('uses the structure’s own expiry, where the 48 h default would miss the day', () => {
    const late = row('2026-07-14');
    expect(stampExtractionIds([late], [pull])[0]).not.toHaveProperty('extractionId');
    expect(stampExtractionIds([late], [pull], { '1001': 96 })[0].extractionId).toBe(id);
    // The default the old placement used, and what read-time placement says.
    expect(moonOnDay([toEngineExtraction(pull)], 1001, '2026-07-14').extractionId).toBeUndefined();
    expect(
      moonOnDay([toEngineExtraction(pull)], 1001, '2026-07-14', { '1001': 96 }).extractionId
    ).toBe(id);
  });

  it('leaves a stamped row alone', () => {
    const held = row('2026-07-10', { extractionId: 'old' });
    expect(stampExtractionIds([held], [pull])[0]).toBe(held);
  });

  it('plans a re-stamp only for rows whose stamp the corrected Extraction changes', () => {
    const rows = [row('2026-07-10', { extractionId: id }), row('2026-07-12', { extractionId: id })];
    expect(restampPlan(rows, [pull])).toEqual([]);
    // Laser fired a day later: the first day is no longer covered... the window moves later.
    const corrected = { ...pull, laserFiredAt: '2026-07-11T12:00:00.000Z' };
    expect(restampPlan(rows, [corrected])).toEqual([{ row: rows[0], extractionId: undefined }]);
    // A cancel clears every stamp.
    const cancelled = { ...pull, cancelledAt: '2026-07-10T13:00:00.000Z' };
    expect(restampPlan(rows, [cancelled]).map((x) => x.extractionId)).toEqual([
      undefined,
      undefined,
    ]);
    // An unstamped row a new pull covers is stamped.
    expect(restampPlan([row('2026-07-11')], [pull])).toEqual([
      { row: row('2026-07-11'), extractionId: id },
    ]);
  });
});
