import { describe, expect, it } from 'vitest';
import type { SkillQueueEntry } from '@/esi/endpoints';
import type { CloneVerdictResult } from '@/engine/clone/cloneVerdict';
import { cloneVerdictGate, runCloneVerdict } from './cloneVerdictGate';
import type { CloneTrainingData } from './cloneTraining';

const queueEntry = (patch: Partial<SkillQueueEntry> = {}): SkillQueueEntry => ({
  skill_id: 3300,
  finished_level: 5,
  queue_position: 0,
  start_date: '2026-10-11T10:00:00Z',
  finish_date: '2026-10-12T10:00:00Z',
  ...patch,
});

const training = (patch: Partial<CloneTrainingData> = {}): CloneTrainingData => ({
  queue: [{ skillTypeID: 3300, remainingSp: 1000, primary: 'intelligence', secondary: 'memory' }],
  paused: false,
  baseAttributes: { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 20 },
  clones: [{ id: 'worn', implants: {} }],
  skillNames: new Map(),
  ...patch,
});

const verdict = (kind: 'stay' | 'jump' | 'none'): CloneVerdictResult =>
  ({
    verdict: kind === 'none' ? { kind, reason: 'empty' } : { kind },
    rows: [],
    bestCloneId: null,
  }) as unknown as CloneVerdictResult;

const ready = { wornImplantsRead: true, queue: [queueEntry()], training: training() };

describe('cloneVerdictGate', () => {
  it('says the implants could not be read before anything else', () => {
    expect(cloneVerdictGate({ ...ready, wornImplantsRead: false, queue: null }, null)).toEqual({
      kind: 'note',
      note: 'implants',
    });
  });

  it('says the queue could not be read', () => {
    expect(cloneVerdictGate({ ...ready, queue: null }, null)).toEqual({
      kind: 'note',
      note: 'queue',
    });
  });

  it('lets a paused queue outrank an unreadable attribute sheet', () => {
    const paused = [queueEntry({ finish_date: undefined, start_date: undefined })];
    expect(cloneVerdictGate({ ...ready, queue: paused, training: null }, null)).toEqual({
      kind: 'note',
      note: 'paused',
    });
  });

  it('lets an empty queue outrank an unreadable attribute sheet', () => {
    expect(cloneVerdictGate({ ...ready, queue: [], training: null }, null)).toEqual({
      kind: 'note',
      note: 'empty',
    });
  });

  it('says the attributes could not be read', () => {
    expect(cloneVerdictGate({ ...ready, training: null }, null)).toEqual({
      kind: 'note',
      note: 'attributes',
    });
  });

  it('is pending while the verdict has not been worked out', () => {
    expect(cloneVerdictGate(ready, null)).toBeNull();
  });

  it('reads a verdict of none as an empty queue', () => {
    expect(cloneVerdictGate(ready, verdict('none'))).toEqual({ kind: 'note', note: 'empty' });
  });

  it('hands a real verdict through', () => {
    const result = verdict('jump');
    expect(cloneVerdictGate(ready, result)).toEqual({ kind: 'verdict', result });
  });
});

describe('runCloneVerdict', () => {
  it('works nothing out for a paused or missing training read', () => {
    expect(runCloneVerdict(null, 'omega', 0, null)).toBeNull();
    expect(runCloneVerdict(training({ paused: true }), 'omega', 0, null)).toBeNull();
  });

  it('compares the clones for a queue it can size', () => {
    const result = runCloneVerdict(training(), 'omega', Date.parse('2026-10-11T12:00:00Z'), null);
    expect(result?.rows.map((row) => row.cloneId)).toEqual(['worn']);
  });
});
