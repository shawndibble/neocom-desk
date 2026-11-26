#!/usr/bin/env node

import { runSanityChecks } from './lib/bakeChecks.mjs';
import { CACHE_DIR, FILES, SHIP_CATEGORY_ID } from './lib/bakeConstants.mjs';
import { download, parseCsv } from './lib/bakeCsv.mjs';
import {
  MAP_FILES,
  bakeGatePositions,
  mapJumpPairs,
  mapRegions,
  mapSystems,
} from './lib/bakeMap.mjs';
import { bakeIndustry } from './lib/bakeIndustry.mjs';
import { bakeMarket } from './lib/bakeMarket.mjs';
import { bakePi } from './lib/bakePi.mjs';
import { bakeSkills } from './lib/bakeSkills.mjs';
import { writeOutputs } from './lib/bakeWrite.mjs';
import { readCcpStaticDataFiles } from './lib/ccpStaticData.mjs';
import { bakeCertificates } from './lib/certificates.mjs';
import { bakeCertifiedPlans, factionNames, parseJsonl } from './lib/certifiedPlans.mjs';
import { USER_AGENT as ESI_USER_AGENT } from './lib/constants.mjs';
import { bakeCharacterTitles } from './lib/characterTitles.mjs';
import { bakeShipFlight, bakeShipMass, bakeWormholeMass } from './lib/jumpMass.mjs';
import { bakeMilitaryCampaigns } from './lib/militaryCampaigns.mjs';
import { bakeMutaplasmids, dogmaAttributeInfo } from './lib/mutaplasmids.mjs';
import { bakeAgents, bakeNpcCorporations } from './lib/npcAgents.mjs';
import { ccpBuildFromSdeJsonl, fetchFuzzworkDump } from './lib/sdeBuild.mjs';
import { buildShipTree } from './lib/shipTree.mjs';
import { bakeSkillItemUnlocks } from './lib/skillItemUnlocks.mjs';
import { bakeTypeEffects } from './lib/typeEffects.mjs';
import { bakeTypeInfoShards } from './lib/typeInfo.mjs';
import { bakeTypeNames } from './lib/typeNames.mjs';

