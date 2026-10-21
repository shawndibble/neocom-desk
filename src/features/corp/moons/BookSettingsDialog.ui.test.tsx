import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { BookProvider } from './BookContext';
import { BookSettingsDialog } from './BookSettingsDialog';
import { REFINERY_B, bookSettingsValue } from './bookSettingsFixture';

const editBook = vi.fn();
vi.mock('../taxBook/bookClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../taxBook/bookClient')>()),
  editBook: (...a: unknown[]) => editBook(...a),
}));

beforeEach(() => {
  editBook.mockReset();
  editBook.mockResolvedValue({});
});

const renderDialog = () =>
  render(
    <MemoryRouter>
      <BookProvider value={bookSettingsValue()}>
        <BookSettingsDialog open onClose={() => {}} />
      </BookProvider>
    </MemoryRouter>
  );

describe('BookSettingsDialog per-refinery rate (#4621)', () => {
  it('lists a refinery rate by the refinery name', () => {
    renderDialog();
    expect(screen.getByText(/Refinery · Efa - Ashfall Tatara/)).toBeInTheDocument();
  });

  it('adds a rate for a moon owner refinery, which has no moon', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('combobox', { name: 'Applies to' }));
    await user.click(screen.getByRole('option', { name: 'Refinery' }));
    await user.click(screen.getByRole('combobox', { name: 'Refinery' }));
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Efa - Ashfall Tatara', 'Efa - Ashfall Athanor']);
    await user.click(screen.getByRole('option', { name: 'Efa - Ashfall Athanor' }));
    const rates = screen.getByRole('button', { name: 'Add rate' }).closest('div.grid')!;
    await user.type(within(rates as HTMLElement).getByLabelText('Rate (%)'), '4');
    await user.click(screen.getByRole('button', { name: 'Add rate' }));
    expect(editBook).toHaveBeenCalledWith(7, 98000000, {
      action: 'addRate',
      rate: expect.objectContaining({ scope: 'structure', structureId: REFINERY_B, pct: 4 }),
    });
  });
});
