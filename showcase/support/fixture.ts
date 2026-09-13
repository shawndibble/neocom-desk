/**
 * The showcase world, as `esiCache` rows plus editable Dexie records.
 *
 * Every key here was read out of the loader that consumes it — the cache is
 * keyed `[characterId+key]` with no schema of its own, so a typo produces a
 * silently empty page rather than an error. Corp-owned rows carry the
 * `corp:{corporationId}:` prefix `esi/cache.ts`'s `corpCacheKey` builds.
 */
import type { SeedPayload, CacheRow } from './seed';
import { CHARACTER_ID, CHARACTER_NAME, CORPORATION_ID } from './identity';
import { IMPLANT_IDS, typeInfoRows } from './typeInfo';
import { bpcRows, offerRows } from './liveContracts';
import {
  BLUEPRINT,
  REGION,
  SKILL,
  STATION,
  SYSTEM,
  TYPE,
  dayStamp,
  daysAgo,
  daysAhead,
  hoursAgo,
  hoursAhead,
  msDaysAhead,
} from './world';

/** `GLOBAL_CACHE_CHARACTER_ID` — character-independent public lookups. */
const GLOBAL = 0;

const corpKey = (key: string) => `corp:${CORPORATION_ID}:${key}`;

// ---------------------------------------------------------------- skills

const TRAINED: [number, number, number][] = [
  // [skillTypeID, level, skillpoints]
  [SKILL.industry, 5, 256_000],
  [SKILL.advancedIndustry, 5, 1_280_000],
  [SKILL.massProduction, 5, 768_000],
  [SKILL.advancedMassProduction, 4, 1_130_000],
  [SKILL.supplyChainManagement, 4, 1_130_000],
  [SKILL.science, 5, 256_000],
  [SKILL.research, 5, 768_000],
  [SKILL.metallurgy, 4, 135_000],
  [SKILL.laboratoryOperation, 5, 768_000],
  [SKILL.reactions, 4, 135_000],
  [SKILL.massReactions, 3, 24_000],
  [SKILL.mining, 5, 256_000],
  [SKILL.astrogeology, 4, 540_000],
  [SKILL.miningBarge, 5, 1_280_000],
  [SKILL.exhumers, 3, 226_000],
  [SKILL.accounting, 5, 768_000],
  [SKILL.brokerRelations, 4, 135_000],
  [SKILL.trade, 5, 45_000],
  [SKILL.retail, 4, 40_000],
  [SKILL.wholesale, 3, 90_000],
  [SKILL.caldariBattleship, 4, 1_130_000],
  [SKILL.gallenteBattleship, 3, 226_000],
];

const CHARACTER_SKILLS = {
  skills: TRAINED.map(([skill_id, level, sp]) => ({
    skill_id,
    trained_skill_level: level,
    active_skill_level: level,
    skillpoints_in_skill: sp,
  })),
  total_sp: TRAINED.reduce((sum, [, , sp]) => sum + sp, 0) + 42_180_000,
  unallocated_sp: 150_000,
};

const SKILL_QUEUE = [
  {
    skill_id: SKILL.advancedMassProduction,
    queue_position: 0,
    finished_level: 5,
    start_date: daysAgo(2),
    finish_date: daysAhead(9),
    level_start_sp: 1_130_000,
    level_end_sp: 6_400_000,
    training_start_sp: 1_812_000,
  },
  {
    skill_id: SKILL.exhumers,
    queue_position: 1,
    finished_level: 4,
    start_date: daysAhead(9),
    finish_date: daysAhead(14),
    level_start_sp: 226_000,
    level_end_sp: 1_280_000,
    training_start_sp: 226_000,
  },
  {
    skill_id: SKILL.massReactions,
    queue_position: 2,
    finished_level: 4,
    start_date: daysAhead(14),
    finish_date: daysAhead(21),
    level_start_sp: 24_000,
    level_end_sp: 135_000,
    training_start_sp: 24_000,
  },
  {
    skill_id: SKILL.tycoon,
    queue_position: 3,
    finished_level: 3,
    start_date: daysAhead(21),
    finish_date: daysAhead(26),
    level_start_sp: 8_000,
    level_end_sp: 45_000,
    training_start_sp: 0,
  },
];

const ATTRIBUTES = {
  intelligence: 27,
  memory: 21,
  perception: 20,
  willpower: 24,
  charisma: 17,
  bonus_remaps: 2,
  last_remap_date: daysAgo(240),
  accrued_remap_cooldown_date: daysAgo(30),
};

// --------------------------------------------------------------- industry

const BLUEPRINTS = [
  { item_id: 1_010_000_001, type_id: BLUEPRINT.raven, runs: -1, material_efficiency: 10, time_efficiency: 20, quantity: 1, location_id: STATION.jita44, location_flag: 'Hangar' },
  { item_id: 1_010_000_002, type_id: BLUEPRINT.ishtar, runs: -1, material_efficiency: 10, time_efficiency: 20, quantity: 1, location_id: STATION.jita44, location_flag: 'Hangar' },
  { item_id: 1_010_000_003, type_id: BLUEPRINT.muninn, runs: 30, material_efficiency: 8, time_efficiency: 14, quantity: 1, location_id: STATION.dodixieFNAP, location_flag: 'Hangar' },
  { item_id: 1_010_000_004, type_id: BLUEPRINT.vexor, runs: -1, material_efficiency: 10, time_efficiency: 20, quantity: 1, location_id: STATION.jita44, location_flag: 'Hangar' },
  { item_id: 1_010_000_005, type_id: BLUEPRINT.caracal, runs: 120, material_efficiency: 6, time_efficiency: 10, quantity: 1, location_id: STATION.amarrEFA, location_flag: 'Hangar' },
  { item_id: 1_010_000_006, type_id: BLUEPRINT.hulk, runs: -1, material_efficiency: 9, time_efficiency: 16, quantity: 1, location_id: STATION.dodixieFNAP, location_flag: 'Hangar' },
];

