import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { VerifyPayload } from '@/engine/corpTaxBook/verifyView';
import { configureClipboard } from '@/lib/clipboard';
import { VerifyPage } from './VerifyPage';

const renderPage = () =>
  render(
    <MemoryRouter>
      <VerifyPage token="tok" />
    </MemoryRouter>
  );

const api = vi.hoisted(() => ({
  read: vi.fn(),
  stop: vi.fn(),
  confirm: vi.fn(),
  decline: vi.fn(),
  login: vi.fn(),
  tracked: [] as number[],
}));
vi.mock('./groupingApi', () => ({
  confirmPendingInCorporation: api.confirm,
  declineByVerifyLink: api.decline,
}));
vi.mock('@/app/loginFlow', () => ({ beginCustomizedAddCharacterLogin: api.login }));
vi.mock('@/db', () => ({
  db: {
    characters: {
      toArray: () => Promise.resolve(api.tracked.map((characterId) => ({ characterId }))),
      count: () => Promise.resolve(api.tracked.length),
    },
  },
}));
vi.mock('@/features/character/names', () => ({
  resolveNames: vi.fn().mockResolvedValue(new Map([[61, 'Quiet Alt']])),
}));
vi.mock('./verifyApi', () => ({
  readVerifyNotice: api.read,
  setVerifyRemindersStopped: api.stop,
}));
vi.mock('@/esi/endpoints/corp', () => ({
  getCorporationPublicInfo: vi.fn().mockResolvedValue({ data: { name: 'Brass Meridian' } }),
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: vi.fn().mockResolvedValue(
    new Map([
      [45490, 'Zeolites'],
      [45491, 'Jaspet'],
    ])
  ),
}));

function payload(over: Partial<VerifyPayload> = {}): VerifyPayload {
  return {
    corporationId: 98000001,
    statement: {
      id: 's1',
      code: 'BRML-7Q4K',
      issuedAt: '2026-09-01T00:00:00.000Z',
      amount: 8_000_000,
      hubId: 'jita',
      oreForm: 'compressed',
      refineryNames: { '77': 'Efa V - Moon 3' },
      lines: [
        {
          kind: 'mined',
          date: '2026-08-13',
          structureId: 77,
          oreLines: [{ typeId: 45490, quantity: 70_200 }],
          unitPrices: { '45490': 12.5 },
          priceSources: { '45490': 'saved' },
          taxPct: 15,
          rateEffectiveFrom: '2026-08-01',
          estimatedValue: 53_333_333,
          tax: 8_000_000,
        },
      ],
    },
    terms: { overdueDays: 14 },
    declarations: [],
    remindersStopped: false,
    accountClosed: false,
    pendingCharacterIds: [],
    ...over,
  };
}

beforeEach(() => {
  api.read.mockReset();
  api.stop.mockReset();
  api.confirm.mockReset().mockResolvedValue(undefined);
  api.decline.mockReset().mockResolvedValue(undefined);
  api.login.mockReset().mockResolvedValue(undefined);
  api.tracked = [];
});

