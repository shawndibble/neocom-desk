/**
 * Real type ids (checked against public/data/types.json) and the one price model the whole world
 * shares: the Open Prices snapshot, the Fuzzwork aggregates, the region order books, the market
 * history and the wallet's transaction prices all derive from `BASE_PRICE`, so a number seen on
 * one page agrees with every other page.
 */
import { readFileSync } from 'node:fs';
import { mix } from '../../sandbox/gen';

export const T = {
  // Ships
  drake: 24698,
  gila: 17715,
  hurricane: 24702,
  rifter: 587,
  retriever: 17478,
  orca: 28606,
  iteronV: 657,
  badger: 648,
  viator: 12743,
  occator: 12745,
  bustard: 12731,
  charon: 20185,
  // Modules
  damageControlII: 2048,
  heavyMissileLauncherII: 2410,
  ballisticControlII: 22291,
  mediumShieldExtenderII: 3831,
  largeShieldExtenderII: 3841,
  warpDisruptorII: 3244,
  stasisWebifierII: 527,
  inertialStabilizersII: 1405,
  afterburner10II: 12058,
  mwd50II: 12076,
  mwd500II: 12084,
  mediumArmorRepairerII: 3530,
  coProcessorII: 3888,
  droneDamageAmpII: 4405,
  mininglaserUpgradeII: 28576,
  // Drones, ammo, boosters, consumables
  hobgoblinII: 2456,
  hammerheadII: 2185,
  hornetII: 2466,
  warriorII: 2488,
  scourgeFury: 2629,
  scourgeHeavy: 209,
  capBooster400: 11287,
  capBooster800: 11289,
  antimatterM: 230,
  voidM: 12789,
  nanitePaste: 28668,
  synthBluePill: 28670,
  // Minerals
  tritanium: 34,
  pyerite: 35,
  mexallon: 36,
  isogen: 37,
  nocxium: 38,
  zydrine: 39,
  megacyte: 40,
  morphite: 11399,
  // Ore, raw and compressed
  veldspar: 1230,
  scordite: 1228,
  pyroxeres: 1224,
  plagioclase: 18,
  kernite: 20,
  cVeldspar: 62516,
  cScordite: 62520,
  cPyroxeres: 62524,
  cPlagioclase: 62528,
  cKernite: 62536,
  // Salvage and loot
  alloyedTritaniumBar: 25595,
  conductivePolymer: 25604,
  burnedLogicCircuit: 25600,
  charredMicroCircuit: 25599,
  damagedAnn: 25597,
  smashedTriggerUnit: 25593,
  brokenDroneTransceiver: 25596,
  lorentzFluid: 25610,
  wardConsole: 25606,
  contaminatedNanite: 25590,
  friedInterfaceCircuit: 25601,
  meltedCapacitorConsole: 25603,
  trippedPowerCircuit: 25598,
  armorPlates: 25605,
  // Misc
  mobileTractorUnit: 33475,
  mobileDepot: 33474,
  combatProbes: 30028,
  // Implants
  ocularFilterImproved: 10217,
  neuralBoostImproved: 10213,
  memoryAugmentationImproved: 10209,
  cyberSubprocessorImproved: 10222,
  socialAdaptationBasic: 9956,
  neuralBoostBasic: 9942,
  ocularFilterBasic: 9899,
} as const;

