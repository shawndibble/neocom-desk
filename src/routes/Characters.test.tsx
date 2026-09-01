import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import {
  OVERVIEW_GROUPS_SETTING_KEY,
  useOverviewGroups,
} from '@/features/character/overviewGroups';
import { FONT_SCALE_KEY, useFontScale } from '@/lib/fontScale';
import { Characters } from './Characters';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/features/character/removeCharacter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/character/removeCharacter')>()),
}));

const server = setupServer(
  http.get('https://esi.evetech.net/characters/:id', ({ params }) => {
    if (params.id === '91') {
      return HttpResponse.json({
        name: 'Pilot One',
        corporation_id: 1001,
        alliance_id: 2001,
        birthday: '2015-01-01T00:00:00Z',
        bloodline_id: 1,
        gender: 'female',
        race_id: 1,
      });
    }
    // Character 92: simulate offline / ESI failure.
    return HttpResponse.error();
  }),
  http.get('https://esi.evetech.net/corporations/:id', () =>
    HttpResponse.json({
      name: 'Test Corp',
      ticker: 'TC',
      ceo_id: 1,
      creator_id: 1,
      member_count: 5,
      tax_rate: 0.1,
    })
  ),
  http.get('https://esi.evetech.net/alliances/:id', () =>
    HttpResponse.json({
      name: 'Test Alliance',
      ticker: 'TA',
      creator_corporation_id: 1,
      creator_id: 1,
      date_founded: '2016-01-01T00:00:00Z',
    })
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  await db.characters.clear();
  await db.settings.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
  usePublicInfo.setState({ byCharacterId: {} });
  useOverviewGroups.setState({ value: { groups: [], updatedAt: 0 }, hydrated: false });
  useFontScale.setState({ value: 1, hydrated: false });
  await db.characters.bulkPut([
    { characterId: 91, name: 'Pilot One', ownerHash: 'oh-1', addedAt: 1 },
    { characterId: 92, name: 'Pilot Two', ownerHash: 'oh-2', addedAt: 2 },
  ]);
});

