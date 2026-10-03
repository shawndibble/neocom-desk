import { describe, expect, it } from 'vitest';
import {
  appliedDpsAt,
  chargesUsedPerMinute,
  factionName,
  filterChoices,
  groupByFaction,
  groupByType,
  iskPerMinute,
  quickPicks,
  rangesDiffer,
  sortGroups,
  strictlyWorseThan,
  type ChargeChoice,
} from './chargeChoice';

function choice(overrides: Partial<ChargeChoice> & { typeId: number }): ChargeChoice {
  return {
    name: `Charge ${overrides.typeId}`,
    baseTypeId: overrides.typeId,
    baseName: `Charge ${overrides.typeId}`,
    tier: 'tech1',
    faction: null,
    dps: 100,
    optimal: 30_000,
    falloff: 18_000,
    damage: { em: 0, thermal: 0.5, kinetic: 0.5, explosive: 0 },
    price: 50,
    roundsPerMinute: 38,
    cargo: 0,
    skillMissing: false,
    ...overrides,
  };
}

const lead = choice({ typeId: 1, name: 'Lead Charge L', baseName: 'Lead Charge L', dps: 253 });
const antimatter = choice({
  typeId: 2,
  name: 'Antimatter Charge L',
  baseName: 'Antimatter Charge L',
  dps: 380,
  optimal: 15_000,
  price: 62,
});
const cnAntimatter = choice({
  typeId: 3,
  name: 'Caldari Navy Antimatter Charge L',
  baseTypeId: 2,
  baseName: 'Antimatter Charge L',
  tier: 'faction',
  faction: 'Caldari Navy',
  dps: 437,
  optimal: 15_000,
  price: 500,
});
const fnAntimatter = choice({
  typeId: 4,
  name: 'Federation Navy Antimatter Charge L',
  baseTypeId: 2,
  baseName: 'Antimatter Charge L',
  tier: 'faction',
  faction: 'Federation Navy',
  dps: 437,
  optimal: 15_000,
  price: 540,
});
const spike = choice({
  typeId: 5,
  name: 'Spike L',
  baseName: 'Spike L',
  tier: 'tech2',
  dps: 280,
  optimal: 54_000,
  price: 420,
  skillMissing: true,
});

describe('factionName', () => {
  it("is the name's prefix ahead of its Tech I charge's name", () => {
    expect(factionName('Caldari Navy Antimatter Charge L', 'Antimatter Charge L')).toBe(
      'Caldari Navy'
    );
  });

  it('is null when the name does not end with the Tech I name', () => {
    expect(factionName('Odd Ammo', 'Antimatter Charge L')).toBeNull();
  });
});

describe('groupByType', () => {
  it('puts faction versions under their Tech I charge, Tech I first', () => {
    const groups = groupByType([cnAntimatter, lead, antimatter]);
    expect(groups.map((g) => g.baseTypeId)).toEqual([1, 2]);
    expect(groups[1]!.choices.map((c) => c.typeId)).toEqual([2, 3]);
    expect(groups[1]!.name).toBe('Antimatter Charge L');
  });

  it('keeps a faction group whose Tech I charge was filtered out', () => {
    const groups = groupByType([cnAntimatter]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.representative.typeId).toBe(3);
  });

  it('orders factions by damage, then price', () => {
    const groups = groupByType([fnAntimatter, cnAntimatter, antimatter]);
    expect(groups[0]!.choices.map((c) => c.typeId)).toEqual([2, 3, 4]);
  });

  it('marks a Tech II group', () => {
    expect(groupByType([spike])[0]!.tier).toBe('tech2');
  });
});

describe('groupByFaction', () => {
  it('groups Tech I, each faction, then Tech II', () => {
    const groups = groupByFaction([spike, cnAntimatter, lead, antimatter, fnAntimatter]);
    expect(groups.map((g) => g.key)).toEqual([
      'tech1',
      'faction:Caldari Navy',
      'faction:Federation Navy',
      'tech2',
    ]);
  });

  it("states a faction's damage and price against its Tech I versions", () => {
    const groups = groupByFaction([antimatter, cnAntimatter]);
    const navy = groups[1]!;
    expect(navy.damageGain).toBeCloseTo(437 / 380 - 1);
    expect(navy.priceRatio).toBeCloseTo(500 / 62);
  });

  it('has no ratios when no Tech I version is listed', () => {
    const groups = groupByFaction([cnAntimatter]);
    expect(groups[0]!.damageGain).toBeNull();
    expect(groups[0]!.priceRatio).toBeNull();
  });
});

describe('sortGroups', () => {
  const groups = groupByType([lead, antimatter]);

  it('sorts by range, longest first', () => {
    expect(sortGroups(groups, 'range', null).map((g) => g.baseTypeId)).toEqual([1, 2]);
  });

  it('sorts by damage, most first', () => {
    expect(sortGroups(groups, 'damage', null).map((g) => g.baseTypeId)).toEqual([2, 1]);
  });

  it('sorts by price, cheapest first, unpriced last', () => {
    const unpriced = groupByType([{ ...lead, price: null }, antimatter]);
    expect(sortGroups(unpriced, 'price', null).map((g) => g.baseTypeId)).toEqual([2, 1]);
  });

  it('sorts by damage at a distance when one is set', () => {
    // At 40 km Antimatter (15 km optimal, 18 km falloff) barely lands.
    expect(sortGroups(groups, 'damage', 40_000).map((g) => g.baseTypeId)).toEqual([1, 2]);
  });
});

