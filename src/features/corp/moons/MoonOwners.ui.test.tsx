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
const recordFeederPayout = vi.fn();
const markFeederPayout = vi.fn();
vi.mock('../taxBook/feederClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../taxBook/feederClient')>()),
  setFeederRate: (...a: unknown[]) => setFeederRate(...a),
  setFeederMode: (...a: unknown[]) => setFeederMode(...a),
  createFeederInvite: (...a: unknown[]) => createFeederInvite(...a),
  listFeederInvites: (...a: unknown[]) => listFeederInvites(...a),
  revokeFeederInvite: (...a: unknown[]) => revokeFeederInvite(...a),
  recordFeederPayout: (...a: unknown[]) => recordFeederPayout(...a),
  markFeederPayout: (...a: unknown[]) => markFeederPayout(...a),
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
  it('sorts on every numeric column and offers no Pay button without a payer', async () => {
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

function renderBook(
  ui: ReactElement,
  feeders: BookFeeder[],
  path = '/corp/moons/moon-owners',
  over: Partial<BookViewInput> = {}
) {
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
    ...over,
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
            ownerRefinery: (id) => `Refinery ${id}`,
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
  recordFeederPayout.mockReset().mockResolvedValue({ id: 'new' });
  markFeederPayout.mockReset().mockResolvedValue({ ok: true });
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

  it("owes what the moon owner's own page shows: its prices, not the miner line's (#4621)", () => {
    renderBook(<MoonOwnersTab />, [feeder(ASH, { agreedRatePct: 8 })], '/corp/moons/moon-owners', {
      moonOwnerPricesOn: () => new Map([[ORE, 50]]),
    });
    const table = screen.getByRole('table', { name: 'Moon owners' });
    // 1000 ore at the page's 50 ISK, 8%: 4,000, not the miner line's 8,000.
    expect(within(table).getByText(/4,000/)).toBeInTheDocument();
    expect(within(table).queryByText(/8,000/)).toBeNull();
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
    await userEvent.click(screen.getByRole('button', { name: 'Set rate' }));
    const field = screen.getByLabelText('Rate (%)');
    await userEvent.clear(field);
    await userEvent.type(field, '9');
    await userEvent.click(screen.getAllByRole('button', { name: 'Set rate' }).at(-1)!);
    expect(setFeederRate).toHaveBeenCalledWith(7, BOOK, ASH, 9);
    expect(reload).toHaveBeenCalled();
  });

  it('refuses a rate outside 0 to 100', async () => {
    renderBook(
      <MoonOwnerDetail id={String(ASH)} />,
      [feeder(ASH, { agreedRatePct: 8 })],
      `/corp/moons/moon-owners/${ASH}`
    );
    await userEvent.click(screen.getByRole('button', { name: 'Set rate' }));
    const field = screen.getByLabelText('Rate (%)');
    await userEvent.clear(field);
    await userEvent.type(field, '101');
    expect(screen.getAllByRole('button', { name: 'Set rate' }).at(-1)).toBeDisabled();
  });

  it('settles otherwise with a note', async () => {
    renderBook(
      <MoonOwnerDetail id={String(ASH)} />,
      [feeder(ASH, { agreedRatePct: 8 })],
      `/corp/moons/moon-owners/${ASH}`
    );
    await userEvent.click(screen.getByRole('button', { name: 'Settled otherwise' }));
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

const paid = (id: string, amount: number, over: Partial<BookFeeder['payouts'][number]> = {}) => ({
  id,
  date: '2026-10-10',
  amount,
  method: 'donation' as const,
  status: 'matched' as const,
  notAPayout: false,
  ...over,
});

describe('Paying a moon owner', () => {
  it('lists the pay list by what is owed and offers Pay only where something is', async () => {
    renderBook(<MoonOwnersTab />, [
      // 1000 ore at 100 ISK: 8% is 8,000 less 7,000 paid = 1,000 owed.
      feeder(ASH, { agreedRatePct: 8, payouts: [paid('a', 7000)] }),
      // 500 ore at 100 ISK, 4%: 2,000 owed, so it leads.
      feeder(CIN, { agreedRatePct: 4 }),
    ]);
    const table = screen.getByRole('table', { name: 'Moon owners' });
    const names = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => /Ashfall Mining|Cinder Reach/.exec(r.textContent ?? '')?.[0]);
    expect(names).toEqual(['Cinder Reach', 'Ashfall Mining']);
    expect(within(table).getAllByRole('button', { name: /^Pay / })).toHaveLength(2);
  });

  it('has no Pay for a moon owner with no rate or settled otherwise', () => {
    renderBook(<MoonOwnersTab />, [
      feeder(ASH),
      feeder(CIN, {
        agreedRatePct: 4,
        mode: 'settled-otherwise',
        modeChanges: [{ from: '2026-10-01', mode: 'settled-otherwise' }],
      }),
    ]);
    expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull();
  });

  it('records the whole balance from the table row without opening the page', async () => {
    const { reload } = renderBook(<MoonOwnersTab />, [feeder(ASH, { agreedRatePct: 8 })]);
    await userEvent.click(screen.getByRole('button', { name: 'Pay Ashfall Mining' }));
    const dialog = screen.getByRole('dialog', { name: 'Pay Ashfall Mining' });
    expect(within(dialog).getByText('8,000 ISK')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Moon mining payout, 2026-10-05 to 2026-10-05')
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/Owed to them 8,000 → 0\./)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: "I've sent it" }));
    expect(recordFeederPayout).toHaveBeenCalledWith(7, BOOK, ASH, {
      amount: 8000,
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      method: 'donation',
    });
    expect(reload).toHaveBeenCalled();
  });

  it('never says the rate or margin in the reason, nor feeder or collector anywhere', async () => {
    renderBook(<MoonOwnersTab />, [feeder(ASH, { agreedRatePct: 8 })]);
    await userEvent.click(screen.getByRole('button', { name: 'Pay Ashfall Mining' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).not.toMatch(/8%|margin|feeder|collector/i);
  });

  it('records a different amount and shows what is left', async () => {
    renderBook(<MoonOwnersTab />, [feeder(ASH, { agreedRatePct: 8 })]);
    await userEvent.click(screen.getByRole('button', { name: 'Pay Ashfall Mining' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sent a different amount?' }));
    await userEvent.type(within(dialog).getByLabelText('Amount you sent'), '3000');
    expect(within(dialog).getByText(/Owed to them 8,000 → 5,000\./)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: "I've sent it" }));
    expect(recordFeederPayout).toHaveBeenCalledWith(
      7,
      BOOK,
      ASH,
      expect.objectContaining({ amount: 3000 })
    );
  });

  it('shows an overpayment as credit', async () => {
    renderBook(<MoonOwnersTab />, [feeder(ASH, { agreedRatePct: 8 })]);
    await userEvent.click(screen.getByRole('button', { name: 'Pay Ashfall Mining' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sent a different amount?' }));
    await userEvent.type(within(dialog).getByLabelText('Amount you sent'), '9000');
    expect(within(dialog).getByText(/→ credit of 1,000\./)).toBeInTheDocument();
  });

  it('adds a payment by hand from the moon owner page', async () => {
    renderBook(
      <MoonOwnerDetail id={String(ASH)} />,
      [feeder(ASH, { agreedRatePct: 8 })],
      `/corp/moons/moon-owners/${ASH}`
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add a payment' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: "I've sent it" })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Amount you sent'), '1234');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Other' }));
    await userEvent.click(within(dialog).getByRole('button', { name: "I've sent it" }));
    expect(recordFeederPayout).toHaveBeenCalledWith(
      7,
      BOOK,
      ASH,
      expect.objectContaining({ amount: 1234, method: 'other' })
    );
  });

  it('pays from the moon owner page too', async () => {
    renderBook(
      <MoonOwnerDetail id={String(ASH)} />,
      [feeder(ASH, { agreedRatePct: 8 })],
      `/corp/moons/moon-owners/${ASH}`
    );
    await userEvent.click(screen.getByRole('button', { name: 'Pay' }));
    await userEvent.click(screen.getByRole('button', { name: "I've sent it" }));
    expect(recordFeederPayout).toHaveBeenCalledWith(
      7,
      BOOK,
      ASH,
      expect.objectContaining({ amount: 8000 })
    );
  });

  it('marks a detected payment not a payout, and counts it again', async () => {
    renderBook(
      <MoonOwnerDetail id={String(ASH)} />,
      [
        feeder(ASH, {
          agreedRatePct: 8,
          payouts: [paid('p1', 1000), paid('p2', 500, { notAPayout: true })],
        }),
      ],
      `/corp/moons/moon-owners/${ASH}`
    );
    await userEvent.click(screen.getByRole('button', { name: 'Not a payout' }));
    expect(markFeederPayout).toHaveBeenCalledWith(7, BOOK, ASH, 'p1', true);
    await userEvent.click(screen.getByRole('button', { name: 'Count it' }));
    expect(markFeederPayout).toHaveBeenCalledWith(7, BOOK, ASH, 'p2', false);
  });
});
