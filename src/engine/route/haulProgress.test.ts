import { describe, expect, it } from 'vitest';
import type { HaulLeg, HaulPlace, HaulPlan, HaulSection } from './haulPlan';
import {
  currentLeg,
  legAtSystem,
  remainingLegs,
  remainingTotals,
  replanInputs,
  sectionStart,
  tickLeg,
  untickLeg,
} from './haulProgress';

const place = (systemId: number, name: string, stationId: number | null = null): HaulPlace => ({
  systemId,
  stationId,
  name,
});
const jita = place(1, 'Jita', 10);
const amarr = place(2, 'Amarr', 20);
const dodixie = place(3, 'Dodixie', 30);

const leg = (
  id: number,
  kind: HaulLeg['kind'],
  from: HaulPlace | null,
  to: HaulPlace,
  extra: Partial<HaulLeg> = {}
): HaulLeg => ({
  id,
  characterId: 1,
  trip: 1,
  kind,
  from,
  to,
  jumps: 5,
  m3: 100,
  locationId: kind === 'pickup' ? to.systemId : null,
  ...extra,
});

/** Jita → Amarr (pickup) → Dodixie (pickup) → Jita (delivery). */
const section: HaulSection = {
  characterId: 1,
  name: 'Alice',
  trips: 1,
  legs: [
    leg(0, 'pickup', jita, amarr),
    leg(1, 'pickup', amarr, dodixie),
    leg(2, 'delivery', dodixie, jita, { m3: 200 }),
  ],
};
const plan: HaulPlan = {
  sections: [section],
  leftOut: [],
  flown: [],
  totals: { legs: 3, jumps: 15, m3: 400 },
};

describe('tickLeg', () => {
  it('marks the leg and every earlier leg of its section done', () => {
    expect(tickLeg(plan, [], 1)).toEqual([0, 1]);
  });

  it('keeps progress already made and sorts it', () => {
    expect(tickLeg(plan, [0], 2)).toEqual([0, 1, 2]);
  });

  it('ignores a leg id the plan does not have', () => {
    expect(tickLeg(plan, [0], 99)).toEqual([0]);
  });

  it('leaves other sections alone', () => {
    const bob: HaulSection = {
      characterId: 2,
      name: 'Bob',
      trips: 1,
      legs: [leg(3, 'pickup', jita, amarr, { characterId: 2 })],
    };
    const both = { ...plan, sections: [section, bob] };
    expect(tickLeg(both, [], 3)).toEqual([3]);
    expect(tickLeg(both, [], 0)).toEqual([0]);
  });

  it('ticks a repeat visit to one station separately', () => {
    const repeat: HaulSection = {
      ...section,
      legs: [
        leg(0, 'pickup', jita, amarr),
        leg(1, 'delivery', amarr, jita),
        leg(2, 'pickup', jita, amarr, { trip: 2 }),
      ],
    };
    const p = { ...plan, sections: [repeat] };
    expect(tickLeg(p, [], 0)).toEqual([0]);
    expect(remainingLegs(repeat, [0]).map((l) => l.id)).toEqual([1, 2]);
  });

  it('does not drop the later delivery when a pickup is ticked', () => {
    const left = remainingLegs(section, tickLeg(plan, [], 0));
    expect(left.map((l) => l.kind)).toEqual(['pickup', 'delivery']);
  });
});

describe('untickLeg', () => {
  it('marks the leg and every later leg of its section not done', () => {
    expect(untickLeg(plan, [0, 1, 2], 1)).toEqual([0]);
  });

  it('is the undo of a tick', () => {
    const before = [0];
    expect(untickLeg(plan, tickLeg(plan, before, 2), 1)).toEqual(before);
  });
});

describe('remaining route', () => {
  it('shows only what is left, in the planned order', () => {
    expect(remainingLegs(section, [0]).map((l) => l.id)).toEqual([1, 2]);
  });

  it('names the first leg not done as the current one', () => {
    expect(currentLeg(section, [])?.id).toBe(0);
    expect(currentLeg(section, [0, 1])?.id).toBe(2);
    expect(currentLeg(section, [0, 1, 2])).toBeNull();
  });

  it('starts where the last done leg ended', () => {
    expect(sectionStart(section, [])).toEqual(jita);
    expect(sectionStart(section, [0])).toEqual(amarr);
    expect(sectionStart(section, [0, 1, 2])).toEqual(jita);
  });

  it('adds up legs, jumps and m³ left', () => {
    expect(remainingTotals(plan, [0])).toEqual({ legs: 2, jumps: 10, m3: 100 });
  });

  it('counts a leg with no gate route as zero jumps', () => {
    const noRoute = {
      ...plan,
      sections: [{ ...section, legs: [leg(0, 'pickup', jita, amarr, { jumps: null })] }],
    };
    expect(remainingTotals(noRoute, [])).toEqual({ legs: 1, jumps: 0, m3: 100 });
  });
});

