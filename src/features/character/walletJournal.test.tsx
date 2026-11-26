import { describe, it, expect } from 'vitest';
import { render, renderHook, within } from '@testing-library/react';
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

  describe('Player column and description links', () => {
    const corpEntry = {
      ...entry,
      ref_type: 'player_donation',
      description: 'Pilot One deposited cash',
      playerId: 42,
    };
    function corpColumns() {
      const { result } = renderHook(() => useJournalColumnsBuilder());
      return result.current(
        () => undefined,
        () => '',
        undefined,
        undefined,
        () => 'Pilot One'
      );
    }

    it('links the Player cell and the name in the description to the pilot info', () => {
      const cols = corpColumns();
      const player = render(
        <MemoryRouter>{cols.find((c) => c.id === 'player')?.render(corpEntry)}</MemoryRouter>
      );
      expect(
        within(player.container).getByRole('link', { name: 'Pilot One' }).getAttribute('href')
      ).toContain('info=character-42');
      const desc = render(
        <MemoryRouter>{cols.find((c) => c.id === 'description')?.render(corpEntry)}</MemoryRouter>
      );
      expect(
        within(desc.container).getByRole('link', { name: 'Pilot One' }).getAttribute('href')
      ).toContain('info=character-42');
      expect(desc.container.textContent).toBe('Pilot One deposited cash');
    });

    it('has no link on a row without a player, or when the name is not in the text', () => {
      const cols = corpColumns();
      const none = { ...corpEntry, playerId: undefined };
      const player = render(
        <MemoryRouter>{cols.find((c) => c.id === 'player')?.render(none)}</MemoryRouter>
      );
      expect(within(player.container).queryByRole('link')).toBeNull();
      const desc = render(
        <MemoryRouter>
          {cols
            .find((c) => c.id === 'description')
            ?.render({ ...corpEntry, description: 'Corp transfer' })}
        </MemoryRouter>
      );
      expect(within(desc.container).queryByRole('link')).toBeNull();
    });
  });
});
