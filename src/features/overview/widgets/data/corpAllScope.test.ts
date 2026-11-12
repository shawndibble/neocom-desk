/**
 * The five Gallery corp widgets read across several corporations (All scope, #6101): the
 * merged feed's rows keep each widget's own sort, each names its corporation, totals sum,
 * and one corporation's failed read leaves the others drawn, flagged.
 */
import { describe, expect, it } from 'vitest';
import type { Contract, CorporationCustomsOffice, CorporationOrder } from '@/esi/endpoints';
import { corpContracts } from './corpContractsModels';
import { corpCustomsOffices } from './corpCustomsModels';
import { corpOrders } from './corpOrdersModels';
import { corpSovereignty } from './corpSovereigntyModels';
import { corpStarbases } from './corpStarbaseModels';
import type {
  CorpContractsFeed,
  CorpCustomsFeed,
  CorpFeedBase,
  CorpOrdersFeed,
  CorpSovereigntyFeed,
  CorpSovereigntyRow,
  CorpStarbaseRow,
  CorpStarbasesFeed,
} from './corpFeeds';
import type { BuildContext, FeedState, KindView, TableCell } from './types';

const t = (key: string, options?: Record<string, unknown>) =>
  options && Object.keys(options).length ? `${key}${JSON.stringify(options)}` : key;
const HOUR = 3_600_000;
const NOW = Date.parse('2026-10-20T12:00:00Z');
const ctx = {
  t,
  now: NOW,
  range: 30,
  activeCharacterId: 1,
  scopeAll: true,
} as unknown as BuildContext;
const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });

const A = 98000001;
const B = 98000002;
const LABELS = new Map([
  [A, { ticker: 'HOLD1', name: 'Holding One' }],
  [B, { ticker: 'HOLD2', name: 'Holding Two' }],
]);

/** A merged read's base fields: `corporationOf` maps each row key to its corporation. */
const across = (corporationOf: [string, number][], over: Partial<CorpFeedBase> = {}) => ({
  readable: true,
  needsReauth: false,
  fetchedAt: new Date(NOW),
  fromCache: false,
  corporations: LABELS,
  corporationOf: new Map(corporationOf),
  ...over,
});

const text = (cell: TableCell | undefined) => (typeof cell === 'string' ? cell : cell?.text);
const column = (view: KindView, key: string) => {
  const index = view.table!.columns.findIndex((col) => col.key === key);
  return view.table!.rows.map((row) => text(row.cells[index]));
};

// --- Customs offices ---------------------------------------------------------------

const office = (id: number, system: number): CorporationCustomsOffice =>
  ({
    office_id: id,
    system_id: system,
    type_id: 2233,
    reinforce_exit_start: 18,
    reinforce_exit_end: 20,
  }) as CorporationCustomsOffice;

const customs = (over: Partial<CorpFeedBase> = {}): CorpCustomsFeed => ({
  ...across(
    [
      ['1', A],
      ['2', B],
      ['3', A],
    ],
    over
  ),
  offices: [office(1, 30), office(3, 10), office(2, 20)],
  typeNames: new Map([[2233, 'Customs Office']]),
  systemNames: new Map([
    [10, 'Amarr'],
    [20, 'Efa'],
    [30, 'Tama'],
  ]),
});

describe('Customs offices across corporations', () => {
  it('keeps the system order across corporations and names each row’s corporation', () => {
    const view = corpCustomsOffices({ corpCustomsAll: ok(customs()) }, ctx);
    expect(view.table!.columns.map((col) => col.key)).toEqual([
      'office',
      'corp',
      'system',
      'rates',
      'window',
    ]);
    expect(column(view, 'system')).toEqual(['Amarr', 'Efa', 'Tama']);
    expect(column(view, 'corp')).toEqual(['HOLD1', 'HOLD2', 'HOLD1']);
    expect(view.table!.rows[0]!.detail!.facts[0]).toEqual({
      label: 'overview.board.corporation',
      value: 'Holding One',
    });
    expect(view.rows.map((row) => row.detail)).toEqual([
      'Amarr · HOLD1',
      'Efa · HOLD2',
      'Tama · HOLD1',
    ]);
  });

  it('reads the header Character’s feed off All', () => {
    const view = corpCustomsOffices(
      { corpCustoms: ok({ ...customs(), corporations: undefined, corporationOf: undefined }) },
      { ...ctx, scopeAll: false }
    );
    expect(view.table!.columns.map((col) => col.key)).not.toContain('corp');
  });

  it('draws no Corporation column when one corporation was read', () => {
    const one = { ...customs(), corporations: new Map([[A, LABELS.get(A)!]]) };
    const view = corpCustomsOffices({ corpCustomsAll: ok(one) }, ctx);
    expect(view.table!.columns.map((col) => col.key)).not.toContain('corp');
  });

  it('keeps the others’ rows when one corporation’s read failed, flagged', () => {
    const view = corpCustomsOffices({ corpCustomsAll: ok(customs({ partlyFailed: true })) }, ctx);
    expect(view.table!.rows).toHaveLength(3);
    // A note, not the Failed state: that would hide the rows that did land.
    expect(view.status.error).toBe(false);
    expect(view.table!.footer).toBe('overview.board.corporationsMissing');
    expect(view.number.notes).toContain('overview.board.corporationsMissing');
  });
});

// --- Starbases -----------------------------------------------------------------------

