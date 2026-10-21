import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { buildBookView, type BookViewInput } from '@/engine/corpTaxBook/bookView';
import type { MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import type { ObservedMiningEntry } from '@/engine/corpTaxBook/types';
import type { BookData, BookFeeder, BookSettings, OfficerVerdict } from '../taxBook/bookClient';
import { BookProvider } from './BookContext';
import { InviteMoonOwnerDialog } from './InviteMoonOwnerDialog';
import { MoonOwnerDetail } from './MoonOwnerDetail';
import { MoonOwnersTab } from './MoonOwnersTab';
import { MoonOwnersTable } from './MoonOwnersTable';

const setFeederRate = vi.fn();
const setFeederMode = vi.fn();
const createFeederInvite = vi.fn();
const listFeederInvites = vi.fn();
const revokeFeederInvite = vi.fn();
vi.mock('../taxBook/feederClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../taxBook/feederClient')>()),
  setFeederRate: (...a: unknown[]) => setFeederRate(...a),
  setFeederMode: (...a: unknown[]) => setFeederMode(...a),
  createFeederInvite: (...a: unknown[]) => createFeederInvite(...a),
  listFeederInvites: (...a: unknown[]) => listFeederInvites(...a),
  revokeFeederInvite: (...a: unknown[]) => revokeFeederInvite(...a),
}));

const BOOK = 98000000;
const ASH = 98000001;
const CIN = 98000002;
const ORE = 45490;

const row = (over: Partial<MoonOwnerRow>): MoonOwnerRow => ({
  id: '1',
  corporationId: 1,
  status: 'active',
  refineryCount: 1,
  mined: 0,
  owed: 0,
  balance: { kind: 'none', isk: 0 },
  mode: 'normal',
  ...over,
});

const ROWS = [
  row({ id: '1', corporationId: 1, mined: 300, theirRatePct: 5, minerRatePct: 12, owed: 30 }),
  row({ id: '2', corporationId: 2, mined: 100, theirRatePct: 9, minerRatePct: 8, owed: 90 }),
  row({ id: '3', corporationId: 3, mined: 200, theirRatePct: 7, minerRatePct: 10, owed: 60 }),
];
const TOTALS = { owed: 180, paidThisMonth: 40, count: 3, needALook: 1 };
const NAME = (id: number) => `Corp ${id}`;

/** Corporation names in the order the table lists them. */
function order() {
  const table = screen.getByRole('table', { name: 'Moon owners' });
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((r) => /Corp \d/.exec(r.textContent ?? '')?.[0]);
}

describe('MoonOwnersTable', () => {
  it('sorts on every numeric column and offers no Pay button yet', async () => {
    render(
      <MoonOwnersTable
        rows={ROWS}
        totals={TOTALS}
        name={NAME}
        now={Date.parse('2026-10-20T12:00:00Z')}
        onOpen={() => {}}
      />
    );
    expect(screen.queryByRole('button', { name: /^Pay/ })).toBeNull();
    const sort = async (header: string, expected: string[]) => {
      const button = screen.getByRole('button', { name: new RegExp(header) });
      await userEvent.click(button);
      // A first click sorts one way; the second flips it. Either way one of the two is the ascending order.
      const first = order();
      if (JSON.stringify(first) !== JSON.stringify(expected)) await userEvent.click(button);
      expect(order()).toEqual(expected);
    };
    await sort('Mined', ['Corp 2', 'Corp 3', 'Corp 1']);
    await sort('Their rate', ['Corp 1', 'Corp 3', 'Corp 2']);
    await sort('Miner rate', ['Corp 2', 'Corp 3', 'Corp 1']);
    await sort('Owed to them', ['Corp 1', 'Corp 3', 'Corp 2']);
  });

  it('opens a moon owner when its row is clicked', async () => {
    const onOpen = vi.fn();
    render(<MoonOwnersTable rows={ROWS} totals={TOTALS} name={NAME} now={0} onOpen={onOpen} />);
    await userEvent.click(screen.getByText('Corp 2'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: '2' }));
  });

  it('shows the header chips', () => {
    render(<MoonOwnersTable rows={ROWS} totals={TOTALS} name={NAME} now={0} onOpen={() => {}} />);
    expect(screen.getByText('Owed to moon owners')).toBeInTheDocument();
    expect(screen.getByText('Paid out this month')).toBeInTheDocument();
    expect(screen.getByText('Need a look')).toBeInTheDocument();
  });
});

