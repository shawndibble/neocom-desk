import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BUILD_STAMP_FILE, MARKET_OUT_DIR, OUT_DIR } from './bakeConstants.mjs';
import { lpCorpStationSystems } from './lpCorpStationSystems.mjs';
import { ROOT } from './paths.mjs';
import { bakeSystemPositions } from './systemPositions.mjs';

export async function writeOutputs({
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
}) {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(MARKET_OUT_DIR, { recursive: true });
  const FUNCTIONS_DATA_DIR = join(ROOT, 'functions', 'src', 'data');
  await mkdir(FUNCTIONS_DATA_DIR, { recursive: true });
  {
    const systems = lpCorpStationSystems(lpCorporations, npcStations);
    const ts =
      `export const LP_CORP_STATION_SYSTEMS: Readonly<Record<number, readonly number[]>> = ${JSON.stringify(systems)};\n`;
    await writeFile(join(FUNCTIONS_DATA_DIR, 'lpCorpStationSystems.ts'), ts);
    console.log(
      `  functions/src/data/lpCorpStationSystems.ts: ${Object.keys(systems).length} corporations`
    );
  }
  {
    const ts =
      `export const COMPRESSED_ORE_TYPE_IDS: Readonly<Record<string, number>> = ${JSON.stringify(compressedOreTypeIds)};\n`;
    await writeFile(join(FUNCTIONS_DATA_DIR, 'compressedOreTypeIds.ts'), ts);
    console.log(
      `  functions/src/data/compressedOreTypeIds.ts: ${Object.keys(compressedOreTypeIds).length} ores`
    );
  }
  const outputs = [
    ['skills.json', skills],
    ['masteries.json', masteries],
    ['certifiedPlans.json', certifiedPlans],
    ['certificates.json', certificates],
    ['skillAttributeModifiers.json', skillAttributeModifiers],
    ['blueprints.json', blueprints],
    ['invention.json', inventionData],
    ['marketWideTrees.json', marketWideTrees],
    ['reprocessing.json', reprocessing],
    ['types.json', typeMap],
    ['groupCategories.json', groupCategories],
    ['pi.json', pi],
    ['pi-planet-radius.json', piPlanetRadiusKm],
    ['pi-system-planets.json', piSystemPlanets],
    ['moonOreTypes.json', moonOreTypeIds],
    ['oreAndIceTypeIds.json', oreAndIceTypeIds],
    ['gasCloudTypeIds.json', gasCloudTypeIds],
    ['compressedOreTypeIds.json', compressedOreTypeIds],
    ['compressedGasTypeIds.json', compressedGasTypeIds],
    ['shipTree.json', shipTree],
    ['typeNames.json', typeNames],
    ['typeEffects.json', typeEffects],
    ['skillItemUnlocks.json', skillItemUnlocks],
    ['mutaplasmids.json', mutaplasmids],
    ['wormholeMass.json', wormholeMass],
    ['shipMass.json', shipMass],
    ['shipFlight.json', shipFlight],
    ['characterTitles.json', characterTitles],
    ['agents.json', agents],
    ['npcCorporations.json', npcCorporationData],
    ['militaryCampaigns.json', militaryCampaigns],
  ];
  console.log('Writing outputs...');
  for (const [name, data] of outputs) {
    const json = JSON.stringify(data);
    const path = join(OUT_DIR, name);
    await writeFile(path, json);
    console.log(`  ${name}: ${Buffer.byteLength(json).toLocaleString()} bytes`);
  }
  const marketOutputs = [
    ['groups.json', marketGroups],
    ['types.json', marketTypes],
    ['systems.json', solarSystems],
    ['systemPositions.json', bakeSystemPositions(systemMetres)],
    ['stations.json', npcStations],
    ['jumps.json', solarSystemJumps],
    ['gates.json', gatePositions],
    ['regions.json', marketRegions],
    ['globalMarkets.json', globalMarkets],
    ['attributes.json', attributeDictionary],
    ['variations.json', variations],
    ['lpCorporations.json', lpCorporations],
  ];
  for (const [name, data] of marketOutputs) {
    const json = JSON.stringify(data);
    const path = join(MARKET_OUT_DIR, name);
    await writeFile(path, json);
    console.log(`  market/${name}: ${Buffer.byteLength(json).toLocaleString()} bytes`);
  }
  {
    const dir = join(OUT_DIR, 'typeInfo');
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    const jsons = typeInfoShards.map((shard) => JSON.stringify(shard));
    await Promise.all(jsons.map((json, n) => writeFile(join(dir, `${n}.json`), json)));
    const bytes = jsons.reduce((sum, json) => sum + Buffer.byteLength(json), 0);
    const count = typeInfoShards.reduce((sum, shard) => sum + Object.keys(shard).length, 0);
    console.log(
      `  typeInfo/0..${typeInfoShards.length - 1}.json: ${count} types, ${bytes.toLocaleString()} bytes`
    );
  }
  await writeFile(
    BUILD_STAMP_FILE,
    `${JSON.stringify({ ccpBuild, fuzzworkDump: fuzzwork.dir }, null, 2)}\n`
  );
}
