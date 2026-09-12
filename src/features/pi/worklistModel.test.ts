import { describe, it, expect } from 'vitest';
import { buildWorklist, type WorklistColony } from './worklistModel';
import type { PinLoad } from '@/engine/pi/types';

const FREED: PinLoad = { cpu: 800, powergrid: 3_200 };

function colony(overrides: Partial<WorklistColony> = {}): WorklistColony {
  return {
    planetId: 1,
    name: 'Efa II',
    planetType: 'temperate',
    idle: null,
    opportunities: [],
    conversions: [],
    rebuild: null,
    throughput: null,
    ...overrides,
  };
}

describe('buildWorklist', () => {
  it('has nothing to say about a colony with nothing wrong and nothing to add', () => {
    expect(buildWorklist([colony()])).toEqual({ tuning: [], rebuilds: [] });
  });

  /**
   * The whole point of the ranking: a pilot with six colonies wants the two
   * things worth doing, not six cards to read. Order is by what the step is
   * worth, across planets, not by planet.
   */
  it('ranks steps by ISK an hour across every colony, not per planet', () => {
    const list = buildWorklist([
      colony({
        planetId: 1,
        name: 'Efa II',
        opportunities: [{ label: 'Biocells', marginPerHour: 71_200 }],
      }),
      colony({
        planetId: 2,
        name: 'Efa IV',
        opportunities: [{ label: 'Test Cultures', marginPerHour: 96_400 }],
      }),
    ]);
    expect(list.tuning.map((row) => [row.planetName, row.iskPerHour])).toEqual([
      ['Efa IV', 96_400],
      ['Efa II', 71_200],
    ]);
  });

  /**
   * A rebuild is not an increment on the colony that is standing — it is what
   * the planet would earn torn down and rebuilt. Mixing the two into one
   * ranked list is exactly the confusion the card layout had, so they come
   * back as two lists and the caller cannot accidentally sum them.
   */
  it('keeps rebuilds out of the tuning list', () => {
    const list = buildWorklist([
      colony({
        opportunities: [{ label: 'Biocells', marginPerHour: 71_200 }],
        rebuild: { label: 'Non-CS Crystals', tier: 0, marginPerHour: 388_000 },
      }),
    ]);
    expect(list.tuning).toHaveLength(1);
    expect(list.rebuilds).toHaveLength(1);
    expect(list.rebuilds[0]?.iskPerHour).toBe(388_000);
    expect(list.tuning.some((row) => row.verb === 'rebuild')).toBe(false);
  });

  /**
   * Removing idle facilities frees CPU and Powergrid rather than earning ISK,
   * so it has no figure to rank on. It is ranked by what the freed budget
   * buys — `idleFacilityPlan` has already sized that — and the two rows stay
   * adjacent, because "remove these" without "and put this in their place"
   * is half an instruction.
   */
  it('pairs a removal with the step its freed budget pays for, and ranks it there', () => {
    const list = buildWorklist([
      colony({
        planetId: 1,
        name: 'Efa II',
        idle: { pinCount: 4, freed: FREED, enables: { label: '8 extractor heads', marginPerHour: 96_400 } },
      }),
      colony({
        planetId: 2,
        name: 'Efa IV',
        opportunities: [{ label: 'Biocells', marginPerHour: 71_200 }],
      }),
    ]);
    expect(list.tuning.map((row) => [row.verb, row.planetName])).toEqual([
      ['remove', 'Efa II'],
      ['add', 'Efa II'],
      ['add', 'Efa IV'],
    ]);
    expect(list.tuning[0]?.freed).toEqual(FREED);
    expect(list.tuning[0]?.iskPerHour).toBeNull();
  });

  /**
   * A removal that buys nothing is still worth doing — the Powergrid is being
   * held for no reason — but it cannot out-rank a step that earns. It sorts
   * last among tuning steps rather than being dropped or treated as zero ISK.
   */
  it('keeps a removal that enables nothing, ranked below every earning step', () => {
    const list = buildWorklist([
      colony({ planetId: 1, name: 'Adacyne III', idle: { pinCount: 2, freed: FREED, enables: null } }),
      colony({
        planetId: 2,
        name: 'Efa IV',
        opportunities: [{ label: 'Biocells', marginPerHour: 71_200 }],
      }),
    ]);
    expect(list.tuning.map((row) => [row.verb, row.planetName])).toEqual([
      ['add', 'Efa IV'],
      ['remove', 'Adacyne III'],
    ]);
  });

  /**
   * A colony that fills its Launchpad before the pilot returns stops
   * extracting, so everything the rest of the page says it earns is being
   * thrown away. It leads the list whatever it is worth.
   */
  it('puts a colony that overflows before the haul at the top', () => {
    const list = buildWorklist([
      colony({
        planetId: 2,
        name: 'Efa IV',
        opportunities: [{ label: 'Biocells', marginPerHour: 900_000 }],
      }),
      colony({
        planetId: 1,
        name: 'Efa VI',
        throughput: { hoursToFull: 19, haulHours: 168, lostIskPerHour: 248_000 },
      }),
    ]);
    expect(list.tuning[0]?.verb).toBe('haul');
    expect(list.tuning[0]?.planetName).toBe('Efa VI');
  });

  it('says nothing about a colony whose buffer outlasts the haul window', () => {
    const list = buildWorklist([
      colony({ throughput: { hoursToFull: 204, haulHours: 168, lostIskPerHour: 0 } }),
    ]);
    expect(list.tuning).toEqual([]);
  });

  /**
   * An unmeasurable colony reports `hoursToFull: null` rather than a number.
   * That is "we cannot see", not "it is fine", and it must not silently
   * become a passing buffer check.
   */
  it('raises no overflow step for a colony whose fill rate cannot be measured', () => {
    const list = buildWorklist([
      colony({ throughput: { hoursToFull: null, haulHours: 168, lostIskPerHour: 0 } }),
    ]);
    expect(list.tuning).toEqual([]);
  });
});
