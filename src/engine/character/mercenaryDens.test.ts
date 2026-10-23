import { describe, expect, it } from 'vitest';
import {
  denHeadline,
  denSeverity,
  denState,
  denStateAt,
  levelNumber,
  openOperations,
  operationState,
  sortDens,
  type Den,
} from './mercenaryDens';

const NOW = Date.parse('2026-10-22T10:00:00Z');
const HOUR = 3_600_000;

const den = (over: Partial<Den> = {}): Den => ({
  id: 1,
  state: 'running',
  reinforcedUntilMs: null,
  anarchyLevel: 0,
  operations: [],
  ...over,
});

describe('denState', () => {
  it('reads Paused with a timer as reinforced, without one as paused', () => {
    expect(denState('Paused', true)).toBe('reinforced');
    expect(denState('Paused', false)).toBe('paused');
  });

  it('maps the rest, and Unspecified to unknown', () => {
    expect(denState('Running', false)).toBe('running');
    expect(denState('Disabled', false)).toBe('disabled');
    expect(denState('Unspecified', false)).toBe('unknown');
  });
});

describe('operationState', () => {
  it('reads Available and Started as open, the rest as done', () => {
    expect(operationState('Available')).toBe('available');
    expect(operationState('Started')).toBe('started');
    expect(operationState('Expired')).toBe('done');
    expect(operationState('Unspecified')).toBe('done');
  });
});

describe('a reinforcement timer already past', () => {
  const lapsed = den({ state: 'reinforced', reinforcedUntilMs: NOW - HOUR });

  it('reads as paused, a warning, not critical', () => {
    expect(denStateAt(lapsed, NOW)).toBe('paused');
    expect(denSeverity(lapsed, NOW)).toBe('warning');
  });

  it('is not counted as reinforced in the headline', () => {
    expect(denHeadline([lapsed], NOW)).toEqual({ kind: 'dens', count: 1 });
  });
});

describe('levelNumber', () => {
  it('reads Level0..Level4 and leaves Unspecified unknown', () => {
    expect(levelNumber('Level0')).toBe(0);
    expect(levelNumber('Level4')).toBe(4);
    expect(levelNumber('Unspecified')).toBeNull();
  });
});

describe('openOperations', () => {
  it('keeps available and started operations that have not expired, soonest first', () => {
    const ops = openOperations(
      [
        { state: 'available', expiresMs: NOW + 9 * HOUR },
        { state: 'started', expiresMs: NOW + 2 * HOUR },
        { state: 'available', expiresMs: NOW - HOUR },
        { state: 'done', expiresMs: NOW + HOUR },
      ],
      NOW
    );
    expect(ops.map((op) => op.expiresMs)).toEqual([NOW + 2 * HOUR, NOW + 9 * HOUR]);
  });
});

describe('denSeverity', () => {
  it('is critical while reinforced', () => {
    expect(denSeverity(den({ state: 'reinforced', reinforcedUntilMs: NOW + HOUR }), NOW)).toBe(
      'critical'
    );
  });

  it('warns at Anarchy 2 or more, when disabled or paused, and for an operation expiring within a day', () => {
    expect(denSeverity(den({ anarchyLevel: 2 }), NOW)).toBe('warning');
    expect(denSeverity(den({ state: 'disabled' }), NOW)).toBe('warning');
    expect(denSeverity(den({ state: 'paused' }), NOW)).toBe('warning');
    expect(
      denSeverity(den({ operations: [{ state: 'available', expiresMs: NOW + 9 * HOUR }] }), NOW)
    ).toBe('warning');
  });

  it('is clear for a running den with nothing pressing', () => {
    expect(
      denSeverity(
        den({ anarchyLevel: 1, operations: [{ state: 'available', expiresMs: NOW + 30 * HOUR }] }),
        NOW
      )
    ).toBe('clear');
  });

  it('treats an unknown state or Anarchy as watch, never clear', () => {
    expect(denSeverity(den({ state: 'unknown' }), NOW)).toBe('watch');
    expect(denSeverity(den({ anarchyLevel: null }), NOW)).toBe('watch');
  });
});

describe('sortDens', () => {
  it('puts the worst first, then the soonest clock', () => {
    const a = den({ id: 1 });
    const b = den({ id: 2, state: 'reinforced', reinforcedUntilMs: NOW + 5 * HOUR });
    const c = den({ id: 3, state: 'reinforced', reinforcedUntilMs: NOW + 2 * HOUR });
    const d = den({ id: 4, operations: [{ state: 'available', expiresMs: NOW + 3 * HOUR }] });
    expect(sortDens([a, b, c, d], NOW).map((x) => x.id)).toEqual([3, 2, 4, 1]);
  });
});

describe('denHeadline', () => {
  it('leads with reinforced dens and names the soonest out', () => {
    const headline = denHeadline(
      [
        den({ id: 1, state: 'reinforced', reinforcedUntilMs: NOW + 14 * HOUR }),
        den({ id: 2, state: 'reinforced', reinforcedUntilMs: NOW + 3 * HOUR }),
        den({ id: 3, operations: [{ state: 'available', expiresMs: NOW + HOUR }] }),
      ],
      NOW
    );
    expect(headline).toEqual({ kind: 'reinforced', count: 2, nextId: 2, remainingMs: 3 * HOUR });
  });

  it('falls back to ready operations, then to the den count', () => {
    expect(
      denHeadline(
        [
          den({ id: 1, operations: [{ state: 'available', expiresMs: NOW + 9 * HOUR }] }),
          den({ id: 2, operations: [{ state: 'available', expiresMs: NOW + 2 * HOUR }] }),
        ],
        NOW
      )
    ).toEqual({ kind: 'operations', count: 2, nextId: 2, remainingMs: 2 * HOUR });
    expect(denHeadline([den(), den({ id: 2 })], NOW)).toEqual({ kind: 'dens', count: 2 });
  });

  it('counts started operations as open but only available ones as ready', () => {
    expect(
      denHeadline([den({ operations: [{ state: 'started', expiresMs: NOW + HOUR }] })], NOW)
    ).toEqual({ kind: 'dens', count: 1 });
  });
});
