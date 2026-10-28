// Paths, plausibility bands and dump-table ids shared by the SDE bake modules
// (scripts/build-sde.mjs and scripts/lib/bake*.mjs).
import { join } from 'node:path';
import { ROOT, SCRIPTS_DIR } from './paths.mjs';

// The build this bake used, for the nightly refresh's "is there a newer one"
// check (.github/workflows/sde-refresh.yml).
export const BUILD_STAMP_FILE = join(SCRIPTS_DIR, 'sde-build.json');
export const OUT_DIR = join(ROOT, 'public', 'data');
// Default cache lives inside the repo (gitignored), not the world-shared
// /tmp: a shared tmpdir is writable by any local user/process, so a
// world-readable-and-writable cache dir there is a poisoning risk (another
// process could plant a malicious CSV at the exact cache path this script
// will trust on the next run). SDE_CACHE_DIR still overrides for CI/custom
// setups.
export const CACHE_DIR = process.env.SDE_CACHE_DIR || join(ROOT, '.cache', 'sde');

export const FILES = [
  'invTypes.csv',
  'invGroups.csv',
  'dgmTypeAttributes.csv',
  'dgmAttributeTypes.csv',
  'dgmAttributeCategories.csv',
  'eveUnits.csv',
  'invTypeMaterials.csv',
  'industryActivity.csv',
  'industryActivityMaterials.csv',
  'industryActivityProducts.csv',
  'industryActivitySkills.csv',
  // Invention success chance per product (issue #3987); see `invention.json`.
  'industryActivityProbabilities.csv',
  'invMarketGroups.csv',
  'invMetaTypes.csv',
  'planetSchematics.csv',
  'planetSchematicsTypeMap.csv',
  'planetSchematicsPinMap.csv',
  'invMetaGroups.csv',
  'mapRegions.csv',
  'mapSolarSystems.csv',
  // Stargate adjacency, for the local jump graph (issue #942); see
  // `solarSystemJumps` below.
  'mapSolarSystemJumps.csv',
  // Per-planet radius, for PI link cost (issue #440). Only the group-7 rows
  // are kept; see `piPlanetRadius` below.
  'mapDenormalize.csv',
  'staStations.csv',
  // NPC corporation -> faction, for the owner faction on stations.json (issue
  // #1675); ESI omits `faction_id` for NPC corps.
  'crpNPCCorporations.csv',
  // Alpha clone skill caps, per clone grade (issue #1233); see `alphaMaxLevel`
  // on skills.json below.
  'chrCloneGradeSkills.csv',
  // Ship Mastery tiers; see `masteries.json` below.
  'certMasteries.csv',
  'certSkills.csv',
  // Which skill boosts which item attribute; see `skillAttributeModifiers.json` below.
  'dgmEffects.csv',
  'dgmTypeEffects.csv',
  // Ship Tree bake (shipTree.json); see `lib/shipTree.mjs`.
  'invTraits.csv',
  'chrFactions.csv',
  'shipSkills.csv',
  'shipTreeGroups.csv',
  'shipTreeGroupPreReqSkills.csv',
  'shipTreeFactions.csv',
];

export const MARKET_OUT_DIR = join(OUT_DIR, 'market');
// Delve: canary region with no NPC station that still carries busy
// player-structure markets (GLOSSARY.md — "31 nullsec regions have none").
export const DELVE_REGION_ID = 10000060;
// Jita: the game's busiest system, used as the jump graph's canary — if the
// stargate join ever produces nothing, it shows up here first.
export const JITA_SYSTEM_ID = 30000142;
// Regions with live orders, as counted against ESI on 2026-10-15: 77 = 68
// known-space + 9 wormhole (C-R00012 had emptied since the last bake's 10).
// Wormhole player markets come and go, so the floor sits under the stable
// known-space count, not the last total. A failing probe throws; this band
// catches ESI silently answering empty for many regions (issue #3891).
export const MARKET_REGIONS_MIN = 65;
export const MARKET_REGIONS_MAX = 116;
// Ore, ice and moon-ore types carrying attribute 790 (Reprocessing Skill), as
// counted against the bake on 2026-09-14: 338. A join that silently breaks
// (a renamed CSV column, a dropped filter) would make this 0, not slightly
// off, so a generous band around the known count still catches that while
// tolerating CCP adding a handful more ore variants later (issue #1058).
export const REPROCESSING_SPECIALISATION_MIN = 300;
export const REPROCESSING_SPECIALISATION_MAX = 500;
// Skills an Alpha clone can train at all, as counted against the dump on
// 2026-09-22: 175, identical across all four clone grades. Same idea as the
// band above — a broken join lands at 0, not slightly off (issue #1233).
export const ALPHA_SKILLS_MIN = 150;
export const ALPHA_SKILLS_MAX = 250;
// A region whose every solar system sits within this many meters of the
// coordinate origin is not a place in the game universe — the nearest real
// system (Zarzakh) sits ~5.66e15 m out, ~5.7 billion times farther than this
// bound. GPMR-01, the region PLEX trades in, holds one such system (GPMS-01,
// position 1,1,1 — verified against Fuzzwork's mapSolarSystems.csv and ESI
// 2026-08-31): CCP synthesized it purely to hold a cluster-wide market, so it
// is a Global Market Region (GLOSSARY.md round 12) rather than a place a
// picker should offer.
export const SYNTHETIC_POSITION_MAX_M = 1_000_000;

