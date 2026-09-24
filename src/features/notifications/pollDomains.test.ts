import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NOTIFICATION_EVENT_IDS, type NotificationEventId } from './events';
import {
  POLL_DOMAINS,
  calendarDomain,
  skillQueueDomain,
  industryJobDomain,
  colonyDomain,
  contractDomain,
  walletDomain,
  marketOrderDomain,
  structureFuelDomain,
  eveNotificationDomain,
  corpIndustryJobDomain,
  corpRosterDomain,
  corpWalletDomain,
  priceAlertDomain,
  deriveMarketOrderEntries,
  domainForEvent,
  renderNotification,
  notificationSubjectId,
} from './pollDomains';
import { SUBJECT_ROUTED_EVENT_IDS } from './notificationOptions';
import { eventEntry } from './eventEntries';
import { loadTypeNames } from '@/features/character/typeNames';
import { resolveNames } from '@/features/character/names';
import { getHubPrices } from '@/market/prices';
import { useMarketHub } from '@/features/market/hub';
import { getTradeHub } from '@/market/hubs';
import {
  useNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_STRUCTURE_FUEL_LOW_DAYS,
  withCharacterEventThreshold,
  withEveNotificationTypeToggled,
  DEFAULT_WALLET_BALANCE_CHANGED_THRESHOLD_ISK,
} from './preferences';
import { loadContracts } from '@/features/character/contracts';
import { loadWalletJournalWithStatus } from '@/features/character/wallet';
import { loadOrders, loadOrderHistory } from '@/features/character/orders';
import { loadStructureName } from '@/features/character/structures';
import { loadCorporationId, loadCorporationStructures } from '@/features/corp/boardData';
import { loadCorporationIndustryJobs } from '@/features/corp/jobs';
import { loadCorporationMemberIds } from '@/features/corp/members';
import { loadCorporationWallets, loadCorporationWalletJournal } from '@/features/corp/wallet';
import { loadCharacterRoles } from '@/features/corp/roles';
import { loadUniverseType } from '@/features/skills/data';
import { loadPlanetName } from '@/features/pi/names';
import { loadCharacterPlanets, loadAllColonyDetails } from '@/features/pi/data';
import { db } from '@/db';
import type { StatusResult } from '@/esi/cache';
import type {
  MarketOrder,
  MarketOrderHistory,
  CorporationStructure,
  CorporationIndustryJob,
  CorporationWalletDivision,
  WalletJournalEntry,
  CharacterCorporationRoles,
} from '@/esi/endpoints';

vi.mock('@/features/character/contracts', () => ({ loadContracts: vi.fn() }));
vi.mock('@/features/character/wallet', () => ({ loadWalletJournalWithStatus: vi.fn() }));
vi.mock('@/features/character/orders', () => ({
  loadOrders: vi.fn(),
  loadOrderHistory: vi.fn(),
}));
vi.mock('@/features/corp/boardData', () => ({
  loadCorporationId: vi.fn(),
  loadCorporationStructures: vi.fn(),
  MASTER_WALLET_DIVISION: 1,
}));
vi.mock('@/features/corp/jobs', () => ({ loadCorporationIndustryJobs: vi.fn() }));
vi.mock('@/features/corp/members', () => ({ loadCorporationMemberIds: vi.fn() }));
vi.mock('@/features/corp/wallet', () => ({
  loadCorporationWallets: vi.fn(),
  loadCorporationWalletJournal: vi.fn(),
}));
vi.mock('@/features/character/structures', () => ({ loadStructureName: vi.fn() }));
vi.mock('@/features/corp/roles', () => ({
  loadCharacterRoles: vi.fn(),
  corpWideRoles: (payload: CharacterCorporationRoles | null | undefined) => payload?.roles ?? [],
}));
vi.mock('@/features/skills/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/skills/data')>();
  return { ...actual, loadUniverseType: vi.fn() };
});
vi.mock('@/features/pi/names', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/pi/names')>();
  return { ...actual, loadPlanetName: vi.fn() };
});
vi.mock('@/features/pi/data', () => ({
  loadCharacterPlanets: vi.fn(),
  loadAllColonyDetails: vi.fn(),
}));
vi.mock('@/market/prices', () => ({ getHubPrices: vi.fn() }));
vi.mock('@/features/character/typeNames', () => ({ loadTypeNames: vi.fn() }));
vi.mock('@/features/character/names', () => ({ resolveNames: vi.fn() }));

function statusResult<T>(data: T, truncated: boolean): StatusResult<T> {
  return {
    needsReauth: false,
    cached: { data, fetchedAt: new Date(0), fromCache: false, truncated },
  };
}

function marketOrder(overrides: Partial<MarketOrder> = {}): MarketOrder {
  return {
    order_id: 1,
    type_id: 34,
    region_id: 10000002,
    location_id: 60003760,
    is_corporation: false,
    price: 100,
    volume_remain: 5,
    volume_total: 10,
    issued: '2026-01-01T00:00:00Z',
    duration: 90,
    range: 'region',
    ...overrides,
  };
}

function marketOrderHistoryEntry(overrides: Partial<MarketOrderHistory> = {}): MarketOrderHistory {
  return { ...marketOrder(), state: 'expired', ...overrides };
}

