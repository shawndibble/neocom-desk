import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { BookProvider } from './BookContext';
import { BookSettingsDialog } from './BookSettingsDialog';
import { OWNER, REFINERY_B, bookSettingsValue } from './bookSettingsFixture';

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
    const row = screen.getByText('Efa - Ashfall Tatara').closest('li')!;
    expect(within(row).getByText('Refinery')).toBeInTheDocument();
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

describe('BookSettingsDialog per-moon-owner rate', () => {
  it('lists a moon owner rate by the corporation name', () => {
    renderDialog();
    const row = screen.getByText(`Corp ${OWNER}`).closest('li')!;
    expect(within(row).getByText('Moon owner')).toBeInTheDocument();
  });

  it('adds a rate for every refinery of a moon owner still in the book', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('combobox', { name: 'Applies to' }));
    await user.click(screen.getByRole('option', { name: 'Moon owner' }));
    await user.click(screen.getByRole('combobox', { name: 'Moon owner' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([`Corp ${OWNER}`]);
    await user.click(screen.getByRole('option', { name: `Corp ${OWNER}` }));
    const rates = screen.getByRole('button', { name: 'Add rate' }).closest('div.grid')!;
    await user.type(within(rates as HTMLElement).getByLabelText('Rate (%)'), '9');
    await user.click(screen.getByRole('button', { name: 'Add rate' }));
    expect(editBook).toHaveBeenCalledWith(7, 98000000, {
      action: 'addRate',
      rate: expect.objectContaining({ scope: 'feeder', feederId: OWNER, pct: 9 }),
    });
  });
});

describe('BookSettingsDialog tabs', () => {
  it('opens on Rates and shows one tab of settings at a time', async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(screen.getByRole('tab', { name: /Rates/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Trade hub')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Pricing & billing' }));
    expect(screen.getByText('Trade hub')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add rate' })).not.toBeInTheDocument();
  });

  it('keeps an edit made on one tab when another tab is opened', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('tab', { name: 'Pricing & billing' }));
    const grace = screen.getByRole('textbox', { name: 'Grace after day end (hours)' });
    await user.clear(grace);
    await user.type(grace, '12');
    await user.click(screen.getByRole('tab', { name: 'Extractions' }));
    await user.click(screen.getByRole('tab', { name: 'Pricing & billing' }));
    expect(screen.getByRole('textbox', { name: 'Grace after day end (hours)' })).toHaveValue('12');
  });

  it('opens on Access and sync when it reopens after the EVE opt-in', () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/', state: { corpSyncGrant: { status: 'on' } } }]}
      >
        <BookProvider value={bookSettingsValue()}>
          <BookSettingsDialog open onClose={() => {}} />
        </BookProvider>
      </MemoryRouter>
    );
    expect(screen.getByRole('tab', { name: 'Access & sync' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });
});
