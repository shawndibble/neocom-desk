import { describe, it, expect } from 'vitest';
import { parseSkillQueue } from '@/engine/queueImport';

describe('parseSkillQueue', () => {
  it('maps ESI queue rows to plan entries', () => {
    const entries = parseSkillQueue([
      { skill_id: 3300, finished_level: 3, queue_position: 0 },
      { skill_id: 3301, finished_level: 1, queue_position: 1 },
    ]);
    expect(entries).toEqual([
      { skillTypeID: 3300, targetLevel: 3 },
      { skillTypeID: 3301, targetLevel: 1 },
    ]);
  });

  it('orders by queue_position regardless of array order', () => {
    const entries = parseSkillQueue([
      { skill_id: 2, finished_level: 5, queue_position: 2 },
      { skill_id: 1, finished_level: 4, queue_position: 0 },
      { skill_id: 3, finished_level: 2, queue_position: 1 },
    ]);
    expect(entries.map((e) => e.skillTypeID)).toEqual([1, 3, 2]);
  });

  it('keeps one entry per queue row (multi-level trains of one skill)', () => {
    const entries = parseSkillQueue([
      { skill_id: 3300, finished_level: 4, queue_position: 0 },
      { skill_id: 3300, finished_level: 5, queue_position: 1 },
    ]);
    expect(entries).toEqual([
      { skillTypeID: 3300, targetLevel: 4 },
      { skillTypeID: 3300, targetLevel: 5 },
    ]);
  });

  it('tolerates optional ESI fields', () => {
    const entries = parseSkillQueue([
      {
        skill_id: 3300,
        finished_level: 2,
        queue_position: 0,
        level_start_sp: 250,
        level_end_sp: 1415,
        start_date: '2026-08-29T00:00:00Z',
        finish_date: '2026-08-30T00:00:00Z',
      },
    ]);
    expect(entries).toEqual([{ skillTypeID: 3300, targetLevel: 2 }]);
  });

  it('returns [] for an empty queue', () => {
    expect(parseSkillQueue([])).toEqual([]);
  });

  it('rejects non-array input', () => {
    expect(() => parseSkillQueue({} as never)).toThrow(/array/i);
  });

  it('rejects rows missing skill_id or finished_level', () => {
    expect(() => parseSkillQueue([{ finished_level: 1, queue_position: 0 } as never])).toThrow(
      /skill_id/
    );
    expect(() => parseSkillQueue([{ skill_id: 1, queue_position: 0 } as never])).toThrow(
      /finished_level/
    );
  });

  it('rejects finished_level outside 1..5', () => {
    expect(() => parseSkillQueue([{ skill_id: 1, finished_level: 6, queue_position: 0 }])).toThrow(
      /finished_level/
    );
    expect(() => parseSkillQueue([{ skill_id: 1, finished_level: 0, queue_position: 0 }])).toThrow(
      /finished_level/
    );
  });
});