const INDUSTRY_JOBS = [
  { job_id: 700_100_001, activity_id: 1, blueprint_type_id: BLUEPRINT.raven, facility_id: STATION.jita44, station_id: STATION.jita44, runs: 4, start_date: hoursAgo(30), end_date: hoursAhead(9), status: 'active' as const, cost: 14_820_000, product_type_id: TYPE.raven },
  { job_id: 700_100_002, activity_id: 1, blueprint_type_id: BLUEPRINT.ishtar, facility_id: STATION.jita44, station_id: STATION.jita44, runs: 8, start_date: hoursAgo(52), end_date: hoursAhead(2), status: 'active' as const, cost: 22_140_000, product_type_id: TYPE.ishtar },
  { job_id: 700_100_003, activity_id: 1, blueprint_type_id: BLUEPRINT.muninn, facility_id: STATION.dodixieFNAP, station_id: STATION.dodixieFNAP, runs: 6, start_date: hoursAgo(70), end_date: hoursAgo(3), status: 'ready' as const, cost: 9_640_000, product_type_id: TYPE.muninn },
  { job_id: 700_100_004, activity_id: 4, blueprint_type_id: BLUEPRINT.hulk, facility_id: STATION.dodixieFNAP, station_id: STATION.dodixieFNAP, runs: 1, start_date: daysAgo(3), end_date: daysAhead(4), status: 'active' as const, cost: 41_200_000 },
  { job_id: 700_100_005, activity_id: 5, blueprint_type_id: BLUEPRINT.caracal, facility_id: STATION.amarrEFA, station_id: STATION.amarrEFA, runs: 20, start_date: daysAgo(1), end_date: daysAhead(2), status: 'active' as const, cost: 6_310_000, licensed_runs: 120 },
  { job_id: 700_100_006, activity_id: 1, blueprint_type_id: BLUEPRINT.vexor, facility_id: STATION.jita44, station_id: STATION.jita44, runs: 20, start_date: daysAgo(6), end_date: daysAgo(1), status: 'delivered' as const, cost: 5_980_000, product_type_id: TYPE.vexor },
];

// ----------------------------------------------------------------- market

const OPEN_ORDERS = [
  { order_id: 680_100_001, type_id: TYPE.raven, region_id: REGION.theForge, location_id: STATION.jita44, is_corporation: false, price: 212_400_000, volume_remain: 3, volume_total: 6, issued: daysAgo(2), duration: 90, range: 'station' },
  { order_id: 680_100_002, type_id: TYPE.ishtar, region_id: REGION.theForge, location_id: STATION.jita44, is_corporation: false, price: 268_900_000, volume_remain: 5, volume_total: 8, issued: daysAgo(4), duration: 90, range: 'station' },
  { order_id: 680_100_003, type_id: TYPE.muninn, region_id: REGION.sinqLaison, location_id: STATION.dodixieFNAP, is_corporation: false, price: 179_500_000, volume_remain: 6, volume_total: 6, issued: hoursAgo(9), duration: 30, range: 'station' },
  { order_id: 680_100_004, type_id: TYPE.tritanium, region_id: REGION.theForge, location_id: STATION.jita44, is_buy_order: true, is_corporation: false, price: 5.42, volume_remain: 18_400_000, volume_total: 40_000_000, issued: daysAgo(1), duration: 30, range: 'region', min_volume: 1, escrow: 99_728_000 },
  { order_id: 680_100_005, type_id: TYPE.megacyte, region_id: REGION.theForge, location_id: STATION.jita44, is_buy_order: true, is_corporation: false, price: 2_980.0, volume_remain: 24_000, volume_total: 60_000, issued: daysAgo(3), duration: 30, range: 'region', min_volume: 1, escrow: 71_520_000 },
  { order_id: 680_100_006, type_id: TYPE.vexor, region_id: REGION.domain, location_id: STATION.amarrEFA, is_corporation: false, price: 31_800_000, volume_remain: 12, volume_total: 20, issued: daysAgo(6), duration: 90, range: 'station' },
  { order_id: 680_100_007, type_id: TYPE.caracal, region_id: REGION.domain, location_id: STATION.amarrEFA, is_corporation: false, price: 14_250_000, volume_remain: 28, volume_total: 40, issued: daysAgo(5), duration: 90, range: 'station' },
  { order_id: 680_100_008, type_id: TYPE.zydrine, region_id: REGION.theForge, location_id: STATION.jita44, is_buy_order: true, is_corporation: false, price: 1_640.0, volume_remain: 52_000, volume_total: 80_000, issued: hoursAgo(20), duration: 30, range: 'region', min_volume: 1, escrow: 85_280_000 },
];

const ORDER_HISTORY = [
  { order_id: 680_090_001, type_id: TYPE.drake, region_id: REGION.theForge, location_id: STATION.jita44, is_corporation: false, price: 42_100_000, volume_remain: 0, volume_total: 15, issued: daysAgo(34), duration: 30, range: 'station', state: 'expired' as const },
  { order_id: 680_090_002, type_id: TYPE.retriever, region_id: REGION.sinqLaison, location_id: STATION.dodixieFNAP, is_corporation: false, price: 28_400_000, volume_remain: 2, volume_total: 10, issued: daysAgo(41), duration: 30, range: 'station', state: 'cancelled' as const },
  { order_id: 680_090_003, type_id: TYPE.pyerite, region_id: REGION.theForge, location_id: STATION.jita44, is_buy_order: true, is_corporation: false, price: 11.8, volume_remain: 0, volume_total: 12_000_000, issued: daysAgo(38), duration: 30, range: 'region', state: 'expired' as const },
];

// -------------------------------------------------------------- contracts

const CONTRACTS = [
  { contract_id: 220_100_001, issuer_id: CHARACTER_ID, issuer_corporation_id: CORPORATION_ID, assignee_id: 0, acceptor_id: 0, type: 'item_exchange' as const, status: 'outstanding' as const, for_corporation: false, availability: 'public' as const, date_issued: daysAgo(3), date_expired: daysAhead(11), title: 'Ishtar hull - built to order', price: 271_000_000, volume: 115_000, start_location_id: STATION.jita44 },
  { contract_id: 220_100_002, issuer_id: CHARACTER_ID, issuer_corporation_id: CORPORATION_ID, assignee_id: 0, acceptor_id: 0, type: 'courier' as const, status: 'in_progress' as const, for_corporation: false, availability: 'public' as const, date_issued: daysAgo(1), date_expired: daysAhead(6), title: 'Jita -> Dodixie mineral run', reward: 18_500_000, collateral: 640_000_000, volume: 58_400, days_to_complete: 4, date_accepted: hoursAgo(14), start_location_id: STATION.jita44, end_location_id: STATION.dodixieFNAP },
  { contract_id: 220_100_003, issuer_id: 2_117_500_444, issuer_corporation_id: 98_000_777, assignee_id: CHARACTER_ID, acceptor_id: CHARACTER_ID, type: 'item_exchange' as const, status: 'finished' as const, for_corporation: false, availability: 'personal' as const, date_issued: daysAgo(12), date_expired: daysAgo(1), title: 'Muninn BPC batch', price: 96_400_000, volume: 0.1, date_completed: daysAgo(10), start_location_id: STATION.dodixieFNAP },
  { contract_id: 220_100_004, issuer_id: CHARACTER_ID, issuer_corporation_id: CORPORATION_ID, assignee_id: 0, acceptor_id: 0, type: 'auction' as const, status: 'outstanding' as const, for_corporation: false, availability: 'public' as const, date_issued: daysAgo(2), date_expired: daysAhead(3), title: 'Raven - no reserve', price: 180_000_000, buyout: 235_000_000, volume: 486_000, start_location_id: STATION.jita44 },
  { contract_id: 220_100_005, issuer_id: CHARACTER_ID, issuer_corporation_id: CORPORATION_ID, assignee_id: 0, acceptor_id: 0, type: 'item_exchange' as const, status: 'finished' as const, for_corporation: true, availability: 'corporation' as const, date_issued: daysAgo(20), date_expired: daysAgo(6), title: 'Corp mineral resupply', price: 412_000_000, volume: 244_000, date_completed: daysAgo(8), start_location_id: STATION.jita44 },
];

