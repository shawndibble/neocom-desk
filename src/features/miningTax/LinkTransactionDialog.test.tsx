import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import { LinkTransactionDialog } from './LinkTransactionDialog';
import type { MadePayment } from './paymentLinks';

const EXACT: MadePayment = {
  key: 'journal:1',
  kind: 'journal',
  refId: 1,
  characterId: 1,
  date: '2026-09-10T12:00:00Z',
  amount: 100,
  method: 'donation',
  label: 'Player donation',
};

const CLOSE: MadePayment = {
  key: 'journal:2',
  kind: 'journal',
  refId: 2,
  characterId: 1,
  date: '2026-09-11T12:00:00Z',
  amount: 105,
  method: 'donation',
  label: 'Player donation',
};

function renderDialog(overrides: Partial<Parameters<typeof LinkTransactionDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <LinkTransactionDialog
      open
      onClose={onClose}
      candidates={[EXACT, CLOSE]}
      targetAmount={100}
      busy={false}
      onConfirm={onConfirm}
      {...overrides}
    />
  );
  return { onConfirm, onClose };
}

describe('LinkTransactionDialog', () => {
  it('pre-selects the exact-amount candidate and flags it as suggested', () => {
    renderDialog();
    expect(screen.getByText('Suggested — amount matches exactly')).toBeInTheDocument();
    expect(screen.getByRole('radio', { checked: true })).toBeInTheDocument();
  });

  it('confirms the pre-selected suggestion as an auto-sourced link, still requiring a click', () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(onConfirm).toHaveBeenCalledWith(EXACT, 'auto');
  });

  it('confirms a manually-picked, non-suggested candidate as a manual link', () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: /105 ISK/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(onConfirm).toHaveBeenCalledWith(CLOSE, 'manual');
  });

  it('never pre-selects anything when two candidates equally match the target', () => {
    const tied: MadePayment = { ...CLOSE, key: 'journal:3', refId: 3, amount: 100 };
    renderDialog({ candidates: [EXACT, tied] });
    expect(screen.queryByText('Suggested — amount matches exactly')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { checked: true })).not.toBeInTheDocument();
  });

  it('filters candidates by search text', () => {
    renderDialog();
    fireEvent.change(screen.getByPlaceholderText('Search by amount, date, or description…'), {
      target: { value: '105' },
    });
    expect(screen.getAllByRole('radio')).toHaveLength(1);
  });

  it('disables Link until something is selected', () => {
    renderDialog({ candidates: [CLOSE] });
    expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled();
  });
});
