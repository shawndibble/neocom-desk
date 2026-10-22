import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { SCOPE_GROUPS } from '@/esi/registry';
import { scopesForGroup } from '@/esi/scopes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { seedCharacter, seedGrant } from '@/test/seed';
import { CharacterSwitcher } from './CharacterSwitcher';

const TOTAL = SCOPE_GROUPS.length;

async function seed(id: number, name: string, n: number) {
  await seedCharacter(id, name, { addedAt: id });
  await seedGrant(
    id,
    SCOPE_GROUPS.slice(0, n).flatMap((group) => [...scopesForGroup(group)])
  );
}

function Where() {
  const { pathname } = useLocation();
  return <output data-testid="where">{pathname}</output>;
}

function show(onNavigate?: () => void) {
  render(
    <MemoryRouter initialEntries={['/overview']}>
      <CharacterSwitcher onNavigate={onNavigate} />
      <Where />
    </MemoryRouter>
  );
}

beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await seed(1, 'Aria', TOTAL);
  await seed(2, 'Kestrel', 3);
  await seed(3, 'Marsha', 1);
  useActiveCharacter.setState({ activeCharacterId: 2, hydrated: true });
});

describe('CharacterSwitcher', () => {
  it('lists every Character with its count, marking the active one', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Characters' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /^Aria/ })).toHaveTextContent(
      `${TOTAL} of ${TOTAL}`
    );
    expect(within(dialog).getByRole('button', { name: /^Kestrel/ })).toHaveAttribute(
      'aria-current',
      'true'
    );
    expect(within(dialog).getByRole('button', { name: /^Marsha/ })).toHaveTextContent(
      `1 of ${TOTAL}`
    );
  });

  it('switches Character on a row press and stays on the page', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Characters' }));
    await userEvent.click(await screen.findByRole('button', { name: /^Aria/ }));
    await waitFor(() => expect(useActiveCharacter.getState().activeCharacterId).toBe(1));
    expect(screen.getByTestId('where')).toHaveTextContent('/overview');
  });

  it('offers Fix… only on a Character with missing Permissions, which switches and opens Permissions', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Characters' }));
    expect(screen.queryByRole('button', { name: 'Fix permissions for Aria' })).toBeNull();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Fix permissions for Marsha' })
    );
    await waitFor(() => expect(useActiveCharacter.getState().activeCharacterId).toBe(3));
    // The navigation follows the switch by a tick.
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent('/settings/permissions')
    );
  });

  it('tells a host sheet to close when Fix… or Manage characters leaves the page', async () => {
    const onNavigate = vi.fn();
    show(onNavigate);
    await userEvent.click(await screen.findByRole('button', { name: 'Characters' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Fix permissions for Marsha' })
    );
    await waitFor(() => expect(onNavigate).toHaveBeenCalledTimes(1));
    await userEvent.click(await screen.findByRole('button', { name: 'Characters' }));
    await userEvent.click(await screen.findByRole('link', { name: 'Manage characters' }));
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it('links to the Characters page', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Characters' }));
    expect(await screen.findByRole('link', { name: 'Manage characters' })).toHaveAttribute(
      'href',
      '/characters'
    );
  });

  it('renders nothing for a single Character', async () => {
    await db.characters.delete(1);
    await db.characters.delete(3);
    const { container } = render(
      <MemoryRouter>
        <CharacterSwitcher />
      </MemoryRouter>
    );
    await waitFor(() => expect(db.characters.count()).resolves.toBe(1));
    expect(container).toBeEmptyDOMElement();
  });
});
