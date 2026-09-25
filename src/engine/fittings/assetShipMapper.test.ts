import { describe, expect, it } from 'vitest';
import { assetShipToFitting } from './assetShipMapper';

const HEAVY_LAUNCHER = 2410;
const SCOURGE = 209;
const DAMAGE_CONTROL = 2048;
const HOBGOBLIN = 2454;
const PASTE = 28668;
const modules = new Set([HEAVY_LAUNCHER, DAMAGE_CONTROL]);

describe('assetShipToFitting', () => {
  it('reads a ship’s fitted slots, its loaded charges, drone bay and cargo off the assets inside it', () => {
    const fitting = assetShipToFitting(
      { typeId: 621, name: 'My Caracal' },
      [
        { typeId: HEAVY_LAUNCHER, quantity: 1, flag: 'HiSlot0' },
        // A loaded charge sits in its module's slot.
        { typeId: SCOURGE, quantity: 40, flag: 'HiSlot0' },
        { typeId: HEAVY_LAUNCHER, quantity: 1, flag: 'HiSlot1' },
        { typeId: DAMAGE_CONTROL, quantity: 1, flag: 'LoSlot0' },
        { typeId: HOBGOBLIN, quantity: 5, flag: 'DroneBay' },
        { typeId: PASTE, quantity: 100, flag: 'Cargo' },
        { typeId: SCOURGE, quantity: 500, flag: 'Cargo' },
        // A bay the editor has no place for.
        { typeId: 34, quantity: 10, flag: 'FleetHangar' },
      ],
      (typeId) => modules.has(typeId)
    );
    expect(fitting).toEqual({
      name: 'My Caracal',
      shipTypeId: 621,
      modules: [
        {
          slot: 'high',
          slotIndex: 0,
          typeId: HEAVY_LAUNCHER,
          state: 'active',
          chargeTypeId: SCOURGE,
        },
        { slot: 'high', slotIndex: 1, typeId: HEAVY_LAUNCHER, state: 'active' },
        { slot: 'low', slotIndex: 0, typeId: DAMAGE_CONTROL, state: 'active' },
      ],
      drones: [{ typeId: HOBGOBLIN, quantity: 5, state: 'online' }],
      cargo: [
        { typeId: PASTE, quantity: 100 },
        { typeId: SCOURGE, quantity: 500 },
      ],
    });
  });

  it('is an empty hull when nothing is inside', () => {
    expect(assetShipToFitting({ typeId: 587, name: 'Rifter' }, [], () => true)).toEqual({
      name: 'Rifter',
      shipTypeId: 587,
      modules: [],
      drones: [],
      cargo: [],
    });
  });
});
