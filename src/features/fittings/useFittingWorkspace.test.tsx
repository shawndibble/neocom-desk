import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { encodeFittingShare } from '@/engine/fitting/fittingShare';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import {
  addModule,
  droneGroups,
  removeModule,
  setDroneCounts,
} from '@/engine/fittings/fittingEdit';
import type { LoadedFitting } from '@/engine/fittings/load';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { useFittingWorkspace } from './useFittingWorkspace';

const TYPES: Record<string, { name: string; groupID: number; volume: number }> = {
  '587': { name: 'Rifter', groupID: 25, volume: 0 },
  '2454': { name: 'Hobgoblin I', groupID: 87, volume: 5 },
};
vi.mock('@/sde/loadSde', () => ({
  loadTypes: async () => TYPES,
  typeName: async (typeId: number) => TYPES[String(typeId)]?.name ?? `Type ${typeId}`,
  loadSkills: async () => [],
  loadFittingSlots: async () => ({ '2454': 'drone' }),
}));
vi.mock('@/sync', () => ({ scheduleSync: vi.fn(), markFittingDeleted: vi.fn() }));
vi.mock('./fittingPrice', () => ({ loadFittingPrice: async () => null }));
// Stats land once this resolves; a test holds it to act before they do.
const statsGate = vi.hoisted(() => ({ wait: Promise.resolve() as Promise<void> }));
vi.mock('./dogmaFittingEngine', () => ({
  isDogmaEngineReady: () => false,
  computeFittingStats: async (fitting: Fitting) => {
    await statsGate.wait;
    return {
      // A light drone draws 5 Mbit/s; the hull has room for four, the pilot controls five.
      droneBandwidthTotal: 20,
      maxActiveDrones: 5,
      droneBandwidthByType: { 2454: 5 },
      modules: fitting.modules.map(() => ({
        state: 'online',
        maxState: 'online',
        chargeGroupIds: [],
      })),
    } as unknown as FittingStats;
  },
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
});

describe('useFittingWorkspace — the editor has its own path', () => {
  function renderAtStart() {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={['/fittings']}>{children}</MemoryRouter>
    );
    return renderHook(
      () => ({
        workspace: useFittingWorkspace(),
        location: useLocation(),
        navigationType: useNavigationType(),
        navigate: useNavigate(),
      }),
      { wrapper }
    );
  }
  // No drones: a Load's drone launch would rewrite the URL after the open.
  const NAKED: Fitting = { ...RIFTER, drones: [] };
  const inGame: LoadedFitting = {
    kind: 'fitting',
    source: 'in-game',
    fitting: NAKED,
    unresolved: [],
  };

  it('opening a Fitting from the Start screen pushes /fittings/edit, so Back returns to the library', async () => {
    const view = renderAtStart();
    expect(view.result.current.workspace.fitting).toBeNull();

    await act(() => view.result.current.workspace.openLoaded(inGame));
    await waitFor(() => expect(view.result.current.workspace.fitting).not.toBeNull());
    expect(view.result.current.location.pathname).toBe('/fittings/edit');
    expect(view.result.current.location.search).toMatch(/^\?f=/);
    expect(view.result.current.navigationType).toBe('PUSH');

    act(() => view.result.current.navigate(-1));
    await waitFor(() => expect(view.result.current.location.pathname).toBe('/fittings'));
    await waitFor(() => expect(view.result.current.workspace.fitting).toBeNull());
  });

  it('opening a saved Fitting lands on /fittings/edit too', async () => {
    const encoded = await encodeFittingShare(fittingToShareInput(NAKED));
    if (!encoded.ok) throw new Error('encode failed');
    const view = renderAtStart();
    act(() =>
      view.result.current.workspace.openSaved({ id: 'r1', name: 'Kite', code: encoded.payload })
    );
    await waitFor(() => expect(view.result.current.location.pathname).toBe('/fittings/edit'));
    expect(view.result.current.navigationType).toBe('PUSH');
  });

  it('re-opening the Fitting already open adds no history entry', async () => {
    const view = renderAtStart();
    await act(() => view.result.current.workspace.openLoaded(inGame));
    await waitFor(() => expect(view.result.current.workspace.fitting).not.toBeNull());
    const url = view.result.current.location.search;

    await act(() => view.result.current.workspace.openLoaded(inGame));
    expect(view.result.current.location.search).toBe(url);
    act(() => view.result.current.navigate(-1));
    await waitFor(() => expect(view.result.current.location.pathname).toBe('/fittings'));
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

    await act(() =>
      view.result.current.workspace.openLoaded({
        kind: 'fitting',
        source: 'in-game',
        fitting: RIFTER,
        unresolved: [],
      })
    );
    await waitFor(() => expect(view.result.current.workspace.fitting?.name).toBe(RIFTER.name));
    expect(view.result.current.workspace.savedId).toBeNull();
  });
});

