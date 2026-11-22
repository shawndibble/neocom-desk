import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BookRowView } from '@/engine/corpTaxBook/personal';

const submit = vi.hoisted(() => ({
  tellNotPaying: vi.fn(async () => ({ status: 'sent', to: [9], fellBackToCeo: false })),
  tellNotOwed: vi.fn(async () => ({ status: 'no-scope' })),
  sendProof: vi.fn(),
  countHeldDonations: vi.fn(async () => undefined),
}));
vi.mock('./resolveSubmit', () => submit);
vi.mock('@/features/character/names', () => ({
  resolveCategories: vi.fn(async () => new Map([[90, 'character']])),
}));

import { ResolveDialog } from './ResolveDialog';
import type { ResolveProblem } from './outcomes';

const row = {
  state: 'billed',
  date: '2026-11-06',
  recordKey: '7:1000:2026-11-06',
  oreLines: [{ typeId: 45490, quantity: 100 }],
  // The member's own record has less ore: there is something to dispute.
  personalOreLines: [{ typeId: 45490, quantity: 90 }],
  billed: 1_840_320,
  taxOwed: 1_840_320,
} as unknown as BookRowView;
const mail = {
  characterId: 7,
  memberName: 'Kestrel',
  corporationId: 1,
  corpName: 'Bureau',
  contact: undefined,
};

function open(problem: ResolveProblem, over: Partial<Parameters<typeof ResolveDialog>[0]> = {}) {
  const props = {
    problem,
    mail,
    facts: <p>facts</p>,
    hideKey: 'day:1:7:2026-11-06',
    onHide: vi.fn(async () => undefined),
    onPay: vi.fn(),
    onSent: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<ResolveDialog {...props} />);
  return props;
}

const base = { corporationId: 1, corpName: 'Bureau', characterId: 7, row };

