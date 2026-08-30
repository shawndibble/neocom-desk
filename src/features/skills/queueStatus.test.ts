import { describe, it, expect } from 'vitest';
import { classifySkillQueue, isQueuePaused } from './queueStatus';
import type { SkillQueueEntry } from '@/esi/endpoints';

const NOW = Date.parse('2026-08-30T12:00:00Z');
const at = (iso: string) => iso;

function entry(over: Partial<SkillQueueEntry> & Pick<SkillQueueEntry, 'queue_position'>) {
  return { skill_id: 100 + over.queue_position, finished_level: 3, ...over } as SkillQueueEntry;
}

describe('classifySkillQueue', () => {
  it('marks an entry whose finish_date has passed as completed, not training', () => {
    // ESI keeps these until the character next logs in — they are the
    // difference between /skills and reality, not stale junk to drop.
    const rows = classifySkillQueue(
      [entry({ queue_position: 0, finish_date: at('2026-08-29T12:00:00Z') })],
      NOW
    );
    expect(rows[0].status).toBe('completed');
    expect(rows[0].secondsRemaining).toBeNull();
  });

  it('marks the first unfinished entry as training and the rest as pending', () => {
    const rows = classifySkillQueue(
      [
        entry({ queue_position: 0, finish_date: at('2026-08-29T12:00:00Z') }),
        entry({ queue_position: 1, finish_date: at('2026-08-30T13:00:00Z') }),
        entry({ queue_position: 2, finish_date: at('2026-08-31T12:00:00Z') }),
      ],
      NOW
    );
    expect(rows.map((r) => r.status)).toEqual(['completed', 'training', 'pending']);
  });

  it('reports seconds remaining from ESI finish_date, not from a recomputed estimate', () => {
    const rows = classifySkillQueue(
      [entry({ queue_position: 0, finish_date: at('2026-08-30T13:00:00Z') })],
      NOW
    );
    expect(rows[0].secondsRemaining).toBe(3600);
  });

  it('orders by queue_position regardless of input order', () => {
    const rows = classifySkillQueue(
      [
        entry({ queue_position: 2, skill_id: 3, finish_date: at('2026-09-02T12:00:00Z') }),
        entry({ queue_position: 0, skill_id: 1, finish_date: at('2026-08-31T12:00:00Z') }),
        entry({ queue_position: 1, skill_id: 2, finish_date: at('2026-09-01T12:00:00Z') }),
      ],
      NOW
    );
    expect(rows.map((r) => r.entry.skill_id)).toEqual([1, 2, 3]);
  });

  it('treats an entry with no finish_date as paused, never as starting now', () => {
    // EVEMon's bug (peterhaneve/evemon#40): synthesizing a start time for a
    // paused entry marks skills falsely complete. Absent means unknown.
    const rows = classifySkillQueue([entry({ queue_position: 0 })], NOW);
    expect(rows[0].status).toBe('paused');
    expect(rows[0].secondsRemaining).toBeNull();
  });

  it('does not promote a later entry to training when the queue is paused', () => {
    const rows = classifySkillQueue(
      [entry({ queue_position: 0 }), entry({ queue_position: 1 })],
      NOW
    );
    expect(rows.every((r) => r.status === 'paused')).toBe(true);
  });

  it('clamps a finish_date that just passed to completed rather than negative time', () => {
    const rows = classifySkillQueue(
      [entry({ queue_position: 0, finish_date: new Date(NOW - 1000).toISOString() })],
      NOW
    );
    expect(rows[0].status).toBe('completed');
    expect(rows[0].secondsRemaining).toBeNull();
  });

  it('returns an empty array for an empty queue', () => {
    expect(classifySkillQueue([], NOW)).toEqual([]);
  });

  it('treats an unparseable finish_date as paused rather than completed', () => {
    // Date.parse returns NaN; every comparison against it is false, so an
    // unguarded implementation silently files this under "still training".
    const rows = classifySkillQueue([entry({ queue_position: 0, finish_date: 'not-a-date' })], NOW);
    expect(rows[0].status).toBe('paused');
  });
});

describe('isQueuePaused', () => {
  it('is true when entries exist but none carries a finish_date', () => {
    expect(isQueuePaused([entry({ queue_position: 0 })])).toBe(true);
  });

  it('is false for an active queue', () => {
    expect(
      isQueuePaused([entry({ queue_position: 0, finish_date: at('2026-08-31T12:00:00Z') })])
    ).toBe(false);
  });

  it('is false for an empty queue — nothing to pause', () => {
    expect(isQueuePaused([])).toBe(false);
  });
});