const CONTRACT_ITEMS: Record<number, unknown[]> = {
  220_100_001: [{ record_id: 1, type_id: TYPE.ishtar, quantity: 1, is_included: true, is_singleton: true }],
  220_100_003: [{ record_id: 1, type_id: BLUEPRINT.muninn, quantity: 1, is_included: true, is_singleton: true, runs: 30 }],
  220_100_004: [{ record_id: 1, type_id: TYPE.raven, quantity: 1, is_included: true, is_singleton: true }],
  220_100_005: [
    { record_id: 1, type_id: TYPE.tritanium, quantity: 24_000_000, is_included: true, is_singleton: false },
    { record_id: 2, type_id: TYPE.pyerite, quantity: 6_400_000, is_included: true, is_singleton: false },
    { record_id: 3, type_id: TYPE.mexallon, quantity: 1_850_000, is_included: true, is_singleton: false },
  ],
};

// -------------------------------------------------- public contract search


const COURIER_ROWS = [
  { contractId: 320_100_001, regionId: REGION.theForge, originLocationId: STATION.jita44, destinationLocationId: STATION.amarrEFA, reward: 21_400_000, volume: 62_000, collateral: 1_200_000_000, daysToComplete: 5, dateExpired: msDaysAhead(9) },
  { contractId: 320_100_002, regionId: REGION.theForge, originLocationId: STATION.jita44, destinationLocationId: STATION.dodixieFNAP, reward: 14_800_000, volume: 58_400, collateral: 640_000_000, daysToComplete: 4, dateExpired: msDaysAhead(6) },
  { contractId: 320_100_003, regionId: REGION.domain, originLocationId: STATION.amarrEFA, destinationLocationId: STATION.jita44, reward: 26_900_000, volume: 335_000, collateral: 2_400_000_000, daysToComplete: 7, dateExpired: msDaysAhead(12) },
  { contractId: 320_100_004, regionId: REGION.sinqLaison, originLocationId: STATION.dodixieFNAP, destinationLocationId: STATION.renImperial, reward: 9_250_000, volume: 12_800, collateral: 180_000_000, daysToComplete: 3, dateExpired: msDaysAhead(4) },
  { contractId: 320_100_005, regionId: REGION.theForge, originLocationId: STATION.jita44, destinationLocationId: STATION.renImperial, reward: 32_600_000, volume: 330_000, collateral: 3_100_000_000, daysToComplete: 6, dateExpired: msDaysAhead(14) },
];


// ------------------------------------------------------------------- corp

const CORP_MEMBER_IDS = [
  CHARACTER_ID, 2_117_500_101, 2_117_500_102, 2_117_500_103, 2_117_500_104,
  2_117_500_105, 2_117_500_106, 2_117_500_107, 2_117_500_108, 2_117_500_109,
];

const CORP_MEMBER_TRACKING = CORP_MEMBER_IDS.map((character_id, index) => ({
  character_id,
  location_id: [STATION.jita44, STATION.dodixieFNAP, STATION.amarrEFA][index % 3],
  logon_date: hoursAgo(index * 7 + 1),
  logoff_date: hoursAgo(index * 5),
  ship_type_id: [TYPE.hulk, TYPE.retriever, TYPE.raven, TYPE.vexor][index % 4],
  start_date: daysAgo(400 - index * 31),
}));

const CORP_WALLET_DIVISIONS = [
  { division: 1, balance: 41_820_640_112.44 },
  { division: 2, balance: 8_240_115_900.0 },
  { division: 3, balance: 2_115_400_250.75 },
  { division: 4, balance: 640_200_000.0 },
  { division: 5, balance: 128_900_400.1 },
  { division: 6, balance: 0 },
  { division: 7, balance: 0 },
];

const CORP_DIVISIONS = {
  hangar: [
    { division: 1, name: 'Mineral Stock' },
    { division: 2, name: 'Component Line' },
    { division: 3, name: 'Finished Hulls' },
    { division: 4, name: 'Blueprint Vault' },
  ],
  wallet: [
    { division: 1, name: 'Master Wallet' },
    { division: 2, name: 'Industry Budget' },
    { division: 3, name: 'Moon Tax Pool' },
    { division: 4, name: 'Logistics' },
    { division: 5, name: 'Contingency' },
  ],
};

const CORP_JOURNAL = [
  { id: 900_100_001, date: hoursAgo(2), ref_type: 'industry_job_tax', description: 'Industry job tax', amount: -4_180_000, balance: 41_820_640_112.44, first_party_id: CHARACTER_ID, second_party_id: CORPORATION_ID },
  { id: 900_100_002, date: hoursAgo(9), ref_type: 'reprocessing_tax', description: 'Reprocessing tax', amount: 1_240_500, balance: 41_824_820_112.44, second_party_id: CORPORATION_ID },
  { id: 900_100_003, date: hoursAgo(26), ref_type: 'corporation_account_withdrawal', description: 'Moon tax payout', amount: -820_000_000, balance: 41_823_579_612.44, first_party_id: CORPORATION_ID },
  { id: 900_100_004, date: hoursAgo(40), ref_type: 'market_transaction', description: 'Market escrow release', amount: 268_900_000, balance: 42_643_579_612.44, second_party_id: CORPORATION_ID },
  { id: 900_100_005, date: hoursAgo(61), ref_type: 'brokers_fee', description: "Broker's fee", amount: -6_720_000, balance: 42_374_679_612.44, first_party_id: CORPORATION_ID },
  { id: 900_100_006, date: hoursAgo(78), ref_type: 'contract_price', description: 'Contract settled', amount: 412_000_000, balance: 42_381_399_612.44, second_party_id: CORPORATION_ID },
];

const CORP_STRUCTURES = [
  { structure_id: 1_035_100_001, corporation_id: CORPORATION_ID, system_id: SYSTEM.perimeter, type_id: 35_825, profile_id: 1, name: 'Perimeter - Vespera Forge', fuel_expires: daysAhead(18), state: 'shield_vulnerable' as const, reinforce_hour: 19, services: [{ name: 'Manufacturing', state: 'online' as const }, { name: 'Research', state: 'online' as const }] },
  { structure_id: 1_035_100_002, corporation_id: CORPORATION_ID, system_id: SYSTEM.hek, type_id: 35_835, profile_id: 1, name: 'Hek - Vespera Refinery', fuel_expires: daysAhead(4), state: 'shield_vulnerable' as const, reinforce_hour: 21, services: [{ name: 'Reprocessing', state: 'online' as const }, { name: 'Moon Drilling', state: 'online' as const }] },
  { structure_id: 1_035_100_003, corporation_id: CORPORATION_ID, system_id: SYSTEM.dodixie, type_id: 35_832, profile_id: 1, name: 'Dodixie - Vespera Staging', fuel_expires: daysAhead(31), state: 'shield_vulnerable' as const, reinforce_hour: 18, services: [{ name: 'Market Hub', state: 'online' as const }] },
];

