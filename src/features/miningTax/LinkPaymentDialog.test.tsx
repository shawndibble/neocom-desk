import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { LinkPaymentDialog } from './LinkPaymentDialog';
import type { LinkSuggestion } from './paymentLinks';

const markAssignmentsPaid = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock('./assignments', () => ({
  markAssignmentsPaid: (...args: unknown[]) => markAssignmentsPaid(...args),
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
  balance: { payee: { name: 'Mining Corp' } },
  members: [
    {
      assignment: { id: 'a1', date: '2026-09-09', solarSystemId: 30000142, taxOwed: 250_000 },
      row: { characterName: 'Pilot One' },
    },
  ],
  confidence: 'identity',
} as unknown as LinkSuggestion;

function renderDialog(
  suggestion: LinkSuggestion = IN_KIND,
  { onLinked = () => {}, onClose = () => {} }: { onLinked?: () => void; onClose?: () => void } = {}
) {
  render(
    <LinkPaymentDialog
      open
      onClose={onClose}
      suggestions={[suggestion]}
      systemNames={new Map()}
      showCharacter={false}
      onLinked={onLinked}
    />
  );
}

function recordedAmount(): unknown {
  const [, payment] = markAssignmentsPaid.mock.calls[0];
  return (payment as { amount: number }).amount;
}

describe('LinkPaymentDialog — value handed over', () => {
  beforeEach(() => {
    markAssignmentsPaid.mockReset();
    markAssignmentsPaid.mockResolvedValue();
  });

  it('records ISK shorthand as the full amount (issue #2227)', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByRole('textbox', { name: 'Value handed over' }), '1b');
    expect(screen.getByText('= 1,000,000,000 ISK')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark 1 paid' }));

    await waitFor(() => expect(markAssignmentsPaid).toHaveBeenCalled());
    expect(recordedAmount()).toBe(1_000_000_000);
  });

  it('will not save while the typed value does not parse', async () => {
    const user = userEvent.setup();
    renderDialog();

    const input = screen.getByRole('textbox', { name: 'Value handed over' });
    await user.type(input, '1x');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Mark 1 paid' })).toBeDisabled();

    await user.type(input, '{Backspace}b');
    expect(screen.getByRole('button', { name: 'Mark 1 paid' })).toBeEnabled();
  });

  it("records the ticked entries' total when left blank", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByRole('textbox', { name: 'Value handed over' })).toHaveAttribute(
      'placeholder',
      '250,000'
    );
    await user.click(screen.getByRole('button', { name: 'Mark 1 paid' }));

    await waitFor(() => expect(markAssignmentsPaid).toHaveBeenCalled());
    expect(recordedAmount()).toBe(250_000);
  });
});

describe('LinkPaymentDialog — a failed save', () => {
  beforeEach(() => {
    markAssignmentsPaid.mockReset();
    markAssignmentsPaid.mockResolvedValue();
    rememberPayeeEntity.mockReset();
    rememberPayeeEntity.mockResolvedValue();
  });

  it('says so and stays open when marking paid fails', async () => {
    markAssignmentsPaid.mockRejectedValueOnce(new Error('quota'));
    const onLinked = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderDialog(IN_KIND, { onLinked, onClose });

    await user.click(screen.getByRole('button', { name: 'Mark 1 paid' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn’t save/);
    expect(onLinked).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Mark 1 paid' })).toBeEnabled();
  });

  it('keeps the recorded payment, and says only remembering the recipient failed', async () => {
    rememberPayeeEntity.mockRejectedValueOnce(new Error('quota'));
    const onLinked = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    const fromKnownSender = {
      ...IN_KIND,
      payment: { ...IN_KIND.payment, counterpartyId: 99 },
    } as LinkSuggestion;
    renderDialog(fromKnownSender, { onLinked, onClose });

    await user.click(screen.getByRole('button', { name: 'Mark 1 paid' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Payment linked, but couldn’t remember who Mining Corp is paid.'
    );
    expect(onLinked).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    // Already recorded: a second click must not mark it paid twice.
    expect(screen.getByRole('button', { name: 'Mark 1 paid' })).toBeDisabled();
    expect(markAssignmentsPaid).toHaveBeenCalledTimes(1);
  });
});