describe('useFittingWorkspace — drones on Load', () => {
  it('launches a pasted fit’s drones once its stats say how many fit, replacing the Load’s own new entry', async () => {
    const view = await renderAt(RIFTER);
    // A Fitting to go Back to; the Load then adds an entry after it.
    const encoded = await encodeFittingShare(
      fittingToShareInput(addModule(RIFTER, 'medium', 0, 438))
    );
    if (!encoded.ok) throw new Error('encode failed');
    act(() => view.result.current.navigate(`/fittings?f=${encoded.payload}`));
    await waitFor(() => expect(view.result.current.workspace.fitting?.modules).toHaveLength(2));
    const loadedOver = view.result.current.location.search;

    await act(() =>
      view.result.current.workspace.loadFromInput(
        ['[Rifter, Drones]', '', 'Hobgoblin I x6'].join('\n')
      )
    );
    // Bandwidth for four of the six.
    await waitFor(() =>
      expect(droneGroups(view.result.current.workspace.fitting!)).toEqual([
        { typeId: 2454, inSpace: 4, inBay: 2 },
      ])
    );
    expect(view.result.current.navigationType).toBe('REPLACE');

    // The launch overwrote the Load's own entry rather than adding another, so
    // Back leaves the Load altogether — no in-bay copy of it to step through —
    // and returns to the Fitting that was open before it.
    expect(view.result.current.location.search).not.toBe(loadedOver);
    act(() => view.result.current.navigate(-1));
    await waitFor(() => expect(view.result.current.location.search).toBe(loadedOver));
    await waitFor(() => expect(view.result.current.workspace.fitting?.modules).toHaveLength(2));
  });

  it('leaves the drones of a Fitting opened by link where the link put them', async () => {
    const view = await renderAt(RIFTER);
    await waitFor(() => expect(view.result.current.workspace.stats).not.toBeNull());
    expect(view.result.current.workspace.fitting?.drones).toEqual(RIFTER.drones);
  });
});

describe('useFittingWorkspace — drone launch edge cases', () => {
  const BAY_ONLY: Fitting = {
    name: 'Rifter',
    shipTypeId: 587,
    modules: [],
    drones: [{ typeId: 2454, quantity: 6, state: 'online' }],
    cargo: [],
  };
  const PASTE = ['[Rifter, Again]', '', 'Hobgoblin I x6'].join('\n');

  it('launches a Load identical to the Fitting already open, whose URL does not change', async () => {
    const view = await renderAt(BAY_ONLY);
    await waitFor(() => expect(view.result.current.workspace.stats).not.toBeNull());
    await act(() => view.result.current.workspace.loadFromInput(PASTE));
    await waitFor(() =>
      expect(droneGroups(view.result.current.workspace.fitting!)).toEqual([
        { typeId: 2454, inSpace: 4, inBay: 2 },
      ])
    );
  });

  it('does not launch after a Save made before the stats arrived, so the record matches the screen', async () => {
    useActiveCharacter.setState({ activeCharacterId: 90000001 });
    const view = await renderAt(RIFTER);
    let release = () => {};
    statsGate.wait = new Promise<void>((resolve) => (release = resolve));
    await act(() => view.result.current.workspace.loadFromInput(PASTE));
    await waitFor(() =>
      expect(view.result.current.workspace.fitting?.drones).toEqual(BAY_ONLY.drones)
    );
    await act(() => view.result.current.workspace.save());
    await act(async () => release());
    await waitFor(() => expect(view.result.current.workspace.stats).not.toBeNull());
    expect(view.result.current.workspace.fitting?.drones).toEqual(BAY_ONLY.drones);
    statsGate.wait = Promise.resolve();
    useActiveCharacter.setState({ activeCharacterId: null });
  });
});
