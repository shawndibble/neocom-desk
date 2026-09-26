import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import '@/i18n';
import type { Fitting, FittingModuleResult, PilotProfile } from '@/engine/fittings/types';
import { useChargeLoading } from './useChargeLoading';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { FittingChange } from './useFittingWorkspace';

// The engine's size check says no to the one oversized charge; each launcher holds 1.2 m3.
vi.mock('./dogmaFittingEngine', () => ({
  checkCharges: (_ship: number, _module: unknown, ids: number[]) =>
    new Set(ids.filter((id) => id !== 999)),
  moduleChargeCapacity: () => 1.2,
}));

const MISSILES = 385;
const HEAVY = 209;
const OVERSIZED = 999;
const SCRIPT = 29001;

const catalogue = {
  types: {
    [HEAVY]: { name: 'Scourge Heavy Missile', groupID: MISSILES, volume: 0.03 },
    [OVERSIZED]: { name: 'Oversized', groupID: MISSILES, volume: 0.03 },
    [SCRIPT]: { name: 'Tracking Speed Script', groupID: 907, volume: 1 },
  },
} as unknown as FittingCatalogue;

const profile: PilotProfile = { skillLevels: new Map(), implantTypeIds: [], boosterTypeIds: [] };

const fitting: Fitting = {
  name: 'Drake',
  shipTypeId: 24698,
  modules: [
    { slot: 'high', slotIndex: 0, typeId: 2410, state: 'active' },
    { slot: 'high', slotIndex: 1, typeId: 25715, state: 'active' },
    { slot: 'medium', slotIndex: 0, typeId: 2281, state: 'active' },
  ],
  drones: [],
  cargo: [{ typeId: HEAVY, quantity: 60 }],
};

const launcher: FittingModuleResult = {
  state: 'active',
  maxState: 'overload',
  chargeGroupIds: [MISSILES],
};
const passive: FittingModuleResult = { state: 'active', maxState: 'active', chargeGroupIds: [] };

function setup() {
  let current = fitting;
  const edit = vi.fn((change: FittingChange) => {
    current = change(current);
  });
  const { result } = renderHook(() =>
    useChargeLoading({
      fitting,
      catalogue,
      moduleResults: [launcher, launcher, passive],
      engineReady: true,
      profile,
      edit,
    })
  );
  return { result, edit, after: () => current };
}

describe('useChargeLoading', () => {
  it('lights every module whose charge groups take the charge and the engine passes, whatever its type', () => {
    const { result } = setup();
    expect(result.current.targetsFor(HEAVY)).toEqual(['high-0', 'high-1']);
    expect(result.current.targetsFor(OVERSIZED)).toEqual([]);
    expect(result.current.targetsFor(SCRIPT)).toEqual([]);
    expect(result.current.cargoChargesFor(fitting.modules[0])).toEqual([HEAVY]);
  });

  it('loads from cargo a full load per module (capacity over volume), and says the cargo ran out', () => {
    const { result, after } = setup();
    act(() => result.current.load(HEAVY, { fromCargo: true }));
    // 1.2 m3 / 0.03 m3 = 40 a launcher: 40 then the last 20.
    expect(after().modules.map((m) => m.chargeTypeId)).toEqual([HEAVY, HEAVY, undefined]);
    expect(after().cargo).toEqual([]);
    expect(result.current.message).toBe('Loaded Scourge Heavy Missile into 2 modules.');
  });

  it('says when nothing fitted takes the charge', () => {
    const { result } = setup();
    act(() =>
      result.current.load(HEAVY, { fromCargo: true, only: { slot: 'medium', slotIndex: 0 } })
    );
    expect(result.current.message).toBe('Nothing fitted takes Scourge Heavy Missile.');
  });
});
