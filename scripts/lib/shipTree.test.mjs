import { describe, it, expect } from 'vitest';
import { buildShipTree, tidyDescription } from './shipTree.mjs';

function rows(header, ...data) {
  return [header, ...data];
}

function csv() {
  return {
    invGroups: rows(
      ['groupID', 'categoryID', 'groupName'],
      ['25', '6', 'Frigate'],
      ['99', '7', 'Widget']
    ),
    invTypes: rows(
      [
        'typeID',
        'groupID',
        'typeName',
        'description',
        'factionID',
        'metaLevel',
        'techLevel',
        'shipTreeGroupID',
        'published',
      ],
      [
        '587',
        '25',
        'Rifter',
        'A <b>very</b> powerful combat frigate.\n\nCan tackle the best frigates out there.',
        '500001',
        '0',
        '1',
        '8',
        '1',
      ],
      ['2001', '25', 'Tengu', 'A Strategic Cruiser.', '500001', '0', '2', '8', '1'],
      ['999', '25', 'Unpublished Hull', '', '500001', '0', '1', '8', '0'],
      ['1000', '99', 'Not A Ship', '', '500001', '0', '1', '8', '1'],
      ['1001', '25', 'Unknown Class Hull', '', '500001', '0', '1', '999', '1'],
      ['1002', '25', 'Capsule-like Hull', '', '500005', '0', '1', '8', '1']
    ),
    shipTreeGroups: rows(
      ['groupID', 'name', 'description', 'icon'],
      [
        '8',
        'Frigate',
        'Small, fast, fragile.',
        'res:/UI/Texture/Classes/ShipTree/groupIcons/frigate.png',
      ],
      [
        '23',
        'Battlecruiser',
        'Bridges cruisers and battleships.',
        'res:/UI/Texture/Classes/ShipTree/groupIcons/battleCruiser.png',
      ]
    ),
    shipTreeGroupPreReqSkills: rows(
      ['groupID', 'factionID', 'skillID', 'level', 'display'],
      ['8', '500001', '3327', '1', '1'],
      ['8', '500002', '3327', '1', '0']
    ),
    shipTreeFactions: rows(
      ['factionID', 'description'],
      ['500001', 'Favor missiles and Hybrid Turrets.'],
      ['500099', 'Unused faction.']
    ),
    chrFactions: rows(
      ['factionID', 'factionName'],
      ['500001', 'Caldari State'],
      ['500099', 'Unused Faction']
    ),
    shipSkills: rows(['typeID', 'skillID', 'level'], ['587', '3327', '1']),
    invTraits: rows(
      ['typeID', 'skillID', 'bonus', 'bonusText', 'unitID'],
      ['587', '-1', '10', 'bonus to <a href=showinfo:3336>ship</a> max velocity', '105'],
      [
        '587',
        '3329',
        '7.5',
        'bonus to <a href=showinfo:3302>Small Projectile Turret</a> rate of fire',
        '105',
      ],
      ['587', '-1', '', 'Can fit a <a href=showinfo:11578>Covert Ops Cloaking Device</a>', '']
    ),
    eveUnits: rows(['unitID', 'displayName'], ['105', '%']),
    dgmAttributeTypes: rows(
      ['attributeID', 'attributeName'],
      ['14', 'hiSlots'],
      ['13', 'medSlots'],
      ['12', 'lowSlots'],
      ['1137', 'rigSlots'],
      ['1547', 'rigSize'],
      ['102', 'turretSlotsLeft'],
      ['101', 'launcherSlotsLeft'],
      ['48', 'cpuOutput'],
      ['11', 'powerOutput'],
      ['1132', 'upgradeCapacity'],
      ['283', 'droneCapacity'],
      ['1271', 'droneBandwidth']
    ),
    dgmTypeAttributes: rows(
      ['typeID', 'attributeID', 'valueInt', 'valueFloat'],
      ['587', '14', '3', ''],
      ['587', '13', '3', ''],
      ['587', '12', '4', ''],
      ['587', '1137', '3', ''],
      ['587', '1547', '1', ''],
      ['587', '102', '3', ''],
      ['587', '101', '2', ''],
      ['587', '48', '', '130.0'],
      ['587', '11', '', '41.0'],
      ['587', '1132', '', '400.0'],
      ['587', '283', '0', ''],
      ['587', '1271', '0', '']
    ),
  };
}

