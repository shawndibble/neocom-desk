import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { BookSettings, OfficerVerdict } from '../taxBook/bookClient';
import { BookProvider } from './BookContext';
import { AssignDonationDialog } from './BookDialogs';

const edit = vi.fn();
vi.mock('../taxBook/bookClient', () => ({
  editBook: (_c: number, _o: number, action: unknown) => Promise.resolve(edit(action) ?? {}),
}));

const NAMES: Record<number, string> = { 1: 'zed', 2: 'Bob', 3: 'alice', 4: 'Carol', 5: 'Dave' };
const miner = (id: string, main: number, alts: number[] = []) => ({
  id,
  mainCharacterId: main,
  characterIds: [main, ...alts],
});
const verdict = { canEdit: true, bookActive: true } as OfficerVerdict;

function renderDialog() {
  const view = {
    miners: [miner('m1', 1), miner('m2', 2), miner('m3', 3), miner('m4', 4, [5])],
    input: { now: '2026-10-20T00:00:00Z' },
  };
  render(
    <BookProvider
      value={{
        characterId: 7,
        corporationId: 1,
        view: view as never,
        names: { character: (id: number) => NAMES[id] ?? `Pilot ${id}` } as never,
        settings: {} as BookSettings,
        data: {} as never,
        verdict,
        reload: vi.fn(),
      }}
    >
      <AssignDonationDialog
        open
        onClose={vi.fn()}
        payment={{ id: 'p1', amount: 5_000_000, at: '2026-10-16T08:12:00Z' }}
        fromName="Pilot 99"
      />
    </BookProvider>
  );
  return screen.getByRole('dialog');
}

const names = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole('radio')
    .map((r) => r.closest('label')?.textContent);

afterEach(() => {
  cleanup();
  edit.mockClear();
});

describe('AssignDonationDialog Miner picker', () => {
  it('lists Miners by name, case-insensitive, and focuses the filter', () => {
    const dialog = renderDialog();
    expect(names(dialog)).toEqual(['alice', 'Bob', 'Carol', 'zed']);
    expect(within(dialog).getByRole('searchbox', { name: 'Find a Miner' })).toHaveFocus();
  });

  it('filters by name', async () => {
    const dialog = renderDialog();
    await userEvent.type(within(dialog).getByRole('searchbox'), 'ZE');
    expect(names(dialog)).toEqual(['zed']);
  });

  it('filters by an alt name', async () => {
    const dialog = renderDialog();
    await userEvent.type(within(dialog).getByRole('searchbox'), 'dav');
    expect(names(dialog)).toEqual(['Carol']);
  });

  it('keeps the chosen Miner listed while filtering and assigns it', async () => {
    const dialog = renderDialog();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Bob' }));
    await userEvent.type(within(dialog).getByRole('searchbox'), 'alice');
    expect(names(dialog)).toEqual(['alice', 'Bob']);
    await userEvent.click(within(dialog).getByRole('button', { name: /^Assign/ }));
    expect(edit).toHaveBeenCalledWith({ action: 'assignPayment', paymentId: 'p1', minerId: 'm2' });
  });

  it('says so when nothing matches', async () => {
    const dialog = renderDialog();
    await userEvent.type(within(dialog).getByRole('searchbox'), 'nobody');
    expect(within(dialog).getByText('No Miner matches')).toBeInTheDocument();
  });
});
