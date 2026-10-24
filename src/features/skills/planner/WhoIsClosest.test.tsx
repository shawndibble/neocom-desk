import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CharacterRecord } from '@/db';
import type { CharacterTimingInput } from '@/engine/skills/planTimeToFinish';
import type { EngineSkill, PlanEntry } from '@/engine/types';
import { WhoIsClosest } from './WhoIsClosest';

const loadClosestInputs = vi.fn<(id: number) => Promise<CharacterTimingInput>>();
vi.mock('./closestInputs', () => ({
  loadClosestInputs: (id: number) => loadClosestInputs(id),
}));

const SKILLS = new Map<number, EngineSkill>([
  [1, { typeID: 1, name: 'A', rank: 1, primary: 'intelligence', secondary: 'memory', prereqs: [] }],
]);
const ENTRIES: PlanEntry[] = [{ skillTypeID: 1, targetLevel: 3 }];

const roster = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    characterId: i + 1,
    name: `Pilot ${i + 1}`,
  })) as unknown as CharacterRecord[];

const ready = (level: number, sp: number): CharacterTimingInput => ({
  kind: 'ready',
  trained: new Map([[1, { level, sp }]]),
  attributes: { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 },
  implants: {},
  boosters: [],
  cloneState: 'omega',
});

describe('WhoIsClosest', () => {
  beforeEach(() => loadClosestInputs.mockReset());

  it('ranks, collapses finished and unreadable Characters, and marks the owner', async () => {
    loadClosestInputs.mockImplementation(async (id) =>
      id === 1
        ? ready(0, 0)
        : id === 2
          ? ready(2, 1415)
          : id === 3
            ? ready(3, 8000)
            : { kind: 'unavailable', reason: 'skills-permission' }
    );
    render(<WhoIsClosest roster={roster(4)} ownerId={1} entries={ENTRIES} skills={SKILLS} />);
    await screen.findByText('1 Character already has this plan');
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Pilot 2');
    expect(items[1]).toHaveTextContent('Pilot 1');
    expect(items[1]).toHaveTextContent('Plan owner');
    expect(screen.queryByText('Pilot 3', { exact: false })).toBeNull();
    await userEvent.click(screen.getByText('1 unavailable'));
    expect(screen.getByText(/Pilot 4 — skills permission not granted/)).toBeInTheDocument();
  });

  it('waits to be opened with more than five Characters', async () => {
    loadClosestInputs.mockResolvedValue(ready(0, 0));
    render(<WhoIsClosest roster={roster(6)} ownerId={1} entries={ENTRIES} skills={SKILLS} />);
    expect(loadClosestInputs).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Who's closest · 6 Characters/ }));
    await waitFor(() => expect(loadClosestInputs).toHaveBeenCalledTimes(6));
    await screen.findByText('Show 1 more');
  });
});
