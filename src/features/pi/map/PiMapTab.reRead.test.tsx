import { useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { GoalPlannerSnapshot } from '../goalPlannerSnapshot';
import type { PlanAdviceInput } from '../planAdvice/types';
import { buildPlanAdvice } from '../planAdviceModel';
import { adviceInput, snapshot } from './mapFixtures.testutil';

vi.mock('../goalPlannerSnapshot', () => ({
  loadGoalPlannerSnapshot: async () => ({
    ...snapshot('lean'),
    systemNames: new Map(),
    planetNames: new Map(),
    customsOverrides: {},
  }),
}));

const inputOf = new WeakMap<object, PlanAdviceInput>();
vi.mock('../usePiAdviceInputs', () => ({
  usePiAdviceInputs: (s: GoalPlannerSnapshot | null) => {
    if (!s) return { status: 'loading' };
    let input = inputOf.get(s);
    if (!input) inputOf.set(s, (input = { ...adviceInput('lean'), snapshot: s }));
    return { status: 'ready', prices: {}, hubName: 'Jita', input };
  },
}));

let builds = 0;
vi.mock('../planAdviceService', () => ({
  PlanAdviceWorkerUnavailable: class extends Error {},
  planAdviceWorkerAvailable: () => true,
  peekPlanAdvice: () => null,
  askPlanAdvice: (input: PlanAdviceInput) =>
    ++builds === 1 ? Promise.resolve(buildPlanAdvice(input)) : new Promise(() => {}),
}));

let mounts = 0;
vi.mock('./PlanMap', () => ({
  PlanMap: () => {
    const [open, setOpen] = useState(false);
    useEffect(() => {
      mounts++;
    }, []);
    return (
      <button type="button" aria-expanded={open} onClick={() => setOpen(true)}>
        full map
      </button>
    );
  },
}));

const { PiMapTab } = await import('./PiMapTab');
const { PiSnapshotProvider } = await import('../usePiSnapshot');

function Page({ characterId, reloadKey }: { characterId: number; reloadKey: number }) {
  return (
    <PiSnapshotProvider characterId={characterId} reloadKey={reloadKey}>
      <PiMapTab characterId={characterId} />
    </PiSnapshotProvider>
  );
}

describe('PiMapTab while the colonies are re-read', () => {
  it('keeps the board for the same Character and goes pending for another', async () => {
    const { rerender } = render(<Page characterId={7} reloadKey={0} />);
    const board = await screen.findByRole('button', { name: 'full map' });
    await userEvent.click(board);
    expect(board).toHaveAttribute('aria-expanded', 'true');
    expect(mounts).toBe(1);

    rerender(<Page characterId={7} reloadKey={1} />);
    await waitFor(() => expect(builds).toBe(2));
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'full map' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(mounts).toBe(1);

    rerender(<Page characterId={8} reloadKey={1} />);
    expect(screen.queryByRole('button', { name: 'full map' })).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});
