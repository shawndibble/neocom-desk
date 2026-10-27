// Planetary industry: pi.json schematics, pin infrastructure costs, planet radii and system planet counts.
// Extracted from scripts/build-sde.mjs; see lib/bakeConstants.mjs for the shared bands.
import { JITA_SYSTEM_ID } from './bakeConstants.mjs';
import { indexHeader } from './bakeCsv.mjs';

// The eight values ESI reports for CharacterPlanet.planet_type (mirrors
// `PlanetType` in src/esi/endpoints/). P0_PLANET_TYPES is checked against
// this set so pi.json can never name a planet type a colony won't match.
export const ESI_PLANET_TYPES = [
  'barren',
  'gas',
  'ice',
  'lava',
  'oceanic',
  'plasma',
  'storm',
  'temperate',
];

// --- Planetary pin infrastructure (pi.json's `infrastructure` block) ---
//
// Every number here is read out of the dump, not typed in: the CPU/Powergrid
// a pin draws and a Command Center supplies are ordinary dogma attributes.
// The one exception is CC_UPGRADE_LEVELS below, which is flagged as such.
export const PLANET_GROUP_ID = 7;
export const PI_PIN_GROUPS = {
  1027: 'commandCenter',
  1028: 'processor', // split into basic/advanced/highTech by name below
  1029: 'storage',
  1030: 'launchpad',
  1063: 'extractorControlUnit',
};
// Which Processor a name is. The three are separate pins with different costs,
// and the SDE has no column saying which is which, so the name is the only
// discriminator the dump offers. Checked for exhaustive coverage below.
export const PROCESSOR_KINDS = [
  ['High-Tech Production Plant', 'highTech'],
  ['Advanced Industry Facility', 'advanced'],
  ['Basic Industry Facility', 'basic'],
];
export const PIN_KINDS = [
  'extractorControlUnit',
  'basic',
  'advanced',
  'highTech',
  'storage',
  'launchpad',
];
// Dogma attribute IDs (verified against dgmAttributeTypes.csv):
export const POWER_OUTPUT_ATTR = 11; // powerOutput, what a Command Center supplies
export const POWER_LOAD_ATTR = 15; // powerLoad, what a pin draws
export const CPU_OUTPUT_ATTR = 48; // cpuOutput
export const CPU_LOAD_ATTR = 49; // cpuLoad
export const PLANET_RESTRICTION_ATTR = 1632; // planetRestriction: the planet typeID a pin belongs to
export const ECU_HEAD_CPU_ATTR = 1690; // ecuExtractorHeadCPU
export const ECU_HEAD_POWER_ATTR = 1691; // ecuExtractorHeadPower
// The Link type (2280) and its own cost attributes. A link is a pin cost like
// any other, except its size depends on the distance between the two pins it
// joins — which is why per-planet radius has to ship alongside it.
export const PI_LINK_TYPE_ID = 2280;
export const LINK_POWER_PER_KM_ATTR = 1633; // powerLoadPerKm
export const LINK_CPU_PER_KM_ATTR = 1634; // cpuLoadPerKm
export const LINK_CPU_LEVEL_ATTR = 1635; // cpuLoadLevelModifier
export const LINK_POWER_LEVEL_ATTR = 1636; // powerLoadLevelModifier

// CPU/Powergrid a Command Center supplies at each of its **own** upgrade
// levels, 0-5.
//
// Indexed by the colony's Command Center upgrade level — what ESI reports as
// `CharacterPlanet.upgrade_level`, per colony — and NOT by the pilot's
// Command Center Upgrades skill. The skill sets the *ceiling* a colony may be
// upgraded to; reaching each level is then bought per colony with ISK, which
// is why the wiki table this comes from prices every row. Confusing the two
// overstates the budget of every colony not upgraded to the pilot's maximum.
//
// UNLIKE THE PIN COSTS THIS TABLE IS NOT DERIVED FROM THE SDE DUMP. The skill
// (type 2505) carries no dogma effect that scales a deployed Command Center's
// output, so the per-level numbers are nowhere in the dump; a deployed CC's
// static attributes only ever show the level-0 profile. See
// docs/research/pi-cpu-power-mechanics.md §1-2 for the full trace.
//
// Source: EVE University wiki, "Planetary buildings" ("Command Center
// Properties"), https://wiki.eveuniversity.org/Planetary_buildings, read
// 2026-09-04. Levels 0 and 1 are independently corroborated by ESI's own
// live and legacy type data (2254 carries the level-0 row; the unpublished
// legacy "Limited Barren Command Center", 2129, carries the level-1 row
// exactly) — and those legacy types were themselves the separate deployable
// items each level used to correspond to, which is the other reason to read
// this as a per-colony upgrade rather than a per-character skill. Levels 2-5
// are secondary-source only.
//
// The level-0 row is asserted against the dump-derived Command Center output
// before anything is written, so a dump whose base numbers move fails the
// build instead of shipping a table that disagrees with its own first row.
export const CC_UPGRADE_LEVELS = [
  { level: 0, cpu: 1675, powergrid: 6000 },
  { level: 1, cpu: 7057, powergrid: 9000 },
  { level: 2, cpu: 12136, powergrid: 12000 },
  { level: 3, cpu: 17215, powergrid: 15000 },
  { level: 4, cpu: 21315, powergrid: 17000 },
  { level: 5, cpu: 25415, powergrid: 19000 },
];