describe('VerifyPage', () => {
  it('shows each line the notice asked for, with its pricing and the rate', async () => {
    api.read.mockResolvedValue(payload());
    renderPage();
    expect(await screen.findByText(/Zeolites × 70,200/)).toBeInTheDocument();
    expect(screen.getByText('Efa V - Moon 3')).toBeInTheDocument();
    expect(screen.getByText('15%')).toBeInTheDocument();
    expect(screen.getByText(/15%, effective Aug 1, 2026/)).toBeInTheDocument();
    expect(screen.getAllByText(/priced on the day mined/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/days after issue/)).not.toBeInTheDocument();
    expect(screen.getByText('BRML-7Q4K')).toBeInTheDocument();
    expect(await screen.findByText('Brass Meridian')).toBeInTheDocument();
    expect(screen.queryByText(/Donate/)).not.toBeInTheDocument();
  });

  it("copies the corporation and the reason code for EVE's transfer window", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    configureClipboard(write);
    api.read.mockResolvedValue(payload());
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Copy Reason' }));
    expect(write).toHaveBeenCalledWith('BRML-7Q4K');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Copy To' }));
    expect(write).toHaveBeenCalledWith('Brass Meridian');
    configureClipboard(null);
  });

  it('names the Account the book reads donations from (#6204)', async () => {
    api.read.mockResolvedValue(
      payload({
        terms: {
          overdueDays: 14,
          divisions: [1, 3],
          divisionNames: { '3': 'MOON TAXES' },
        },
      })
    );
    renderPage();
    expect(
      await screen.findByText(/Choose this wallet division in EVE's transfer window/)
    ).toBeInTheDocument();
    expect(screen.getByText('Master Wallet, MOON TAXES')).toBeInTheDocument();
  });

  it('names no wallet when the book reads only the Master Wallet', async () => {
    api.read.mockResolvedValue(payload({ terms: { overdueDays: 14, divisions: [1] } }));
    renderPage();
    expect(await screen.findByText('Reason')).toBeInTheDocument();
    expect(screen.queryByText('Wallet')).not.toBeInTheDocument();
  });

  it('puts each ore of a day on its own sub-row beside its own price, with the day once', async () => {
    const base = payload();
    const line = base.statement.lines[0]!;
    api.read.mockResolvedValue(
      payload({
        statement: {
          ...base.statement,
          lines: [
            {
              ...line,
              structureId: undefined,
              oreLines: [
                { typeId: 45490, quantity: 100 },
                { typeId: 45491, quantity: 200 },
              ],
              unitPrices: { '45490': 12.5, '45491': 30 },
              priceSources: { '45490': 'saved', '45491': 'saved' },
            },
          ],
        },
      })
    );
    renderPage();
    const zeo = (await screen.findByText(/Zeolites × 100/)).closest('li')!;
    expect(zeo).toHaveTextContent('12.50 ISK');
    expect(zeo).not.toHaveTextContent('30.00 ISK');
    const jas = screen.getByText(/Jaspet × 200/).closest('li')!;
    expect(jas).toHaveTextContent('30.00 ISK');
    const day = zeo.parentElement!.closest('li')!;
    expect(day.textContent).not.toMatch(/·\s*·/);
    expect(day.textContent?.match(/Aug 13, 2026/g)).toHaveLength(1);
  });

  it('names a day once when two lines bill it, with its refinery on the line below (#5310)', async () => {
    const base = payload();
    const line = base.statement.lines[0]!;
    api.read.mockResolvedValue(
      payload({
        statement: {
          ...base.statement,
          lines: [
            { ...line, structureId: 77, tax: 1_000_000 },
            { ...line, kind: 'late-ore', structureId: 77, tax: 500_000 },
          ],
        },
      })
    );
    renderPage();
    const list = await screen.findByRole('list', { name: /late notice lines/i });
    const days = list.querySelectorAll(':scope > li');
    expect(days).toHaveLength(1);
    expect(days[0]!.textContent?.match(/Aug 13, 2026/g)).toHaveLength(1);
    expect(days[0]!.textContent?.match(/Efa V - Moon 3/g)).toHaveLength(1);
    expect(days[0]).toHaveTextContent('1,500,000 ISK');
  });

  it('on a running account shows everything owed now beside the notice', async () => {
    api.read.mockResolvedValue(
      payload({
        account: {
          owed: 12_345_678,
          days: 3,
          oldest: '2026-10-02',
          paidThrough: '2026-10-01',
          asOf: '2026-10-20T10:00:00Z',
        },
      })
    );
    renderPage();
    expect(await screen.findByText('Owed now')).toBeInTheDocument();
    expect(screen.getByText('12,345,678 ISK')).toBeInTheDocument();
    expect(screen.getByText(/3 days owed, oldest/)).toBeInTheDocument();
  });

  it('reads a late notice by the account: no balance of its own, no payments of its own', async () => {
    api.read.mockResolvedValue(
      payload({
        account: {
          owed: 5,
          days: 1,
          oldest: '2026-10-02',
          paidThrough: null,
          asOf: '2026-10-20T10:00:00Z',
        },
      })
    );
    renderPage();
    expect(await screen.findByText('Owed now')).toBeInTheDocument();
    expect(screen.queryByText('Balance due')).not.toBeInTheDocument();
    expect(screen.getByText(/links the payment to you/)).toBeInTheDocument();
  });

  it('lists only the days still owed, one line each, and opens a day to its ore', async () => {
    const base = payload();
    api.read.mockResolvedValue(
      payload({
        account: {
          owed: 3_000_000,
          days: 2,
          oldest: '2026-08-13',
          paidThrough: null,
          asOf: '2026-10-20T10:00:00Z',
          unpaidDays: [
            { date: '2026-08-13', owed: 1_000_000, tax: 2_000_000 },
            { date: '2026-08-27', owed: 2_000_000, tax: 2_000_000 },
          ],
        },
        ledger: {
          days: [
            { date: '2026-08-13', tax: 500_000 },
            { date: '2026-08-14', tax: 2_000_000 },
          ],
          payments: [
            { id: 'p1', at: '2026-08-20T10:00:00Z', amount: 1_000_000, source: 'donation' },
          ],
        },
        statement: base.statement,
      })
    );
    renderPage();
    const list = await screen.findByRole('list', { name: 'Still owed' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('of 2,000,000 ISK')).toBeInTheDocument();
    // A day's ore stays folded until it is opened; the Statement's lines are not listed whole.
    expect(screen.queryByText(/Zeolites ×/)).not.toBeInTheDocument();
    expect(screen.queryByText('What you mined')).not.toBeInTheDocument();
    // Only the day whose ore the notice lists opens; Aug 27 was mined since and is a plain line.
    expect(within(list).getAllByRole('button')).toHaveLength(1);
    await userEvent.click(within(list).getByRole('button', { name: /Aug 13, 2026/ }));
    expect(await screen.findByText(/Zeolites × 70,200/)).toBeInTheDocument();
  });

  it('keeps the ledger closed until asked, then lists days and payments newest first', async () => {
    api.read.mockResolvedValue(
      payload({
        account: {
          owed: 2_000_000,
          days: 1,
          oldest: '2026-08-27',
          paidThrough: null,
          asOf: '2026-10-20T10:00:00Z',
          unpaidDays: [{ date: '2026-08-27', owed: 2_000_000, tax: 2_000_000 }],
        },
        ledger: {
          days: [{ date: '2026-08-13', tax: 500_000 }],
          payments: [
            { id: 'p1', at: '2026-08-20T10:00:00Z', amount: 1_000_000, source: 'donation' },
          ],
        },
      })
    );
    renderPage();
    expect(await screen.findByText('Ledger')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Ledger' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show ledger' }));
    const rows = within(screen.getByRole('list', { name: 'Ledger' })).getAllByRole('listitem');
    // The day still owed (mined since the last notice) is the newest row.
    expect(rows[0]).toHaveTextContent('2,000,000 ISK');
    expect(rows[1]).toHaveTextContent('+1,000,000 ISK');
    expect(rows[2]).toHaveTextContent('500,000 ISK');
  });

  it('keeps every line of the notice when the recorded days do not add up to what is owed', async () => {
    api.read.mockResolvedValue(
      payload({
        account: {
          owed: 6_000_000,
          days: 2,
          oldest: '2026-08-13',
          paidThrough: null,
          asOf: '2026-10-20T10:00:00Z',
          unpaidDays: [{ date: '2026-08-27', owed: 1_000_000, tax: 1_000_000 }],
        },
      })
    );
    renderPage();
    expect(await screen.findByText(/Zeolites × 70,200/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Still owed' })).not.toBeInTheDocument();
  });

  it('puts a day mined since the last notice in the ledger too', async () => {
    api.read.mockResolvedValue(
      payload({
        account: {
          owed: 2_000_000,
          days: 1,
          oldest: '2026-08-27',
          paidThrough: null,
          asOf: '2026-10-20T10:00:00Z',
          unpaidDays: [{ date: '2026-08-27', owed: 2_000_000, tax: 2_000_000 }],
        },
        ledger: { days: [{ date: '2026-08-13', tax: 500_000 }], payments: [] },
      })
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Show ledger' }));
    const rows = within(screen.getByRole('list', { name: 'Ledger' })).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('2,000,000 ISK');
  });

  it('shows no days list and no Pay panel once the account is paid up', async () => {
    api.read.mockResolvedValue(
      payload({
        account: {
          owed: 0,
          days: 0,
          oldest: null,
          paidThrough: '2026-08-27',
          asOf: '2026-10-20T10:00:00Z',
          unpaidDays: [],
        },
      })
    );
    renderPage();
    expect(await screen.findByText(/paid through/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Still owed' })).not.toBeInTheDocument();
    expect(screen.queryByText('Pay')).not.toBeInTheDocument();
  });

  it('notes a closed account', async () => {
    api.read.mockResolvedValue(payload({ accountClosed: true }));
    renderPage();
    expect(await screen.findByText(/account is closed/)).toBeInTheDocument();
  });

  it('explains a link that is not valid', async () => {
    api.read.mockRejectedValue({ code: 'functions/not-found' });
    renderPage();
    expect(await screen.findByText('This link is not valid')).toBeInTheDocument();
  });

  it('offers Try again after a failed read', async () => {
    api.read.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(payload());
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/Zeolites × 70,200/)).toBeInTheDocument();
  });

  it('stops reminders and shows the state the server stored', async () => {
    api.read.mockResolvedValue(payload());
    api.stop.mockResolvedValue(true);
    renderPage();
    const box = await screen.findByRole('checkbox', { name: /Stop reminders/ });
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    expect(api.stop).toHaveBeenCalledWith('tok', true);
    await waitFor(() => expect(box).toBeChecked());
  });

  it('keeps the box unchecked and says so when saving fails', async () => {
    api.read.mockResolvedValue(payload());
    api.stop.mockRejectedValue(new Error('offline'));
    renderPage();
    await userEvent.click(await screen.findByRole('checkbox', { name: /Stop reminders/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't save/);
    expect(screen.getByRole('checkbox', { name: /Stop reminders/ })).not.toBeChecked();
  });

  describe('a hand-made grouping waiting for a character (D26b)', () => {
    it('shows nothing when no character is waiting', async () => {
      api.read.mockResolvedValue(payload());
      renderPage();
      await screen.findByText(/Zeolites × 70,200/);
      expect(screen.queryByText(/waiting to join/)).not.toBeInTheDocument();
    });

    it('never confirms from the link alone: it asks for that character to sign in', async () => {
      api.read.mockResolvedValue(payload({ pendingCharacterIds: [61] }));
      renderPage();
      const signIn = await screen.findByRole('button', { name: 'Log in as Quiet Alt to confirm' });
      expect(screen.queryByRole('button', { name: /^Confirm/ })).not.toBeInTheDocument();
      await userEvent.click(signIn);
      expect(api.login).toHaveBeenCalledWith([]);
      expect(api.confirm).not.toHaveBeenCalled();
    });

    it('confirms as the character once it is signed in on this device', async () => {
      api.tracked = [61];
      api.read.mockResolvedValue(payload({ pendingCharacterIds: [61] }));
      renderPage();
      await userEvent.click(await screen.findByRole('button', { name: 'Confirm Quiet Alt' }));
      expect(api.confirm).toHaveBeenCalledWith(61, 98000001);
      expect(await screen.findByText(/Quiet Alt is now part of this account/)).toBeInTheDocument();
    });

    it('lets the link decline, naming the character and the token', async () => {
      api.read.mockResolvedValue(payload({ pendingCharacterIds: [61] }));
      renderPage();
      await userEvent.click(await screen.findByRole('button', { name: 'Not mine, remove it' }));
      expect(api.decline).toHaveBeenCalledWith('tok', 61);
      expect(await screen.findByText(/Quiet Alt was removed/)).toBeInTheDocument();
    });

    it('says so when saving fails', async () => {
      api.tracked = [61];
      api.confirm.mockRejectedValue(new Error('nope'));
      api.read.mockResolvedValue(payload({ pendingCharacterIds: [61] }));
      renderPage();
      await userEvent.click(await screen.findByRole('button', { name: 'Confirm Quiet Alt' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't save that/);
    });
  });
});
