import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@/i18n';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BookRowView } from '@/engine/corpTaxBook/personal';

const submit = vi.hoisted(() => ({
  tellNotPaying: vi.fn(async () => ({ status: 'sent', to: [9], fellBackToCeo: false })),
  tellNotOwed: vi.fn(async () => ({ status: 'no-scope' })),
  sendProof: vi.fn(),
}));
vi.mock('./resolveSubmit', () => submit);

import { ResolveDialog } from './ResolveDialog';
import type { ResolveProblem } from './outcomes';

const row = {
  state: 'billed',
  date: '2026-11-06',
  recordKey: '7:1000:2026-11-06',
  oreLines: [{ typeId: 45490, quantity: 100 }],
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
      { ...base, kind: 'uncredited', amount: 25_000_000, statementId: 's1' },
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

  it('cannot send the proof before anything is on a Statement, and says why', () => {
    open({ ...base, kind: 'uncredited', amount: 25_000_000 });
    expect(screen.getByText(/Nothing is on a Statement yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send proof' })).toBeDisabled();
  });

  it('opens the day to fix your own records on a Conflict', async () => {
    const user = userEvent.setup();
    const onFixRecords = vi.fn();
    open(
      { ...base, kind: 'conflict', row: { ...row, state: 'conflict' } as BookRowView },
      { onFixRecords, payeeName: 'Rock Hound' }
    );
    await user.click(screen.getByRole('button', { name: 'Open the day' }));
    expect(onFixRecords).toHaveBeenCalled();
  });
});