const tower = (id: number, fuelBlocks: number): CorpStarbaseRow => ({
  starbaseId: id,
  systemId: 30,
  typeId: 12235, // Amarr Control Tower: 40 blocks an hour
  state: 'online',
  reinforcedUntilMs: null,
  unanchorsAtMs: null,
  bay: { fuelBlocks, strontium: 0 },
  bayReadAtMs: NOW,
});

describe('Starbases across corporations', () => {
  it('lists the soonest dry tower first whichever corporation holds it', () => {
    const feed: CorpStarbasesFeed = {
      ...across([
        ['1', A],
        ['2', B],
      ]),
      starbases: [tower(1, 4000), tower(2, 400)],
      typeNames: new Map([[12235, 'Amarr Control Tower']]),
      systemNames: new Map([[30, 'Tama']]),
    };
    const view = corpStarbases({ corpStarbasesAll: ok(feed) }, ctx);
    expect(view.table!.rows.map((row) => row.key)).toEqual(['2', '1']);
    expect(column(view, 'corp')).toEqual(['HOLD2', 'HOLD1']);
  });
});

// --- Sovereignty ---------------------------------------------------------------------

const skyhook = (id: number, opensInHours: number): CorpSovereigntyRow => ({
  key: `skyhook:${id}`,
  kind: 'skyhook',
  structureId: id,
  systemId: 30,
  planetName: `Tama ${id}`,
  windowStartMs: NOW + opensInHours * HOUR,
  windowEndMs: NOW + (opensInHours + 2) * HOUR,
  reagents: null,
  state: null,
  hubBay: null,
});

describe('Sovereignty across corporations', () => {
  it('puts every corporation’s skyhooks and hubs on one timeline, each naming its corporation', () => {
    const hub: CorpSovereigntyRow = {
      ...skyhook(9, 0),
      key: 'hub:9',
      kind: 'hub',
      planetName: null,
      windowStartMs: null,
      windowEndMs: null,
      hubBay: { amount: 100, burningPerHour: 10, updatedMs: NOW },
    };
    const feed: CorpSovereigntyFeed = {
      ...across([
        ['skyhook:1', A],
        ['skyhook:2', B],
        ['hub:9', B],
      ]),
      rows: [skyhook(1, 9), skyhook(2, 3), hub],
      systemNames: new Map([[30, 'Tama']]),
      typeNames: new Map(),
      prices: new Map(),
      jumps: new Map(),
    };
    const view = corpSovereignty({ corpSovereigntyAll: ok(feed) }, ctx);
    expect(view.table!.rows.map((row) => row.key)).toEqual(['skyhook:2', 'skyhook:1']);
    expect(column(view, 'corp')).toEqual(['HOLD2', 'HOLD1']);
    // The next window (corporation B's skyhook) and B's hub running dry in 10 h, together.
    expect(view.deadlines.map((deadline) => deadline.at)).toEqual([
      NOW + 3 * HOUR,
      NOW + 10 * HOUR,
    ]);
  });
});

// --- Contracts -----------------------------------------------------------------------

const contract = (id: number, expiresInHours: number, collateral?: number): Contract => ({
  contract_id: id,
  issuer_id: 1,
  issuer_corporation_id: A,
  assignee_id: 0,
  acceptor_id: 0,
  type: collateral === undefined ? 'item_exchange' : 'courier',
  collateral,
  status: 'outstanding',
  for_corporation: true,
  availability: 'public',
  date_issued: new Date(NOW - 24 * HOUR).toISOString(),
  date_expired: new Date(NOW + expiresInHours * HOUR).toISOString(),
});

describe('Corp contracts across corporations', () => {
  it('counts every corporation’s outstanding contracts and names each row’s', () => {
    const feed: CorpContractsFeed = {
      ...across([
        ['1', A],
        ['2', A],
        ['3', B],
      ]),
      contracts: [contract(1, 72, 200_000_000), contract(2, 96), contract(3, 48, 100_000_000)],
      names: new Map([[1, 'Issuer']]),
    };
    const view = corpContracts({ corpContractsAll: ok(feed) }, ctx);
    expect(view.number.value).toBe('3');
    // Collateral at stake: both corporations' couriers.
    expect(view.number.notes?.[0]).toContain('300');
    expect(view.table!.rows.map((row) => row.key)).toEqual(['3', '1', '2']);
    expect(column(view, 'corp')).toEqual(['HOLD2', 'HOLD1', 'HOLD1']);
  });
});

// --- Market orders -------------------------------------------------------------------

const STATION = 60003760;
const order = (id: number, escrow: number): CorporationOrder => ({
  order_id: id,
  type_id: 34,
  region_id: 10000002,
  location_id: STATION,
  is_buy_order: true,
  issued_by: 7,
  price: 5,
  volume_remain: 10,
  volume_total: 20,
  issued: new Date(NOW - 86_400_000).toISOString(),
  duration: 90,
  range: 'station',
  escrow,
});

describe('Corp market orders across corporations', () => {
  it('sums the orders and the escrow across corporations and names each row’s', () => {
    const feed: CorpOrdersFeed = {
      ...across([
        ['1', A],
        ['2', B],
      ]),
      orders: [order(1, 1_000_000), order(2, 2_000_000)],
      typeNames: new Map([[34, 'Tritanium']]),
      stationNames: new Map([[STATION, 'Jita IV - Moon 4']]),
      stationPrices: new Map(),
      issuerNames: new Map([[7, 'Issuer']]),
    };
    const view = corpOrders({ corpOrdersAll: ok(feed) }, ctx);
    expect(view.number.value).toBe('2');
    expect(view.number.secondary?.text).toContain('3');
    expect(column(view, 'corp').sort()).toEqual(['HOLD1', 'HOLD2']);
  });
});
