import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { db } from '@/db';
import { loadLayout } from '@/app/routeChunks';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import {
  DEFAULT_VISIBLE_CONTACTS_CHARACTER_COLUMNS,
  contactsCharacterColumnsStore,
} from '@/features/character/contactsColumns';
import {
  CHAR_ID,
  ESI,
  contactsPayload,
  installContactsHarness,
  renderContactsRoute,
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
beforeAll(async () => {
  await Promise.all([import('@/app/App'), loadLayout()]);
}, 30_000);

describe('Contacts', () => {
  it('lists contacts with resolved names, standings, and blocked/watched flags, at /contacts inside the shell', async () => {
    const { App } = await import('@/app/App');
    render(<App />);
    expect(await screen.findByText('Good Friend')).toBeInTheDocument();
    expect(screen.getByText('Neutral Corp')).toBeInTheDocument();
    expect(screen.getByText('Bad Alliance')).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Watched' })).toHaveLength(2);
    expect(screen.getAllByRole('img', { name: 'Blocked' })).toHaveLength(2);
    const rail = (await screen.findAllByRole('navigation'))[0];
    const links = await within(rail).findAllByRole('link', { name: 'Contacts' });
    expect(links.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('names contact types the way a pilot does, not the way ESI does', async () => {
    renderContactsRoute();
    await screen.findByText('Good Friend');

    const table = within(screen.getByRole('table', { name: 'Contacts' }));
    expect(table.getAllByText('Player').length).toBe(2);
    expect(table.getAllByText('Corp').length).toBe(2);
    expect(table.getByText('Alliance')).toBeInTheDocument();
    expect(screen.queryByText('character')).toBeNull();
    expect(screen.queryByText('corporation')).toBeNull();
  });

  it('collapses rows into cards at phone width, now that a row carries two entity names', async () => {
    renderContactsRoute();
    await screen.findByText('Good Friend');

    expect(screen.getByRole('table', { name: 'Contacts' })).toHaveClass('dt-stack');
  });

  it('shows where a player contact is now', async () => {
    renderContactsRoute();
    await screen.findByText('Good Friend');

    expect(await screen.findByText('Home Corp')).toBeInTheDocument();
    expect(screen.getAllByText('Hostile Corp').length).toBe(2);
  });

  it('says nothing about the affiliation of a corp or alliance contact — it is its own', async () => {
    renderContactsRoute();
    await screen.findByText('Neutral Corp');

    const table = within(screen.getByRole('table', { name: 'Contacts' }));
    expect(table.getAllByText('—').length).toBe(6);
  });

  it('badges a contact who flies for the reader\u2019s own corporation', async () => {
    renderContactsRoute();
    await screen.findByText('Good Friend');

    expect(await screen.findByRole('img', { name: 'In your corporation' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'In your alliance' })).not.toBeInTheDocument();
  });

  it("tags a pilot whose corp is separately one of the reader's contacts", async () => {
    renderContactsRoute();
    await screen.findByText('Stranger Pilot');

    const tags = await screen.findAllByRole('img', { name: 'Bad standing (-5)' });
    expect(tags.length).toBe(2);
  });

  it('filters by standing category', async () => {
    renderContactsRoute();
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
    renderContactsRoute();
    await screen.findByText('Good Friend');
    openFilters();

    const chips = screen.getByRole('group', { name: 'Standing' });
    for (const chip of within(chips).getAllByRole('button')) fireEvent.click(chip);

    expect(await screen.findByText('No contacts match the selected filters')).toBeInTheDocument();
  });

  it('offers Reset filters when the filters leave no contacts, and restores the list', async () => {
    renderContactsRoute();
    await screen.findByText('Good Friend');
    openFilters();

    const chips = screen.getByRole('group', { name: 'Standing' });
    for (const chip of within(chips).getAllByRole('button')) fireEvent.click(chip);
    await screen.findByText('No contacts match the selected filters');

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(await screen.findByText('Good Friend')).toBeInTheDocument();
  });

  it('searches contacts by name', async () => {
    renderContactsRoute();
    await screen.findByText('Good Friend');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Name' }), {
      target: { value: 'neutral' },
    });

    expect(await screen.findByText('Neutral Corp')).toBeInTheDocument();
    expect(screen.queryByText('Good Friend')).not.toBeInTheDocument();
    expect(screen.queryByText('Bad Alliance')).not.toBeInTheDocument();
  });

  it('filters by contact type', async () => {
    renderContactsRoute();
    await screen.findByText('Good Friend');
    openFilters();

    const types = screen.getByRole('group', { name: 'Type' });
    fireEvent.click(within(types).getByRole('button', { name: /Player/ }));

    expect(await screen.findByText('Neutral Corp')).toBeInTheDocument();
    expect(screen.queryByText('Good Friend')).not.toBeInTheDocument();
  });

  it('counts every contact type on its chip, zeros included', async () => {
    renderContactsRoute();
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
    renderContactsRoute();
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
    renderContactsRoute();
    expect(await screen.findByText('Showing saved data.')).toBeInTheDocument();
    expect(screen.getByText(/: log in again$/)).toBeInTheDocument();
    expect(await screen.findByText('Good Friend')).toBeInTheDocument();
  });

  it('shows the empty state when there is no data at all', async () => {
    server.use(http.get(`${ESI}/characters/${CHAR_ID}/contacts`, () => HttpResponse.error()));
    renderContactsRoute();
    expect(await screen.findByText(/contacts not loaded yet/i)).toBeInTheDocument();
  });

  it('says what fills the page when the character really has no contacts', async () => {
    server.use(http.get(`${ESI}/characters/${CHAR_ID}/contacts`, () => HttpResponse.json([])));
    renderContactsRoute();
    expect(await screen.findByText('No contacts')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Pilots, corporations and alliances you add as contacts in EVE show here, with the standing you set.'
      )
    ).toBeInTheDocument();
  });

  it('shows a re-login prompt (not a silent empty state) when the contacts scope was revoked', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/contacts`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    renderContactsRoute();
    expect(await screen.findByText(/: log in again$/)).toBeInTheDocument();
    expect(screen.queryByText(/contacts not loaded yet/i)).not.toBeInTheDocument();
  });
});

describe('Contacts Title / Score column', () => {
  const NPC_AGENT = 3_008_416;

  afterEach(async () => {
    await act(() =>
      contactsCharacterColumnsStore.getState().setValue(DEFAULT_VISIBLE_CONTACTS_CHARACTER_COLUMNS)
    );
  });

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
    renderContactsRoute();
    await screen.findByText('Good Friend');
    expect(screen.queryByRole('columnheader', { name: /Title \/ Score/ })).toBeNull();
    expect(screen.queryByText('1,240 points')).toBeNull();
    expect(ids).toEqual([]);
  });

  it('reads only player Characters once shown: no corp, alliance or NPC agent', async () => {
    const user = userEvent.setup({ delay: null });
    const ids = recordPublicReads();
    renderContactsRoute();
    await screen.findByText('Good Friend');
    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Title / Score' }));
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
    renderContactsRoute();
    await user.click(await screen.findByText('Good Friend'));

    expect(usePublicInfoModalStore.getState().request).toEqual({ kind: 'character', id: 1001 });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('tab', { name: 'Character' })).toBeInTheDocument();
  });

  it('has no More actions button or custom row menu: the row click is the one way in', async () => {
    renderContactsRoute();
    const row = (await screen.findByText('Good Friend')).closest('tr');
    if (!row) throw new Error('expected a Good Friend row');
    expect(within(row).queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
    fireEvent.contextMenu(row);

    expect(screen.queryByRole('menuitem', { name: 'Show info' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Copy contact ID' })).not.toBeInTheDocument();
  });
});