describe('buildShipTree', () => {
  it('filters hulls to published ships whose group is category 6, a Ship Tree class, and a Ship Tree faction', () => {
    const { ships } = buildShipTree(csv());
    const typeIDs = ships.map((s) => s.typeID).sort((a, b) => a - b);
    expect(typeIDs).toEqual([587, 2001]);
  });

  it('captures a role-bonus trait (skillID <= 0) as skillTypeID null, and a per-skill trait with its real skillTypeID', () => {
    const { ships } = buildShipTree(csv());
    const rifter = ships.find((s) => s.typeID === 587);
    const roleBonus = rifter.traits.find((t) => t.text.includes('max velocity'));
    const skillBonus = rifter.traits.find((t) => t.text.includes('rate of fire'));
    expect(roleBonus.skillTypeID).toBeNull();
    expect(roleBonus.bonus).toBe(10);
    expect(skillBonus.skillTypeID).toBe(3329);
    expect(skillBonus.bonus).toBe(7.5);
  });

  it('resolves a trait unit via eveUnits, and leaves it empty when the row carries none', () => {
    const { ships } = buildShipTree(csv());
    const rifter = ships.find((s) => s.typeID === 587);
    const roleBonus = rifter.traits.find((t) => t.text.includes('max velocity'));
    const noNumberBonus = rifter.traits.find((t) => t.text.includes('Cloaking Device'));
    expect(roleBonus.unit).toBe('%');
    expect(noNumberBonus.unit).toBe('');
    expect(noNumberBonus.bonus).toBeNull();
  });

  it('strips markup from trait bonus text', () => {
    const { ships } = buildShipTree(csv());
    const rifter = ships.find((s) => s.typeID === 587);
    const skillBonus = rifter.traits.find((t) => t.skillTypeID === 3329);
    expect(skillBonus.text).toBe('bonus to Small Projectile Turret rate of fire');
  });

  it('lower-cases a class icon basename and drops the path and extension', () => {
    const { groups } = buildShipTree(csv());
    expect(groups['8'].icon).toBe('frigate');
    expect(groups['23'].icon).toBe('battlecruiser');
  });

  it('emits every Ship Tree class, including one with no hulls at all', () => {
    const { groups } = buildShipTree(csv());
    expect(Object.keys(groups).sort()).toEqual(['23', '8']);
    expect(groups['23'].name).toBe('Battlecruiser');
  });

  it('builds per-faction class prerequisites, including the display flag', () => {
    const { groups } = buildShipTree(csv());
    expect(groups['8'].prereqsByFaction['500001']).toEqual([
      { skillTypeID: 3327, level: 1, display: true },
    ]);
    expect(groups['8'].prereqsByFaction['500002']).toEqual([
      { skillTypeID: 3327, level: 1, display: false },
    ]);
  });

  it("extracts a hull's stats from dgmTypeAttributes, resolving each attribute id by name", () => {
    const { ships } = buildShipTree(csv());
    const rifter = ships.find((s) => s.typeID === 587);
    expect(rifter.stats).toEqual({
      highSlots: 3,
      medSlots: 3,
      lowSlots: 4,
      rigSlots: 3,
      rigSize: 1,
      turretHardpoints: 3,
      launcherHardpoints: 2,
      cpu: 130,
      powergrid: 41,
      calibration: 400,
      droneBay: 0,
      droneBandwidth: 0,
    });
  });

  it('gives a T3-cruiser-like hull with no dgmTypeAttributes rows all-zero stats', () => {
    const { ships } = buildShipTree(csv());
    const tengu = ships.find((s) => s.typeID === 2001);
    expect(tengu.stats).toEqual({
      highSlots: 0,
      medSlots: 0,
      lowSlots: 0,
      rigSlots: 0,
      rigSize: 0,
      turretHardpoints: 0,
      launcherHardpoints: 0,
      cpu: 0,
      powergrid: 0,
      calibration: 0,
      droneBay: 0,
      droneBandwidth: 0,
    });
  });

  it('strips markup in a hull description, keeping its paragraph breaks', () => {
    const { ships } = buildShipTree(csv());
    const rifter = ships.find((s) => s.typeID === 587);
    expect(rifter.description).toBe(
      'A very powerful combat frigate.\n\nCan tackle the best frigates out there.'
    );
  });

  it('only includes Ship Tree factions with at least one hull, keeping shipTreeFactions row order', () => {
    const { factions } = buildShipTree(csv());
    expect(factions).toEqual([
      { id: 500001, name: 'Caldari State', description: 'Favor missiles and Hybrid Turrets.' },
    ]);
  });

  it("captures a hull's required skills from shipSkills", () => {
    const { ships } = buildShipTree(csv());
    const rifter = ships.find((s) => s.typeID === 587);
    expect(rifter.required).toEqual([{ skillTypeID: 3327, level: 1 }]);
  });

  it("defaults techLevel to 1 and metaLevel to 0 when invTypes' columns are blank", () => {
    const fixture = csv();
    const invTypes = fixture.invTypes.map((r) =>
      r[0] === '2001' ? [r[0], r[1], r[2], r[3], r[4], '', '', r[7], r[8]] : r
    );
    const { ships } = buildShipTree({ ...fixture, invTypes });
    const tengu = ships.find((s) => s.typeID === 2001);
    expect(tengu.techLevel).toBe(1);
    expect(tengu.metaLevel).toBe(0);
  });
});

describe('tidyDescription', () => {
  it('turns <br> in any spelling into a line break, so sentences never glue together', () => {
    expect(tidyDescription('from the wreckage.<br>The Noctis')).toBe(
      'from the wreckage.\nThe Noctis'
    );
    expect(tidyDescription('a<br/>b<BR />c<Br >d')).toBe('a\nb\nc\nd');
  });
  it('turns paragraph tags into line breaks and strips every other tag', () => {
    expect(tidyDescription('<p>One <b>bold</b> line.</p><p>Two.</p>')).toBe(
      'One bold line.\n\nTwo.'
    );
    expect(tidyDescription('See <a href=showinfo:587>Rifter</a>.')).toBe('See Rifter.');
  });
  it('collapses runs of spaces and tabs, keeps at most two newlines in a row, and trims', () => {
    expect(tidyDescription('  a \t  b\r\n\r\n\r\n\r\nc  \n  d  ')).toBe('a b\n\nc\nd');
    expect(tidyDescription('a<br><br><br><br>b')).toBe('a\n\nb');
  });
  it('reads a missing description as empty', () => {
    expect(tidyDescription(undefined)).toBe('');
  });
});
