import { describe, it, expect } from 'vitest';
import { cloneVerdict } from './cloneVerdict';
import type { CloneTrainingInput } from './cloneTrainingTime';

const now = new Date('2026-10-08T12:00:00Z');
const base = { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 };

const input = (over: Partial<CloneTrainingInput> = {}): CloneTrainingInput => ({
  queue: [
    { skillTypeID: 1, remainingSp: 6000, primary: 'intelligence', secondary: 'memory' },
    { skillTypeID: 2, remainingSp: 3000, primary: 'intelligence', secondary: 'perception' },
  ],
  baseAttributes: base,
  clones: [
    { id: 'worn', implants: {} },
    { id: 'int5', implants: { intelligence: 5 } },
    { id: 'cha5', implants: { charisma: 5 } },
  ],
  wornCloneId: 'worn',
  now,
  ...over,
});

const sumSeconds = (segments: { seconds: number }[]) => segments.reduce((a, s) => a + s.seconds, 0);

describe('cloneVerdict', () => {
  it('says nothing for an empty queue', () => {
    expect(cloneVerdict(input({ queue: [] })).verdict).toEqual({ kind: 'none', reason: 'empty' });
  });

  it('says nothing for a paused queue', () => {
    expect(cloneVerdict(input({ paused: true })).verdict).toEqual({
      kind: 'none',
      reason: 'paused',
    });
  });

  it('is worth a jump to the clone that finishes the queue sooner', () => {
    const { verdict, bestCloneId, rows } = cloneVerdict(input());
    if (verdict.kind !== 'jump') throw new Error('expected jump');
    expect(verdict.cloneId).toBe('int5');
    expect(bestCloneId).toBe('int5');
    expect(verdict.savedSeconds).toBeGreaterThan(0);
    expect(verdict.attributes).toEqual(['intelligence']);
    expect(verdict.stay).toHaveLength(2);
    expect(sumSeconds(verdict.best)).toBeCloseTo(sumSeconds(verdict.stay) - verdict.savedSeconds);
    expect(rows.find((r) => r.cloneId === 'int5')!.deltaSeconds).toBeCloseTo(-verdict.savedSeconds);
    expect(rows.find((r) => r.cloneId === 'worn')!.deltaSeconds).toBe(0);
  });

  it('stays put when the worn clone is fastest, naming the closest alternative', () => {
    const { verdict, bestCloneId } = cloneVerdict(
      input({
        clones: [
          { id: 'worn', implants: { intelligence: 5 } },
          { id: 'none', implants: {} },
          { id: 'cha5', implants: { charisma: 5 } },
        ],
      })
    );
    if (verdict.kind !== 'stay') throw new Error('expected stay');
    expect(bestCloneId).toBe('worn');
    expect(verdict.closest?.cloneId).toBe('none');
    expect(verdict.closest!.extraSeconds).toBeGreaterThan(0);
  });

  it('treats a saving under a minute as staying put', () => {
    const r = cloneVerdict(
      input({
        queue: [{ skillTypeID: 1, remainingSp: 10, primary: 'intelligence', secondary: 'memory' }],
      })
    );
    expect(r.verdict.kind).toBe('stay');
    expect(r.bestCloneId).toBe('worn');
  });

  it('compares against jump-when-allowed under a cooldown', () => {
    const readyAt = new Date(now.getTime() + 60 * 60 * 1000);
    const free = cloneVerdict(input());
    const locked = cloneVerdict(input({ cooldownReadyAt: readyAt }));
    if (free.verdict.kind !== 'jump' || locked.verdict.kind !== 'jump') throw new Error('jump');
    expect(locked.verdict.cooldownReadyAt).toEqual(readyAt);
    expect(locked.verdict.savedSeconds).toBeLessThan(free.verdict.savedSeconds);
    expect(locked.verdict.savedSeconds).toBeGreaterThan(0);
  });

  it('stays put when the cooldown outlasts the queue', () => {
    const readyAt = new Date(now.getTime() + 365 * 24 * 3600 * 1000);
    expect(cloneVerdict(input({ cooldownReadyAt: readyAt })).verdict.kind).toBe('stay');
  });
});