const CORP_EXTRACTIONS = [
  { structure_id: 1_035_100_002, moon_id: 40_162_000, extraction_start_time: daysAgo(5), chunk_arrival_time: daysAhead(2), natural_decay_time: daysAhead(4) },
  { structure_id: 1_035_100_002, moon_id: 40_162_001, extraction_start_time: daysAgo(1), chunk_arrival_time: daysAhead(6), natural_decay_time: daysAhead(8) },
];

const CORP_INDUSTRY_JOBS = [
  { job_id: 710_100_001, installer_id: 2_117_500_101, activity_id: 1, blueprint_id: 1_020_000_001, blueprint_type_id: BLUEPRINT.raven, blueprint_location_id: STATION.jita44, output_location_id: STATION.jita44, facility_id: 1_035_100_001, location_id: 1_035_100_001, runs: 10, start_date: daysAgo(2), end_date: daysAhead(3), status: 'active' as const, cost: 38_200_000, product_type_id: TYPE.raven },
  { job_id: 710_100_002, installer_id: 2_117_500_103, activity_id: 1, blueprint_id: 1_020_000_002, blueprint_type_id: BLUEPRINT.hulk, blueprint_location_id: STATION.dodixieFNAP, output_location_id: STATION.dodixieFNAP, facility_id: 1_035_100_003, location_id: 1_035_100_003, runs: 5, start_date: daysAgo(4), end_date: hoursAhead(6), status: 'active' as const, cost: 61_400_000, product_type_id: TYPE.hulk },
  { job_id: 710_100_003, installer_id: CHARACTER_ID, activity_id: 4, blueprint_id: 1_020_000_003, blueprint_type_id: BLUEPRINT.ishtar, blueprint_location_id: STATION.jita44, output_location_id: STATION.jita44, facility_id: 1_035_100_001, location_id: 1_035_100_001, runs: 1, start_date: daysAgo(6), end_date: daysAhead(1), status: 'active' as const, cost: 24_900_000 },
];

const CORP_ASSETS = [
  { item_id: 1_040_100_001, type_id: TYPE.tritanium, quantity: 148_200_000, location_id: 1_035_100_001, location_type: 'item' as const, location_flag: 'CorpSAG1', is_singleton: false },
  { item_id: 1_040_100_002, type_id: TYPE.pyerite, quantity: 42_600_000, location_id: 1_035_100_001, location_type: 'item' as const, location_flag: 'CorpSAG1', is_singleton: false },
  { item_id: 1_040_100_003, type_id: TYPE.mexallon, quantity: 11_400_000, location_id: 1_035_100_001, location_type: 'item' as const, location_flag: 'CorpSAG1', is_singleton: false },
  { item_id: 1_040_100_004, type_id: TYPE.megacyte, quantity: 184_000, location_id: 1_035_100_001, location_type: 'item' as const, location_flag: 'CorpSAG1', is_singleton: false },
  { item_id: 1_040_100_005, type_id: TYPE.raven, quantity: 6, location_id: 1_035_100_003, location_type: 'item' as const, location_flag: 'CorpSAG3', is_singleton: false },
  { item_id: 1_040_100_006, type_id: TYPE.hulk, quantity: 3, location_id: 1_035_100_003, location_type: 'item' as const, location_flag: 'CorpSAG3', is_singleton: false },
  { item_id: 1_040_100_007, type_id: TYPE.ishtar, quantity: 9, location_id: 1_035_100_003, location_type: 'item' as const, location_flag: 'CorpSAG3', is_singleton: false },
  { item_id: 1_040_100_008, type_id: BLUEPRINT.raven, quantity: 1, location_id: 1_035_100_001, location_type: 'item' as const, location_flag: 'CorpSAG4', is_singleton: true },
];

// ----------------------------------------------------------- mining ledger

/**
 * Moon ore typeIDs taken from `public/data/moonOreTypes.json` — the same
 * allowlist `engine/miningTax/groupLedger.ts` gates on. A ledger row whose
 * type is off that list is dropped from the tax math entirely, so an
 * invented id produces a page of zeroes rather than an error.
 */
const MOON_ORE = {
  zeolites: 45_490,
  cobaltite: 45_494,
  vanadinite: 45_500,
  carnotite: 45_502,
} as const;

const MINING_LEDGER = Array.from({ length: 12 }, (_, day) => [
  { date: dayStamp(day + 1), quantity: 48_000 + day * 2_100, solar_system_id: SYSTEM.hek, type_id: MOON_ORE.zeolites },
  { date: dayStamp(day + 1), quantity: 26_400 + day * 1_400, solar_system_id: SYSTEM.hek, type_id: MOON_ORE.cobaltite },
  { date: dayStamp(day + 1), quantity: 18_900 + day * 900, solar_system_id: SYSTEM.hek, type_id: MOON_ORE.vanadinite },
  { date: dayStamp(day + 1), quantity: 12_200 + day * 640, solar_system_id: SYSTEM.dodixie, type_id: MOON_ORE.carnotite },
]).flat();

/**
 * Payees and assignments are ordinary Dexie records, not cache rows — and
 * their ISK figures are snapshotted onto the record at assignment time by the
 * app itself. `features/miningTax/pricing.ts` values ore through
 * `market/prices.ts`'s in-memory hub cache, which has no Dexie layer to seed,
 * so the numbers below are written directly rather than computed here.
 */
const PAYEES = [
  { id: 'payee-hek-landlord', characterId: CHARACTER_ID, name: 'Ardent Holdings', defaultTaxPct: 10, hubId: 'jita', systemId: SYSTEM.hek, updatedAt: Date.now() - 86_400_000 * 30 },
  { id: 'payee-dodixie-block', characterId: CHARACTER_ID, name: 'Kaalakiota Moon Block', defaultTaxPct: 8, hubId: 'dodixie', systemId: SYSTEM.dodixie, updatedAt: Date.now() - 86_400_000 * 22 },
];

