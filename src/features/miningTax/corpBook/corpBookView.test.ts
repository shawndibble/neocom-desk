import { describe, expect, it } from 'vitest';
import type { DatedUnitPrices } from '@/features/miningTax/pricing';
import { buildCorpBookView } from './corpBookView';
import type { LoadedCorpBook } from './corpBookStore';

const ME = 90000001;
const ZEO = 45490;
const CORP = 98000001;

const prices: DatedUnitPrices = {
  byHubAndDate: new Map([['jita', new Map([['2026-10-17', new Map([[ZEO, 148]])]])]]),
  unpricedByHub: new Map(),
  sellFallbackByHubAndDate: new Map(),
  unpriced: new Set(),
  sourcesByHubAndDate: new Map([
    ['jita', new Map([['2026-10-17', new Map([[ZEO, 'saved' as const]])]])],
  ]),
};

const loaded = (over: Partial<LoadedCorpBook> = {}): LoadedCorpBook => ({
  corporationId: CORP,
  startDate: '2026-10-01',
  graceHours: 6,
  hubId: 'jita',
  oreForm: 'compressed',
  divisions: [1],
  rates: [{ scope: 'corp', pct: 15, effectiveFrom: '2026-10-01' }],
  lastSyncedAt: '2026-10-18T12:00:00.000Z',
  observed: [
    {
      characterId: ME,
      recordedCorporationId: CORP,
      structureId: 1000,
      date: '2026-10-17',
      solarSystemId: 30003838,
      oreLines: [{ typeId: ZEO, quantity: 1000 }],
    },
  ],
  payments: [],
  held: [],
  claimable: [],
  dismissals: [],
  statements: [],
  miners: [],
  characterIds: [ME],
  memberCharacterIds: [ME],
  ...over,
});

const input = (over = {}) => ({
  rows: [
    {
      characterId: ME,
      characterName: 'Kestrel Vane',
      entry: {
        characterId: ME,
        date: '2026-10-17',
        solarSystemId: 30003838,
        oreLines: [{ typeId: ZEO, quantity: 1000 }],
      },
      assignments: [],
      unassignedOreLines: [{ typeId: ZEO, quantity: 1000 }],
    },
  ],
  loaded: [loaded()],
  pricesByCorp: new Map([[CORP, prices]]),
  corpNames: new Map([[CORP, 'Brass Meridian Logistics']]),
  made: [],
  characterNames: new Map([[ME, 'Kestrel Vane']]),
  now: '2026-10-18T14:00:00Z',
  ...over,
});

const payeeName = (corp: string) => `${corp} (Corp Tax Book)`;

describe('buildCorpBookView', () => {
  it('is null until a book has its prices (the tab stays as it was)', () => {
    expect(buildCorpBookView(input({ pricesByCorp: new Map() }), payeeName)).toBeNull();
    expect(buildCorpBookView(input({ loaded: [] }), payeeName)).toBeNull();
  });

  it('bills the closed day at the book price and rate, owed to the virtual Payee', () => {
    const view = buildCorpBookView(input(), payeeName)!;
    expect(view.overlay.rows).toHaveLength(1);
    expect(view.overlay.rows[0]).toMatchObject({ state: 'billed', taxPct: 15 });
    expect(view.overlay.rows[0].taxOwed).toBeCloseTo(1000 * 148 * 0.15, 4);
    expect(view.payees).toHaveLength(1);
    expect(view.payees[0]).toMatchObject({
      name: 'Brass Meridian Logistics (Corp Tax Book)',
      hubId: 'jita',
    });
    expect(view.books[0]).toMatchObject({ corpName: 'Brass Meridian Logistics', left: false });
  });

  it('marks a book none of the tracked Characters is in any more as left', () => {
    const view = buildCorpBookView(
      input({ loaded: [loaded({ memberCharacterIds: [] })] }),
      payeeName
    )!;
    expect(view.books[0].left).toBe(true);
  });

  it('counts a donation in the wallet the book does not hold yet as paid', () => {
    const view = buildCorpBookView(
      input({
        made: [
          {
            key: 'journal:1',
            kind: 'journal',
            refId: 1,
            characterId: ME,
            date: '2026-10-18T13:10:00Z',
            amount: 148_000 * 0.15,
            method: 'donation',
            counterpartyId: CORP,
            label: '',
          },
        ],
      }),
      payeeName
    )!;
    expect(view.overlay.rows[0].state).toBe('paid');
    expect(view.books[0].inFlightAt).toBe('2026-10-18T13:10:00Z');
  });

  it("lists the member's own Unmatched donations to claim", () => {
    const view = buildCorpBookView(
      input({
        loaded: [
          loaded({
            claimable: [{ id: 'j1_9', characterId: ME, amount: 5, at: '2026-10-18T00:00:00Z' }],
          }),
        ],
      }),
      payeeName
    )!;
    expect(view.claims).toEqual([
      {
        corporationId: CORP,
        corpName: 'Brass Meridian Logistics',
        characterName: 'Kestrel Vane',
        payment: { id: 'j1_9', characterId: ME, amount: 5, at: '2026-10-18T00:00:00Z' },
      },
    ]);
  });
});

describe('buildCorpBookView: what the miner reads beyond their lines (#4622)', () => {
  const OWNER = 98000077;
  const owned = loaded().observed.map((o) => ({ ...o, sourceCorporationId: OWNER }));

  it("holds back a day the moon owner's ledger was not read well after", () => {
    const view = buildCorpBookView(
      input({
        loaded: [
          loaded({
            observed: owned,
            feeders: [
              {
                corporationId: OWNER,
                coveragePeriods: [{ from: '2026-10-01' }],
                lastReadWellAt: '2026-10-17T20:00:00.000Z',
              },
            ],
          }),
        ],
      }),
      payeeName
    );
    expect(view?.overlay.rows).toEqual([]);
  });

  it("bills nothing outside the moon owner's coverage", () => {
    const view = buildCorpBookView(
      input({
        loaded: [
          loaded({
            observed: owned,
            feeders: [{ corporationId: OWNER, coveragePeriods: [{ from: '2026-10-18' }] }],
          }),
        ],
      }),
      payeeName
    );
    expect(view?.overlay.rows).toEqual([]);
  });

  it('labels the line with the refinery name', () => {
    const view = buildCorpBookView(
      input({ loaded: [loaded({ structureNames: { 1000: 'Ikao - Moon Drill' } })] }),
      payeeName
    );
    expect(view?.overlay.rows[0].refineryLabel).toBe('Ikao - Moon Drill');
  });

  it("shows the corporation's correction of the day", () => {
    const view = buildCorpBookView(
      input({
        loaded: [
          loaded({
            adjustments: [
              {
                id: 'a1',
                minerId: `solo:${ME}`,
                date: '2026-10-17',
                amount: 100,
                reason: 'Missed ore',
                by: 1,
                at: '2026-10-18T13:00:00Z',
              },
            ],
          }),
        ],
      }),
      payeeName
    );
    expect(view?.overlay.rows[0].correction?.reasons).toEqual(['Missed ore']);
  });
});
