/**
 * A refresh re-reads the Character's colonies while the advice is recomputed:
 * the Map keeps the board mounted (its open full map, ticks and tier survive)
 * instead of falling back to the spinner. Another Character still waits.
 */
import { useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { GoalPlannerSnapshot } from '../goalPlannerSnapshot';
import type { PlanAdviceInput } from '../planAdvice/types';
import { buildPlanAdvice } from '../planAdviceModel';
import { adviceInput, snapshot } from './mapFixtures.testutil';

// Every read is a new snapshot object, as a real re-read is.
vi.mock('../goalPlannerSnapshot', () => ({
  loadGoalPlannerSnapshot: async () => ({
    ...snapshot('lean'),
    systemNames: new Map(),
    planetNames: new Map(),
    customsOverrides: {},
  }),
}));

// The inputs for the snapshot handed in: one input object per snapshot, as the real hook memoizes.
const inputOf = new WeakMap<object, PlanAdviceInput>();
vi.mock('../usePiAdviceInputs', () => ({
  usePiAdviceInputs: (s: GoalPlannerSnapshot | null) => {
    if (!s) return { status: 'loading' };
    let input = inputOf.get(s);
    if (!input) inputOf.set(s, (input = { ...adviceInput('lean'), snapshot: s }));
    return { status: 'ready', prices: {}, hubName: 'Jita', input };
  },
}));

// The worker answers the first build, then every recompute stays on its way.
let builds = 0;
vi.mock('../planAdviceService', () => ({
  PlanAdviceWorkerUnavailable: class extends Error {},
  planAdviceWorkerAvailable: () => true,
  peekPlanAdvice: () => null,
  askPlanAdvice: (input: PlanAdviceInput) =>
    ++builds === 1 ? Promise.resolve(buildPlanAdvice(input)) : new Promise(() => {}),
}));

// A board with its own local state, like the phone's open full map.
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

    // The page's refresh: a new snapshot for the same Character, its advice still on its way.
    rerender(<Page characterId={7} reloadKey={1} />);
    await waitFor(() => expect(builds).toBe(2));
    await act(async () => {});
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
