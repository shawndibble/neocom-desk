import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { LinkPaymentDialog } from './LinkPaymentDialog';
import type { LedgerActionResult } from './ledgerActions';
import type { LinkSuggestion } from './paymentLinks';
import { PayeeAccount } from '@/engine/miningTax/payeeAccount';

const settle = vi.fn<(...args: unknown[]) => Promise<LedgerActionResult>>();
vi.mock('./ledgerActions', () => ({
  linkPayment: (...args: unknown[]) => settle(...args),
}));
const rememberPayeeEntity = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve());
vi.mock('./payees', () => ({
  rememberPayeeEntity: (...args: unknown[]) => rememberPayeeEntity(...args),
}));

/** A payment in kind: its cargo is unpriced, so the pilot types what it was worth. */
const IN_KIND = {
  payment: {
    key: 'contract:1',
    kind: 'contract',
    refId: 1,
    characterId: 1,
    date: '2026-09-10T12:00:00Z',
    amount: null,
    method: 'contract',
    label: 'Ore',
  },
  payee: {
    id: 'p1',
    name: 'Mining Corp',
    members: [{ id: 'p1', characterId: 1, name: 'Mining Corp' }],
    owed: 250_000,
    billed: true,
  },
  confidence: 'entity',
} as unknown as LinkSuggestion;

/** What the Payee owes: one 250,000 ISK day. */
const ACCOUNT = PayeeAccount.build({
  payeeId: 'p1',
  charges: [{ id: 'a1', date: '2026-09-09', tax: 250_000 }],
  links: [],
});

function renderDialog(
  suggestion: LinkSuggestion = IN_KIND,
  { onLinked = () => {}, onClose = () => {} }: { onLinked?: () => void; onClose?: () => void } = {}
) {
  render(
    <LinkPaymentDialog
      open
      onClose={onClose}
      suggestions={[suggestion]}
      accountOf={() => ACCOUNT}
      onLinked={onLinked}
    />
  );
}

function recordedAmount(): unknown {
  const [link] = settle.mock.calls[0];
  return (link as { amount: number }).amount;
}

describe('LinkPaymentDialog — value handed over', () => {
  beforeEach(() => {
    settle.mockReset();
    settle.mockResolvedValue({ ok: true, value: undefined });
  });

  it('records ISK shorthand as the full amount (issue #2227)', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByRole('textbox', { name: 'Value handed over' }), '1b');
    await user.click(screen.getByRole('button', { name: 'Link to Mining Corp' }));

    await waitFor(() => expect(settle).toHaveBeenCalled());
    expect(recordedAmount()).toBe(1_000_000_000);
  });

  it('will not save while the typed value does not parse', async () => {
    const user = userEvent.setup();
    renderDialog();

    const input = screen.getByRole('textbox', { name: 'Value handed over' });
    await user.type(input, '1x');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Link to Mining Corp' })).toBeDisabled();

    await user.type(input, '{Backspace}b');
    expect(screen.getByRole('button', { name: 'Link to Mining Corp' })).toBeEnabled();
  });

  it("links nothing left blank: a cargo's worth is never assumed to be the whole balance (N4)", () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Link to Mining Corp' })).toBeDisabled();
    expect(settle).not.toHaveBeenCalled();
  });
});

describe('LinkPaymentDialog — a failed save', () => {
  beforeEach(() => {
    settle.mockReset();
    settle.mockResolvedValue({ ok: true, value: undefined });
    rememberPayeeEntity.mockReset();
    rememberPayeeEntity.mockResolvedValue();
  });

  it('says so and stays open when linking fails', async () => {
    settle.mockResolvedValueOnce({ ok: false, reason: 'save-failed', cause: new Error('quota') });
    const onLinked = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderDialog(IN_KIND, { onLinked, onClose });

    await user.type(screen.getByRole('textbox', { name: 'Value handed over' }), '250000');
    await user.click(screen.getByRole('button', { name: 'Link to Mining Corp' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn’t save/);
    expect(onLinked).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Link to Mining Corp' })).toBeEnabled();
  });

  it('keeps the link, and says only remembering the recipient failed', async () => {
    rememberPayeeEntity.mockRejectedValueOnce(new Error('quota'));
    const onLinked = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    const fromKnownSender = {
      ...IN_KIND,
      payment: { ...IN_KIND.payment, counterpartyId: 99 },
    } as LinkSuggestion;
    renderDialog(fromKnownSender, { onLinked, onClose });

    await user.type(screen.getByRole('textbox', { name: 'Value handed over' }), '250000');
    await user.click(screen.getByRole('button', { name: 'Link to Mining Corp' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Payment linked, but couldn’t remember who Mining Corp is paid.'
    );
    expect(onClose).not.toHaveBeenCalled();
    // Already linked: a second click must not link it twice.
    expect(screen.getByRole('button', { name: 'Link to Mining Corp' })).toBeDisabled();
    expect(settle).toHaveBeenCalledTimes(1);
    // The reload waits for the close, so it can't unmount the message unread.
    expect(onLinked).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onLinked).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('LinkPaymentDialog — what it pays', () => {
  it("links the payment to the suggested Payee, its owner record's Character, as the pilot's own", async () => {
    settle.mockReset();
    settle.mockResolvedValue({ ok: true, value: undefined });
    const user = userEvent.setup();
    const isk = {
      ...IN_KIND,
      payment: { ...IN_KIND.payment, key: 'journal:9', kind: 'journal', refId: 9, amount: 300_000 },
    } as LinkSuggestion;
    renderDialog(isk);
    expect(screen.getByRole('status')).toHaveTextContent(/50,000 ISK more than is owed/);
    await user.click(screen.getByRole('button', { name: 'Link to Mining Corp' }));
    await waitFor(() => expect(settle).toHaveBeenCalled());
    expect(settle.mock.calls[0]).toEqual([
      expect.objectContaining({ payeeId: 'p1', kind: 'journal', refId: 9, source: 'manual' }),
      1,
    ]);
  });
});