describe('POLL_DOMAINS', () => {
  it('covers every notification event exactly once', () => {
    const covered = POLL_DOMAINS.flatMap((domain) => domain.eventIds);
    expect([...covered].sort()).toEqual([...NOTIFICATION_EVENT_IDS].sort());
  });

  it('gives every domain a distinct id', () => {
    const ids = POLL_DOMAINS.map((domain) => domain.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every domain a distinct, non-syncing state key', () => {
    const keys = POLL_DOMAINS.map((domain) => domain.stateKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key.startsWith('sync.')).toBe(false);
  });

  it('stamps the poll time onto every domain snapshot it builds', () => {
    for (const domain of POLL_DOMAINS) {
      expect(domain.toSnapshot([], 4242)).toMatchObject({ nowMs: 4242 });
    }
  });

  it('registers two diffs off the one calendar snapshot', () => {
    expect(calendarDomain.eventIds).toEqual(['newCalendarEvent', 'calendarEventStarting']);
  });

  it('drives the skill queue off the engine diff registry, not a hand-written list', () => {
    expect([...skillQueueDomain.eventIds].sort()).toEqual([
      'characterNotTraining',
      'skillLevelComplete',
      'skillQueueEnding',
    ]);
  });
});

describe('domain.diff: events derived from their entries (issue #1285)', () => {
  const contract = { contractId: 7, issuerId: 1, acceptorId: 2 };
  const prev = { entries: [{ ...contract, status: 'outstanding' as const }], nowMs: 1 };
  const next = { entries: [{ ...contract, status: 'in_progress' as const }], nowMs: 2 };

  it("lists each domain's events in catalog order, from the entries naming its source", () => {
    expect(Object.fromEntries(POLL_DOMAINS.map((domain) => [domain.id, domain.eventIds]))).toEqual({
      skillQueue: ['skillLevelComplete', 'characterNotTraining', 'skillQueueEnding'],
      spExtraction: ['spExtractionReady'],
      industryJobs: ['industryJobComplete'],
      colonies: ['planetaryExtractionDone', 'planetaryExtractorExpiring'],
      mail: ['newMail'],
      calendar: ['newCalendarEvent', 'calendarEventStarting'],
      contracts: ['contractAccepted', 'contractCompleted', 'contractFailed'],
      wallet: ['walletBalanceChanged'],
      marketOrders: ['marketOrderFilled'],
      eveNotification: ['eveNotification'],
      structureFuel: ['structureFuelLow'],
      corpIndustryJobs: ['corpIndustryJobReady'],
      corpRoster: ['corpMemberJoined', 'corpMemberLeft'],
      corpWallet: ['corpWalletThreshold'],
      priceAlert: ['priceAlertTriggered'],
    });
  });

  it("runs an event's diff when that event is enabled", () => {
    expect(
      contractDomain.diff(1, prev, next, new Set<NotificationEventId>(['contractAccepted']))
    ).toEqual([{ eventId: 'contractAccepted', characterId: 1, contractId: 7 }]);
  });

  it("fires nothing for a shared snapshot's event that is not enabled", () => {
    expect(
      contractDomain.diff(1, prev, next, new Set<NotificationEventId>(['contractFailed']))
    ).toEqual([]);
  });

  it('gives a domain a projection exactly when one of its entries declares one', () => {
    for (const domain of POLL_DOMAINS) {
      const projects = domain.eventIds.some((eventId) => eventEntry(eventId).projection !== null);
      expect({ id: domain.id, projects: domain.projection !== undefined }).toEqual({
        id: domain.id,
        projects,
      });
    }
  });
});

describe('deriveMarketOrderEntries', () => {
  /** The fixture's own type and size, so a row assertion states only what it is testing. */
  const item = { typeId: 34, quantity: 10 };

  it('marks every still-open order as not filled', () => {
    const entries = deriveMarketOrderEntries([marketOrder({ order_id: 1 })], []);
    expect(entries).toEqual([{ orderId: 1, filled: false, isBuyOrder: false, ...item }]);
  });

  it('marks a history order gone from the open list as filled once volume_remain is 0', () => {
    const entries = deriveMarketOrderEntries(
      [],
      [marketOrderHistoryEntry({ order_id: 2, volume_remain: 0 })]
    );
    expect(entries).toEqual([{ orderId: 2, filled: true, isBuyOrder: false, ...item }]);
  });

  it('does not mark a history order with remaining volume as filled (cancelled/expired unfilled)', () => {
    const entries = deriveMarketOrderEntries(
      [],
      [marketOrderHistoryEntry({ order_id: 3, volume_remain: 4 })]
    );
    expect(entries).toEqual([{ orderId: 3, filled: false, isBuyOrder: false, ...item }]);
  });

  it('prefers the open-list entry over a stale history row for the same order id', () => {
    const entries = deriveMarketOrderEntries(
      [marketOrder({ order_id: 4 })],
      [marketOrderHistoryEntry({ order_id: 4, volume_remain: 0 })]
    );
    expect(entries).toEqual([{ orderId: 4, filled: false, isBuyOrder: false, ...item }]);
  });

  it('records which side of the book each order was on', () => {
    const entries = deriveMarketOrderEntries(
      [],
      [
        marketOrderHistoryEntry({ order_id: 5, is_buy_order: true, volume_remain: 0 }),
        marketOrderHistoryEntry({ order_id: 6, is_buy_order: false, volume_remain: 0 }),
      ]
    );
    expect(entries.map((e) => e.isBuyOrder)).toEqual([true, false]);
  });

  it('reads an absent is_buy_order as a sell order, which is how ESI sends one', () => {
    // ESI omits the field on a sell order rather than sending false, so a
    // truthiness test here is what keeps every offer out of the buy bucket.
    const sell: MarketOrderHistory = marketOrderHistoryEntry({ order_id: 7, volume_remain: 0 });
    delete sell.is_buy_order;

    expect(deriveMarketOrderEntries([], [sell])[0].isBuyOrder).toBe(false);
  });

  it('carries what was sold and how much of it, for the notification copy', () => {
    const entries = deriveMarketOrderEntries(
      [],
      [
        marketOrderHistoryEntry({
          order_id: 8,
          type_id: 12345,
          volume_total: 250,
          volume_remain: 0,
        }),
      ]
    );
    expect(entries[0]).toMatchObject({ typeId: 12345, quantity: 250 });
  });
});

/**
 * Registry wiring for the Scheduled Push Projection engine (issue #355,
 * ADR 0010): each of the six domains with a fixed future timestamp resolves
 * whatever names its row text needs, then delegates row-building to the pure
 * `engine/projection.ts` functions covered exhaustively by their own tests —
 * these only prove the wiring reaches them with the right arguments.
 */
describe('projection wiring', () => {
  const T0 = 1_700_000_000_000;
  const HOUR_MS = 3_600_000;

  function universeTypeResult(name: string) {
    return {
      data: { name },
      fetchedAt: new Date(0),
      fromCache: false,
      truncated: false,
    } as Awaited<ReturnType<typeof loadUniverseType>>;
  }

  beforeEach(async () => {
    vi.mocked(loadUniverseType).mockReset();
    vi.mocked(loadPlanetName).mockReset();
    vi.mocked(loadStructureName).mockReset();
    await db.settings.clear();
    useNotificationPreferences.setState({
      value: DEFAULT_NOTIFICATION_PREFERENCES,
      hydrated: true,
    });
  });

  it('gives exactly the six fixed-future-timestamp domains a projection', () => {
    const withProjection = POLL_DOMAINS.filter((domain) => domain.projection !== undefined).map(
      (domain) => domain.id
    );
    expect([...withProjection].sort()).toEqual(
      [
        'calendar',
        'colonies',
        'eveNotification',
        'industryJobs',
        'skillQueue',
        'structureFuel',
      ].sort()
    );
  });

  it('resolves skill names for the skill queue and defers row-building to the engine', async () => {
    vi.mocked(loadUniverseType).mockResolvedValue(universeTypeResult('Gunnery'));
    const snapshot = {
      entries: [
        { skillId: 3300, finishedLevel: 4, queuePosition: 0, finishMs: T0 + 5 * HOUR_MS },
        { skillId: 3301, finishedLevel: 1, queuePosition: 1, finishMs: T0 + 10 * HOUR_MS },
      ],
      nowMs: T0,
    };
    const rows = await skillQueueDomain.projection!(7, 'Kestrel', snapshot, T0);
    expect(rows[0].eventId).toEqual('skillLevelComplete');
    expect(rows[0].body).toContain('Gunnery');
    expect(rows[1].eventId).toEqual('characterNotTraining');
  });

  it("projects skillQueueEnding at the Character's current lead time, not the one baked into the baseline (issue #1410, same reasoning as #1248/#1259)", async () => {
    // A Settings lead-time change rebuilds the Projection from the saved
    // baseline, whose `endingLeadMs` is whatever was in force at load time.
    useNotificationPreferences.setState({
      value: withCharacterEventThreshold(
        DEFAULT_NOTIFICATION_PREFERENCES,
        7,
        'skillQueueEndingLeadHours',
        12
      ),
      hydrated: true,
    });
    const finishMs = T0 + 20 * HOUR_MS;
    const snapshot = {
      entries: [
        {
          skillId: 3300,
          finishedLevel: 4,
          queuePosition: 0,
          finishMs,
          endingLeadMs: 6 * HOUR_MS,
        },
      ],
      nowMs: T0,
    };
    const rows = await skillQueueDomain.projection!(7, 'Kestrel', snapshot, T0);
    const ending = rows.find((r) => r.eventId === 'skillQueueEnding');
    expect(ending?.fireAt).toEqual(finishMs - 12 * HOUR_MS);
  });

  it('resolves item names for industry jobs', async () => {
    vi.mocked(loadUniverseType).mockResolvedValue(universeTypeResult('Rifter'));
    const snapshot = {
      entries: [
        {
          jobId: 1,
          endMs: T0 + 5 * HOUR_MS,
          blueprintTypeId: 10,
          productTypeId: 20,
          activityId: 1,
        },
      ],
      nowMs: T0,
    };
    const rows = await industryJobDomain.projection!(7, 'Kestrel', snapshot, T0);
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toContain('Rifter');
  });

  it('carries each extractor install time into the colony snapshot, and omits it when ESI did', async () => {
    // The only evidence `disprovenExtractorOccurrences` can retract on.
    // Dropped here — as this mapping did before the retraction needed it —
    // and the feature silently never fires, with nothing failing to say so.
    vi.mocked(loadCharacterPlanets).mockResolvedValue(
      statusResult([{ planet_id: 40000001, solar_system_id: 1, owner_id: 7 }], false) as never
    );
    vi.mocked(loadAllColonyDetails).mockResolvedValue(
      new Map([
        [
          40000001,
          statusResult(
            {
              links: [],
              routes: [],
              pins: [
                {
                  pin_id: 1,
                  type_id: 2848,
                  latitude: 0,
                  longitude: 0,
                  expiry_time: '2026-09-07T12:00:00Z',
                  install_time: '2026-09-05T12:00:00Z',
                  extractor_details: { heads: [] },
                },
                {
                  pin_id: 2,
                  type_id: 2848,
                  latitude: 0,
                  longitude: 0,
                  expiry_time: '2026-09-07T18:00:00Z',
                  extractor_details: { heads: [] },
                },
              ],
            },
            false
          ),
        ],
      ]) as never
    );
    expect(await colonyDomain.load(7)).toEqual([
      {
        planetId: 40000001,
        extractors: [
          {
            pinId: 1,
            expiryTimeMs: Date.parse('2026-09-07T12:00:00Z'),
            thresholdMs: 21_600_000,
            installTimeMs: Date.parse('2026-09-05T12:00:00Z'),
          },
          { pinId: 2, expiryTimeMs: Date.parse('2026-09-07T18:00:00Z'), thresholdMs: 21_600_000 },
        ],
      },
    ]);
  });

  it("embeds the Character's configured extractorExpiringLeadHours, not the default, once it's set (issue #750)", async () => {
    useNotificationPreferences.setState({
      value: withCharacterEventThreshold(
        DEFAULT_NOTIFICATION_PREFERENCES,
        7,
        'extractorExpiringLeadHours',
        12
      ),
      hydrated: true,
    });
    vi.mocked(loadCharacterPlanets).mockResolvedValue(
      statusResult([{ planet_id: 40000001, solar_system_id: 1, owner_id: 7 }], false) as never
    );
    vi.mocked(loadAllColonyDetails).mockResolvedValue(
      new Map([
        [
          40000001,
          statusResult(
            {
              links: [],
              routes: [],
              pins: [
                {
                  pin_id: 1,
                  type_id: 2848,
                  latitude: 0,
                  longitude: 0,
                  expiry_time: '2026-09-07T12:00:00Z',
                  extractor_details: { heads: [] },
                },
              ],
            },
            false
          ),
        ],
      ]) as never
    );
    expect(await colonyDomain.load(7)).toEqual([
      {
        planetId: 40000001,
        extractors: [
          { pinId: 1, expiryTimeMs: Date.parse('2026-09-07T12:00:00Z'), thresholdMs: 12 * HOUR_MS },
        ],
      },
    ]);
  });

  it('resolves planet names for colonies', async () => {
    vi.mocked(loadPlanetName).mockResolvedValue('Amarr III');
    const snapshot = {
      colonies: [
        { planetId: 40000001, extractors: [{ pinId: 1, expiryTimeMs: T0 + 5 * HOUR_MS }] },
      ],
      nowMs: T0,
    };
    const rows = await colonyDomain.projection!(7, 'Kestrel', snapshot, T0);
    const extractionDone = rows.find((r) => r.eventId === 'planetaryExtractionDone');
    expect(extractionDone?.body).toContain('Amarr III');
  });

  it("projects extractor warnings at the Character's current lead time, not the one baked into the baseline (issue #1248)", async () => {
    // A Settings lead-time change rebuilds the Projection from the saved
    // baseline, whose `thresholdMs` is whatever was in force at load time.
    useNotificationPreferences.setState({
      value: withCharacterEventThreshold(
        DEFAULT_NOTIFICATION_PREFERENCES,
        7,
        'extractorExpiringLeadHours',
        12
      ),
      hydrated: true,
    });
    const expiryTimeMs = T0 + 20 * HOUR_MS;
    const snapshot = {
      colonies: [
        { planetId: 40000001, extractors: [{ pinId: 1, expiryTimeMs, thresholdMs: 6 * HOUR_MS }] },
      ],
      nowMs: T0,
    };
    const rows = await colonyDomain.projection!(7, 'Kestrel', snapshot, T0);
    const expiring = rows.filter((r) => r.eventId === 'planetaryExtractorExpiring');
    expect(expiring.map((r) => r.fireAt)).toEqual([expiryTimeMs - 12 * HOUR_MS]);
  });

  it('projects calendarEventStarting without any name resolution', async () => {
    const snapshot = { entries: [{ calendarEventId: 99, startMs: T0 + 5 * HOUR_MS }], nowMs: T0 };
    const rows = await calendarDomain.projection!(7, 'Kestrel', snapshot, T0);
    expect(rows).toEqual([expect.objectContaining({ eventId: 'calendarEventStarting' })]);
    expect(loadUniverseType).not.toHaveBeenCalled();
  });

  it("projects structure fuel warnings at the Character's current fuel threshold, not the one baked into the baseline (issue #1259)", async () => {
    // Same reasoning as the extractor lead time above: a Settings change
    // rebuilds from the saved baseline, whose `thresholdMs` is stale.
    useNotificationPreferences.setState({
      value: withCharacterEventThreshold(
        DEFAULT_NOTIFICATION_PREFERENCES,
        7,
        'structureFuelLowDays',
        2
      ),
      hydrated: true,
    });
    const fuelExpiresMs = T0 + 60 * HOUR_MS;
    const snapshot = {
      entries: [{ structureId: 111, name: 'Keepstar', fuelExpiresMs, thresholdMs: 24 * HOUR_MS }],
      nowMs: T0,
    };
    const rows = await structureFuelDomain.projection!(7, 'Kestrel', snapshot, T0);
    expect(rows.map((r) => r.fireAt)).toEqual([fuelExpiresMs - 48 * HOUR_MS]);
  });

  it('hedges the structure fuel projection copy', async () => {
    const snapshot = {
      entries: [
        {
          structureId: 111,
          name: 'Keepstar',
          // Two hours past the default fuel threshold's warning point.
          fuelExpiresMs: T0 + (DEFAULT_STRUCTURE_FUEL_LOW_DAYS * 24 + 2) * HOUR_MS,
          thresholdMs: 24 * HOUR_MS,
        },
      ],
      nowMs: T0,
    };
    const rows = await structureFuelDomain.projection!(7, 'Kestrel', snapshot, T0);
    expect(rows[0].body).toContain('was due to run out');
  });

  describe('eveNotificationDomain.projection', () => {
    function notificationSnapshot(overrides: { type?: string; text?: string } = {}) {
      return {
        entries: [
          {
            notificationId: 42,
            type: overrides.type ?? 'StructureUnderAttack',
            senderId: 1000132,
            senderType: 'corporation',
            // 36,000,000,000 ticks (100ns units) = 3,600,000 ms = 1 hour.
            text: overrides.text ?? 'structureID: 111\ntimeLeft: 36000000000\n',
            timestamp: new Date(T0).toISOString(),
          },
        ],
        nowMs: T0,
      };
    }

    it('resolves the structure name and projects a row for an allow-listed, enabled type', async () => {
      vi.mocked(loadStructureName).mockResolvedValue('Keepstar');
      const rows = await eveNotificationDomain.projection!(
        7,
        'Kestrel',
        notificationSnapshot(),
        T0
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].eventId).toEqual('eveNotification');
      expect(rows[0].fireAt).toEqual(T0 + HOUR_MS);
      expect(rows[0].body).toContain('Keepstar');
      expect(loadStructureName).toHaveBeenCalledWith(7, 111);
    });

    it('drops a type off the round-45 allow-list before it reaches the engine', async () => {
      const rows = await eveNotificationDomain.projection!(
        7,
        'Kestrel',
        notificationSnapshot({ type: 'NotOnTheAllowList' }),
        T0
      );
      expect(rows).toEqual([]);
      expect(loadStructureName).not.toHaveBeenCalled();
    });

    it("drops a type the Character has switched browser notifications off for, mirroring the live channel's own gate", async () => {
      useNotificationPreferences.setState({
        value: withEveNotificationTypeToggled(
          DEFAULT_NOTIFICATION_PREFERENCES,
          7,
          'StructureUnderAttack',
          'browser'
        ),
        hydrated: true,
      });
      const rows = await eveNotificationDomain.projection!(
        7,
        'Kestrel',
        notificationSnapshot(),
        T0
      );
      expect(rows).toEqual([]);
    });

    it('skips loadStructureName for entries whose reinforcement exit falls outside the projection horizon (Sentry N+1, /skills)', async () => {
      // 76 hours in 100ns ticks — past the 72-hour horizon.
      const outsideTicks = 76 * 3_600 * 10_000_000;
      const snapshot = {
        entries: [
          {
            notificationId: 42,
            type: 'StructureUnderAttack',
            senderId: 1000132,
            senderType: 'corporation',
            text: `structureID: 111\ntimeLeft: ${outsideTicks}\n`,
            timestamp: new Date(T0).toISOString(),
          },
        ],
        nowMs: T0,
      };
      const rows = await eveNotificationDomain.projection!(7, 'Kestrel', snapshot, T0);
      expect(rows).toEqual([]);
      expect(loadStructureName).not.toHaveBeenCalled();
    });
  });
});

