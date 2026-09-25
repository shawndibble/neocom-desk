import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { encodeFittingShare } from '@/engine/fitting/fittingShare';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import { addModule, removeModule, setDroneCounts } from '@/engine/fittings/fittingEdit';
import type { Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';
import { useFittingWorkspace } from './useFittingWorkspace';

const TYPES: Record<string, { name: string; groupID: number; volume: number }> = {
  '587': { name: 'Rifter', groupID: 25, volume: 0 },
  '2454': { name: 'Hobgoblin I', groupID: 87, volume: 5 },
};
vi.mock('@/sde/loadSde', () => ({
  loadTypes: async () => TYPES,
  typeName: async (typeId: number) => TYPES[String(typeId)]?.name ?? `Type ${typeId}`,
  loadSkills: async () => [],
  loadFittingSlots: async () => ({}),
}));
vi.mock('@/sync', () => ({ scheduleSync: vi.fn(), markFittingDeleted: vi.fn() }));
vi.mock('./fittingPrice', () => ({ loadFittingPrice: async () => null }));
const computeFittingStats = vi.fn<
  (fitting: Fitting, profile?: PilotProfile) => Promise<Pick<FittingStats, 'modules'>>
>(async (fitting) => ({
  modules: fitting.modules.map(() => ({ state: 'online', maxState: 'online', chargeGroupIds: [] })),
}));
vi.mock('./dogmaFittingEngine', () => ({
  isDogmaEngineReady: () => false,
  computeFittingStats: (fitting: Fitting, profile: PilotProfile) =>
    computeFittingStats(fitting, profile) as unknown as Promise<FittingStats>,
}));

const RIFTER: Fitting = {
  name: 'Rifter',
  shipTypeId: 587,
  modules: [{ slot: 'high', slotIndex: 0, typeId: 2889, state: 'active' }],
  drones: [{ typeId: 2454, quantity: 1, state: 'online' }],
  cargo: [],
};

async function renderAt(fitting: Fitting) {
  const encoded = await encodeFittingShare(fittingToShareInput(fitting));
  if (!encoded.ok) throw new Error('encode failed');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[`/fittings?f=${encoded.payload}`]}>{children}</MemoryRouter>
  );
  const view = renderHook(
    () => ({
      workspace: useFittingWorkspace(),
      location: useLocation(),
      navigationType: useNavigationType(),
      navigate: useNavigate(),
    }),
    { wrapper }
  );
  await waitFor(() => expect(view.result.current.workspace.fitting).not.toBeNull());
  return view;
}

