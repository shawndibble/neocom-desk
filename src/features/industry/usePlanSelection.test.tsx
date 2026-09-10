import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { db, type BuildPlanRecord } from '@/db';
import { useLastOpenedPlan } from '@/features/industry/lastOpenedPlan';
import type { BlueprintCatalog, BlueprintCatalogEntry } from '@/features/industry/blueprintCatalog';
import { usePlanSelection } from './usePlanSelection';

const CHAR_ID = 91;

function entry(overrides: Partial<BlueprintCatalogEntry> = {}): BlueprintCatalogEntry {
  return {
    blueprintTypeID: 638,
    blueprint: {
      name: 'Rifter Blueprint',
      time: 1200,
      materials: [{ typeID: 34, quantity: 100 }],
      products: [{ typeID: 587, quantity: 1 }],
      skills: [],
      activity: 'manufacturing',
    },
    productTypeID: 587,
    productName: 'Rifter',
    productNameLower: 'rifter',
    ...overrides,
  };
}

function catalog(entries: BlueprintCatalogEntry[]): BlueprintCatalog {
  const byBlueprintTypeID = new Map(entries.map((e) => [e.blueprintTypeID, e]));
  const byProductTypeID = new Map<number, BlueprintCatalogEntry>();
  for (const e of entries) {
    if (e.productTypeID !== null && !byProductTypeID.has(e.productTypeID)) {
      byProductTypeID.set(e.productTypeID, e);
    }
  }
  return { entries, byBlueprintTypeID, byProductTypeID, typesById: {} };
}

function plan(overrides: Partial<BuildPlanRecord> = {}): BuildPlanRecord {
  return {
    id: 'bp-1',
    characterId: CHAR_ID,
    name: 'Rifter run',
    blueprintTypeID: 638,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: 1,
    ...overrides,
  };
}

function wrapperAt(path: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
  };
}

beforeEach(async () => {
  await db.buildPlans.clear();
  useLastOpenedPlan.setState({ value: {}, hydrated: false });
});

describe('usePlanSelection: ?product= deep link', () => {
  it('creates a plan for a product with no existing plan, selects it, then clears the param', async () => {
    const rifter = entry();
    // Computed once, outside the render callback: `usePlanSelection`'s
    // create-if-missing effect depends on `catalog`'s identity (matching the
    // real component, where `catalog` is stable `useState`), so a fresh
    // object every render here would re-fire the effect and double-create.
    const cat = catalog([rifter]);
    const createPlan = vi.fn(async () => 'new-plan-id');
    const { result, rerender } = renderHook(
      (props: { plans: readonly BuildPlanRecord[] | undefined }) =>
        usePlanSelection({
          plans: props.plans,
          catalog: cat,
          activeCharacterId: CHAR_ID,
          createPlan,
        }),
      {
        wrapper: wrapperAt('/industry?product=587'),
        initialProps: { plans: [] as readonly BuildPlanRecord[] },
      }
    );

    await waitFor(() => expect(createPlan).toHaveBeenCalledTimes(1));
    expect(createPlan).toHaveBeenCalledWith(rifter, null);

    // The route's own `plans` (Dexie live query) catches up once the write lands.
    rerender({ plans: [plan({ id: 'new-plan-id' })] });

    await waitFor(() =>
      expect(result.current.selection).toEqual({ kind: 'plan', planId: 'new-plan-id' })
    );
    expect(createPlan).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing plan for that blueprint rather than creating a duplicate', async () => {
    const cat = catalog([entry()]);
    const createPlan = vi.fn(async () => 'unused');
    const existing = plan({ id: 'existing-plan' });
    const { result } = renderHook(
      () =>
        usePlanSelection({
          plans: [existing],
          catalog: cat,
          activeCharacterId: CHAR_ID,
          createPlan,
        }),
      { wrapper: wrapperAt('/industry?product=587') }
    );

    await waitFor(() =>
      expect(result.current.selection).toEqual({ kind: 'plan', planId: 'existing-plan' })
    );
    expect(createPlan).not.toHaveBeenCalled();
  });
});