/**
 * Three separate bug fixes from the #174/#175 reviews, now testable because
 * each domain's loader sits on its registry entry rather than inside
 * `liveDependencies()`'s object literal. This only covers the loader half —
 * that a truncated page set returns `null`. That a `null` load then actually
 * skips the poll (no snapshot saved, nothing fired) is a property of
 * `runForegroundPoll` itself, proven once per domain by the
 * "leaves the ... baseline untouched ... when the load is truncated" cases
 * in `foregroundPoller.test.ts`.
 */
describe('truncation guards', () => {
  beforeEach(() => {
    vi.mocked(loadContracts).mockReset();
    vi.mocked(loadWalletJournalWithStatus).mockReset();
    vi.mocked(loadOrders).mockReset();
    vi.mocked(loadOrderHistory).mockReset();
  });

  it('skips the contracts poll rather than persist a truncated page set', async () => {
    vi.mocked(loadContracts).mockResolvedValue(statusResult([], true));
    expect(await contractDomain.load(1)).toBeNull();
  });

  it('polls contracts normally when the page set is complete', async () => {
    vi.mocked(loadContracts).mockResolvedValue(statusResult([], false));
    expect(await contractDomain.load(1)).toEqual([]);
  });

  it('skips the wallet poll rather than lower the high-water mark from a truncated page set', async () => {
    vi.mocked(loadWalletJournalWithStatus).mockResolvedValue(statusResult([], true));
    expect(await walletDomain.load(1)).toBeNull();
  });

  it('polls the wallet normally when the page set is complete', async () => {
    vi.mocked(loadWalletJournalWithStatus).mockResolvedValue(statusResult([], false));
    expect(await walletDomain.load(1)).toEqual([]);
  });

  it('skips the market-order poll rather than misreport an open order as filled-and-gone', async () => {
    vi.mocked(loadOrders).mockResolvedValue(statusResult([], false));
    vi.mocked(loadOrderHistory).mockResolvedValue(statusResult([], true));
    expect(await marketOrderDomain.load(1)).toBeNull();
  });

  it('polls market orders normally when the history page set is complete', async () => {
    vi.mocked(loadOrders).mockResolvedValue(statusResult([marketOrder({ order_id: 9 })], false));
    vi.mocked(loadOrderHistory).mockResolvedValue(statusResult([], false));
    expect(await marketOrderDomain.load(1)).toEqual([
      { orderId: 9, filled: false, isBuyOrder: false, typeId: 34, quantity: 10 },
    ]);
  });
});

