import { describe, expect, it } from 'vitest';
import { LAWLESS_CORRUPTION_STATE, parseLawlessSystemIds } from './lawlessSystems.js';

// Trimmed from a real response (2026-10-07): a list of campaigns, each with
// its insurgencies. Only `corruptionState` 5 is lawless; Aivonen and Akidagi
// are suppressed (suppressionState 5) with corruptionState 3.
const campaign = (insurgencies: unknown[]) => ({
  campaignId: 165,
  state: 'ACTIVE',
  insurgencies,
});
const insurgency = (id: number, corruptionState: number) => ({
  corruptionState,
  suppressionState: 0,
  solarSystem: { id, name: `System ${id}`, security: 0.3 },
});

describe('parseLawlessSystemIds', () => {
  it('keeps only corruption state 5', () => {
    const body = [
      campaign([
        insurgency(30045339, LAWLESS_CORRUPTION_STATE),
        insurgency(30045340, 3),
        insurgency(30045341, LAWLESS_CORRUPTION_STATE),
        insurgency(30045342, 0),
      ]),
    ];
    expect(parseLawlessSystemIds(body)).toEqual([30045339, 30045341]);
  });

  it('collects across campaigns, once per system, sorted', () => {
    const body = [
      campaign([insurgency(30000003, 5)]),
      campaign([insurgency(30000001, 5), insurgency(30000003, 5)]),
    ];
    expect(parseLawlessSystemIds(body)).toEqual([30000001, 30000003]);
  });

  it('skips insurgencies with no usable system id', () => {
    const body = [
      campaign([
        { corruptionState: 5 },
        { corruptionState: 5, solarSystem: { id: 'x' } },
        { corruptionState: 5, solarSystem: null },
        insurgency(30000001, 5),
      ]),
    ];
    expect(parseLawlessSystemIds(body)).toEqual([30000001]);
  });

  it.each([
    ['null', null],
    ['an object', { insurgencies: [] }],
    ['a string', 'nope'],
    ['campaigns without insurgencies', [{ campaignId: 1 }, null, 7]],
    ['insurgencies that is not a list', [{ insurgencies: 'x' }]],
  ])('returns an empty list for %s without throwing', (_label, body) => {
    expect(parseLawlessSystemIds(body)).toEqual([]);
  });
});