describe('ResolveDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('groups the outcomes, self-service first, with the likeliest preselected', () => {
    open({ ...base, kind: 'figure', bookAsksMore: true });
    expect(screen.getByText('Settle it yourself')).toBeInTheDocument();
    expect(screen.getByText('Ask Bureau')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /I don't owe this/ })).toBeChecked();
  });

  // The "f-it" way out: one click, nothing sent, and honest about the bill.
  it('hides a problem on this device without sending anything', async () => {
    const user = userEvent.setup();
    const props = open({ ...base, kind: 'figure', bookAsksMore: true });
    await user.click(screen.getByRole('radio', { name: /Not paying/ }));
    await user.click(screen.getByRole('button', { name: 'Hide it' }));
    expect(props.onHide).toHaveBeenCalledWith('day:1:7:2026-11-06');
    expect(submit.tellNotPaying).not.toHaveBeenCalled();
    expect(await screen.findByText(/Bureau still bills it/)).toBeInTheDocument();
  });

  it('needs a reason before it tells the corporation why', async () => {
    const user = userEvent.setup();
    open({ ...base, kind: 'figure', bookAsksMore: true });
    await user.click(screen.getByRole('radio', { name: /Not paying/ }));
    await user.click(screen.getByRole('checkbox', { name: /Tell Bureau why/ }));
    const send = screen.getByRole('button', { name: 'Hide it and tell them' });
    expect(send).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: /Why/ }), 'Untaxed op');
    await user.click(send);
    expect(submit.tellNotPaying).toHaveBeenCalledWith(mail, row, 'Untaxed op');
    expect(await screen.findByText(/Also mailed in EVE/)).toBeInTheDocument();
  });

  it('says what checking the wallet found after sending the proof', async () => {
    const user = userEvent.setup();
    submit.sendProof.mockResolvedValueOnce({
      checks: [{ result: 'notFound' }],
      confirmed: false,
      mailed: { status: 'no-scope' },
    });
    open(
      { ...base, kind: 'uncredited', amount: 25_000_000, noticeId: 's1' },
      {
        transfers: [
          {
            amount: 25_000_000,
            at: '2026-11-02T18:41:00Z',
            journalRef: 7,
            recipient: 'corporation',
          },
        ],
      }
    );
    await user.click(screen.getByRole('button', { name: 'Send proof' }));
    expect(await screen.findByText('Not in the corp wallet')).toBeInTheDocument();
    expect(screen.getByText(/give this Character the mail permission/)).toBeInTheDocument();
  });

  it('cannot send the proof before any Late notice asks for it, says why, and does not preselect it', async () => {
    open({ ...base, kind: 'uncredited', amount: 25_000_000 });
    expect(screen.getByRole('radio', { name: /Pay it/ })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: /I already paid/ }));
    expect(screen.getByText(/No Late notice has asked for it yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send proof' })).toBeDisabled();
  });

  describe('donations the book holds for review without counting them', () => {
    const held = [
      { id: 'j5_1', characterId: 7 },
      { id: 'j5_2', characterId: 8 },
    ];

    it('counts them as tax at once when no Late notice is unpaid, and says they are credited', async () => {
      const user = userEvent.setup();
      const props = open({ ...base, kind: 'uncredited', amount: 37_929_058, held });
      expect(
        screen.getByRole('heading', { name: 'Donations held for review' })
      ).toBeInTheDocument();
      expect(screen.queryByRole('radio', { name: /Pay it/ })).toBeNull();
      expect(screen.getByRole('radio', { name: /I already paid/ })).toBeChecked();
      await user.click(screen.getByRole('button', { name: 'Count them' }));
      expect(submit.countHeldDonations).toHaveBeenCalledWith(mail, held);
      expect(submit.sendProof).not.toHaveBeenCalled();
      expect(await screen.findByText(/counts them as paid/)).toBeInTheDocument();
      expect(props.onSent).toHaveBeenCalled();
    });

    it('sends the proof on the unpaid Late notice, where an officer sees it', async () => {
      const user = userEvent.setup();
      submit.sendProof.mockResolvedValueOnce({ checks: [{ result: 'found' }], confirmed: true });
      const transfers = [
        { amount: 1, at: '2026-11-02T22:38:44Z', journalRef: 5, recipient: 'corporation' as const },
      ];
      open({ ...base, kind: 'uncredited', amount: 1, noticeId: 's1', held }, { transfers });
      await user.click(screen.getByRole('button', { name: 'Send proof' }));
      expect(submit.sendProof).toHaveBeenCalledWith(mail, 's1', transfers, '', expect.any(String));
      expect(submit.countHeldDonations).not.toHaveBeenCalled();
    });
  });

  it('never offers disputing uncredited donations', () => {
    open({ ...base, kind: 'uncredited', amount: 25_000_000, noticeId: 's1' });
    expect(screen.queryByRole('radio', { name: /I don't owe this/ })).toBeNull();
  });

  // The hold does not renew, and the member can say it again.
  it('lets the member say it again after an officer kept the bill, and says the hold does not renew', async () => {
    const user = userEvent.setup();
    submit.tellNotOwed.mockClear();
    const kept = {
      ...row,
      oreLines: [{ typeId: 45490, quantity: 120 }],
      personalOreLines: [{ typeId: 45490, quantity: 100 }],
      flagged: { state: 'rejected', kind: 'quantity', at: 'x', nextStep: 'Pay it' },
    } as unknown as BookRowView;
    open({ ...base, row: kept, kind: 'kept', by: 'dispute', nextStep: 'Pay it' });
    await user.click(screen.getByRole('radio', { name: /I don't owe this/ }));
    expect(screen.getByText(/not held a second time/)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /Why/ }), 'I mined 100');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(submit.tellNotOwed).toHaveBeenCalledWith(mail, kept, 'I mined 100', undefined);
    expect(await screen.findByText(/again/)).toBeInTheDocument();
  });

  it('lets a Late notice whose days are unpaid be paid, hidden, or declared with the payment the member picks', async () => {
    const user = userEvent.setup();
    submit.sendProof.mockResolvedValueOnce({ checks: [{ result: 'person' }], confirmed: false });
    open(
      { ...base, row: undefined, kind: 'overdue', noticeId: 's1', period: 'Oct 1 – Oct 31' },
      {
        payments: [
          {
            key: 'journal:5',
            kind: 'journal',
            refId: 5,
            characterId: 7,
            date: '2026-11-03T10:00:00Z',
            amount: 5_000_000,
            method: 'donation',
            counterpartyId: 90,
            counterpartyName: 'Marta Vell',
            label: 'Donation',
          },
        ],
        paidSince: '2026-10-01',
      }
    );
    expect(screen.getByRole('radio', { name: /Not paying/ })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /I already paid/ }));
    expect(await screen.findByText('Which payment was it?')).toBeInTheDocument();
    expect(await screen.findByText('Paid to a person')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Send proof' }));
    expect(submit.sendProof).toHaveBeenCalledWith(
      mail,
      's1',
      [
        {
          amount: 5_000_000,
          at: '2026-11-03T10:00:00Z',
          journalRef: 5,
          recipient: 'character',
          recipientId: 90,
        },
      ],
      '',
      'Oct 1 – Oct 31'
    );
  });

  it('tells the corporation every day the donations paid, not only the first', async () => {
    const user = userEvent.setup();
    submit.sendProof.mockResolvedValueOnce({ checks: [], confirmed: false });
    open(
      {
        ...base,
        kind: 'uncredited',
        amount: 5,
        noticeId: 's1',
        days: ['2026-11-06', '2026-11-07'],
      },
      {
        transfers: [
          { amount: 5, at: '2026-11-08T00:00:00Z', journalRef: 3, recipient: 'corporation' },
        ],
      }
    );
    await user.click(screen.getByRole('button', { name: 'Send proof' }));
    expect(submit.sendProof).toHaveBeenCalledWith(
      mail,
      's1',
      expect.any(Array),
      '',
      '2026-11-06, 2026-11-07'
    );
  });

  it('after "I already paid" with nothing found, says the answer comes back, never a hold with no date', async () => {
    const user = userEvent.setup();
    submit.sendProof.mockResolvedValueOnce({ checks: [], confirmed: false });
    open(
      { ...base, kind: 'uncredited', amount: 5, noticeId: 's1', days: ['2026-11-06'] },
      {
        transfers: [
          { amount: 5, at: '2026-11-08T00:00:00Z', journalRef: 3, recipient: 'corporation' },
        ],
      }
    );
    await user.click(screen.getByRole('button', { name: 'Send proof' }));
    expect(
      await screen.findByText(/Sent to Bureau\. Their answer comes back here/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/until\s+while/)).not.toBeInTheDocument();
  });

  it('fixes your own records on a Conflict in one click', async () => {
    const user = userEvent.setup();
    const onFixRecords = vi.fn();
    open(
      { ...base, kind: 'conflict', row: { ...row, state: 'conflict' } as BookRowView },
      { onFixRecords, payeeName: 'Rock Hound' }
    );
    await user.click(screen.getByRole('button', { name: 'Fix it' }));
    expect(onFixRecords).toHaveBeenCalled();
  });
});
