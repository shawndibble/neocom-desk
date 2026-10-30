import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { db } from '@/db';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import { App } from '@/app/App';
import {
  DEFAULT_VISIBLE_CONTACTS_CHARACTER_COLUMNS,
  contactsCharacterColumnsStore,
} from '@/features/character/contactsColumns';
import {
  CHAR_ID,
  ESI,
  contactsPayload,
  installContactsHarness,
  openFilters,
  server,
} from '@/test/contactsPage';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

installContactsHarness();

describe('Contacts', () => {
  it('lists contacts with resolved names, standings, and blocked/watched flags', async () => {
    render(<App />);
    expect(await screen.findByText('Good Friend')).toBeInTheDocument();
    expect(screen.getByText('Neutral Corp')).toBeInTheDocument();
    expect(screen.getByText('Bad Alliance')).toBeInTheDocument();
    // Flags are icons now; their meaning reaches a reader through the
    // accessible name, not through a word in the cell. Each is rendered twice
    // — beside the name for the phone card, in the Flags column for the table
    // — and CSS shows exactly one (jsdom applies no CSS, so both are here).
    expect(screen.getAllByRole('img', { name: 'Watched' })).toHaveLength(2);
    expect(screen.getAllByRole('img', { name: 'Blocked' })).toHaveLength(2);
  });

  it('names contact types the way a pilot does, not the way ESI does', async () => {
    render(<App />);
    await screen.findByText('Good Friend');

    // Scoped to the table: the same words label the type filter chips above it.
    const table = within(screen.getByRole('table', { name: 'Contacts' }));
    expect(table.getAllByText('Player').length).toBe(2);
    expect(table.getAllByText('Corp').length).toBe(2);
    expect(table.getByText('Alliance')).toBeInTheDocument();
    expect(screen.queryByText('character')).toBeNull();
    expect(screen.queryByText('corporation')).toBeNull();
  });

  it('collapses rows into cards at phone width, now that a row carries two entity names', async () => {
    render(<App />);
    await screen.findByText('Good Friend');

    // `.dt-stack` is the below-`sm` collapse. The Corp / Alliance column
    // prints names too long to squeeze into a 390px row — see
    // docs/context/decisions/20260912-210929-*.
    expect(screen.getByRole('table', { name: 'Contacts' })).toHaveClass('dt-stack');
  });

  it('shows where a player contact is now', async () => {
    render(<App />);
    await screen.findByText('Good Friend');

    // Good Friend's corp, which the contact row itself never names.
    expect(await screen.findByText('Home Corp')).toBeInTheDocument();
    // Hostile Corp twice: its own contact row, and Stranger Pilot's corp line.
    expect(screen.getAllByText('Hostile Corp').length).toBe(2);
  });

  it('says nothing about the affiliation of a corp or alliance contact — it is its own', async () => {
    render(<App />);
    await screen.findByText('Neutral Corp');

    const table = within(screen.getByRole('table', { name: 'Contacts' }));
    // Three from this column (Neutral Corp, Bad Alliance, Hostile Corp), and
    // three more from Flags, which draws the same dash for an unflagged row.
    expect(table.getAllByText('—').length).toBe(6);
  });

  it('badges a contact who flies for the reader\u2019s own corporation', async () => {
    render(<App />);
    await screen.findByText('Good Friend');

    expect(await screen.findByRole('img', { name: 'In your corporation' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'In your alliance' })).not.toBeInTheDocument();
  });

  it("tags a pilot whose corp is separately one of the reader's contacts", async () => {
    render(<App />);
    await screen.findByText('Stranger Pilot');

    // Stranger Pilot is 0 personally; Neutral Corp, which they fly for, is a
    // contact too. The tag sits against the corp, not in the Standing column.
    // Twice: Hostile Corp's own row, and the tag on Stranger Pilot's corp line.
    const tags = await screen.findAllByRole('img', { name: 'Bad standing (-5)' });
    expect(tags.length).toBe(2);
  });

  it('filters by standing category', async () => {
    render(<App />);
    await screen.findByText('Good Friend');
    openFilters();

    const badChip = within(screen.getByRole('group', { name: 'Standing' })).getByRole('button', {
      name: /Bad/,
    });
    fireEvent.click(badChip);

    expect(await screen.findByText('Good Friend')).toBeInTheDocument();
    expect(screen.queryByText('Bad Alliance')).not.toBeInTheDocument();
  });

  it('points at the filters when they leave no contacts', async () => {
    render(<App />);
    await screen.findByText('Good Friend');
    openFilters();

    const chips = screen.getByRole('group', { name: 'Standing' });
    for (const chip of within(chips).getAllByRole('button')) fireEvent.click(chip);

    expect(await screen.findByText('No contacts match the selected filters')).toBeInTheDocument();
    expect(screen.getByText('Widen the filters above to see contacts.')).toBeInTheDocument();
  });

  it('offers Reset filters when the filters leave no contacts, and restores the list', async () => {
    render(<App />);
    await screen.findByText('Good Friend');
    openFilters();

    const chips = screen.getByRole('group', { name: 'Standing' });
    for (const chip of within(chips).getAllByRole('button')) fireEvent.click(chip);
    await screen.findByText('No contacts match the selected filters');

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(await screen.findByText('Good Friend')).toBeInTheDocument();
  });

  it('searches contacts by name', async () => {
    render(<App />);
    await screen.findByText('Good Friend');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Name' }), {
      target: { value: 'neutral' },
    });

    expect(await screen.findByText('Neutral Corp')).toBeInTheDocument();
    expect(screen.queryByText('Good Friend')).not.toBeInTheDocument();
    expect(screen.queryByText('Bad Alliance')).not.toBeInTheDocument();
  });

  it('filters by contact type', async () => {
    render(<App />);
    await screen.findByText('Good Friend');
    openFilters();

    const types = screen.getByRole('group', { name: 'Type' });
    fireEvent.click(within(types).getByRole('button', { name: /Player/ }));

    expect(await screen.findByText('Neutral Corp')).toBeInTheDocument();
    expect(screen.queryByText('Good Friend')).not.toBeInTheDocument();
  });

  it('counts every contact type on its chip, zeros included', async () => {
    render(<App />);
    await screen.findByText('Good Friend');
    openFilters();

    const types = within(screen.getByRole('group', { name: 'Type' }));
    expect(types.getByRole('button', { name: /Player/ })).toHaveTextContent('2');
    expect(types.getByRole('button', { name: /Faction/ })).toHaveTextContent('0');
  });

  it('falls back to cached contacts offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'contacts',
      value: contactsPayload,
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(http.get(`${ESI}/characters/${CHAR_ID}/contacts`, () => HttpResponse.error()));
    render(<App />);
    expect(await screen.findByText('Good Friend')).toBeInTheDocument();
    expect(screen.getByText(/showing cached data/i)).toBeInTheDocument();
  });

  it('keeps the saved contacts on screen, with a small log-in note, when the contacts grant lapsed over them', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'contacts',
      value: contactsPayload,
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/contacts`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText('Log in again to refresh.')).toBeInTheDocument();
    expect(screen.queryByText('Log in again to see your contacts')).not.toBeInTheDocument();
    expect(await screen.findByText('Good Friend')).toBeInTheDocument();
  });

  it('shows the empty state when there is no data at all', async () => {
    server.use(http.get(`${ESI}/characters/${CHAR_ID}/contacts`, () => HttpResponse.error()));
    render(<App />);
    expect(await screen.findByText(/no contacts cached/i)).toBeInTheDocument();
  });

  it('shows a re-login prompt (not a silent empty state) when the contacts scope was revoked', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/contacts`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText('Log in again to see your contacts')).toBeInTheDocument();
    expect(screen.queryByText(/no contacts cached/i)).not.toBeInTheDocument();
  });
});

