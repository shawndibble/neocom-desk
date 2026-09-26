// Pure transform behind build-sde.mjs's Ship Tree bake (public/data/shipTree.json,
// issue's Ship Tree tab). Takes the same {name: rows} shape build-sde.mjs's own
// `raw` object holds — each value the array-of-arrays `parseCsv` returns
// (header row first, then data rows, every cell a string) — so this is
// testable with small hand-made fixtures, no download pipeline needed.
// Mirrors flattenMarketWideTree.mjs's split: the join logic lives here, the
// CSV download/cache and output-writing stay in build-sde.mjs.
//
// Output shape is `ShipTreeData` (src/sde/types.ts) — read that file before
// changing anything here; the tree's *shape* (which class hangs off which)
// is not in the SDE and lives in `engine/shipTree/templates.ts` instead.

const SHIP_CATEGORY_ID = '6';

// Hull stat fields -> the dgmAttributeTypes.attributeName that carries them.
// Resolved BY NAME against the dump every bake, never hard-coded ids: an
// attribute's id is only stable for one dump, not a fact worth memorizing.
const STAT_ATTRIBUTE_NAMES = {
  highSlots: 'hiSlots',
  medSlots: 'medSlots',
  lowSlots: 'lowSlots',
  rigSlots: 'rigSlots',
  rigSize: 'rigSize',
  turretHardpoints: 'turretSlotsLeft',
  launcherHardpoints: 'launcherSlotsLeft',
  cpu: 'cpuOutput',
  powergrid: 'powerOutput',
  calibration: 'upgradeCapacity',
  droneBay: 'droneCapacity',
  droneBandwidth: 'droneBandwidth',
};

const ZERO_STATS = Object.freeze(
  Object.fromEntries(Object.keys(STAT_ATTRIBUTE_NAMES).map((field) => [field, 0]))
);

function indexHeader(rows) {
  const header = rows[0];
  const idx = {};
  for (let i = 0; i < header.length; i++) idx[header[i]] = i;
  return idx;
}

