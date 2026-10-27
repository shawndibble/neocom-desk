import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { VerifyPayload } from '@/engine/corpTaxBook/verifyView';
import { VerifyPage } from './VerifyPage';

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
    },
  },
}));
vi.mock('@/features/character/names', () => ({
  resolveNames: vi.fn().mockResolvedValue(new Map([[61, 'Quiet Alt']])),
}));
vi.mock('./verifyApi', () => ({
  readVerifyStatement: api.read,
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
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
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
    terms: { overdueDays: 14, minimumStatement: 5_000_000 },
    payments: [{ id: 'p1', amount: 2_500_000, at: '2026-09-02T20:14:00Z', source: 'donation' }],
    settlement: { amount: 8_000_000, credited: 2_500_000, writtenOff: 0, remaining: 5_500_000 },
    declarations: [],
    settled: false,
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
  it('shows each line with its pricing, the terms with dates and the payments credited', async () => {
    api.read.mockResolvedValue(payload());
    render(<VerifyPage token="tok" />);
    expect(await screen.findByText(/Zeolites × 70,200/)).toBeInTheDocument();
    expect(screen.getByText('Efa V - Moon 3')).toBeInTheDocument();
    expect(screen.getByText('15%')).toBeInTheDocument();
    expect(screen.getByText(/15%, effective Aug 1, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Jita buy, Compressed ore, on the day mined/)).toBeInTheDocument();
    expect(screen.getByText(/Sep 15, 2026 \(14 days after issue\)/)).toBeInTheDocument();
    expect(screen.getByText('+2,500,000 ISK')).toBeInTheDocument();
    expect(screen.getByText('BRML-7Q4K')).toBeInTheDocument();
    expect(await screen.findByText(/Donate ISK to Brass Meridian/)).toBeInTheDocument();
  });

  it("says an officer's write-off apart from a dismissal (#4637)", async () => {
    api.read.mockResolvedValue(
      payload({
        settlement: {
          amount: 8_000_000,
          credited: 8_000_000,
          forgiven: 4_000_000,
          writtenOff: 0,
          remaining: 0,
        },
      })
    );
    render(<VerifyPage token="tok" />);
    expect(
      await screen.findByText(/4,000,000 ISK was written off by an officer/)
    ).toBeInTheDocument();
    expect(screen.getByText(/1,500,000 ISK was waived by an officer/)).toBeInTheDocument();
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
    render(<VerifyPage token="tok" />);
    const zeo = (await screen.findByText(/Zeolites × 100/)).closest('li')!;
    expect(zeo).toHaveTextContent('12.50 ISK');
    expect(zeo).not.toHaveTextContent('30.00 ISK');
    const jas = screen.getByText(/Jaspet × 200/).closest('li')!;
    expect(jas).toHaveTextContent('30.00 ISK');
    const day = zeo.parentElement!.closest('li')!;
    expect(day.textContent).not.toMatch(/·\s*·/);
    expect(day.textContent?.match(/Aug 13, 2026/g)).toHaveLength(1);
  });

  it('says so when nothing is credited yet', async () => {
    api.read.mockResolvedValue(payload({ payments: [], settlement: null }));
    render(<VerifyPage token="tok" />);
    expect(await screen.findByText(/No payments have been credited/)).toBeInTheDocument();
  });

  it('notes a closed account', async () => {
    api.read.mockResolvedValue(payload({ accountClosed: true }));
    render(<VerifyPage token="tok" />);
    expect(await screen.findByText(/account is closed/)).toBeInTheDocument();
  });

  it('explains a link that is not valid', async () => {
    api.read.mockRejectedValue({ code: 'functions/not-found' });
    render(<VerifyPage token="tok" />);
    expect(await screen.findByText('This link is not valid')).toBeInTheDocument();
  });

  it('offers Try again after a failed read', async () => {
    api.read.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(payload());
    render(<VerifyPage token="tok" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/Zeolites × 70,200/)).toBeInTheDocument();
  });

  it('stops reminders and shows the state the server stored', async () => {
    api.read.mockResolvedValue(payload());
    api.stop.mockResolvedValue(true);
    render(<VerifyPage token="tok" />);
    const box = await screen.findByRole('checkbox', { name: /Stop reminders/ });
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    expect(api.stop).toHaveBeenCalledWith('tok', true);
    await waitFor(() => expect(box).toBeChecked());
  });

  it('keeps the box unchecked and says so when saving fails', async () => {
    api.read.mockResolvedValue(payload());
    api.stop.mockRejectedValue(new Error('offline'));
    render(<VerifyPage token="tok" />);
    await userEvent.click(await screen.findByRole('checkbox', { name: /Stop reminders/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't save/);
    expect(screen.getByRole('checkbox', { name: /Stop reminders/ })).not.toBeChecked();
  });

  describe('a hand-made grouping waiting for a character (D26b)', () => {
    it('shows nothing when no character is waiting', async () => {
      api.read.mockResolvedValue(payload());
      render(<VerifyPage token="tok" />);
      await screen.findByText(/Zeolites × 70,200/);
      expect(screen.queryByText(/waiting to join/)).not.toBeInTheDocument();
    });

    it('never confirms from the link alone: it asks for that character to sign in', async () => {
      api.read.mockResolvedValue(payload({ pendingCharacterIds: [61] }));
      render(<VerifyPage token="tok" />);
      const signIn = await screen.findByRole('button', { name: 'Log in as Quiet Alt to confirm' });
      expect(screen.queryByRole('button', { name: /^Confirm/ })).not.toBeInTheDocument();
      await userEvent.click(signIn);
      expect(api.login).toHaveBeenCalledWith([]);
      expect(api.confirm).not.toHaveBeenCalled();
    });

    it('confirms as the character once it is signed in on this device', async () => {
      api.tracked = [61];
      api.read.mockResolvedValue(payload({ pendingCharacterIds: [61] }));
      render(<VerifyPage token="tok" />);
      await userEvent.click(await screen.findByRole('button', { name: 'Confirm Quiet Alt' }));
      expect(api.confirm).toHaveBeenCalledWith(61, 98000001);
      expect(await screen.findByText(/Quiet Alt is now part of this account/)).toBeInTheDocument();
    });

    it('lets the link decline, naming the character and the token', async () => {
      api.read.mockResolvedValue(payload({ pendingCharacterIds: [61] }));
      render(<VerifyPage token="tok" />);
      await userEvent.click(await screen.findByRole('button', { name: 'Not mine, remove it' }));
      expect(api.decline).toHaveBeenCalledWith('tok', 61);
      expect(await screen.findByText(/Quiet Alt was removed/)).toBeInTheDocument();
    });

    it('says so when saving fails', async () => {
      api.tracked = [61];
      api.confirm.mockRejectedValue(new Error('nope'));
      api.read.mockResolvedValue(payload({ pendingCharacterIds: [61] }));
      render(<VerifyPage token="tok" />);
      await userEvent.click(await screen.findByRole('button', { name: 'Confirm Quiet Alt' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't save that/);
    });
  });
});