/** ISK per unit. Compressed ore is priced like raw ore, as the sandbox does (miningTax values raw quantity at the compressed price). */
export const BASE_PRICE: Record<number, number> = {
  [T.drake]: 41_300_000,
  [T.gila]: 121_000_000,
  [T.hurricane]: 31_800_000,
  [T.rifter]: 560_000,
  [T.retriever]: 10_100_000,
  [T.orca]: 640_000_000,
  [T.iteronV]: 12_900_000,
  [T.badger]: 5_700_000,
  [T.viator]: 93_000_000,
  [T.occator]: 41_500_000,
  [T.bustard]: 66_000_000,
  [T.charon]: 1_730_000_000,
  [T.damageControlII]: 548_000,
  [T.heavyMissileLauncherII]: 318_000,
  [T.ballisticControlII]: 1_240_000,
  [T.mediumShieldExtenderII]: 164_000,
  [T.largeShieldExtenderII]: 4_150_000,
  [T.warpDisruptorII]: 421_000,
  [T.stasisWebifierII]: 389_000,
  [T.inertialStabilizersII]: 197_000,
  [T.afterburner10II]: 74_000,
  [T.mwd50II]: 510_000,
  [T.mwd500II]: 1_950_000,
  [T.mediumArmorRepairerII]: 292_000,
  [T.coProcessorII]: 233_000,
  [T.droneDamageAmpII]: 468_000,
  [T.mininglaserUpgradeII]: 2_850_000,
  [T.hobgoblinII]: 38_600,
  [T.hammerheadII]: 214_000,
  [T.hornetII]: 19_800,
  [T.warriorII]: 62_000,
  [T.scourgeFury]: 236,
  [T.scourgeHeavy]: 118,
  [T.capBooster400]: 2_640,
  [T.capBooster800]: 5_050,
  [T.antimatterM]: 38,
  [T.voidM]: 118,
  [T.nanitePaste]: 17_950,
  [T.synthBluePill]: 296_000,
  [T.tritanium]: 4.9,
  [T.pyerite]: 9.6,
  [T.mexallon]: 54,
  [T.isogen]: 96,
  [T.nocxium]: 628,
  [T.zydrine]: 1_340,
  [T.megacyte]: 2_620,
  [T.morphite]: 12_400,
  [T.veldspar]: 16.5,
  [T.scordite]: 27,
  [T.pyroxeres]: 61,
  [T.plagioclase]: 42,
  [T.kernite]: 118,
  [T.cVeldspar]: 17.2,
  [T.cScordite]: 28,
  [T.cPyroxeres]: 63,
  [T.cPlagioclase]: 44,
  [T.cKernite]: 121,
  [T.alloyedTritaniumBar]: 14_800,
  [T.conductivePolymer]: 9_900,
  [T.burnedLogicCircuit]: 6_100,
  [T.charredMicroCircuit]: 7_400,
  [T.damagedAnn]: 38_900,
  [T.smashedTriggerUnit]: 41_500,
  [T.brokenDroneTransceiver]: 9_400,
  [T.lorentzFluid]: 54_000,
  [T.wardConsole]: 98_000,
  [T.contaminatedNanite]: 36_800,
  [T.friedInterfaceCircuit]: 121_000,
  [T.meltedCapacitorConsole]: 28_700,
  [T.trippedPowerCircuit]: 11_300,
  [T.armorPlates]: 12_100,
  [T.mobileTractorUnit]: 1_880_000,
  [T.mobileDepot]: 26_000,
  [T.combatProbes]: 29_000,
  [T.ocularFilterImproved]: 3_900_000,
  [T.neuralBoostImproved]: 3_650_000,
  [T.memoryAugmentationImproved]: 4_100_000,
  [T.cyberSubprocessorImproved]: 3_700_000,
  [T.socialAdaptationBasic]: 190_000,
  [T.neuralBoostBasic]: 220_000,
  [T.ocularFilterBasic]: 180_000,
};

export function basePrice(typeId: number): number {
  return BASE_PRICE[typeId] ?? 50 + mix(typeId) * 20;
}

const typeData = JSON.parse(
  readFileSync(new URL('../../../../public/data/types.json', import.meta.url), 'utf8')
) as Record<string, { name: string; groupID: number; volume: number }>;

export function typeName(typeId: number): string {
  return typeData[String(typeId)]?.name ?? `Type ${typeId}`;
}
export function typeGroup(typeId: number): number {
  return typeData[String(typeId)]?.groupID ?? 0;
}
export function typeVolume(typeId: number): number {
  return typeData[String(typeId)]?.volume ?? 1;
}
