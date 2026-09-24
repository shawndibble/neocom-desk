import { describe, expect, it } from 'vitest';
import {
  addMilestone,
  MAX_MILESTONE_NAME_LENGTH,
  normalizeMilestones,
  removeMilestone,
  renameMilestone,
} from './milestones';
import type { PlanMilestone } from '@/engine/types';

function milestone(overrides: Partial<PlanMilestone> = {}): PlanMilestone {
  return { id: 'm1', name: 'Fly Loki', skillTypeID: 100, level: 4, ...overrides };
}

describe('normalizeMilestones', () => {
  it('passes a well-formed milestone through unchanged', () => {
    expect(normalizeMilestones([milestone()])).toEqual([milestone()]);
  });

  it('defaults an absent list to empty', () => {
    expect(normalizeMilestones(undefined)).toEqual([]);
  });

  it('trims the name and caps its length', () => {
    const long = 'x'.repeat(MAX_MILESTONE_NAME_LENGTH + 20);
    const [result] = normalizeMilestones([milestone({ name: `  ${long}  ` })]);
    expect(result.name).toBe(long.slice(0, MAX_MILESTONE_NAME_LENGTH));
  });

  it('drops a row whose name is blank after trimming', () => {
    expect(normalizeMilestones([milestone({ name: '   ' })])).toEqual([]);
  });

  it('drops malformed rows rather than throwing', () => {
    const malformed = [
      { id: 'a' }, // missing name/skillTypeID/level
      { id: 'b', name: 'ok', skillTypeID: 1, level: 99 }, // level out of range
      { id: 'c', name: 'ok', skillTypeID: '1', level: 1 }, // wrong type
    ] as unknown as PlanMilestone[];
    expect(normalizeMilestones(malformed)).toEqual([]);
  });

  it('collapses two milestones sharing an anchor to the first, keeping it', () => {
    // engine/skillPlanMilestones.ts looks a milestone up by this same
    // (skillTypeID, level) pair — a second one at the same anchor (a sync
    // race, or stale data from before addMilestone upserted) would otherwise
    // be silently swallowed by that lookup, so it never gets a chance to be
    // renamed or removed.
    const first = milestone({ id: 'm1', name: 'Fly Loki' });
    const second = milestone({ id: 'm2', name: 'Fly Something Else' });
    expect(normalizeMilestones([first, second])).toEqual([first]);
  });
});

describe('addMilestone', () => {
  it('appends a new milestone anchored to the given skill/level', () => {
    const result = addMilestone(undefined, { skillTypeID: 100, level: 4 }, 'Fly Loki');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'Fly Loki', skillTypeID: 100, level: 4 });
    expect(result[0].id).toBeTruthy();
  });

  it('keeps existing milestones and normalizes them', () => {
    const result = addMilestone([milestone()], { skillTypeID: 200, level: 1 }, 'T2 guns');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(milestone());
  });

  it('does not add a blank-named milestone', () => {
    expect(addMilestone(undefined, { skillTypeID: 100, level: 4 }, '   ')).toEqual([]);
  });

  it('replaces, rather than duplicates, an existing milestone at the same anchor', () => {
    const existing = milestone({ id: 'm1', name: 'Fly Loki', skillTypeID: 100, level: 4 });
    const result = addMilestone([existing], { skillTypeID: 100, level: 4 }, 'Fly Something Else');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'Fly Something Else',
      skillTypeID: 100,
      level: 4,
    });
    expect(result[0].id).not.toBe('m1');
  });
});

describe('renameMilestone', () => {
  it('renames the matching milestone, leaving others untouched', () => {
    const other = milestone({ id: 'm2', skillTypeID: 200, level: 1, name: 'T2 guns' });
    const result = renameMilestone([milestone(), other], 'm1', 'Command Ships');
    expect(result.find((m) => m.id === 'm1')?.name).toBe('Command Ships');
    expect(result.find((m) => m.id === 'm2')).toEqual(other);
  });

  it('ignores a blank rename, leaving the old name in place', () => {
    const result = renameMilestone([milestone()], 'm1', '   ');
    expect(result[0].name).toBe('Fly Loki');
  });
});

describe('removeMilestone', () => {
  it('drops the matching milestone by id', () => {
    const other = milestone({ id: 'm2', skillTypeID: 200, level: 1 });
    expect(removeMilestone([milestone(), other], 'm1')).toEqual([other]);
  });

  it('is a no-op when the id is not found', () => {
    expect(removeMilestone([milestone()], 'missing')).toEqual([milestone()]);
  });
});
