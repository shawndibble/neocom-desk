import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { buildBookView, type BookViewInput } from '@/engine/corpTaxBook/bookView';
import { BookProvider } from './BookContext';
import { RecordPaymentDialog } from './BookDialogs';
import { paidAtFor } from './moonsFormat';
import type { BookSettings, OfficerVerdict } from '../taxBook/bookClient';

const CORP = 98000001;
const MINER = 'solo:1';

const ORE = 45490;
const day = (date: string, quantity: number) => ({
  characterId: 1,
  recordedCorporationId: CORP,
  structureId: 1001,
  date,
  oreLines: [{ typeId: ORE, quantity }],
});

function input(overrides: Partial<BookViewInput> = {}): BookViewInput {
  return {
    corporationId: CORP,
    now: '2026-10-18T14:00:00Z',
    startDate: '2026-08-01',
    graceHours: 6,
    overdueDays: 14,
    hubId: 'jita',
    oreForm: 'compressed',
    structureExpiryHours: {},
    lastSyncedAt: '2026-10-18T12:00:00Z',
    rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-08-01' }],
    entries: [day('2026-08-10', 100_000), day('2026-09-10', 60_000)],
    miners: [],
    notices: [],
    payments: [],
    dismissals: [],
    declarations: [],
    adjustments: [],
    extractions: [],
    pricesOn: () => ({ prices: new Map([[ORE, 1000]]), sources: new Map() }),
    ...overrides,
  };
}

const verdict: OfficerVerdict = {
  corporationId: CORP,
  isCeo: true,
  isDirector: false,
  isStationManager: false,
  canView: true,
  canEdit: true,
  bookActive: true,
  expiresAt: 0,
};

const edit = vi.fn();
vi.mock('../taxBook/bookClient', () => ({
  editBook: (_char: number, _corp: number, action: unknown) => {
    return Promise.resolve(edit(action) ?? {});
  },
}));

function renderDialog(
  overrides: Partial<BookViewInput> = {},
  extra: { paymentId?: string; declarationId?: string; onRecorded?: () => Promise<void> } = {}
) {
  const view = buildBookView(input(overrides));
  const miner = view.miners.find((m) => m.id === MINER)!;
  render(
    <BookProvider
      value={{
        characterId: 7,
        corporationId: CORP,
        view,
        names: {
          character: (id) => `Pilot ${id}`,
          corporation: (id) => `Corp ${id}`,
          refinery: () => 'Refinery',
          ownerRefinery: () => 'Refinery',
          moon: (id) => `Moon ${id}`,
          ore: () => 'Ore',
        },
        settings: {} as BookSettings,
        data: {} as never,
        verdict,
        reload: vi.fn(),
      }}
    >
      <RecordPaymentDialog
        open
        onClose={vi.fn()}
        miner={miner}
        minerName="Pilot 1"
        defaultAmount={miner.owed}
        {...extra}
      />
    </BookProvider>
  );
  return screen.getByRole('dialog');
}

const DONATION = {
  id: 'u1',
  characterId: 99,
  amount: 12_000_000,
  at: '2026-10-16T08:12:00Z',
  source: 'donation' as const,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-20T09:30:00Z') });
  edit.mockClear();
});
afterEach(() => vi.useRealTimers());

const outcome = (dialog: HTMLElement) =>
  within(dialog).getByRole('region', { name: 'After this payment' });

