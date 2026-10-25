import { describe, expect, it } from 'vitest';
import { jobFee } from './jobCost';
import { moveSaving } from './moveSaving';
import { FACILITY_PRESETS } from './types';

describe('moveSaving', () => {
  it('keeps the facility terms when the plan stays on the same kind of facility', () => {
    const current = jobFee(1_000_000, 0.05, FACILITY_PRESETS.npcStation);
    expect(moveSaving(current, 0.05, 0.03, false)).toBeCloseTo(20_000);
  });

  it('prices the move to an NPC station at its 0.25% tax and no structure bonus', () => {
    const current = jobFee(1_000_000, 0.05, FACILITY_PRESETS.raitaru, 0.5);
    const npc = jobFee(1_000_000, 0.03, FACILITY_PRESETS.npcStation);
    expect(moveSaving(current, 0.05, 0.03, true)).toBeCloseTo(current.total - npc.total);
  });

  it('goes negative when leaving a cheap structure costs more than the index saves', () => {
    const current = jobFee(1_000_000, 0.05, FACILITY_PRESETS.sotiyo, 0);
    expect(moveSaving(current, 0.05, 0.048, true)).toBeLessThan(0);
  });
});
