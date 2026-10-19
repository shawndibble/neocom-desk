// Post-write sanity checks; failures set process.exitCode.
// Extracted from scripts/build-sde.mjs; see lib/bakeConstants.mjs for the shared bands.
import { isDeepStrictEqual } from 'node:util';
import {
  ALPHA_SKILLS_MAX,
  ALPHA_SKILLS_MIN,
  CERTIFICATES_MAX,
  CERTIFICATES_MIN,
  CERTIFIED_PLANS_MAX,
  CERTIFIED_PLANS_MIN,
  COPYING_BLUEPRINTS_MAX,
  COPYING_BLUEPRINTS_MIN,
  DECRYPTOR_CONTROLS,
  DELVE_REGION_ID,
  INVENTION_BLUEPRINTS_MAX,
  INVENTION_BLUEPRINTS_MIN,
  INVENTION_CONTROL_BLUEPRINT,
  INVENTION_CONTROL_PRODUCT,
  JITA_SYSTEM_ID,
  MARKET_REGIONS_MAX,
  MARKET_REGIONS_MIN,
  MARKET_VOLUME_CONTROL_EXPECTED,
  MARKET_VOLUME_CONTROL_TYPE_ID,
  MASTERY_SHIPS_MAX,
  MASTERY_SHIPS_MIN,
  PACKAGED_VOLUME_CONTROL_EXPECTED,
  PACKAGED_VOLUME_CONTROL_TYPE_ID,
  REPROCESSING_SPECIALISATION_MAX,
  REPROCESSING_SPECIALISATION_MIN,
  SHIP_TREE_CLASSES_MAX,
  SHIP_TREE_CLASSES_MIN,
  SHIP_TREE_FACTIONS_MAX,
  SHIP_TREE_FACTIONS_MIN,
  SHIP_TREE_HULLS_MAX,
  SHIP_TREE_HULLS_MIN,
  SKILL_ATTRIBUTE_MODIFIERS_MAX,
  SKILL_ATTRIBUTE_MODIFIERS_MIN,
  SKILL_ATTRIBUTE_MODIFIER_ROWS_MAX,
  SKILL_ATTRIBUTE_MODIFIER_ROWS_MIN,
} from './bakeConstants.mjs';
import { LP_STORE_CONTROL_CORPORATIONS } from './bakeEsiProbe.mjs';
import { typeInfoBucketOf } from './typeInfo.mjs';
import { namesMissingFrom } from './typeNames.mjs';

