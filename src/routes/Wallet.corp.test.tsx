/**
 * The Personal / Corporation switch on Wallet (issue #298).
 *
 * A separate file from `Wallet.test.tsx` on purpose: that file is the record of
 * what this page does for a Character with no corp role, and AC 1 is that they
 * see it unchanged. It stays byte-identical.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import * as download from '@/lib/download';
import { corpCacheKey } from '@/esi/cache';
import { scopesForGroup } from '@/esi/scopes';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { App } from '@/app/App';
import type { TypeMap } from '@/sde/types';

vi.mock('@/app/loginFlow', () => ({ beginEveLogin: vi.fn().mockResolvedValue(undefined) }));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

const TYPES: TypeMap = { '34': { name: 'Tritanium', groupID: 18, volume: 0.01 } };

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => TYPES),
  loadBlueprints: vi.fn(async () => ({})),
}));

const CHAR_ID = 91;
const CORP_ID = 98000001;
const BASE = 'https://esi.evetech.net';

const personalJournal = [
  {
    id: 1,
    date: '2026-08-02T00:00:00Z',
    ref_type: 'bounty_prize',
    description: 'My bounty',
    amount: 1000,
    balance: 5000,
  },
];

const corpJournalByDivision: Record<number, unknown[]> = {
  1: [
    {
      id: 11,
      date: '2026-08-03T00:00:00Z',
      ref_type: 'corporate_reward_payout',
      description: 'Master division payout',
      amount: 900,
      balance: 1000000,
    },
  ],
  2: [
    {
      id: 22,
      date: '2026-08-04T00:00:00Z',
      ref_type: 'insurance',
      description: 'SRP division payout',
      amount: 50,
      balance: 250,
    },
  ],
};

const server = setupServer(
  http.get(`${BASE}/characters/${CHAR_ID}/wallet`, () => HttpResponse.json(4500)),
  http.get(`${BASE}/characters/${CHAR_ID}/wallet/journal`, () =>
    HttpResponse.json(personalJournal)
  ),
  http.get(`${BASE}/characters/${CHAR_ID}/loyalty/points`, () => HttpResponse.json([])),
  http.post(`${BASE}/universe/names`, () => HttpResponse.json([])),
  http.get(`${BASE}/characters/${CHAR_ID}/roles`, () => HttpResponse.json({ roles: ['Director'] })),
  http.get(`${BASE}/corporations/${CORP_ID}/wallets`, () =>
    HttpResponse.json([
      { division: 2, balance: 250 },
      { division: 1, balance: 1000000 },
    ])
  ),
  http.get(`${BASE}/corporations/${CORP_ID}/divisions`, () =>
    HttpResponse.json({
      wallet: [
        { division: 1, name: 'Master Wallet' },
        { division: 2, name: 'SRP' },
      ],
    })
  ),
  http.get(`${BASE}/corporations/${CORP_ID}/wallets/:division/journal`, ({ params }) =>
    HttpResponse.json(corpJournalByDivision[Number(params.division)] ?? [])
  )
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });

  await db.characters.put({
    characterId: CHAR_ID,
    name: 'Pilot One',
    ownerHash: 'oh',
    addedAt: 1,
    corporationId: CORP_ID,
  });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: [
      'esi-wallet.read_character_wallet.v1',
      'esi-characters.read_loyalty.v1',
      ...scopesForGroup('corp'),
    ],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/wallet');
});

/** The switch, once the roles and scopes have both resolved. */
function findSwitch() {
  return screen.findByRole('group', { name: 'Wallet owner' });
}

describe('Wallet: the switch is hidden without the capability (AC 1)', () => {
  it('renders no switch for a Character with no corp role', async () => {
    server.use(http.get(`${BASE}/characters/${CHAR_ID}/roles`, () => HttpResponse.json({})));

    render(<App />);
    expect(await screen.findByText(/4,500\.00/)).toBeInTheDocument();

    expect(screen.queryByRole('group', { name: 'Wallet owner' })).toBeNull();
    expect(screen.queryByLabelText('Wallet division')).toBeNull();
    // And the page still has both of its own tabs.
    expect(screen.getByRole('tab', { name: 'Journal' })).toBeInTheDocument();
  });

  it('renders no switch for a Director who has not granted the corp scopes', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'access-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3_600_000,
      scopes: ['esi-wallet.read_character_wallet.v1'],
    });

    render(<App />);
    expect(await screen.findByText(/4,500\.00/)).toBeInTheDocument();

    expect(screen.queryByRole('group', { name: 'Wallet owner' })).toBeNull();
  });
});

