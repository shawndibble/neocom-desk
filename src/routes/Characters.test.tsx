import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import type { SkillQueueEntry } from '@/esi/endpoints';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import {
  OVERVIEW_GROUPS_SETTING_KEY,
  useOverviewGroups,
} from '@/features/character/overviewGroups';
import {
  NO_STARRED_CHARACTERS,
  STARRED_CHARACTERS_SETTING_KEY,
  useStarredCharacters,
} from '@/features/character/starredCharacters';
import { FONT_SCALE_KEY, useFontScale } from '@/lib/fontScale';
import {
  DEFAULT_VISIBLE_CHARACTER_COLUMNS,
  useCharacterViewMode,
  useVisibleCharacterColumns,
} from '@/features/character/characterColumns';
import {
  DEFAULT_SP_EXTRACTION_THRESHOLD_SP,
  useSpExtractionMonitoringEnabled,
  useSpExtractionThresholdSp,
} from '@/features/character/spExtractionSettings';
import * as rosterModule from '@/features/character/roster';
import * as rosterAttentionModule from '@/features/character/rosterAttention';
import { Characters } from './Characters';

vi.mock('@/app/loginFlow', () => ({
  beginAddCharacterLogin: vi.fn().mockResolvedValue(undefined),
}));

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
  useStarredCharacters.setState({ value: NO_STARRED_CHARACTERS, hydrated: false });
  useFontScale.setState({ value: 1, hydrated: false });
  useCharacterViewMode.setState({ value: 'card', hydrated: false });
  useVisibleCharacterColumns.setState({
    value: DEFAULT_VISIBLE_CHARACTER_COLUMNS,
    hydrated: false,
  });
  useSpExtractionMonitoringEnabled.setState({ value: false, hydrated: false });
  useSpExtractionThresholdSp.setState({
    value: DEFAULT_SP_EXTRACTION_THRESHOLD_SP,
    hydrated: false,
  });
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

  it('shows one combined data-age badge per card — the oldest of the fetched fields, not one each', async () => {
    const now = Date.now();
    // Pilot One: both fields cached, at deliberately different ages. Three
    // badges in a row (one per stat) was the actual complaint (issue: "sync
    // number listed 3 times") — the card now carries a single dot-only badge
    // for the oldest of them, "3d ago" (in its tooltip, not visible text —
    // see DataAgeBadge's `dotOnly`), not "5m ago" alongside it. Pilot Two:
    // neither ever cached — never fetched, not a scope-not-granted 0.
    await db.esiCache.put({
      characterId: 91,
      key: 'skills',
      value: { skills: [], total_sp: 12_345_000 },
      fetchedAt: now - 5 * 60_000,
    });
    await db.esiCache.put({
      characterId: 91,
      key: 'wallet:balance',
      value: 250_000_000,
      fetchedAt: now - 3 * 24 * 60 * 60_000,
    });

    renderCharacters();
    await screen.findByText('Pilot One');
    // The roster snapshot load is async (`loadRosterSnapshot`); wait for it
    // to land rather than asserting against the initial "—" render.
    await screen.findByText('12.3M');

    const pilotOneCard = screen.getByText('Pilot One').closest('li') as HTMLElement;
    expect(pilotOneCard).toHaveTextContent('12.3M');
    expect(pilotOneCard).toHaveTextContent('250M');
    const badges = pilotOneCard.querySelectorAll('time');
    expect(badges).toHaveLength(1);
    expect(badges[0].getAttribute('title')).toContain('3d ago');
    expect(badges[0].getAttribute('title')).not.toContain('5m ago');

    const pilotTwoCard = screen.getByText('Pilot Two').closest('li') as HTMLElement;
    const spChip = within(pilotTwoCard).getByText('SP').parentElement as HTMLElement;
    const walletChip = within(pilotTwoCard).getByText('Wallet').parentElement as HTMLElement;
    expect(spChip).toHaveTextContent('—');
    expect(walletChip).toHaveTextContent('—');
    // No fetchedAt at all for either field on Pilot Two — no badge, full stop.
    expect(within(pilotTwoCard).queryByText(/ago$/)).not.toBeInTheDocument();
  });

  it("shows each character's cached queue state, with the one combined data-age badge when anything was fetched", async () => {
    const now = Date.now();
    const entries: SkillQueueEntry[] = [
      {
        skill_id: 1,
        queue_position: 0,
        finished_level: 1,
        start_date: new Date(now - 60_000).toISOString(),
        finish_date: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
    await db.esiCache.put({ characterId: 91, key: 'skillqueue', value: entries, fetchedAt: now });
    // Pilot Two has no cached queue at all — never fetched.

    renderCharacters();
    await screen.findByText('Pilot One');
    await screen.findByText('Training');

    const pilotOneCard = screen.getByText('Pilot One').closest('li');
    expect(pilotOneCard).toHaveTextContent('Training');
    expect(pilotOneCard?.querySelectorAll('time')).toHaveLength(1);

    const pilotTwoCard = screen.getByText('Pilot Two').closest('li');
    expect(pilotTwoCard).toHaveTextContent('Unknown');
    expect(pilotTwoCard?.querySelector('time')).toBeNull();
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

  it('add character starts an ADD-A-CHARACTER login, not a re-auth', async () => {
    // Not `beginEveLogin`: that unions with the active Character's grant, and
    // the character arriving here is by definition somebody else (#295).
    const { beginAddCharacterLogin } = await import('@/app/loginFlow');
    const user = userEvent.setup();
    renderCharacters();
    await user.click(await screen.findByRole('button', { name: /add character/i }));
    expect(beginAddCharacterLogin).toHaveBeenCalledTimes(1);
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

  it('floats starred characters to the top without disturbing the sort under them', async () => {
    // Three, so the assertion can tell "starred first" apart from "reversed":
    // by name ascending the wall reads One, Three, Two — starring Two must
    // lift only Two and leave One before Three exactly as the sort had them.
    await db.characters.put({
      characterId: 93,
      name: 'Pilot Three',
      ownerHash: 'oh-3',
      addedAt: 3,
    });
    const user = userEvent.setup();
    renderCharacters();
    await screen.findByText('Pilot Three');

    function cardOrder() {
      return screen
        .getAllByRole('button', { name: /^Select /i })
        .map((button) => button.textContent ?? '');
    }

    // The name sort only takes hold once the async roster snapshot lands —
    // before that the wall is in characterId order, which for these three
    // happens to put Pilot One first too. Wait on the position that differs.
    await waitFor(() => expect(cardOrder()[1]).toContain('Pilot Three'));
    expect(cardOrder()[0]).toContain('Pilot One');

    await user.click(screen.getByRole('button', { name: 'Star Pilot Two' }));

    await waitFor(() => expect(cardOrder()[0]).toContain('Pilot Two'));
    expect(cardOrder()[1]).toContain('Pilot One');
    expect(cardOrder()[2]).toContain('Pilot Three');
    await waitForSettingsValue(
      STARRED_CHARACTERS_SETTING_KEY,
      (value) => Array.isArray(value) && value.length === 1 && value[0] === 92
    );

    // The same control unstars, and says so — the accessible name carries the
    // direction of the press, not just which card it sits on.
    await user.click(screen.getByRole('button', { name: 'Unstar Pilot Two' }));
    await waitFor(() => expect(cardOrder()[0]).toContain('Pilot One'));
    await waitForSettingsValue(
      STARRED_CHARACTERS_SETTING_KEY,
      (value) => Array.isArray(value) && value.length === 0
    );
  });

  it('floats a star inside its own group section rather than out of it', async () => {
    // The star raises the card where it already lives: no top-level "Starred"
    // section, so the grouping and the star never disagree about where a
    // character is. Pilot Three leads Alts; Pilot One stays down in Ungrouped.
    await db.characters.put({
      characterId: 93,
      name: 'Pilot Three',
      ownerHash: 'oh-3',
      addedAt: 3,
    });
    await useOverviewGroups.getState().setValue({
      groups: [{ id: 'a', name: 'Alts', characterIds: [92, 93] }],
      updatedAt: 1,
    });
    await useStarredCharacters.getState().setValue([93]);
    renderCharacters();

    const altsSection = (await screen.findByRole('heading', { name: 'Alts' })).closest(
      'section'
    ) as HTMLElement;
    const ungroupedSection = screen
      .getByRole('heading', { name: 'Ungrouped' })
      .closest('section') as HTMLElement;

    await waitFor(() => {
      const inAlts = within(altsSection).getAllByRole('button', { name: /^Select /i });
      expect(inAlts[0]).toHaveTextContent('Pilot Three');
      expect(inAlts[1]).toHaveTextContent('Pilot Two');
    });
    // Still in its own section, not lifted into a starred one above it.
    expect(
      within(ungroupedSection).getByRole('button', { name: 'Select Pilot One' })
    ).toBeVisible();
    expect(
      within(ungroupedSection).queryByRole('button', { name: 'Select Pilot Three' })
    ).not.toBeInTheDocument();
  });

  it('reads stars back from Dexie on load, not just within the session', async () => {
    // Seeded as a raw settings row with the store left unhydrated — the path a
    // reload actually takes. Seeding through `setValue` would apply the value
    // directly and never exercise `hydrate`.
    await db.settings.put({ key: STARRED_CHARACTERS_SETTING_KEY, value: [92] });
    renderCharacters();

    expect(await screen.findByRole('button', { name: 'Unstar Pilot Two' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const names = screen.getAllByRole('button', { name: /^Select /i });
    expect(names[0]).toHaveTextContent('Pilot Two');
  });

  it('falls back to nothing starred when the stored value is malformed', async () => {
    await db.settings.put({ key: STARRED_CHARACTERS_SETTING_KEY, value: { '92': true } });
    renderCharacters();

    // The page renders, and every card is simply unstarred — a damaged row is
    // not worth taking the roster down for.
    expect(await screen.findByRole('button', { name: 'Star Pilot One' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Star Pilot Two' })).toBeInTheDocument();
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
    const user = userEvent.setup();
    renderCharacters();
    await screen.findByText('Pilot One');

    await user.click(screen.getByRole('button', { name: 'Remove Pilot One' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove' });
    expect(dialog).toHaveTextContent('Pilot One');
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(screen.queryByText('Pilot One')).not.toBeInTheDocument());
    // Folded into waitFor rather than a bare `await db.characters.get(91)`:
    // a raw Dexie read after the DOM settles still leaves room for a
    // trailing live-query update (e.g. another mounted component reacting to
    // the same deletion) to land outside `act`.
    await waitFor(async () => expect(await db.characters.get(91)).toBeUndefined());
    expect(screen.getByText('Pilot Two')).toBeInTheDocument();
  });

  it('keeps the character when the removal confirmation is declined', async () => {
    const user = userEvent.setup();
    renderCharacters();
    await screen.findByText('Pilot One');

    await user.click(screen.getByRole('button', { name: 'Remove Pilot One' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(await db.characters.get(91)).toBeDefined();
    expect(screen.getByText('Pilot One')).toBeInTheDocument();
  });

  it('reassigns the active character when the removed one was active', async () => {
    await useActiveCharacter.getState().setActiveCharacter(91);
    const user = userEvent.setup();
    renderCharacters();
    await screen.findByText('Pilot One');

    await user.click(screen.getByRole('button', { name: 'Remove Pilot One' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(useActiveCharacter.getState().activeCharacterId).toBe(92));
  });

  it('shows a deferred-sync notice when the remote purge is deferred', async () => {
    const removeCharacterModule = await import('@/features/character/removeCharacter');
    vi.spyOn(removeCharacterModule, 'removeCharacter').mockResolvedValueOnce({
      remotePurged: false,
    });
    const user = userEvent.setup();
    renderCharacters();
    await screen.findByText('Pilot One');

    await user.click(screen.getByRole('button', { name: 'Remove Pilot One' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    const notice = await screen.findByRole('dialog', { name: 'Sync deferred' });
    expect(notice).toHaveTextContent('Pilot One');
  });

  it('filters the roster by name or corporation', async () => {
    const user = userEvent.setup();
    renderCharacters();
    await screen.findByText('Pilot One');
    // Pilot Two's public-info fetch fails (character 92 simulates offline),
    // so only Pilot One ever gets a resolved corp name to search on.
    await screen.findByText('Test Corp');

    const search = screen.getByPlaceholderText('Search by name or corporation');
    await user.type(search, 'Pilot One');
    expect(screen.getByText('Pilot One')).toBeInTheDocument();
    expect(screen.queryByText('Pilot Two')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'Test Corp');
    expect(screen.getByText('Pilot One')).toBeInTheDocument();
    expect(screen.queryByText('Pilot Two')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'no such pilot');
    expect(screen.queryByText('Pilot One')).not.toBeInTheDocument();
    expect(screen.queryByText('Pilot Two')).not.toBeInTheDocument();
    expect(screen.getByText('No characters match this search.')).toBeInTheDocument();
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

  it('drops a star once its character no longer exists', async () => {
    // Reconciled against the roster rather than hooked onto the remove button:
    // a Character can also leave this device as a sold Character, which never
    // presses that button (removeCharacter.ts's header).
    await useStarredCharacters.getState().setValue([91, 999]);
    renderCharacters();
    await screen.findByText('Pilot One');

    await waitForSettingsValue(
      STARRED_CHARACTERS_SETTING_KEY,
      (value) => Array.isArray(value) && value.length === 1 && value[0] === 91
    );
  });

  it('drops the star of a character removed from the wall', async () => {
    await useStarredCharacters.getState().setValue([91]);
    const user = userEvent.setup();
    renderCharacters();
    await screen.findByText('Pilot One');

    await user.click(screen.getByRole('button', { name: 'Remove Pilot One' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitForSettingsValue(
      STARRED_CHARACTERS_SETTING_KEY,
      (value) => Array.isArray(value) && value.length === 0
    );
  });
});

async function waitForSettingsValue(
  key: string,
  predicate: (value: unknown) => boolean,
  timeoutMs = 2000
): Promise<void> {
  // A raw setTimeout poll here would race the component's own live-query
  // subscription: the settings write lands, the component re-renders off
  // it, and nothing wraps that update in act because this loop isn't part
  // of React's test rendering. `waitFor` is — it wraps every retry.
  await waitFor(
    async () => {
      const record = await db.settings.get(key);
      expect(record && predicate(record.value)).toBe(true);
    },
    { timeout: timeoutMs }
  );
}

describe('Characters table view', () => {
  it('defaults to card view', async () => {
    renderCharacters();
    expect(await screen.findByRole('button', { name: 'Cards' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('switching to Table view renders a real table with a header row and every character as a row', async () => {
    const user = userEvent.setup();
    renderCharacters();
    await user.click(await screen.findByRole('button', { name: 'Table' }));

    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
    expect(within(table).getByText('Pilot One')).toBeInTheDocument();
    expect(within(table).getByText('Pilot Two')).toBeInTheDocument();
  });

  it('clicking a table row selects that character and navigates to /overview, same as a card', async () => {
    const user = userEvent.setup();
    renderCharacters();
    await user.click(await screen.findByRole('button', { name: 'Table' }));
    await user.click(await screen.findByText('Pilot One'));

    expect(await screen.findByText('overview page')).toBeInTheDocument();
    expect(useActiveCharacter.getState().activeCharacterId).toBe(91);
  });

  it('the Columns picker adds and removes columns from the table, and persists the choice device-locally', async () => {
    const user = userEvent.setup();
    renderCharacters();
    await user.click(await screen.findByRole('button', { name: 'Table' }));

    // Wallet isn't one of the default-visible columns.
    expect(
      within(screen.getByRole('table')).queryByRole('columnheader', { name: /wallet/i })
    ).not.toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Columns' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Wallet' }));
    // The menu stays open on purpose (multi-select — see the component's own
    // comment), and Radix marks the rest of the page aria-hidden while it's
    // open, which hides the table from every role query below. Close it
    // first, the way a real reader would before looking back at the table.
    await user.keyboard('{Escape}');

    expect(
      within(screen.getByRole('table')).getByRole('columnheader', { name: /wallet/i })
    ).toBeInTheDocument();
    await waitForSettingsValue(
      'charactersVisibleColumns',
      (value) => Array.isArray(value) && value.includes('wallet')
    );

    // Toggling it back off removes the column again.
    await user.click(await screen.findByRole('button', { name: 'Columns' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Wallet' }));
    await user.keyboard('{Escape}');
    expect(
      within(screen.getByRole('table')).queryByRole('columnheader', { name: /wallet/i })
    ).not.toBeInTheDocument();
  });

  it('the Columns picker never lets the last rendered column disappear, even when a stale spReady entry is lingering in storage', async () => {
    // Repro: enable monitoring, check spReady (on top of the defaults),
    // disable monitoring again (spReady stays in storage but stops
    // rendering), then uncheck every other column one by one. The stored
    // list still has >1 entries the whole time (spReady never leaves it),
    // so a guard on the raw stored length alone would let the last
    // *rendered* column vanish — this must block that last uncheck instead.
    await useSpExtractionMonitoringEnabled.getState().setValue(true);
    const user = userEvent.setup();
    renderCharacters();
    await user.click(await screen.findByRole('button', { name: 'Table' }));

    await user.click(await screen.findByRole('button', { name: 'Columns' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'SP ready' }));
    await user.keyboard('{Escape}');

    await useSpExtractionMonitoringEnabled.getState().setValue(false);

    for (const label of ['Alerts', 'Last synced', 'PI', 'Open jobs', 'Training']) {
      await user.click(await screen.findByRole('button', { name: 'Columns' }));
      await user.click(await screen.findByRole('menuitemcheckbox', { name: label }));
      await user.keyboard('{Escape}');
    }

    // Only "Name" is left rendering. Unchecking it too must be a no-op.
    expect(within(screen.getByRole('table')).getByText('Pilot One')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Columns' }));
    const nameItem = await screen.findByRole('menuitemcheckbox', { name: 'Name' });
    expect(nameItem).toHaveAttribute('aria-checked', 'true');
    await user.click(nameItem);
    await user.keyboard('{Escape}');

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Pilot One')).toBeInTheDocument();
  });

  it('Refresh all triggers a live pull for the whole roster, not just the active character', async () => {
    const user = userEvent.setup();
    const snapshotSpy = vi.spyOn(rosterModule, 'loadRosterSnapshot').mockResolvedValue([]);
    const attentionSpy = vi
      .spyOn(rosterAttentionModule, 'loadRosterAttention')
      .mockResolvedValue([]);

    try {
      renderCharacters();
      await user.click(await screen.findByRole('button', { name: /refresh all/i }));

      await waitFor(() => {
        expect(snapshotSpy).toHaveBeenCalledWith({ live: true });
        expect(attentionSpy).toHaveBeenCalledWith({ live: true });
      });
    } finally {
      snapshotSpy.mockRestore();
      attentionSpy.mockRestore();
    }
  });
});
