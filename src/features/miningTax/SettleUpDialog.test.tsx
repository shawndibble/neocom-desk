/**
 * Next/Back swap which step's markup is mounted — the button just clicked
 * unmounts with the rest of its step, dropping focus to `document.body`
 * (WCAG 2.4.3). Covers only that; the rest of settling up is covered elsewhere.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { MiningTaxAssignmentRecord } from '@/db';
import { SettleUpDialog, type SettleUpRow } from './SettleUpDialog';

vi.mock('./assignments', () => ({ markAssignmentsPaid: vi.fn(async () => undefined) }));

const assignment: MiningTaxAssignmentRecord = {
  id: 'a-1',
  characterId: 1,
  date: '2026-09-04',
  solarSystemId: 30000142,
  payeeId: 'p-jita',
  oreLines: [],
  taxPct: 10,
  estimatedValue: 100_000,
  taxOwed: 10_000,
  status: 'outstanding',
  updatedAt: 1,
};

const rows: SettleUpRow[] = [{ assignment, characterName: 'Miner Alt', payeeName: 'Corp Wallet' }];

function renderDialog() {
  return render(
    <SettleUpDialog
      open
      onClose={vi.fn()}
      rows={rows}
      systemNames={new Map([[30000142, 'Jita']])}
      onPaid={vi.fn()}
    />
  );
}

describe('SettleUpDialog focus after Next/Back', () => {
  it('moves focus into step 2 when Next is clicked', async () => {
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Next: pay in game' }));

    expect(document.activeElement).toBe(
      screen.getByRole('group', { name: 'Pay in game and record it' })
    );
  });

  it('moves focus back to step 1 when Back is clicked', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Next: pay in game' }));

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(document.activeElement).toBe(
      screen.getByRole('group', { name: "What you're paying for" })
    );
  });
});