describe('useFittingWorkspace editing', () => {
  it('applies an edit at once and pushes the new code, so Back returns to the previous Fitting', async () => {
    const view = await renderAt(RIFTER);
    const before = view.result.current.location.search;

    act(() => view.result.current.workspace.edit((f) => addModule(f, 'medium', 0, 438)));
    expect(view.result.current.workspace.fitting?.modules).toHaveLength(2);
    await waitFor(() => expect(view.result.current.location.search).not.toBe(before));
    expect(view.result.current.navigationType).toBe('PUSH');

    act(() => view.result.current.navigate(-1));
    await waitFor(() => expect(view.result.current.location.search).toBe(before));
    await waitFor(() => expect(view.result.current.workspace.fitting?.modules).toHaveLength(1));
  });

  it('applies two fast edits on top of each other, not both on the rendered Fitting', async () => {
    const view = await renderAt(RIFTER);

    act(() => {
      view.result.current.workspace.edit((f) => addModule(f, 'medium', 0, 438));
      view.result.current.workspace.edit((f) => removeModule(f, 'high', 0));
    });

    await waitFor(() => expect(view.result.current.navigationType).toBe('PUSH'));
    expect(view.result.current.workspace.fitting?.modules).toEqual([
      { slot: 'medium', slotIndex: 0, typeId: 438, state: 'active' },
    ]);
  });

  it('coalesces repeats of one control into a single history entry', async () => {
    const view = await renderAt(RIFTER);
    const counts = [2, 3, 4];

    for (const inBay of counts) {
      const before = view.result.current.location.search;
      act(() =>
        view.result.current.workspace.edit(
          (f) => setDroneCounts(f, 2454, { inSpace: 0, inBay }),
          'drone-bay-2454'
        )
      );
      await waitFor(() => expect(view.result.current.location.search).not.toBe(before));
    }
    expect(view.result.current.navigationType).toBe('REPLACE');

    // One Back undoes the whole run, not one count at a time.
    act(() => view.result.current.navigate(-1));
    await waitFor(() =>
      expect(view.result.current.workspace.fitting?.drones).toEqual(RIFTER.drones)
    );
  });

  it('still pushes when a run of one control starts faster than its first write lands', async () => {
    const view = await renderAt(RIFTER);
    const before = view.result.current.location.search;

    act(() => {
      for (const inBay of [2, 3])
        view.result.current.workspace.edit(
          (f) => setDroneCounts(f, 2454, { inSpace: 0, inBay }),
          'drone-bay-2454'
        );
    });
    await waitFor(() => expect(view.result.current.location.search).not.toBe(before));
    expect(view.result.current.navigationType).toBe('PUSH');

    act(() => view.result.current.navigate(-1));
    await waitFor(() => expect(view.result.current.location.search).toBe(before));
  });

  it('keeps the previous stats through a same-hull edit instead of blanking them', async () => {
    const view = await renderAt(RIFTER);
    await waitFor(() => expect(view.result.current.workspace.stats).not.toBeNull());
    let release: () => void = () => {};
    computeFittingStats.mockImplementationOnce(
      (fitting) =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              modules: fitting.modules.map(() => ({
                state: 'online',
                maxState: 'online',
                chargeGroupIds: [],
              })),
            });
        })
    );

    act(() => view.result.current.workspace.edit((f) => addModule(f, 'medium', 0, 438)));

    expect(view.result.current.workspace.stats).not.toBeNull();
    expect(view.result.current.workspace.statsFitting).not.toBe(
      view.result.current.workspace.fitting
    );
    act(() => release());
    await waitFor(() =>
      expect(view.result.current.workspace.statsFitting).toBe(view.result.current.workspace.fitting)
    );
  });
});

describe('useFittingWorkspace implant basis', () => {
  it("hands Variations the same pilot the main stats run under, on the Fitting's own set", async () => {
    // No Character: the basis is always "fitting".
    useActiveCharacter.setState({ activeCharacterId: null });
    const view = await renderAt({ ...RIFTER, implantSet: { implants: [19540], boosters: [] } });
    await waitFor(() => expect(view.result.current.workspace.stats).not.toBeNull());

    const mainStatsPilot = computeFittingStats.mock.lastCall?.[1];
    expect(mainStatsPilot?.implantTypeIds).toEqual([19540]);
    expect(view.result.current.workspace.statsProfile).toBe(mainStatsPilot);
    // A stable object, so the Variations baseline cache keyed on it holds.
    view.rerender();
    expect(view.result.current.workspace.statsProfile).toBe(mainStatsPilot);
  });
});

