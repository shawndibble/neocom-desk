import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { TradeHub } from '@/market/hubs';
import type { BlueprintCatalog } from './blueprintCatalog';
import { DEFAULT_ACTIVITY_FACILITY_DEFAULTS } from './facilityDefaults';
import type { OpportunityCandidate, OpportunityRow } from './opportunities';
import type { UseOpportunitiesArgs } from './useOpportunities';

// The hook is the seam (issue #4918): `OpportunitiesPanel.test.tsx` mocks it
// wholesale, so only a hook test sees what a recompute does to the rows.
const loadMarketSnapshots = vi.fn();
vi.mock('./marketData', () => ({
  loadMarketSnapshots: (requests: unknown[]) => loadMarketSnapshots(requests),
}));
vi.mock('./recipes', () => ({ recipeForLookup: () => () => null }));
vi.mock('./opportunities', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./opportunities')>();
  return {
    ...actual,
    opportunitySnapshotRequest: () => ({}),
    detectOpportunityStock: () => new Map(),
    computeOpportunityRow: (candidate: OpportunityCandidate, ...rest: unknown[]) =>
      ({ candidate, hub: rest[6] }) as unknown as OpportunityRow,
    rankOpportunityRows: (rows: OpportunityRow[]) => [...rows],
  };
});

const { useOpportunities } = await import('./useOpportunities');

const HUB = { id: 'jita' } as unknown as TradeHub;
const hubForCharacter = () => HUB;
const CATALOG = {} as BlueprintCatalog;
const FACILITY_DEFAULTS = DEFAULT_ACTIVITY_FACILITY_DEFAULTS;
const STOCK = { sources: [] } as unknown as UseOpportunitiesArgs['ownedStockSnapshot'];

function candidate(itemId: number): OpportunityCandidate {
  return { id: `1:${itemId}`, characterId: 1 } as unknown as OpportunityCandidate;
}

function argsWith(overrides: Partial<UseOpportunitiesArgs> = {}): UseOpportunitiesArgs {
  return {
    candidates: [candidate(10), candidate(11)],
    catalog: CATALOG,
    pi: null,
    hubForCharacter,
    defaultsForCharacter: () => null,
    facilityDefaults: FACILITY_DEFAULTS,
    modifiersByCharacter: new Map(),
    standingsByCharacter: new Map(),
    ownedStockSnapshot: STOCK,
    ownedByCharacter: new Map(),
    assumedMe: 10,
    ...overrides,
  };
}

const ids = (rows: readonly OpportunityRow[]) => rows.map((row) => row.candidate.id);

describe('useOpportunities recompute (issue #4918)', () => {
  beforeEach(() => {
    loadMarketSnapshots.mockReset();
    loadMarketSnapshots.mockImplementation((requests: unknown[]) =>
      requests.map(() => Promise.resolve({}))
    );
  });

  it('keeps the settled rows on screen while a late recompute of the same blueprints runs', async () => {
    const { result, rerender } = renderHook(
      (args: UseOpportunitiesArgs) => useOpportunities(args),
      {
        initialProps: argsWith(),
      }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(ids(result.current.rows)).toEqual(['1:10', '1:11']);

    // Character modifiers settle late: same contents, a new Map, so the
    // recompute starts. Its prices are held until the test releases them.
    let release!: () => void;
    loadMarketSnapshots.mockImplementation((requests: unknown[]) =>
      requests.map(() => new Promise((resolve) => (release = () => resolve({}))))
    );
    rerender(argsWith({ modifiersByCharacter: new Map() }));

    expect(result.current.loading).toBe(true);
    expect(ids(result.current.rows)).toEqual(['1:10', '1:11']);

    await act(async () => release());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(ids(result.current.rows)).toEqual(['1:10', '1:11']);
  });

  it("does not show another batch's rows while a different set of blueprints prices", async () => {
    const { result, rerender } = renderHook(
      (args: UseOpportunitiesArgs) => useOpportunities(args),
      {
        initialProps: argsWith(),
      }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    loadMarketSnapshots.mockImplementation((requests: unknown[]) =>
      requests.map(() => new Promise(() => {}))
    );
    rerender(argsWith({ candidates: [candidate(12)] }));

    expect(result.current.loading).toBe(true);
    expect(result.current.rows).toEqual([]);
  });

  it('does not reprice when the latest-plan lookup is rebuilt but nothing a row reads changed', async () => {
    // The same inputs throughout but the lookup: each `argsWith` builds fresh Maps.
    const args = argsWith();
    const { result, rerender } = renderHook(
      (props: UseOpportunitiesArgs) => useOpportunities(props),
      { initialProps: args }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const requests = loadMarketSnapshots.mock.calls.length;

    // Any plan write rebuilds the lookup; a rename moves no price.
    rerender({ ...args, defaultsForCharacter: () => null });
    await act(async () => {});
    expect(loadMarketSnapshots).toHaveBeenCalledTimes(requests);
  });

  it('reprices when a row-relevant setting of the latest plan changes', async () => {
    const plan = (materialPriceBasis: 'sell' | 'buy') =>
      ({
        hubId: 'jita',
        materialPriceBasis,
        facility: 'npcStation',
        security: 'highsec',
      }) as unknown as ReturnType<UseOpportunitiesArgs['defaultsForCharacter']>;
    const args = argsWith({ defaultsForCharacter: () => plan('sell') });
    const { result, rerender } = renderHook(
      (props: UseOpportunitiesArgs) => useOpportunities(props),
      { initialProps: args }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const requests = loadMarketSnapshots.mock.calls.length;

    rerender({ ...args, defaultsForCharacter: () => plan('buy') });
    await waitFor(() => expect(loadMarketSnapshots.mock.calls.length).toBeGreaterThan(requests));
  });
});