describe('usePlanSelection: seeded ?product= (BPC Sourcing Offer, issue #637)', () => {
  it('reuses a plan whose ME/TE/runs already match the seed', async () => {
    const cat = catalog([entry()]);
    const createPlan = vi.fn(async () => 'unused');
    const seeded = plan({ id: 'seeded-plan', me: 10, te: 20, runs: 5 });
    const { result } = renderHook(
      () =>
        usePlanSelection({
          plans: [seeded],
          catalog: cat,
          activeCharacterId: CHAR_ID,
          createPlan,
        }),
      { wrapper: wrapperAt('/industry?product=587&me=10&te=20&runs=5') }
    );

    await waitFor(() =>
      expect(result.current.selection).toEqual({ kind: 'plan', planId: 'seeded-plan' })
    );
    expect(createPlan).not.toHaveBeenCalled();
  });

  it('creates a seeded plan beside an existing plan at different research, not instead of it', async () => {
    const rifter = entry();
    const cat = catalog([rifter]);
    const createPlan = vi.fn(async () => 'new-seeded-plan');
    const unseeded = plan({ id: 'plain-plan', me: 0, te: 0 });
    const { result, rerender } = renderHook(
      (props: { plans: readonly BuildPlanRecord[] }) =>
        usePlanSelection({
          plans: props.plans,
          catalog: cat,
          activeCharacterId: CHAR_ID,
          createPlan,
        }),
      {
        wrapper: wrapperAt('/industry?product=587&me=10&te=20&runs=5'),
        initialProps: { plans: [unseeded] },
      }
    );

    await waitFor(() => expect(createPlan).toHaveBeenCalledTimes(1));
    expect(createPlan).toHaveBeenCalledWith(rifter, { me: 10, te: 20, runs: 5 });

    rerender({ plans: [unseeded, plan({ id: 'new-seeded-plan', me: 10, te: 20, runs: 5 })] });

    await waitFor(() =>
      expect(result.current.selection).toEqual({ kind: 'plan', planId: 'new-seeded-plan' })
    );
  });
});

describe('usePlanSelection: ?material= deep link (Assets "View in Industry", issue #414)', () => {
  it("selects the character's existing plan whose blueprint consumes the material", async () => {
    const cat = catalog([entry()]);
    const createPlan = vi.fn(async () => 'unused');
    const existing = plan({ id: 'existing-plan' });
    const { result } = renderHook(
      () =>
        usePlanSelection({
          plans: [existing],
          catalog: cat,
          activeCharacterId: CHAR_ID,
          createPlan,
        }),
      { wrapper: wrapperAt('/industry?material=34') }
    );

    await waitFor(() =>
      expect(result.current.selection).toEqual({ kind: 'plan', planId: 'existing-plan' })
    );
    expect(createPlan).not.toHaveBeenCalled();
  });

  it('selects nothing and never creates when no plan consumes that material', async () => {
    const cat = catalog([entry()]);
    const createPlan = vi.fn(async () => 'unused');
    const existing = plan({ id: 'existing-plan' });
    const { result } = renderHook(
      () =>
        usePlanSelection({
          plans: [existing],
          catalog: cat,
          activeCharacterId: CHAR_ID,
          createPlan,
        }),
      // typeID 999 is not one of the Rifter blueprint's materials.
      { wrapper: wrapperAt('/industry?material=999') }
    );

    await waitFor(() => expect(result.current.selection).toEqual({ kind: 'none' }));
    expect(createPlan).not.toHaveBeenCalled();
  });
});