const verdict: OfficerVerdict = {
  corporationId: BOOK,
  isCeo: false,
  isDirector: false,
  isStationManager: false,
  canView: true,
  canEdit: true,
  bookActive: true,
  expiresAt: 0,
};

const mined = (
  source: number,
  characterId: number,
  date: string,
  quantity: number
): ObservedMiningEntry => ({
  characterId,
  recordedCorporationId: source,
  sourceCorporationId: source,
  structureId: 1000 + (source % 10),
  date,
  oreLines: [{ typeId: ORE, quantity }],
});

const feeder = (corporationId: number, over: Partial<BookFeeder> = {}): BookFeeder => ({
  corporationId,
  status: 'active',
  mode: 'normal',
  invitedBy: 7,
  joinedAt: Date.parse('2026-10-01T10:00:00Z'),
  lastReadWellAt: '2026-10-20T06:00:00Z',
  coveragePeriods: [{ from: '2026-10-01' }],
  payouts: [],
  ...over,
});

function renderBook(ui: ReactElement, feeders: BookFeeder[], path = '/corp/moons/moon-owners') {
  const input: BookViewInput = {
    corporationId: BOOK,
    now: '2026-10-20T12:00:00Z',
    startDate: '2026-10-01',
    graceHours: 6,
    minimumStatement: 0,
    overdueDays: 14,
    cadence: { kind: 'monthly' },
    hubId: 'jita',
    oreForm: 'compressed',
    structureExpiryHours: {},
    lastSyncedAt: '2026-10-20T06:00:00Z',
    rates: [{ scope: 'corp', pct: 12, effectiveFrom: '2026-10-01' }],
    entries: [mined(ASH, 1, '2026-10-05', 1000), mined(CIN, 2, '2026-10-05', 500)],
    feeders,
    miners: [],
    statements: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [],
    extractions: [],
    paidStatementIds: new Set(),
    pricesOn: () => ({ prices: new Map([[ORE, 100]]), sources: new Map() }),
  };
  const reload = vi.fn();
  render(
    <MemoryRouter initialEntries={[path]}>
      <BookProvider
        value={{
          characterId: 7,
          corporationId: BOOK,
          view: buildBookView(input),
          names: {
            character: (id) => `Pilot ${id}`,
            corporation: (id) => (id === ASH ? 'Ashfall Mining' : 'Cinder Reach'),
            refinery: (id) => `Refinery ${id}`,
            moon: (id) => `Moon ${id}`,
            ore: () => 'Zeolites',
          },
          settings: {
            graceHours: 6,
            rates: input.rates as BookSettings['rates'],
          } as BookSettings,
          data: { feeders, state: { extractions: [] } } as unknown as BookData,
          verdict,
          reload,
        }}
      >
        {ui}
      </BookProvider>
    </MemoryRouter>
  );
  return { reload };
}

beforeEach(() => {
  setFeederRate.mockReset().mockResolvedValue({ ok: true });
  setFeederMode.mockReset().mockResolvedValue({ ok: true });
  createFeederInvite.mockReset().mockResolvedValue({ code: 'abcdefghij', inviteId: 'inv1' });
  listFeederInvites.mockReset().mockResolvedValue([]);
  revokeFeederInvite.mockReset().mockResolvedValue({ revoked: true });
});

describe('MoonOwnersTab', () => {
  it('lists each moon owner with what is owed to it', () => {
    renderBook(<MoonOwnersTab />, [
      feeder(ASH, { agreedRatePct: 8 }),
      feeder(CIN, { staleSince: Date.parse('2026-10-11T09:12:00Z') }),
    ]);
    const table = screen.getByRole('table', { name: 'Moon owners' });
    expect(within(table).getByText('Ashfall Mining')).toBeInTheDocument();
    expect(within(table).getByText('Active')).toBeInTheDocument();
    expect(within(table).getByText("Can't read ledger")).toBeInTheDocument();
    // 1000 ore at 100 ISK, 8%: whole ISK.
    expect(within(table).getByText(/8,000/)).toBeInTheDocument();
  });

  it('says so when the book has no moon owners', () => {
    renderBook(<MoonOwnersTab />, []);
    expect(screen.getByText('No moon owners yet')).toBeInTheDocument();
  });
});