const MINING_ASSIGNMENTS = Array.from({ length: 12 }, (_, day) => {
  const hekValue = 214_000_000 + day * 8_400_000;
  const dodixieValue = 61_000_000 + day * 2_100_000;
  // The two most recent days stay outstanding so the page shows money owed
  // rather than a fully settled ledger.
  const settled = day >= 2;
  return [
    {
      id: `assign-hek-${day}`,
      characterId: CHARACTER_ID,
      date: dayStamp(day + 1),
      solarSystemId: SYSTEM.hek,
      payeeId: 'payee-hek-landlord',
      oreLines: [
        { typeId: MOON_ORE.zeolites, quantity: 48_000 + day * 2_100 },
        { typeId: MOON_ORE.cobaltite, quantity: 26_400 + day * 1_400 },
        { typeId: MOON_ORE.vanadinite, quantity: 18_900 + day * 900 },
      ],
      taxPct: 10,
      estimatedValue: hekValue,
      taxOwed: Math.round(hekValue * 0.1),
      status: settled ? ('paid' as const) : ('outstanding' as const),
      ...(settled ? { paidAt: Date.now() - (day - 1) * 86_400_000 } : {}),
      updatedAt: Date.now() - day * 86_400_000,
    },
    {
      id: `assign-dodixie-${day}`,
      characterId: CHARACTER_ID,
      date: dayStamp(day + 1),
      solarSystemId: SYSTEM.dodixie,
      payeeId: 'payee-dodixie-block',
      oreLines: [{ typeId: MOON_ORE.carnotite, quantity: 12_200 + day * 640 }],
      taxPct: 8,
      estimatedValue: dodixieValue,
      taxOwed: Math.round(dodixieValue * 0.08),
      status: settled ? ('paid' as const) : ('outstanding' as const),
      ...(settled ? { paidAt: Date.now() - (day - 1) * 86_400_000 } : {}),
      updatedAt: Date.now() - day * 86_400_000,
    },
  ];
}).flat();

// -------------------------------------------------------------- assets/PI

const CHARACTER_ASSETS = [
  { item_id: 1_050_100_001, type_id: TYPE.tritanium, quantity: 32_400_000, location_id: STATION.jita44, location_type: 'station' as const, location_flag: 'Hangar', is_singleton: false },
  { item_id: 1_050_100_002, type_id: TYPE.pyerite, quantity: 9_800_000, location_id: STATION.jita44, location_type: 'station' as const, location_flag: 'Hangar', is_singleton: false },
  { item_id: 1_050_100_003, type_id: TYPE.mexallon, quantity: 2_640_000, location_id: STATION.jita44, location_type: 'station' as const, location_flag: 'Hangar', is_singleton: false },
  { item_id: 1_050_100_004, type_id: TYPE.isogen, quantity: 512_000, location_id: STATION.jita44, location_type: 'station' as const, location_flag: 'Hangar', is_singleton: false },
  { item_id: 1_050_100_005, type_id: TYPE.raven, quantity: 2, location_id: STATION.jita44, location_type: 'station' as const, location_flag: 'Hangar', is_singleton: false },
  { item_id: 1_050_100_006, type_id: TYPE.hulk, quantity: 1, location_id: STATION.dodixieFNAP, location_type: 'station' as const, location_flag: 'Hangar', is_singleton: true },
  { item_id: 1_050_100_007, type_id: TYPE.ishtar, quantity: 4, location_id: STATION.dodixieFNAP, location_type: 'station' as const, location_flag: 'Hangar', is_singleton: false },
  { item_id: 1_050_100_008, type_id: TYPE.muninn, quantity: 6, location_id: STATION.amarrEFA, location_type: 'station' as const, location_flag: 'Hangar', is_singleton: false },
  { item_id: 1_050_100_009, type_id: TYPE.retriever, quantity: 3, location_id: STATION.dodixieFNAP, location_type: 'station' as const, location_flag: 'Hangar', is_singleton: false },
  { item_id: 1_050_100_010, type_id: TYPE.zydrine, quantity: 88_000, location_id: STATION.jita44, location_type: 'station' as const, location_flag: 'Hangar', is_singleton: false },
];

const WALLET_JOURNAL = [
  { id: 800_100_001, date: hoursAgo(1), ref_type: 'market_transaction', description: 'Market: Ishtar', amount: 268_900_000, balance: 18_432_991_204.55, second_party_id: CHARACTER_ID },
  { id: 800_100_002, date: hoursAgo(4), ref_type: 'brokers_fee', description: "Broker's fee", amount: -2_141_200, balance: 18_164_091_204.55, first_party_id: CHARACTER_ID },
  { id: 800_100_003, date: hoursAgo(11), ref_type: 'industry_job_tax', description: 'Industry job tax', amount: -14_820_000, balance: 18_166_232_404.55, first_party_id: CHARACTER_ID },
  { id: 800_100_004, date: hoursAgo(26), ref_type: 'transaction_tax', description: 'Sales tax', amount: -5_378_000, balance: 18_181_052_404.55, first_party_id: CHARACTER_ID },
  { id: 800_100_005, date: hoursAgo(38), ref_type: 'contract_price', description: 'Contract: Muninn BPC batch', amount: -96_400_000, balance: 18_186_430_404.55, first_party_id: CHARACTER_ID },
  { id: 800_100_006, date: hoursAgo(52), ref_type: 'market_transaction', description: 'Market: Raven', amount: 212_400_000, balance: 18_282_830_404.55, second_party_id: CHARACTER_ID },
  { id: 800_100_007, date: hoursAgo(70), ref_type: 'corporation_account_withdrawal', description: 'Moon tax payout', amount: 84_200_000, balance: 18_070_430_404.55, second_party_id: CHARACTER_ID },
];

const WALLET_TRANSACTIONS = [
  { transaction_id: 810_100_001, date: hoursAgo(1), location_id: STATION.jita44, type_id: TYPE.ishtar, unit_price: 268_900_000, quantity: 1, client_id: 2_117_500_201, is_buy: false, journal_ref_id: 800_100_001, is_personal: true },
  { transaction_id: 810_100_002, date: hoursAgo(52), location_id: STATION.jita44, type_id: TYPE.raven, unit_price: 212_400_000, quantity: 1, client_id: 2_117_500_202, is_buy: false, journal_ref_id: 800_100_006, is_personal: true },
  { transaction_id: 810_100_003, date: hoursAgo(64), location_id: STATION.jita44, type_id: TYPE.tritanium, unit_price: 5.42, quantity: 8_400_000, client_id: 2_117_500_203, is_buy: true, journal_ref_id: 800_100_007, is_personal: true },
  { transaction_id: 810_100_004, date: daysAgo(3), location_id: STATION.amarrEFA, type_id: TYPE.vexor, unit_price: 31_800_000, quantity: 4, client_id: 2_117_500_204, is_buy: false, journal_ref_id: 800_100_004, is_personal: true },
];


// ------------------------------------------------------------ planetary

/**
 * Pin typeIDs and schematic ids come from `public/data/pi.json`
 * (`infrastructure.pinKindByTypeId` and `schematics`), so each pin renders as
 * the right kind of structure and each factory names a real product.
 */
const PIN = {
  extractorControlUnit: 3068,
  basicFactory: 2469,
  advancedFactory: 2470,
  storage: 2257,
  launchpad: 2256,
} as const;

/** Schematic ids: 131 Bacteria (basic), 75 Enriched Uranium (advanced). */
const SCHEMATIC = { bacteria: 131, enrichedUranium: 75 } as const;