async function main() {
  const fuzzwork = await fetchFuzzworkDump(ESI_USER_AGENT);
  console.log(`Downloading SDE CSVs (Fuzzwork dump ${fuzzwork.dir})...`);
  const raw = {};
  for (const f of FILES) raw[f] = parseCsv(await download(fuzzwork, f, CACHE_DIR));

  const ccpStaticData = await readCcpStaticDataFiles(
    CACHE_DIR,
    [
      '_sde.jsonl',
      'skillPlans.jsonl',
      'factions.jsonl',
      'certificates.jsonl',
      'groups.jsonl',
      'types.jsonl',
      'typeDogma.jsonl',
      'dynamicItemAttributes.jsonl',
      'dogmaAttributes.jsonl',
      'characterTitles.jsonl',
      'npcCharacters.jsonl',
      'npcCorporations.jsonl',
      'npcCorporationDivisions.jsonl',
      'militaryCampaignObjectives.jsonl',
      'militaryCampaigns.jsonl',
      ...MAP_FILES,
    ],
    ESI_USER_AGENT
  );
  const ccpBuild = ccpBuildFromSdeJsonl(ccpStaticData['_sde.jsonl']);
  if (ccpBuild !== fuzzwork.build) {
    const message = `Fuzzwork dump ${fuzzwork.dir} and CCP export ${ccpBuild} are different game builds`;
    if (process.env.SDE_ALLOW_BUILD_MISMATCH !== '1') throw new Error(message);
    console.warn(`  WARN: ${message}; baking anyway (SDE_ALLOW_BUILD_MISMATCH=1)`);
  }
  const ccpTypes = parseJsonl(ccpStaticData['types.jsonl']);
  const stargates = parseJsonl(ccpStaticData['mapStargates.jsonl']);
  const map = {
    systems: mapSystems(parseJsonl(ccpStaticData['mapSolarSystems.jsonl'])),
    jumpPairs: mapJumpPairs(stargates),
    regions: mapRegions(parseJsonl(ccpStaticData['mapRegions.jsonl'])),
  };
  const gatePositions = bakeGatePositions(stargates);
  const planets = parseJsonl(ccpStaticData['mapPlanets.jsonl']);
  const {
    groups,
    types,
    piPinTypeIds,
    attrsByType,
    alphaGradesDisagree,
    masteries,
    skillAttributeModifiers,
    skillAttributeModifierUnresolved,
    skills,
  } = bakeSkills({ raw });
  const {
    blueprints,
    typeRows,
    inventionData,
    marketWideTrees,
    reprocessing,
    typeMap,
    manufacturingMaterialTypeIds,
    packagedVolumeByType,
    packagedVolumeApplied,
  } = bakeIndustry({ raw, types, groups, attrsByType, skills, ccpTypes });
  const {
    piSchematics,
    piRaw,
    piUnpublished,
    piPlanetTypeByTypeId,
    piPinsByKind,
    piUnclassifiedPins,
    piDisagreeingPins,
    piUnmappedP0,
    piUnusedP0Rows,
    piBadPlanetTypes,
    piZeroVolume,
    piPlanetRadiusKm,
    piSystemPlanets,
    pi,
  } = bakePi({ types, piPinTypeIds, attrsByType, raw, planets });
  const {
    marketGroups,
    marketTypes,
    moonOresParent,
    moonOreMarketGroupIds,
    moonOreTypeIds,
    oreAndIceTypeIds,
    GAS_CLOUDS_GROUP_NAME,
    gasCloudsParent,
    gasCloudMarketGroupIds,
    gasCloudTypeIds,
    compressedOreTypeIds,
    compressedGasTypeIds,
    metaGroupNames,
    variationTypes,
    variations,
    solarSystems,
    systemMetres,
    solarSystemJumps,
    npcStations,
    lpCorporations,
    marketRegions,
    globalMarketRegions,
    globalMarkets,
    attributeDictionary,
  } = await bakeMarket({ raw, map, types, packagedVolumeByType, groups, typeMap });

  const shipTree = buildShipTree({
    invTypes: raw['invTypes.csv'],
    invGroups: raw['invGroups.csv'],
    invTraits: raw['invTraits.csv'],
    eveUnits: raw['eveUnits.csv'],
    chrFactions: raw['chrFactions.csv'],
    shipSkills: raw['shipSkills.csv'],
    shipTreeGroups: raw['shipTreeGroups.csv'],
    shipTreeGroupPreReqSkills: raw['shipTreeGroupPreReqSkills.csv'],
    shipTreeFactions: raw['shipTreeFactions.csv'],
    dgmTypeAttributes: raw['dgmTypeAttributes.csv'],
    dgmAttributeTypes: raw['dgmAttributeTypes.csv'],
  });

  const bakedSkillIds = new Set(skills.map((s) => s.typeID));
  const skillPlanRecords = parseJsonl(ccpStaticData['skillPlans.jsonl']);
  const certifiedPlans = bakeCertifiedPlans(
    skillPlanRecords,
    bakedSkillIds,
    factionNames(parseJsonl(ccpStaticData['factions.jsonl']))
  );
  const certificateRecords = parseJsonl(ccpStaticData['certificates.jsonl']);
  const certificates = bakeCertificates(
    certificateRecords,
    parseJsonl(ccpStaticData['groups.jsonl']),
    bakedSkillIds
  );

  const typeDogma = parseJsonl(ccpStaticData['typeDogma.jsonl']);
  const typeInfoShards = bakeTypeInfoShards(ccpTypes, typeDogma);

  const groupCategories = Object.fromEntries([...groups].map(([id, g]) => [id, g.categoryID]));
  const skillItemUnlocks = bakeSkillItemUnlocks(typeInfoShards, typeMap, groupCategories);
  if (!skillItemUnlocks[3329]?.some(([typeId, level]) => typeId === 587 && level === 1)) {
    throw new Error('skillItemUnlocks.json looks wrong: Rifter is not under Minmatar Frigate I');
  }

  const typeEffects = bakeTypeEffects(ccpTypes, typeDogma);
  if (!typeEffects[980].includes(11578)) {
    throw new Error('typeEffects.json looks wrong: Covert Ops Cloaking Device II is not under 980');
  }

  const mutaplasmids = bakeMutaplasmids(
    parseJsonl(ccpStaticData['dynamicItemAttributes.jsonl']),
    dogmaAttributeInfo(parseJsonl(ccpStaticData['dogmaAttributes.jsonl']))
  );
  if (
    Object.keys(mutaplasmids.mutaplasmids).length < 400 ||
    mutaplasmids.abyssalTypeIds.length < 90
  ) {
    throw new Error(
      'mutaplasmids.json looks wrong: expected 400+ mutaplasmids and 90+ abyssal types'
    );
  }

  const typeNames = bakeTypeNames([...types.values()].map((t) => t.name));

  const wormholeMass = bakeWormholeMass(typeRows, attrsByType);
  const shipMass = bakeShipMass(
    typeRows,
    new Set([...groups].filter(([, g]) => g.categoryID === SHIP_CATEGORY_ID).map(([id]) => id)),
    attrsByType
  );
  const shipFlight = bakeShipFlight(shipMass, attrsByType);
  if (Object.keys(wormholeMass).length < 80 || wormholeMass.M267?.[0] !== 375_000_000) {
    throw new Error(
      'wormholeMass.json looks wrong: expected 80+ types and M267 at 375 Mt per jump'
    );
  }
  const characterTitles = bakeCharacterTitles(parseJsonl(ccpStaticData['characterTitles.jsonl']));
  if (Object.keys(characterTitles).length < 30) {
    throw new Error('characterTitles.json looks wrong: expected 30+ titles with English names');
  }

  const agents = bakeAgents(
    parseJsonl(ccpStaticData['npcCharacters.jsonl']),
    parseJsonl(ccpStaticData['npcCorporationDivisions.jsonl'])
  );
  const npcCorporationData = bakeNpcCorporations(
    parseJsonl(ccpStaticData['npcCorporations.jsonl']),
    parseJsonl(ccpStaticData['factions.jsonl'])
  );
  const militaryCampaigns = bakeMilitaryCampaigns(
    parseJsonl(ccpStaticData['militaryCampaignObjectives.jsonl']),
    parseJsonl(ccpStaticData['militaryCampaigns.jsonl']),
    ccpTypes
  );
  {
    const campaignIds = new Set(militaryCampaigns.campaigns.map((c) => c.id));
    const systemIds = new Set(map.systems.map((s) => s.id));
    const turnIns = militaryCampaigns.objectives.filter((o) => o.turnIn);
    const orphan = militaryCampaigns.objectives.find((o) => !campaignIds.has(o.campaignId));
    const noSystem = turnIns.find((o) => !systemIds.has(o.turnIn.systemId));
    if (militaryCampaigns.campaigns.length === 0 || orphan || noSystem) {
      throw new Error(
        `militaryCampaigns.json looks wrong: ${militaryCampaigns.campaigns.length} campaigns, ` +
          `objective ${orphan?.id ?? '-'} has no campaign, turn-in ${noSystem?.id ?? '-'} has no known system`
      );
    }
  }
  await writeOutputs({
    lpCorporations,
    npcStations,
    skills,
    masteries,
    certifiedPlans,
    certificates,
    skillAttributeModifiers,
    blueprints,
    inventionData,
    marketWideTrees,
    reprocessing,
    typeMap,
    groupCategories,
    pi,
    piPlanetRadiusKm,
    piSystemPlanets,
    moonOreTypeIds,
    oreAndIceTypeIds,
    gasCloudTypeIds,
    compressedOreTypeIds,
    compressedGasTypeIds,
    shipTree,
    typeNames,
    typeEffects,
    skillItemUnlocks,
    mutaplasmids,
    wormholeMass,
    shipMass,
    shipFlight,
    gatePositions,
    characterTitles,
    agents,
    npcCorporationData,
    militaryCampaigns,
    marketGroups,
    marketTypes,
    solarSystems,
    systemMetres,
    solarSystemJumps,
    marketRegions,
    globalMarkets,
    attributeDictionary,
    variations,
    typeInfoShards,
    ccpBuild,
    fuzzwork,
  });
  runSanityChecks({
    skills,
    blueprints,
    inventionData,
    typeMap,
    typeInfoShards,
    packagedVolumeApplied,
    manufacturingMaterialTypeIds,
    packagedVolumeByType,
    lpCorporations,
    marketWideTrees,
    moonOreTypeIds,
    moonOresParent,
    moonOreMarketGroupIds,
    oreAndIceTypeIds,
    typeNames,
    marketTypes,
    gasCloudTypeIds,
    gasCloudsParent,
    gasCloudMarketGroupIds,
    GAS_CLOUDS_GROUP_NAME,
    compressedOreTypeIds,
    compressedGasTypeIds,
    piSchematics,
    piRaw,
    piUnpublished,
    piPinsByKind,
    piPlanetTypeByTypeId,
    piUnmappedP0,
    piUnusedP0Rows,
    piBadPlanetTypes,
    piZeroVolume,
    piUnclassifiedPins,
    piDisagreeingPins,
    alphaGradesDisagree,
    agents,
    npcCorporationData,
    masteries,
    certifiedPlans,
    skillPlanRecords,
    certificates,
    certificateRecords,
    shipTree,
    skillAttributeModifiers,
    skillAttributeModifierUnresolved,
    marketGroups,
    solarSystems,
    npcStations,
    solarSystemJumps,
    gatePositions,
    marketRegions,
    globalMarketRegions,
    globalMarkets,
    attributeDictionary,
    variationTypes,
    metaGroupNames,
    reprocessing,
  });
}

main().catch((err) => {
  console.error('build-sde failed:', err);
  process.exit(1);
});
