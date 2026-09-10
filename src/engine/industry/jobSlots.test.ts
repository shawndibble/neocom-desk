import { describe, it, expect } from 'vitest';
import {
  maxJobSlots,
  jobSlotCategory,
  runningJobCountsByCategory,
  aggregateJobSlotSummary,
  type JobSlotSkills,
  type JobSlotCharacterInput,
} from './jobSlots';

const NO_SKILLS: JobSlotSkills = {
  massProduction: 0,
  advancedMassProduction: 0,
  laboratoryOperation: 0,
  advancedLaboratoryOperation: 0,
  massReactions: 0,
  advancedMassReactions: 0,
};

describe('maxJobSlots', () => {
  it('gives the one free slot per category with no skills trained', () => {
    expect(maxJobSlots(NO_SKILLS)).toEqual({ manufacturing: 1, science: 1, reaction: 1 });
  });

  it('adds Mass Production and Advanced Mass Production to the manufacturing max, up to 11 at V/V', () => {
    expect(
      maxJobSlots({ ...NO_SKILLS, massProduction: 5, advancedMassProduction: 5 }).manufacturing
    ).toBe(11);
    expect(maxJobSlots({ ...NO_SKILLS, massProduction: 4 }).manufacturing).toBe(5);
  });

  it('adds Laboratory Operation and Advanced Laboratory Operation to the science max, up to 11 at V/V', () => {
    expect(
      maxJobSlots({ ...NO_SKILLS, laboratoryOperation: 5, advancedLaboratoryOperation: 5 }).science
    ).toBe(11);
  });

  it('adds Mass Reactions and Advanced Mass Reactions to the reaction max, up to 11 at V/V', () => {
    expect(maxJobSlots({ ...NO_SKILLS, massReactions: 5, advancedMassReactions: 5 }).reaction).toBe(
      11
    );
    // The user's own worked example: Mass Reactions IV, Advanced Mass Reactions untrained.
    expect(maxJobSlots({ ...NO_SKILLS, massReactions: 4 }).reaction).toBe(5);
  });
});

describe('jobSlotCategory', () => {
  it('maps manufacturing (1) and reaction (11) to their own category', () => {
    expect(jobSlotCategory(1)).toBe('manufacturing');
    expect(jobSlotCategory(11)).toBe('reaction');
  });

  it('maps every research/copying/invention activity to the shared science category', () => {
    // Invention (8) is classed as a science job and draws from the same
    // laboratory slots as research and copying (support.eveonline.com
    // "Invention").
    expect(jobSlotCategory(3)).toBe('science');
    expect(jobSlotCategory(4)).toBe('science');
    expect(jobSlotCategory(5)).toBe('science');
    expect(jobSlotCategory(8)).toBe('science');
  });

  it('is null for an activity id outside the three slot pools', () => {
    expect(jobSlotCategory(99)).toBeNull();
  });
});

describe('runningJobCountsByCategory', () => {
  const NOW = 1_700_000_000_000;

  function job(activityId: number, endMs: number) {
    return { activityId, endMs };
  }

  it('counts only jobs not yet ended, per category', () => {
    const counts = runningJobCountsByCategory(
      [
        job(1, NOW + 1000), // manufacturing, running
        job(1, NOW - 1000), // manufacturing, done
        job(3, NOW + 1000), // science, running
        job(8, NOW + 1000), // science (invention), running
        job(11, NOW - 1000), // reaction, done
      ],
      NOW
    );
    expect(counts).toEqual({ manufacturing: 1, science: 2, reaction: 0 });
  });

  it('is all zeros for no jobs', () => {
    expect(runningJobCountsByCategory([], NOW)).toEqual({
      manufacturing: 0,
      science: 0,
      reaction: 0,
    });
  });

  it('ignores an activity id outside the three slot pools rather than throwing', () => {
    expect(runningJobCountsByCategory([job(99, NOW + 1000)], NOW)).toEqual({
      manufacturing: 0,
      science: 0,
      reaction: 0,
    });
  });
});

describe('aggregateJobSlotSummary', () => {
  const NOW = 1_700_000_000_000;

  function job(activityId: number, endMs: number) {
    return { activityId, endMs };
  }

  const skills = (massProduction: number): JobSlotSkills => ({
    ...NO_SKILLS,
    massProduction,
  });

  it('is undefined for every category with no characters', () => {
    expect(aggregateJobSlotSummary([], NOW)).toEqual({
      manufacturing: undefined,
      science: undefined,
      reaction: undefined,
    });
  });

  it('sums open/max across characters with known skills and jobs', () => {
    const characters: JobSlotCharacterInput[] = [
      // 1 base + 4 trained = 5 max, 1 running -> 4 open.
      { skills: skills(4), jobs: [job(1, NOW + 1000)] },
      // 1 base + 2 trained = 3 max, 0 running -> 3 open.
      { skills: skills(2), jobs: [] },
    ];
    expect(aggregateJobSlotSummary(characters, NOW).manufacturing).toEqual({ open: 7, max: 8 });
  });

  it('excludes a character missing skills or jobs from the sum rather than guessing zero', () => {
    const characters: JobSlotCharacterInput[] = [
      { skills: skills(4), jobs: [] }, // 5 max, 0 running -> 5 open.
      { skills: undefined, jobs: [] }, // skills unknown: excluded entirely.
      { skills: skills(0), jobs: undefined }, // jobs unknown: excluded entirely.
    ];
    expect(aggregateJobSlotSummary(characters, NOW).manufacturing).toEqual({ open: 5, max: 5 });
  });

  it('is undefined for a category when every character is missing data for it', () => {
    const characters: JobSlotCharacterInput[] = [
      { skills: undefined, jobs: [] },
      { skills: skills(1), jobs: undefined },
    ];
    expect(aggregateJobSlotSummary(characters, NOW).manufacturing).toBeUndefined();
  });
});