// Which planet types yield each P0 resource, keyed by invTypes.typeName.
//
// UNLIKE EVERYTHING ELSE IN THIS SCRIPT THIS TABLE IS NOT DERIVED FROM THE SDE
// DUMP — the relationship simply isn't in it, so this is hand-maintained and
// can drift out from under a `latest` dump without any download noticing.
// Source: EVE University wiki, "Planetary Commodities"
// (https://wiki.eveuniversity.org/Planetary_Commodities), read 2026-09-03.
//
// It answers "which planet types", never "how much": per-planet resource
// richness is visible only to a planet scanner, so it is not modelled at all
// and no payload can carry it. Coverage is asserted
// in both directions in the sanity checks below — an extracted P0 with no row
// here, or a row here matching no P0, fails the build instead of quietly
// emitting an empty list.
export const P0_PLANET_TYPES = {
  'Aqueous Liquids': ['barren', 'gas', 'ice', 'oceanic', 'storm', 'temperate'],
  Autotrophs: ['temperate'],
  'Base Metals': ['barren', 'gas', 'lava', 'plasma', 'storm'],
  'Carbon Compounds': ['barren', 'oceanic', 'temperate'],
  'Complex Organisms': ['oceanic', 'temperate'],
  'Felsic Magma': ['lava'],
  'Heavy Metals': ['ice', 'lava', 'plasma'],
  'Ionic Solutions': ['gas', 'storm'],
  Microorganisms: ['barren', 'ice', 'oceanic', 'temperate'],
  'Noble Gas': ['gas', 'ice', 'storm'],
  'Noble Metals': ['barren', 'plasma'],
  'Non-CS Crystals': ['lava', 'plasma'],
  'Planktic Colonies': ['ice', 'oceanic'],
  'Reactive Gas': ['gas'],
  'Suspended Plasma': ['lava', 'plasma', 'storm'],
};