const PLANETS = [
  { solar_system_id: SYSTEM.hek, planet_id: 40_162_100, planet_type: 'barren' as const, owner_id: CHARACTER_ID, last_update: hoursAgo(5), upgrade_level: 5, num_pins: 8 },
  { solar_system_id: SYSTEM.hek, planet_id: 40_162_104, planet_type: 'lava' as const, owner_id: CHARACTER_ID, last_update: hoursAgo(9), upgrade_level: 5, num_pins: 7 },
  { solar_system_id: SYSTEM.dodixie, planet_id: 40_073_200, planet_type: 'temperate' as const, owner_id: CHARACTER_ID, last_update: hoursAgo(2), upgrade_level: 4, num_pins: 6 },
  { solar_system_id: SYSTEM.dodixie, planet_id: 40_073_206, planet_type: 'storm' as const, owner_id: CHARACTER_ID, last_update: hoursAgo(31), upgrade_level: 5, num_pins: 8 },
];

/** One colony layout, reused per planet with the extractor expiring at a different hour. */
function colonyDetail(expiresInHours: number): unknown {
  return {
    pins: [
      {
        pin_id: 1_001, type_id: PIN.extractorControlUnit, latitude: 1.1, longitude: 2.3,
        install_time: hoursAgo(72 - expiresInHours), expiry_time: hoursAhead(expiresInHours),
        last_cycle_start: hoursAgo(1),
        extractor_details: {
          heads: [
            { head_id: 0, latitude: 1.12, longitude: 2.31 },
            { head_id: 1, latitude: 1.14, longitude: 2.28 },
            { head_id: 2, latitude: 1.09, longitude: 2.35 },
          ],
          cycle_time: 3_600, head_radius: 0.012, product_type_id: 2_073, qty_per_cycle: 11_400,
        },
      },
      { pin_id: 1_002, type_id: PIN.basicFactory, latitude: 1.2, longitude: 2.4, schematic_id: SCHEMATIC.bacteria, last_cycle_start: hoursAgo(1), factory_details: { schematic_id: SCHEMATIC.bacteria } },
      { pin_id: 1_003, type_id: PIN.basicFactory, latitude: 1.22, longitude: 2.42, schematic_id: SCHEMATIC.bacteria, last_cycle_start: hoursAgo(1), factory_details: { schematic_id: SCHEMATIC.bacteria } },
      { pin_id: 1_004, type_id: PIN.advancedFactory, latitude: 1.3, longitude: 2.5, schematic_id: SCHEMATIC.enrichedUranium, last_cycle_start: hoursAgo(1), factory_details: { schematic_id: SCHEMATIC.enrichedUranium } },
      { pin_id: 1_005, type_id: PIN.storage, latitude: 1.4, longitude: 2.6, contents: [{ type_id: 2_073, amount: 84_200 }, { type_id: 2_393, amount: 12_400 }] },
      { pin_id: 1_006, type_id: PIN.launchpad, latitude: 1.5, longitude: 2.7, contents: [{ type_id: 44, amount: 3_200 }] },
    ],
    links: [
      { source_pin_id: 1_001, destination_pin_id: 1_005, link_level: 4 },
      { source_pin_id: 1_005, destination_pin_id: 1_002, link_level: 4 },
      { source_pin_id: 1_005, destination_pin_id: 1_003, link_level: 4 },
      { source_pin_id: 1_002, destination_pin_id: 1_004, link_level: 3 },
      { source_pin_id: 1_003, destination_pin_id: 1_004, link_level: 3 },
      { source_pin_id: 1_004, destination_pin_id: 1_006, link_level: 3 },
    ],
    routes: [
      { route_id: 1, source_pin_id: 1_001, destination_pin_id: 1_005, content_type_id: 2_073, quantity: 11_400 },
      { route_id: 2, source_pin_id: 1_005, destination_pin_id: 1_002, content_type_id: 2_073, quantity: 3_000 },
      { route_id: 3, source_pin_id: 1_005, destination_pin_id: 1_003, content_type_id: 2_073, quantity: 3_000 },
      { route_id: 4, source_pin_id: 1_002, destination_pin_id: 1_004, content_type_id: 2_393, quantity: 40 },
      { route_id: 5, source_pin_id: 1_004, destination_pin_id: 1_006, content_type_id: 44, quantity: 5 },
    ],
  };
}

const PLANET_EXPIRY_HOURS = [19, 41, 6, 63];

// ------------------------------------------------------------------ build

function cacheRows(): CacheRow[] {
  const own = (key: string, value: unknown, truncated = false): CacheRow => ({
    characterId: CHARACTER_ID,
    key,
    value,
    truncated,
  });
  const global = (key: string, value: unknown): CacheRow => ({ characterId: GLOBAL, key, value });

  return [
    // Character
    own('skills', CHARACTER_SKILLS),
    own('skillqueue', SKILL_QUEUE),
    own('attributes', ATTRIBUTES),
    own('implants', [...IMPLANT_IDS]),
    own('wallet:balance', 18_432_991_204.55),
    own('wallet:journal', WALLET_JOURNAL),
    own('wallet:transactions', WALLET_TRANSACTIONS),
    own('assets', CHARACTER_ASSETS),
    own('clones', { jump_clones: [] }),
    own('contacts', []),
    own('calendar', []),
    own('mail', []),
    own('mail:labels', { labels: [], total_unread_count: 0 }),
    own('planets', PLANETS),
    ...PLANETS.map((planet, index) =>
      own(`planet:${planet.planet_id}`, colonyDetail(PLANET_EXPIRY_HOURS[index]))
    ),

    // Industry
    own('blueprints', BLUEPRINTS),
    own('industryJobs', INDUSTRY_JOBS),

    // Market
    own('orders', OPEN_ORDERS),
    own('orders:history', ORDER_HISTORY),

    // Contracts
    own('contracts', CONTRACTS),
    ...Object.entries(CONTRACT_ITEMS).map(([id, items]) => own(`contract-items:${id}`, items)),
    own(`contract-location:${STATION.jita44}`, 'Jita IV - Moon 4 - Caldari Navy Assembly Plant'),
    own(`contract-location:${STATION.amarrEFA}`, "Amarr VIII (Oris) - Emperor Family Academy"),
    own(`contract-location:${STATION.dodixieFNAP}`, 'Dodixie IX - Moon 20 - Federation Navy Assembly Plant'),
    own(`contract-location:${STATION.renImperial}`, 'Rens VI - Moon 8 - Brutor Tribe Treasury'),

    // Mining tax
    own('miningTax:ledger', MINING_LEDGER),

    // Corp: identity, roles, then the corp-scoped rows
    own('corpIdentity', CORPORATION_ID),
    own('corpRoles', { roles: ['Director', 'Accountant', 'Factory_Manager', 'Station_Manager'] }),
    own(corpKey('structures'), CORP_STRUCTURES),
    own(corpKey('miningExtractions'), CORP_EXTRACTIONS),
    own(corpKey('industryJobs'), CORP_INDUSTRY_JOBS),
    own(corpKey('wallet:balances'), CORP_WALLET_DIVISIONS),
    own(corpKey('divisions'), CORP_DIVISIONS),
    own(corpKey('wallet:journal:1'), CORP_JOURNAL),
    own(corpKey('wallet:transactions:1'), []),
    own(corpKey('members'), CORP_MEMBER_IDS),
    own(corpKey('membertracking'), CORP_MEMBER_TRACKING),
    own(corpKey('assets:corporation'), CORP_ASSETS),
    own(corpKey('blueprints:corporation'), []),

    // Public snapshots (character-independent)
    global('publicContractOffersAll', { rows: offerRows(), lastSyncedAt: Date.now() - 11 * 60_000 }),
    global('publicCourierContracts', { rows: COURIER_ROWS, lastSyncedAt: Date.now() - 11 * 60_000 }),
    global('publicContractOffers', { rows: bpcRows(), lastSyncedAt: Date.now() - 11 * 60_000 }),
    ...Object.values(REGION).map((regionId) =>
      global(`bpc-region:${regionId}`, { region_id: regionId, name: REGION_NAMES[regionId] })
    ),

    // Skill + implant names for every surface that resolves them through ESI
    // rather than the SDE snapshot.
    ...typeInfoRows(),
  ];
}

