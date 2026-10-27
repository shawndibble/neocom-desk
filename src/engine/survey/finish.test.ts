import { describe, expect, it } from 'vitest';
import { canFinishSurvey } from './finish';
import type { SurveySummary } from './series';

const NOW = 1_000_000_000_000;

function summary(
  over: Partial<SurveySummary>
): Pick<SurveySummary, 'finished' | 'percent' | 'etaAt'> {
  return { finished: false, percent: 50, etaAt: NOW + 60 * 60_000, ...over };
}

describe('canFinishSurvey', () => {
  it('lets the owner finish a field that is still well under way', () => {
    expect(canFinishSurvey(summary({}), true, NOW)).toBe(true);
  });

  it('keeps anyone else out of a field that is well under way', () => {
    expect(canFinishSurvey(summary({}), false, NOW)).toBe(false);
  });

  it('lets anyone finish once it reads 99% mined', () => {
    expect(canFinishSurvey(summary({ percent: 99 }), false, NOW)).toBe(true);
    expect(canFinishSurvey(summary({ percent: 98 }), false, NOW)).toBe(false);
  });

  it('lets anyone finish once the Done at time has passed', () => {
    expect(canFinishSurvey(summary({ etaAt: NOW }), false, NOW)).toBe(true);
    expect(canFinishSurvey(summary({ etaAt: NOW - 5 * 60_000 }), false, NOW)).toBe(true);
  });

  it('keeps anyone else out while the Done at time is still ahead, even by a minute', () => {
    expect(canFinishSurvey(summary({ etaAt: NOW + 1 }), false, NOW)).toBe(false);
    expect(canFinishSurvey(summary({ etaAt: NOW + 60_000 }), false, NOW)).toBe(false);
  });

  it('does not guess when there is no estimate', () => {
    expect(canFinishSurvey(summary({ etaAt: null }), false, NOW)).toBe(false);
  });

  it('offers nothing once the field is finished, owner or not', () => {
    const done = summary({ finished: true, percent: 100, etaAt: null });
    expect(canFinishSurvey(done, true, NOW)).toBe(false);
    expect(canFinishSurvey(done, false, NOW)).toBe(false);
  });
});
