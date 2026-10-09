import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { droneGroups } from '@/engine/fittings/fittingEdit';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import type { FittingContext } from './fittingContext';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { ChargeLoading } from './useChargeLoading';
import { useEditorItemActions } from './useEditorItemActions';
import type { FittingChange } from './useFittingWorkspace';

const fitting: Fitting = {
  name: 'Test',
  shipTypeId: 1,
  modules: [],
  drones: [{ typeId: 2454, quantity: 5, state: 'online' }],
  cargo: [],
};

function statsWith(overrides: Partial<FittingStats>): FittingStats {
  return {
    droneBandwidthTotal: 125,
    maxActiveDrones: 5,
    droneBandwidthByType: { 2454: 25 },
    modules: [],
    holds: { cargo: 0 },
    slotCounts: {},
    droneCapacity: 0,
    ...overrides,
  } as unknown as FittingStats;
}

const charges = {} as ChargeLoading;

function setup(stats: FittingStats | null, currentStats: FittingStats | null) {
  const edit = vi.fn<(change: FittingChange) => void>();
  const { result } = renderHook(() =>
    useEditorItemActions({
      fitting,
      stats,
      currentStats,
      edit,
      context: {} as FittingContext,
      catalogue: { variations: { types: {}, metaGroups: {} } } as unknown as FittingCatalogue,
      charges,
      target: null,
      dronesShown: true,
      dragEnabled: false,
      selectTarget: () => {},
      openCargoQuantity: () => {},
      openVariations: () => {},
    })
  );
  return { result, edit };
}

describe('useEditorItemActions after an edit, before the recalculation lands', () => {
  it('launches nothing while the current fitting has no stats, though the lagging ones do', () => {
    const { result, edit } = setup(statsWith({}), null);
    result.current.itemActions?.launchDrones(2454);
    expect(edit).not.toHaveBeenCalled();
  });

  it('launches within the current fitting’s limits, not the lagging stats’', () => {
    const lagging = statsWith({ droneBandwidthTotal: 125, maxActiveDrones: 5 });
    const current = statsWith({ droneBandwidthTotal: 50, maxActiveDrones: 5 });
    const { result, edit } = setup(lagging, current);
    result.current.itemActions?.launchDrones(2454);
    const change = edit.mock.calls[0]![0];
    expect(droneGroups(change(fitting))).toEqual([{ typeId: 2454, inSpace: 2, inBay: 3 }]);
  });

  it('hands the Charge Picker no module results until the current fitting has them', () => {
    const lagging = statsWith({ modules: [{} as never] });
    const input = setup(lagging, null).result.current.itemActions?.chargePickerInput?.();
    expect(input?.moduleResults).toBeNull();
  });

  it('hands the Charge Picker the current fitting’s module results, not the lagging ones', () => {
    const current = statsWith({ modules: [{} as never, {} as never] });
    const lagging = statsWith({ modules: [{} as never] });
    const input = setup(lagging, current).result.current.itemActions?.chargePickerInput?.();
    expect(input?.moduleResults).toBe(current.modules);
  });
});
