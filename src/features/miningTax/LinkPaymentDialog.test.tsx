import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { LinkPaymentDialog } from './LinkPaymentDialog';
import type { LedgerActionResult } from './ledgerActions';
import type { LinkSuggestion } from './paymentLinks';

const settle = vi.fn<(...args: unknown[]) => Promise<LedgerActionResult>>();
vi.mock('./ledgerActions', () => ({
  settle: (...args: unknown[]) => settle(...args),
}));
vi.mock('./payees', () => ({ rememberPayeeEntity: vi.fn(() => Promise.resolve()) }));

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

function renderDialog(onClose = () => {}) {
  render(
    <LinkPaymentDialog
      open
      onClose={onClose}
      suggestions={[IN_KIND]}
      systemNames={new Map()}
      showCharacter={false}
      onLinked={() => {}}
    />
  );
}

function recordedAmount(): unknown {
  const [, payment] = settle.mock.calls[0];
  return (payment as { amount: number }).amount;
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
    expect(screen.getByText('= 1,000,000,000 ISK')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark 1 paid' }));

    await waitFor(() => expect(settle).toHaveBeenCalled());
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

    await waitFor(() => expect(settle).toHaveBeenCalled());
    expect(recordedAmount()).toBe(250_000);
  });
});

describe('LinkPaymentDialog — saving', () => {
  it('shows the failure and stays open when the save fails', async () => {
    settle.mockReset();
    settle.mockResolvedValue({ ok: false, reason: 'save-failed', cause: null });
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderDialog(onClose);

    await user.click(screen.getByRole('button', { name: 'Mark 1 paid' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save');
    expect(onClose).not.toHaveBeenCalled();
  });
});
