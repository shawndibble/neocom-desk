import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { ContractAbyssalValue } from './ContractAbyssalValue';

describe('ContractAbyssalValue', () => {
  it('values abyssal modules on their own line, with the estimate and what is not priced', () => {
    render(<ContractAbyssalValue value={{ estimated: 90_000_000, priced: 1, unpriced: 1 }} />);
    expect(screen.getByText('Abyssal modules (MutaMarket estimate)')).toBeInTheDocument();
    expect(screen.getByText('(1 not priced)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Price from MutaMarket/ })).toBeInTheDocument();
  });

  it('says why, rather than showing 0, when no module could be priced', () => {
    render(<ContractAbyssalValue value={{ estimated: 0, priced: 0, unpriced: 2 }} />);
    expect(screen.getByText('Not priced')).toBeInTheDocument();
    expect(screen.getByText(/couldn't be estimated/)).toBeInTheDocument();
  });

  it('offers to narrow the contents to abyssal modules, and back', async () => {
    const onToggle = vi.fn();
    const value = { estimated: 1, priced: 1, unpriced: 0 };
    const { rerender } = render(
      <ContractAbyssalValue value={value} abyssalOnly={false} onToggleAbyssalOnly={onToggle} />
    );
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Show only abyssal modules' }));
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(<ContractAbyssalValue value={value} abyssalOnly onToggleAbyssalOnly={onToggle} />);
    expect(screen.getByRole('button', { name: 'Show all items' })).toBeInTheDocument();
  });
});
