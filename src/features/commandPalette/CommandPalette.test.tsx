import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useSingleKeyShortcuts } from '@/lib/singleKeyShortcuts';
import { NO_CORP_CAPABILITIES } from '@/engine/corpRoles';
import { CommandPaletteHost, CommandPaletteTrigger } from './CommandPaletteHost';
import { useCommandPalette } from './store';

vi.mock('@/app/useGrantedScopes', () => ({
  useGrantedScopes: () => undefined,
  useLockedRoutes: () => new Set(['/assets']),
}));
vi.mock('@/features/corp/useCorpNavVisible', () => ({ useCorpNavVisible: () => false }));
vi.mock('@/features/corp/useCorpAccess', () => ({
  useCorpAccess: () => ({ state: 'none', capabilities: NO_CORP_CAPABILITIES }),
}));
const beginAddCharacterLogin = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/app/loginFlow', () => ({ beginAddCharacterLogin }));

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/overview']}>
      <label>
        Page search
        <input />
      </label>
      <CommandPaletteTrigger presentation="rail" />
      <CommandPaletteHost />
      <Where />
    </MemoryRouter>
  );
}

beforeEach(async () => {
  await db.characters.clear();
  await db.characters.bulkPut([
    { characterId: 1, name: 'Alpha Pilot', ownerHash: 'a', addedAt: 1 },
    { characterId: 2, name: 'Beta Pilot', ownerHash: 'b', addedAt: 2 },
  ] as never);
  await useActiveCharacter.getState().setActiveCharacter(1);
});

afterEach(() => {
  act(() => useCommandPalette.getState().hide());
});

describe('CommandPalette', () => {
  it('opens on Ctrl+K from inside a text field, even with single-key shortcuts off', async () => {
    useSingleKeyShortcuts.setState({ value: false, hydrated: true });
    const user = userEvent.setup();
    renderShell();
    const pageSearch = screen.getByRole('textbox', { name: 'Page search' });
    await user.click(pageSearch);

    await user.keyboard('{Control>}k{/Control}');
    const input = await screen.findByRole('combobox', {
      name: 'Search pages, commands and characters',
    });
    expect(input).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(pageSearch).toHaveFocus();
  });

  it('opens from the visible trigger', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: /Search/ }));
    expect(await screen.findByRole('combobox')).toBeInTheDocument();
  });

  it('does not stack over another open dialog', async () => {
    const user = userEvent.setup();
    renderShell();
    const other = document.createElement('dialog');
    document.body.append(other);
    other.showModal();
    try {
      await user.keyboard('{Control>}k{/Control}');
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    } finally {
      other.close();
      other.remove();
    }
  });

  it('lists pages on an empty query as a quick navigator', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.keyboard('{Control>}k{/Control}');
    const pages = await screen.findByRole('group', { name: 'Pages' });
    expect(within(pages).getByRole('option', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Commands' })).not.toBeInTheDocument();
  });

  it('finds Industry › Opportunities for "opp" and Enter navigates there', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByRole('combobox'), 'opp');

    const pages = screen.getByRole('group', { name: 'Pages' });
    const option = within(pages).getByRole('option', { name: 'Industry › Opportunities' });
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-activedescendant', option.id);

    await user.keyboard('{Enter}');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/industry/opportunities');
  });

  it('keeps groups in a fixed order, hides empty ones, and arrows across the boundary', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.keyboard('{Control>}k{/Control}');
    // "settings" matches pages and a command, and no Character.
    await user.type(await screen.findByRole('combobox'), 'settings');

    const groups = screen
      .getAllByRole('group')
      .map((group) => group.getAttribute('aria-labelledby'));
    const names = groups.map((id) => document.getElementById(id!)!.textContent);
    expect(names).toEqual(['Pages', 'Commands']);

    const pageOptions = within(screen.getByRole('group', { name: 'Pages' })).getAllByRole('option');
    for (let i = 0; i < pageOptions.length; i++) await user.keyboard('{ArrowDown}');
    const command = within(screen.getByRole('group', { name: 'Commands' })).getAllByRole(
      'option'
    )[0];
    expect(command).toHaveAttribute('aria-selected', 'true');
    // Wraps back to the first page from the last command.
    await user.keyboard('{End}{ArrowDown}');
    expect(pageOptions[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('marks a locked page and still navigates to it', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByRole('combobox'), 'assets');
    const assets = screen.getByRole('option', { name: 'Assets, Needs a new login' });
    await user.click(assets);
    expect(screen.getByTestId('where')).toHaveTextContent('/assets');
  });

  it('switches the active Character', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByRole('combobox'), 'beta');
    const characters = await screen.findByRole('group', { name: 'Characters' });
    await user.click(within(characters).getByRole('option', { name: 'Beta Pilot' }));
    await vi.waitFor(() => expect(useActiveCharacter.getState().activeCharacterId).toBe(2));
  });

  it('runs the Add character command through the login flow', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByRole('combobox'), 'add char');
    await user.keyboard('{Enter}');
    expect(beginAddCharacterLogin).toHaveBeenCalledTimes(1);
  });
});