/**
 * `walletDomain.load` bakes the Character's current wallet-balance-changed
 * threshold onto every entry it returns, the same async-preference-read
 * pattern `structureFuelDomain`'s own test below documents — the threshold
 * is device-local state, only readable in `load`'s async context, so
 * `toSnapshot` stays a pure passthrough for this domain.
 */
describe('walletDomain threshold', () => {
  beforeEach(async () => {
    vi.mocked(loadWalletJournalWithStatus).mockReset();
    await db.settings.clear();
    useNotificationPreferences.setState({
      value: DEFAULT_NOTIFICATION_PREFERENCES,
      hydrated: true,
    });
  });

  it('embeds the default threshold when the Character has no override', async () => {
    vi.mocked(loadWalletJournalWithStatus).mockResolvedValue(
      statusResult([journalEntry({ id: 5, amount: 250 })], false)
    );
    expect(await walletDomain.load(1)).toEqual([
      {
        id: 5,
        amount: 250,
        thresholdIsk: DEFAULT_WALLET_BALANCE_CHANGED_THRESHOLD_ISK,
        dateMs: Date.parse('2026-01-01T00:00:00Z'),
      },
    ]);
  });

  it("embeds the Character's own threshold once set", async () => {
    useNotificationPreferences.setState({
      value: withCharacterEventThreshold(
        DEFAULT_NOTIFICATION_PREFERENCES,
        1,
        'walletBalanceChangedThresholdIsk',
        10_500_000
      ),
      hydrated: true,
    });
    vi.mocked(loadWalletJournalWithStatus).mockResolvedValue(
      statusResult([journalEntry({ id: 5, amount: 250 })], false)
    );
    expect(await walletDomain.load(1)).toEqual([
      {
        id: 5,
        amount: 250,
        thresholdIsk: 10_500_000,
        dateMs: Date.parse('2026-01-01T00:00:00Z'),
      },
    ]);
  });
});

