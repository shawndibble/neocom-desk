import { describe, it, expect, vi } from 'vitest';
import '@/i18n';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PlanScheduleResult } from './planJobSlots';
import { PlanScheduleLine } from './PlanScheduleLine';

vi.mock('@/features/character/useCharacters', () => ({
  useCharacterNames: () =>
    new Map([
      [1, 'Alice'],
      [2, 'Bob'],
    ]),
}));

const NOW = Date.UTC(2026, 9, 15, 12, 0);
const counts = (part: number, final: number) => ({ reaction: 0, part, final });

const plan = (lanes: PlanScheduleResult['lanes']): PlanScheduleResult => ({
  schedule: { jobs: [], stages: [], finishMs: NOW + 3_600_000, peakSlots: 3 },
  stages: [
    { startMs: NOW, counts: counts(2, 0) },
    { startMs: NOW + 1_800_000, counts: counts(0, 1) },
  ],
  lanes,
  nowMs: NOW,
  hasSubJobs: true,
});

describe('PlanScheduleLine', () => {
  it('draws no lanes for a single Character', async () => {
    render(<PlanScheduleLine plan={plan([])} />);
    await userEvent.click(screen.getByRole('button', { name: /show/i }));
    expect(screen.getByRole('button', { expanded: true })).toBeInTheDocument();
    expect(screen.queryByText(/Alice/)).not.toBeInTheDocument();
  });

  it('lists a lane per Character once expanded, and none while collapsed', async () => {
    render(
      <PlanScheduleLine
        plan={plan([
          { characterId: 1, stages: [{ startMs: NOW, counts: counts(1, 0) }] },
          { characterId: 2, stages: [{ startMs: NOW, counts: counts(1, 0) }] },
        ])}
      />
    );
    expect(screen.queryByText(/Alice:/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show/i }));
    expect(screen.getByText(/^Alice: Now: 1 part/)).toBeInTheDocument();
    expect(screen.getByText(/^Bob: Now: 1 part/)).toBeInTheDocument();
  });
});
