import { vi } from 'vitest';
import type { CandidateRack } from '@/engine/fittings/candidates';
import type { FittingItemActions } from '../fittingItemActions';
import type { ChargeLoading } from '../useChargeLoading';

export function fakeItemActions(
  {
    names = {},
    takes = {},
    cargoCharges = [],
    racks = {},
  }: {
    names?: Record<number, string>;
    takes?: Record<number, string[]>;
    cargoCharges?: number[];
    racks?: Record<number, CandidateRack>;
  } = {},
  overrides: Partial<FittingItemActions> = {}
): FittingItemActions {
  const charges: ChargeLoading = {
    accepts: (module, chargeTypeId) =>
      (takes[chargeTypeId] ?? []).includes(`${module.slot}-${module.slotIndex}`),
    targetsFor: (chargeTypeId) => takes[chargeTypeId] ?? [],
    cargoChargesFor: () => cargoCharges,
    load: vi.fn(),
    loadSteps: vi.fn(() => null),
    message: null,
  };
  return {
    typeName: (typeId) => names[typeId] ?? `#${typeId}`,
    rackOf: (typeId) => racks[typeId] ?? null,
    charges,
    setState: vi.fn(),
    unloadCharge: vi.fn(),
    setGroupState: vi.fn(),
    unloadGroup: vi.fn(),
    chargesFor: () => [],
    copyToAllOfType: vi.fn(),
    hasVariants: () => false,
    openVariations: vi.fn(),
    canMutate: () => false,
    openMutation: vi.fn(),
    removeAllOfType: vi.fn(),
    remove: vi.fn(),
    move: vi.fn(),
    slotCount: () => 3,
    copyModule: vi.fn(),
    recentFor: () => [],
    clipboardFor: () => null,
    addModule: vi.fn(),
    browseFor: vi.fn(),
    fillRack: vi.fn(),
    launchDrones: vi.fn(),
    recallDrones: vi.fn(),
    recallAllDrones: vi.fn(),
    removeDrones: vi.fn(),
    cargoCapacity: null,
    cargoUsed: null,
    openAddCargo: vi.fn(),
    changeCargoQuantity: vi.fn(),
    removeCargo: vi.fn(),
    canFitFirstFree: () => true,
    fitFirstFree: vi.fn(),
    dropHandlers: {
      addType: true,
      moveModule: true,
      loadCharge: true,
      launchDrone: true,
      addCargo: true,
    },
    drop: vi.fn(),
    ...overrides,
  };
}
