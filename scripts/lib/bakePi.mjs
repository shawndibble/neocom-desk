import { JITA_SYSTEM_ID } from './bakeConstants.mjs';
import { indexHeader } from './bakeCsv.mjs';
import { planetRadiiKm } from './bakeMap.mjs';

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

export const PLANET_GROUP_ID = 7;
export const PI_PIN_GROUPS = {
  1027: 'commandCenter',
  1028: 'processor',
  1029: 'storage',
  1030: 'launchpad',
  1063: 'extractorControlUnit',
};
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
export const POWER_OUTPUT_ATTR = 11;
export const POWER_LOAD_ATTR = 15;
export const CPU_OUTPUT_ATTR = 48;
export const CPU_LOAD_ATTR = 49;
export const PLANET_RESTRICTION_ATTR = 1632;
export const ECU_HEAD_CPU_ATTR = 1690;
export const ECU_HEAD_POWER_ATTR = 1691;
export const PI_LINK_TYPE_ID = 2280;
export const LINK_POWER_PER_KM_ATTR = 1633;
export const LINK_CPU_PER_KM_ATTR = 1634;
export const LINK_CPU_LEVEL_ATTR = 1635;
export const LINK_POWER_LEVEL_ATTR = 1636;

export const CC_UPGRADE_LEVELS = [
  { level: 0, cpu: 1675, powergrid: 6000 },
  { level: 1, cpu: 7057, powergrid: 9000 },
  { level: 2, cpu: 12136, powergrid: 12000 },
  { level: 3, cpu: 17215, powergrid: 15000 },
  { level: 4, cpu: 21315, powergrid: 17000 },
  { level: 5, cpu: 25415, powergrid: 19000 },
];

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

export function bakePi({ types, piPinTypeIds, attrsByType, raw, planets }) {
  const piSchematics = {};
  const piRaw = [];
  let piUnpublished = 0;

  const piPlanetTypeByTypeId = {};
  for (const [typeID, t] of types) {
    if (t.groupID !== PLANET_GROUP_ID) continue;
    const inner = /^Planet \((.+)\)$/.exec(t.name)?.[1]?.toLowerCase();
    if (inner && ESI_PLANET_TYPES.includes(inner)) piPlanetTypeByTypeId[typeID] = inner;
  }

  const piPinKindOf = (t) => {
    const group = PI_PIN_GROUPS[t.groupID];
    if (group !== 'processor') return group;
    return PROCESSOR_KINDS.find(([suffix]) => t.name.endsWith(suffix))?.[1];
  };
  const piPinSpecs = {};
  const piPinKindByTypeId = {};
  const piCommandCenterTypeIds = [];
  const piPinsByKind = new Map();
  const piPinPlanetTypes = new Map();
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
  const piCcLevel0Mismatch =
    piCommandCenterOutput == null
      ? 'no Command Center output found in the dump'
      : piCommandCenterOutput.cpu !== CC_UPGRADE_LEVELS[0].cpu ||
          piCommandCenterOutput.powergrid !== CC_UPGRADE_LEVELS[0].powergrid
        ? `dump says ${piCommandCenterOutput.cpu} tf / ${piCommandCenterOutput.powergrid} MW, CC_UPGRADE_LEVELS[0] says ${CC_UPGRADE_LEVELS[0].cpu} / ${CC_UPGRADE_LEVELS[0].powergrid}`
        : null;
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

  const piPlanetRadiusKm = planetRadiiKm(planets);

  const piSystemPlanets = {};
  for (const p of planets) {
    const planetType = piPlanetTypeByTypeId[p.typeID];
    if (!planetType) continue;
    const counts = (piSystemPlanets[p.solarSystemID] ??= {});
    counts[planetType] = (counts[planetType] ?? 0) + 1;
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
    if (!piLink) {
      problems.push(`Link type ${PI_LINK_TYPE_ID} is missing one of its cost attributes`);
    } else {
      for (const [field, value] of Object.entries(piLink)) {
        if (!(value > 0)) problems.push(`link ${field} is ${value}; every term must be positive`);
      }
    }
    const radiusCount = Object.keys(piPlanetRadiusKm).length;
    if (radiusCount < 10_000) {
      problems.push(`only ${radiusCount} planet radii found; mapPlanets looks wrong or empty`);
    }
    const systemPlanetCount = Object.keys(piSystemPlanets).length;
    if (systemPlanetCount < 1_000) {
      problems.push(`only ${systemPlanetCount} systems with planets; mapPlanets looks wrong`);
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