export function bakePi({ types, piPinTypeIds, attrsByType, raw }) {
  // --- pi.json: planetary industry schematics, keyed by the typeID they
  // produce. Item names ride along inside this payload rather than being
  // looked up in types.json: that map only carries types some blueprint or
  // skill references, and most planetary commodities are made by a schematic
  // and consumed by another one, so 42 of them are absent from it.
  //
  // Alongside the recipes it carries the colony's CPU/Powergrid budget and
  // the per-pin costs that budget pays for, so the pin-layout planner
  // (src/engine/pi/pinBudget.ts) can size a planet without hardcoding a
  // single game constant of its own.
  const piSchematics = {};
  const piRaw = [];
  let piUnpublished = 0;

  // Planet typeID -> the PlanetType string ESI reports for a colony. The
  // planet types are unpublished types in group 7 named "Planet (Temperate)"
  // and so on; several typeIDs share one planet type, and the ones ESI has no
  // colony string for (Shattered, Scorched Barren) are left out rather than
  // mapped to a plausible neighbour.
  const piPlanetTypeByTypeId = {};
  for (const [typeID, t] of types) {
    if (t.groupID !== PLANET_GROUP_ID) continue;
    const inner = /^Planet \((.+)\)$/.exec(t.name)?.[1]?.toLowerCase();
    if (inner && ESI_PLANET_TYPES.includes(inner)) piPlanetTypeByTypeId[typeID] = inner;
  }

  // Pin costs, keyed by kind. Every planet-type variant of a kind is read and
  // asserted to agree, so "one representative per kind" is a checked
  // conclusion rather than an assumption.
  const piPinKindOf = (t) => {
    const group = PI_PIN_GROUPS[t.groupID];
    if (group !== 'processor') return group;
    return PROCESSOR_KINDS.find(([suffix]) => t.name.endsWith(suffix))?.[1];
  };
  const piPinSpecs = {};
  const piPinKindByTypeId = {}; // pin typeID -> kind, for reading a live colony's own pins
  // Command Centers, which every colony has exactly one of. Deliberately not a
  // pin kind — a CC supplies the budget and draws nothing from it, so it has
  // no cost row to look up — but a reader of a live colony's pins still has to
  // recognise it, or it lands in "pins we don't recognise" on every colony.
  const piCommandCenterTypeIds = [];
  const piPinsByKind = new Map(); // kind -> [{ typeID, name, cpu, powergrid, capacity }]
  const piPinPlanetTypes = new Map(); // pin typeID -> PlanetType
  const piUnclassifiedPins = [];
  const piDisagreeingPins = [];
  let piCommandCenterOutput = null;
  let piExtractorHead = null;
  {
    for (const typeID of [...piPinTypeIds].sort((a, b) => a - b)) {
      const t = types.get(typeID);
      const attrs = attrsByType.get(typeID) ?? new Map();
      const planetTypeId = attrs.get(PLANET_RESTRICTION_ATTR);
      const planetType = piPlanetTypeByTypeId[planetTypeId];
      if (planetType) piPinPlanetTypes.set(typeID, planetType);

      if (PI_PIN_GROUPS[t.groupID] === 'commandCenter') {
        piCommandCenterTypeIds.push(typeID);
        // The Command Center supplies the budget and draws nothing from it —
        // it carries powerOutput/cpuOutput and no load attributes at all.
        const output = {
          cpu: attrs.get(CPU_OUTPUT_ATTR),
          powergrid: attrs.get(POWER_OUTPUT_ATTR),
        };
        if (output.cpu == null || output.powergrid == null) {
          piUnclassifiedPins.push(`${t.name} (${typeID}): no CPU/Powergrid output`);
        } else if (piCommandCenterOutput == null) {
          piCommandCenterOutput = output;
        } else if (
          piCommandCenterOutput.cpu !== output.cpu ||
          piCommandCenterOutput.powergrid !== output.powergrid
        ) {
          piDisagreeingPins.push(`${t.name} (${typeID}): Command Center output differs`);
        }
        continue;
      }

      const kind = piPinKindOf(t);
      if (!kind) {
        piUnclassifiedPins.push(`${t.name} (${typeID}): no pin kind`);
        continue;
      }
      const spec = {
        cpu: attrs.get(CPU_LOAD_ATTR),
        powergrid: attrs.get(POWER_LOAD_ATTR),
        capacity: t.capacity,
      };
      if (spec.cpu == null || spec.powergrid == null) {
        piUnclassifiedPins.push(`${t.name} (${typeID}): no CPU/Powergrid load`);
        continue;
      }
      const list = piPinsByKind.get(kind) ?? [];
      list.push({ typeID, name: t.name, ...spec });
      piPinsByKind.set(kind, list);
      piPinKindByTypeId[typeID] = kind;

      if (kind === 'extractorControlUnit') {
        const head = {
          cpu: attrs.get(ECU_HEAD_CPU_ATTR),
          powergrid: attrs.get(ECU_HEAD_POWER_ATTR),
        };
        if (head.cpu == null || head.powergrid == null) {
          piUnclassifiedPins.push(`${t.name} (${typeID}): no extractor-head CPU/Powergrid`);
        } else if (piExtractorHead == null) {
          piExtractorHead = head;
        } else if (
          piExtractorHead.cpu !== head.cpu ||
          piExtractorHead.powergrid !== head.powergrid
        ) {
          piDisagreeingPins.push(`${t.name} (${typeID}): extractor-head cost differs`);
        }
      }
    }
    for (const [kind, list] of piPinsByKind) {
      const [first, ...rest] = list;
      for (const other of rest) {
        if (
          other.cpu !== first.cpu ||
          other.powergrid !== first.powergrid ||
          other.capacity !== first.capacity
        ) {
          piDisagreeingPins.push(
            `${other.name} (${other.typeID}) disagrees with ${first.name} (${first.typeID}) on ${kind}`
          );
        }
      }
      piPinSpecs[kind] = { cpu: first.cpu, powergrid: first.powergrid, capacity: first.capacity };
    }
  }
  // Populated while walking the P0s, reported in the sanity checks below.
  const piUnmappedP0 = [];
  const piMappedP0Names = new Set();
  const piBadFacilities = [];
  {
    const meta = new Map();
    {
      const rows = raw['planetSchematics.csv'];
      const h = indexHeader(rows);
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        meta.set(Number(r[h.schematicID]), {
          name: r[h.schematicName],
          cycleTime: Number(r[h.cycleTime]),
        });
      }
    }
    // One row per (schematic, type) pair; isInput splits the recipe's inputs
    // from the single type it produces.
    const schematicInputs = new Map();
    const schematicOutput = new Map();
    {
      const rows = raw['planetSchematicsTypeMap.csv'];
      const h = indexHeader(rows);
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const schematicID = Number(r[h.schematicID]);
        const line = { typeID: Number(r[h.typeID]), quantity: Number(r[h.quantity]) };
        if (r[h.isInput] === '1') {
          const list = schematicInputs.get(schematicID) ?? [];
          list.push(line);
          schematicInputs.set(schematicID, list);
        } else {
          schematicOutput.set(schematicID, line);
        }
      }
    }
    // Which factory pin runs each schematic, straight out of the dump: one
    // row per (schematic, pin type) pair, one pin type per planet variant.
    // The facility kind and the planet types a schematic can run on both fall
    // out of it, so neither is inferred from the schematic's tier.
    const schematicPins = new Map();
    {
      const rows = raw['planetSchematicsPinMap.csv'];
      const h = indexHeader(rows);
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const schematicID = Number(r[h.schematicID]);
        const list = schematicPins.get(schematicID) ?? [];
        list.push(Number(r[h.pinTypeID]));
        schematicPins.set(schematicID, list);
      }
    }
    const piName = (typeID) => types.get(typeID)?.name ?? `#${typeID}`;
    // invTypes.volume, not packagedVolume: the two are identical for every
    // planetary commodity (verified against the current dump) and `volume` is
    // the field the rest of this script already reads.
    const piVolume = (typeID) => types.get(typeID)?.volume ?? 0;
    for (const [schematicID, output] of schematicOutput) {
      const info = meta.get(schematicID);
      if (!info) continue;
      if (!types.get(output.typeID)?.published) {
        piUnpublished++;
        continue;
      }
      const pins = schematicPins.get(schematicID) ?? [];
      const facilities = [
        ...new Set(pins.map((pinTypeID) => piPinKindOf(types.get(pinTypeID) ?? {}))),
      ];
      if (facilities.length !== 1 || !facilities[0]) {
        piBadFacilities.push(`${info.name} (${schematicID}): ${JSON.stringify(facilities)}`);
      }
      piSchematics[output.typeID] = {
        schematicId: schematicID,
        name: info.name,
        cycleTime: info.cycleTime,
        quantity: output.quantity,
        volume: piVolume(output.typeID),
        facility: facilities[0] ?? null,
        planetTypes: [
          ...new Set(pins.map((pinTypeID) => piPinPlanetTypes.get(pinTypeID)).filter(Boolean)),
        ].sort(),
        inputs: (schematicInputs.get(schematicID) ?? [])
          .map((line) => ({ ...line, name: piName(line.typeID) }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    }
    // P0 resources have no schematic — they come out of an extractor — so
    // they are exactly the types that only ever appear on an input side.
    const rawIds = new Set();
    for (const list of schematicInputs.values()) {
      for (const line of list) if (!(line.typeID in piSchematics)) rawIds.add(line.typeID);
    }
    for (const typeID of [...rawIds].sort((a, b) => a - b)) {
      const name = piName(typeID);
      const planetTypes = P0_PLANET_TYPES[name];
      if (!planetTypes) {
        piUnmappedP0.push(`${name} (${typeID})`);
        continue;
      }
      piMappedP0Names.add(name);
      piRaw.push({ typeID, name, volume: piVolume(typeID), planetTypes: [...planetTypes].sort() });
    }
  }
  const piUnusedP0Rows = Object.keys(P0_PLANET_TYPES).filter((n) => !piMappedP0Names.has(n));
  const piBadPlanetTypes = [
    ...new Set(piRaw.flatMap((r) => r.planetTypes).filter((p) => !ESI_PLANET_TYPES.includes(p))),
  ];
  const piZeroVolume = [
    ...Object.entries(piSchematics)
      .filter(([, s]) => !(s.volume > 0))
      .map(([typeID]) => Number(typeID)),
    ...piRaw.filter((r) => !(r.volume > 0)).map((r) => r.typeID),
  ];
  const piMissingPinKinds = PIN_KINDS.filter((kind) => !piPinSpecs[kind]);
  // The hand-maintained CC-Upgrades table's own first row, checked against
  // what the dump says a Command Center supplies untrained. A dump whose base
  // numbers move fails the build rather than shipping a table that disagrees
  // with its own level 0 — the only row the SDE can vouch for.
  const piCcLevel0Mismatch =
    piCommandCenterOutput == null
      ? 'no Command Center output found in the dump'
      : piCommandCenterOutput.cpu !== CC_UPGRADE_LEVELS[0].cpu ||
          piCommandCenterOutput.powergrid !== CC_UPGRADE_LEVELS[0].powergrid
        ? `dump says ${piCommandCenterOutput.cpu} tf / ${piCommandCenterOutput.powergrid} MW, CC_UPGRADE_LEVELS[0] says ${CC_UPGRADE_LEVELS[0].cpu} / ${CC_UPGRADE_LEVELS[0].powergrid}`
        : null;
  // --- Link cost (issue #440) ---
  //
  // A link draws CPU and Powergrid like any other pin, but its cost has a
  // per-km term over the distance between the two pins it joins. Everything
  // here is read from the Link type's own dogma attributes; the distance
  // itself needs the planet's radius, emitted separately below.
  const piLink = (() => {
    const attrs = attrsByType.get(PI_LINK_TYPE_ID) ?? new Map();
    const spec = {
      cpu: attrs.get(CPU_LOAD_ATTR),
      powergrid: attrs.get(POWER_LOAD_ATTR),
      cpuPerKm: attrs.get(LINK_CPU_PER_KM_ATTR),
      powergridPerKm: attrs.get(LINK_POWER_PER_KM_ATTR),
      cpuLevelModifier: attrs.get(LINK_CPU_LEVEL_ATTR),
      powergridLevelModifier: attrs.get(LINK_POWER_LEVEL_ATTR),
    };
    return Object.values(spec).every((v) => typeof v === 'number') ? spec : null;
  })();

  // --- Per-planet radius, in km (issue #440) ---
  //
  // The one input the link formula needs that is not a dogma attribute, and
  // the reason it cannot be approximated: two colonies of identical shape cost
  // wildly different amounts purely because their planets differ in size (a
  // 6,030 km planet vs an 85,400 km one is a 6.7x difference in link cost).
  // `mapDenormalize` stores it in metres; km is what the per-km attributes are
  // denominated in, so the conversion happens once, here.
  const piPlanetRadiusKm = {};
  {
    const rows = raw['mapDenormalize.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (Number(r[h.groupID]) !== PLANET_GROUP_ID) continue;
      const metres = Number(r[h.radius]);
      if (!Number.isFinite(metres) || metres <= 0) continue;
      // Rounded to the km the formula works in: sub-km precision on a body
      // thousands of km across cannot change a pin count, and the payload is
      // one entry per planet in New Eden.
      piPlanetRadiusKm[r[h.itemID]] = Math.round(metres / 1000);
    }
  }

  // --- System -> planet-type counts (issue #2631) ---
  // Same rows as the radius table, grouped by system and typed through the
  // planet typeID mapping (Shattered variants map to their base type there).
  // Planets of a type ESI has no colony string for are left out.
  const piSystemPlanets = {};
  {
    const rows = raw['mapDenormalize.csv'];
    const h = indexHeader(rows);
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (Number(r[h.groupID]) !== PLANET_GROUP_ID) continue;
      const planetType = piPlanetTypeByTypeId[r[h.typeID]];
      if (!planetType) continue;
      const counts = (piSystemPlanets[r[h.solarSystemID]] ??= {});
      counts[planetType] = (counts[planetType] ?? 0) + 1;
    }
  }

  const piPlanetTypeCoverage = new Set(Object.values(piPlanetTypeByTypeId));
  const piMissingPlanetTypes = ESI_PLANET_TYPES.filter((p) => !piPlanetTypeCoverage.has(p));
  const pi = {
    schematics: piSchematics,
    raw: piRaw,
    infrastructure: {
      pins: Object.fromEntries(PIN_KINDS.map((kind) => [kind, piPinSpecs[kind]])),
      pinKindByTypeId: piPinKindByTypeId,
      commandCenterTypeIds: piCommandCenterTypeIds.sort((a, b) => a - b),
      extractorHead: piExtractorHead,
      link: piLink,
      commandCenterUpgrades: CC_UPGRADE_LEVELS,
    },
    planetTypeByTypeId: piPlanetTypeByTypeId,
  };

  // Structural invariants, checked BEFORE anything is written.
  //
  // The reporting checks further down set `process.exitCode = 1` but run after
  // the write, so on their own a failing build still leaves a bad payload on
  // disk — and `src/sde/types.ts` declares these fields non-nullable, so
  // `tsc` would go on vouching for a shape the emitter had just violated.
  // These throw instead: nothing is written unless the payload can satisfy
  // the types that describe it.
  {
    const problems = [];
    if (piCcLevel0Mismatch) problems.push(`Command Center level 0: ${piCcLevel0Mismatch}`);
    if (piBadFacilities.length)
      problems.push(
        `schematics whose factory pins resolve to more than one facility kind: ${piBadFacilities.join('; ')}`
      );
    if (piMissingPinKinds.length)
      problems.push(`no pin found for: ${piMissingPinKinds.join(', ')}`);
    if (piMissingPlanetTypes.length)
      problems.push(`no planet typeID maps to: ${piMissingPlanetTypes.join(', ')}`);
    if (!piCommandCenterTypeIds.length) problems.push('no Command Center types found');
    // Positive on both axes, not merely present. `engine/pi/pinBudget.ts`
    // refuses a pin priced at nothing rather than reading it as "no room",
    // and that refusal is a throw on a render path (`spareCapacity` runs
    // inside a card's `useMemo`). Guaranteeing it here is what keeps that
    // throw unreachable instead of a crash waiting on a payload regression.
    for (const [kind, spec] of Object.entries(pi.infrastructure.pins)) {
      if (!spec) {
        problems.push(`pin kind ${kind} has no cost row`);
      } else if (!(spec.cpu > 0) || !(spec.powergrid > 0)) {
        problems.push(
          `pin kind ${kind} is priced at ${spec.cpu} tf / ${spec.powergrid} MW; every pin costs something`
        );
      }
    }
    if (!(piExtractorHead?.cpu > 0) || !(piExtractorHead?.powergrid > 0)) {
      problems.push('extractor head is priced at nothing');
    }
    // A link costs something, and its per-km terms are the whole point of
    // shipping radius at all — a zero here would silently restore the
    // uncharged-link bug #440 exists to fix, with no warning anywhere.
    if (!piLink) {
      problems.push(`Link type ${PI_LINK_TYPE_ID} is missing one of its cost attributes`);
    } else {
      for (const [field, value] of Object.entries(piLink)) {
        if (!(value > 0)) problems.push(`link ${field} is ${value}; every term must be positive`);
      }
    }
    // Radius is per planet and cannot be approximated. An empty or tiny table
    // would make every colony's links look free.
    const radiusCount = Object.keys(piPlanetRadiusKm).length;
    if (radiusCount < 10_000) {
      problems.push(`only ${radiusCount} planet radii found; mapDenormalize looks wrong or empty`);
    }
    // Planet finders rank systems on these counts: empty, missing Jita, or a
    // type no system holds would make them quietly wrong.
    const systemPlanetCount = Object.keys(piSystemPlanets).length;
    if (systemPlanetCount < 1_000) {
      problems.push(`only ${systemPlanetCount} systems with planets; mapDenormalize looks wrong`);
    }
    if (!piSystemPlanets[JITA_SYSTEM_ID]) problems.push('Jita has no planets in pi-system-planets');
    const typesWithSystems = new Set(Object.values(piSystemPlanets).flatMap((c) => Object.keys(c)));
    for (const type of ESI_PLANET_TYPES) {
      if (!typesWithSystems.has(type)) problems.push(`no system holds a ${type} planet`);
    }
    for (const [typeID, schematic] of Object.entries(piSchematics)) {
      if (!schematic.facility) problems.push(`schematic ${typeID} has no facility`);
      if (!schematic.planetTypes.length)
        problems.push(`schematic ${typeID} runs on no planet type`);
    }
    if (problems.length) {
      throw new Error(
        `pi.json would be structurally invalid, so nothing was written:\n  - ${problems.join('\n  - ')}`
      );
    }
  }

  return {
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
  };
}
