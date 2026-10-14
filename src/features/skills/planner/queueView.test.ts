import { describe, expect, it } from 'vitest';
import type { SkillQueueEntry } from '@/esi/endpoints';
import { classifySkillQueue } from '../queueStatus';
import { buildQueueView, heroProgress, heroSpPerHour } from './queueView';

const NOW = Date.parse('2026-10-14T12:00:00Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW + days * DAY).toISOString();

function entry(position: number, endDays: number, startDays: number | null = null) {
  return {
    skill_id: 3300 + position,
    queue_position: position,
    finished_level: 5,
    start_date: at(startDays ?? Math.max(endDays - 1, -1)),
    finish_date: at(endDays),
  } satisfies SkillQueueEntry;
}

const view = (entries: SkillQueueEntry[]) => buildQueueView(classifySkillQueue(entries, NOW));

describe('buildQueueView', () => {
  it('takes the first still-training row as the hero and leaves it out of the groups', () => {
    const v = view([entry(0, 8), entry(1, 15)]);
    expect(v.hero?.entry.queue_position).toBe(0);
    expect(v.groups.flatMap((g) => g.rows.map((r) => r.entry.queue_position))).toEqual([1]);
  });

  it('buckets by finish date: week, next three weeks, month 2, then two-month windows', () => {
    const v = view([
      entry(0, 1),
      entry(1, 5),
      entry(2, 20),
      entry(3, 45),
      entry(4, 80),
      entry(5, 130),
      entry(6, 190),
    ]);
    expect(v.groups.map((g) => g.id)).toEqual([
      'week',
      'weeks',
      'month2',
      'months-3',
      'months-5',
      'months-7',
    ]);
    expect(v.groups.map((g) => g.rows.length)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('skips empty buckets', () => {
    const v = view([entry(0, 1), entry(1, 100)]);
    expect(v.groups.map((g) => g.id)).toEqual(['months-3']);
  });

  it("totals a group as the time it adds to the queue, not the last row's finish", () => {
    const v = view([entry(0, 1), entry(1, 10), entry(2, 12), entry(3, 40)]);
    const weeks = v.groups.find((g) => g.id === 'weeks');
    const month2 = v.groups.find((g) => g.id === 'month2');
    expect(weeks?.totalSeconds).toBeCloseTo(11 * 86_400, 0);
    expect(month2?.totalSeconds).toBeCloseTo(28 * 86_400, 0);
  });

  it('reports the whole queue length and end', () => {
    const v = view([entry(0, 1), entry(1, 30)]);
    expect(v.totalSeconds).toBeCloseTo(30 * 86_400, 0);
    expect(v.skillCount).toBe(2);
  });

  it('keeps finished rows apart, with no hero when everything is done', () => {
    const v = view([entry(0, -2), entry(1, -1)]);
    expect(v.hero).toBeNull();
    expect(v.finished).toHaveLength(2);
    expect(v.groups).toEqual([]);
    expect(v.totalSeconds).toBe(0);
  });

  it('puts a paused queue (no dates) in the undated list with no hero', () => {
    const paused: SkillQueueEntry[] = [
      { skill_id: 1, queue_position: 0, finished_level: 3 },
      { skill_id: 2, queue_position: 1, finished_level: 4 },
    ];
    const v = view(paused);
    expect(v.hero).toBeNull();
    expect(v.undated).toHaveLength(2);
    expect(v.groups).toEqual([]);
  });

  it('counts only skills still ahead, not finished ones', () => {
    expect(view([entry(0, -1), entry(1, 2), entry(2, 4)]).skillCount).toBe(2);
  });
});

describe('heroProgress', () => {
  it("is the elapsed share of the level's own start..finish window", () => {
    const e = entry(0, 1, -1);
    expect(heroProgress(e, NOW)).toBeCloseTo(0.5, 2);
  });

  it('clamps to 0..1', () => {
    expect(heroProgress(entry(0, 1, 0.5), NOW)).toBe(0);
    expect(heroProgress(entry(0, -1, -2), NOW)).toBe(1);
  });

  it('is null with no dates (paused)', () => {
    expect(heroProgress({ skill_id: 1, queue_position: 0, finished_level: 1 }, NOW)).toBeNull();
  });
});

describe('heroSpPerHour', () => {
  it("is the level's own SP over its own window, straight from ESI", () => {
    const e: SkillQueueEntry = {
      ...entry(0, 1, -1),
      training_start_sp: 1000,
      level_end_sp: 1000 + 2 * 24 * 1800,
    };
    expect(heroSpPerHour(e)).toBeCloseTo(1800, 3);
  });

  it('is null when ESI left out the SP fields or the window is empty', () => {
    expect(heroSpPerHour(entry(0, 1, -1))).toBeNull();
    expect(heroSpPerHour({ ...entry(0, 1, 1), training_start_sp: 1, level_end_sp: 2 })).toBeNull();
  });
});
