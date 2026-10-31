import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { App } from '@/app/App';
import {
  CHAR_ID,
  CHAR_ID_2,
  ESI,
  addSecondCharacter,
  cacheSecondCharacterContacts,
  contactsPayload,
  installContactsHarness,
  openFilters,
  server,
  showAllCharacters,
  useNarrowViewport,
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
  describe('across characters', () => {
    it('offers no comparison when the device holds a single character', async () => {
      render(<App />);
      await screen.findByText('Good Friend');

      expect(screen.queryByRole('button', { name: 'This character' })).not.toBeInTheDocument();
    });

    it('gives each tab its own path, and restores the across tab and its toggle on reload', async () => {
      await addSecondCharacter();
      await cacheSecondCharacterContacts([contactsPayload[0]]);
      render(<App />);
      await screen.findByText('Good Friend');
      // The bare page path settles on the default tab, with no defaults in the query.
      expect(window.location.pathname).toBe('/contacts/character');
      expect(window.location.search).toBe('');

      await showAllCharacters();
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
      expect(screen.getByRole('button', { name: /^All characters · 2$/ })).toBeInTheDocument();
      expect(table.queryByText('2 of 2')).not.toBeInTheDocument();
      expect(table.getAllByText('1 of 2').length).toBe(4);
    });

    it('counts the characters holding each contact, and flags the ones that disagree', async () => {
      await addSecondCharacter();
      await cacheSecondCharacterContacts([contactsPayload[0]]);
      render(<App />);
      await screen.findByText('Good Friend');

      await showAllCharacters();

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

      await showAllCharacters();

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
      await showAllCharacters();
      await screen.findByRole('table', { name: /across/i });

      openFilters();
      fireEvent.click(screen.getByRole('button', { name: /Only disagreements/ }));

      const table = within(screen.getByRole('table', { name: /across/i }));
      expect(table.queryByText('2 of 2')).not.toBeInTheDocument();
      expect(table.getAllByText('1 of 2').length).toBe(4);
    });

    it('applies "Only disagreements" from the narrow-viewport sheet as it is picked', async () => {
      useNarrowViewport();
      await addSecondCharacter();
      await cacheSecondCharacterContacts([contactsPayload[0]]);
      render(<App />);
      await screen.findByText('Good Friend');
      await showAllCharacters();
      await screen.findByRole('table', { name: /across/i });

      fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
      const sheet = await screen.findByRole('dialog');
      fireEvent.click(within(sheet).getByRole('button', { name: /Only disagreements/ }));

      // No Apply step: the toggle is in the URL while the sheet is still open.
      expect(window.location.search).toContain('across.disagree');
      const table = within(screen.getByRole('table', { name: /across/i }));
      expect(table.queryByText('2 of 2')).not.toBeInTheDocument();
    });

    it('shows every standing a contact was given, not one of them', async () => {
      await addSecondCharacter();
      // Pilot Two has Good Friend at -10; the main has them at +10.
      await cacheSecondCharacterContacts([{ ...contactsPayload[0], standing: -10 }]);
      render(<App />);
      await screen.findByText('Good Friend');

      await showAllCharacters();

      const table = within(await screen.findByRole('table', { name: /across/i }));
      expect(table.getByRole('img', { name: 'Excellent standing (10)' })).toBeInTheDocument();
      expect(table.getAllByRole('img', { name: 'Terrible standing (-10)' }).length).toBe(2);
    });

    it('says the comparison is built from what each character last cached', async () => {
      await addSecondCharacter();
      await cacheSecondCharacterContacts([contactsPayload[0]]);
      render(<App />);
      await screen.findByText('Good Friend');

      await showAllCharacters();

      expect(await screen.findByText(/last cached/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Fetch every character' })).toBeInTheDocument();
    });
  });
});

describe('Contacts keyboard access (issue #3396)', () => {
  it('makes a faction row no tab stop, while a character row stays one', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/contacts`, () =>
        HttpResponse.json([
          { contact_id: 500001, contact_type: 'faction', standing: 5 },
          contactsPayload[0],
        ])
      )
    );
    render(<App />);
    await screen.findByText('Good Friend');
    const rows = Array.from(document.querySelectorAll('main tbody tr'));
    const faction = rows.find((r) => r.getAttribute('data-row-key') === '500001');
    const character = rows.find((r) => r.getAttribute('data-row-key') === '1001');
    expect(faction).toBeDefined();
    expect(faction).not.toHaveAttribute('tabindex');
    expect(character).toHaveAttribute('tabindex', '0');
  });

  it('selects "This character" on /contacts/across with a single Character', async () => {
    window.history.pushState({}, '', '/contacts/across');
    render(<App />);
    await screen.findByText('Good Friend');
    const tab = await screen.findByRole('tab', { name: /contacts/i });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(tab).toHaveAttribute('tabindex', '0');
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
    expect(
      within(screen.getByRole('group', { name: 'Standing' })).getByRole('button', { name: /Bad/ })
    ).toBeInTheDocument();

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
