import { describe, it, expect } from 'vitest';
import {
  applyCompletedQueueEntries,
  applyTrainingProgress,
  classifySkillQueue,
  completedQueueLevels,
  completedSpGain,
  deriveQueueState,
  isQueuePaused,
  type CompletedLevel,
} from './queueStatus';
import type { CharacterSkill, SkillQueueEntry } from '@/esi/endpoints';

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

describe('completedSpGain', () => {
  const done = (over: Partial<CompletedLevel> = {}): CompletedLevel => ({
    level: 4,
    sp: 45255,
    ...over,
  });
  const esi = (skill_id: number, skillpoints_in_skill: number): CharacterSkill[] => [
    { skill_id, trained_skill_level: 3, active_skill_level: 3, skillpoints_in_skill },
  ];

  it('adds the SP a credited level gained over what /skills reports', () => {
    const gain = completedSpGain(esi(3300, 8000), new Map([[3300, done()]]));
    expect(gain).toBe(37255);
  });

  it('counts the whole amount for a skill /skills does not list', () => {
    expect(completedSpGain([], new Map([[3300, done({ sp: 500 })]]))).toBe(500);
  });

  it('adds nothing when ESI omitted level_end_sp — it will not guess', () => {
    expect(completedSpGain(esi(3300, 8000), new Map([[3300, done({ sp: null })]]))).toBe(0);
  });

  it('never subtracts when the reported SP already exceeds the entry', () => {
    expect(completedSpGain(esi(3300, 90000), new Map([[3300, done()]]))).toBe(0);
  });

  it('is zero with nothing completed', () => {
    expect(completedSpGain(esi(3300, 8000), new Map())).toBe(0);
  });
});

