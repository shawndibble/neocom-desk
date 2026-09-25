import '@/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Fitting } from '@/engine/fittings/types';
import { CompareCanFlyByCharacter } from './CompareCanFlyByCharacter';
import { canFlyForCharacter } from './canFlyForCharacter';

const loadActivePilotProfile = vi.fn();
const fittingCanFly = vi.fn();

vi.mock('./fittingPilotProfile', () => ({
  loadActivePilotProfile: (...args: unknown[]) => loadActivePilotProfile(...args),
}));
vi.mock('./useCompareCanFly', () => ({
  fittingCanFly: (...args: unknown[]) => fittingCanFly(...args),
}));

const characters = [
  { characterId: 1, name: 'Alpha' },
  { characterId: 2, name: 'Beta' },
  { characterId: 3, name: 'Gamma' },
];

describe('CompareCanFlyByCharacter', () => {
  beforeEach(() => {
    loadActivePilotProfile.mockReset();
    fittingCanFly.mockReset();
    // The mocked profile carries its Character id as `skillLevels`, so the fake can-fly can branch on it.
    loadActivePilotProfile.mockImplementation(async (id: number) => ({ skillLevels: id }));
    fittingCanFly.mockImplementation(async (_fitting: Fitting, id: unknown) => {
      if (id === 3) throw new Error('offline');
      return id === 1;
    });
  });

  it('computes nothing until opened, then answers for every Character', async () => {
    const fitting = { name: 'Doctrine Raven' } as Fitting;
    const user = userEvent.setup();
    render(<CompareCanFlyByCharacter fitting={fitting} characters={characters} />);
    expect(loadActivePilotProfile).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'All Characters' }));

    expect(await screen.findByText('Can fly')).toBeInTheDocument();
    expect(await screen.findByText("Can't fly")).toBeInTheDocument();
    expect(await screen.findByText('Skills unknown')).toBeInTheDocument();
    expect(screen.getByText('Alpha').closest('li')).toHaveTextContent('Can fly');
    expect(screen.getByText('Beta').closest('li')).toHaveTextContent("Can't fly");
  });

  it('caches per Fitting and Character', async () => {
    const fitting = { name: 'Cached' } as Fitting;
    await canFlyForCharacter(fitting, 1);
    await canFlyForCharacter(fitting, 1);
    expect(fittingCanFly).toHaveBeenCalledTimes(1);
    await canFlyForCharacter(fitting, 2);
    expect(fittingCanFly).toHaveBeenCalledTimes(2);
  });
});
