import { describe, it, expect, vi, beforeEach } from 'vitest';
import { create } from 'zustand';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import { ZERO_STANDINGS, type ResolvedStandings } from '@/engine/market/standings';
import { getTradeHub, type TradeHub } from '@/market/hubs';
import { loadPublicBpcContracts } from '@/features/bpcContracts/syncedContracts';
import {
  useTradeHubStandings,
  type TradeHubStandingsMap,
} from '@/features/market/useTradeHubStandings';
import type { CachedResult } from '@/esi/cache';
import { useAssumedMe } from './assumedMe';
import { useIncludeBlueprintCost } from './includeBlueprintCost';
import type { CorpOwnedBlueprintsState } from './corpOwnedBlueprints';
import {
  hydratedPricingInputs,
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
vi.mock('./includeBlueprintCost', () => ({
  useIncludeBlueprintCost: create(() => ({ value: true, hydrated: false, hydrate: vi.fn() })),
}));
const CORP: CorpOwnedBlueprintsState = { blueprints: [], available: true, incomplete: false };
vi.mock('./corpOwnedBlueprints', () => ({ useCorpOwnedBlueprints: () => CORP }));

const mockedAssumedMe = vi.mocked(useAssumedMe);
const mockedIncludeBlueprintCost = vi.mocked(useIncludeBlueprintCost);
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
    includeBlueprintCost: true,
    corpBlueprints: CORP,
    standings: new Map(),
    bpcRows: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockedAssumedMe.setState({ value: 0, hydrated: false, hydrate: vi.fn() });
  mockedIncludeBlueprintCost.setState({ value: true, hydrated: false, hydrate: vi.fn() });
  mockedBpcContracts.mockReset();
  mockedBpcContracts.mockResolvedValue(null);
  mockedStandings.mockReset();
  mockedStandings.mockImplementation(
    (characterId) => STANDINGS_BY_CHARACTER.get(characterId ?? -1) ?? new Map()
  );
});

describe('useBuildPlanPricingInputs', () => {
  it('hydrates both pricing settings itself', () => {
    const hydrateMe = vi.fn();
    const hydrateCost = vi.fn();
    mockedAssumedMe.setState({ hydrate: hydrateMe });
    mockedIncludeBlueprintCost.setState({ hydrate: hydrateCost });
    renderHook(() => useBuildPlanPricingInputs(1));
    expect(hydrateMe).toHaveBeenCalled();
    expect(hydrateCost).toHaveBeenCalled();
  });

  it('gives no inputs through the hydration gate until both settings hydrate', () => {
    const { result } = renderHook(() => useBuildPlanPricingInputs(1));
    expect(hydratedPricingInputs(result.current)).toBeNull();

    act(() => mockedAssumedMe.setState({ value: 4, hydrated: true }));
    expect(hydratedPricingInputs(result.current)).toBeNull();

    act(() => mockedIncludeBlueprintCost.setState({ value: false, hydrated: true }));
    expect(hydratedPricingInputs(result.current)).toMatchObject({
      hydrated: true,
      assumedMe: 4,
      includeBlueprintCost: false,
    });
  });

  it('still reports the current (default) values before hydration, for readers that do not wait', () => {
    const { result } = renderHook(() => useBuildPlanPricingInputs(1));
    expect(result.current).toMatchObject({
      hydrated: false,
      assumedMe: 0,
      includeBlueprintCost: true,
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
    mockedBpcContracts.mockImplementation((characterId) =>
      Promise.resolve(snapshotOf(characterId === 1 ? rowsFor1 : rowsFor2))
    );

    const { result, rerender } = renderHook(
      ({ characterId }) => useBuildPlanPricingInputs(characterId),
      { initialProps: { characterId: 1 } }
    );
    await waitFor(() => expect(result.current.bpcRows).toBe(rowsFor1));
    expect(result.current.standings.get('jita')).toBe(JITA_STANDING);
    expect(mockedBpcContracts).toHaveBeenCalledWith(1);

    rerender({ characterId: 2 });
    await waitFor(() => expect(result.current.bpcRows).toBe(rowsFor2));
    expect(result.current.standings.get('amarr')).toBe(AMARR_STANDING);
    expect(result.current.standings.has('jita')).toBe(false);
    expect(mockedBpcContracts).toHaveBeenLastCalledWith(2);
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

  it('hands back the same offer lookup for the same rows and region, so a memo keyed on it does not re-run', () => {
    const bpcRows = [row({ typeId: 10, regionId: JITA.regionId })];
    const a = pricingSourcesForHub(inputs({ bpcRows }), JITA).bpcOffersFor;
    const b = pricingSourcesForHub(inputs({ bpcRows }), JITA).bpcOffersFor;
    expect(b).toBe(a);
  });

  it('passes the settings and corp blueprints through unchanged', () => {
    const sources = pricingSourcesForHub(
      inputs({ assumedMe: 7, includeBlueprintCost: false }),
      JITA
    );
    expect(sources).toMatchObject({
      assumedMe: 7,
      includeBlueprintCost: false,
      corpBlueprints: CORP,
    });
  });
});

describe('loadBpcContractRows', () => {
  it("returns the snapshot's rows", async () => {
    const rows = [row({ typeId: 10, regionId: JITA.regionId })];
    mockedBpcContracts.mockResolvedValue(snapshotOf(rows));
    await expect(loadBpcContractRows(1)).resolves.toBe(rows);
  });

  it('returns null when there is no snapshot or the load fails', async () => {
    mockedBpcContracts.mockResolvedValue(null);
    await expect(loadBpcContractRows(1)).resolves.toBeNull();
    mockedBpcContracts.mockRejectedValue(new Error('offline'));
    await expect(loadBpcContractRows(1)).resolves.toBeNull();
  });
});