describe('usePlanSelection: reopening the last-opened plan', () => {
  it('falls back to the remembered plan, then to the first plan once hydrated', async () => {
    const createPlan = vi.fn(async () => 'unused');
    const first = plan({ id: 'plan-a', updatedAt: 1 });
    const second = plan({ id: 'plan-b', updatedAt: 2 });

    const { result } = renderHook(
      () =>
        usePlanSelection({
          plans: [first, second],
          catalog: catalog([]),
          activeCharacterId: CHAR_ID,
          createPlan,
        }),
      { wrapper: wrapperAt('/industry') }
    );

    // Before hydration settles, nothing is picked yet.
    expect(result.current.effectiveSelectedId).toBeNull();

    // Through `setValue`, not a raw `setState`: the hook's own mount-time
    // `hydrate()` is already in flight reading the (empty) Dexie row, and
    // `setValue` bumps the store's internal generation counter so that read
    // is discarded instead of landing after this and reverting it.
    await act(async () => {
      await useLastOpenedPlan.getState().setValue({ [CHAR_ID]: 'plan-b' });
    });

    await waitFor(() => expect(result.current.effectiveSelectedId).toBe('plan-b'));
  });

  it('falls back to the first plan when the remembered one is gone', async () => {
    const createPlan = vi.fn(async () => 'unused');
    const first = plan({ id: 'plan-a', updatedAt: 1 });

    const { result } = renderHook(
      () =>
        usePlanSelection({
          plans: [first],
          catalog: catalog([]),
          activeCharacterId: CHAR_ID,
          createPlan,
        }),
      { wrapper: wrapperAt('/industry') }
    );

    await act(async () => {
      await useLastOpenedPlan.getState().setValue({ [CHAR_ID]: 'deleted-plan' });
    });

    await waitFor(() => expect(result.current.effectiveSelectedId).toBe('plan-a'));
  });

  it('does not fall back to a first plan while a group is open', async () => {
    const createPlan = vi.fn(async () => 'unused');
    const first = plan({ id: 'plan-a', updatedAt: 1 });

    const { result } = renderHook(
      () =>
        usePlanSelection({
          plans: [first],
          catalog: catalog([]),
          activeCharacterId: CHAR_ID,
          createPlan,
        }),
      { wrapper: wrapperAt('/industry') }
    );

    await act(async () => {
      await useLastOpenedPlan.getState().setValue({});
    });
    await waitFor(() => expect(result.current.effectiveSelectedId).toBe('plan-a'));

    act(() => result.current.openGroup('group-1'));

    expect(result.current.selectedGroupId).toBe('group-1');
    expect(result.current.effectiveSelectedId).toBeNull();
  });
});

describe('usePlanSelection: selection actions', () => {
  const createPlan = vi.fn(async () => 'unused');
  function setup(plans: readonly BuildPlanRecord[] = []) {
    return renderHook(
      () =>
        usePlanSelection({
          plans,
          catalog: catalog([]),
          activeCharacterId: CHAR_ID,
          createPlan,
        }),
      { wrapper: wrapperAt('/industry') }
    );
  }

  it('selectPlan/openGroup/openCompare set the corresponding selection, and close clears it', () => {
    const { result } = setup();

    act(() => result.current.selectPlan('plan-x'));
    expect(result.current.selection).toEqual({ kind: 'plan', planId: 'plan-x' });

    act(() => result.current.openGroup('group-x'));
    expect(result.current.selection).toEqual({ kind: 'group', groupId: 'group-x' });
    expect(result.current.selectedGroupId).toBe('group-x');

    act(() => result.current.openCompare());
    expect(result.current.selection).toEqual({ kind: 'compare' });
    expect(result.current.comparing).toBe(true);

    act(() => result.current.close());
    expect(result.current.selection).toEqual({ kind: 'none' });
  });

  it('closeIfComparing only clears an open Compare table, leaving any other selection alone', () => {
    const { result } = setup();

    act(() => result.current.selectPlan('plan-x'));
    act(() => result.current.closeIfComparing());
    expect(result.current.selection).toEqual({ kind: 'plan', planId: 'plan-x' });

    act(() => result.current.openCompare());
    act(() => result.current.closeIfComparing());
    expect(result.current.selection).toEqual({ kind: 'none' });
  });
});
