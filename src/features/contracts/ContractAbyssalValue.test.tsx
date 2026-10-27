import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    expect(screen.getByText(/worth its own rolls/)).toBeInTheDocument();
  });
});