describe('MoonOwnerDetail', () => {
  it('shows their rate beside the miner rate and the margin', () => {
    renderBook(
      <MoonOwnerDetail id={String(ASH)} />,
      [feeder(ASH, { requestedRatePct: 6, agreedRatePct: 8 })],
      `/corp/moons/moon-owners/${ASH}`
    );
    expect(screen.getByText('8%')).toBeInTheDocument();
    expect(screen.getByText('12%')).toBeInTheDocument();
    expect(screen.getByText('4%')).toBeInTheDocument();
    expect(screen.getByText('They asked for 6%. Yours stands.')).toBeInTheDocument();
  });

  it('sets the rate through the callable and reloads', async () => {
    const { reload } = renderBook(
      <MoonOwnerDetail id={String(ASH)} />,
      [feeder(ASH, { agreedRatePct: 8 })],
      `/corp/moons/moon-owners/${ASH}`
    );
    await userEvent.click(screen.getByRole('button', { name: 'Set rate…' }));
    const field = screen.getByLabelText('Rate (%)');
    await userEvent.clear(field);
    await userEvent.type(field, '9');
    await userEvent.click(screen.getByRole('button', { name: 'Set rate' }));
    expect(setFeederRate).toHaveBeenCalledWith(7, BOOK, ASH, 9);
    expect(reload).toHaveBeenCalled();
  });

  it('refuses a rate outside 0 to 100', async () => {
    renderBook(
      <MoonOwnerDetail id={String(ASH)} />,
      [feeder(ASH, { agreedRatePct: 8 })],
      `/corp/moons/moon-owners/${ASH}`
    );
    await userEvent.click(screen.getByRole('button', { name: 'Set rate…' }));
    const field = screen.getByLabelText('Rate (%)');
    await userEvent.clear(field);
    await userEvent.type(field, '101');
    expect(screen.getByRole('button', { name: 'Set rate' })).toBeDisabled();
  });

  it('settles otherwise with a note', async () => {
    renderBook(
      <MoonOwnerDetail id={String(ASH)} />,
      [feeder(ASH, { agreedRatePct: 8 })],
      `/corp/moons/moon-owners/${ASH}`
    );
    await userEvent.click(screen.getByRole('button', { name: 'Settled otherwise…' }));
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.type(screen.getByLabelText('Note (optional)'), 'Fuel');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(setFeederMode).toHaveBeenCalledWith(7, BOOK, ASH, 'settled-otherwise', 'Fuel');
  });

  it('shows the stale warning with the date', () => {
    renderBook(
      <MoonOwnerDetail id={String(ASH)} />,
      [feeder(ASH, { agreedRatePct: 8, staleSince: Date.parse('2026-10-11T09:12:00Z') })],
      `/corp/moons/moon-owners/${ASH}`
    );
    expect(screen.getByText(/Can't read their ledger since 11 Oct/)).toBeInTheDocument();
  });

  it('says so for a corporation that is not a moon owner', () => {
    renderBook(<MoonOwnerDetail id="5" />, [feeder(ASH)], '/corp/moons/moon-owners/5');
    expect(screen.getByText('That moon owner is not in this book')).toBeInTheDocument();
  });
});

describe('InviteMoonOwnerDialog', () => {
  const open = () =>
    render(
      <InviteMoonOwnerDialog
        characterId={7}
        corporationId={BOOK}
        characterName={(id) => `Pilot ${id}`}
        onClose={() => {}}
      />
    );

  it('makes a link, optionally offering a rate, and shows it', async () => {
    open();
    await userEvent.type(screen.getByLabelText('Rate to offer (%), optional'), '8');
    await userEvent.click(screen.getByRole('button', { name: 'Make a link' }));
    expect(createFeederInvite).toHaveBeenCalledWith(7, BOOK, 8);
    expect(await screen.findByDisplayValue(/invite=abcdefghij/)).toBeInTheDocument();
  });

  it('lists open links and revokes one', async () => {
    listFeederInvites.mockResolvedValue([
      { inviteId: 'inv9', createdBy: 7, createdAt: Date.parse('2026-10-18T10:00:00Z') },
    ]);
    open();
    await userEvent.click(
      await screen.findByRole('button', { name: /Revoke the link made 18 Oct/ })
    );
    expect(revokeFeederInvite).toHaveBeenCalledWith(7, BOOK, 'inv9');
  });
});
