#!/usr/bin/env node
// Build-time SDE pipeline: downloads Fuzzwork SDE CSVs, emits slim JSON for the app.
// Usage: node scripts/build-sde.mjs
// Fails when Fuzzwork's dump and CCP's export are on different game builds;
// SDE_ALLOW_BUILD_MISMATCH=1 bakes anyway (local experiments only).
// Node 24 built-ins, plus fflate (already an app dependency) to read the
// tables only CCP's own JSONL export carries, or carries at full precision —
// see lib/ccpStaticData.mjs.

import { runSanityChecks } from './lib/bakeChecks.mjs';
import { CACHE_DIR, FILES, SHIP_CATEGORY_ID } from './lib/bakeConstants.mjs';
import { download, parseCsv } from './lib/bakeCsv.mjs';
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
import { bakeShipMass, bakeWormholeMass } from './lib/jumpMass.mjs';
import { bakeMutaplasmids, dogmaAttributeInfo } from './lib/mutaplasmids.mjs';
import { bakeAgents, bakeNpcCorporations } from './lib/npcAgents.mjs';
import { ccpBuildFromSdeJsonl, fetchFuzzworkDump } from './lib/sdeBuild.mjs';
import { buildShipTree } from './lib/shipTree.mjs';
import { bakeTypeInfoShards } from './lib/typeInfo.mjs';
import { bakeTypeNames } from './lib/typeNames.mjs';

async function main() {
  const fuzzwork = await fetchFuzzworkDump(ESI_USER_AGENT);
  console.log(`Downloading SDE CSVs (Fuzzwork dump ${fuzzwork.dir})...`);
  const raw = {};
  for (const f of FILES) raw[f] = parseCsv(await download(fuzzwork, f, CACHE_DIR));

  // CCP's own JSONL export: the tables Fuzzwork's CSVs lack or round (see the
  // bakes below), and the same build's packaged volumes.
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
  } = bakePi({ types, piPinTypeIds, attrsByType, raw });
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
  } = await bakeMarket({ raw, types, packagedVolumeByType, groups, typeMap });

  // --- shipTree.json: the in-game Ship Tree's contents. Pure join logic
  // lives in `lib/shipTree.mjs` so it's testable without this whole download
  // pipeline; this just hands it the raw parsed rows it asks for. ---
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

  // --- certifiedPlans.json and certificates.json: from CCP's own JSONL
  // export. Only it carries skillPlans (issue #2392); certificates come from
  // it too (issue #2390) so their names and group names travel with them,
  // and faction/group names come from the same build so everything agrees. ---
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

  // --- typeInfo shards (issue #3882); see lib/typeInfo.mjs ---
  const typeInfoShards = bakeTypeInfoShards(ccpTypes, parseJsonl(ccpStaticData['typeDogma.jsonl']));

  // --- mutaplasmids.json: what each mutaplasmid rolls; see lib/mutaplasmids.mjs ---
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

  // --- typeNames.json: every type name, published or not; see lib/typeNames.mjs ---
  const typeNames = bakeTypeNames([...types.values()].map((t) => t.name));

  // --- wormholeMass.json / shipMass.json: Route Safety's mass check (issue #2906) ---
  const wormholeMass = bakeWormholeMass(typeRows, attrsByType);
  const shipMass = bakeShipMass(
    typeRows,
    new Set([...groups].filter(([, g]) => g.categoryID === SHIP_CATEGORY_ID).map(([id]) => id)),
    attrsByType
  );
  if (Object.keys(wormholeMass).length < 80 || wormholeMass.M267?.[0] !== 375_000_000) {
    throw new Error(
      'wormholeMass.json looks wrong: expected 80+ types and M267 at 375 Mt per jump'
    );
  }
  // --- characterTitles.json: title UUID -> English name (issue #4777) ---
  const characterTitles = bakeCharacterTitles(parseJsonl(ccpStaticData['characterTitles.jsonl']));
  if (Object.keys(characterTitles).length < 30) {
    throw new Error('characterTitles.json looks wrong: expected 30+ titles with English names');
  }

  // --- agents.json and npcCorporations.json: the Contacts standings view's NPC
  // agents, corporations and factions; see lib/npcAgents.mjs ---
  const agents = bakeAgents(
    parseJsonl(ccpStaticData['npcCharacters.jsonl']),
    parseJsonl(ccpStaticData['npcCorporationDivisions.jsonl'])
  );
  const npcCorporationData = bakeNpcCorporations(
    parseJsonl(ccpStaticData['npcCorporations.jsonl']),
    parseJsonl(ccpStaticData['factions.jsonl'])
  );
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
    groups,
    pi,
    piPlanetRadiusKm,
    piSystemPlanets,
    moonOreTypeIds,
    oreAndIceTypeIds,
    gasCloudTypeIds,
    compressedOreTypeIds,
    shipTree,
    typeNames,
    mutaplasmids,
    wormholeMass,
    shipMass,
    characterTitles,
    agents,
    npcCorporationData,
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
