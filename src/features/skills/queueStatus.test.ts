import { describe, it, expect } from 'vitest';
import {
  applyCompletedQueueEntries,
  classifySkillQueue,
  completedQueueLevels,
  isQueuePaused,
} from './queueStatus';
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

describe('completedQueueLevels', () => {
  it('reports a skill whose queue entry finished in the past', () => {
    const levels = completedQueueLevels(
      [
        entry({
          queue_position: 0,
          skill_id: 3300,
          finished_level: 4,
          finish_date: at('2026-08-29T12:00:00Z'),
        }),
      ],
      NOW
    );
    expect(levels.get(3300)).toEqual({ level: 4, sp: null });
  });

  it('ignores entries still training or queued — they are not trained yet', () => {
    const levels = completedQueueLevels(
      [
        entry({
          queue_position: 0,
          skill_id: 3300,
          finished_level: 4,
          finish_date: at('2026-08-30T13:00:00Z'),
        }),
        entry({
          queue_position: 1,
          skill_id: 3301,
          finished_level: 2,
          finish_date: at('2026-08-31T12:00:00Z'),
        }),
      ],
      NOW
    );
    expect(levels.size).toBe(0);
  });

  it('ignores a paused queue entirely — an absent date is not a past date', () => {
    // peterhaneve/evemon#40: synthesizing a time for paused entries marked
    // skills falsely complete. An absent date means "ETA unknown", never "done".
    const levels = completedQueueLevels(
      [entry({ queue_position: 0, skill_id: 3300, finished_level: 5 })],
      NOW
    );
    expect(levels.size).toBe(0);
  });

  it('keeps the highest finished_level when one skill completed twice', () => {
    // Queue order does not guarantee ascending level, so last-write-wins is
    // not the same thing as max.
    const levels = completedQueueLevels(
      [
        entry({
          queue_position: 0,
          skill_id: 3300,
          finished_level: 5,
          finish_date: at('2026-08-28T12:00:00Z'),
        }),
        entry({
          queue_position: 1,
          skill_id: 3300,
          finished_level: 3,
          finish_date: at('2026-08-29T12:00:00Z'),
        }),
      ],
      NOW
    );
    expect(levels.get(3300)?.level).toBe(5);
  });

  it('carries level_end_sp when ESI supplies it', () => {
    const levels = completedQueueLevels(
      [
        entry({
          queue_position: 0,
          skill_id: 3300,
          finished_level: 4,
          finish_date: at('2026-08-29T12:00:00Z'),
          level_end_sp: 90510,
        }),
      ],
      NOW
    );
    expect(levels.get(3300)).toEqual({ level: 4, sp: 90510 });
  });
});

describe('applyCompletedQueueEntries', () => {
  const queue = [
    entry({
      queue_position: 0,
      skill_id: 3300,
      finished_level: 4,
      finish_date: at('2026-08-29T12:00:00Z'),
      level_end_sp: 90510,
    }),
  ];

  it('raises a level that /skills still reports low', () => {
    const trained = new Map([[3300, { level: 3, sp: 16000 }]]);
    const merged = applyCompletedQueueEntries(trained, queue, NOW);
    expect(merged.get(3300)).toEqual({ level: 4, sp: 90510 });
  });

  it('adds a skill /skills does not list at all', () => {
    const merged = applyCompletedQueueEntries(new Map(), queue, NOW);
    expect(merged.get(3300)).toEqual({ level: 4, sp: 90510 });
  });

  it('never lowers a level /skills already reports higher', () => {
    const trained = new Map([[3300, { level: 5, sp: 512000 }]]);
    const merged = applyCompletedQueueEntries(trained, queue, NOW);
    expect(merged.get(3300)).toEqual({ level: 5, sp: 512000 });
  });

  it('keeps the known SP when the completed entry carries none', () => {
    const trained = new Map([[3300, { level: 3, sp: 16000 }]]);
    const bare = [
      entry({
        queue_position: 0,
        skill_id: 3300,
        finished_level: 4,
        finish_date: at('2026-08-29T12:00:00Z'),
      }),
    ];
    const merged = applyCompletedQueueEntries(trained, bare, NOW);
    expect(merged.get(3300)).toEqual({ level: 4, sp: 16000 });
  });

  it('leaves untouched skills alone and does not mutate the input map', () => {
    const trained = new Map([
      [3300, { level: 3, sp: 16000 }],
      [3301, { level: 2, sp: 2000 }],
    ]);
    const merged = applyCompletedQueueEntries(trained, queue, NOW);
    expect(merged.get(3301)).toEqual({ level: 2, sp: 2000 });
    expect(trained.get(3300)).toEqual({ level: 3, sp: 16000 });
  });
});