const REGION_NAMES: Record<number, string> = {
  [REGION.theForge]: 'The Forge',
  [REGION.domain]: 'Domain',
  [REGION.sinqLaison]: 'Sinq Laison',
  [REGION.heimatar]: 'Heimatar',
  [REGION.metropolis]: 'Metropolis',
};

// ------------------------------------------------- editable Dexie records

const SKILL_PLANS = [
  {
    id: 'plan-capital-industry',
    characterId: CHARACTER_ID,
    name: 'Capital Production',
    entries: [
      { skillTypeID: SKILL.advancedMassProduction, targetLevel: 5, priority: 'high' },
      { skillTypeID: SKILL.capitalShipConstruction, targetLevel: 4 },
      { skillTypeID: SKILL.supplyChainManagement, targetLevel: 5 },
      { skillTypeID: SKILL.advancedIndustry, targetLevel: 5 },
      { skillTypeID: SKILL.metallurgy, targetLevel: 5 },
      { skillTypeID: SKILL.research, targetLevel: 5 },
      { skillTypeID: SKILL.laboratoryOperation, targetLevel: 5 },
    ],
    remapCount: 1,
    markers: [2],
    updatedAt: Date.now() - 86_400_000 * 2,
  },
  {
    id: 'plan-perfect-refining',
    characterId: CHARACTER_ID,
    name: 'Perfect Refining',
    entries: [
      { skillTypeID: SKILL.astrogeology, targetLevel: 5 },
      { skillTypeID: SKILL.exhumers, targetLevel: 5, priority: 'high' },
      { skillTypeID: SKILL.miningBarge, targetLevel: 5 },
      { skillTypeID: SKILL.reactions, targetLevel: 5 },
      { skillTypeID: SKILL.massReactions, targetLevel: 4 },
    ],
    remapCount: 0,
    markers: [],
    updatedAt: Date.now() - 86_400_000 * 9,
  },
  {
    id: 'plan-market-mogul',
    characterId: CHARACTER_ID,
    name: 'Market Mogul',
    entries: [
      { skillTypeID: SKILL.accounting, targetLevel: 5 },
      { skillTypeID: SKILL.brokerRelations, targetLevel: 5, priority: 'high' },
      { skillTypeID: SKILL.wholesale, targetLevel: 5 },
      { skillTypeID: SKILL.tycoon, targetLevel: 4 },
      { skillTypeID: SKILL.marketing, targetLevel: 4 },
      { skillTypeID: SKILL.daytrading, targetLevel: 3 },
      { skillTypeID: SKILL.visibility, targetLevel: 3 },
      { skillTypeID: SKILL.procurement, targetLevel: 3 },
    ],
    remapCount: 2,
    markers: [],
    updatedAt: Date.now() - 86_400_000 * 21,
  },
];

const BUILD_PLANS = [
  { id: 'build-raven-line', characterId: CHARACTER_ID, name: 'Raven line — Jita', blueprintTypeID: BLUEPRINT.raven, runs: 6, me: 10, te: 20, facility: 'engineeringComplex', rigLevel: 'T2', security: 'highsec', hubId: 'jita', buildSystemId: SYSTEM.perimeter, buildSystemName: 'Perimeter', facilityTaxPct: 1, updatedAt: Date.now() - 86_400_000 },
  { id: 'build-ishtar-line', characterId: CHARACTER_ID, name: 'Ishtar line — Perimeter', blueprintTypeID: BLUEPRINT.ishtar, runs: 12, me: 10, te: 20, facility: 'engineeringComplex', rigLevel: 'T2', security: 'highsec', hubId: 'jita', buildSystemId: SYSTEM.perimeter, buildSystemName: 'Perimeter', facilityTaxPct: 1, updatedAt: Date.now() - 86_400_000 * 3 },
  { id: 'build-muninn-batch', characterId: CHARACTER_ID, name: 'Muninn batch — Dodixie', blueprintTypeID: BLUEPRINT.muninn, runs: 8, me: 9, te: 18, facility: 'npcStation', rigLevel: 'none', security: 'highsec', hubId: 'dodixie', updatedAt: Date.now() - 86_400_000 * 6 },
  { id: 'build-hulk-run', characterId: CHARACTER_ID, name: 'Hulk run — Dodixie', blueprintTypeID: BLUEPRINT.hulk, runs: 4, me: 10, te: 20, facility: 'engineeringComplex', rigLevel: 'T1', security: 'highsec', hubId: 'dodixie', updatedAt: Date.now() - 86_400_000 * 12 },
];

/**
 * `eventId` values come from `features/notifications/events.ts`'s catalog and
 * `eveType` from `eveTypeLabel.ts`'s table. An id outside either list is not
 * an error — `alertGroupLabel` just falls through and prints the raw id as
 * the group heading, which is what an invented one looks like on screen.
 */

/**
 * Production Records: what the Industry "Records" tab shows, and what puts a
 * number in the Build Plan list's Runs column (`useRunCountsByPlan` reads
 * `db.productionRuns`, not the cache).
 */