describe('Contacts Title / Score column', () => {
  const NPC_AGENT = 3_008_416;

  // Device-local and module-scoped: put the default back even when a test fails midway.
  afterEach(async () => {
    await act(() =>
      contactsCharacterColumnsStore.getState().setValue(DEFAULT_VISIBLE_CONTACTS_CHARACTER_COLUMNS)
    );
  });

  /** Records every public-record read; each answers with a score, no title. */
  function recordPublicReads(): number[] {
    const ids: number[] = [];
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/contacts`, () =>
        HttpResponse.json([
          ...contactsPayload,
          { contact_id: NPC_AGENT, contact_type: 'character', standing: 5 },
        ])
      ),
      http.get(`${ESI}/characters/:id`, ({ params }) => {
        ids.push(Number(params.id));
        return HttpResponse.json({
          name: 'Someone',
          corporation_id: 2001,
          birthday: '2020-01-01T00:00:00Z',
          bloodline_id: 1,
          gender: 'male',
          race_id: 1,
          achievement_score: 1240,
        });
      })
    );
    return ids;
  }

  it('is off by default, and reads no public record while off', async () => {
    const ids = recordPublicReads();
    render(<App />);
    await screen.findByText('Good Friend');
    expect(screen.queryByRole('columnheader', { name: /Title \/ Score/ })).toBeNull();
    expect(screen.queryByText('1,240 points')).toBeNull();
    expect(ids).toEqual([]);
  });

  it('reads only player Characters once shown: no corp, alliance or NPC agent', async () => {
    const user = userEvent.setup({ delay: null });
    const ids = recordPublicReads();
    render(<App />);
    await screen.findByText('Good Friend');
    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Title / Score' }));
    // The picker stays open for another pick; close it so the table is back in reach.
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('columnheader', { name: /Title \/ Score/ })).toBeInTheDocument();
    expect(await screen.findAllByText('1,240 points')).toHaveLength(2);
    expect([...ids].sort((a, b) => a - b)).toEqual([1001, 1005]);
  });
});

describe('Contacts row click', () => {
  it('opens the shared Public Info Modal on the clicked contact', async () => {
    const user = userEvent.setup({ delay: null });
    server.use(
      http.get(`${ESI}/characters/1001`, () =>
        HttpResponse.json({
          name: 'Good Friend',
          birthday: '2020-01-01T00:00:00Z',
          bloodline_id: 1,
          gender: 'male',
          race_id: 1,
          security_status: 1.5,
        })
      )
    );
    render(<App />);
    await user.click(await screen.findByText('Good Friend'));

    expect(usePublicInfoModalStore.getState().request).toEqual({ kind: 'character', id: 1001 });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('tab', { name: 'Character' })).toBeInTheDocument();
  });

  it('has no More actions button or custom row menu: the row click is the one way in', async () => {
    render(<App />);
    const row = (await screen.findByText('Good Friend')).closest('tr');
    if (!row) throw new Error('expected a Good Friend row');
    expect(within(row).queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
    fireEvent.contextMenu(row);

    // Right-click may still offer the table's own Export; never Copy / Show info.
    expect(screen.queryByRole('menuitem', { name: 'Show info' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Copy contact ID' })).not.toBeInTheDocument();
  });
});
