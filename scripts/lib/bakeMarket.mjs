import { CACHE_DIR, SYNTHETIC_POSITION_MAX_M } from './bakeConstants.mjs';
import { indexHeader, intOrNull, isMarketType, num } from './bakeCsv.mjs';
import {
  fetchAllMarketTypeIds,
  probeLpStoreCorporations,
  probeMarketRegions,
} from './bakeEsiProbe.mjs';
import { npcCorporations } from './lpCorporations.mjs';
import { marketTypeEntry } from './marketTypeVolumes.mjs';
import { bakeOreAndIceTypeIds } from './oreTypeIds.mjs';
import {
  npcCorpFactions,
  stationOwnerFields,
  stationReprocessingFields,
} from './stationOwners.mjs';

export async function bakeMarket({ raw, map, types, packagedVolumeByType, groups, typeMap }) {
  const marketGroups = [];
  {
    const rows = raw['invMarketGroups.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const parentRaw = r[h.parentGroupID];
      marketGroups.push({
        id: Number(r[h.marketGroupID]),
        name: r[h.marketGroupName],
        parentId: parentRaw === '' ? null : Number(parentRaw),
        hasTypes: r[h.hasTypes] === '1',
      });
    }
    marketGroups.sort((a, b) => a.id - b.id);
  }

  const marketTypes = [];
  for (const [typeID, t] of types) {
    if (!isMarketType(t)) continue;
    marketTypes.push(marketTypeEntry(typeID, t, packagedVolumeByType.get(typeID)));
  }
  marketTypes.sort((a, b) => a.typeId - b.typeId);

  const ORE_MARKET_GROUP_ROOT_ID = 1031;
  const MATERIALS_MARKET_GROUP_ROOT_ID = 533;
  function findMarketGroupRoot(groups, name, parentId = ORE_MARKET_GROUP_ROOT_ID) {
    return groups.find((g) => g.name === name && g.parentId === parentId);
  }
  const marketGroupsByParent = new Map();
  for (const g of marketGroups) {
    const list = marketGroupsByParent.get(g.parentId) ?? [];
    list.push(g);
    marketGroupsByParent.set(g.parentId, list);
  }
  function collectMarketGroupIds(rootId, into) {
    into.add(rootId);
    for (const child of marketGroupsByParent.get(rootId) ?? [])
      collectMarketGroupIds(child.id, into);
  }

  const MOON_ORES_GROUP_NAME = 'Moon Ores';
  const moonOresParent = findMarketGroupRoot(marketGroups, MOON_ORES_GROUP_NAME);
  const moonOreMarketGroupIds = new Set();
  if (moonOresParent) collectMarketGroupIds(moonOresParent.id, moonOreMarketGroupIds);
  const moonOreTypeIds = marketTypes
    .filter((t) => moonOreMarketGroupIds.has(t.marketGroupId))
    .map((t) => t.typeId)
    .sort((a, b) => a - b);

  const ORE_AND_ICE_ROOT_GROUP_NAMES = ['Standard Ores', 'Ice Ores', MOON_ORES_GROUP_NAME];
  const oreAndIceMarketGroupIds = new Set();
  for (const name of ORE_AND_ICE_ROOT_GROUP_NAMES) {
    const root = findMarketGroupRoot(marketGroups, name);
    if (root) collectMarketGroupIds(root.id, oreAndIceMarketGroupIds);
  }
  const oreAndIceTypeIds = bakeOreAndIceTypeIds({
    types,
    groups,
    marketOreTypeIds: marketTypes
      .filter((t) => oreAndIceMarketGroupIds.has(t.marketGroupId))
      .map((t) => t.typeId),
  });

  const GAS_CLOUDS_GROUP_NAME = 'Gas Clouds Materials';
  const gasCloudsParent = findMarketGroupRoot(
    marketGroups,
    GAS_CLOUDS_GROUP_NAME,
    MATERIALS_MARKET_GROUP_ROOT_ID
  );
  const gasCloudMarketGroupIds = new Set();
  if (gasCloudsParent) collectMarketGroupIds(gasCloudsParent.id, gasCloudMarketGroupIds);
  const gasCloudTypeIds = marketTypes
    .filter((t) => gasCloudMarketGroupIds.has(t.marketGroupId))
    .map((t) => t.typeId)
    .sort((a, b) => a - b);

  const COMPRESSED_NAME_PREFIX = 'Compressed ';
  const typeIdByName = new Map();
  for (const [typeID, t] of types) {
    if (t.published) typeIdByName.set(t.name, typeID);
  }
  const compressedOreTypeIds = {};
  for (const rawTypeId of oreAndIceTypeIds) {
    const rawName = types.get(rawTypeId)?.name;
    if (!rawName) continue;
    const compressedTypeId = typeIdByName.get(`${COMPRESSED_NAME_PREFIX}${rawName}`);
    if (compressedTypeId !== undefined) compressedOreTypeIds[rawTypeId] = compressedTypeId;
  }

  const compressedGasTypeIds = {};
  for (const gasTypeId of gasCloudTypeIds) {
    const gasName = types.get(gasTypeId)?.name;
    if (!gasName || gasName.startsWith(COMPRESSED_NAME_PREFIX)) continue;
    const compressedTypeId = typeIdByName.get(`${COMPRESSED_NAME_PREFIX}${gasName}`);
    if (compressedTypeId !== undefined) compressedGasTypeIds[gasTypeId] = compressedTypeId;
  }

  for (const typeID of [...oreAndIceTypeIds, ...gasCloudTypeIds]) {
    if (typeMap[typeID]) continue;
    const t = types.get(typeID);
    if (!t) continue;
    typeMap[typeID] = { name: t.name, groupID: t.groupID, volume: t.volume };
  }

  const metaGroupNames = {};
  {
    const rows = raw['invMetaGroups.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      metaGroupNames[Number(r[h.metaGroupID])] = r[h.metaGroupName];
    }
  }
  const variationTypes = {};
  {
    const rows = raw['invMetaTypes.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const typeID = Number(r[h.typeID]);
      const t = types.get(typeID);
      if (!t || !t.published) continue;
      const parentRaw = r[h.parentTypeID];
      variationTypes[typeID] = {
        parentTypeId: parentRaw === '' ? null : Number(parentRaw),
        metaGroupId: Number(r[h.metaGroupID]),
      };
    }
  }
  const variations = { types: variationTypes, metaGroups: metaGroupNames };

  const solarSystems = [];
  const regionAllSystemsSynthetic = new Map();
  const systemMetres = [];
  for (const sys of map.systems) {
    solarSystems.push({
      id: sys.id,
      name: sys.name,
      security: sys.security,
      regionId: sys.regionId,
    });
    systemMetres.push({ id: sys.id, x: sys.x, y: sys.y, z: sys.z });
    const synthetic = Math.hypot(sys.x, sys.y, sys.z) < SYNTHETIC_POSITION_MAX_M;
    regionAllSystemsSynthetic.set(
      sys.regionId,
      synthetic && (regionAllSystemsSynthetic.get(sys.regionId) ?? true)
    );
  }
  const globalMarketRegionIds = new Set(
    [...regionAllSystemsSynthetic].filter(([, synthetic]) => synthetic).map(([id]) => id)
  );

  const solarSystemJumps = {};
  for (const sys of solarSystems) solarSystemJumps[sys.id] = [];
  {
    for (const [from, to] of map.jumpPairs) {
      if (from === to) continue;
      (solarSystemJumps[from] ??= []).push(to);
    }
    for (const key of Object.keys(solarSystemJumps)) {
      solarSystemJumps[key] = [...new Set(solarSystemJumps[key])].sort((a, b) => a - b);
    }
  }

  const npcStations = [];
  {
    const rows = raw['staStations.csv'];
    const h = indexHeader(rows);
    const factionByCorp = npcCorpFactions(raw['crpNPCCorporations.csv']);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const entry = {
        id: Number(r[h.stationID]),
        name: r[h.stationName],
        systemId: Number(r[h.solarSystemID]),
      };
      const typeId = intOrNull(r[h.stationTypeID]);
      if (typeId !== null) entry.typeId = typeId;
      Object.assign(entry, stationOwnerFields(r[h.corporationID], factionByCorp));
      Object.assign(entry, stationReprocessingFields(r[h.reprocessingStationsTake]));
      npcStations.push(entry);
    }
    npcStations.sort((a, b) => a.id - b.id);
  }

  const npcCorps = npcCorporations(raw['crpNPCCorporations.csv']);
  console.log(`Probing ${npcCorps.length} NPC corporations against ESI for LP stores...`);
  const lpCorporations = await probeLpStoreCorporations(npcCorps, CACHE_DIR);

  const regionCandidates = map.regions;
  console.log(`Probing ${regionCandidates.length} regions against ESI for live orders...`);
  const regionsWithOrders = await probeMarketRegions(regionCandidates, CACHE_DIR);
  const marketRegions = regionsWithOrders.filter((r) => !globalMarketRegionIds.has(r.id));
  const globalMarketRegions = regionsWithOrders.filter((r) => globalMarketRegionIds.has(r.id));

  console.log(
    `Reading traded items for ${globalMarketRegions.length} Global Market Region(s): ${globalMarketRegions.map((r) => r.name).join(', ') || '(none)'}`
  );
  const globalMarkets = [];
  for (const region of globalMarketRegions) {
    const typeIds = await fetchAllMarketTypeIds(region.id);
    for (const typeId of typeIds) {
      globalMarkets.push({ typeId, regionId: region.id, regionName: region.name });
    }
  }
  globalMarkets.sort((a, b) => a.typeId - b.typeId);

  const attributeCategoryNames = new Map();
  {
    const rows = raw['dgmAttributeCategories.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      attributeCategoryNames.set(Number(r[h.categoryID]), r[h.categoryName]);
    }
  }
  const unitDisplayNames = new Map();
  {
    const rows = raw['eveUnits.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      unitDisplayNames.set(Number(r[h.unitID]), r[h.displayName]);
    }
  }
  const OTHER_ATTRIBUTE_CATEGORY = 'Other';
  const attributeDictionary = {};
  {
    const rows = raw['dgmAttributeTypes.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (r[h.published] !== '1') continue;
      const displayName = r[h.displayName];
      if (!displayName) continue;
      const attributeID = Number(r[h.attributeID]);
      const unitID = r[h.unitID] === '' ? null : Number(r[h.unitID]);
      const knownUnit = unitID !== null && unitDisplayNames.has(unitID);
      const categoryName = attributeCategoryNames.get(Number(r[h.categoryID]));
      attributeDictionary[attributeID] = {
        name: displayName,
        unit: unitID === null ? null : (unitDisplayNames.get(unitID) ?? null),
        category:
          !categoryName || categoryName === 'NULL' ? OTHER_ATTRIBUTE_CATEGORY : categoryName,
        ...(knownUnit ? { unitId: unitID } : {}),
      };
    }
  }

  return {
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
  };
}