describe('rangesDiffer', () => {
  it('is false when every group reaches the same range (missiles)', () => {
    const a = choice({ typeId: 1, falloff: 0, optimal: 60_000 });
    const b = choice({ typeId: 2, falloff: 0, optimal: 60_000 });
    expect(rangesDiffer(groupByType([a, b]))).toBe(false);
  });

  it('is true for a hybrid ladder', () => {
    expect(rangesDiffer(groupByType([lead, antimatter]))).toBe(true);
  });
});

describe('appliedDpsAt', () => {
  it('is full damage inside optimal (with the wrecking-shot average)', () => {
    expect(appliedDpsAt(lead, 10_000)).toBeCloseTo(lead.dps * 1.0, -1);
  });

  it('halves the chance to hit one falloff past optimal', () => {
    const at = appliedDpsAt(lead, lead.optimal + lead.falloff);
    expect(at).toBeLessThan(lead.dps * 0.6);
    expect(at).toBeGreaterThan(lead.dps * 0.35);
  });

  it('treats a missile (no falloff) as all or nothing at its flight range', () => {
    const missile = choice({ typeId: 9, falloff: 0, optimal: 60_000, dps: 200 });
    expect(appliedDpsAt(missile, 59_000)).toBe(200);
    expect(appliedDpsAt(missile, 61_000)).toBe(0);
  });
});

describe('iskPerMinute', () => {
  it('is price times rounds fired per minute', () => {
    expect(iskPerMinute(lead)).toBe(50 * 38);
  });

  it('is null without a price, or for a charge that does not wear out', () => {
    expect(iskPerMinute({ ...lead, price: null })).toBeNull();
    expect(iskPerMinute({ ...lead, roundsPerMinute: null })).toBeNull();
  });
});

describe('strictlyWorseThan', () => {
  it('names the cheaper faction version with the same damage and range', () => {
    const all = [antimatter, cnAntimatter, fnAntimatter];
    expect(strictlyWorseThan(fnAntimatter, all)?.typeId).toBe(3);
    expect(strictlyWorseThan(cnAntimatter, all)).toBeNull();
  });

  it('never calls an unpriced charge worse, nor one beaten only by a locked charge', () => {
    const all = [antimatter, { ...cnAntimatter, skillMissing: true }, fnAntimatter];
    expect(strictlyWorseThan(fnAntimatter, all)).toBeNull();
    expect(strictlyWorseThan({ ...fnAntimatter, price: null }, [cnAntimatter])).toBeNull();
  });

  it('only compares within one type', () => {
    expect(strictlyWorseThan(antimatter, [antimatter, { ...lead, dps: 999, price: 1 }])).toBeNull();
  });
});

describe('quickPicks', () => {
  const all = [lead, antimatter, cnAntimatter, fnAntimatter, spike];

  it('picks max damage, max reach and best value among usable charges', () => {
    const picks = quickPicks(all, null)!;
    expect(picks.maxDamage.typeId).toBe(3); // CN beats FN on price at equal damage
    expect(picks.maxRange.typeId).toBe(1); // Spike is skill-locked
    // Within 10% of 437: only the navy charges; CN is cheaper per minute.
    expect(picks.bestValue?.typeId).toBe(3);
  });

  it('rates value at the distance when one is set', () => {
    const picks = quickPicks(all, 40_000)!;
    expect(picks.maxDamage.typeId).toBe(1);
    expect(picks.bestValue?.typeId).toBe(1);
  });

  it('has no best value when nothing near the top has a price', () => {
    const unpriced = all.map((c) => ({ ...c, price: null }));
    expect(quickPicks(unpriced, null)!.bestValue).toBeNull();
  });

  it('is null when nothing is usable', () => {
    expect(quickPicks([spike], null)).toBeNull();
  });
});

describe('filterChoices', () => {
  const all = [lead, cnAntimatter, spike, { ...antimatter, cargo: 1000 }];

  it('Tech I drops faction charges but keeps Tech II', () => {
    expect(
      filterChoices(all, { tech1Only: true, inCargo: false, usable: false }).map((c) => c.typeId)
    ).toEqual([1, 5, 2]);
  });

  it('In cargo keeps what the hold has; Usable drops skill-locked charges', () => {
    expect(
      filterChoices(all, { tech1Only: false, inCargo: true, usable: false }).map((c) => c.typeId)
    ).toEqual([2]);
    expect(
      filterChoices(all, { tech1Only: false, inCargo: false, usable: true }).map((c) => c.typeId)
    ).toEqual([1, 3, 2]);
  });
});

describe('chargesUsedPerMinute', () => {
  it('is one charge per shot per gun for ammo', () => {
    expect(chargesUsedPerMinute({ rateOfFireMs: 10_000, guns: 6, crystal: null })).toBe(36);
  });

  it("is null for a crystal that doesn't take damage", () => {
    const crystal = { takesDamage: false, volatility: 0, volatilityDamage: 0, hitpoints: 1 };
    expect(chargesUsedPerMinute({ rateOfFireMs: 10_000, guns: 6, crystal })).toBeNull();
  });

  it("is a wearing crystal's expected burn: shots × chance × damage ÷ hitpoints", () => {
    const crystal = { takesDamage: true, volatility: 0.1, volatilityDamage: 1, hitpoints: 10 };
    expect(chargesUsedPerMinute({ rateOfFireMs: 10_000, guns: 6, crystal })).toBeCloseTo(0.36);
  });

  it('is null without a rate of fire', () => {
    expect(chargesUsedPerMinute({ rateOfFireMs: 0, guns: 6, crystal: null })).toBeNull();
  });
});
