import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { BpcContractRow, BpcSearchRow } from '@/engine/contracts/bpcSearch';
import { ZERO_STANDINGS, type ResolvedStandings } from '@/engine/market/standings';
import { getTradeHub, type TradeHub } from '@/market/hubs';
import { loadPublicBpcContracts } from '@/features/bpcContracts/syncedContracts';
import {
  useTradeHubStandings,
  type TradeHubStandingsMap,
} from '@/features/market/useTradeHubStandings';
import type { CachedResult } from '@/esi/cache';
import { useAssumedMe } from './assumedMe';
import type { CorpOwnedBlueprintsState } from './corpOwnedBlueprints';
import {
  communityOffersForRows,
  isPricingReady,
  loadBpcContractRows,
  pricingSourcesForHub,
  useBuildPlanPricingInputs,
  type BuildPlanPricingInputs,
} from './buildPlanPricingInputs';

vi.mock('@/features/bpcContracts/syncedContracts', () => ({
  loadPublicBpcContracts: vi.fn(),
}));
vi.mock('@/features/market/useTradeHubStandings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/market/useTradeHubStandings')>()),
  useTradeHubStandings: vi.fn(),
}));
// Controllable stand-ins for the real synced-setting stores, so hydration can
// be flipped deterministically instead of racing a real Dexie read.
vi.mock('./assumedMe', () => ({
  useAssumedMe: create(() => ({ value: 0, hydrated: false, hydrate: vi.fn() })),
}));
const CORP: CorpOwnedBlueprintsState = { blueprints: [], available: true, incomplete: false };
vi.mock('./corpOwnedBlueprints', () => ({ useCorpOwnedBlueprints: () => CORP }));

const mockedAssumedMe = vi.mocked(useAssumedMe);
const mockedBpcContracts = vi.mocked(loadPublicBpcContracts);
const mockedStandings = vi.mocked(useTradeHubStandings);

const JITA = getTradeHub('jita')!;
const AMARR = getTradeHub('amarr')!;

function row(
  overrides: Partial<BpcContractRow> & { typeId: number; regionId: number }
): BpcContractRow {
  return {
    contractId: 1,
    locationId: 60003760,
    price: 1_000_000,
    isAuction: false,
    me: 10,
    te: 20,
    runs: 5,
    quantity: 1,
    dateExpired: 0,
    isMultiType: false,
    ...overrides,
  };
}

function snapshotOf(rows: BpcContractRow[]) {
  return { data: { rows } } as unknown as CachedResult<never>;
}

const JITA_STANDING: ResolvedStandings = { factionStanding: 5, corpStanding: 2 };
const AMARR_STANDING: ResolvedStandings = { factionStanding: -1, corpStanding: 3 };
const STANDINGS_BY_CHARACTER = new Map<number, TradeHubStandingsMap>([
  [1, new Map([['jita', JITA_STANDING]])],
  [2, new Map([['amarr', AMARR_STANDING]])],
]);

function inputs(overrides: Partial<BuildPlanPricingInputs> = {}): BuildPlanPricingInputs {
  return {
    hydrated: true,
    assumedMe: 0,
    corpBlueprints: CORP,
    standings: new Map(),
    bpcRows: [],
    communityRows: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockedAssumedMe.setState({ value: 0, hydrated: false, hydrate: vi.fn() });
  mockedBpcContracts.mockReset();
  mockedBpcContracts.mockResolvedValue(null);
  mockedStandings.mockReset();
  mockedStandings.mockImplementation(
    (characterId) => STANDINGS_BY_CHARACTER.get(characterId ?? -1) ?? new Map()
  );
});