// Dogma attribute IDs (verified against fuzzwork dgmAttributeTypes.csv):
// 275 skillTimeConstant (rank), 180 primaryAttribute, 181 secondaryAttribute
// requiredSkillN -> requiredSkillNLevel pairs:
// 182->277, 183->278, 184->279, 1285->1286, 1289->1287, 1290->1288 (verified: dgmAttributeTypes — 1287=requiredSkill5Level, 1288=requiredSkill6Level)
export const RANK_ATTR = 275;
export const PRIMARY_ATTR = 180;
export const SECONDARY_ATTR = 181;
// Reprocessing Skill (verified against dgmAttributeTypes.csv: id 790, unit
// typeID) — names the specialisation skill a refinable type answers to
// directly. Present on every ore/ice/moon-ore type probed (338 of 338),
// absent on modules/ships/ammo, which refine under Scrapmetal Processing
// instead (issue #1058).
export const REPROCESSING_SKILL_ATTR = 790;
// Scrapmetal Processing (12196) — the specialisation every refinable type
// falls back to when it carries no REPROCESSING_SKILL_ATTR of its own.
export const SCRAPMETAL_PROCESSING_SKILL_ID = 12196;
export const PREREQ_PAIRS = [
  [182, 277],
  [183, 278],
  [184, 279],
  [1285, 1286],
  [1289, 1287],
  [1290, 1288],
];
export const CHAR_ATTR_NAMES = {
  164: 'charisma',
  165: 'intelligence',
  166: 'memory',
  167: 'perception',
  168: 'willpower',
};
export const SKILL_CATEGORY_ID = 16;
export const SHIP_CATEGORY_ID = 6;
export const BLUEPRINT_CATEGORY_ID = 9;
// invention.json plausibility (issue #3987), counted against dump
// 3607705_20261012_133001: 1,003 blueprints invent, 3,518 copy. A broken join
// lands at 0. Decryptor controls: in-game values (EVE University wiki, Invention).
export const INVENTION_BLUEPRINTS_MIN = 800;
export const INVENTION_BLUEPRINTS_MAX = 1300;
export const COPYING_BLUEPRINTS_MIN = 3000;
export const COPYING_BLUEPRINTS_MAX = 5000;
export const INVENTION_CONTROL_BLUEPRINT = 691;
export const INVENTION_CONTROL_PRODUCT = 11372;
export const DECRYPTOR_CONTROLS = [
  {
    typeID: 34201,
    name: 'Accelerant Decryptor',
    probabilityMultiplier: 1.2,
    me: 2,
    te: 10,
    runs: 1,
  },
  {
    typeID: 34202,
    name: 'Attainment Decryptor',
    probabilityMultiplier: 1.8,
    me: -1,
    te: 4,
    runs: 4,
  },
];
// Mastery tiers: certMasteries.csv's masteryLevel is 0-4 (5 tiers, I-V);
// certSkills.csv's certLevelInt is 1-5 for the same tiers, so
// certLevelInt = masteryLevel + 1 is the join key between the two files.
export const MASTERY_TIER_COUNT = 5;
// Ships carrying at least one mastery tier, as counted against the dump on
// 2026-09-23: 476. Same idea as ALPHA_SKILLS_MIN/MAX above — a broken join
// (wrong column, wrong category filter) lands at 0, not slightly off.
export const MASTERY_SHIPS_MIN = 350;
export const MASTERY_SHIPS_MAX = 700;
// CCP Certified Skill Plans with a career path, as counted against CCP's
// export on 2026-09-30: 39. A broken bake (a renamed field, a dropped filter)
// lands at 0, not slightly off (issue #2392).
export const CERTIFIED_PLANS_MIN = 25;
export const CERTIFIED_PLANS_MAX = 80;
// Basic agents, NPC corporations (CCP's deleted ones left out) and factions in
// CCP's export on 2026-10-28 (build 3654997): 8,775, 280 and 27. A broken
// filter (a renamed `agent` field) lands at 0, not slightly off. Caldari Navy
// belongs to the Caldari State: a control for the corporation -> faction join.
export const AGENTS_MIN = 7000;
export const AGENTS_MAX = 11000;
export const NPC_CORPORATIONS_MIN = 250;
export const NPC_CORPORATIONS_MAX = 320;
export const NPC_FACTIONS_MIN = 20;
export const NPC_FACTIONS_MAX = 40;
export const NPC_CORPORATION_CONTROL = { id: 1000035, name: 'Caldari Navy', factionId: 500001 };
// Combat-group certificates, as counted against CCP's export on 2026-09-30:
// 68. Same idea — a broken group filter lands at 0 (issue #2390).
export const CERTIFICATES_MIN = 50;
export const CERTIFICATES_MAX = 90;
// Ship Tree hulls/factions/classes, as counted against the dump on
// 2026-09-26: 360 hulls, 17 factions, 52 classes. Same idea as
// MASTERY_SHIPS_MIN/MAX above — a broken join (wrong category filter, wrong
// CSV column) lands at 0 or wildly off, not slightly off.
export const SHIP_TREE_HULLS_MIN = 300;
export const SHIP_TREE_HULLS_MAX = 450;
export const SHIP_TREE_FACTIONS_MIN = 15;
export const SHIP_TREE_FACTIONS_MAX = 22;
export const SHIP_TREE_CLASSES_MIN = 45;
export const SHIP_TREE_CLASSES_MAX = 65;
// dgmEffects.csv's `modifierInfo` JSON column names one of six `func` kinds;
// only these two ever gate on a required skill (the others key on a
// location/group instead) — see `skillAttributeModifiers.json` below.
export const SKILL_GATED_MODIFIER_FUNCS = new Set([
  'LocationRequiredSkillModifier',
  'OwnerRequiredSkillModifier',
]);
// Dogma's ModifierOperation enum, verified against effect names that spell
// out their own operation. Only PostPercent (a plain "+N% per level" bonus)
// is resolved; the design doc's small special-case list covers the rest.
export const POST_PERCENT_OPERATION = 6;
// Plausibility band for `skillAttributeModifiers.json`, counted against the
// dump on 2026-09-23 (64 attributes, 261 rows). A broken join lands at 0.
export const SKILL_ATTRIBUTE_MODIFIERS_MIN = 30;
export const SKILL_ATTRIBUTE_MODIFIERS_MAX = 200;
export const SKILL_ATTRIBUTE_MODIFIER_ROWS_MIN = 100;
export const SKILL_ATTRIBUTE_MODIFIER_ROWS_MAX = 600;
export const MANUFACTURING_ACTIVITY_ID = 1;
// Reaction formulas (issue #460): SDE industryActivity* rows for this
// activity ID are disjoint from every other activity — verified against a
// live industryActivity.csv dump (0 typeIDs shared with manufacturing,
// research or invention), so a formula is always unresearched (ME0/TE0).
export const REACTION_ACTIVITY_ID = 11;

// Merlin: a manufacturing material of the Hawk Blueprint, with a packaged
// volume CCP has held stable for years. Catches an export that silently stops
// carrying `packagedVolume`, rather than baking assembled hull sizes with no
// build error (issue #1085).
export const PACKAGED_VOLUME_CONTROL_TYPE_ID = 603; // Merlin
export const PACKAGED_VOLUME_CONTROL_EXPECTED = 2500;
// Tritanium: the mineral control for market/types.json's plain `volume`.
export const MARKET_VOLUME_CONTROL_TYPE_ID = 34;
export const MARKET_VOLUME_CONTROL_EXPECTED = 0.01;
