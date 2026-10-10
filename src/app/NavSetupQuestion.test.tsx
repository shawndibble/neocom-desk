import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { NavSetupQuestion } from './NavSetupQuestion';
import { useHiddenNav, useNavSetupAnswered } from './navPreferences';
import { defaultHiddenNav } from './navRail';

beforeEach(() => {
  useActiveCharacter.setState({ activeCharacterId: 1, hydrated: true });
  useHiddenNav.setState({ value: defaultHiddenNav(), hydrated: true });
  useNavSetupAnswered.setState({ value: false, hydrated: true });
});

describe('NavSetupQuestion', () => {
  it('asks once and shows the pages the picked activities need', async () => {
    const user = userEvent.setup();
    render(<NavSetupQuestion />);

    await user.click(await screen.findByRole('checkbox', { name: 'Mining' }));
    await user.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => expect(useNavSetupAnswered.getState().value).toBe(true));
    expect(useHiddenNav.getState().value).not.toContain('/mining');
    expect(useHiddenNav.getState().value).toContain('/planetary-industry');
    expect(screen.queryByText('What do you do in EVE?')).not.toBeInTheDocument();
  });

  it('keeps the default set when skipped', async () => {
    const user = userEvent.setup();
    render(<NavSetupQuestion />);
    await user.click(await screen.findByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(useNavSetupAnswered.getState().value).toBe(true));
    expect(useHiddenNav.getState().value).toEqual(defaultHiddenNav());
  });

  it.each([
    ['already answered', () => useNavSetupAnswered.setState({ value: true })],
    ['not yet read from disk', () => useNavSetupAnswered.setState({ hydrated: false })],
    ['no pilot signed in', () => useActiveCharacter.setState({ activeCharacterId: null })],
  ])('stays closed when %s', (_name, arrange) => {
    arrange();
    render(<NavSetupQuestion />);
    expect(screen.queryByText('What do you do in EVE?')).not.toBeInTheDocument();
  });
});
