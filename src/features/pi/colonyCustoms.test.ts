import { describe, it, expect } from 'vitest';
import { ASSUMED_UNKNOWN_CUSTOMS, resolveColonyCustoms } from './colonyCustoms';

const base = { systemId: 1, security: -0.4, skill: 5, overrides: {} };

describe('resolveColonyCustoms', () => {
  it('uses the skill-derived NPC rate in highsec, not assumed', () => {
    const r = resolveColonyCustoms({ ...base, security: 0.9, skill: 5 });
    expect(r.taxRate).toBeCloseTo(0.05, 10);
    expect(r.taxAssumed).toBe(false);
  });

  it('assumes the shared rate outside highsec with no override, whatever the skill', () => {
    for (const security of [0.3, -0.4]) {
      const r = resolveColonyCustoms({ ...base, security });
      expect(r.taxRate).toBe(ASSUMED_UNKNOWN_CUSTOMS);
      expect(r.taxAssumed).toBe(true);
      expect(r.taxOverridden).toBe(false);
    }
  });

  it('uses the override, including a real 0, and drops the assumed flag', () => {
    const zero = resolveColonyCustoms({ ...base, overrides: { 1: 0 } });
    expect(zero.taxRate).toBe(0);
    expect(zero.taxAssumed).toBe(false);
    expect(zero.taxOverridden).toBe(true);
  });
});