export function runSanityChecks({
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
}) {
  // --- sanity checks ---
  console.log('Sanity checks...');
  const skillIds = new Set(skills.map((s) => s.typeID));
  let badPrereq = 0;
  let badRank = 0;
  let badAttrs = 0;
  for (const s of skills) {
    for (const p of s.prereqs) if (!skillIds.has(p.skillTypeID)) badPrereq++;
    if (!(s.rank >= 1 && s.rank <= 16)) badRank++;
    if (!s.primaryAttr || !s.secondaryAttr) badAttrs++;
  }
  console.log(`  skills: ${skills.length}`);
  {
    const byActivity = { manufacturing: 0, reaction: 0 };
    for (const bp of Object.values(blueprints)) byActivity[bp.activity]++;
    console.log(
      `  blueprints: ${Object.keys(blueprints).length} (manufacturing ${byActivity.manufacturing}, reaction ${byActivity.reaction})`
    );
  }
  {
    const entries = Object.values(inventionData.blueprints);
    const inventing = entries.filter((e) => e.invention).length;
    const copying = entries.filter((e) => e.copyTime != null).length;
    const decryptorCount = Object.keys(inventionData.decryptors).length;
    console.log(
      `  invention: ${inventing} blueprints invent, ${copying} copy; ${decryptorCount} decryptors`
    );
    if (
      inventing < INVENTION_BLUEPRINTS_MIN ||
      inventing > INVENTION_BLUEPRINTS_MAX ||
      copying < COPYING_BLUEPRINTS_MIN ||
      copying > COPYING_BLUEPRINTS_MAX
    ) {
      console.error(
        `  FAIL: invention.json counts out of band (invent ${INVENTION_BLUEPRINTS_MIN}-${INVENTION_BLUEPRINTS_MAX}, copy ${COPYING_BLUEPRINTS_MIN}-${COPYING_BLUEPRINTS_MAX})`
      );
      process.exitCode = 1;
    }
    const control = inventionData.blueprints[INVENTION_CONTROL_BLUEPRINT]?.invention;
    if (
      !control?.products.some((p) => p.typeID === INVENTION_CONTROL_PRODUCT && p.probability > 0) ||
      control.materials.length === 0
    ) {
      console.error(
        `  FAIL: Rifter Blueprint (${INVENTION_CONTROL_BLUEPRINT}) lost its Wolf invention recipe`
      );
      process.exitCode = 1;
    }
    for (const { typeID: decryptorId, ...expected } of DECRYPTOR_CONTROLS) {
      const actual = inventionData.decryptors[decryptorId];
      if (!isDeepStrictEqual(actual, expected)) {
        console.error(
          `  FAIL: ${expected.name} (${decryptorId}) reads ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
        );
        process.exitCode = 1;
      }
    }
  }
  console.log(`  types map entries: ${Object.keys(typeMap).length}`);
  {
    const rifter = typeInfoShards[typeInfoBucketOf(587)]['587'];
    if (!rifter?.description || !rifter.attributes.some(([id]) => id === 4)) {
      console.error('  FAIL: typeInfo shards look wrong: Rifter (587) lacks a description or mass');
      process.exitCode = 1;
    }
  }
  console.log(
    `  packaged volume: baked for ${packagedVolumeApplied} of ${manufacturingMaterialTypeIds.size} manufacturing material types`
  );
  if (manufacturingMaterialTypeIds.size > 0 && packagedVolumeByType.size === 0) {
    console.error(
      "  FAIL: CCP's types.jsonl carried no packagedVolume — the export's schema may have changed"
    );
    process.exitCode = 1;
  }
  {
    const control = typeMap[PACKAGED_VOLUME_CONTROL_TYPE_ID];
    const resolved = control?.packagedVolume;
    if (typeof resolved !== 'number' || Math.abs(resolved - PACKAGED_VOLUME_CONTROL_EXPECTED) > 1) {
      console.error(
        `  FAIL: packaged volume control type ${PACKAGED_VOLUME_CONTROL_TYPE_ID} (Merlin) resolved to ${resolved ?? 'missing'}, expected ~${PACKAGED_VOLUME_CONTROL_EXPECTED} — CCP's packagedVolume field may have changed`
      );
      process.exitCode = 1;
    }
  }
  console.log(`  LP store corporations: ${lpCorporations.length}`);
  {
    // Well-known stores across empire navies, independents, CONCORD and the
    // pirate factions. A missing one means the probe (or the offers
    // endpoint's shape) broke, not that the store went away.
    const ids = new Set(lpCorporations.map((c) => c.id));
    const missing = LP_STORE_CONTROL_CORPORATIONS.filter(([id]) => !ids.has(id));
    if (missing.length > 0) {
      console.error(
        `  FAIL: LP store probe is missing well-known stores: ${missing.map(([, name]) => name).join(', ')}`
      );
      process.exitCode = 1;
    }
  }
  console.log(`  market-wide trees: ${Object.keys(marketWideTrees).length}`);
  console.log(`  moon ore type ids: ${moonOreTypeIds.length}`);
  if (!moonOresParent || moonOreMarketGroupIds.size === 0 || moonOreTypeIds.length < 50) {
    console.error(
      '  FAIL: moon ore type ids came out empty or implausibly small — the "Moon Ores" market group structure may have changed'
    );
    process.exitCode = 1;
  }
  console.log(`  ore/ice type ids (moon + asteroid + ice): ${oreAndIceTypeIds.length}`);
  if (!moonOreTypeIds.every((id) => oreAndIceTypeIds.includes(id))) {
    console.error('  FAIL: moonOreTypeIds is not a subset of oreAndIceTypeIds');
    process.exitCode = 1;
  }
  if (oreAndIceTypeIds.length < moonOreTypeIds.length + 100) {
    console.error(
      '  FAIL: ore/ice type ids came out implausibly small — the ore/ice market group structure may have changed'
    );
    process.exitCode = 1;
  }
  // Every name another file carries is a name the game has: typeNames.json
  // missing one would mark a fit using it as out of date.
  {
    const missing = namesMissingFrom(typeNames, [
      ...Object.values(typeMap).map((t) => t.name),
      ...marketTypes.map((t) => t.name),
      ...skills.map((s) => s.name),
    ]);
    if (missing.length > 0) {
      console.error(
        `  FAIL: ${missing.length} type names missing from typeNames.json (e.g. ${missing.slice(0, 5).join(', ')})`
      );
      process.exitCode = 1;
    }
  }
  // Mining Yield reports m3, so every mineable type must carry a volume.
  // Checked rather than assumed: raw ore reaches types.json only through the
  // reprocessing keys and the mineable pass above, and a change to either
  // would otherwise turn the whole column into em dashes with no build error.
  {
    const volumeless = [...oreAndIceTypeIds, ...gasCloudTypeIds].filter(
      (id) => !(typeMap[id]?.volume > 0)
    );
    if (volumeless.length > 0) {
      console.error(
        `  FAIL: ${volumeless.length} mineable types have no volume in types.json (e.g. ${volumeless.slice(0, 5).join(', ')})`
      );
      process.exitCode = 1;
    }
  }
  console.log(`  gas cloud type ids: ${gasCloudTypeIds.length}`);
  // 50 today: 25 raw (Fullerenes + Booster Gas Clouds) and 25 compressed. The
  // threshold sits above 25 on purpose — a restructure that left only the
  // Compressed Gas child standing would still clear a lower bar while every
  // raw type the ledger actually reports had silently vanished.
  if (!gasCloudsParent || gasCloudMarketGroupIds.size === 0 || gasCloudTypeIds.length < 40) {
    console.error(
      `  FAIL: gas cloud type ids came out empty or implausibly small — the "${GAS_CLOUDS_GROUP_NAME}" market group structure may have changed`
    );
    process.exitCode = 1;
  }
  if (gasCloudTypeIds.some((id) => oreAndIceTypeIds.includes(id))) {
    console.error(
      '  FAIL: gasCloudTypeIds overlaps oreAndIceTypeIds — the two allowlists are meant to be disjoint'
    );
    process.exitCode = 1;
  }
  console.log(
    `  compressed-ore type id pairs: ${Object.keys(compressedOreTypeIds).length} of ${oreAndIceTypeIds.length} ore/ice types`
  );
  if (Object.keys(compressedOreTypeIds).length < moonOreTypeIds.length) {
    console.error(
      '  FAIL: fewer compressed-ore pairs than moon ore types alone — the "Compressed " naming convention may have changed'
    );
    process.exitCode = 1;
  }
  console.log(
    `  planetary schematics: ${Object.keys(piSchematics).length} (+${piRaw.length} raw resources, ${piUnpublished} unpublished skipped)`
  );
  console.log(
    `  planetary pins: ${[...piPinsByKind].map(([kind, list]) => `${kind} x${list.length}`).join(', ')}; ${Object.keys(piPlanetTypeByTypeId).length} planet typeIDs mapped`
  );
  if (Object.keys(piSchematics).length === 0 || piRaw.length === 0) {
    console.error('  FAIL: the planetary industry payload came out empty');
    process.exitCode = 1;
  }
  if (piUnmappedP0.length) {
    console.error(
      `  FAIL: P0 resources missing from P0_PLANET_TYPES: ${piUnmappedP0.join(', ')} — the wiki table this script cites has drifted`
    );
    process.exitCode = 1;
  }
  if (piUnusedP0Rows.length) {
    console.error(
      `  FAIL: P0_PLANET_TYPES rows matching no extracted resource: ${piUnusedP0Rows.join(', ')}`
    );
    process.exitCode = 1;
  }
  if (piBadPlanetTypes.length) {
    console.error(
      `  FAIL: planet types outside ESI's planet_type values: ${piBadPlanetTypes.join(', ')}`
    );
    process.exitCode = 1;
  }
  if (piZeroVolume.length) {
    console.error(`  FAIL: planetary types with no volume: ${piZeroVolume.join(', ')}`);
    process.exitCode = 1;
  }
  if (piUnclassifiedPins.length) {
    console.error(`  FAIL: planetary pins missing cost data: ${piUnclassifiedPins.join('; ')}`);
    process.exitCode = 1;
  }
  if (piDisagreeingPins.length) {
    console.error(
      `  FAIL: planet-type variants of one pin kind disagree on cost, so no representative can stand for the kind: ${piDisagreeingPins.join('; ')}`
    );
    process.exitCode = 1;
  }
  console.log(`  prereqs pointing outside skills.json: ${badPrereq}`);
  console.log(`  skills with rank outside 1-16: ${badRank}`);
  console.log(`  skills missing primary/secondary attr: ${badAttrs}`);
  if (badPrereq || badRank || badAttrs) process.exitCode = 1;
  {
    const alphaSkills = skills.filter((s) => s.alphaMaxLevel > 0);
    console.log(`  skills an Alpha clone can train: ${alphaSkills.length}`);
    if (alphaSkills.length < ALPHA_SKILLS_MIN || alphaSkills.length > ALPHA_SKILLS_MAX) {
      console.error(
        `  FAIL: ${alphaSkills.length} Alpha-trainable skills, outside the plausible ${ALPHA_SKILLS_MIN}-${ALPHA_SKILLS_MAX} range`
      );
      process.exitCode = 1;
    }
    if (alphaGradesDisagree) {
      console.error(
        '  FAIL: Alpha clone grades disagree on skill caps; alphaMaxLevel took the highest'
      );
      process.exitCode = 1;
    }
    // A known positive and a known negative (verified against the dump):
    // Gunnery trains to V on Alpha, Capital Ships not at all.
    const GUNNERY_TYPE_ID = 3300;
    const CAPITAL_SHIPS_TYPE_ID = 20533;
    const bySkill = new Map(skills.map((s) => [s.typeID, s]));
    if (bySkill.get(GUNNERY_TYPE_ID)?.alphaMaxLevel !== 5) {
      console.error('  FAIL: Gunnery should carry alphaMaxLevel 5');
      process.exitCode = 1;
    }
    if (bySkill.get(CAPITAL_SHIPS_TYPE_ID)?.alphaMaxLevel !== undefined) {
      console.error('  FAIL: Capital Ships should carry no alphaMaxLevel');
      process.exitCode = 1;
    }
  }
  {
    const shipsWithMastery = Object.keys(masteries).length;
    console.log(`  ships with mastery data: ${shipsWithMastery}`);
    if (shipsWithMastery < MASTERY_SHIPS_MIN || shipsWithMastery > MASTERY_SHIPS_MAX) {
      console.error(
        `  FAIL: ${shipsWithMastery} ships with mastery data, outside the plausible ${MASTERY_SHIPS_MIN}-${MASTERY_SHIPS_MAX} range`
      );
      process.exitCode = 1;
    }
    let masteryBadSkillId = 0;
    for (const tiers of Object.values(masteries)) {
      for (const tier of tiers) {
        for (const { skillTypeID } of tier) {
          if (!skillIds.has(skillTypeID)) masteryBadSkillId++;
        }
      }
    }
    console.log(`  mastery skill refs pointing outside skills.json: ${masteryBadSkillId}`);
    if (masteryBadSkillId) process.exitCode = 1;
  }
  {
    const planCount = certifiedPlans.length;
    console.log(`  certified skill plans: ${planCount}`);
    if (planCount < CERTIFIED_PLANS_MIN || planCount > CERTIFIED_PLANS_MAX) {
      console.error(
        `  FAIL: ${planCount} certified skill plans, outside the plausible ${CERTIFIED_PLANS_MIN}-${CERTIFIED_PLANS_MAX} range`
      );
      process.exitCode = 1;
    }
    // Entries naming a skill skills.json lacks are dropped silently by the
    // bake; a broad CCP/Fuzzwork build mismatch would hollow plans out
    // without emptying any, so count the drops too.
    const rawEntries = skillPlanRecords
      .filter((r) => Number.isInteger(r.careerPathID))
      .reduce((n, r) => n + (r.skillRequirements?.length ?? 0), 0);
    const bakedEntries = certifiedPlans.reduce((n, p) => n + p.entries.length, 0);
    console.log(`  certified plan entries dropped: ${rawEntries - bakedEntries} of ${rawEntries}`);
    if (rawEntries - bakedEntries > rawEntries * 0.02) {
      console.error('  FAIL: more than 2% of certified plan entries name an unknown skill');
      process.exitCode = 1;
    }
    const empty = certifiedPlans.filter((plan) => plan.entries.length === 0);
    if (empty.length) {
      console.error(
        `  FAIL: certified plans with no entries: ${empty.map((p) => p.name).join(', ')}`
      );
      process.exitCode = 1;
    }
  }
  {
    const certificateCount = certificates.length;
    console.log(`  combat certificates: ${certificateCount}`);
    if (certificateCount < CERTIFICATES_MIN || certificateCount > CERTIFICATES_MAX) {
      console.error(
        `  FAIL: ${certificateCount} combat certificates, outside the plausible ${CERTIFICATES_MIN}-${CERTIFICATES_MAX} range`
      );
      process.exitCode = 1;
    }
    // The grade rule (engine/tierLadder.ts) stops at the first empty level, as
    // it must for an unpublished mastery tier — so a certificate level left
    // empty would cap every pilot below it. None is today; fail if one appears.
    const gapped = certificates.filter((c) => c.levels.some((level) => level.length === 0));
    if (gapped.length) {
      console.error(
        `  FAIL: certificates with an empty grade: ${gapped.map((c) => c.name).join(', ')}`
      );
      process.exitCode = 1;
    }
    const wantedIds = new Set(certificates.map((c) => c.id));
    // Only skills asked for at some grade: one that is level 0 at all five is
    // dropped as "not needed", not as unknown, and mustn't count against this.
    const askedFor = (s) =>
      ['basic', 'standard', 'improved', 'advanced', 'elite'].some((g) => s[g] >= 1);
    const rawSkills = certificateRecords
      .filter((r) => wantedIds.has(r._key))
      .reduce((n, r) => n + (r.skillTypes ?? []).filter(askedFor).length, 0);
    const bakedSkills = certificates.reduce(
      (n, c) => n + new Set(c.levels.flat().map((p) => p.skillTypeID)).size,
      0
    );
    console.log(`  certificate skills dropped: ${rawSkills - bakedSkills} of ${rawSkills}`);
    if (rawSkills - bakedSkills > rawSkills * 0.02) {
      console.error('  FAIL: more than 2% of certificate skills name an unknown skill');
      process.exitCode = 1;
    }
  }
  {
    const hullCount = shipTree.ships.length;
    const factionCount = shipTree.factions.length;
    const classCount = Object.keys(shipTree.groups).length;
    console.log(`  ship tree: ${hullCount} hulls, ${factionCount} factions, ${classCount} classes`);
    if (hullCount < SHIP_TREE_HULLS_MIN || hullCount > SHIP_TREE_HULLS_MAX) {
      console.error(
        `  FAIL: ${hullCount} Ship Tree hulls, outside the plausible ${SHIP_TREE_HULLS_MIN}-${SHIP_TREE_HULLS_MAX} range`
      );
      process.exitCode = 1;
    }
    if (factionCount < SHIP_TREE_FACTIONS_MIN || factionCount > SHIP_TREE_FACTIONS_MAX) {
      console.error(
        `  FAIL: ${factionCount} Ship Tree factions, outside the plausible ${SHIP_TREE_FACTIONS_MIN}-${SHIP_TREE_FACTIONS_MAX} range`
      );
      process.exitCode = 1;
    }
    if (classCount < SHIP_TREE_CLASSES_MIN || classCount > SHIP_TREE_CLASSES_MAX) {
      console.error(
        `  FAIL: ${classCount} Ship Tree classes, outside the plausible ${SHIP_TREE_CLASSES_MIN}-${SHIP_TREE_CLASSES_MAX} range`
      );
      process.exitCode = 1;
    }
  }
  {
    const attributeCount = Object.keys(skillAttributeModifiers).length;
    const rowCount = Object.values(skillAttributeModifiers).reduce(
      (sum, list) => sum + list.length,
      0
    );
    console.log(`  skill attribute modifiers: ${attributeCount} attributes, ${rowCount} rows`);
    if (
      attributeCount < SKILL_ATTRIBUTE_MODIFIERS_MIN ||
      attributeCount > SKILL_ATTRIBUTE_MODIFIERS_MAX
    ) {
      console.error(
        `  FAIL: ${attributeCount} attributes, outside the plausible ${SKILL_ATTRIBUTE_MODIFIERS_MIN}-${SKILL_ATTRIBUTE_MODIFIERS_MAX} range`
      );
      process.exitCode = 1;
    }
    if (
      rowCount < SKILL_ATTRIBUTE_MODIFIER_ROWS_MIN ||
      rowCount > SKILL_ATTRIBUTE_MODIFIER_ROWS_MAX
    ) {
      console.error(
        `  FAIL: ${rowCount} rows, outside the plausible ${SKILL_ATTRIBUTE_MODIFIER_ROWS_MIN}-${SKILL_ATTRIBUTE_MODIFIER_ROWS_MAX} range`
      );
      process.exitCode = 1;
    }
    // A known positive, verified against a live dump: Sharpshooter (3311)
    // grants a 5%-per-level PostPercent bonus to attribute 54 (Optimal Range)
    // on items requiring Gunnery (3300).
    const OPTIMAL_RANGE_ATTR = 54;
    const SHARPSHOOTER_TYPE_ID = 3311;
    const GUNNERY_SKILL_TYPE_ID = 3300;
    const found = (skillAttributeModifiers[OPTIMAL_RANGE_ATTR] ?? []).some(
      (e) =>
        e.ownerSkillTypeID === SHARPSHOOTER_TYPE_ID &&
        e.gatingSkillTypeID === GUNNERY_SKILL_TYPE_ID &&
        e.perLevelValue === 5
    );
    if (!found) {
      console.error('  FAIL: Sharpshooter should modify attribute 54 (Optimal Range)');
      process.exitCode = 1;
    }
    // Every skill-gated PostPercent bonus resolves to a static per-level value
    // on its own type (verified against a live dump — no runtime effect chain
    // ever needs simulating); rows that didn't were dropped above rather than
    // emitted with a missing value. A future CCP data change introducing a
    // genuinely unresolvable case fails the build here instead of shipping a
    // popover with no number.
    console.log(`  skill attribute modifiers unresolved: ${skillAttributeModifierUnresolved}`);
    if (skillAttributeModifierUnresolved) {
      console.error(
        `  FAIL: ${skillAttributeModifierUnresolved} row(s) have no static per-level value on their owning skill`
      );
      process.exitCode = 1;
    }
  }

  console.log(`  market groups: ${marketGroups.length}`);
  console.log(`  market types: ${marketTypes.length}`);
  {
    const packaged = marketTypes.filter((t) => t.packagedVolume !== undefined).length;
    const volumeless = marketTypes.filter((t) => !(t.volume > 0));
    console.log(`  market types with a distinct packaged volume: ${packaged}`);
    if (volumeless.length > 0) {
      console.warn(
        `  WARN: ${volumeless.length} market types have no volume (e.g. ${volumeless
          .slice(0, 5)
          .map((t) => t.typeId)
          .join(', ')})`
      );
    }
    const byId = new Map(marketTypes.map((t) => [t.typeId, t]));
    const hull = byId.get(PACKAGED_VOLUME_CONTROL_TYPE_ID)?.packagedVolume;
    if (typeof hull !== 'number' || Math.abs(hull - PACKAGED_VOLUME_CONTROL_EXPECTED) > 1) {
      console.error(
        `  FAIL: market type ${PACKAGED_VOLUME_CONTROL_TYPE_ID} (Merlin) packagedVolume is ${hull ?? 'missing'}, expected ~${PACKAGED_VOLUME_CONTROL_EXPECTED}`
      );
      process.exitCode = 1;
    }
    const mineral = byId.get(MARKET_VOLUME_CONTROL_TYPE_ID);
    if (
      mineral?.volume !== MARKET_VOLUME_CONTROL_EXPECTED ||
      mineral.packagedVolume !== undefined
    ) {
      console.error(
        `  FAIL: market type ${MARKET_VOLUME_CONTROL_TYPE_ID} (Tritanium) volume is ${mineral?.volume ?? 'missing'}, expected ${MARKET_VOLUME_CONTROL_EXPECTED} with no packagedVolume`
      );
      process.exitCode = 1;
    }
  }
  console.log(`  solar systems: ${solarSystems.length}`);
  console.log(`  npc stations: ${npcStations.length}`);
  console.log(
    `  jump graph: ${Object.keys(solarSystemJumps).length} systems, ` +
      `${Object.values(solarSystemJumps).filter((a) => a.length > 0).length} with stargates, ` +
      `${Object.values(solarSystemJumps).reduce((n, a) => n + a.length, 0)} directed edges`
  );
  console.log(`  market regions: ${marketRegions.length}`);
  console.log(
    `  global market regions: ${globalMarketRegions.length} (${globalMarketRegions.map((r) => r.name).join(', ') || 'none'})`
  );
  console.log(`  globally-traded items: ${globalMarkets.length}`);
  console.log(`  attribute dictionary entries: ${Object.keys(attributeDictionary).length}`);
  console.log(`  variation-classified types: ${Object.keys(variationTypes).length}`);
  console.log(`  meta groups: ${Object.keys(metaGroupNames).length}`);
  if (
    marketGroups.length === 0 ||
    marketTypes.length === 0 ||
    solarSystems.length === 0 ||
    npcStations.length === 0 ||
    Object.keys(solarSystemJumps).length === 0 ||
    marketRegions.length === 0 ||
    Object.keys(attributeDictionary).length === 0 ||
    Object.keys(variationTypes).length === 0 ||
    Object.keys(metaGroupNames).length === 0
  ) {
    console.error('  FAIL: a market payload came out empty');
    process.exitCode = 1;
  }
  {
    // Every stargate connects both ways in game, so the emitted graph must be
    // symmetric. An asymmetry means rows were dropped, and a one-way gate
    // would silently give a route in one direction and "no route" back.
    let asymmetric = 0;
    for (const [from, tos] of Object.entries(solarSystemJumps)) {
      for (const to of tos) {
        if (!solarSystemJumps[to]?.includes(Number(from))) asymmetric++;
      }
    }
    if (asymmetric > 0) {
      console.error(`  FAIL: ${asymmetric} one-way stargate edges in the jump graph`);
      process.exitCode = 1;
    }
    // Jita is the busiest system in the game and has never had fewer than a
    // handful of gates; zero here means the join silently produced nothing.
    if (!(solarSystemJumps[JITA_SYSTEM_ID]?.length > 0)) {
      console.error('  FAIL: Jita has no stargates in the jump graph');
      process.exitCode = 1;
    }
    // Every gated system must also be a system we can name and place, or a
    // route can cross somewhere `systems.json` cannot describe.
    const systemIds = new Set(solarSystems.map((sys) => sys.id));
    const unknown = Object.keys(solarSystemJumps).filter((id) => !systemIds.has(Number(id)));
    if (unknown.length > 0) {
      console.error(`  FAIL: ${unknown.length} gated systems missing from systems.json`);
      process.exitCode = 1;
    }
    // The converse, which is what makes membership a reliable "is this a
    // system": every system must have a key, even a gateless one.
    if (Object.keys(solarSystemJumps).length !== solarSystems.length) {
      console.error(
        `  FAIL: jump graph holds ${Object.keys(solarSystemJumps).length} systems, systems.json has ${solarSystems.length}`
      );
      process.exitCode = 1;
    }
  }
  if (!marketRegions.some((r) => r.id === DELVE_REGION_ID)) {
    console.error(
      '  FAIL: Delve (player-structure-only market, no NPC station) missing from market regions'
    );
    process.exitCode = 1;
  }
  if (marketRegions.length < MARKET_REGIONS_MIN || marketRegions.length > MARKET_REGIONS_MAX) {
    console.error(
      `  FAIL: market region count ${marketRegions.length} outside the plausible ${MARKET_REGIONS_MIN}-${MARKET_REGIONS_MAX} range`
    );
    process.exitCode = 1;
  }
  {
    // Attribute 790 is the whole join this ticket rests on (issue #1058) — a
    // silent break (renamed CSV column, a dropped filter) would make this 0,
    // not slightly off, so a band around the known count (338 ore/ice/moon-ore
    // types, 2026-09-14) catches that while tolerating CCP adding types later.
    const specialised = Object.values(reprocessing).filter(
      (e) => e.specialisationSkillID != null
    ).length;
    console.log(`  reprocessing types carrying a specialisation skill: ${specialised}`);
    if (
      specialised < REPROCESSING_SPECIALISATION_MIN ||
      specialised > REPROCESSING_SPECIALISATION_MAX
    ) {
      console.error(
        `  FAIL: ${specialised} refinable types carry attribute 790, outside the plausible ${REPROCESSING_SPECIALISATION_MIN}-${REPROCESSING_SPECIALISATION_MAX} range`
      );
      process.exitCode = 1;
    }
    // A known positive and a known negative, so a join that silently returns
    // nothing (right count, wrong data) fails loudly too.
    const VELDSPAR_TYPE_ID = 1230;
    const SIMPLE_ORE_PROCESSING_SKILL_ID = 60377;
    const RIFTER_TYPE_ID = 587;
    if (reprocessing[VELDSPAR_TYPE_ID]?.specialisationSkillID !== SIMPLE_ORE_PROCESSING_SKILL_ID) {
      console.error(
        `  FAIL: Veldspar (${VELDSPAR_TYPE_ID}) does not resolve to Simple Ore Processing (${SIMPLE_ORE_PROCESSING_SKILL_ID})`
      );
      process.exitCode = 1;
    }
    if (
      !reprocessing[RIFTER_TYPE_ID] ||
      reprocessing[RIFTER_TYPE_ID].specialisationSkillID !== undefined
    ) {
      console.error(`  FAIL: Rifter (${RIFTER_TYPE_ID}) unexpectedly carries attribute 790`);
      process.exitCode = 1;
    }
  }
}