describe('useBuildPlanPricingInputs', () => {
  it('hydrates the pricing settings itself', () => {
    const hydrateMe = vi.fn();
    mockedAssumedMe.setState({ hydrate: hydrateMe });
    renderHook(() => useBuildPlanPricingInputs(1));
    expect(hydrateMe).toHaveBeenCalled();
  });

  it('is not ready to price until the settings hydrate, then carries their values', () => {
    const { result } = renderHook(() => useBuildPlanPricingInputs(1));
    expect(isPricingReady(result.current)).toBe(false);

    act(() => mockedAssumedMe.setState({ value: 4, hydrated: true }));
    expect(isPricingReady(result.current)).toBe(true);
    expect(result.current).toMatchObject({ assumedMe: 4 });
  });

  it('still reports the current (default) values before hydration, for readers that do not wait', () => {
    const { result } = renderHook(() => useBuildPlanPricingInputs(1));
    expect(result.current).toMatchObject({
      hydrated: false,
      assumedMe: 0,
    });
  });

  it("carries the active Character's corp blueprints", () => {
    const { result } = renderHook(() => useBuildPlanPricingInputs(1));
    expect(result.current.corpBlueprints).toBe(CORP);
  });

  it('keeps one object per distinct state, not per render', () => {
    const { result, rerender } = renderHook(() => useBuildPlanPricingInputs(1));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("loads the Character's standings and BPC Sourcing rows, and reloads both on a Character switch", async () => {
    const rowsFor1 = [row({ typeId: 10, regionId: JITA.regionId })];
    const rowsFor2 = [row({ typeId: 20, regionId: AMARR.regionId })];
    // One shared public snapshot, re-read on the switch (it may have republished).
    mockedBpcContracts
      .mockResolvedValueOnce(snapshotOf(rowsFor1))
      .mockResolvedValueOnce(snapshotOf(rowsFor2));

    const { result, rerender } = renderHook(
      ({ characterId }) => useBuildPlanPricingInputs(characterId),
      { initialProps: { characterId: 1 } }
    );
    await waitFor(() => expect(result.current.bpcRows).toBe(rowsFor1));
    expect(result.current.standings.get('jita')).toBe(JITA_STANDING);

    rerender({ characterId: 2 });
    await waitFor(() => expect(result.current.bpcRows).toBe(rowsFor2));
    expect(result.current.standings.get('amarr')).toBe(AMARR_STANDING);
    expect(result.current.standings.has('jita')).toBe(false);
    expect(mockedBpcContracts).toHaveBeenCalledTimes(2);
  });

  it('loads no BPC Sourcing rows with no Character', () => {
    const { result } = renderHook(() => useBuildPlanPricingInputs(null));
    expect(result.current.bpcRows).toEqual([]);
    expect(mockedBpcContracts).not.toHaveBeenCalled();
  });

  it('degrades to no BPC Sourcing rows when BPC Sourcing has no snapshot', async () => {
    mockedBpcContracts.mockResolvedValue(null);
    const { result } = renderHook(() => useBuildPlanPricingInputs(1));
    await waitFor(() => expect(mockedBpcContracts).toHaveBeenCalled());
    expect(result.current.bpcRows).toEqual([]);
  });
});

describe('pricingSourcesForHub', () => {
  it("resolves the standing toward each plan's own Trade Hub", () => {
    const standings = new Map([
      ['jita', JITA_STANDING],
      ['amarr', AMARR_STANDING],
    ] as const);
    expect(pricingSourcesForHub(inputs({ standings }), JITA).standing).toBe(JITA_STANDING);
    expect(pricingSourcesForHub(inputs({ standings }), AMARR).standing).toBe(AMARR_STANDING);
  });

  it('treats a hub with no resolved standing as zero standings', () => {
    const hek: TradeHub = getTradeHub('hek')!;
    expect(pricingSourcesForHub(inputs(), hek).standing).toBe(ZERO_STANDINGS);
  });

  it("narrows BPC Sourcing offers to the plan's own Trade Hub region", () => {
    const bpcRows = [
      row({ typeId: 10, regionId: JITA.regionId, price: 100, me: 8 }),
      row({ typeId: 10, regionId: AMARR.regionId, price: 50, me: 9 }),
    ];
    const jita = pricingSourcesForHub(inputs({ bpcRows }), JITA).bpcOffersFor;
    const amarr = pricingSourcesForHub(inputs({ bpcRows }), AMARR).bpcOffersFor;
    expect(jita(10)).toEqual([expect.objectContaining({ price: 100, me: 8 })]);
    expect(amarr(10)).toEqual([expect.objectContaining({ price: 50, me: 9 })]);
    expect(jita(99)).toEqual([]);
  });

  it('never prices from an auction or a PLEX barter — neither has an ask a buyer can just pay', () => {
    const bpcRows = [
      row({ typeId: 10, regionId: JITA.regionId, price: 10, isAuction: true, buyout: 20 }),
      row({ typeId: 10, regionId: JITA.regionId, price: 30, requestedPlex: 5 }),
      row({ typeId: 10, regionId: JITA.regionId, price: 40 }),
    ];
    expect(pricingSourcesForHub(inputs({ bpcRows }), JITA).bpcOffersFor(10)).toEqual([
      expect.objectContaining({ price: 40 }),
    ]);
  });

  it("offers every other region's listings as the last resort, never the plan's own", () => {
    const bpcRows = [
      row({ typeId: 10, regionId: JITA.regionId, price: 100 }),
      row({ typeId: 10, regionId: AMARR.regionId, price: 50 }),
    ];
    const sources = pricingSourcesForHub(inputs({ bpcRows }), JITA);
    expect(sources.bpcLastResortOffersFor?.(10)).toEqual([expect.objectContaining({ price: 50 })]);
  });

  it('hands back the same offer lookup for the same rows and region, so a memo keyed on it does not re-run', () => {
    const bpcRows = [row({ typeId: 10, regionId: JITA.regionId })];
    const a = pricingSourcesForHub(inputs({ bpcRows }), JITA).bpcOffersFor;
    const b = pricingSourcesForHub(inputs({ bpcRows }), JITA).bpcOffersFor;
    expect(b).toBe(a);
  });

  it('passes the settings and corp blueprints through unchanged', () => {
    const sources = pricingSourcesForHub(inputs({ assumedMe: 7 }), JITA);
    expect(sources).toMatchObject({ assumedMe: 7, corpBlueprints: CORP });
  });
});

describe('loadBpcContractRows', () => {
  it('folds contract originals in beside the copies', async () => {
    const copies = [row({ typeId: 10, regionId: JITA.regionId })];
    const originals = [row({ typeId: 10, regionId: JITA.regionId, runs: -1 })];
    mockedBpcContracts.mockResolvedValue({
      data: { rows: copies, originals },
    } as unknown as CachedResult<never>);
    await expect(loadBpcContractRows()).resolves.toEqual([...copies, ...originals]);
  });

  it("returns the snapshot's rows", async () => {
    const rows = [row({ typeId: 10, regionId: JITA.regionId })];
    mockedBpcContracts.mockResolvedValue(snapshotOf(rows));
    await expect(loadBpcContractRows()).resolves.toBe(rows);
  });

  it('returns null when there is no snapshot or the load fails', async () => {
    mockedBpcContracts.mockResolvedValue(null);
    await expect(loadBpcContractRows()).resolves.toBeNull();
    mockedBpcContracts.mockRejectedValue(new Error('offline'));
    await expect(loadBpcContractRows()).resolves.toBeNull();
  });
});

describe('communityOffersForRows', () => {
  const row = (overrides: Record<string, unknown>) =>
    ({
      source: 'community',
      typeId: 100,
      me: 10,
      te: 20,
      runs: -1,
      quantity: 1,
      price: 0,
      memberUid: 'u1',
      memberName: 'Alice',
      stale: false,
      asOf: 1,
      locationName: 'Jita IV',
      systemName: 'Jita',
      regionId: null,
      space: null,
      systemId: null,
      ...overrides,
    }) as BpcSearchRow;

  it('maps Shared Blueprints to free offers named for the Member, by type', () => {
    const lookup = communityOffersForRows([row({}), row({ typeId: 200, stale: true })]);
    expect(lookup(100)).toEqual([
      {
        me: 10,
        te: 20,
        runs: -1,
        quantity: 1,
        price: 0,
        community: { memberName: 'Alice', stale: false },
      },
    ]);
    expect(lookup(200)[0]!.community).toEqual({ memberName: 'Alice', stale: true });
    expect(lookup(300)).toEqual([]);
  });

  it('returns the same lookup for the same rows', () => {
    const rows = [row({})];
    expect(communityOffersForRows(rows)).toBe(communityOffersForRows(rows));
  });
});