describe('Wallet: the corporation side (AC 2, AC 3)', () => {
  it('shows the selected division balance, named from read_divisions', async () => {
    const user = userEvent.setup();
    render(<App />);

    await findSwitch();
    await user.click(screen.getByRole('button', { name: 'Corporation' }));

    // Scoped to the balance heading: the same name is also an <option> in the
    // division selector beside the switch.
    expect(await screen.findByText('Master Wallet', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(/1,000,000\.00/)).toBeInTheDocument();
    // The Character's own balance and EverMarks are not on the corp side.
    expect(screen.queryByText(/4,500\.00/)).toBeNull();
    expect(screen.queryByText('EverMarks')).toBeNull();
  });

  it('switches division, and the journal below follows it', async () => {
    const user = userEvent.setup();
    render(<App />);

    await findSwitch();
    await user.click(screen.getByRole('button', { name: 'Corporation' }));
    await screen.findByText(/1,000,000\.00/);

    await user.click(screen.getByRole('tab', { name: 'Journal' }));
    expect(await screen.findByText('Master division payout')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Wallet division'), '2');

    expect(await screen.findByText('SRP division payout')).toBeInTheDocument();
    expect(screen.queryByText('Master division payout')).toBeNull();
    // Still the same journal table, with the page's own columns. Scoped to
    // the table: "Insurance" also names an <option> in the ref-type filter
    // (issue #413).
    const table = screen.getByRole('table', { name: 'Journal' });
    expect(within(table).getByText('Insurance')).toBeInTheDocument();
  });

  it('does not re-page the corp journal when the tab is toggled away and back (issue #413)', async () => {
    let journalRequests = 0;
    server.use(
      http.get(`${BASE}/corporations/${CORP_ID}/wallets/:division/journal`, ({ params }) => {
        journalRequests += 1;
        return HttpResponse.json(corpJournalByDivision[Number(params.division)] ?? []);
      })
    );
    const user = userEvent.setup();
    render(<App />);

    await findSwitch();
    await user.click(screen.getByRole('button', { name: 'Corporation' }));
    await user.click(screen.getByRole('tab', { name: 'Journal' }));
    expect(await screen.findByText('Master division payout')).toBeInTheDocument();
    expect(journalRequests).toBe(1);

    await user.click(screen.getByRole('tab', { name: 'Balance' }));
    await screen.findByText('Master Wallet', { selector: 'p' });
    await user.click(screen.getByRole('tab', { name: 'Journal' }));

    expect(await screen.findByText('Master division payout')).toBeInTheDocument();
    expect(journalRequests).toBe(1);
  });

  it('names the corp journal CSV export after the division, so exporting two divisions never overwrites the same file (issue #413)', async () => {
    const spy = vi.spyOn(download, 'downloadTextFile').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<App />);

    await findSwitch();
    await user.click(screen.getByRole('button', { name: 'Corporation' }));
    await user.click(screen.getByRole('tab', { name: 'Journal' }));
    await screen.findByText('Master division payout');

    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(spy.mock.calls[0][0]).toMatch(
      /^neocom-corp-wallet-journal-master-wallet-\d{4}-\d{2}-\d{2}\.csv$/
    );

    await user.selectOptions(screen.getByLabelText('Wallet division'), '2');
    await screen.findByText('SRP division payout');

    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(spy.mock.calls[1][0]).toMatch(/^neocom-corp-wallet-journal-srp-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('shows the corporation journal, never the character one, while Corporation is selected', async () => {
    const user = userEvent.setup();
    render(<App />);

    await findSwitch();
    await user.click(screen.getByRole('tab', { name: 'Journal' }));
    expect(await screen.findByText('My bounty')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Corporation' }));

    expect(await screen.findByText('Master division payout')).toBeInTheDocument();
    expect(screen.queryByText('My bounty')).toBeNull();
  });

  it('gives the corp side its own DataAgeBadge value, not the personal one', async () => {
    const corpFetchedAt = Date.now() - 5 * 60_000;
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: corpCacheKey(CORP_ID, 'wallet:balances'),
      value: [{ division: 1, balance: 1000000 }],
      fetchedAt: corpFetchedAt,
    });
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: corpCacheKey(CORP_ID, 'divisions'),
      value: { wallet: [{ division: 1, name: 'Master Wallet' }] },
      fetchedAt: corpFetchedAt,
    });
    const user = userEvent.setup();
    const { container } = render(<App />);

    await findSwitch();
    const personalBadge = container.querySelector('section header time')?.getAttribute('dateTime');
    expect(personalBadge).not.toBe(new Date(corpFetchedAt).toISOString());

    await user.click(screen.getByRole('button', { name: 'Corporation' }));
    await screen.findByText('Master Wallet', { selector: 'p' });

    expect(container.querySelector('section header time')?.getAttribute('dateTime')).toBe(
      new Date(corpFetchedAt).toISOString()
    );
  });

  it('shows a distinct failed-load state for the corp journal, not the "no entries" empty state (issue #413)', async () => {
    server.use(
      http.get(`${BASE}/corporations/${CORP_ID}/wallets/:division/journal`, () =>
        HttpResponse.error()
      )
    );
    const user = userEvent.setup();
    render(<App />);

    await findSwitch();
    await user.click(screen.getByRole('button', { name: 'Corporation' }));
    await user.click(screen.getByRole('tab', { name: 'Journal' }));

    expect(await screen.findByText('Could not load')).toBeInTheDocument();
    expect(screen.queryByText('No corp journal entries cached')).toBeNull();
  });

  /** A 403 here is the in-game role gate; a re-login button over it would be a lie. */
  it('does not offer a re-login over the corp role gate (403)', async () => {
    server.use(
      http.get(`${BASE}/corporations/${CORP_ID}/wallets`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      ),
      http.get(`${BASE}/corporations/${CORP_ID}/divisions`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      )
    );
    const user = userEvent.setup();
    render(<App />);

    await findSwitch();
    await user.click(screen.getByRole('button', { name: 'Corporation' }));

    expect(
      await screen.findByText('No corporation wallet data cached. Reconnect to fetch it.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Log in again to see your wallet')).toBeNull();
  });

  it('keeps the division selector beside the switch, and only while Corporation is on', async () => {
    const user = userEvent.setup();
    render(<App />);

    const group = await findSwitch();
    expect(screen.queryByLabelText('Wallet division')).toBeNull();

    await user.click(within(group).getByRole('button', { name: 'Corporation' }));

    const select = await screen.findByLabelText('Wallet division');
    expect(select).toBeInTheDocument();
    expect(within(select as HTMLSelectElement).getByText('SRP')).toBeInTheDocument();

    await user.click(within(group).getByRole('button', { name: 'Personal' }));
    expect(screen.queryByLabelText('Wallet division')).toBeNull();
  });
});
