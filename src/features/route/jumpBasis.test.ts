import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadSolarSystemJumps = vi.fn();
const loadSolarSystems = vi.fn();

vi.mock('@/sde/loadMarketSde', () => ({
  loadSolarSystemJumps: () => loadSolarSystemJumps(),
  loadSolarSystems: () => loadSolarSystems(),
}));

import { clearJumpGraphIndex } from '@/sde/jumpGraph';
import { clearSolarSystemIndex } from '@/sde/solarSystems';
import { jumpsBetween } from './jumpBasis';

// HUB - A - B - C, and HUB - LOW - FAR - C: two three-jump ways round.
const HUB = 30000001;
const LOW = 30000002;
const FAR = 30000003;
const A = 30000004;
const B = 30000005;
const C = 30000006;

const JUMPS = {
  [HUB]: [LOW, A],
  [LOW]: [HUB, FAR],
  [FAR]: [LOW, C],
  [A]: [HUB, B],
  [B]: [A, C],
  [C]: [B, FAR],
};
const SYSTEMS = [HUB, LOW, FAR, A, B, C].map((id) => ({
  id,
  name: `S${id}`,
  security: 0.9,
  regionId: 10000001,
}));

const SHORTEST = { preference: 'shortest' as const, securityPenalty: 50, avoid: [] };

beforeEach(() => {
  clearJumpGraphIndex();
  clearSolarSystemIndex();
  loadSolarSystemJumps.mockReset();
  loadSolarSystems.mockReset();
  loadSolarSystemJumps.mockResolvedValue(JUMPS);
  loadSolarSystems.mockResolvedValue(SYSTEMS);
});

describe('jumpsBetween', () => {
  it('counts the stargate jumps under the basis', async () => {
    expect(await jumpsBetween(HUB, C, { rules: SHORTEST, network: {} })).toEqual({
      kind: 'known',
      jumps: 3,
    });
  });

  it('is 0 for the same system', async () => {
    expect(await jumpsBetween(HUB, HUB, { rules: SHORTEST, network: {} })).toEqual({
      kind: 'known',
      jumps: 0,
    });
  });

  it('weighs Avoided Systems as a cost, so a trip that must cross one still has a count', async () => {
    const rules = { ...SHORTEST, avoid: [A, LOW] };
    expect(await jumpsBetween(HUB, C, { rules, network: {} })).toEqual({
      kind: 'known',
      jumps: 3,
    });
  });

  it('counts a wormhole or bridge connection as one jump, as Route Safety does', async () => {
    const network = { extraConnections: [[HUB, C] as const] };
    expect(await jumpsBetween(HUB, C, { rules: SHORTEST, network })).toEqual({
      kind: 'known',
      jumps: 1,
    });
  });

  it('says noRoute when the stargate snapshot cannot be read', async () => {
    loadSolarSystemJumps.mockResolvedValue(null);
    expect(await jumpsBetween(HUB, C, { rules: SHORTEST, network: {} })).toEqual({
      kind: 'unknown',
      reason: 'noRoute',
    });
  });
});