function structure(overrides: Partial<CorporationStructure> = {}): CorporationStructure {
  return {
    structure_id: 1,
    corporation_id: 2,
    system_id: 3,
    type_id: 4,
    profile_id: 5,
    ...overrides,
  };
}

function corpJob(overrides: Partial<CorporationIndustryJob> = {}): CorporationIndustryJob {
  return {
    job_id: 1,
    installer_id: 1,
    activity_id: 1,
    blueprint_id: 1,
    blueprint_type_id: 1000,
    blueprint_location_id: 1,
    output_location_id: 1,
    facility_id: 1,
    location_id: 1,
    runs: 1,
    start_date: '2026-01-01T00:00:00Z',
    end_date: '2026-01-01T01:00:00Z',
    status: 'active',
    ...overrides,
  };
}

function walletDivisionRow(
  overrides: Partial<CorporationWalletDivision> = {}
): CorporationWalletDivision {
  return { division: 1, balance: 1_000_000, ...overrides };
}

function journalEntry(overrides: Partial<WalletJournalEntry> = {}): WalletJournalEntry {
  return { id: 1, date: '2026-01-01T00:00:00Z', ref_type: 'bounty', description: '', ...overrides };
}

function roles(list: readonly string[]): CharacterCorporationRoles {
  return { roles: [...list] };
}

