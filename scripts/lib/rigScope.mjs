export const RIG_SCOPE_ATTRIBUTES = [
  {
    attributeID: 2538,
    scope: 'equipment',
    description:
      'Decrease material requirement for manufacturing the following: Ship Modules, Ship Rigs, Personal Deployables, Implants, Cargo Containers',
  },
  {
    attributeID: 2540,
    scope: 'ammo',
    description:
      'Decrease material requirement for manufacturing the following: Ammunition, Charges, Scripts',
  },
  {
    attributeID: 2542,
    scope: 'drone',
    description: 'Decrease material requirement for manufacturing the following: Drones, Fighters',
  },
  {
    attributeID: 2544,
    scope: 'basSmall',
    description:
      'Decrease material requirement for manufacturing the following: T1 Frigates, T1 Destroyers, Shuttles',
  },
  {
    attributeID: 2546,
    scope: 'basMedium',
    description:
      'Decrease material requirement for manufacturing the following: T1 Cruisers, T1 Battlecruisers, Industrial Ships, Mining Barges',
  },
  {
    attributeID: 2548,
    scope: 'basLarge',
    description:
      'Decrease material requirement for manufacturing the following: T1 Battleships, T1 Freighters, Industrial Command Ships',
  },
  {
    attributeID: 2550,
    scope: 'advSmall',
    description:
      'Decrease material requirement for manufacturing the following: T2 Frigates, T2 Destroyers, T3 Destroyers',
  },
  {
    attributeID: 2552,
    scope: 'advMedium',
    description:
      'Decrease material requirement for manufacturing the following: T2 Cruisers, T2 Battlecruisers, T2 Haulers, Exhumers, T3 Cruisers,T3 Subsystems',
  },
  {
    attributeID: 2555,
    scope: 'advLarge',
    description:
      'Decrease material requirement for manufacturing the following: T2 Battleships, Jump Freighters',
  },
  {
    attributeID: 2557,
    scope: 'advComp',
    description:
      'Decrease material requirement for manufacturing the following: T2 Components, Tools, Data Interfaces, T3 Components',
  },
  {
    attributeID: 2559,
    scope: 'basCapComp',
    description:
      'Decrease material requirement for manufacturing the following: Capital Construction Components',
  },
  {
    attributeID: 2561,
    scope: 'structure',
    description:
      'Decrease material requirement for manufacturing the following: Structure Components, Structure Modules, Upwell Structures, Starbase Structures, Fuel Blocks',
  },
  {
    attributeID: 2575,
    scope: 'capShip',
    description: 'Decrease material requirement for manufacturing the following: Capital Ships',
  },
  {
    attributeID: 2658,
    scope: 'advCapComp',
    description:
      'Decrease material requirement for manufacturing the following: T2 Capital Construction Components',
  },
];

export const ALL_SHIPS_ATTRIBUTE = {
  attributeID: 2592,
  description: 'bonus that affects material of all ships being manufactured, for XL rigs',
};

export function normaliseDescription(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function verifyRigScopeAttributes(rows) {
  const byId = new Map(rows.map((r) => [Number(r.attributeID), r.description]));
  const problems = [];
  for (const { attributeID, description } of [...RIG_SCOPE_ATTRIBUTES, ALL_SHIPS_ATTRIBUTE]) {
    if (!byId.has(attributeID)) {
      problems.push(`attribute ${attributeID} is missing`);
    } else if (normaliseDescription(byId.get(attributeID)) !== description) {
      problems.push(
        `attribute ${attributeID} description changed: ${JSON.stringify(normaliseDescription(byId.get(attributeID)))}`
      );
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `Rig scope map (scripts/lib/rigScope.mjs) is out of date with dogma: ${problems.join('; ')}. Re-curate the product scopes, then update the pinned text.`
    );
  }
}

const SHIP_CATEGORY = 6;
const SHIP_SIZE_BY_GROUP = {
  25: 'Small',
  31: 'Small',
  237: 'Small',
  324: 'Small',
  420: 'Small',
  541: 'Small',
  830: 'Small',
  831: 'Small',
  834: 'Small',
  893: 'Small',
  1022: 'Small',
  1283: 'Small',
  1305: 'Small',
  1527: 'Small',
  1534: 'Small',
  26: 'Medium',
  28: 'Medium',
  358: 'Medium',
  380: 'Medium',
  419: 'Medium',
  463: 'Medium',
  540: 'Medium',
  543: 'Medium',
  832: 'Medium',
  833: 'Medium',
  894: 'Medium',
  906: 'Medium',
  963: 'Medium',
  1201: 'Medium',
  1202: 'Medium',
  4902: 'Medium',
  27: 'Large',
  513: 'Large',
  898: 'Large',
  900: 'Large',
  902: 'Large',
  941: 'Large',
};
const CAPITAL_SHIP_GROUPS = new Set([30, 485, 547, 659, 883, 1538, 4594, 5120]);
const SUBSYSTEM_CATEGORY = 32;
const TECH_I_META_GROUP = 1;

const EQUIPMENT_CATEGORIES = new Set([7, 20, 22]);
const EQUIPMENT_GROUPS = new Set([12, 340, 448, 649]);
const AMMO_CATEGORIES = new Set([8]);
const DRONE_CATEGORIES = new Set([18, 87]);
const STRUCTURE_CATEGORIES = new Set([23, 65, 66]);
const STRUCTURE_GROUPS = new Set([536, 1136]);
const ADV_COMPONENT_GROUPS = new Set([332, 334, 716, 964]);

export function productRigScope({ categoryID, groupID, metaGroupID }) {
  if (categoryID === SHIP_CATEGORY) {
    if (CAPITAL_SHIP_GROUPS.has(groupID)) return 'capShip';
    const size = SHIP_SIZE_BY_GROUP[groupID];
    if (!size) return undefined;
    return `${(metaGroupID ?? TECH_I_META_GROUP) === TECH_I_META_GROUP ? 'bas' : 'adv'}${size}`;
  }
  if (categoryID === SUBSYSTEM_CATEGORY) return 'advMedium';
  if (groupID === 873) return 'basCapComp';
  if (groupID === 913) return 'advCapComp';
  if (ADV_COMPONENT_GROUPS.has(groupID)) return 'advComp';
  if (STRUCTURE_GROUPS.has(groupID) || STRUCTURE_CATEGORIES.has(categoryID)) return 'structure';
  if (EQUIPMENT_GROUPS.has(groupID) || EQUIPMENT_CATEGORIES.has(categoryID)) return 'equipment';
  if (AMMO_CATEGORIES.has(categoryID)) return 'ammo';
  if (DRONE_CATEGORIES.has(categoryID)) return 'drone';
  return undefined;
}
