import { describe, expect, it } from 'vitest';
import {
  alertsSummary,
  industrySummary,
  miningTaxSummary,
  ordersSummary,
  planetarySummary,
} from './boardSummary';
import type {
  BoardColony,
  IndustryBoardData,
  MiningTaxBoardData,
  PlanetaryBoardData,
} from './boardData';
import type { OpenOrderRow } from '@/features/market/openOrdersModel';
import type { IndustryJob } from '@/esi/endpoints';

/**
 * Echoes the key and its interpolations rather than resolving them: what these
 * functions decide is *which* line to print and with what count, and asserting
 * on English would make every copy edit a failing test.
 */
function t(key: string, options?: Record<string, unknown>): string {
  if (options === undefined) return key;
  const args = Object.entries(options)
    .map(([name, value]) => `${name}=${String(value)}`)
    .join(',');
  return args === '' ? key : `${key}(${args})`;
}

const NOW = Date.parse('2026-09-07T12:00:00Z');

function makeRow(overrides: Partial<OpenOrderRow> = {}): OpenOrderRow {
  return {
    orderId: 1,
    characterId: 1,
    characterName: 'Ryn Vashti',
    typeId: 100,
    typeName: 'Tritanium',
    isBuyOrder: false,
    price: 1000,
    volumeRemain: 5,
    volumeTotal: 10,
    locationId: 60003760,
    regionId: 10000002,
    stationName: null,
    issued: '2026-09-01T00:00:00Z',
    durationDays: 90,
    expiry: { expiresAt: NOW + 90 * 86400000, daysLeft: 90, expired: false },
    floor: null,
    costBasis: null,
    station: { bestPrice: null, beatsMe: false, gapIsk: 0, gapPct: 0 },
    deepUndercut: null,
    worstScope: null,
    problem: 'healthy',
    problems: ['healthy'],
    iskTiedUp: 5000,
    belowFloor: false,
    ...overrides,
  };
}

function job(overrides: Partial<IndustryJob> = {}): IndustryJob {
  return {
    job_id: 1,
    activity_id: 1,
    blueprint_type_id: 638,
    facility_id: 60003760,
    station_id: 60003760,
    runs: 1,
    start_date: '2026-09-07T10:00:00Z',
    end_date: '2026-09-07T18:00:00Z',
    status: 'active',
    ...overrides,
  };
}

function miningData(overrides: Partial<MiningTaxBoardData> = {}): MiningTaxBoardData {
  return {
    unpaidIsk: 0,
    payeeCount: 0,
    unassignedCount: 0,
    oldestUnpaidDays: null,
    needsReauth: false,
    fetchedAt: null,
    ...overrides,
  };
}

function planetaryData(overrides: Partial<PlanetaryBoardData> = {}): PlanetaryBoardData {
  return {
    batches: [],
    colonyCount: 0,
    programCount: 0,
    needsReauth: false,
    fetchedAt: null,
    loadedAt: NOW,
    ...overrides,
  };
}

/** `planetarySummary` reads a batch's severity and how many colonies are in it, never a colony's own state. */
function colony(planetId: number, name: string): BoardColony {
  return { planetId, name, status: { idle: false, soonestExpiryMs: null } };
}

function industryData(overrides: Partial<IndustryBoardData> = {}): IndustryBoardData {
  return {
    jobs: [],
    productNames: new Map(),
    needsReauth: false,
    fetchedAt: null,
    ...overrides,
  };
}

/*
 * The three states every one of these has to tell apart. A collapsed row is
 * the only thing its domain says on a phone, so "not read yet" printing the
 * same words as "read, nothing to do" is the silence this board was rebuilt to
 * remove — and it is the state a summary is most likely to get wrong, because
 * an unlanded load and an idle character both arrive as an empty list.
 */
describe('the unloaded and unreadable states', () => {
  it('says it is still checking before the read lands', () => {
    expect(ordersSummary(t, null, false)).toBe('overview.board.checking');
    expect(miningTaxSummary(t, null)).toBe('overview.board.checking');
    expect(planetarySummary(t, null)).toBe('overview.board.checking');
    expect(industrySummary(t, null, NOW)).toBe('overview.board.checking');
  });

  it('asks for a login rather than reporting a zero, when the grant has lapsed', () => {
    expect(ordersSummary(t, [], true)).toBe('overview.board.reauth');
    expect(miningTaxSummary(t, miningData({ needsReauth: true }))).toBe('overview.board.reauth');
    expect(planetarySummary(t, planetaryData({ needsReauth: true }))).toBe('overview.board.reauth');
    expect(industrySummary(t, industryData({ needsReauth: true }), NOW)).toBe(
      'overview.board.reauth'
    );
  });
});

