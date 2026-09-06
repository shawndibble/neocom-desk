import { describe, expect, it } from 'vitest';
import {
  buildOpenOrderRows,
  compareOpenOrderRowsWorstFirst,
  groupOpenOrders,
  needsAttentionCount,
  openOrderProblemCounts,
  type BuildRowsInput,
  type OpenOrderRow,
} from './openOrdersModel';
import type { OpenOrdersSnapshot, CharacterOpenOrders } from './openOrdersData';
import type { OrderCostBasis } from './orderCostBasis';
import type { MarketOrder } from '@/esi/endpoints';
import type { CompetingOrder } from '@/engine/market/undercut';
import { ORDER_PROBLEMS } from '@/engine/market/orderProblems';

const NOW = new Date('2026-09-06T00:00:00Z').getTime();

function makeOrder(overrides: Partial<MarketOrder> = {}): MarketOrder {
  return {
    order_id: 1,
    type_id: 100,
    region_id: 10000002,
    location_id: 60003760,
    is_corporation: false,
    price: 1000,
    volume_remain: 5,
    volume_total: 10,
    issued: '2026-09-01T00:00:00Z',
    duration: 90,
    range: 'region',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<CharacterOpenOrders> = {}): CharacterOpenOrders {
  return {
    characterId: 1,
    characterName: 'Ryn Vashti',
    orders: [makeOrder()],
    fetchedAt: NOW,
    fromCache: false,
    needsReauth: false,
    ...overrides,
  };
}

function makeSnapshot(
  entries: CharacterOpenOrders[],
  skipped: OpenOrdersSnapshot['skipped'] = []
): OpenOrdersSnapshot {
  return { entries, skipped };
}

function baseInput(overrides: Partial<BuildRowsInput> = {}): BuildRowsInput {
  return {
    snapshot: makeSnapshot([makeEntry()]),
    typeNames: new Map([[100, 'Tritanium']]),
    stationPrices: new Map(),
    costBases: new Map(),
    skillsByCharacter: new Map([[1, { accountingLevel: 0, brokerRelationsLevel: 0 }]]),
    now: NOW,
    ...overrides,
  };
}

function firstRow(input: BuildRowsInput): OpenOrderRow {
  const rows = buildOpenOrderRows(input);
  expect(rows).toHaveLength(1);
  return rows[0];
}

function deepEntry(
  competitors: readonly CompetingOrder[],
  truncated = false
): { competitors: readonly CompetingOrder[]; truncated: boolean } {
  return { competitors, truncated };
}

describe('buildOpenOrderRows — station tier', () => {
  it('is not beaten when the aggregate best price equals my own sell price (the trap)', () => {
    const row = firstRow(
      baseInput({
        stationPrices: new Map([
          ['60003760:100', { sellMin: 1000, buyMax: null, sellVolume: 5, buyVolume: 0 }],
        ]),
      })
    );
    expect(row.station.beatsMe).toBe(false);
    expect(row.station.bestPrice).toBe(1000);
    expect(row.station.gapIsk).toBe(0);
  });

  it('is beaten when a rival sell is strictly lower', () => {
    const row = firstRow(
      baseInput({
        stationPrices: new Map([
          ['60003760:100', { sellMin: 900, buyMax: null, sellVolume: 5, buyVolume: 0 }],
        ]),
      })
    );
    expect(row.station.beatsMe).toBe(true);
    expect(row.station.gapIsk).toBe(100);
    expect(row.station.gapPct).toBeCloseTo(10);
  });

  it('is beaten on a buy order when a rival buy is strictly higher', () => {
    const row = firstRow(
      baseInput({
        snapshot: makeSnapshot([
          makeEntry({ orders: [makeOrder({ is_buy_order: true, price: 1000 })] }),
        ]),
        stationPrices: new Map([
          ['60003760:100', { sellMin: null, buyMax: 1100, sellVolume: 0, buyVolume: 5 }],
        ]),
      })
    );
    expect(row.station.beatsMe).toBe(true);
    expect(row.station.gapIsk).toBe(100);
  });

  it('is not beaten on a buy order when a rival buy equals mine', () => {
    const row = firstRow(
      baseInput({
        snapshot: makeSnapshot([
          makeEntry({ orders: [makeOrder({ is_buy_order: true, price: 1000 })] }),
        ]),
        stationPrices: new Map([
          ['60003760:100', { sellMin: null, buyMax: 1000, sellVolume: 0, buyVolume: 5 }],
        ]),
      })
    );
    expect(row.station.beatsMe).toBe(false);
  });

  it('treats a missing stationPrices entry as no data, not zero', () => {
    const row = firstRow(baseInput({ stationPrices: new Map() }));
    expect(row.station).toEqual({ bestPrice: null, beatsMe: false, gapIsk: 0, gapPct: 0 });
  });

  it('treats a null sellMin field (present entry, no sell side) same as missing', () => {
    const row = firstRow(
      baseInput({
        stationPrices: new Map([
          ['60003760:100', { sellMin: null, buyMax: 500, sellVolume: 0, buyVolume: 5 }],
        ]),
      })
    );
    expect(row.station.bestPrice).toBeNull();
    expect(row.station.beatsMe).toBe(false);
  });

  it('guards a non-positive own price when computing gapPct', () => {
    const row = firstRow(
      baseInput({
        snapshot: makeSnapshot([makeEntry({ orders: [makeOrder({ price: 0 })] })]),
        stationPrices: new Map([
          ['60003760:100', { sellMin: -5, buyMax: null, sellVolume: 5, buyVolume: 0 }],
        ]),
      })
    );
    expect(row.station.gapPct).toBe(0);
  });

  it('treats a missing is_buy_order field as a sell order', () => {
    const order = makeOrder({ price: 1000 });
    delete order.is_buy_order;
    const row = firstRow(
      baseInput({
        snapshot: makeSnapshot([makeEntry({ orders: [order] })]),
        stationPrices: new Map([
          ['60003760:100', { sellMin: 900, buyMax: null, sellVolume: 5, buyVolume: 0 }],
        ]),
      })
    );
    expect(row.isBuyOrder).toBe(false);
    expect(row.station.beatsMe).toBe(true);
  });
});

describe('buildOpenOrderRows — worstScope and deep undercut', () => {
  it('is null when neither station nor deep check beats me', () => {
    const row = firstRow(baseInput());
    expect(row.worstScope).toBeNull();
    expect(row.deepUndercut).toBeNull();
  });

  it('falls back to station when the deep check has not run', () => {
    const row = firstRow(
      baseInput({
        stationPrices: new Map([
          ['60003760:100', { sellMin: 900, buyMax: null, sellVolume: 5, buyVolume: 0 }],
        ]),
      })
    );
    expect(row.deepUndercut).toBeNull();
    expect(row.worstScope).toBe('station');
  });

  it('wins outright with a deep result even when the deep check found nothing and station.beatsMe is true (the second trap)', () => {
    const deepCompetition = new Map([
      [
        1,
        deepEntry([
          // Only my own order in the fetched region book: deep check ran, found no rival.
          {
            orderId: 1,
            price: 1000,
            locationId: 60003760,
            systemId: 30000142,
            volumeRemain: 5,
            isBuyOrder: false,
          },
        ]),
      ],
    ]);
    const row = firstRow(
      baseInput({
        stationPrices: new Map([
          ['60003760:100', { sellMin: 900, buyMax: null, sellVolume: 5, buyVolume: 0 }],
        ]),
        deepCompetition,
      })
    );
    expect(row.station.beatsMe).toBe(true);
    expect(row.deepUndercut).not.toBeNull();
    expect(row.deepUndercut?.worst).toBeNull();
    expect(row.worstScope).toBeNull();
  });

  it('falls back to station when a clean deep result was TRUNCATED and station.beatsMe is true — a partial book is not proof of a clean order', () => {
    const deepCompetition = new Map([
      [
        1,
        deepEntry(
          [
            // Only my own order in the (partially) fetched region book.
            {
              orderId: 1,
              price: 1000,
              locationId: 60003760,
              systemId: 30000142,
              volumeRemain: 5,
              isBuyOrder: false,
            },
          ],
          true // truncated
        ),
      ],
    ]);
    const row = firstRow(
      baseInput({
        stationPrices: new Map([
          ['60003760:100', { sellMin: 900, buyMax: null, sellVolume: 5, buyVolume: 0 }],
        ]),
        deepCompetition,
      })
    );
    expect(row.station.beatsMe).toBe(true);
    expect(row.deepUndercut?.worst).toBeNull();
    expect(row.worstScope).toBe('station');
  });

  it('keeps worstScope null for the identical clean deep result when it was NOT truncated (control case)', () => {
    const deepCompetition = new Map([
      [
        1,
        deepEntry(
          [
            {
              orderId: 1,
              price: 1000,
              locationId: 60003760,
              systemId: 30000142,
              volumeRemain: 5,
              isBuyOrder: false,
            },
          ],
          false // not truncated
        ),
      ],
    ]);
    const row = firstRow(
      baseInput({
        stationPrices: new Map([
          ['60003760:100', { sellMin: 900, buyMax: null, sellVolume: 5, buyVolume: 0 }],
        ]),
        deepCompetition,
      })
    );
    expect(row.station.beatsMe).toBe(true);
    expect(row.deepUndercut?.worst).toBeNull();
    expect(row.worstScope).toBeNull();
  });

  it('still trusts a rival a truncated deep result actually found, over the station tier', () => {
    const deepCompetition = new Map([
      [
        1,
        deepEntry(
          [
            {
              orderId: 1,
              price: 1000,
              locationId: 60003760,
              systemId: 30000142,
              volumeRemain: 5,
              isBuyOrder: false,
            },
            {
              orderId: 2,
              price: 950,
              locationId: 60003760,
              systemId: 30000142,
              volumeRemain: 3,
              isBuyOrder: false,
            },
          ],
          true // truncated, but this rival was still actually seen
        ),
      ],
    ]);
    const row = firstRow(baseInput({ deepCompetition }));
    expect(row.worstScope).toBe('station');
    expect(row.deepUndercut?.worst?.price).toBe(950);
  });

  it('reports the deep result worst scope when it beats me', () => {
    const deepCompetition = new Map([
      [
        1,
        deepEntry([
          {
            orderId: 1,
            price: 1000,
            locationId: 60003760,
            systemId: 30000142,
            volumeRemain: 5,
            isBuyOrder: false,
          },
          {
            orderId: 2,
            price: 800,
            locationId: 60003761,
            systemId: 30000144,
            volumeRemain: 3,
            isBuyOrder: false,
          },
        ]),
      ],
    ]);
    const row = firstRow(baseInput({ deepCompetition }));
    expect(row.worstScope).toBe('region');
    expect(row.deepUndercut?.worst?.scope).toBe('region');
  });

  it('derives systemId via locationId match when my own orderId is absent from the fetched book', () => {
    const deepCompetition = new Map([
      [
        1,
        deepEntry([
          // Same station as mine (60003760), different order id — establishes my systemId.
          {
            orderId: 99,
            price: 1100,
            locationId: 60003760,
            systemId: 30000142,
            volumeRemain: 2,
            isBuyOrder: false,
          },
          // Same system (30000142), different station, beats me.
          {
            orderId: 98,
            price: 900,
            locationId: 60003761,
            systemId: 30000142,
            volumeRemain: 4,
            isBuyOrder: false,
          },
        ]),
      ],
    ]);
    const row = firstRow(baseInput({ deepCompetition }));
    expect(row.deepUndercut?.byScope.system).not.toBeUndefined();
    expect(row.worstScope).toBe('system');
  });

  it('leaves the system scope unchecked (absent, not null) when systemId cannot be derived at all', () => {
    const deepCompetition = new Map([
      [
        1,
        deepEntry([
          // No entry at my station or my order id anywhere in the book.
          {
            orderId: 42,
            price: 900,
            locationId: 60003761,
            systemId: 30000144,
            volumeRemain: 4,
            isBuyOrder: false,
          },
        ]),
      ],
    ]);
    const row = firstRow(baseInput({ deepCompetition }));
    expect(row.deepUndercut).not.toBeNull();
    expect('system' in (row.deepUndercut?.byScope ?? {})).toBe(false);
    // Region scope still resolves since it does not depend on systemId.
    expect(row.worstScope).toBe('region');
  });

  it('is null (not an empty array outcome) when deepCompetition has no entry for this order at all', () => {
    const row = firstRow(baseInput({ deepCompetition: new Map() }));
    expect(row.deepUndercut).toBeNull();
  });
});

describe('buildOpenOrderRows — cost basis and floor', () => {
  const costBases = new Map<number, OrderCostBasis>([
    [1, { unitCost: 500, runId: 'run-1', runQuantity: 10, materialCost: 4000, jobFee: 1000 }],
  ]);

  it('computes belowFloor only for a sell order priced under its floor', () => {
    const row = firstRow(
      baseInput({
        snapshot: makeSnapshot([makeEntry({ orders: [makeOrder({ price: 501 })] })]),
        costBases,
      })
    );
    expect(row.floor).not.toBeNull();
    expect(row.belowFloor).toBe(true);
  });

  it('never marks a buy order belowFloor even if the price is under the sell floor', () => {
    const row = firstRow(
      baseInput({
        snapshot: makeSnapshot([
          makeEntry({ orders: [makeOrder({ is_buy_order: true, price: 501 })] }),
        ]),
        costBases,
      })
    );
    expect(row.belowFloor).toBe(false);
  });

  it('has no floor and belowFloor === false with no cost basis, never a guessed floor', () => {
    const row = firstRow(baseInput());
    expect(row.floor).toBeNull();
    expect(row.costBasis).toBeNull();
    expect(row.belowFloor).toBe(false);
  });

  it('has no floor when a cost basis exists but the character has no skills entry', () => {
    const row = firstRow(
      baseInput({
        costBases,
        skillsByCharacter: new Map(),
      })
    );
    expect(row.floor).toBeNull();
    expect(row.belowFloor).toBe(false);
  });
});

describe('buildOpenOrderRows — misc fields', () => {
  it('falls back typeName to Type #<id> when unresolved', () => {
    const row = firstRow(baseInput({ typeNames: new Map() }));
    expect(row.typeName).toBe('Type #100');
  });

  it('leaves stationName null when unresolved (player structure)', () => {
    const row = firstRow(baseInput());
    expect(row.stationName).toBeNull();
  });

  it('resolves stationName when provided', () => {
    const row = firstRow(baseInput({ stationNames: new Map([[60003760, 'Jita IV - Moon 4']]) }));
    expect(row.stationName).toBe('Jita IV - Moon 4');
  });

  it('computes iskTiedUp as price x volumeRemain', () => {
    const row = firstRow(
      baseInput({
        snapshot: makeSnapshot([
          makeEntry({ orders: [makeOrder({ price: 100, volume_remain: 7 })] }),
        ]),
      })
    );
    expect(row.iskTiedUp).toBe(700);
  });

  it('produces no rows and does not throw for a skipped character', () => {
    const rows = buildOpenOrderRows(
      baseInput({
        snapshot: makeSnapshot([], [{ characterId: 2, name: 'Alt Two' }]),
      })
    );
    expect(rows).toEqual([]);
  });

  it('flattens rows from every character into one array', () => {
    const rows = buildOpenOrderRows(
      baseInput({
        snapshot: makeSnapshot([
          makeEntry({ characterId: 1, orders: [makeOrder({ order_id: 1 })] }),
          makeEntry({
            characterId: 2,
            characterName: 'Alt Two',
            orders: [makeOrder({ order_id: 2 })],
          }),
        ]),
        skillsByCharacter: new Map([
          [1, { accountingLevel: 0, brokerRelationsLevel: 0 }],
          [2, { accountingLevel: 0, brokerRelationsLevel: 0 }],
        ]),
      })
    );
    expect(rows.map((r) => r.characterId).sort()).toEqual([1, 2]);
  });
});

describe('sorting, grouping, counting', () => {
  it('sorts worst-problem-first, then by iskTiedUp descending, then by orderId', () => {
    const snapshot = makeSnapshot([
      makeEntry({
        orders: [
          makeOrder({
            order_id: 10,
            price: 100,
            volume_remain: 1,
            issued: '2026-09-01T00:00:00Z',
            duration: 90,
          }), // healthy, low isk
          makeOrder({ order_id: 20, price: 1000, volume_remain: 1, duration: 5 }), // expiring soon, higher isk
          makeOrder({ order_id: 30, price: 500, volume_remain: 1, duration: 5 }), // expiring soon, lower isk
        ],
      }),
    ]);
    const rows = buildOpenOrderRows(baseInput({ snapshot }));
    expect(rows.map((r) => r.orderId)).toEqual([20, 30, 10]);
  });

  it('does not mutate the input array when sorting', () => {
    const rows = buildOpenOrderRows(
      baseInput({
        snapshot: makeSnapshot([
          makeEntry({ orders: [makeOrder({ order_id: 1 }), makeOrder({ order_id: 2 })] }),
        ]),
      })
    );
    const copy = [...rows];
    const sorted = [...rows].sort(compareOpenOrderRowsWorstFirst);
    expect(rows).toEqual(copy);
    expect(sorted.map((r) => r.orderId)).toEqual(rows.map((r) => r.orderId));
  });

  it('groups by problem in ORDER_PROBLEMS order and drops empty groups', () => {
    const snapshot = makeSnapshot([
      makeEntry({
        orders: [
          makeOrder({ order_id: 1, duration: 90 }), // healthy
          makeOrder({ order_id: 2, duration: 5 }), // expiringOrStale
        ],
      }),
    ]);
    const rows = buildOpenOrderRows(baseInput({ snapshot }));
    const groups = groupOpenOrders(rows);
    expect(groups.map((g) => g.problem)).toEqual(['expiringOrStale', 'healthy']);
    expect(groups.every((g) => g.rows.length > 0)).toBe(true);
  });

  it('counts across problems (not problem) and includes every OrderProblem key, even at 0', () => {
    const rows = buildOpenOrderRows(baseInput());
    const counts = openOrderProblemCounts(rows);
    expect(Object.keys(counts).sort()).toEqual([...ORDER_PROBLEMS].sort());
    expect(counts.healthy).toBe(1);
    expect(counts.belowFloor).toBe(0);
  });

  it('needsAttentionCount excludes healthy rows only', () => {
    const snapshot = makeSnapshot([
      makeEntry({
        orders: [makeOrder({ order_id: 1, duration: 90 }), makeOrder({ order_id: 2, duration: 5 })],
      }),
    ]);
    const rows = buildOpenOrderRows(baseInput({ snapshot }));
    expect(needsAttentionCount(rows)).toBe(1);
  });
});
