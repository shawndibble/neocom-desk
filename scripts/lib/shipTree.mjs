const SHIP_CATEGORY_ID = '6';

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

function tidyText(s) {
  return (s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function iconBasename(path) {
  const base = (path ?? '').split('/').pop() ?? '';
  return base.replace(/\.png$/i, '').toLowerCase();
}

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

  const categoryOfGroup = new Map();
  {
    const h = indexHeader(invGroupsRows);
    for (let i = 1; i < invGroupsRows.length; i++) {
      const r = invGroupsRows[i];
      categoryOfGroup.set(r[h.groupID], r[h.categoryID]);
    }
  }

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

  const unitDisplayName = new Map();
  {
    const h = indexHeader(eveUnitsRows);
    for (let i = 1; i < eveUnitsRows.length; i++) {
      const r = eveUnitsRows[i];
      unitDisplayName.set(Number(r[h.unitID]), r[h.displayName]);
    }
  }

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
        stats: { ...ZERO_STATS },
        description: tidyDescription(r[h.description]),
      });
    }
  }
  const hullByTypeId = new Map(hulls.map((s) => [s.typeID, s]));

  {
    const h = indexHeader(shipSkillsRows);
    for (let i = 1; i < shipSkillsRows.length; i++) {
      const r = shipSkillsRows[i];
      const ship = hullByTypeId.get(Number(r[h.typeID]));
      if (!ship) continue;
      ship.required.push({ skillTypeID: Number(r[h.skillID]), level: Number(r[h.level]) });
    }
  }

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
        display: r[h.display] === '1',
      });
    }
  }

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
