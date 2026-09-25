import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import { configureClipboard } from '@/lib/clipboard';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { App } from '@/app/App';

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

const CHAR_ID = 91;
const CHAR_ID_2 = 92;
const ESI = 'https://esi.evetech.net';

async function addSecondCharacter() {
  await db.characters.put({
    characterId: CHAR_ID_2,
    name: 'Pilot Two',
    ownerHash: 'oh2',
    addedAt: 2,
  });
  await db.tokens.put({
    characterId: CHAR_ID_2,
    accessToken: 'access-token-2',
    refreshToken: 'refresh-2',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-characters.read_contacts.v1'],
  });
}

const contactsPayload = [
  { contact_id: 1001, contact_type: 'character' as const, standing: 10, is_watched: true },
  { contact_id: 1002, contact_type: 'corporation' as const, standing: 0 },
  { contact_id: 1003, contact_type: 'alliance' as const, standing: -10, is_blocked: true },
  { contact_id: 1004, contact_type: 'corporation' as const, standing: -5 },
  // Stranger Pilot is a 0-standing contact flying for Hostile Corp, which the
  // reader holds at -5 — the "a second entry of yours also covers this pilot"
  // case.
  { contact_id: 1005, contact_type: 'character' as const, standing: 0 },
];

// Good Friend flies for the signed-in pilot's own corp; Stranger Pilot flies
// for Hostile Corp, in no alliance.
const affiliationPayload = [
  { character_id: 1001, corporation_id: 2001 },
  { character_id: 1005, corporation_id: 1004 },
  { character_id: CHAR_ID, corporation_id: 2001, alliance_id: 3001 },
];

/** Every filter now sits behind the funnel (FilterBar, issue #1282). */
function openFilters() {
  fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
}

let restoreMatchMedia: (() => void) | undefined;

/** Below `md`, `FilterBar` opens a sheet whose edits are a draft until Apply. */
function useNarrowViewport(): void {
  const real = window.matchMedia;
  window.matchMedia = (media: string) =>
    ({
      media,
      matches: media === NARROW_QUERY,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  restoreMatchMedia = () => {
    window.matchMedia = real;
  };
}

const server = setupServer(
  http.get(`${ESI}/characters/${CHAR_ID}/contacts`, () => HttpResponse.json(contactsPayload)),
  http.post(`${ESI}/characters/affiliation`, () => HttpResponse.json(affiliationPayload)),
  http.post(`${ESI}/universe/names`, () =>
    HttpResponse.json([
      { id: 1001, name: 'Good Friend', category: 'character' },
      { id: 1002, name: 'Neutral Corp', category: 'corporation' },
      { id: 1003, name: 'Bad Alliance', category: 'alliance' },
      { id: 1004, name: 'Hostile Corp', category: 'corporation' },
      { id: 1005, name: 'Stranger Pilot', category: 'character' },
      { id: 2001, name: 'Home Corp', category: 'corporation' },
      { id: 3001, name: 'Home Alliance', category: 'alliance' },
    ])
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  server.resetHandlers();
  restoreMatchMedia?.();
  restoreMatchMedia = undefined;
});
beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  usePublicInfoModalStore.setState({ request: null });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-characters.read_contacts.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/contacts');
});