describe('ordersSummary', () => {
  it('leads with what is below the cost floor — the only critical an order gets', () => {
    const rows = [
      makeRow({ orderId: 1, problem: 'belowFloor', problems: ['belowFloor', 'undercutStation'] }),
      makeRow({ orderId: 2, problem: 'undercutStation', problems: ['undercutStation'] }),
    ];
    expect(ordersSummary(t, rows, false)).toBe('overview.board.belowFloor(count=1)');
  });

  it('counts each order once when nothing is below the floor', () => {
    // Both problems on one row: two facts about one order, still one order to
    // go and fix — `needsAttentionCount` is what says so.
    const rows = [
      makeRow({
        orderId: 1,
        problem: 'undercutStation',
        problems: ['undercutStation', 'expiringOrStale'],
      }),
      makeRow({ orderId: 2, problem: 'outbid', problems: ['outbid'] }),
    ];
    expect(ordersSummary(t, rows, false)).toBe('overview.board.ordersMeta(count=2)');
  });

  it('says so plainly when every order is healthy', () => {
    expect(ordersSummary(t, [makeRow()], false)).toBe('overview.board.ordersClear');
  });

  it('reads no orders at all as nothing to do, not as an error', () => {
    expect(ordersSummary(t, [], false)).toBe('overview.board.ordersClear');
  });
});

describe('miningTaxSummary', () => {
  it('leads with the ISK owed, compacted', () => {
    expect(miningTaxSummary(t, miningData({ unpaidIsk: 412_600_000, payeeCount: 2 }))).toBe(
      'overview.board.miningUnpaid(isk=412.6M)'
    );
  });

  it('falls back to what has not been worked out yet', () => {
    expect(miningTaxSummary(t, miningData({ unassignedCount: 3 }))).toBe(
      'overview.board.miningUnassigned(count=3)'
    );
  });

  it('says nothing is outstanding when both are zero', () => {
    expect(miningTaxSummary(t, miningData())).toBe('overview.board.miningSettled');
  });
});

describe('planetarySummary', () => {
  it('names the worst batch and how many colonies are in it', () => {
    const data = planetaryData({
      colonyCount: 6,
      batches: [
        {
          kind: 'running',
          severity: 'warning',
          expiryMs: NOW + 3 * 3_600_000,
          colonies: [colony(1, 'Gehi V'), colony(2, 'Gehi VI')],
        },
        {
          kind: 'expired',
          severity: 'critical',
          expiryMs: NOW - 6 * 3_600_000,
          colonies: [colony(3, 'Gehi IV')],
        },
      ],
    });
    // The expired batch is the worse one, and it is not first in the list —
    // the summary ranks by severity, it does not read off the top.
    expect(planetarySummary(t, data)).toBe('overview.board.batch.expired(count=1)');
  });

  it('reads a character with no colonies as having none, not as being clear', () => {
    expect(planetarySummary(t, planetaryData())).toBe('overview.board.noColonies');
  });
});

describe('industrySummary', () => {
  it('leads with the jobs waiting to be delivered', () => {
    const data = industryData({
      jobs: [
        job({ job_id: 1, end_date: '2026-09-07T10:30:00Z' }),
        job({ job_id: 2, end_date: '2026-09-07T11:00:00Z' }),
        job({ job_id: 3, end_date: '2026-09-07T20:00:00Z' }),
      ],
    });
    expect(industrySummary(t, data, NOW)).toBe('overview.board.jobsReady(count=2)');
  });

  it('reports what is still running when nothing is waiting', () => {
    const data = industryData({ jobs: [job({ end_date: '2026-09-07T20:00:00Z' })] });
    expect(industrySummary(t, data, NOW)).toBe('overview.board.industryRunning(count=1)');
  });

  it('says the line is idle when there are no jobs', () => {
    expect(industrySummary(t, industryData(), NOW)).toBe('overview.board.industryIdle');
  });
});

describe('alertsSummary', () => {
  it('joins two counts as two lookups', () => {
    // i18next inflects one `count` per lookup, so "70 unread · 9 types" is two
    // keys joined — asking one key for both plurals produces "1 unread · 1
    // types".
    expect(alertsSummary(t, 70, 9)).toBe(
      'overview.board.alertsUnread(count=70) · overview.board.alertTypes(count=9)'
    );
  });

  it('says nothing is new rather than printing two zeroes', () => {
    expect(alertsSummary(t, 0, 0)).toBe('overview.board.alertsEmpty');
  });
});
