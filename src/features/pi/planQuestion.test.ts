import { describe, it, expect } from 'vitest';
import { openingQuestion } from './planQuestion';

describe('openingQuestion', () => {
  it('opens on the first question when the pilot has colonies', () => {
    expect(openingQuestion({ goalCount: 0, colonyCount: 3 })).toEqual({
      question: 'make-more',
      reason: 'colonies',
    });
  });
  it('opens on the second when there are none', () => {
    expect(openingQuestion({ goalCount: 0, colonyCount: 0 })).toEqual({
      question: 'find-best',
      reason: 'no-colonies',
    });
  });
  it('a link that names a product opens the Goal Planner, colonies or not', () => {
    expect(openingQuestion({ goalCount: 1, colonyCount: 4 }).question).toBe('product');
    expect(openingQuestion({ goalCount: 2, colonyCount: 0 }).question).toBe('product');
  });
});
