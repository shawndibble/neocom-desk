import { describe, expect, it } from 'vitest';
import {
  ANSIBLEX_MAX_JUMP_MASS_KG,
  bridgeMassVerdict,
  holeMassEstimate,
  holeMassVerdict,
  routeMassCheck,
  type HoleMassTable,
} from './jumpMass';

const MT = 1_000_000;
const table: HoleMassTable = { M267: [375 * MT, 1000 * MT], Q063: [62 * MT, 500 * MT] };

describe('holeMassVerdict', () => {
  it('gives no cue to a ship under the per-jump limit', () => {
    expect(holeMassVerdict('M267', 98 * MT, table)).toEqual({ kind: 'ok' });
  });

  it('is exact about a ship over the per-jump limit', () => {
    expect(holeMassVerdict('Q063', 98 * MT, table)).toEqual({
      kind: 'too-heavy',
      limitKg: 62 * MT,
      shipKg: 98 * MT,
    });
  });

  it('lets a ship exactly at the limit through', () => {
    expect(holeMassVerdict('Q063', 62 * MT, table)).toEqual({ kind: 'ok' });
  });

  it('never guesses at an unknown, missing or K162 type', () => {
    expect(holeMassVerdict('Z999', 900 * MT, table)).toEqual({ kind: 'ok' });
    expect(holeMassVerdict(null, 900 * MT, table)).toEqual({ kind: 'ok' });
    expect(holeMassVerdict('K162', 900 * MT, table)).toEqual({ kind: 'ok' });
  });
});

describe('holeMassEstimate', () => {
  it('is how many jumps a fresh hole of that type passes at most, rounded down', () => {
    expect(holeMassEstimate('M267', 98 * MT, table)).toEqual({ maxJumps: 10 });
  });

  it('is null for a ship that cannot pass at all, or an unknown type', () => {
    expect(holeMassEstimate('Q063', 98 * MT, table)).toBeNull();
    expect(holeMassEstimate('Z999', 98 * MT, table)).toBeNull();
  });
});

describe('bridgeMassVerdict', () => {
  it('blocks only a ship over the Ansiblex limit', () => {
    expect(bridgeMassVerdict(ANSIBLEX_MAX_JUMP_MASS_KG)).toEqual({ kind: 'ok' });
    expect(bridgeMassVerdict(1_500 * MT)).toEqual({
      kind: 'too-heavy',
      limitKg: ANSIBLEX_MAX_JUMP_MASS_KG,
      shipKg: 1_500 * MT,
    });
  });
});

describe('routeMassCheck', () => {
  const hole = (wormholeType: string | null) => ({ kind: 'hole', hole: { wormholeType } }) as never;
  const bridge = { kind: 'bridge', gate: {} } as never;

  it('counts blocked hops and hops a hole may run out on', () => {
    const rows = [
      { entry: null },
      { entry: { kind: 'gate' } },
      { entry: hole('Q063') },
      { entry: hole('M267') },
      { entry: bridge },
    ] as never;
    expect(routeMassCheck(rows, 98 * MT, table)).toEqual({ blocked: 1, bridgeBlocked: 0 });
    expect(routeMassCheck(rows, 1_600 * MT, table)).toEqual({ blocked: 2, bridgeBlocked: 1 });
  });

  it('has nothing to say without a ship', () => {
    expect(routeMassCheck([{ entry: hole('Q063') }] as never, null, table)).toEqual({
      blocked: 0,
      bridgeBlocked: 0,
    });
  });
});
