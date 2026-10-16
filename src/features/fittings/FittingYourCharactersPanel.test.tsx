import '@/i18n';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FittingYourCharactersPanel } from './FittingYourCharactersPanel';
import type { CharacterGapRow } from './useCharacterGaps';

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
  { characterId: 5, name: 'Maybe Pilot', state: 'unconfirmed' },
];

const order = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent);

describe('FittingYourCharactersPanel', () => {
  it('sorts can-fly first, shortest time next, unanswered rows last', () => {
    render(<FittingYourCharactersPanel rows={rows} />);
    expect(order()).toEqual([
      'Able Pilot',
      'Quick Pilot',
      'Slow Pilot',
      'Maybe Pilot',
      'Zed Broken',
    ]);
    expect(screen.getByText('Skills not loaded')).toBeInTheDocument();
    expect(screen.getByText("Can't confirm")).toBeInTheDocument();
  });

  it('keeps unanswered rows last when sorted descending', async () => {
    const user = userEvent.setup();
    render(<FittingYourCharactersPanel rows={rows} />);
    await user.click(screen.getByRole('button', { name: /^To train/ }));
    expect(order()).toEqual([
      'Slow Pilot',
      'Quick Pilot',
      'Able Pilot',
      'Maybe Pilot',
      'Zed Broken',
    ]);
  });

  it('filters with counts and by name; unconfirmed is neither can fly nor can not', async () => {
    const user = userEvent.setup();
    render(<FittingYourCharactersPanel rows={rows} />);
    expect(screen.getByRole('button', { name: 'All · 5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Can fly · 1' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Can't fly · 2" }));
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

  it('says why a row with no missing skills has nothing to list', async () => {
    const user = userEvent.setup();
    render(<FittingYourCharactersPanel rows={rows} />);
    await user.click(screen.getByText('Able Pilot'));
    expect(screen.getByText('Has every skill this Fitting needs.')).toBeInTheDocument();
  });
});
