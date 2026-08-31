import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { ComputedQueue } from './ComputedQueue';
import type { ScheduledStep } from '@/engine/types';

const steps: ScheduledStep[] = [
  { skillTypeID: 1, level: 1, sp: 250, seconds: 100, cumulativeSeconds: 100 },
  { skillTypeID: 2, level: 2, sp: 250, seconds: 100, cumulativeSeconds: 200 },
];
const nameFor = (id: number) => `Skill ${id}`;
const userSkills = new Set([1, 2]);

describe('ComputedQueue Booster marks', () => {
  it('marks only the steps a Booster speeds up', () => {
    render(
      <ComputedQueue
        steps={steps}
        nameFor={nameFor}
        userSkillTypeIDs={userSkills}
        hasValidEntries
        boostedSteps={new Set([0])}
      />
    );
    const marks = screen.getAllByRole('img', { name: /booster speeds this skill up/i });
    expect(marks).toHaveLength(1);
    // The mark belongs to the first row, not merely somewhere on the page.
    expect(screen.getByText(/Skill 1/).closest('li')).toContainElement(marks[0]);
  });

  it('marks nothing when no Booster is active', () => {
    render(
      <ComputedQueue
        steps={steps}
        nameFor={nameFor}
        userSkillTypeIDs={userSkills}
        hasValidEntries
      />
    );
    expect(
      screen.queryByRole('img', { name: /booster speeds this skill up/i })
    ).not.toBeInTheDocument();
  });
});