const PRODUCTION_RUNS = [
  { id: 'run-raven-1', characterId: CHARACTER_ID, buildPlanId: 'build-raven-line', productTypeID: TYPE.raven, quantity: 6, materialCost: 742_400_000, jobFee: 22_180_000, totalCost: 764_580_000, loggedAt: Date.now() - 86_400_000 * 4, updatedAt: Date.now() - 86_400_000 * 4 },
  { id: 'run-raven-2', characterId: CHARACTER_ID, buildPlanId: 'build-raven-line', productTypeID: TYPE.raven, quantity: 4, materialCost: 495_000_000, jobFee: 14_820_000, totalCost: 509_820_000, loggedAt: Date.now() - 86_400_000 * 11, updatedAt: Date.now() - 86_400_000 * 11 },
  { id: 'run-ishtar-1', characterId: CHARACTER_ID, buildPlanId: 'build-ishtar-line', productTypeID: TYPE.ishtar, quantity: 12, materialCost: 2_284_000_000, jobFee: 66_420_000, totalCost: 2_350_420_000, loggedAt: Date.now() - 86_400_000 * 6, updatedAt: Date.now() - 86_400_000 * 6 },
  { id: 'run-muninn-1', characterId: CHARACTER_ID, buildPlanId: 'build-muninn-batch', productTypeID: TYPE.muninn, quantity: 8, materialCost: 1_104_000_000, jobFee: 38_960_000, totalCost: 1_142_960_000, loggedAt: Date.now() - 86_400_000 * 9, updatedAt: Date.now() - 86_400_000 * 9 },
  { id: 'run-hulk-1', characterId: CHARACTER_ID, buildPlanId: 'build-hulk-run', productTypeID: TYPE.hulk, quantity: 4, materialCost: 786_200_000, jobFee: 41_200_000, totalCost: 827_400_000, loggedAt: Date.now() - 86_400_000 * 15, updatedAt: Date.now() - 86_400_000 * 15 },
];

/** Sales linked back to a run — what turns a Record's cost into realised margin. */
const PRODUCTION_SALE_LINKS = [
  { id: `${CHARACTER_ID}:txn:810100002`, characterId: CHARACTER_ID, runId: 'run-raven-1', transactionId: 810_100_002, quantity: 3, unitPrice: 212_400_000, linkedAt: Date.now() - 86_400_000 * 2, updatedAt: Date.now() - 86_400_000 * 2 },
  { id: `${CHARACTER_ID}:txn:810100001`, characterId: CHARACTER_ID, runId: 'run-ishtar-1', transactionId: 810_100_001, quantity: 7, unitPrice: 268_900_000, linkedAt: Date.now() - 3_600_000, updatedAt: Date.now() - 3_600_000 },
  { id: `${CHARACTER_ID}:manual:muninn-1`, characterId: CHARACTER_ID, runId: 'run-muninn-1', quantity: 8, unitPrice: 179_500_000, linkedAt: Date.now() - 86_400_000 * 5, updatedAt: Date.now() - 86_400_000 * 5 },
  { id: `${CHARACTER_ID}:manual:hulk-1`, characterId: CHARACTER_ID, runId: 'run-hulk-1', quantity: 4, unitPrice: 254_000_000, linkedAt: Date.now() - 86_400_000 * 12, updatedAt: Date.now() - 86_400_000 * 12 },
];

const NOTIFICATION_FEED = [
  { id: 'feed-1', characterId: CHARACTER_ID, eventId: 'industryJobComplete', title: 'Industry Job Complete', body: 'Muninn Blueprint — 6 runs finished at Dodixie IX - Moon 20.', firedAt: Date.now() - 3 * 3_600_000, subjectId: 700_100_003 },
  { id: 'feed-2', characterId: CHARACTER_ID, eventId: 'structureFuelLow', title: 'Structure Fuel Low', body: 'Hek - Vespera Refinery has under 5 days of fuel remaining.', firedAt: Date.now() - 7 * 3_600_000, subjectId: 1_035_100_002 },
  { id: 'feed-3', characterId: CHARACTER_ID, eventId: 'marketOrderFilled', title: 'Sell Order Filled', body: 'Ishtar sold for 268,900,000.00 ISK in Jita IV - Moon 4.', firedAt: Date.now() - 9 * 3_600_000, subjectId: 680_100_002 },
  { id: 'feed-4', characterId: CHARACTER_ID, eventId: 'contractAccepted', title: 'Contract Accepted', body: 'Jita -> Dodixie mineral run was accepted by a courier.', firedAt: Date.now() - 14 * 3_600_000, subjectId: 220_100_002 },
  { id: 'feed-5', characterId: CHARACTER_ID, eventId: 'eveNotification', title: 'Moon Extraction Ready', body: 'The extraction at Hek - Vespera Refinery arrives in 2 days.', firedAt: Date.now() - 20 * 3_600_000, eveType: 'MoonminingExtractionFinished' },
  { id: 'feed-6', characterId: CHARACTER_ID, eventId: 'skillLevelComplete', title: 'Skill Level Complete', body: 'Advanced Industry trained to level V.', firedAt: Date.now() - 30 * 3_600_000 },
  { id: 'feed-7', characterId: CHARACTER_ID, eventId: 'marketOrderFilled', title: 'Sell Order Filled', body: 'Raven sold for 212,400,000.00 ISK in Jita IV - Moon 4.', firedAt: Date.now() - 38 * 3_600_000, subjectId: 680_100_001 },
  { id: 'feed-8', characterId: CHARACTER_ID, eventId: 'eveNotification', title: 'Corporation Bill Issued', body: 'An office rental bill is due in 6 days.', firedAt: Date.now() - 46 * 3_600_000, eveType: 'CorpAllBillMsg' },
  { id: 'feed-9', characterId: CHARACTER_ID, eventId: 'priceAlertTriggered', title: 'Quickbar Price Alert', body: 'Megacyte in The Forge crossed below 3,000.00 ISK.', firedAt: Date.now() - 55 * 3_600_000, typeId: TYPE.megacyte },
  { id: 'feed-10', characterId: CHARACTER_ID, eventId: 'corpIndustryJobReady', title: 'Corp Industry Job Ready', body: 'Hulk Blueprint — 5 runs ready at Dodixie - Vespera Staging.', firedAt: Date.now() - 61 * 3_600_000, subjectId: 710_100_002 },
  { id: 'feed-11', characterId: CHARACTER_ID, eventId: 'eveNotification', title: 'Structure Low on Fuel', body: 'Hek - Vespera Refinery will run out of fuel in 4 days.', firedAt: Date.now() - 66 * 3_600_000, eveType: 'StructureFuelAlert' },
  { id: 'feed-12', characterId: CHARACTER_ID, eventId: 'corpMemberJoined', title: 'Member Joined', body: 'A new pilot joined Vespera Industrial Combine.', firedAt: Date.now() - 70 * 3_600_000 },
];

export function buildFixture(): SeedPayload {
  return {
    cacheRows: cacheRows(),
    tables: {
      skillPlans: SKILL_PLANS,
      buildPlans: BUILD_PLANS,
      notificationFeed: NOTIFICATION_FEED,
      payees: PAYEES,
      productionRuns: PRODUCTION_RUNS,
      productionSaleLinks: PRODUCTION_SALE_LINKS,
      miningTaxAssignments: MINING_ASSIGNMENTS,
    },
    // Deliberately no `whatsNew.lastSeenVersion`: the app bootstraps a device
    // that has never recorded one to the current version silently, so leaving
    // it alone is what keeps the What's New dialog off every screenshot.
    settings: [],
  };
}

export { CHARACTER_NAME };
