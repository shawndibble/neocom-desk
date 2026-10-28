// Market groups/types, ore and gas allowlists, variations, systems, jumps, stations, LP stores, regions and attributes.
// Extracted from scripts/build-sde.mjs; see lib/bakeConstants.mjs for the shared bands.
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

export async function bakeMarket({ raw, types, packagedVolumeByType, groups, typeMap }) {
  // --- market/groups.json: invMarketGroups -> MarketGroupNode[] ---
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

  // --- market/types.json: published invTypes with a market group -> MarketTypeEntry[] ---
  // Volumes ride along (issue #2336) so the UI can show m3 without an ESI
  // call per item; packagedVolume only where it differs, e.g. a hull.
  const marketTypes = [];
  for (const [typeID, t] of types) {
    if (!isMarketType(t)) continue;
    marketTypes.push(marketTypeEntry(typeID, t, packagedVolumeByType.get(typeID)));
  }
  marketTypes.sort((a, b) => a.typeId - b.typeId);

  // Shared by moonOreTypes.json, oreAndIceTypeIds.json and gasCloudTypeIds.json
  // below: one way to find a named market group under a known parent, and one
  // way to walk everything under it. Anchoring on the parent id rather than the
  // name alone is what keeps "Moon Ores" from matching some unrelated group
  // CCP adds elsewhere in the tree later. Both parent ids are verified against
  // a live dump: 1031 ("Raw Materials") is the parent of "Standard Ores",
  // "Ice Ores" and "Moon Ores" alike, and 1032 ("Gas Clouds Materials") is its
  // *sibling* — both hang off 533 ("Materials"). That sibling relationship is
  // the whole reason gas needs its own traversal rather than a fourth name in
  // the ore/ice list (issue #880).
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

  // --- moonOreTypes.json: published types under the "Moon Ores" market group
  // (issue #523). Moon mining yields its own five rarity-tier ore types —
  // Ubiquitous/Common/Uncommon/Rare/Exceptional Moon Ores, all children of one
  // "Moon Ores" market group — distinct from ordinary asteroid ore and ice,
  // which already arrive under different type_ids in the personal mining
  // ledger. That's the whole allowlist src/engine/miningTax/groupLedger.ts
  // needs to isolate moon-mining rows, with zero "was this interrupted by
  // asteroid ore" logic required. Derived from the market tree rather than
  // hand-maintained so a future CCP rarity tier (a new child of "Moon Ores")
  // is picked up on the next SDE rebuild instead of only ever surfacing
  // through the app's "unclassified ore" fallback.
  const MOON_ORES_GROUP_NAME = 'Moon Ores';
  const moonOresParent = findMarketGroupRoot(marketGroups, MOON_ORES_GROUP_NAME);
  const moonOreMarketGroupIds = new Set();
  if (moonOresParent) collectMarketGroupIds(moonOresParent.id, moonOreMarketGroupIds);
  const moonOreTypeIds = marketTypes
    .filter((t) => moonOreMarketGroupIds.has(t.marketGroupId))
    .map((t) => t.typeId)
    .sort((a, b) => a - b);

  // --- oreAndIceTypeIds.json: every ore/ice type this app can name, moon or
  // not (issue #523). Broader than moonOreTypes.json on purpose: it is how
  // the Moon Mining Tax ledger tells "ordinary asteroid ore/ice — silently
  // not moon mining" apart from "a type_id nothing here recognizes at all,"
  // which is exactly the allowlist-gap case the decision doc's "unclassified
  // ore" banner exists to catch instead of silently dropping.
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

  // --- gasCloudTypeIds.json: every harvestable gas cloud type — Fullerites,
  // Mykoserocin and Cytoserocin, plus the compressed forms the tree nests
  // alongside them (issue #880). The personal mining ledger reports gas
  // harvesting through the same endpoint as ore and ice, so the Mining Yield
  // tracker unions this list into its allowlist; without it, every gas row
  // ESI reports is silently dropped.
  //
  // Its own file, and its own traversal, rather than a fourth name in
  // ORE_AND_ICE_ROOT_GROUP_NAMES: gas hangs off "Materials" (533) as a sibling
  // of the "Raw Materials" root the ore/ice walk is anchored to. Keeping it
  // separate also keeps the Moon Mining Tax ledger's "recognized ore/ice vs.
  // unclassified" split and compressedOreTypeIds' name-match pass below
  // reading exactly what they read before — see the issue #880 decision doc.
  //
  // The whole subtree is kept, compressed forms included, exactly as the
  // ore/ice walk keeps "Compressed " ore. Those ~25 ids are inert — compression
  // is a separate industry job, so no ledger row ever carries one — but
  // excluding them would mean special-casing a child out of an otherwise clean
  // tree walk, for no behaviour difference.
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

  // --- compressedOreTypeIds.json: raw ore/ice typeId -> its "Compressed "
  // counterpart's typeId (issue #523 corp-tax-parity decision). A character's
  // personal mining ledger only ever reports raw ore/ice typeIds (compression
  // is a separate industry job, not something ESI's mining endpoint can
  // report), but a corp valuing what got mined prices the *compressed*
  // item's market data instead of the raw one's — a different, generally
  // more liquid order book. Matched by name against the full invTypes set
  // (not just `marketTypes`) so a published-but-oddly-grouped compressed
  // variant is still found, rather than by market group id, which the
  // "Moon Ores" tree happens to nest both forms under but nothing guarantees
  // for every ore/ice category.
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

  // Every mineable type carries its volume in types.json, so the Mining Yield
  // tab can report a day's m3 rather than a bare unit count. The reprocessing
  // keys above already cover almost all of them; this catches the handful
  // nothing else reaches — gas, which refines into nothing, and the couple of
  // ores (Nephrite, Prismaticite) with no invTypeMaterials rows at all. Runs
  // here rather than beside the typeMap build because the ore/ice and gas id
  // sets are only known this far down.
  for (const typeID of [...oreAndIceTypeIds, ...gasCloudTypeIds]) {
    if (typeMap[typeID]) continue;
    const t = types.get(typeID);
    if (!t) continue;
    typeMap[typeID] = { name: t.name, groupID: t.groupID, volume: t.volume };
  }

  // --- market/variations.json: invMetaTypes + invMetaGroups -> Tech/Meta/
  // Faction variation relation (the EVE client's "Variations" tab). Every
  // classified type has an invMetaTypes row; a group's root has an empty
  // parentTypeID, and every other member's parentTypeID points at that root
  // (metaGroupID alone does not identify the root — some non-root rows are
  // also metaGroupID 1/Tech I). Filtered to published types so every id the
  // app resolves is guaranteed renderable, same discipline as marketTypes
  // above.
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

  // --- market/systems.json: mapSolarSystems -> SolarSystemEntry[] ---
  // Also tracks, per region, whether every one of its systems sits at a
  // synthetic (near-origin) position — see SYNTHETIC_POSITION_MAX_M.
  const solarSystems = [];
  const regionAllSystemsSynthetic = new Map();
  const systemMetres = [];
  {
    const rows = raw['mapSolarSystems.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const regionId = Number(r[h.regionID]);
      solarSystems.push({
        id: Number(r[h.solarSystemID]),
        name: r[h.solarSystemName],
        security: num(r[h.security]) ?? 0,
        regionId,
      });
      const x = num(r[h.x]) ?? 0;
      const y = num(r[h.y]) ?? 0;
      const z = num(r[h.z]) ?? 0;
      systemMetres.push({ id: Number(r[h.solarSystemID]), x, y, z });
      const synthetic = Math.hypot(x, y, z) < SYNTHETIC_POSITION_MAX_M;
      regionAllSystemsSynthetic.set(
        regionId,
        synthetic && (regionAllSystemsSynthetic.get(regionId) ?? true)
      );
    }
    solarSystems.sort((a, b) => a.id - b.id);
  }
  const globalMarketRegionIds = new Set(
    [...regionAllSystemsSynthetic].filter(([, synthetic]) => synthetic).map(([id]) => id)
  );

  // --- market/jumps.json: mapSolarSystemJumps -> JumpGraphData ---
  //
  // Adjacency by solar system id, which is all a pathfinder needs — the CSV's
  // constellation and region columns describe the systems, and `systems.json`
  // already carries that. Fuzzwork lists every gate in both directions, so the
  // two halves of a pair arrive as separate rows and each one is recorded on
  // its own `from` system; no edge is mirrored by hand.
  //
  // Every solar system gets a key, gateless ones included — an empty array
  // says "this is a system, and it has no stargates", which is the literal
  // truth for J-space. Emitting only gated systems made absence mean both
  // that and "not a system at all", which collapsed a same-system haul in any
  // of them into no-route when the answer is zero jumps. Membership here
  // discriminates the way `stations.json`'s completeness does for "station or
  // player structure".
  const solarSystemJumps = {};
  for (const sys of solarSystems) solarSystemJumps[sys.id] = [];
  {
    const rows = raw['mapSolarSystemJumps.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const from = intOrNull(r[h.fromSolarSystemID]);
      const to = intOrNull(r[h.toSolarSystemID]);
      if (from === null || to === null || from === to) continue;
      // `??=` only fires for a `from` system absent from mapSolarSystems —
      // every real one is seeded above — which lets the sanity check below
      // report that rather than this loop throwing on it.
      (solarSystemJumps[from] ??= []).push(to);
    }
    // Sorted and de-duplicated so the emitted file is byte-stable across
    // rebuilds (two systems joined by more than one gate are one edge here).
    for (const key of Object.keys(solarSystemJumps)) {
      solarSystemJumps[key] = [...new Set(solarSystemJumps[key])].sort((a, b) => a - b);
    }
  }

  // --- market/stations.json: staStations -> NpcStationEntry[] ---
  //
  // The complete NPC station table, which is why it is read as more than a
  // name cache (issue #655): membership in it is the definitive answer to "is
  // this location id an NPC station or a player structure", so the character
  // surfaces resolve station names with no ESI call and contract locations
  // skip the station probe whose 404 they used to spend. `stationTypeID`
  // rides along so `loadStationSummary` can fill a Build Location's facility
  // preset from here too.
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
      // Leaving the key off for a blank column reproduces the pre-#655
      // snapshot shape, which callers already fall back on. Writing NaN
      // instead would reach them as `null` through `JSON.stringify`, and
      // `loadStationSummary`'s "no typeId, ask ESI" guard tests for
      // `undefined` — so it would pass null through as a type id.
      const typeId = intOrNull(r[h.stationTypeID]);
      if (typeId !== null) entry.typeId = typeId;
      // Owner corporation and its faction (issue #1675), so broker-fee
      // standings resolve from the snapshot with no ESI call.
      Object.assign(entry, stationOwnerFields(r[h.corporationID], factionByCorp));
      // The station's own reprocessing take, where it is not the usual 5%.
      Object.assign(entry, stationReprocessingFields(r[h.reprocessingStationsTake]));
      npcStations.push(entry);
    }
    npcStations.sort((a, b) => a.id - b.id);
  }

  // --- market/lpCorporations.json: NPC corps with an LP Store (issue #2320) ---
  //
  // The SDE has no "has an LP store" flag, so each NPC corp is probed against
  // ESI's public offers endpoint and kept only if its store lists an offer.
  const npcCorps = npcCorporations(raw['crpNPCCorporations.csv']);
  console.log(`Probing ${npcCorps.length} NPC corporations against ESI for LP stores...`);
  const lpCorporations = await probeLpStoreCorporations(npcCorps, CACHE_DIR);

  // --- market/regions.json: mapRegions, probed live against ESI for orders ---
  const regionCandidates = [];
  {
    const rows = raw['mapRegions.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      regionCandidates.push({ id: Number(r[h.regionID]), name: r[h.regionName] });
    }
  }
  console.log(`Probing ${regionCandidates.length} regions against ESI for live orders...`);
  const regionsWithOrders = await probeMarketRegions(regionCandidates, CACHE_DIR);
  const marketRegions = regionsWithOrders.filter((r) => !globalMarketRegionIds.has(r.id));
  const globalMarketRegions = regionsWithOrders.filter((r) => globalMarketRegionIds.has(r.id));

  // --- market/globalMarkets.json: which types trade in a Global Market
  // Region (GLOSSARY.md round 12) instead of the normal regional books, and
  // where — read live per region, not hardcoded (only a handful of regions
  // qualify, so this is a few requests, not hundreds).
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

  // --- market/attributes.json: dgmAttributeTypes -> attribute dictionary
  // (display name, unit, category), published only. Item Detail (GLOSSARY.md
  // round 6) reads dogma_attributes live from ESI per item; this dictionary
  // is the small piece the snapshot carries instead, so attribute_ids become
  // readable without shipping every item's own attributes. An attribute with
  // no displayName is left out of the dictionary entirely, which is how the
  // app skips it rather than showing a raw identifier.
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
  // categoryID 9 is CCP's own dumping ground for "attributes already checked
  // and not going into a category" — the CSV literally names it "NULL".
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
      // Emitted only beside a unit the lookup knows, so the two never disagree.
      const knownUnit = unitID !== null && unitDisplayNames.has(unitID);
      const categoryName = attributeCategoryNames.get(Number(r[h.categoryID]));
      attributeDictionary[attributeID] = {
        name: displayName,
        unit: unitID === null ? null : (unitDisplayNames.get(unitID) ?? null),
        category:
          !categoryName || categoryName === 'NULL' ? OTHER_ATTRIBUTE_CATEGORY : categoryName,
        // The unit's id, not only its display string: "%" alone can't say
        // whether 0.75 means 75% or 25% (a resonance) or 1.1 means +10%, and
        // "s" is milliseconds. Fittings' Affected by converts by it.
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
