import { join } from 'node:path';
import { ROOT, SCRIPTS_DIR } from './paths.mjs';

export const BUILD_STAMP_FILE = join(SCRIPTS_DIR, 'sde-build.json');
export const OUT_DIR = join(ROOT, 'public', 'data');
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
  'industryBlueprints.csv',
  'industryActivitySkills.csv',
  'industryActivityProbabilities.csv',
  'invMarketGroups.csv',
  'invMetaTypes.csv',
  'planetSchematics.csv',
  'planetSchematicsTypeMap.csv',
  'planetSchematicsPinMap.csv',
  'invMetaGroups.csv',
  'staStations.csv',
  'crpNPCCorporations.csv',
  'chrCloneGradeSkills.csv',
  'certMasteries.csv',
  'certSkills.csv',
  'dgmEffects.csv',
  'dgmTypeEffects.csv',
  'invTraits.csv',
  'chrFactions.csv',
  'shipSkills.csv',
  'shipTreeGroups.csv',
  'shipTreeGroupPreReqSkills.csv',
  'shipTreeFactions.csv',
];

export const MARKET_OUT_DIR = join(OUT_DIR, 'market');
export const DELVE_REGION_ID = 10000060;
export const JITA_SYSTEM_ID = 30000142;
export const MARKET_REGIONS_MIN = 65;
export const MARKET_REGIONS_MAX = 116;
export const REPROCESSING_SPECIALISATION_MIN = 300;
export const REPROCESSING_SPECIALISATION_MAX = 500;
export const ALPHA_SKILLS_MIN = 150;
export const ALPHA_SKILLS_MAX = 250;
export const SYNTHETIC_POSITION_MAX_M = 1_000_000;

export const RANK_ATTR = 275;
export const PRIMARY_ATTR = 180;
export const SECONDARY_ATTR = 181;
export const REPROCESSING_SKILL_ATTR = 790;
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
export const MATERIAL_CATEGORY_ID = 4;
export const ASTEROID_CATEGORY_ID = 25;
export const SHIP_CATEGORY_ID = 6;
export const BLUEPRINT_CATEGORY_ID = 9;
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
export const MASTERY_TIER_COUNT = 5;
export const MASTERY_SHIPS_MIN = 350;
export const MASTERY_SHIPS_MAX = 700;
export const CERTIFIED_PLANS_MIN = 25;
export const CERTIFIED_PLANS_MAX = 80;
export const STATION_TAKE_EXCEPTIONS_MIN = 50;
export const STATION_TAKE_EXCEPTIONS_MAX = 300;
export const AGENTS_MIN = 7000;
export const AGENTS_MAX = 11000;
export const NPC_CORPORATIONS_MIN = 250;
export const NPC_CORPORATIONS_MAX = 320;
export const NPC_FACTIONS_MIN = 20;
export const NPC_FACTIONS_MAX = 40;
export const NPC_CORPORATION_CONTROL = { id: 1000035, name: 'Caldari Navy', factionId: 500001 };
export const CERTIFICATES_MIN = 50;
export const CERTIFICATES_MAX = 90;
export const SHIP_TREE_HULLS_MIN = 300;
export const SHIP_TREE_HULLS_MAX = 450;
export const SHIP_TREE_FACTIONS_MIN = 15;
export const SHIP_TREE_FACTIONS_MAX = 22;
export const SHIP_TREE_CLASSES_MIN = 45;
export const SHIP_TREE_CLASSES_MAX = 65;
export const SKILL_GATED_MODIFIER_FUNCS = new Set([
  'LocationRequiredSkillModifier',
  'OwnerRequiredSkillModifier',
]);
export const POST_PERCENT_OPERATION = 6;
export const SKILL_ATTRIBUTE_MODIFIERS_MIN = 30;
export const SKILL_ATTRIBUTE_MODIFIERS_MAX = 200;
export const SKILL_ATTRIBUTE_MODIFIER_ROWS_MIN = 100;
export const SKILL_ATTRIBUTE_MODIFIER_ROWS_MAX = 600;
export const MANUFACTURING_ACTIVITY_ID = 1;
export const REACTION_ACTIVITY_ID = 11;

export const PACKAGED_VOLUME_CONTROL_TYPE_ID = 603;
export const PACKAGED_VOLUME_CONTROL_EXPECTED = 2500;
export const MARKET_VOLUME_CONTROL_TYPE_ID = 34;
export const MARKET_VOLUME_CONTROL_EXPECTED = 0.01;