describe('deriveQueueState', () => {
  it('reports unknown for a character with no cached queue data', () => {
    expect(deriveQueueState(undefined, NOW)).toBe('unknown');
  });

  it('reports idle for an empty cached queue', () => {
    expect(deriveQueueState([], NOW)).toBe('idle');
  });

  it('reports paused when queued entries have no start/finish dates', () => {
    const entries = [entry({ queue_position: 0 }), entry({ queue_position: 1 })];
    expect(deriveQueueState(entries, NOW)).toBe('paused');
  });

  it('never reports a paused queue as "starts now" or idle', () => {
    const entries = [entry({ queue_position: 0 })];
    const state = deriveQueueState(entries, NOW);
    expect(state).not.toBe('training');
    expect(state).not.toBe('idle');
    expect(state).toBe('paused');
  });

  it('reports training when the last queued entry is not close to finishing', () => {
    const entries = [
      entry({
        queue_position: 0,
        start_date: new Date(NOW - 60_000).toISOString(),
        finish_date: new Date(NOW + 60_000).toISOString(),
      }),
      entry({
        queue_position: 1,
        start_date: new Date(NOW + 60_000).toISOString(),
        finish_date: new Date(NOW + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ];
    expect(deriveQueueState(entries, NOW)).toBe('training');
  });

  it('reports endingSoon when the last queued entry finishes within the threshold', () => {
    const entries = [
      entry({
        queue_position: 0,
        start_date: new Date(NOW - 60_000).toISOString(),
        finish_date: new Date(NOW + 60 * 60 * 1000).toISOString(),
      }),
    ];
    expect(deriveQueueState(entries, NOW)).toBe('endingSoon');
  });

  it('reports training (not endingSoon) when the last entry finishes well beyond the threshold', () => {
    const entries = [
      entry({
        queue_position: 0,
        start_date: new Date(NOW - 60_000).toISOString(),
        finish_date: new Date(NOW + 10 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ];
    expect(deriveQueueState(entries, NOW)).toBe('training');
  });

  it('reports idle when every queued entry is already completed (stale-until-login ESI leftovers)', () => {
    const entries = [
      entry({
        queue_position: 0,
        start_date: new Date(NOW - 120_000).toISOString(),
        finish_date: new Date(NOW - 60_000).toISOString(),
      }),
    ];
    expect(deriveQueueState(entries, NOW)).toBe('idle');
  });
});

describe('completedQueueLevels: ESI responses are untrusted input', () => {
  const past = at('2026-08-29T12:00:00Z');

  it.each([0, 6, 99, -1, 2.5, Number.NaN])(
    'ignores an entry claiming finished_level %p, rather than passing it to the engine',
    (finished_level) => {
      // SkillQueueEntry is a cast over an ESI response and over a Dexie cache
      // replay, so nothing here is guaranteed. A level outside 1..5 throws in
      // engine/industry/time.ts and silently empties a plan in normalizePlan.
      const levels = completedQueueLevels(
        [entry({ queue_position: 0, skill_id: 3300, finished_level, finish_date: past })],
        NOW
      );
      expect(levels.size).toBe(0);
    }
  );

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'drops a level_end_sp of %p to unknown, keeping the level',
    (level_end_sp) => {
      const levels = completedQueueLevels(
        [
          entry({
            queue_position: 0,
            skill_id: 3300,
            finished_level: 4,
            finish_date: past,
            level_end_sp,
          }),
        ],
        NOW
      );
      expect(levels.get(3300)).toEqual({ level: 4, sp: null });
    }
  );
});

describe('applyTrainingProgress', () => {
  // Half-way through a 24h training: 12h of it elapsed as of NOW.
  const training = (over: Partial<SkillQueueEntry> = {}) =>
    entry({
      queue_position: 0,
      skill_id: 60378,
      finished_level: 4,
      start_date: at('2026-08-30T00:00:00Z'),
      finish_date: at('2026-08-31T00:00:00Z'),
      training_start_sp: 100_000,
      level_end_sp: 200_000,
      ...over,
    });

  it('interpolates the training skill SP across its own start/finish window', () => {
    // The whole point: /skills reports SP as of the last apply, so the skill
    // currently training reads stale and the planner charges a level the
    // character is part-way through in full.
    const merged = applyTrainingProgress(
      new Map([[60378, { level: 3, sp: 100_000 }]]),
      [training()],
      NOW
    );
    expect(merged.get(60378)).toEqual({ level: 3, sp: 150_000 });
  });

  it('never lowers SP /skills already reports higher', () => {
    const merged = applyTrainingProgress(
      new Map([[60378, { level: 3, sp: 190_000 }]]),
      [training()],
      NOW
    );
    expect(merged.get(60378)).toEqual({ level: 3, sp: 190_000 });
  });

  it('adds a first-time skill /skills omits entirely, at level 0', () => {
    const merged = applyTrainingProgress(new Map(), [training({ finished_level: 1 })], NOW);
    expect(merged.get(60378)).toEqual({ level: 0, sp: 150_000 });
  });

  it('raises SP without ever raising the level — that is the completed pass job', () => {
    const merged = applyTrainingProgress(
      new Map([[60378, { level: 3, sp: 0 }]]),
      [training()],
      NOW
    );
    expect(merged.get(60378)?.level).toBe(3);
  });

  it('only touches the row that is actually training, not the ones queued behind it', () => {
    const merged = applyTrainingProgress(
      new Map(),
      [
        training(),
        training({
          queue_position: 1,
          skill_id: 3387,
          start_date: at('2026-08-31T00:00:00Z'),
          finish_date: at('2026-09-02T00:00:00Z'),
        }),
      ],
      NOW
    );
    expect(merged.get(60378)?.sp).toBe(150_000);
    expect(merged.has(3387)).toBe(false);
  });

  it('contributes nothing when the head entry has already finished', () => {
    // A past finish_date is `completed`, which applyCompletedQueueEntries
    // owns. Interpolating it here would double-count against that pass.
    const trained = new Map([[60378, { level: 3, sp: 100_000 }]]);
    const merged = applyTrainingProgress(
      trained,
      [
        training({
          start_date: at('2026-08-28T00:00:00Z'),
          finish_date: at('2026-08-29T00:00:00Z'),
        }),
      ],
      NOW
    );
    expect(merged.get(60378)).toEqual({ level: 3, sp: 100_000 });
  });

  it('falls back to training_start_sp as a floor when the queue is paused', () => {
    // A paused queue omits its dates, so there is nothing to interpolate
    // across — but the SP banked when training began is still a lower bound.
    const merged = applyTrainingProgress(
      new Map([[60378, { level: 3, sp: 48_000 }]]),
      [entry({ queue_position: 0, skill_id: 60378, training_start_sp: 100_000 })],
      NOW
    );
    expect(merged.get(60378)).toEqual({ level: 3, sp: 100_000 });
  });

  it('changes nothing when ESI withheld the SP fields', () => {
    const trained = new Map([[60378, { level: 3, sp: 48_000 }]]);
    const merged = applyTrainingProgress(
      trained,
      [training({ training_start_sp: undefined, level_end_sp: undefined })],
      NOW
    );
    expect(merged.get(60378)).toEqual({ level: 3, sp: 48_000 });
  });

  it('survives a zero-length or malformed training window', () => {
    const trained = new Map([[60378, { level: 3, sp: 48_000 }]]);
    for (const over of [
      { start_date: at('2026-08-31T00:00:00Z') }, // start === finish
      { start_date: 'not-a-date' },
    ]) {
      const merged = applyTrainingProgress(trained, [training(over)], NOW);
      // Falls back to the banked floor rather than NaN or a divide-by-zero.
      expect(merged.get(60378)).toEqual({ level: 3, sp: 100_000 });
    }
  });

  it('does not credit SP past the level end when the clock has run over', () => {
    // start_date in the future is nonsense but reachable via clock skew;
    // the fraction is clamped both ways rather than extrapolated.
    const merged = applyTrainingProgress(
      new Map([[60378, { level: 3, sp: 0 }]]),
      [
        training({
          start_date: at('2026-08-30T18:00:00Z'),
          finish_date: at('2026-08-31T18:00:00Z'),
        }),
      ],
      NOW
    );
    expect(merged.get(60378)).toEqual({ level: 3, sp: 100_000 });
  });

  it('leaves every other skill untouched', () => {
    const merged = applyTrainingProgress(
      new Map([
        [60378, { level: 3, sp: 100_000 }],
        [3387, { level: 3, sp: 16_000 }],
      ]),
      [training()],
      NOW
    );
    expect(merged.get(3387)).toEqual({ level: 3, sp: 16_000 });
  });
});