/**
 * The four corp domains (issue #299) share the same shape of gate: a
 * corporation id, then a role-derived capability, both resolved before the
 * domain's own ESI endpoint is ever called (AC5). This covers that gate
 * itself, not the diff logic — that is `notificationDiffs.test.ts`'s job.
 */
describe('corp domains', () => {
  beforeEach(async () => {
    vi.mocked(loadCorporationId).mockReset();
    vi.mocked(loadCharacterRoles).mockReset();
    vi.mocked(loadCorporationStructures).mockReset();
    vi.mocked(loadCorporationIndustryJobs).mockReset();
    vi.mocked(loadCorporationMemberIds).mockReset();
    vi.mocked(loadCorporationWallets).mockReset();
    vi.mocked(loadCorporationWalletJournal).mockReset();
    await db.settings.clear();
    useNotificationPreferences.setState({
      value: DEFAULT_NOTIFICATION_PREFERENCES,
      hydrated: true,
    });
  });

  it('structureFuelDomain never calls the endpoint when the corporation is unknown', async () => {
    vi.mocked(loadCorporationId).mockResolvedValue(null);
    expect(await structureFuelDomain.load(1)).toBeNull();
    expect(loadCorporationStructures).not.toHaveBeenCalled();
  });

  it('structureFuelDomain never calls the endpoint when the Character lacks the role (AC5)', async () => {
    vi.mocked(loadCorporationId).mockResolvedValue(2);
    vi.mocked(loadCharacterRoles).mockResolvedValue(statusResult(roles(['Accountant']), false));
    expect(await structureFuelDomain.load(1)).toBeNull();
    expect(loadCorporationStructures).not.toHaveBeenCalled();
  });

  it('structureFuelDomain fetches and embeds the current fuel threshold once the role is held', async () => {
    vi.mocked(loadCorporationId).mockResolvedValue(2);
    vi.mocked(loadCharacterRoles).mockResolvedValue(
      statusResult(roles(['Station_Manager']), false)
    );
    vi.mocked(loadCorporationStructures).mockResolvedValue(
      statusResult(
        [structure({ structure_id: 9, name: 'Fortizar', fuel_expires: undefined })],
        false
      )
    );
    const entries = await structureFuelDomain.load(1);
    expect(entries).toEqual([
      { structureId: 9, name: 'Fortizar', fuelExpiresMs: null, thresholdMs: 7 * 86_400_000 },
    ]);
  });

  it('structureFuelDomain grants access to a Director even with no other roles listed', async () => {
    vi.mocked(loadCorporationId).mockResolvedValue(2);
    vi.mocked(loadCharacterRoles).mockResolvedValue(statusResult(roles(['Director']), false));
    vi.mocked(loadCorporationStructures).mockResolvedValue(statusResult([], false));
    expect(await structureFuelDomain.load(1)).toEqual([]);
  });

  it('corpIndustryJobDomain never calls the endpoint without Factory_Manager (or Director)', async () => {
    vi.mocked(loadCorporationId).mockResolvedValue(2);
    vi.mocked(loadCharacterRoles).mockResolvedValue(statusResult(roles([]), false));
    expect(await corpIndustryJobDomain.load(1)).toBeNull();
    expect(loadCorporationIndustryJobs).not.toHaveBeenCalled();
  });

  it('corpIndustryJobDomain fetches once Factory_Manager is held', async () => {
    vi.mocked(loadCorporationId).mockResolvedValue(2);
    vi.mocked(loadCharacterRoles).mockResolvedValue(
      statusResult(roles(['Factory_Manager']), false)
    );
    vi.mocked(loadCorporationIndustryJobs).mockResolvedValue(statusResult([corpJob()], false));
    expect(await corpIndustryJobDomain.load(1)).toEqual([corpJob()]);
  });

  it('corpRosterDomain never calls the endpoint without Director', async () => {
    vi.mocked(loadCorporationId).mockResolvedValue(2);
    vi.mocked(loadCharacterRoles).mockResolvedValue(
      statusResult(roles(['Station_Manager']), false)
    );
    expect(await corpRosterDomain.load(1)).toBeNull();
    expect(loadCorporationMemberIds).not.toHaveBeenCalled();
  });

  it('corpRosterDomain fetches member ids once Director is held', async () => {
    vi.mocked(loadCorporationId).mockResolvedValue(2);
    vi.mocked(loadCharacterRoles).mockResolvedValue(statusResult(roles(['Director']), false));
    vi.mocked(loadCorporationMemberIds).mockResolvedValue(statusResult([10, 20], false));
    expect(await corpRosterDomain.load(1)).toEqual([10, 20]);
  });

  it('corpWalletDomain never calls the endpoint without Accountant (or Junior_Accountant/Director)', async () => {
    vi.mocked(loadCorporationId).mockResolvedValue(2);
    vi.mocked(loadCharacterRoles).mockResolvedValue(statusResult(roles([]), false));
    expect(await corpWalletDomain.load(1)).toBeNull();
    expect(loadCorporationWallets).not.toHaveBeenCalled();
  });

  it('corpWalletDomain skips the poll rather than persist a truncated master-division journal', async () => {
    vi.mocked(loadCorporationId).mockResolvedValue(2);
    vi.mocked(loadCharacterRoles).mockResolvedValue(statusResult(roles(['Accountant']), false));
    vi.mocked(loadCorporationWallets).mockResolvedValue(
      statusResult([walletDivisionRow({ division: 1 })], false)
    );
    vi.mocked(loadCorporationWalletJournal).mockResolvedValue(statusResult([], true));
    expect(await corpWalletDomain.load(1)).toBeNull();
  });

  it('corpWalletDomain carries every division balance but only the master division journal', async () => {
    vi.mocked(loadCorporationId).mockResolvedValue(2);
    vi.mocked(loadCharacterRoles).mockResolvedValue(statusResult(roles(['Accountant']), false));
    vi.mocked(loadCorporationWallets).mockResolvedValue(
      statusResult(
        [
          walletDivisionRow({ division: 1, balance: 1_000 }),
          walletDivisionRow({ division: 2, balance: 2_000 }),
        ],
        false
      )
    );
    vi.mocked(loadCorporationWalletJournal).mockResolvedValue(
      statusResult([journalEntry({ id: 5, amount: 999 })], false)
    );
    const entries = await corpWalletDomain.load(1);
    expect(entries).toEqual([
      {
        division: 1,
        balance: 1_000,
        journal: [{ id: 5, amount: 999 }],
        balanceFloorIsk: 50_000_000,
        transactionCeilingIsk: 100_000_000,
      },
      {
        division: 2,
        balance: 2_000,
        journal: [],
        balanceFloorIsk: 50_000_000,
        transactionCeilingIsk: 100_000_000,
      },
    ]);
  });
});

