import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { GoalPlannerSnapshot } from './goalPlannerSnapshot';

let snapshots: Array<Partial<GoalPlannerSnapshot>> = [];
const load = vi.fn(async () => snapshots.shift() as GoalPlannerSnapshot);
vi.mock('./goalPlannerSnapshot', () => ({ loadGoalPlannerSnapshot: () => load() }));
vi.mock('./FindBestPlan', () => ({ FindBestPlan: () => <p>find best body</p> }));
vi.mock('./MakeMorePlan', () => ({ MakeMorePlan: () => <p>make more body</p> }));
vi.mock('./GoalPlannerPanel', () => ({ GoalPlannerPanel: () => <p>goal planner body</p> }));

const { PlanPanel } = await import('./PlanPanel');

const failed: Partial<GoalPlannerSnapshot> = { colonies: [], fetchFailed: true };
const ok = {
  colonies: [{ planet_id: 1, planet_type: 'barren' }],
  fetchFailed: false,
} as unknown as Partial<GoalPlannerSnapshot>;

function renderPlan(url = '/pi') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <PlanPanel
        characterId={7}
        goals={[]}
        onGoalsChange={() => {}}
        disabled={[]}
        onDisabledChange={() => {}}
        seedingGoal={false}
      />
    </MemoryRouter>
  );
}

describe('PlanPanel when ESI does not answer the colony read', () => {
  beforeEach(() => {
    load.mockClear();
  });

  it('shows the notice with Find best, not instead of it', async () => {
    snapshots = [failed];
    renderPlan();
    expect(await screen.findByRole('alert')).toHaveTextContent(/ESI didn't answer/);
    expect(screen.getByText('find best body')).toBeInTheDocument();
    expect(screen.queryByText('make more body')).not.toBeInTheDocument();
  });

  it('keeps ?q=find-best working', async () => {
    snapshots = [failed];
    renderPlan('/pi?q=find-best');
    expect(await screen.findByText('find best body')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('falls back to Find best for ?q=make-more, and the Goal Planner stays reachable', async () => {
    snapshots = [failed];
    renderPlan('/pi?q=make-more');
    expect(await screen.findByText('find best body')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Make a specific product/ }));
    expect(await screen.findByText('goal planner body')).toBeInTheDocument();
  });

  it('moves focus to the result after a successful Retry, never to <body>', async () => {
    snapshots = [failed, ok];
    renderPlan();
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByText('make more body')).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
    expect(document.activeElement).toContainElement(screen.getByText('make more body'));
  });

  it('keeps Retry focused when the read fails again', async () => {
    snapshots = [failed, failed];
    renderPlan();
    const retry = await screen.findByRole('button', { name: 'Retry' });
    await userEvent.click(retry);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus();
  });
});
