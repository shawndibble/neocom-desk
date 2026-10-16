import '@/i18n';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FittingYourCharactersPanel } from './FittingYourCharactersPanel';
import { canFlyHeadline, type CharacterGapRow } from './useCharacterGaps';

const names = new Map([
  [1, 'Gunnery'],
  [2, 'Hull Upgrades'],
]);
const ready = (
  characterId: number,
  name: string,
  totalSeconds: number,
  skills: { skillTypeID: number; seconds: number }[] = []
): CharacterGapRow => ({
  characterId,
  name,
  state: 'ready',
  gap: {
    missingCount: skills.length,
    totalSeconds,
    names,
    skills: skills.map((s) => ({ ...s, targetLevel: 4, direct: true })),
  },
});
const rows: CharacterGapRow[] = [
  { characterId: 9, name: 'Zed Broken', state: 'unloaded' },
  ready(2, 'Slow Pilot', 3 * 86_400, [{ skillTypeID: 1, seconds: 3 * 86_400 }]),
  ready(3, 'Able Pilot', 0),
  ready(4, 'Quick Pilot', 3_600, [{ skillTypeID: 2, seconds: 3_600 }]),
];

const order = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent);

describe('FittingYourCharactersPanel', () => {
  it('sorts can-fly first, shortest time next, unloaded last', () => {
    render(<FittingYourCharactersPanel rows={rows} />);
    expect(order()).toEqual(['Able Pilot', 'Quick Pilot', 'Slow Pilot', 'Zed Broken']);
    expect(screen.getByText('Skills not loaded')).toBeInTheDocument();
  });

  it('filters with counts and by name', async () => {
    const user = userEvent.setup();
    render(<FittingYourCharactersPanel rows={rows} />);
    expect(screen.getByRole('button', { name: /^All/ })).toHaveTextContent('4');
    expect(screen.getByRole('button', { name: /^Can fly/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /^Can't fly/ })).toHaveTextContent('2');
    await user.click(screen.getByRole('button', { name: /^Can't fly/ }));
    expect(order()).toEqual(['Quick Pilot', 'Slow Pilot']);
    await user.click(screen.getByRole('button', { name: /^All/ }));
    await user.type(screen.getByRole('searchbox', { name: 'Search Characters' }), 'quick');
    expect(order()).toEqual(['Quick Pilot']);
  });

  it('opens a row in place to list missing skills with their time', async () => {
    const user = userEvent.setup();
    render(<FittingYourCharactersPanel rows={rows} />);
    await user.click(screen.getByText('Quick Pilot'));
    expect(screen.getByText(/Hull Upgrades IV/)).toBeInTheDocument();
    expect(screen.getAllByText('1h 0m')).toHaveLength(2);
  });
});

describe('canFlyHeadline', () => {
  it('counts Characters who can fly, and waits for pending ones', () => {
    expect(canFlyHeadline(rows)).toEqual({ canFly: 1, total: 4 });
    expect(canFlyHeadline([...rows, { characterId: 5, name: 'X', state: 'pending' }])).toBeNull();
  });
});
