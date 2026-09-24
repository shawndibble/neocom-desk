import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { encodeFittingShare } from '@/engine/fitting/fittingShare';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import { addModule, removeModule, setDroneCounts } from '@/engine/fittings/fittingEdit';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { useFittingWorkspace } from './useFittingWorkspace';

vi.mock('@/sde/loadSde', () => ({
  loadTypes: async () => ({ '587': { name: 'Rifter', groupID: 25, volume: 0 } }),
  loadSkills: async () => [],
  loadFittingSlots: async () => ({}),
}));
vi.mock('./fittingPrice', () => ({ loadFittingPrice: async () => null }));
const computeFittingStats = vi.fn(async (fitting: Fitting) => ({
  modules: fitting.modules.map(() => ({ state: 'online', maxState: 'online', chargeGroupIds: [] })),
}));
vi.mock('./dogmaFittingEngine', () => ({
  isDogmaEngineReady: () => false,
  computeFittingStats: (fitting: Fitting) =>
    computeFittingStats(fitting) as unknown as Promise<FittingStats>,
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
