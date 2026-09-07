import { describe, it, expect } from 'vitest';
import type { EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';
import { splitEntriesByLevel } from './splitEntries';

const entry = (skillTypeID: number, targetLevel: number): PlanEntry => ({
  skillTypeID,
  targetLevel,
});

const skill = (typeID: number, prereqs: EngineSkill['prereqs'] = []): EngineSkill => ({
  typeID,
  name: `Skill ${typeID}`,
  rank: 1,
  primary: 'perception',
  secondary: 'willpower',
  prereqs,
});

/** 1 and 3 stand alone; 2 needs 1 at III. */
const SKILLS = new Map<number, EngineSkill>(
  [skill(1), skill(2, [{ typeID: 1, level: 3 }]), skill(3)].map((s) => [s.typeID, s])
);
const NO_TRAINED = new Map<number, TrainedSkill>();

describe('splitEntriesByLevel', () => {
  it('splits one entry into a row per level it trains', () => {
    const result = splitEntriesByLevel([entry(1, 3)], undefined, SKILLS, NO_TRAINED);
    expect(result.changed).toBe(true);
    expect(result.entries).toEqual([entry(1, 1), entry(1, 2), entry(1, 3)]);
  });

  it('splits only the levels above what the character already trained', () => {
    // "Mass Production V" on a level-III character trains IV and V, so those
    // are the rows — not I through V.
    const trained = new Map<number, TrainedSkill>([[1, { level: 3, sp: 250 }]]);
    const result = splitEntriesByLevel([entry(1, 5)], undefined, SKILLS, trained);
    expect(result.entries).toEqual([entry(1, 4), entry(1, 5)]);
  });

  it('is idempotent, so re-opening a split plan writes nothing', () => {
    const once = splitEntriesByLevel([entry(1, 3)], [1], SKILLS, NO_TRAINED);
    const twice = splitEntriesByLevel(once.entries, once.markers, SKILLS, NO_TRAINED);
    expect(twice.changed).toBe(false);
    expect(twice.entries).toEqual(once.entries);
    expect(twice.markers).toEqual(once.markers);
  });

  it('keeps each marker in front of the entry it sat in front of', () => {
    // [1-III, 3] with a marker at position 1 means "remap before entry 3".
    // Splitting the first entry into three rows must carry the marker to
    // position 3, or it silently lands in the middle of those rows instead.
    const result = splitEntriesByLevel([entry(1, 3), entry(3, 1)], [1], SKILLS, NO_TRAINED);
    expect(result.entries).toEqual([entry(1, 1), entry(1, 2), entry(1, 3), entry(3, 1)]);
    expect(result.markers).toEqual([3]);
  });

  it('keeps a trailing marker at the end of the longer list', () => {
    const result = splitEntriesByLevel([entry(1, 3)], [1], SKILLS, NO_TRAINED);
    expect(result.markers).toEqual([3]);
  });

  it("counts only an entry's own levels, never the prereqs pulled in for it", () => {
    // Entry 2 pulls skill 1 up to III, but those are prereq rows, not entries.
    const result = splitEntriesByLevel([entry(2, 2)], undefined, SKILLS, NO_TRAINED);
    expect(result.entries).toEqual([entry(2, 1), entry(2, 2)]);
  });

  it('keeps a fully-trained entry as one row rather than dropping it', () => {
    const trained = new Map<number, TrainedSkill>([[1, { level: 5, sp: 250 }]]);
    const result = splitEntriesByLevel([entry(1, 5)], undefined, SKILLS, trained);
    expect(result.changed).toBe(false);
    expect(result.entries).toEqual([entry(1, 5)]);
  });

  it('leaves entries whose skill the catalog has never heard of alone', () => {
    const result = splitEntriesByLevel([entry(999, 5)], undefined, SKILLS, NO_TRAINED);
    expect(result.changed).toBe(false);
    expect(result.entries).toEqual([entry(999, 5)]);
  });

  it('leaves a marker that is not a whole number as a usable position', () => {
    // Corrupt or externally-written data only, but the result is persisted
    // now rather than clamped on every read, and an `undefined` hole in a
    // number[] fails the Firestore write for the whole plan.
    const result = splitEntriesByLevel([entry(1, 3)], [Number.NaN, 1.5], SKILLS, NO_TRAINED);
    expect(result.markers?.every((m) => Number.isInteger(m))).toBe(true);
  });

  it('reports no change for an empty plan', () => {
    expect(splitEntriesByLevel([], undefined, SKILLS, NO_TRAINED).changed).toBe(false);
  });
});
