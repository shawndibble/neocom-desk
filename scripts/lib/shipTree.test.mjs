import { describe, it, expect } from 'vitest';
import { buildShipTree } from './shipTree.mjs';

/** Turns a header + data-row lists into the array-of-arrays shape `parseCsv` returns. */
function rows(header, ...data) {
  return [header, ...data];
}

/**
 * A minimal fixture covering: a normal hull (Rifter-like, 587), a T3
 * cruiser-like hull with no dgmTypeAttributes rows at all (2001), and rows
 * that must each fail exactly one hull-filter condition (999 unpublished,
 * 1000 wrong category, 1001 unknown Ship Tree class, 1002 unknown Ship Tree
 * faction).
 */
function csv() {
  return {
    invGroups: rows(
      ['groupID', 'categoryID', 'groupName'],
      ['25', '6', 'Frigate'], // ship category
      ['99', '7', 'Widget'] // non-ship category
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
      // Valid hull.
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
      // T3-cruiser-like hull: no dgmTypeAttributes rows will reference it.
      ['2001', '25', 'Tengu', 'A Strategic Cruiser.', '500001', '0', '2', '8', '1'],
      // Excluded: unpublished.
      ['999', '25', 'Unpublished Hull', '', '500001', '0', '1', '8', '0'],
      // Excluded: group is not category 6.
      ['1000', '99', 'Not A Ship', '', '500001', '0', '1', '8', '1'],
      // Excluded: shipTreeGroupID isn't a real Ship Tree class (junk on a non-ship row's analog).
      ['1001', '25', 'Unknown Class Hull', '', '500001', '0', '1', '999', '1'],
      // Excluded: factionID isn't a Ship Tree faction (mirrors the Capsule, faction 500005).
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
      // A class with no hulls at all — still expected in the output.
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
      // display=0: an implicit prereq the game doesn't draw.
      ['8', '500002', '3327', '1', '0']
    ),
    shipTreeFactions: rows(
      ['factionID', 'description'],
      ['500001', 'Favor missiles and Hybrid Turrets.'],
      // No hull carries this faction — must be dropped from the output.
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
      // Role bonus (skillID -1), a plain number, unit %.
      ['587', '-1', '10', 'bonus to <a href=showinfo:3336>ship</a> max velocity', '105'],
      // Per-skill-level trait.
      [
        '587',
        '3329',
        '7.5',
        'bonus to <a href=showinfo:3302>Small Projectile Turret</a> rate of fire',
        '105',
      ],
      // Role bonus with no number at all ('' bonus, no unit).
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
      // Rifter's real slot/hardpoint layout (3H/3M/4L, 2 launcher + 3 turret
      // hardpoints) — mixes valueInt and valueFloat rows on purpose, to
      // cover both branches.
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
      // 2001 (Tengu) intentionally has NO rows here.
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

  it('strips markup and tidies whitespace in a hull description', () => {
    const { ships } = buildShipTree(csv());
    const rifter = ships.find((s) => s.typeID === 587);
    expect(rifter.description).toBe(
      'A very powerful combat frigate. Can tackle the best frigates out there.'
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
    // Blank techLevel/metaLevel on the Tengu row.
    const invTypes = fixture.invTypes.map((r) =>
      r[0] === '2001' ? [r[0], r[1], r[2], r[3], r[4], '', '', r[7], r[8]] : r
    );
    const { ships } = buildShipTree({ ...fixture, invTypes });
    const tengu = ships.find((s) => s.typeID === 2001);
    expect(tengu.techLevel).toBe(1);
    expect(tengu.metaLevel).toBe(0);
  });
});