describe('priceAlertDomain', () => {
  beforeEach(async () => {
    vi.mocked(getHubPrices).mockReset();
    await db.quickbars.clear();
    useMarketHub.setState({ value: 'jita', hydrated: true });
  });

  it('fetches no prices and loads no entries when nothing in Quickbar has a target', async () => {
    await db.quickbars.put({
      id: '1',
      characterId: 1,
      items: [{ typeId: 34, name: 'Tritanium' }],
      updatedAt: 0,
    });
    expect(await priceAlertDomain.load(1)).toEqual([]);
    expect(getHubPrices).not.toHaveBeenCalled();
  });

  it('loads no entries when the Character has no Quickbar record at all', async () => {
    expect(await priceAlertDomain.load(1)).toEqual([]);
    expect(getHubPrices).not.toHaveBeenCalled();
  });

  it('prices only the Quickbar items carrying a target, at the current hub', async () => {
    await db.quickbars.put({
      id: '1',
      characterId: 1,
      items: [
        { typeId: 34, name: 'Tritanium', targetPrice: 5, targetDirection: 'above' },
        { typeId: 35, name: 'Pyerite' },
      ],
      updatedAt: 0,
    });
    vi.mocked(getHubPrices).mockResolvedValue(
      new Map([[34, { sellMin: 6, buyMax: 4, sellVolume: 1, buyVolume: 1 }]])
    );
    const entries = await priceAlertDomain.load(1);
    expect(entries).toEqual([
      { typeId: 34, name: 'Tritanium', targetPrice: 5, direction: 'above', price: 6 },
    ]);
    expect(getHubPrices).toHaveBeenCalledWith(getTradeHub('jita'), [34]);
  });

  it('carries a null price rather than guessing one, when the hub has no aggregate for the type (AC4)', async () => {
    await db.quickbars.put({
      id: '1',
      characterId: 1,
      items: [{ typeId: 34, name: 'Tritanium', targetPrice: 5, targetDirection: 'above' }],
      updatedAt: 0,
    });
    vi.mocked(getHubPrices).mockResolvedValue(new Map());
    const entries = await priceAlertDomain.load(1);
    expect(entries).toEqual([
      { typeId: 34, name: 'Tritanium', targetPrice: 5, direction: 'above', price: null },
    ]);
  });
});

