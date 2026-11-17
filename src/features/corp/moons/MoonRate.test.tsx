import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { TaxRate } from '@/engine/corpTaxBook/rates';
import { MoonRate } from './MoonRate';

const book = vi.hoisted(() => ({
  rates: [] as TaxRate[],
  canEdit: true,
  edit: vi.fn(),
}));
vi.mock('./useBook', () => ({
  useBook: () => ({
    canEdit: book.canEdit,
    edit: book.edit,
    view: { input: { rates: book.rates } },
  }),
}));

const corp: TaxRate = { scope: 'corp', pct: 10, effectiveFrom: '2026-01-01' };

describe('MoonRate', () => {
  beforeEach(() => {
    book.rates = [corp];
    book.canEdit = true;
    book.edit.mockReset().mockResolvedValue({});
  });

  it('shows the rate in force and where it comes from', () => {
    render(<MoonRate target={{ structureId: 5, moonId: 9 }} />);
    expect(screen.getByText('10%')).toBeTruthy();
    expect(screen.getByText(/the corp default/)).toBeTruthy();
  });

  it('names the moon as the source once a moon rate is set', () => {
    book.rates = [corp, { scope: 'moon', moonId: 9, pct: 6, effectiveFrom: '2026-02-01' }];
    render(<MoonRate target={{ structureId: 5, moonId: 9 }} />);
    expect(screen.getByText('6%')).toBeTruthy();
    expect(screen.getByText(/set on this moon/)).toBeTruthy();
  });

  it('says a Miner rate still wins', () => {
    book.rates = [corp, { scope: 'miner', minerId: 'm1', pct: 3, effectiveFrom: '2026-02-01' }];
    render(<MoonRate target={{ structureId: 5, moonId: 9 }} />);
    expect(screen.getByText(/Miner's own rate still beats/)).toBeTruthy();
  });

  it('gives a viewer the figure and no control', () => {
    book.canEdit = false;
    render(<MoonRate target={{ structureId: 5, moonId: 9 }} />);
    expect(screen.getByText('10%')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change rate' })).toBeNull();
  });

  it('an officer saves a moon rate as the same addRate Settings writes', async () => {
    const user = userEvent.setup();
    render(<MoonRate target={{ structureId: 5, moonId: 9 }} />);
    await user.click(screen.getByRole('button', { name: 'Change rate' }));
    await user.type(screen.getByLabelText('Rate (%)'), '8');
    await user.click(screen.getByRole('button', { name: 'Save rate' }));
    await waitFor(() => expect(book.edit).toHaveBeenCalledTimes(1));
    expect(book.edit.mock.calls[0][0]).toMatchObject({
      action: 'addRate',
      rate: { scope: 'moon', moonId: 9, pct: 8 },
    });
  });

  it('a refinery with no known moon sets a structure rate', async () => {
    const user = userEvent.setup();
    render(<MoonRate target={{ structureId: 5 }} />);
    await user.click(screen.getByRole('button', { name: 'Change rate' }));
    await user.type(screen.getByLabelText('Rate (%)'), '4');
    await user.click(screen.getByRole('button', { name: 'Save rate' }));
    await waitFor(() => expect(book.edit).toHaveBeenCalledTimes(1));
    expect(book.edit.mock.calls[0][0]).toMatchObject({
      action: 'addRate',
      rate: { scope: 'structure', structureId: 5, pct: 4 },
    });
  });
});
