import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { piTier } from '@/engine/pi/chain';
import type { PlannerColony, PlanetType } from '@/engine/pi/goalTypes';
import { colonyBudget } from './colonyBudget';
import type { ChainBasis } from './chainEstimateModel';
import type { PlanAdvice } from './planAdviceModel';
import { WHAT_IF_PLANET_ID } from './biggerChainsModel';
import { resetBiggerChains, useBiggerChains, useWhatIfChains } from './useBiggerChains';

const basisStub = { key: 'k', hydrated: true, rules: {}, network: {}, podKillsUnavailable: false };
const jumpsBetween = vi.fn(async () => ({ kind: 'known' as const, jumps: 4 }));
vi.mock('@/features/route/jumpBasis', () => ({
  useJumpBasis: () => basisStub,
  jumpsBetween: (...args: unknown[]) => jumpsBetween(...(args as [])),
}));

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const CONDENSATES = 2344;
const CAMERA_DRONES = 2345; // Gas raws plus two a Lava planet yields.
const GAS_RAWS = [2268, 2309, 2310, 2311];

function colony(planetId: number, planetType: PlanetType, raws: number[]): PlannerColony {
  const cc = colonyBudget(5, pi);
  return {
    planetId,
    planetType,
    budget: cc.budget,
    newLinkCost: { cpu: 25, powergrid: 18 },
    headsPerExtractor: 10,
    taxRate: 0.1,
    ratePerEcu: new Map(
      raws.map((id) => [id, { unitsPerHour: 6000, source: 'measured' as const }])
    ),
    current: { p0TypeIds: [], productTypeIds: [] },
  };
}

function books(): ChainBasis['books'] {
  const book: Record<number, number> = {};
  const byTier: Record<number, number> = { 0: 5, 1: 400, 2: 8_000, 3: 60_000, 4: 1_000_000 };
  for (const raw of pi.raw) book[raw.typeID] = 5;
  for (const key of Object.keys(pi.schematics)) book[Number(key)] = byTier[piTier(Number(key), pi)];
  return { prices: book, revenuePrices: book, salesTaxPct: 4 };
}

const cc = colonyBudget(5, pi);
const advice = {
  chainColonies: [
    colony(1, 'gas', GAS_RAWS),
    colony(2, 'gas', GAS_RAWS),
    colony(3, 'lava', [2267, 2307, 2272, 2306, 2308]),
  ],
  colonies: [
    { planetId: 1, systemId: 30000001 },
    { planetId: 2, systemId: 30000002 },
    { planetId: 3, systemId: 30000002 },
  ],
  slots: { free: 0 },
  chainBasis: {
    ccLevel: cc.level,
    ccAssumed: false,
    budget: cc.budget,
    newLinkCost: { cpu: 25, powergrid: 18 },
    linkCost: 'borrowed',
    headsPerExtractor: 10,
    ratePerHour: 6_000,
    rateSource: 'measured',
    taxRate: 0.1,
    books: books(),
    haulDays: 7,
  },
} as unknown as PlanAdvice;

beforeEach(() => {
  resetBiggerChains();
  jumpsBetween.mockClear();
});

describe('useBiggerChains', () => {
  it('counts the jumps between colony systems, then prices every candidate on them', async () => {
    const { result } = renderHook(() => useBiggerChains(advice, pi));
    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(result.current.pending).toBe(false), { timeout: 5_000 });
    // Two systems: one pair to count.
    expect(jumpsBetween).toHaveBeenCalledTimes(1);
    const condensates = result.current.estimates.get(CONDENSATES);
    const legs = condensates?.colonies?.legs ?? [];
    expect(legs.length).toBeGreaterThan(0);
    // Planets 2 and 3 share a system; 1 is four jumps from both.
    for (const leg of legs) {
      expect(leg.jumps).toBe(leg.from === 1 || leg.to === 1 ? 4 : 0);
    }
    // No free slot: no new-planet layout is priced.
    expect(condensates?.newPlanets).toBeNull();
    expect(result.current.estimates.size).toBe(result.current.candidateCount);
  });

  it('keeps what it priced and counted for the same assumptions', async () => {
    const first = renderHook(() => useBiggerChains(advice, pi));
    await waitFor(() => expect(first.result.current.pending).toBe(false), { timeout: 5_000 });
    first.unmount();
    const again = renderHook(() => useBiggerChains(advice, pi));
    await waitFor(() => expect(again.result.current.pending).toBe(false));
    expect(again.result.current.estimates.get(CONDENSATES)?.colonies).not.toBeNull();
    // Nor counts the jumps again.
    expect(jumpsBetween).toHaveBeenCalledTimes(1);
  });
});

describe('useWhatIfChains', () => {
  const twoGas = {
    ...advice,
    chainColonies: [colony(1, 'gas', GAS_RAWS), colony(2, 'gas', GAS_RAWS)],
    colonies: [
      { planetId: 1, systemId: 30000001 },
      { planetId: 2, systemId: 30000002 },
    ],
    slots: { free: 1 },
  } as unknown as PlanAdvice;
  const LAVA: PlanetType[] = ['lava'];

  it('prices the chains a planet type would add, the new planet with no distance', async () => {
    const { result } = renderHook(() => useWhatIfChains(twoGas, pi, LAVA));
    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(result.current.pending).toBe(false), { timeout: 5_000 });
    const drones = result.current.byType.get('lava')?.get(CAMERA_DRONES)?.colonies;
    expect(drones?.planetIds).toContain(WHAT_IF_PLANET_ID);
    for (const leg of drones?.legs ?? []) {
      const toNew = leg.from === WHAT_IF_PLANET_ID || leg.to === WHAT_IF_PLANET_ID;
      expect(leg.jumps).toBe(toNew ? null : 4);
    }
    // A Bigger chain Gas already makes is not one Lava makes possible.
    expect(result.current.byType.get('lava')?.has(CONDENSATES)).toBe(false);
  });

  it('keeps what it priced: the same type asked again (the other tab) lands at once', async () => {
    const first = renderHook(() => useWhatIfChains(twoGas, pi, LAVA));
    await waitFor(() => expect(first.result.current.pending).toBe(false), { timeout: 5_000 });
    first.unmount();
    const again = renderHook(() => useWhatIfChains(twoGas, pi, LAVA));
    await waitFor(() => expect(again.result.current.pending).toBe(false));
    expect(again.result.current.byType.get('lava')?.get(CAMERA_DRONES)).toBeDefined();
    expect(jumpsBetween).toHaveBeenCalledTimes(1);
  });

  it('reuses the jumps Plan’s own chains counted, mounted beside them', async () => {
    const { result, rerender } = renderHook(
      ({ wanted }: { wanted: PlanetType[] }) => ({
        own: useBiggerChains(twoGas, pi),
        whatIf: useWhatIfChains(twoGas, pi, wanted),
      }),
      { initialProps: { wanted: [] as PlanetType[] } }
    );
    await waitFor(() => expect(result.current.own.pending).toBe(false), { timeout: 5_000 });
    rerender({ wanted: LAVA });
    await waitFor(() => expect(result.current.whatIf.pending).toBe(false), { timeout: 5_000 });
    expect(jumpsBetween).toHaveBeenCalledTimes(1);
  });

  it('counts no route and prices nothing while asked for no type', async () => {
    const { result } = renderHook(() => useWhatIfChains(twoGas, pi, []));
    expect(result.current).toEqual({ byType: new Map(), pending: false });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(jumpsBetween).not.toHaveBeenCalled();
  });
});
