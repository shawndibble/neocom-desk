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

function renderDialog() {
  render(
    <LinkPaymentDialog
      open
      onClose={() => {}}
      suggestions={[IN_KIND]}
      systemNames={new Map()}
      showCharacter={false}
      onLinked={() => {}}
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
