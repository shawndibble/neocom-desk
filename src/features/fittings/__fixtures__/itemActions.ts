/**
 * Test-only `FittingItemActions`: every edit a mock, names from a small map,
 * charge loading answered by `takes` — so a component test states only the
 * one behaviour it is about.
 */
import { vi } from 'vitest';
import type { FittingItemActions } from '../fittingItemActions';
import type { ChargeLoading } from '../useChargeLoading';

export function fakeItemActions(
  {
    names = {},
    takes = {},
    cargoCharges = [],
  }: {
    names?: Record<number, string>;
    /** Charge type id -> the `moduleKey`s of the modules that take it. */
    takes?: Record<number, string[]>;
    /** What a module's "Load charge ▸" lists. */
    cargoCharges?: number[];
  } = {},
  overrides: Partial<FittingItemActions> = {}
): FittingItemActions {
  const charges: ChargeLoading = {
    accepts: (module, chargeTypeId) =>
      (takes[chargeTypeId] ?? []).includes(`${module.slot}-${module.slotIndex}`),
    targetsFor: (chargeTypeId) => takes[chargeTypeId] ?? [],
    cargoChargesFor: () => cargoCharges,
    load: vi.fn(),
    message: null,
  };
  return {
    typeName: (typeId) => names[typeId] ?? `#${typeId}`,
    showInfo: vi.fn(),
    charges,
    setState: vi.fn(),
    unloadCharge: vi.fn(),
    setGroupState: vi.fn(),
    unloadGroup: vi.fn(),
    chargesFor: () => [],
    copyToAllOfType: vi.fn(),
    variantsOf: () => [],
    swapType: vi.fn(),
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
    dropHandlers: { addType: true, moveModule: true, loadCharge: true, launchDrone: true },
    drop: vi.fn(),
    ...overrides,
  };
}
