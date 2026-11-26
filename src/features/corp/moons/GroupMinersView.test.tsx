import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { GroupMinersView, type GroupSource } from './GroupMinersDialog';

const NAMES: Record<number, string> = { 1: 'Kestrel Vane', 2: 'Tomas Reed', 3: 'Outer Rim Vane' };
const source: GroupSource = {
  status: 'ready',
  choices: [
    { id: 'c2', mainCharacterId: 2, characterIds: [2], standing: 'guest' },
    { id: 'c3', mainCharacterId: 3, characterIds: [3], standing: 'guest' },
  ],
  stored: [],
  name: (id) => NAMES[id] ?? `#${id}`,
  edit: vi.fn().mockResolvedValue({}),
  searchAs: 1,
};
const miner = { id: 'solo:1', mainCharacterId: 1, characterIds: [1] };

describe('GroupMinersView', () => {
  it('keeps the Moons wording and the standing label by default', () => {
    render(<GroupMinersView open onClose={vi.fn()} miner={miner} source={source} />);
    expect(screen.getByText(/Pick the Miners whose characters/)).toBeInTheDocument();
    expect(screen.getAllByText(/not in the corporation/)).toHaveLength(2);
  });

  it('speaks of a Player, and labels outside only what the roster lacks', async () => {
    render(
      <GroupMinersView
        open
        onClose={vi.fn()}
        miner={miner}
        source={source}
        wording="player"
        rosterIds={new Set([1, 2])}
      />
    );
    expect(screen.getByText("Add characters to Kestrel Vane's Player")).toBeInTheDocument();
    expect(screen.getByText(/Officer claim/)).toBeInTheDocument();
    expect(screen.queryByText(/Miner|Statement/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/not in the corporation/)).toHaveLength(1);
    await userEvent.click(screen.getByText(/Tomas Reed/));
    expect(screen.getByRole('button', { name: 'Add 1' })).toBeEnabled();
  });
});
