import { describe, it, expect } from 'vitest';
import { render, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { WalletJournalEntry } from '@/esi/endpoints';
import { useJournalColumnsBuilder } from './walletJournal';
import { WALLET_JOURNAL_COLUMN_IDS } from './walletJournalColumns';

const entry: WalletJournalEntry = {
  id: 1,
  date: '2026-10-07T23:47:00Z',
  ref_type: 'bounty_prize',
  description: 'Bounty prize',
};

function columns() {
  const { result } = renderHook(() => useJournalColumnsBuilder());
  return result.current(
    () => undefined,
    () => ''
  );
}

describe('wallet journal columns', () => {
  it('keeps Description on a phone, governed by the Columns menu like the rest', () => {
    const description = columns().find((column) => column.id === 'description');
    expect(description?.phoneHidden).toBeFalsy();
    expect(WALLET_JOURNAL_COLUMN_IDS).toContain('description');
  });

  it('puts the time under the date on a phone, one line on desktop', () => {
    const date = columns().find((column) => column.id === 'date');
    const { container } = render(<MemoryRouter>{date?.render(entry)}</MemoryRouter>);
    const blocks = container.querySelectorAll('span[class~="max-sm:block"]');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].textContent).not.toBe(blocks[1].textContent);
    // Desktop reads as the unsplit timestamp.
    expect(container.textContent).toBe(
      new Date(entry.date).toLocaleString(undefined, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    );
    expect(date?.sortValue?.(entry)).toBe(entry.date);
  });
});
