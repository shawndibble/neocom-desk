import { describe, expect, it } from 'vitest';
import type { IncursionRow } from '@/engine/incursions/incursionRows';
import {
  incursionJumpsWhen,
  incursionsSeverity,
  incursionsSummary,
  type IncursionsBoardData,
} from './incursionsBoard';

/** Echoes the key and its interpolations, as `boardSummary.test.ts` does. */
function t(key: string, options?: Record<string, unknown>): string {
  if (options === undefined) return key;
  const args = Object.entries(options)
    .map(([name, value]) => `${name}=${String(value)}`)
    .join(',');
  return `${key}(${args})`;
}

const row = (stagingSystemId: number, jumps: number | null): IncursionRow => ({
  constellationId: stagingSystemId + 1,
  stagingSystemId,
  state: 'established',
  influence: 0.4,
  hasBoss: false,
  systemCount: 5,
  jumps,
});

const data = (overrides: Partial<IncursionsBoardData>): IncursionsBoardData => ({
  status: 'ready',
  rows: [],
  jumpsStatus: 'ready',
  systemNames: new Map([[30002813, 'Tama']]),
  constellationNames: new Map(),
  ...overrides,
});

describe('incursionJumpsWhen', () => {
  it('prints a counted distance as jumps', () => {
    expect(incursionJumpsWhen(t, row(1, 4), 'ready')).toBe(
      'overview.board.incursionsJumps(count=4)'
    );
    expect(incursionJumpsWhen(t, row(1, 0), 'ready')).toBe(
      'overview.board.incursionsJumps(count=0)'
    );
  });

  it('says there is no route rather than a zero when the counted graph cannot reach it', () => {
    expect(incursionJumpsWhen(t, row(1, null), 'ready')).toBe('overview.board.incursionsNoRoute');
  });

  it('prints no figure at all while there is nothing to count from', () => {
    expect(incursionJumpsWhen(t, row(1, null), 'no-origin')).toBe('—');
    expect(incursionJumpsWhen(t, row(1, null), 'unknown')).toBe('—');
    expect(incursionJumpsWhen(t, row(1, null), 'loading')).toBe('—');
  });
});

describe('incursionsSummary', () => {
  it('names the nearest one and its distance', () => {
    expect(incursionsSummary(t, data({ rows: [row(30002813, 3), row(2, 9)] }))).toBe(
      'overview.board.incursionsNearest(count=2,system=Tama,jumps=overview.board.incursionsJumps(count=3))'
    );
  });

  it('says why there is no distance without a current system', () => {
    expect(
      incursionsSummary(t, data({ rows: [row(30002813, null)], jumpsStatus: 'no-origin' }))
    ).toBe('overview.board.incursionsNoOrigin(count=1)');
  });

  it('only counts them when the distance could not be counted', () => {
    expect(
      incursionsSummary(t, data({ rows: [row(30002813, null)], jumpsStatus: 'unknown' }))
    ).toBe('overview.board.incursionsActive(count=1)');
  });

  it('tells an empty feed from an unread one', () => {
    expect(incursionsSummary(t, data({ rows: [] }))).toBe('overview.board.incursionsNone');
    expect(incursionsSummary(t, data({ status: 'failed' }))).toBe(
      'overview.board.incursionsFailed'
    );
    expect(incursionsSummary(t, data({ status: 'loading' }))).toBe('overview.board.checking');
    expect(incursionsSummary(t, null)).toBe('overview.board.checking');
  });
});

describe('incursionsSeverity', () => {
  /* Conditions, never verdicts: an Incursion nearby is nothing the pilot must act on. */
  it('is clear once read, and unknown while reading or unread', () => {
    expect(incursionsSeverity(data({ rows: [row(1, 1)] }))).toBe('clear');
    // A feed that could not be read must not be the most reassuring line on the board.
    expect(incursionsSeverity(data({ status: 'failed' }))).toBeNull();
    expect(incursionsSeverity(data({ status: 'loading' }))).toBeNull();
    expect(incursionsSeverity(null)).toBeNull();
  });
});
