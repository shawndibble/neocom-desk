import { describe, it, expect } from 'vitest';
import { idleStepFor } from './worklistAdapter';
import type { IdleFacilityPlan } from './colonyActionModel';
import type { FactoryBalance } from '@/engine/pi/factoryBalance';

const FREED = { cpu: 800, powergrid: 3_200 };
const names = new Map([[2073, 'Microorganisms']]);

function plan(overrides: Partial<IdleFacilityPlan> = {}): IdleFacilityPlan {
  return {
    lines: [
      {
        line: { status: 'measured', surplusPins: 4 } as unknown as Extract<
          FactoryBalance,
          { status: 'measured' }
        >,
        gap: { typeId: 2073, name: 'Microorganisms', unitsPerHour: 1, demand: 2, supply: 1 },
        freed: FREED,
      },
    ],
    upgrade: {
      status: 'needs-removal',
      heads: 8,
      units: 1,
      headsWanted: 10,
      extraPerHour: 13_100,
      load: FREED,
    },
    wouldFeed: 3,
    freeAfterRemoval: FREED,
    ...overrides,
  };
}

describe('idleStepFor', () => {
  it('pairs the removal with the extraction it pays for', () => {
    const idle = idleStepFor(plan(), names);
    expect(idle?.enables).toEqual({
      heads: 8,
      unitsPerHour: 13_100,
      resource: 'Microorganisms',
      wouldFeed: 3,
    });
  });

  /**
   * "Add 1 extractor head — feeds 0 facilities" is not an instruction; it is
   * the absence of one, dressed as a step and ranked above steps that earn.
   * The removal still stands on its own — it just has nothing to pair with.
   */
  it('offers no extraction step when the heads that fit would feed nothing', () => {
    const idle = idleStepFor(plan({ wouldFeed: 0 }), names);
    expect(idle).not.toBeNull();
    expect(idle?.pinCount).toBe(4);
    expect(idle?.enables).toBeNull();
  });
});
