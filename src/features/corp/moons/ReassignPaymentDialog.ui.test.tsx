import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { BookSettings, OfficerVerdict } from '../taxBook/bookClient';
import { BookProvider } from './BookContext';
import { ReassignPaymentDialog } from './BookDialogs';

const edit = vi.fn();
vi.mock('../taxBook/bookClient', () => ({
  editBook: (_c: number, _o: number, action: unknown) => Promise.resolve(edit(action) ?? {}),
}));

const NAMES: Record<number, string> = { 1: 'Alice', 2: 'Bob' };
const miner = (id: string, main: number) => ({ id, mainCharacterId: main, characterIds: [main] });

function renderDialog() {
  render(
    <BookProvider
      value={{
        characterId: 7,
        corporationId: 1,
        view: { miners: [miner('m1', 1), miner('m2', 2)] } as never,
        names: { character: (id: number) => NAMES[id] ?? `Pilot ${id}` } as never,
        settings: {} as BookSettings,
        data: {} as never,
        verdict: { canEdit: true, bookActive: true } as OfficerVerdict,
        reload: vi.fn(),
      }}
    >
      <ReassignPaymentDialog
        open
        onClose={vi.fn()}
        payment={{ id: 'p1', minerId: 'm1', amount: 5_000_000, at: '2026-10-16T08:12:00Z' }}
        fromName="Pilot 99"
        minerName="Alice"
      />
    </BookProvider>
  );
  return screen.getByRole('dialog');
}

afterEach(() => {
  cleanup();
  edit.mockClear();
});

describe('ReassignPaymentDialog', () => {
  it('moves the payment to another Miner, never offering the one it is on', async () => {
    const dialog = renderDialog();
    expect(within(dialog).queryByRole('radio', { name: 'Alice' })).toBeNull();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Bob' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move payment' }));
    expect(edit).toHaveBeenCalledWith({
      action: 'reassignPayment',
      paymentId: 'p1',
      minerId: 'm2',
    });
  });

  it('takes the payment off every Miner', async () => {
    const dialog = renderDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'No Miner' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Take it off this Miner' }));
    expect(edit).toHaveBeenCalledWith({
      action: 'reassignPayment',
      paymentId: 'p1',
      minerId: null,
    });
  });
});