function renderCharacters() {
  return render(
    <MemoryRouter initialEntries={['/characters']}>
      <Routes>
        <Route path="/characters" element={<Characters />} />
        <Route path="/overview" element={<div>overview page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Characters', () => {
  it('renders character cards from Dexie with portraits', async () => {
    renderCharacters();
    expect(await screen.findByText('Pilot One')).toBeInTheDocument();
    expect(screen.getByText('Pilot Two')).toBeInTheDocument();
    const portrait = screen.getByAltText('Portrait of Pilot One');
    expect(portrait).toHaveAttribute(
      'src',
      'https://images.evetech.net/characters/91/portrait?size=128'
    );
  });

  it('shows corp/alliance names when public info loads, dashes when offline', async () => {
    renderCharacters();
    expect(await screen.findByText('Test Corp')).toBeInTheDocument();
    expect(screen.getByText('Test Alliance')).toBeInTheDocument();
    // Pilot Two's fetch failed: corp and alliance both fall back to a dash.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('selecting a character persists it as active and navigates to /overview', async () => {
    const user = userEvent.setup();
    renderCharacters();
    await user.click(await screen.findByRole('button', { name: 'Select Pilot One' }));

    expect(await screen.findByText('overview page')).toBeInTheDocument();
    expect(useActiveCharacter.getState().activeCharacterId).toBe(91);
    expect((await db.settings.get(ACTIVE_CHARACTER_KEY))?.value).toBe(91);
  });

  it('add character starts a new EVE login', async () => {
    const { beginEveLogin } = await import('@/app/loginFlow');
    const user = userEvent.setup();
    renderCharacters();
    await user.click(await screen.findByRole('button', { name: /add character/i }));
    expect(beginEveLogin).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state when no characters exist', async () => {
    await db.characters.clear();
    renderCharacters();
    expect(await screen.findByText(/no characters yet/i)).toBeInTheDocument();
  });

  it('creates a group, moves a character into it, and persists the grouping device-locally', async () => {
    const user = userEvent.setup();
    renderCharacters();
    await screen.findByText('Pilot One');

    await user.click(screen.getByRole('button', { name: 'New group' }));
    await user.type(screen.getByRole('textbox', { name: 'New group name' }), 'Miners{Enter}');

    expect(await screen.findByRole('heading', { name: 'Miners' })).toBeInTheDocument();

    const groupSelect = screen.getByRole('combobox', { name: 'Group for Pilot One' });
    await user.click(groupSelect);
    await user.click(await screen.findByRole('option', { name: 'Miners' }));

    await waitForSettingsValue(OVERVIEW_GROUPS_SETTING_KEY, (value) => {
      const groups = (value as { groups: { name: string; characterIds: number[] }[] }).groups;
      return (
        groups.length === 1 && groups[0].name === 'Miners' && groups[0].characterIds.includes(91)
      );
    });
  });

  it('renames and reorders groups', async () => {
    await useOverviewGroups.getState().setValue({
      groups: [
        { id: 'a', name: 'Alts', characterIds: [] },
        { id: 'b', name: 'Mains', characterIds: [] },
      ],
      updatedAt: 1,
    });
    const user = userEvent.setup();
    renderCharacters();

    await user.click(await screen.findByRole('button', { name: 'Rename group Alts' }));
    const input = screen.getByRole('textbox', { name: 'Rename group' });
    await user.clear(input);
    await user.type(input, 'Scouts{Enter}');
    expect(await screen.findByRole('heading', { name: 'Scouts' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Move Mains up' }));
    await waitForSettingsValue(OVERVIEW_GROUPS_SETTING_KEY, (value) => {
      const groups = (value as { groups: { id: string }[] }).groups;
      return groups[0]?.id === 'b';
    });
  });

  it('sorts characters by name and reverses direction', async () => {
    const user = userEvent.setup();
    renderCharacters();
    await screen.findByText('Pilot One');

    function firstCardName() {
      return screen.getAllByRole('button', { name: /^Select /i })[0]?.textContent ?? '';
    }

    await user.click(screen.getByRole('button', { name: 'Reverse sort direction' }));
    await waitFor(() => expect(firstCardName()).toContain('Pilot Two'));

    await user.click(screen.getByRole('button', { name: 'Reverse sort direction' }));
    await waitFor(() => expect(firstCardName()).toContain('Pilot One'));
  });

  it('changes density via the shared font-scale mechanism, not a second one', async () => {
    const user = userEvent.setup();
    renderCharacters();
    await screen.findByText('Pilot One');

    await user.click(screen.getByRole('button', { name: 'Spacious' }));
    await waitForSettingsValue(FONT_SCALE_KEY, (value) => value === 1.25);
    expect(useFontScale.getState().value).toBe(1.25);
  });

  it('removes a character after confirmation, deleting its Dexie rows', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderCharacters();
    await screen.findByText('Pilot One');

    await user.click(screen.getByRole('button', { name: 'Remove Pilot One' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Pilot One'));
    await waitFor(() => expect(screen.queryByText('Pilot One')).not.toBeInTheDocument());
    expect(await db.characters.get(91)).toBeUndefined();
    expect(screen.getByText('Pilot Two')).toBeInTheDocument();
  });

  it('keeps the character when the removal confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderCharacters();
    await screen.findByText('Pilot One');

    await user.click(screen.getByRole('button', { name: 'Remove Pilot One' }));

    expect(await db.characters.get(91)).toBeDefined();
    expect(screen.getByText('Pilot One')).toBeInTheDocument();
  });

  it('reassigns the active character when the removed one was active', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await useActiveCharacter.getState().setActiveCharacter(91);
    const user = userEvent.setup();
    renderCharacters();
    await screen.findByText('Pilot One');

    await user.click(screen.getByRole('button', { name: 'Remove Pilot One' }));

    await waitFor(() => expect(useActiveCharacter.getState().activeCharacterId).toBe(92));
  });

  it('alerts when the remote purge is deferred', async () => {
    const removeCharacterModule = await import('@/features/character/removeCharacter');
    vi.spyOn(removeCharacterModule, 'removeCharacter').mockResolvedValueOnce({
      remotePurged: false,
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    const user = userEvent.setup();
    renderCharacters();
    await screen.findByText('Pilot One');

    await user.click(screen.getByRole('button', { name: 'Remove Pilot One' }));

    await waitFor(() =>
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Pilot One'))
    );
  });

  it('drops a character from its group once the character no longer exists', async () => {
    await useOverviewGroups.getState().setValue({
      groups: [{ id: 'a', name: 'Alts', characterIds: [91, 999] }],
      updatedAt: 1,
    });
    renderCharacters();
    await screen.findByText('Pilot One');

    await waitForSettingsValue(OVERVIEW_GROUPS_SETTING_KEY, (value) => {
      const groups = (value as { groups: { characterIds: number[] }[] }).groups;
      return groups[0]?.characterIds.length === 1 && groups[0].characterIds[0] === 91;
    });
  });
});

async function waitForSettingsValue(
  key: string,
  predicate: (value: unknown) => boolean,
  timeoutMs = 2000
): Promise<void> {
  const start = Date.now();
  for (;;) {
    const record = await db.settings.get(key);
    if (record && predicate(record.value)) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for settings key "${key}" to match predicate`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