describe('useFittingWorkspace loading a Loaded fittings-XML file (#1542)', () => {
  it("clears the other Load path's unresolved list on each open, so a stale banner doesn't outlive the Fitting it described", async () => {
    const view = await renderAt(RIFTER);

    // An EFT paste with an unresolvable module leaves `unresolved` non-empty.
    await act(() =>
      view.result.current.workspace.loadFromInput(
        ['[Rifter, Test]', 'Not A Real Module'].join('\n')
      )
    );
    await waitFor(() => expect(view.result.current.workspace.unresolved).not.toEqual([]));

    // A drone-bay entry (the previous Fitting had none) proves this is the
    // newly-opened Fitting, not the still-open previous one.
    const items = await view.result.current.workspace.loadFittingXmlDocument({
      entries: [
        {
          name: 'Clean Rifter',
          shipTypeName: 'Rifter',
          hardware: [{ slot: 'drone bay', type: 'Hobgoblin I', qty: 2 }],
        },
      ],
    });
    await act(() => view.result.current.workspace.openFittingXmlEntry(items[0]!));

    await waitFor(() =>
      expect(view.result.current.workspace.fitting?.drones).toEqual([
        { typeId: 2454, quantity: 2, state: 'online' },
      ])
    );
    expect(view.result.current.workspace.unresolved).toEqual([]);
    expect(view.result.current.workspace.fitXmlUnresolved).toEqual([]);

    // And the reverse: a hull that resolves but carries an unresolvable item
    // leaves `fitXmlUnresolved` non-empty; going back to a clean EFT paste
    // must clear that stale banner too.
    const dirtyItems = await view.result.current.workspace.loadFittingXmlDocument({
      entries: [
        {
          name: 'Dirty Rifter',
          shipTypeName: 'Rifter',
          hardware: [{ slot: 'high slot 0', type: 'Not A Real Module' }],
        },
      ],
    });
    await act(() => view.result.current.workspace.openFittingXmlEntry(dirtyItems[0]!));
    await waitFor(() => expect(view.result.current.workspace.fitXmlUnresolved).not.toEqual([]));

    await act(() => view.result.current.workspace.loadFromInput('[Rifter, Test]'));
    await waitFor(() => expect(view.result.current.workspace.fitting?.name).toBe('Rifter'));
    expect(view.result.current.workspace.fitXmlUnresolved).toEqual([]);
  });
});

describe('useFittingWorkspace saving (My Fittings)', () => {
  beforeEach(async () => {
    await db.fittings.clear();
    useActiveCharacter.setState({ activeCharacterId: 7 });
  });

  it('never writes an unsaved edit to Dexie', async () => {
    const view = await renderAt(RIFTER);
    act(() => view.result.current.workspace.edit((f) => addModule(f, 'medium', 0, 438)));
    await waitFor(() => expect(view.result.current.navigationType).toBe('PUSH'));
    expect(await db.fittings.count()).toBe(0);
  });

  it('save stores the current code once, then updates the same record', async () => {
    const view = await renderAt(RIFTER);
    await act(() => view.result.current.workspace.save());
    expect(await db.fittings.count()).toBe(1);
    const first = (await db.fittings.toArray())[0]!;
    expect(first).toMatchObject({ characterId: 7, name: 'Rifter' });

    act(() => view.result.current.workspace.edit((f) => addModule(f, 'medium', 0, 438)));
    await act(() => view.result.current.workspace.save());
    const rows = await db.fittings.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(first.id);
    expect(rows[0]!.code).not.toBe(first.code);
  });

  it('cannot save without a Character', async () => {
    useActiveCharacter.setState({ activeCharacterId: null });
    const view = await renderAt(RIFTER);
    expect(view.result.current.workspace.canSave).toBe(false);
  });

  it('opens a saved Fitting under its saved name and keeps its record for the next save', async () => {
    const view = await renderAt(RIFTER);
    const encoded = await encodeFittingShare(
      fittingToShareInput(addModule(RIFTER, 'medium', 0, 438))
    );
    if (!encoded.ok) throw new Error('encode failed');
    act(() =>
      view.result.current.workspace.openSaved({ id: 'r1', name: 'My kite', code: encoded.payload })
    );
    await waitFor(() => expect(view.result.current.workspace.fitting?.name).toBe('My kite'));
    expect(view.result.current.workspace.savedId).toBe('r1');
  });

  it('opening an In-game Fitting clears the previous saved id, so Save creates a new record rather than overwriting it (issue #1539)', async () => {
    const view = await renderAt(RIFTER);
    const encoded = await encodeFittingShare(
      fittingToShareInput(addModule(RIFTER, 'medium', 0, 438))
    );
    if (!encoded.ok) throw new Error('encode failed');
    act(() =>
      view.result.current.workspace.openSaved({ id: 'r1', name: 'My kite', code: encoded.payload })
    );
    await waitFor(() => expect(view.result.current.workspace.savedId).toBe('r1'));

    await act(() => view.result.current.workspace.openFitting(RIFTER));
    await waitFor(() => expect(view.result.current.workspace.fitting?.name).toBe(RIFTER.name));
    expect(view.result.current.workspace.savedId).toBeNull();
  });
});