describe('RecordPaymentDialog', () => {
  it('shows which days the amount pays, oldest first, and what is left', async () => {
    const dialog = renderDialog();
    const amount = within(dialog).getByRole('textbox', { name: 'Amount' });
    await userEvent.clear(amount);
    await userEvent.type(amount, '13000000');
    const panel = outcome(dialog);
    const rows = within(panel).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent(/Day of 10 Aug.*Paid in full.*10,000,000/);
    expect(rows[1]).toHaveTextContent(/Day of 10 Sep.*Part paid, 3,000,000 left.*3,000,000/);
    expect(panel).toHaveTextContent('Pilot 1 still owes 3,000,000');
  });

  it('says what an overpayment holds as credit', async () => {
    const dialog = renderDialog();
    const amount = within(dialog).getByRole('textbox', { name: 'Amount' });
    await userEvent.clear(amount);
    await userEvent.type(amount, '20000000');
    const panel = outcome(dialog);
    expect(panel).toHaveTextContent('Pilot 1 owes nothing');
    expect(panel).toHaveTextContent('4,000,000 held as credit');
  });

  it('records the date paid, defaulting to today, and refuses a future or pre-book date', async () => {
    const dialog = renderDialog();
    const date = within(dialog).getByLabelText('Date paid (EVE time)');
    expect(date).toHaveValue('2026-10-20');
    const confirm = within(dialog).getByRole('button', { name: /^Record / });

    await userEvent.clear(date);
    await userEvent.type(date, '2026-10-21');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/after today/);
    expect(confirm).toHaveAttribute('aria-disabled', 'true');

    await userEvent.clear(date);
    await userEvent.type(date, '2026-07-31');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/book starts 1 Aug/);
    expect(confirm).toHaveAttribute('aria-disabled', 'true');

    await userEvent.clear(date);
    await userEvent.type(date, '2026-09-05');
    await userEvent.click(confirm);
    await waitFor(() => expect(edit).toHaveBeenCalled());
    expect(edit.mock.calls[0][0]).toMatchObject({
      action: 'recordPayment',
      minerId: MINER,
      amount: 16_000_000,
      at: '2026-09-05T12:00:00.000Z',
    });
  });

  it('records under a fixed id, so a retry after it landed does not record it twice (#6206)', async () => {
    const onRecorded = vi.fn(async () => {});
    edit.mockImplementationOnce(() => {
      throw Object.assign(new Error('exists'), { details: { reason: 'payment-exists' } });
    });
    const dialog = renderDialog({}, { paymentId: 'm_x1', onRecorded });
    await userEvent.click(within(dialog).getByRole('button', { name: /^Record / }));
    await waitFor(() => expect(onRecorded).toHaveBeenCalled());
    expect(edit.mock.calls[0][0]).toMatchObject({ action: 'recordPayment', paymentId: 'm_x1' });
  });

  it('confirms the declaration in the same write, by hand or by a donation match', async () => {
    const byHand = renderDialog({}, { paymentId: 'm_x1', declarationId: 'x1' });
    await userEvent.click(within(byHand).getByRole('button', { name: /^Record / }));
    await waitFor(() => expect(edit).toHaveBeenCalledTimes(1));
    expect(edit.mock.calls[0][0]).toMatchObject({
      action: 'recordPayment',
      paymentId: 'm_x1',
      declarationId: 'x1',
    });
    cleanup();
    edit.mockClear();
    const matched = renderDialog({ payments: [DONATION] }, { declarationId: 'x1' });
    await userEvent.click(within(matched).getByRole('button', { name: 'Wallet donation (1)' }));
    await userEvent.click(within(matched).getByRole('radio', { name: /12,000,000 from Pilot 99/ }));
    await userEvent.click(within(matched).getByRole('button', { name: 'Assign 12,000,000' }));
    await waitFor(() => expect(edit).toHaveBeenCalled());
    expect(edit.mock.calls).toEqual([
      [{ action: 'assignPayment', paymentId: 'u1', minerId: MINER, declarationId: 'x1' }],
    ]);
  });

  it('still fails on a clash when the id was fresh', async () => {
    const onRecorded = vi.fn(async () => {});
    edit.mockImplementationOnce(() => {
      throw Object.assign(new Error('exists'), { details: { reason: 'payment-exists' } });
    });
    const dialog = renderDialog({}, { onRecorded });
    await userEvent.click(within(dialog).getByRole('button', { name: /^Record / }));
    await waitFor(() => expect(edit).toHaveBeenCalled());
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it('says plainly when the transfer is already in the book', async () => {
    edit.mockImplementationOnce(() => {
      throw Object.assign(new Error('exists'), { details: { reason: 'transfer-in-book' } });
    });
    const dialog = renderDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: /^Record / }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /already in the book, so recording it would count it twice/
    );
  });

  it('offers no donation match when the wallet has none', () => {
    const dialog = renderDialog();
    expect(within(dialog).queryByText('Where the ISK came from')).not.toBeInTheDocument();
  });

  it('matches an Unmatched donation by assigning it, never recording new ISK', async () => {
    const dialog = renderDialog({ payments: [DONATION] });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Wallet donation (1)' }));
    expect(within(dialog).queryByRole('textbox', { name: 'Amount' })).not.toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: /^Assign / });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(within(dialog).getByRole('radio', { name: /12,000,000 from Pilot 99/ }));
    expect(outcome(dialog)).toHaveTextContent('Pilot 1 still owes 4,000,000');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign 12,000,000' }));
    await waitFor(() => expect(edit).toHaveBeenCalled());
    expect(edit.mock.calls).toEqual([
      [{ action: 'assignPayment', paymentId: 'u1', minerId: MINER }],
    ]);
  });

  it('searches the donations by pilot or amount once there are a few', async () => {
    const payments = [
      DONATION,
      { ...DONATION, id: 'u2', characterId: 98, amount: 5_500_000 },
      { ...DONATION, id: 'u3', characterId: 97, amount: 7_000_000 },
      { ...DONATION, id: 'u4', characterId: 96, amount: 1_000_000 },
    ];
    const dialog = renderDialog({ payments });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Wallet donations (4)' }));
    const search = within(dialog).getByRole('searchbox', { name: 'Find by pilot or amount' });
    await userEvent.type(search, 'Pilot 98');
    const group = within(dialog).getByRole('radiogroup', { name: 'Unmatched donations' });
    expect(within(group).getAllByRole('radio')).toHaveLength(1);
    await userEvent.clear(search);
    await userEvent.type(search, '7,000');
    expect(within(group).getByRole('radio')).toHaveAccessibleName(/7,000,000 from Pilot 97/);
  });
});

describe('paidAtFor', () => {
  it('is now for today and noon EVE time for an earlier day', () => {
    const now = new Date('2026-10-20T09:30:00Z');
    expect(paidAtFor('2026-10-20', now)).toBe('2026-10-20T09:30:00.000Z');
    expect(paidAtFor('2026-10-02', now)).toBe('2026-10-02T12:00:00.000Z');
  });
});