describe('legAtSystem', () => {
  it('finds the current leg that ends in the given system', () => {
    expect(legAtSystem(plan, [], 2)?.id).toBe(0);
  });

  it('is null when the pilot is not at the current leg’s system', () => {
    expect(legAtSystem(plan, [], 3)).toBeNull();
    expect(legAtSystem(plan, [], null)).toBeNull();
  });

  it('is null for a leg already done', () => {
    expect(legAtSystem(plan, [0], 2)).toBeNull();
  });
});

describe('replanInputs', () => {
  it('starts each Character where their last done leg ended, with the pickups left', () => {
    const { characters, loaded } = replanInputs(plan, [0, 1, 2]);
    expect(characters).toEqual([]);
    expect(loaded).toEqual([]);
    const again = replanInputs({ ...plan, sections: [{ ...section, legs: section.legs }] }, []);
    expect(again.characters[0]?.start).toEqual(jita);
    expect(again.characters[0]?.pickups.map((p) => p.locationId)).toEqual([2, 3]);
  });

  it('merges a pickup split across trips into one stock', () => {
    const split: HaulSection = {
      ...section,
      legs: [
        leg(0, 'pickup', jita, amarr, { m3: 60 }),
        leg(1, 'delivery', amarr, jita, { m3: 60 }),
        leg(2, 'pickup', jita, amarr, { trip: 2, m3: 40 }),
        leg(3, 'delivery', amarr, jita, { trip: 2, m3: 40 }),
      ],
    };
    const { characters } = replanInputs({ ...plan, sections: [split] }, [0, 1]);
    expect(characters[0]?.start).toEqual(jita);
    expect(characters[0]?.pickups).toEqual([
      expect.objectContaining({ locationId: 2, m3: 40, systemId: 2 }),
    ]);
  });

  it('merges the stacks of a split pickup, by type', () => {
    const trit = { typeId: 34, name: 'Tritanium', unitM3: 1 };
    const split: HaulSection = {
      ...section,
      legs: [
        leg(0, 'pickup', jita, amarr, { m3: 60, stacks: [{ ...trit, quantity: 60 }] }),
        leg(1, 'delivery', amarr, jita, { m3: 60 }),
        leg(2, 'pickup', jita, amarr, { trip: 2, m3: 40, stacks: [{ ...trit, quantity: 40 }] }),
        leg(3, 'delivery', amarr, jita, { trip: 2, m3: 40 }),
      ],
    };
    const { characters } = replanInputs({ ...plan, sections: [split] }, []);
    expect(characters[0]?.pickups[0]?.stacks).toEqual([{ ...trit, quantity: 100 }]);
  });

  it('reports a Character whose hold is loaded and not yet delivered', () => {
    const { characters, loaded } = replanInputs(plan, [0]);
    expect(loaded).toEqual(['Alice']);
    expect(characters).toEqual([]);
  });

  it('carries the flown ships of a Character still on the route', () => {
    const flown = [{ characterId: 1, name: 'Alice', ships: ['Rifter'] }];
    const { characters } = replanInputs({ ...plan, flown }, []);
    expect(characters[0]?.flown).toEqual(['Rifter']);
  });

  it('hands the flights still to fly back as ships at their pickups', () => {
    const flights: HaulSection = {
      characterId: 1,
      name: 'Alice',
      trips: 2,
      legs: [
        leg(0, 'pickup', jita, amarr, { m3: 0, ships: ['Rifter'] }),
        leg(1, 'delivery', amarr, jita, { m3: 0, ships: ['Rifter'] }),
        leg(2, 'pickup', jita, amarr, { trip: 2, m3: 0, ships: ['Merlin'] }),
        leg(3, 'delivery', amarr, jita, { trip: 2, m3: 0, ships: ['Merlin'] }),
      ],
    };
    const { characters } = replanInputs({ ...plan, sections: [flights] }, [0, 1]);
    expect(characters[0]?.pickups.map((p) => [p.name, p.m3, p.ships])).toEqual([
      ['Amarr', 0, ['Merlin']],
    ]);
  });
});
