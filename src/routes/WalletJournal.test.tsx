import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import '@/i18n';
import { NARROW_QUERY } from '@/lib/useIsNarrow';
import { db } from '@/db';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { App } from '@/app/App';
import { loadAllCharactersJournals } from '@/features/character/walletJournalAll';
import { stubViewport } from '@/test/viewport';
import { installWalletHarness, CHAR_ID, journalPage1, server } from '@/test/walletPage';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

// Wraps the real read so a test can see what it was asked for, or make it throw.
vi.mock('@/features/character/walletJournalAll', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/character/walletJournalAll')>();
  return { ...actual, loadAllCharactersJournals: vi.fn(actual.loadAllCharactersJournals) };
});

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => ({
    '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
    '35': { name: 'Pyerite', groupID: 18, volume: 0.01 },
  })),
  loadBlueprints: vi.fn(async () => ({})),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
  loadMarketWideTrees: vi.fn(async () => ({})),
}));

installWalletHarness();

describe('Wallet', () => {
  it('keeps the Journal panel header free of a Character portrait and scope label (issue #2993)', async () => {
    window.history.pushState({}, '', '/wallet/journal');
    render(<App />);
    expect(await screen.findByRole('link', { name: /Transactions/ })).toBeInTheDocument();
    expect(screen.queryByText(/ only$/)).not.toBeInTheDocument();
  });

  it('scrolls to and pulses the journal line a wallet alert pointed at', async () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    window.history.pushState({}, '', '/wallet/journal?highlight=2');
    render(<App />);

    expect(await screen.findByText('Donation')).toBeInTheDocument();
    const pulsed = document.querySelector('[data-row-key="2"]');
    expect(pulsed?.className).toContain('row-pulse');
    // Only the line the alert was about.
    expect(document.querySelector('[data-row-key="1"]')?.className).not.toContain('row-pulse');
    expect(scrollIntoView.mock.instances).toContain(pulsed);

    // Spent on arrival, so a reload or a tab round-trip does not pulse again.
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).has('highlight')).toBe(false);
    });
    scrollIntoView.mockRestore();
  });

  it('humanizes the raw ESI ref_type into readable text', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    // Scoped to the table: the same humanized strings also populate the
    // ref-type filter's <option> list (issue #413).
    const table = await screen.findByRole('table', { name: 'Journal' });
    expect(await within(table).findByText('Bounty prize')).toBeInTheDocument();
    expect(within(table).getByText('Player donation')).toBeInTheDocument();
    expect(within(table).queryByText('bounty_prize')).not.toBeInTheDocument();
  });

  it('falls back to cached data when ESI is unreachable, showing the offline banner', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'wallet:balance',
      value: 999,
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet`, () => HttpResponse.error())
    );
    render(<App />);
    expect(await screen.findByText(/showing cached data/i)).toBeInTheDocument();
  });

  it('warns that the journal is incomplete when a page fails mid-pagination (D4)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/journal`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        if (page === '2') return new HttpResponse(null, { status: 404 });
        return HttpResponse.json(journalPage1, { headers: { 'X-Pages': '2' } });
      })
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    expect(await screen.findByText('Bounty')).toBeInTheDocument();
    expect(screen.getByText(/incomplete data/i)).toBeInTheDocument();
  });

  it('shows no truncation warning when the journal came back whole', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    expect(await screen.findByText('Bounty')).toBeInTheDocument();
    expect(screen.queryByText(/incomplete data/i)).not.toBeInTheDocument();
  });

  it('narrows the journal to rows matching the ref-type filter (issue #413)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.click(screen.getByRole('combobox', { name: 'Ref type' }));
    await user.click(await screen.findByRole('option', { name: 'Bounty prize' }));

    expect(screen.getByText('Bounty')).toBeInTheDocument();
    expect(screen.queryByText('Donation')).toBeNull();
  });

  it('breaks the journal down by ref type and filters on a row click (issue #2858)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    await user.click(screen.getByRole('button', { name: 'Where the ISK went' }));
    const breakdown = await screen.findByRole('table', { name: 'Where the ISK went' });
    const bountyRow = within(breakdown).getByText('Bounty prize').closest('tr') as HTMLElement;
    await user.click(bountyRow);
    expect(screen.queryByText('Donation')).toBeNull();
    expect(screen.getByRole('button', { name: 'Type: Bounty prize' })).toBeInTheDocument();
    // The breakdown ignores the ref-type filter, so every type is still listed.
    expect(within(breakdown).getAllByRole('row').length).toBeGreaterThan(2);

    await user.click(bountyRow);
    expect(await screen.findByText('Donation')).toBeInTheDocument();
  });

  it('shows one full-precision signed Net column in the breakdown (issues #2995, #3220)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    await user.click(screen.getByRole('button', { name: 'Where the ISK went' }));
    const breakdown = await screen.findByRole('table', { name: 'Where the ISK went' });
    const headers = within(breakdown)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual(['Ref type', 'Net']);
    const bountyRow = within(breakdown).getByText('Bounty prize').closest('tr') as HTMLElement;
    expect(bountyRow).toHaveTextContent('+1,000');
    // Single-sided ref types carry no second in/out line.
    expect(breakdown).not.toHaveTextContent(/in S+ · out/);
    // The In / Out / Net summary is a ledger: full figures, not shorthand.
    expect(screen.getAllByText('+500').length).toBeGreaterThan(0);
  });

  it('tones the filtered net total by sign (issue #1961)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.click(screen.getByRole('combobox', { name: 'Ref type' }));
    await user.click(await screen.findByRole('option', { name: 'Bounty prize' }));

    const line = (await screen.findByText('1 entry')).parentElement as HTMLElement;
    expect(within(line).getByText('+1,000')).toHaveClass('text-isk-pos');
  });

  it('narrows the journal by free text against the description (issue #413)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    await user.type(screen.getByPlaceholderText('Search description…'), 'Donation');

    expect(screen.queryByText('Bounty')).toBeNull();
    expect(screen.getByText('Donation')).toBeInTheDocument();
  });

  it('shows no filtered-count summary when no filter is active (issue #1721)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    expect(screen.queryByText(/Type: /)).toBeNull();
  });

  it('shows a filtered-count and net-total summary once a filter narrows the journal (issue #1721)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    await user.type(screen.getByPlaceholderText('Search description…'), 'Donation');

    const summary = (await screen.findByText('1 entry')).parentElement as HTMLElement;
    expect(within(summary).getByText('-500')).toHaveClass('text-isk-neg');
  });

  it('shows a filtered-empty message, not the no-data empty state, when the filter matches nothing (issue #413)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    await user.type(screen.getByPlaceholderText('Search description…'), 'nothing matches this');

    expect(await screen.findByText('No journal entries match this filter.')).toBeInTheDocument();
    expect(
      screen.getByText('Clear the search or reset the filters above to see every entry.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/try again shortly/i)).not.toBeInTheDocument();
  });

  it('offers Reset filters on the filtered-empty journal, and restores every entry', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    await screen.findByText('Bounty');

    await user.type(screen.getByPlaceholderText('Search description…'), 'nothing matches this');
    await screen.findByText('No journal entries match this filter.');

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    expect(await screen.findByText('Bounty')).toBeInTheDocument();
  });

  it('still shows the Worth panel, with a dash for net worth, when the wallet read fails and nothing is cached', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet`, () => HttpResponse.error())
    );
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Worth' })).toBeInTheDocument();
    expect(screen.getByText('Net worth', { selector: 'p' }).nextElementSibling).toHaveTextContent(
      '—'
    );
  });

  it('puts net worth, EverMarks and the series picker in one Worth panel, with no scope readout', async () => {
    render(<App />);
    const header = (await screen.findByRole('heading', { name: 'Worth' })).closest('header');
    expect(await screen.findByText('EverMarks')).toBeInTheDocument();
    expect(within(header!).getByRole('button', { name: /^Layers:/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Balance' })).toBeNull();
    expect(screen.queryByText(/ only$/)).toBeNull();
  });

  it('distinguishes a failed manual Refresh from the initial-load offline banner (UX-REVIEW #10)', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'wallet:balance',
      value: 999,
      fetchedAt: STALE_FETCHED_AT,
    });
    const user = userEvent.setup();
    render(<App />);

    // Initial load succeeds live — no banner at all yet.
    expect(await screen.findByText('EverMarks')).toBeInTheDocument();
    expect(screen.queryByText(/showing cached data/i)).not.toBeInTheDocument();

    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet`, () => HttpResponse.error())
    );
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText('Refresh failed — showing cached data')).toBeInTheDocument();
  });

  it('shows a re-login banner (not a silent offline empty state) on a 401 (BUG #3)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet`, () =>
        HttpResponse.json({ error: 'token invalid' }, { status: 401 })
      )
    );

    render(<App />);

    expect(await screen.findByRole('button', { name: /log in again/i })).toBeInTheDocument();
    expect(screen.queryByText(/no wallet data cached/i)).not.toBeInTheDocument();
    const { beginEveLogin } = await import('@/app/loginFlow');
    screen.getByRole('button', { name: /log in again/i }).click();
    expect(beginEveLogin).toHaveBeenCalled();
  });

  it('shows the re-login banner, not the empty state, when the journal scope was revoked', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/journal`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    expect(await screen.findByText('Log in again to see your wallet')).toBeInTheDocument();
    expect(screen.queryByText('No journal entries cached')).not.toBeInTheDocument();
  });

  it('shows no re-login banner when the journal loads normally', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    expect(await screen.findByText('Bounty')).toBeInTheDocument();
    expect(screen.queryByText('Log in again to see your wallet')).not.toBeInTheDocument();
  });

  it('shows the offline notice and cached rows, no banner, when the journal fails offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'wallet:journal',
      value: journalPage1,
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/wallet/journal`, () =>
        HttpResponse.error()
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('tab', { name: 'Journal' }));
    expect(await screen.findByText(/showing cached data/i)).toBeInTheDocument();
    expect(screen.queryByText('Log in again to see your wallet')).not.toBeInTheDocument();
  });

  /**
   * Narrow, so the journal's filters render in the sheet rather than the row.
   * jsdom's `matchMedia` stub never matches, which `useIsNarrow` reads as a
   * pointer viewport.
   */
  function useNarrowViewport(): () => void {
    return stubViewport(NARROW_QUERY);
  }

  it('keeps the journal date range on one row inside the mobile filter sheet', async () => {
    const restore = useNarrowViewport();
    try {
      const user = userEvent.setup();
      render(<App />);
      await user.click(await screen.findByRole('tab', { name: 'Journal' }));
      await screen.findByText('Bounty');

      // The dates are behind the trigger now, with the search box left in the row.
      expect(screen.queryByLabelText(/^From$/)).toBeNull();
      await user.click(screen.getByRole('button', { name: /^Filters/ }));

      const dialog = screen.getByRole('dialog', { name: 'Filters' });
      const dates = within(dialog)
        .getAllByDisplayValue('')
        .filter((el) => el.getAttribute('type') === 'date');
      expect(dates).toHaveLength(2);
      // `DateRangeFields`' wrapper becomes a real row here rather than the
      // `display: contents` it carries inline — which is also the only proof
      // that `useFilterSurface` resolves to the sheet from inside the modal.
      const wrapper = dates[0]!.closest('div')!;
      expect(wrapper).toBe(dates[1]!.closest('div'));
      expect(wrapper).toHaveClass('flex');
      expect(wrapper).not.toHaveClass('contents');
    } finally {
      restore();
    }
  });

  describe('journal across Characters (issue #3908)', () => {
    async function seedSecondWithJournal() {
      await db.characters.put({ characterId: 92, name: 'Pilot Two', ownerHash: 'oh2', addedAt: 2 });
      await db.tokens.put({
        characterId: 92,
        accessToken: 'access-token-b',
        refreshToken: 'refresh-b',
        expiresAt: Date.now() + 3_600_000,
        scopes: ['esi-wallet.read_character_wallet.v1'],
      });
      server.use(
        // The same entry id as Pilot One's line 1.
        http.get('https://esi.evetech.net/characters/92/wallet/journal', () =>
          HttpResponse.json(journalPage1, { headers: { 'X-Pages': '1' } })
        ),
        http.get('https://esi.evetech.net/characters/92/wallet/transactions', () =>
          HttpResponse.json([])
        )
      );
    }

    async function pickAllCharacters(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole('button', { name: 'This character' }));
      await user.click(await screen.findByRole('menuitemradio', { name: /^All characters/ }));
    }

    beforeEach(() => vi.mocked(loadAllCharactersJournals).mockClear());

    it('fans out over the picked Characters, keys rows per Character and keeps the filter in the header', async () => {
      await seedSecondWithJournal();
      window.history.pushState({}, '', '/wallet/journal');
      const user = userEvent.setup();
      render(<App />);
      await pickAllCharacters(user);

      const table = await screen.findByRole('table', { name: 'Journal' });
      await within(table).findAllByText('Pilot Two');
      expect(document.querySelector('[data-row-key="91:1"]')).toBeInTheDocument();
      expect(document.querySelector('[data-row-key="92:1"]')).toBeInTheDocument();
      expect(vi.mocked(loadAllCharactersJournals)).toHaveBeenCalledWith([
        { characterId: 91, name: 'Pilot One' },
        { characterId: 92, name: 'Pilot Two' },
      ]);
      // The picker in the page header; the panel's title bar keeps the age of the data.
      const pageHeader = screen.getByRole('heading', { level: 1 }).closest('header');
      expect(
        within(pageHeader!).getByRole('button', { name: /^All characters/ })
      ).toBeInTheDocument();
      const header = screen.getByRole('heading', { name: 'Journal' }).closest('header');
      expect(header!.textContent).toMatch(/ago|just now|now/i);
    });

    it('shows a load-failed state with Try again when the all-Characters read fails, and loads on retry', async () => {
      await seedSecondWithJournal();
      window.history.pushState({}, '', '/wallet/journal');
      vi.mocked(loadAllCharactersJournals).mockRejectedValueOnce(new Error('boom'));
      const user = userEvent.setup();
      render(<App />);
      await pickAllCharacters(user);

      await user.click(await screen.findByRole('button', { name: 'Try again' }));
      const table = await screen.findByRole('table', { name: 'Journal' });
      expect(await within(table).findAllByText('Pilot Two')).not.toHaveLength(0);
    });
  });
});