/** Strips HTML tags (invTraits' `<a href=showinfo:…>…</a>`) and tidies whitespace onto one line. */
function tidyText(s) {
  return (s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A hull description (invTypes' markup) as plain text that keeps its line
 * breaks: `<br>` and paragraph tags become newlines — stripping them outright
 * glued sentences together ("wreckage.The Noctis") — every other tag goes,
 * runs of spaces and tabs collapse, and never more than one blank line.
 */
export function tidyDescription(s) {
  return (s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>\s*<p\b[^>]*>/gi, '\n\n')
    .replace(/<\/?p\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** `res:/UI/Texture/Classes/ShipTree/groupIcons/battleCruiser.png` -> `battlecruiser`. */
function iconBasename(path) {
  const base = (path ?? '').split('/').pop() ?? '';
  return base.replace(/\.png$/i, '').toLowerCase();
}

/**
 * Builds `ShipTreeData` from Fuzzwork's ship-tree CSVs, already parsed into
 * row arrays. `csv` keys: invTypes, invGroups, invTraits, eveUnits,
 * chrFactions, shipSkills, shipTreeGroups, shipTreeGroupPreReqSkills,
 * shipTreeFactions, dgmTypeAttributes, dgmAttributeTypes.
 */
export function buildShipTree(csv) {
  const {
    invTypes: invTypesRows,
    invGroups: invGroupsRows,
    invTraits: invTraitsRows,
    eveUnits: eveUnitsRows,
    chrFactions: chrFactionsRows,
    shipSkills: shipSkillsRows,
    shipTreeGroups: shipTreeGroupsRows,
    shipTreeGroupPreReqSkills: shipTreeGroupPreReqSkillsRows,
    shipTreeFactions: shipTreeFactionsRows,
    dgmTypeAttributes: dgmTypeAttributesRows,
    dgmAttributeTypes: dgmAttributeTypesRows,
  } = csv;

  // --- invGroups: groupID -> categoryID (raw strings — the hull filter
  // below compares them straight from the CSV, no Number() round trip) ---
  const categoryOfGroup = new Map();
  {
    const h = indexHeader(invGroupsRows);
    for (let i = 1; i < invGroupsRows.length; i++) {
      const r = invGroupsRows[i];
      categoryOfGroup.set(r[h.groupID], r[h.categoryID]);
    }
  }

  // --- shipTreeGroups / shipTreeFactions ids, for the hull filter. Junk
  // rides in invTypes.shipTreeGroupID on non-ship rows, so the category
  // check above is what actually keeps this filter honest. ---
  const shipTreeGroupIds = new Set();
  {
    const h = indexHeader(shipTreeGroupsRows);
    for (let i = 1; i < shipTreeGroupsRows.length; i++) {
      shipTreeGroupIds.add(shipTreeGroupsRows[i][h.groupID]);
    }
  }
  const shipTreeFactionIds = new Set();
  {
    const h = indexHeader(shipTreeFactionsRows);
    for (let i = 1; i < shipTreeFactionsRows.length; i++) {
      shipTreeFactionIds.add(shipTreeFactionsRows[i][h.factionID]);
    }
  }

  // --- eveUnits: unitID -> displayName, for trait units ---
  const unitDisplayName = new Map();
  {
    const h = indexHeader(eveUnitsRows);
    for (let i = 1; i < eveUnitsRows.length; i++) {
      const r = eveUnitsRows[i];
      unitDisplayName.set(Number(r[h.unitID]), r[h.displayName]);
    }
  }

  // --- hulls: published, category 6 (Ship), a Ship Tree class, a Ship Tree
  // faction (this is what drops the Capsule — faction 500005 isn't one) ---
  const hulls = [];
  {
    const h = indexHeader(invTypesRows);
    for (let i = 1; i < invTypesRows.length; i++) {
      const r = invTypesRows[i];
      if (r[h.published] !== '1') continue;
      if (categoryOfGroup.get(r[h.groupID]) !== SHIP_CATEGORY_ID) continue;
      if (!shipTreeGroupIds.has(r[h.shipTreeGroupID])) continue;
      if (!shipTreeFactionIds.has(r[h.factionID])) continue;
      hulls.push({
        typeID: Number(r[h.typeID]),
        name: r[h.typeName],
        factionID: Number(r[h.factionID]),
        treeGroupID: Number(r[h.shipTreeGroupID]),
        techLevel: Number(r[h.techLevel]) || 1,
        metaLevel: Number(r[h.metaLevel]) || 0,
        required: [],
        traits: [],
        // A T3 cruiser hull carries none of these dogma attributes at all —
        // its slots come from fitted subsystems, not the hull — so every
        // field defaults to 0 rather than some fields being absent.
        stats: { ...ZERO_STATS },
        description: tidyDescription(r[h.description]),
      });
    }
  }
  const hullByTypeId = new Map(hulls.map((s) => [s.typeID, s]));

  // --- required: shipSkills (typeID, skillID, level) ---
  {
    const h = indexHeader(shipSkillsRows);
    for (let i = 1; i < shipSkillsRows.length; i++) {
      const r = shipSkillsRows[i];
      const ship = hullByTypeId.get(Number(r[h.typeID]));
      if (!ship) continue;
      ship.required.push({ skillTypeID: Number(r[h.skillID]), level: Number(r[h.level]) });
    }
  }

  // --- traits: invTraits. skillID <= 0 is a role bonus (not per skill
  // level); bonus '' or 'None' is a bonus with no number. ---
  {
    const h = indexHeader(invTraitsRows);
    for (let i = 1; i < invTraitsRows.length; i++) {
      const r = invTraitsRows[i];
      const ship = hullByTypeId.get(Number(r[h.typeID]));
      if (!ship) continue;
      const skillNum = Number(r[h.skillID]);
      const bonusRaw = r[h.bonus];
      const unitRaw = r[h.unitID];
      const unitID = unitRaw === '' ? null : Number(unitRaw);
      ship.traits.push({
        skillTypeID: skillNum > 0 ? skillNum : null,
        bonus: bonusRaw === '' || bonusRaw === 'None' ? null : Number(bonusRaw),
        unit: unitID !== null ? (unitDisplayName.get(unitID) ?? '') : '',
        text: tidyText(r[h.bonusText]),
      });
    }
  }

  // --- stats: dgmTypeAttributes, attribute ids resolved BY NAME against
  // dgmAttributeTypes — never hard-coded, per issue's lesson learned on the
  // throwaway prototype. ---
  {
    const attrIdByName = new Map();
    const h = indexHeader(dgmAttributeTypesRows);
    for (let i = 1; i < dgmAttributeTypesRows.length; i++) {
      const r = dgmAttributeTypesRows[i];
      attrIdByName.set(r[h.attributeName], r[h.attributeID]);
    }
    const fieldByAttrId = new Map();
    for (const [field, attrName] of Object.entries(STAT_ATTRIBUTE_NAMES)) {
      const id = attrIdByName.get(attrName);
      if (id !== undefined) fieldByAttrId.set(Number(id), field);
    }

    const hDta = indexHeader(dgmTypeAttributesRows);
    for (let i = 1; i < dgmTypeAttributesRows.length; i++) {
      const r = dgmTypeAttributesRows[i];
      const ship = hullByTypeId.get(Number(r[hDta.typeID]));
      if (!ship) continue;
      const field = fieldByAttrId.get(Number(r[hDta.attributeID]));
      if (!field) continue;
      const vi = r[hDta.valueInt];
      const vf = r[hDta.valueFloat];
      ship.stats[field] = vi !== '' ? Number(vi) : Number(vf || 0);
    }
  }

  // --- groups: every shipTreeGroups row (not only ones with hulls — the
  // Ship Tree's class rail always shows every class, empty or not), plus
  // shipTreeGroupPreReqSkills per faction. ---
  const groups = {};
  {
    const h = indexHeader(shipTreeGroupsRows);
    for (let i = 1; i < shipTreeGroupsRows.length; i++) {
      const r = shipTreeGroupsRows[i];
      groups[r[h.groupID]] = {
        id: Number(r[h.groupID]),
        name: r[h.name],
        description: r[h.description],
        icon: iconBasename(r[h.icon]),
        prereqsByFaction: {},
      };
    }
  }
  {
    const h = indexHeader(shipTreeGroupPreReqSkillsRows);
    for (let i = 1; i < shipTreeGroupPreReqSkillsRows.length; i++) {
      const r = shipTreeGroupPreReqSkillsRows[i];
      const group = groups[r[h.groupID]];
      if (!group) continue;
      const factionID = r[h.factionID];
      (group.prereqsByFaction[factionID] ??= []).push({
        skillTypeID: Number(r[h.skillID]),
        level: Number(r[h.level]),
        // display=0 rows are implicit (e.g. Spaceship Command I on Corvette)
        // — the game doesn't draw them, but a fitting-check still needs them.
        display: r[h.display] === '1',
      });
    }
  }

  // --- factions: shipTreeFactions (description) + chrFactions (name), only
  // factions with at least one hull, keeping shipTreeFactions' own row order. ---
  const factionNameById = new Map();
  {
    const h = indexHeader(chrFactionsRows);
    for (let i = 1; i < chrFactionsRows.length; i++) {
      const r = chrFactionsRows[i];
      factionNameById.set(r[h.factionID], r[h.factionName]);
    }
  }
  const hullFactionIds = new Set(hulls.map((s) => String(s.factionID)));
  const factions = [];
  {
    const h = indexHeader(shipTreeFactionsRows);
    for (let i = 1; i < shipTreeFactionsRows.length; i++) {
      const r = shipTreeFactionsRows[i];
      const factionID = r[h.factionID];
      if (!hullFactionIds.has(factionID)) continue;
      factions.push({
        id: Number(factionID),
        name: factionNameById.get(factionID) ?? factionID,
        description: r[h.description],
      });
    }
  }

  hulls.sort((a, b) => a.typeID - b.typeID);

  return { factions, groups, ships: hulls };
}
