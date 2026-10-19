import { describe, it, expect } from 'vitest';
import {
  diffIndustryJobComplete,
  type IndustryJobEntrySnapshot,
  type IndustryJobSnapshot,
} from './index';

const T0 = 1_000_000;
const FIVE_MIN = 5 * 60 * 1000;

function jobEntry(
  overrides: Partial<IndustryJobEntrySnapshot> & Pick<IndustryJobEntrySnapshot, 'jobId' | 'endMs'>
): IndustryJobEntrySnapshot {
  return { blueprintTypeId: 1000, productTypeId: 2000, activityId: 1, ...overrides };
}

function jobSnapshot(
  entries: readonly IndustryJobEntrySnapshot[],
  nowMs: number
): IndustryJobSnapshot {
  return { entries, nowMs };
}

describe('diffIndustryJobComplete', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = jobSnapshot([jobEntry({ jobId: 1, endMs: T0 - 1000 })], T0);
    expect(diffIndustryJobComplete(1, undefined, next)).toEqual([]);
  });

  it('fires when a job newly completes', () => {
    const prev = jobSnapshot([jobEntry({ jobId: 1, endMs: T0 + 1000 })], T0);
    const next = jobSnapshot([jobEntry({ jobId: 1, endMs: T0 + 1000 })], T0 + 2000);
    expect(diffIndustryJobComplete(7, prev, next)).toEqual([
      {
        eventId: 'industryJobComplete',
        characterId: 7,
        jobId: 1,
        blueprintTypeId: 1000,
        productTypeId: 2000,
        activityId: 1,
        endMs: T0 + 1000,
      },
    ]);
  });

  it('does not fire for a job not yet finished', () => {
    const prev = jobSnapshot([jobEntry({ jobId: 1, endMs: T0 + 5000 })], T0);
    const next = jobSnapshot([jobEntry({ jobId: 1, endMs: T0 + 5000 })], T0 + 1000);
    expect(diffIndustryJobComplete(7, prev, next)).toEqual([]);
  });

  it('does not re-fire for a job already finished as of the previous poll', () => {
    const prev = jobSnapshot([jobEntry({ jobId: 1, endMs: T0 - 5000 })], T0);
    const next = jobSnapshot([jobEntry({ jobId: 1, endMs: T0 - 5000 })], T0 + FIVE_MIN);
    expect(diffIndustryJobComplete(7, prev, next)).toEqual([]);
  });

  it('fires once per job when multiple jobs complete in the same poll', () => {
    const prev = jobSnapshot(
      [jobEntry({ jobId: 1, endMs: T0 + 100 }), jobEntry({ jobId: 2, endMs: T0 + 200 })],
      T0
    );
    const next = jobSnapshot(
      [jobEntry({ jobId: 1, endMs: T0 + 100 }), jobEntry({ jobId: 2, endMs: T0 + 200 })],
      T0 + 300
    );
    expect(diffIndustryJobComplete(7, prev, next)).toEqual([
      {
        eventId: 'industryJobComplete',
        characterId: 7,
        jobId: 1,
        blueprintTypeId: 1000,
        productTypeId: 2000,
        activityId: 1,
        endMs: T0 + 100,
      },
      {
        eventId: 'industryJobComplete',
        characterId: 7,
        jobId: 2,
        blueprintTypeId: 1000,
        productTypeId: 2000,
        activityId: 1,
        endMs: T0 + 200,
      },
    ]);
  });

  it('fires for a job that only appears once already complete (never seen active before)', () => {
    const prev = jobSnapshot([], T0);
    const next = jobSnapshot([jobEntry({ jobId: 1, endMs: T0 + 1000 })], T0 + 2000);
    expect(diffIndustryJobComplete(7, prev, next)).toEqual([
      {
        eventId: 'industryJobComplete',
        characterId: 7,
        jobId: 1,
        blueprintTypeId: 1000,
        productTypeId: 2000,
        activityId: 1,
        endMs: T0 + 1000,
      },
    ]);
  });
});
