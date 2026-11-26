import { describe, expect, it } from 'vitest';
import { holdAccepts, holdsFromStats, type HoldKind } from './cargoHolds';

const item = (groupId: number, categoryId: number | null) => ({ groupId, categoryId });

const AMMO = item(85, 8);
const SCRIPT = item(907, 8);
const CAP_BOOSTER = item(87, 8);
const MISSILE = item(384, 8);
const NANITE_PASTE = item(916, 8);
const PROBE = item(479, 8);
const P0 = item(1032, 42);
const P1 = item(1042, 43);
const P4 = item(1041, 43);
const COMMAND_CENTER = item(1027, 41);
const MINERAL = item(18, 4);
const GAS_CLOUD = item(711, 2);
const COMPRESSED_GAS = item(4168, 2);
const ORE = item(460, 25);
const MOON_ORE = item(1884, 25);
const COMPRESSED_ORE = item(4029, 25);
const ICE = item(465, 25);
const ICE_PRODUCT = item(423, 4);
const FUEL_BLOCK = item(1136, 4);
const COLONY_REAGENT = item(4729, 2143);
const MOON_MATERIAL = item(427, 4);
const QUANTUM_CORE = item(4086, 66);
const STRUCTURE_FIGHTERS = [item(4777, 87), item(4778, 87), item(4779, 87)];
const STRUCTURE_AMMO = [1546, 1547, 1548, 1549, 1551, 4186].map((g) => item(g, 8));
const SKYHOOK = item(4736, 46);
const GANTRY = item(1106, 46);
const MOBILE_DEPOT = item(1246, 22);
const MOBILE_TRACTOR = item(1250, 22);
const UPWELL_STRUCTURE = item(1657, 65);
const STRUCTURE_MODULE = item(1321, 66);
const SOV_39 = item(1012, 39);
const SOV_40 = item(838, 40);
const DRONE = item(100, 18);
const CONTROL_TOWER = item(365, 23);
const CONTAINER = item(448, 2);
const FIGHTER = item(1652, 87);
const MODULE = item(55, 7);

function accepted(kind: HoldKind, items: readonly ReturnType<typeof item>[]): boolean[] {
  return items.map((i) => holdAccepts(kind, i));
}

describe('holdAccepts', () => {
  it('general takes anything, even an item of unknown group', () => {
    expect(holdAccepts('general', MODULE)).toBe(true);
    expect(holdAccepts('general', { groupId: null, categoryId: null })).toBe(true);
  });

  it('ammo takes every Charge: ammo, scripts, cap boosters, missiles, nanite paste, probes', () => {
    expect(accepted('ammo', [AMMO, SCRIPT, CAP_BOOSTER, MISSILE, NANITE_PASTE, PROBE])).toEqual(
      Array(6).fill(true)
    );
    expect(accepted('ammo', [MODULE, DRONE, MINERAL])).toEqual([false, false, false]);
  });

  it('planetary takes raw resources (P0) and P1–P4, not command centers', () => {
    expect(accepted('planetary', [P0, P1, P4])).toEqual([true, true, true]);
    expect(holdAccepts('planetary', COMMAND_CENTER)).toBe(false);
  });

  it('command center takes only command centers', () => {
    expect(accepted('commandCenter', [COMMAND_CENTER, P1])).toEqual([true, false]);
  });

  it('mineral takes minerals only', () => {
    expect(accepted('mineral', [MINERAL, ICE_PRODUCT, ORE])).toEqual([true, false, false]);
  });

  it('gas takes harvestable clouds, not compressed gas', () => {
    expect(accepted('gas', [GAS_CLOUD, COMPRESSED_GAS])).toEqual([true, false]);
  });

  it('mining takes ore, moon ore, ice and compressed ore, and gas clouds — not compressed gas', () => {
    expect(accepted('mining', [ORE, MOON_ORE, COMPRESSED_ORE, ICE, GAS_CLOUD])).toEqual(
      Array(5).fill(true)
    );
    expect(accepted('mining', [COMPRESSED_GAS, MINERAL])).toEqual([false, false]);
  });

  it('ice takes ice, not ice products', () => {
    expect(accepted('ice', [ICE, ICE_PRODUCT, ORE])).toEqual([true, false, false]);
  });

  it('fuel bay takes ice products, not fuel blocks', () => {
    expect(accepted('fuel', [ICE_PRODUCT, FUEL_BLOCK])).toEqual([true, false]);
  });

  it('infrastructure takes every listed group and category', () => {
    expect(
      accepted('infrastructure', [
        COLONY_REAGENT,
        FUEL_BLOCK,
        ICE_PRODUCT,
        MOON_MATERIAL,
        QUANTUM_CORE,
        ...STRUCTURE_FIGHTERS,
        ...STRUCTURE_AMMO,
        SKYHOOK,
        GANTRY,
        COMMAND_CENTER,
        MOBILE_DEPOT,
        MOBILE_TRACTOR,
        P1,
        P4,
        UPWELL_STRUCTURE,
        STRUCTURE_MODULE,
        SOV_39,
        SOV_40,
      ]).every(Boolean)
    ).toBe(true);
  });

  it('infrastructure rejects cap boosters, missiles, nanite paste, drones, control towers, containers, raw P0 and regular fighters', () => {
    expect(
      accepted('infrastructure', [
        CAP_BOOSTER,
        MISSILE,
        NANITE_PASTE,
        DRONE,
        CONTROL_TOWER,
        CONTAINER,
        P0,
        FIGHTER,
      ])
    ).toEqual(Array(8).fill(false));
  });

  it('a specialised hold takes nothing whose group is unknown', () => {
    expect(holdAccepts('ammo', { groupId: null, categoryId: null })).toBe(false);
  });
});

describe('holdsFromStats', () => {
  const NONE = {
    cargo: 0,
    fleetHangar: 0,
    miningHold: 0,
    ammoHold: 0,
    planetaryHold: 0,
    commandCenterHold: 0,
    mineralHold: 0,
    gasHold: 0,
    iceHold: 0,
    fuelBay: 0,
    infrastructureHold: 0,
  };

  it('folds cargo and fleet hangar into the general hold and lists each specialised hold it has', () => {
    expect(holdsFromStats({ ...NONE, cargo: 300, ammoHold: 41_000, gasHold: 5_000 })).toEqual([
      { kind: 'general', capacityM3: 300 },
      { kind: 'gas', capacityM3: 5_000 },
      { kind: 'ammo', capacityM3: 41_000 },
    ]);
    expect(holdsFromStats({ ...NONE, cargo: 4_500, fleetHangar: 50_000 })).toEqual([
      { kind: 'general', capacityM3: 54_500 },
    ]);
  });

  it('leaves out a general hold of zero', () => {
    expect(holdsFromStats({ ...NONE, miningHold: 12_000 })).toEqual([
      { kind: 'mining', capacityM3: 12_000 },
    ]);
  });
});
