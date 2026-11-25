/**
 * Hangar contents for the cast, in six stations across five regions (Lonetrek, The Forge,
 * Domain, Sinq Laison, Heimatar). Ships are assembled singletons with names; everything else is
 * a stack.
 */
import { ARDEN, MIRA, STATIONS, TOBIN } from './cast';
import { T } from './catalog';

type Stack = [typeId: number, quantity: number];
interface Place {
  station: number;
  stacks: Stack[];
  /** Assembled ships here: [typeId, ship name]. */
  ships?: [number, string][];
}

const ARDEN_PLACES: Place[] = [
  {
    station: STATIONS.nourvukaiken,
    ships: [
      [T.gila, 'Quiet Lantern'],
      [T.drake, 'Halcyon Drake 1'],
      [T.drake, 'Halcyon Drake 2'],
      [T.drake, 'Halcyon Drake 3'],
      [T.hurricane, 'Forge Hurricane'],
    ],
    stacks: [
      [T.damageControlII, 14],
      [T.heavyMissileLauncherII, 22],
      [T.ballisticControlII, 18],
      [T.hobgoblinII, 80],
      [T.scourgeFury, 41_000],
      [T.scourgeHeavy, 18_000],
      [T.voidM, 24_000],
      [T.tritanium, 1_240_000],
      // Salvage and cargo loot from the last roam: a pile for the Appraisal page.
      [T.meltedCapacitorConsole, 124],
      [T.damagedAnn, 46],
      [T.trippedPowerCircuit, 212],
      [T.burnedLogicCircuit, 68],
      [T.contaminatedNanite, 39],
      [T.alloyedTritaniumBar, 905],
      [T.conductivePolymer, 77],
      [T.charredMicroCircuit, 95],
      [T.smashedTriggerUnit, 31],
      [T.wardConsole, 18],
      [T.lorentzFluid, 12],
      [T.friedInterfaceCircuit, 9],
      [T.brokenDroneTransceiver, 54],
      [T.armorPlates, 140],
    ],
  },
  {
    station: STATIONS.jita,
    stacks: [
      [T.largeShieldExtenderII, 6],
      [T.warpDisruptorII, 20],
      [T.stasisWebifierII, 12],
      [T.synthBluePill, 40],
      [T.hammerheadII, 120],
      [T.warriorII, 90],
      [T.mobileTractorUnit, 4],
      [T.combatProbes, 16],
      [T.capBooster800, 3_400],
    ],
  },
  {
    station: STATIONS.tunttaras,
    stacks: [
      [T.scourgeFury, 22_000],
      [T.mediumShieldExtenderII, 30],
      [T.nanitePaste, 1_800],
    ],
  },
  {
    station: STATIONS.amarr,
    ships: [[T.hurricane, 'Amarr Runabout']],
    stacks: [
      [T.mwd50II, 12],
      [T.afterburner10II, 30],
      [T.mediumArmorRepairerII, 24],
      [T.coProcessorII, 40],
      [T.droneDamageAmpII, 9],
    ],
  },
];

const MIRA_PLACES: Place[] = [
  {
    station: STATIONS.tunttaras,
    ships: [
      [T.orca, 'Salt and Iron'],
      [T.retriever, 'Slow Seam 1'],
      [T.retriever, 'Slow Seam 2'],
      [T.hurricane, 'Foundry Hurricane 1'],
      [T.hurricane, 'Foundry Hurricane 2'],
      [T.hurricane, 'Foundry Hurricane 3'],
    ],
    stacks: [
      [T.cVeldspar, 420_000],
      [T.cScordite, 210_000],
      [T.cPyroxeres, 96_000],
      [T.veldspar, 640_000],
      [T.scordite, 128_000],
      [T.pyroxeres, 54_000],
      [T.plagioclase, 41_000],
      [T.nanitePaste, 2_400],
      [T.mininglaserUpgradeII, 12],
      [T.mobileDepot, 3],
    ],
  },
  {
    station: STATIONS.dodixie,
    stacks: [
      [T.tritanium, 3_200_000],
      [T.pyerite, 1_100_000],
      [T.mexallon, 240_000],
      [T.isogen, 61_000],
      [T.nocxium, 8_200],
      [T.zydrine, 2_100],
      [T.megacyte, 880],
      [T.morphite, 120],
    ],
  },
  {
    station: STATIONS.nourvukaiken,
    stacks: [
      [T.capBooster400, 6_000],
      [T.inertialStabilizersII, 22],
    ],
    ships: [[T.rifter, 'Loaner Rifter']],
  },
];

const TOBIN_PLACES: Place[] = [
  {
    station: STATIONS.jita,
    ships: [
      [T.occator, 'Long Lamp'],
      [T.iteronV, 'Parcel Post 1'],
      [T.iteronV, 'Parcel Post 2'],
      [T.badger, 'Parcel Post 3'],
    ],
    stacks: [
      [T.cVeldspar, 1_100_000],
      [T.cScordite, 480_000],
      [T.cPyroxeres, 330_000],
      [T.cPlagioclase, 120_000],
      [T.cKernite, 90_000],
      [T.tritanium, 2_400_000],
      [T.mobileDepot, 6],
    ],
  },
  {
    station: STATIONS.amarr,
    ships: [
      [T.viator, 'Needle and Thread'],
      [T.bustard, 'Lockbox'],
    ],
    stacks: [[T.isogen, 90_000]],
  },
  {
    station: STATIONS.rens,
    ships: [[T.charon, 'Long Haul Lantern']],
    stacks: [[T.mexallon, 180_000]],
  },
];

const PLACES: Record<number, Place[]> = {
  [ARDEN.id]: ARDEN_PLACES,
  [MIRA.id]: MIRA_PLACES,
  [TOBIN.id]: TOBIN_PLACES,
};

export interface AssetRow {
  item_id: number;
  type_id: number;
  quantity: number;
  location_id: number;
  location_type: 'station';
  location_flag: 'Hangar';
  is_singleton: boolean;
}

/** item_id -> ship name, for POST /assets/names. */
const SHIP_NAMES = new Map<number, string>();

export function characterAssets(characterId: number): AssetRow[] {
  const rows: AssetRow[] = [];
  let id = 2_000_000_000 + (characterId % 100) * 10_000_000;
  for (const place of PLACES[characterId]) {
    for (const [typeId, name] of place.ships ?? []) {
      id += 1;
      SHIP_NAMES.set(id, name);
      rows.push({
        item_id: id,
        type_id: typeId,
        quantity: 1,
        location_id: place.station,
        location_type: 'station',
        location_flag: 'Hangar',
        is_singleton: true,
      });
    }
    for (const [typeId, quantity] of place.stacks) {
      id += 1;
      rows.push({
        item_id: id,
        type_id: typeId,
        quantity,
        location_id: place.station,
        location_type: 'station',
        location_flag: 'Hangar',
        is_singleton: false,
      });
    }
  }
  return rows;
}

export function assetNames(itemIds: number[]): { item_id: number; name: string }[] {
  for (const id of [ARDEN.id, MIRA.id, TOBIN.id]) characterAssets(id);
  return itemIds
    .filter((itemId) => SHIP_NAMES.has(itemId))
    .map((itemId) => ({ item_id: itemId, name: SHIP_NAMES.get(itemId)! }));
}