/**
 * Copy wiring (issue #1249): each domain owns its events' copy and the name
 * lookups it needs. The copy itself is tabled in `domainCopy.test.ts`; these
 * prove the registry routes a fire to the right domain and feeds its lookups
 * through.
 */
describe('copy wiring', () => {
  beforeEach(() => {
    vi.mocked(loadUniverseType).mockReset();
    vi.mocked(loadPlanetName).mockReset();
    vi.mocked(loadTypeNames).mockReset();
    vi.mocked(resolveNames).mockReset();
  });

  it('gives every Notification Event exactly one owning domain', () => {
    for (const eventId of NOTIFICATION_EVENT_IDS) {
      const owners = POLL_DOMAINS.filter((domain) => domain.eventIds.includes(eventId));
      expect(owners, eventId).toHaveLength(1);
      expect(domainForEvent(eventId)).toBe(owners[0]);
    }
  });

  it('refuses an event no domain fires rather than rendering nothing', () => {
    // Every fire the poller renders came from a domain's own diff, so an
    // unowned id is a programmer error, not a stale feed row.
    expect(() => domainForEvent('somethingNewer' as NotificationEventId)).toThrow(
      'no domain fires somethingNewer'
    );
  });

  it('routes a subject for exactly the events whose URL table can use one', () => {
    // A fire of every event, carrying every subject field a diff could set.
    const routed = NOTIFICATION_EVENT_IDS.filter(
      (eventId) =>
        notificationSubjectId({
          eventId,
          characterId: 1,
          typeId: 1,
          journalEntryId: 1,
          contractId: 1,
          jobId: 1,
          memberCharacterId: 1,
        } as never) !== undefined
    );
    expect([...routed].sort()).toEqual([...SUBJECT_ROUTED_EVENT_IDS].sort());
  });

  it('looks up a type name before rendering', async () => {
    vi.mocked(loadUniverseType).mockResolvedValue({
      data: { name: 'Rifter' },
      fetchedAt: new Date(0),
      fromCache: false,
      truncated: false,
    } as Awaited<ReturnType<typeof loadUniverseType>>);
    const copy = await renderNotification(
      {
        eventId: 'industryJobComplete',
        characterId: 1,
        jobId: 5,
        blueprintTypeId: 691,
        productTypeId: 587,
        activityId: 1,
      },
      'Kestrel'
    );
    expect(vi.mocked(loadUniverseType)).toHaveBeenCalledWith(587);
    expect(copy.body).toEqual("Kestrel's industry job for Rifter is complete.");
  });

  it('falls back to the id when a planet name does not resolve', async () => {
    vi.mocked(loadPlanetName).mockResolvedValue(null);
    const copy = await renderNotification(
      { eventId: 'planetaryExtractionDone', characterId: 1, planetId: 7, expiryTimeMs: 1 },
      'Kestrel'
    );
    expect(copy.body).toEqual("Kestrel's extraction on #7 has stopped.");
  });

  it('keeps a market fill when the item name lookup rejects', async () => {
    vi.mocked(loadTypeNames).mockRejectedValue(new Error('offline'));
    const copy = await renderNotification(
      { eventId: 'marketOrderFilled', characterId: 1, orderId: 1, typeId: 35, quantity: 2 },
      'Kestrel'
    );
    expect(copy.body).toEqual('Someone bought 2 x #35 from Kestrel.');
  });

  it("resolves a new member's name", async () => {
    vi.mocked(resolveNames).mockResolvedValue(new Map([[9001, 'New Guy']]));
    const copy = await renderNotification(
      { eventId: 'corpMemberJoined', characterId: 1, memberCharacterId: 9001 },
      'Kestrel'
    );
    expect(copy.body).toEqual('Kestrel: New Guy joined the corporation.');
  });

  it("formats a new calendar event's start in the pilot's clock", async () => {
    const copy = await renderNotification(
      {
        eventId: 'newCalendarEvent',
        characterId: 1,
        calendarEventId: 1,
        startMs: Date.UTC(2026, 8, 25, 19, 0),
        title: 'Fleet Op',
      },
      'Kestrel'
    );
    expect(copy.body).toEqual('Kestrel: Fleet Op was added, starting Sep 25, 7:00 PM.');
  });

  it('renders an event with nothing to look up', async () => {
    const copy = await renderNotification(
      { eventId: 'newMail', characterId: 1, mailId: 1 },
      'Kestrel'
    );
    expect(copy).toEqual({ title: 'New mail', body: 'Kestrel has new mail.' });
  });
});