describe('Contacts', () => {
  it('lists contacts with resolved names, standings, and blocked/watched flags', async () => {
    render(<App />);
    expect(await screen.findByText('Good Friend')).toBeInTheDocument();
    expect(screen.getByText('Neutral Corp')).toBeInTheDocument();
    expect(screen.getByText('Bad Alliance')).toBeInTheDocument();
    // Flags are icons now; their meaning reaches a reader through the
    // accessible name, not through a word in the cell.
    expect(screen.getByRole('img', { name: 'Watched' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Blocked' })).toBeInTheDocument();
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

    const badChip = screen.getByRole('button', { name: /Bad/ });
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

  describe('across characters', () => {
    /** Pilot Two's cached list: agrees on Good Friend, has never blocked Bad Alliance. */
    async function cacheSecondCharacterContacts(contacts: unknown[]) {
      await db.esiCache.put({
        characterId: CHAR_ID_2,
        key: 'contacts',
        value: contacts,
        fetchedAt: Date.now(),
      });
    }

    it('offers no comparison when the device holds a single character', async () => {
      render(<App />);
      await screen.findByText('Good Friend');

      expect(screen.queryByRole('tab', { name: 'Across characters' })).not.toBeInTheDocument();
    });

    it('gives each tab its own path, and restores the across tab and its toggle on reload', async () => {
      await addSecondCharacter();
      await cacheSecondCharacterContacts([contactsPayload[0]]);
      render(<App />);
      await screen.findByText('Good Friend');
      // The bare page path settles on the default tab, with no defaults in the query.
      expect(window.location.pathname).toBe('/contacts/character');
      expect(window.location.search).toBe('');

      fireEvent.click(screen.getByRole('tab', { name: 'Across characters' }));
      await screen.findByRole('table', { name: /across/i });
      expect(window.location.pathname).toBe('/contacts/across');

      openFilters();
      fireEvent.click(screen.getByRole('button', { name: /Only disagreements/ }));
      expect(window.location.search).toBe('?across.disagree=1');
    });

    it('opens straight onto the across tab from its link', async () => {
      await addSecondCharacter();
      await cacheSecondCharacterContacts([contactsPayload[0]]);
      window.history.replaceState({}, '', '/contacts/across?across.disagree=1');
      render(<App />);

      const table = within(await screen.findByRole('table', { name: /across/i }));
      expect(screen.getByRole('tab', { name: 'Across characters' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(table.queryByText('2 of 2')).not.toBeInTheDocument();
      expect(table.getAllByText('1 of 2').length).toBe(4);
    });

    it('counts the characters holding each contact, and flags the ones that disagree', async () => {
      await addSecondCharacter();
      await cacheSecondCharacterContacts([contactsPayload[0]]);
      render(<App />);
      await screen.findByText('Good Friend');

      fireEvent.click(screen.getByRole('tab', { name: 'Across characters' }));

      const table = within(await screen.findByRole('table', { name: /across/i }));
      // Good Friend is on both; the other four are on the main alone.
      expect(table.getAllByText('2 of 2').length).toBe(1);
      expect(table.getAllByText('1 of 2').length).toBe(4);
    });

    // Which characters hold the contact is only in the count's tooltip, so the
    // count has to take keyboard focus to open it (WCAG 2.1.1).
    it('names the characters missing a contact when its count takes keyboard focus', async () => {
      await addSecondCharacter();
      await cacheSecondCharacterContacts([contactsPayload[0]]);
      render(<App />);
      await screen.findByText('Good Friend');

      fireEvent.click(screen.getByRole('tab', { name: 'Across characters' }));

      const table = within(await screen.findByRole('table', { name: /across/i }));
      const count = table.getAllByText('1 of 2')[0]!;
      expect(count).toHaveAttribute('tabindex', '0');
      fireEvent.focus(count);
      expect(screen.getByRole('tooltip')).toHaveTextContent('Not a contact of: Pilot Two');
    });

    it('narrows to the contacts the characters do not agree on', async () => {
      await addSecondCharacter();
      await cacheSecondCharacterContacts([contactsPayload[0]]);
      render(<App />);
      await screen.findByText('Good Friend');
      fireEvent.click(screen.getByRole('tab', { name: 'Across characters' }));
      await screen.findByRole('table', { name: /across/i });

      openFilters();
      fireEvent.click(screen.getByRole('button', { name: /Only disagreements/ }));

      const table = within(screen.getByRole('table', { name: /across/i }));
      expect(table.queryByText('2 of 2')).not.toBeInTheDocument();
      expect(table.getAllByText('1 of 2').length).toBe(4);
    });

    it('leaves "Only disagreements" undone when the narrow-viewport sheet is cancelled', async () => {
      useNarrowViewport();
      await addSecondCharacter();
      await cacheSecondCharacterContacts([contactsPayload[0]]);
      render(<App />);
      await screen.findByText('Good Friend');
      fireEvent.click(screen.getByRole('tab', { name: 'Across characters' }));
      await screen.findByRole('table', { name: /across/i });

      fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
      const sheet = await screen.findByRole('dialog');
      fireEvent.click(within(sheet).getByRole('button', { name: /Only disagreements/ }));
      fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));

      // Cancelled: this is a draft like every other control in the sheet
      // (issue #1282), so the URL never saw the toggle and every contact
      // still shows, disagreement or not.
      expect(window.location.search).not.toContain('across.disagree');
      const table = within(screen.getByRole('table', { name: /across/i }));
      expect(table.getAllByText('2 of 2').length).toBe(1);
    });

    it('shows every standing a contact was given, not one of them', async () => {
      await addSecondCharacter();
      // Pilot Two has Good Friend at -10; the main has them at +10.
      await cacheSecondCharacterContacts([{ ...contactsPayload[0], standing: -10 }]);
      render(<App />);
      await screen.findByText('Good Friend');

      fireEvent.click(screen.getByRole('tab', { name: 'Across characters' }));

      const table = within(await screen.findByRole('table', { name: /across/i }));
      expect(table.getByRole('img', { name: 'Excellent standing (10)' })).toBeInTheDocument();
      expect(table.getAllByRole('img', { name: 'Terrible standing (-10)' }).length).toBe(2);
    });

    it('offers the same row menu as the This-Character tab, resolved against the row', async () => {
      const user = userEvent.setup();
      const copied: string[] = [];
      configureClipboard(async (text) => {
        copied.push(text);
      });
      try {
        await addSecondCharacter();
        await cacheSecondCharacterContacts([contactsPayload[0]]);
        render(<App />);
        await screen.findByText('Good Friend');
        fireEvent.click(screen.getByRole('tab', { name: 'Across characters' }));
        const table = within(await screen.findByRole('table', { name: /across/i }));

        const row = table.getByText('Good Friend').closest('tr');
        if (!row) throw new Error('expected a Good Friend row');
        fireEvent.contextMenu(row);
        await user.click(screen.getByRole('menuitem', { name: 'Copy contact ID' }));
        fireEvent.contextMenu(row);
        await user.click(screen.getByRole('menuitem', { name: 'Copy name' }));

        expect(copied).toEqual(['1001', 'Good Friend']);
      } finally {
        configureClipboard(null);
      }
    });

    it('opens the shared Public Info Modal from the row menu', async () => {
      const user = userEvent.setup();
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
      await addSecondCharacter();
      await cacheSecondCharacterContacts([contactsPayload[0]]);
      render(<App />);
      await screen.findByText('Good Friend');
      fireEvent.click(screen.getByRole('tab', { name: 'Across characters' }));
      const table = within(await screen.findByRole('table', { name: /across/i }));

      const row = table.getByText('Good Friend').closest('tr');
      if (!row) throw new Error('expected a Good Friend row');
      fireEvent.contextMenu(row);
      await user.click(screen.getByRole('menuitem', { name: 'Show info' }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('tab', { name: 'Character' })).toBeInTheDocument();
    });

    it('says the comparison is built from what each character last cached', async () => {
      await addSecondCharacter();
      await cacheSecondCharacterContacts([contactsPayload[0]]);
      render(<App />);
      await screen.findByText('Good Friend');

      fireEvent.click(screen.getByRole('tab', { name: 'Across characters' }));

      expect(await screen.findByText(/last cached/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Fetch every character' })).toBeInTheDocument();
    });
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

describe('Contacts row context menu (issue #403)', () => {
  /** Right-clicks a contact row by its resolved name and returns the row. */
  async function openContactMenu(name: string) {
    const row = (await screen.findByText(name)).closest('tr');
    if (!row) throw new Error(`expected a ${name} contact row`);
    row.focus();
    fireEvent.contextMenu(row);
    return row;
  }

  it('offers Copy Name, Copy contact ID, and Show info as the only entry point to the modal', async () => {
    render(<App />);
    await openContactMenu('Good Friend');

    expect(screen.getByRole('menuitem', { name: 'Copy name' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Copy contact ID' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
  });

  it('Show info opens the shared Public Info Modal, tabbed to the contact type', async () => {
    const user = userEvent.setup();
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
    await openContactMenu('Good Friend');
    await user.click(screen.getByRole('menuitem', { name: 'Show info' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('tab', { name: 'Character' })).toBeInTheDocument();
  });
});

describe('Contacts standing filter chips (issue #403)', () => {
  it('stay visible through a manual refresh instead of disappearing', async () => {
    render(<App />);
    await screen.findByText('Good Friend');
    openFilters();

    let resolveRefresh!: () => void;
    const refreshGate = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/contacts`, async () => {
        await refreshGate;
        return HttpResponse.json(contactsPayload);
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByRole('group', { name: 'Standing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bad/ })).toBeInTheDocument();

    resolveRefresh();
    await waitFor(() => expect(screen.getByText('Good Friend')).toBeInTheDocument());
  });

  it("does not carry the outgoing character's counts onto the incoming character", async () => {
    await addSecondCharacter();
    let resolveSecondContacts!: () => void;
    const secondContactsGate = new Promise<void>((resolve) => {
      resolveSecondContacts = resolve;
    });
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID_2}/contacts`, async () => {
        await secondContactsGate;
        return HttpResponse.json([
          { contact_id: 2001, contact_type: 'character' as const, standing: 5 },
        ]);
      }),
      http.post(`${ESI}/universe/names`, () =>
        HttpResponse.json([
          { id: 1001, name: 'Good Friend', category: 'character' },
          { id: 1002, name: 'Neutral Corp', category: 'corporation' },
          { id: 1003, name: 'Bad Alliance', category: 'alliance' },
          { id: 2001, name: 'Second Pilot Friend', category: 'character' },
        ])
      )
    );

    render(<App />);
    await screen.findByText('Good Friend');
    openFilters();
    expect(screen.getByRole('group', { name: 'Standing' })).toBeInTheDocument();

    await act(async () => {
      await useActiveCharacter.getState().setActiveCharacter(CHAR_ID_2);
    });

    // The second character's contacts are still loading — the whole bar
    // (and with it the funnel this test just opened) unmounts along with the
    // first character's stale chip counts, rather than let them linger under
    // the new character.
    expect(screen.queryByRole('group', { name: 'Standing' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Filters/ })).not.toBeInTheDocument();

    resolveSecondContacts();
    expect(await screen.findByText('Second Pilot Friend')).toBeInTheDocument();
    openFilters();
    expect(screen.getByRole('group', { name: 'Standing' })).toBeInTheDocument();
  });
});

describe('Contacts standing tag (issue #403)', () => {
  it("uses the game's standing tag, and keeps the number in its accessible name", async () => {
    render(<App />);
    await screen.findByText('Good Friend');

    const goodRow = screen.getByText('Good Friend').closest('tr');
    expect(goodRow).not.toBeNull();
    expect(
      within(goodRow as HTMLElement).getByRole('img', { name: 'Excellent standing (10)' })
    ).toBeInTheDocument();
    // The bar and the printed number it replaces are both gone.
    expect(within(goodRow as HTMLElement).queryByText('10')).toBeNull();
  });

  it('tags each tier by the standing it is for', async () => {
    render(<App />);
    await screen.findByText('Good Friend');

    expect(screen.getAllByRole('img', { name: 'Neutral standing (0)' }).length).toBe(2);
    expect(screen.getByRole('img', { name: 'Terrible standing (-10)' })).toBeInTheDocument();
  });
});

describe('Contacts URL state', () => {
  it('restores the search text and sort from the URL', async () => {
    window.history.replaceState({}, '', '/contacts/character?q=corp&sort=name:asc');
    render(<App />);
    const table = within(await screen.findByRole('table', { name: 'Contacts' }));
    expect(screen.getByRole('searchbox', { name: 'Name' })).toHaveValue('corp');
    expect(table.queryByText('Good Friend')).not.toBeInTheDocument();
    expect(table.getByText('Neutral Corp')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
  });

  it('writes typed search text to the URL once typing pauses', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Good Friend');
    await user.type(screen.getByRole('searchbox', { name: 'Name' }), 'friend');
    await waitFor(() => expect(window.location.search).toBe('?q=friend'));
    expect(window.location.pathname).toBe('/contacts/character');
  });

  it('writes a header sort to the URL, and leaves the default sort out', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Good Friend');
    await user.click(screen.getByRole('button', { name: 'Name' }));
    expect(window.location.search).toBe('?sort=name%3Aasc');
  });

  it('ignores an unreadable sort and falls back to standing, best first', async () => {
    window.history.replaceState({}, '', '/contacts/character?sort=bogus:asc');
    render(<App />);
    await screen.findByText('Good Friend');
    expect(screen.getByRole('columnheader', { name: /Standing/ })).toHaveAttribute(
      'aria-sort',
      'descending'
    );
  });
});
