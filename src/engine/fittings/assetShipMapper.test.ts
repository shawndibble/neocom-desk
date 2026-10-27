import { describe, expect, it } from 'vitest';
import { assetShipToFitting } from './assetShipMapper';
import type { ItemMutation } from './types';

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

  it('reads a carrier’s launched and bay fighter squadrons, as an In-game Fitting’s are read', () => {
    const TEMPLAR = 40556;
    const DRAGONFLY = 40557;
    const fitting = assetShipToFitting(
      { typeId: 23757, name: 'My Archon' },
      [
        { typeId: TEMPLAR, quantity: 9, flag: 'FighterTube0' },
        { typeId: TEMPLAR, quantity: 9, flag: 'FighterTube1' },
        { typeId: DRAGONFLY, quantity: 6, flag: 'FighterBay' },
      ],
      () => false
    );
    expect(fitting.fighters).toEqual([
      { typeId: TEMPLAR, quantity: 9, state: 'active' },
      { typeId: TEMPLAR, quantity: 9, state: 'active' },
      { typeId: DRAGONFLY, quantity: 6, state: 'online' },
    ]);
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

describe('assetShipToFitting — mutated items', () => {
  const NEUT_MUTATION = {
    baseTypeId: 16475,
    mutaplasmidTypeId: 47831,
    attributes: { 6: 419.25 },
  };
  const DRONE_MUTATION = { baseTypeId: 2454, mutaplasmidTypeId: 60461, attributes: { 64: 1.9 } };

  it('gives a fitted abyssal module and a mutated drone their rolls, by item id', () => {
    const fitting = assetShipToFitting(
      { typeId: 17843, name: 'Abyssal VNI' },
      [
        { typeId: 47832, quantity: 1, flag: 'HiSlot0', itemId: 1054645434634 },
        { typeId: DAMAGE_CONTROL, quantity: 1, flag: 'LoSlot0', itemId: 5 },
        { typeId: 60478, quantity: 1, flag: 'DroneBay', itemId: 77 },
        { typeId: 60478, quantity: 1, flag: 'DroneBay', itemId: 78 },
      ],
      (typeId) => typeId === 47832 || typeId === DAMAGE_CONTROL,
      new Map<number, ItemMutation>([
        [1054645434634, NEUT_MUTATION],
        [77, DRONE_MUTATION],
      ])
    );
    expect(fitting.modules).toEqual([
      { slot: 'high', slotIndex: 0, typeId: 47832, state: 'active', mutation: NEUT_MUTATION },
      { slot: 'low', slotIndex: 0, typeId: DAMAGE_CONTROL, state: 'active' },
    ]);
    // Rolls ESI couldn't supply leave that drone with none (base unknown).
    expect(fitting.drones).toEqual([
      { typeId: 60478, quantity: 1, state: 'online', mutation: DRONE_MUTATION },
      { typeId: 60478, quantity: 1, state: 'online' },
    ]);
  });
});
