import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { extractionUpgrade, MAX_HEADS_PER_UNIT } from './extractionUpgrade';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const infrastructure = pi.infrastructure;

/**
 * Efa II as reported: eight Basic Industry Facilities wanting 48,000 P0/hr
 * against 21,201 extracted over ten heads, on a Command Center level 5 budget
 * with 17,855 tf and 2,845 MW free.
 */
const EFA_II = {
  shortfallPerHour: 48_000 - 21_201,
  perHeadPerHour: 21_201 / 10,
  spare: { cpu: 17_855, powergrid: 2_845 },
  newLinkCost: { cpu: 31, powergrid: 22 },
  infrastructure,
  freedByRemoval: { cpu: 4 * 200, powergrid: 4 * 800 },
};

describe('extractionUpgrade', () => {
  it('will not fit an extractor into a colony that is out of Powergrid', () => {
    // The reported colony. A control unit alone is 2,600 MW of the 2,845 free,
    // leaving 245 for a head that costs 550 — so "add extraction" is not
    // available here today, however much CPU is going spare.
    const upgrade = extractionUpgrade(EFA_II);
    expect(upgrade.status).toBe('needs-removal');
  });

  it('says how much extraction the idle factories would need', () => {
    // 26,799/hr short over 2,120.1/hr a head: thirteen heads, and a control
    // unit drives ten, so two units. The pilot asked what it would take.
    const upgrade = extractionUpgrade(EFA_II);
    expect(upgrade.headsWanted).toBe(13);
  });

  it('sizes what would fit once the idle factories come out', () => {
    // Removal frees 3,200 MW on top of 2,845. One unit and its link is 2,622,
    // leaving 3,423 for heads at 550 — six of them, and 6 x 2,120.1/hr is the
    // extraction that buys.
    const upgrade = extractionUpgrade(EFA_II);
    expect(upgrade.units).toBe(1);
    expect(upgrade.heads).toBe(6);
    expect(upgrade.extraPerHour).toBeCloseTo(6 * 2_120.1, 4);
    expect(upgrade.load.powergrid).toBeLessThanOrEqual(2_845 + 3_200);
  });

  it('recommends extraction outright when it fits without touching anything', () => {
    const roomy = { ...EFA_II, spare: { cpu: 40_000, powergrid: 40_000 } };
    const upgrade = extractionUpgrade(roomy);
    expect(upgrade.status).toBe('fits');
    // Thirteen heads wanted and the budget holds them: two control units.
    expect(upgrade.heads).toBe(13);
    expect(upgrade.units).toBe(2);
  });

  it('never drives more heads off one control unit than CCP allows', () => {
    const roomy = {
      ...EFA_II,
      shortfallPerHour: 1_000_000,
      spare: { cpu: 1_000_000, powergrid: 1_000_000 },
    };
    const upgrade = extractionUpgrade(roomy);
    expect(upgrade.units).toBe(Math.ceil(upgrade.heads / MAX_HEADS_PER_UNIT));
  });

  it('reports no room rather than a zero-head plan when even removal is not enough', () => {
    // A caller that rendered `heads: 0` would print "add 0 extractor heads".
    const cramped = {
      ...EFA_II,
      spare: { cpu: 100, powergrid: 100 },
      freedByRemoval: { cpu: 0, powergrid: 0 },
    };
    const upgrade = extractionUpgrade(cramped);
    expect(upgrade.status).toBe('no-room');
    expect(upgrade.heads).toBe(0);
  });

  it('refuses to rate a head it has never measured', () => {
    // No published richness figure exists to guess one from — `chain.ts`'s
    // rule, and the reason an unbuilt planet carries no ISK estimate either.
    expect(extractionUpgrade({ ...EFA_II, perHeadPerHour: null }).status).toBe('unmeasurable');
    expect(extractionUpgrade({ ...EFA_II, perHeadPerHour: 0 }).status).toBe('unmeasurable');
  });

  it('has nothing to add to a colony whose factories are all fed', () => {
    expect(extractionUpgrade({ ...EFA_II, shortfallPerHour: 0 }).status).toBe('unmeasurable');
  });

  it('charges the control unit for the link it needs to reach the factories', () => {
    const budget = { cpu: 800, powergrid: 3_200 };
    const free = extractionUpgrade({ ...EFA_II, newLinkCost: null, spare: budget });
    const linked = extractionUpgrade({ ...EFA_II, spare: budget });
    // Same plan either way at this budget — one control unit, one head — and
    // the charged link is the whole difference in what it draws.
    expect(free.heads).toBe(linked.heads);
    expect(free.units).toBe(linked.units);
    expect(linked.load.powergrid - free.load.powergrid).toBeCloseTo(22, 6);
    expect(linked.load.cpu - free.load.cpu).toBeCloseTo(31, 6);
  });
});
