import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { ContractMarketValueRow } from './ContractMarketValueRow';

describe('ContractMarketValueRow', () => {
  it('shows the total and the unpriced count when the market answered', () => {
    render(
      <ContractMarketValueRow
        value={{ total: 1000, unpriced: 1, unreachable: false }}
        hubName="Jita"
      />
    );
    expect(screen.getByText(/1 item unpriced/)).toBeInTheDocument();
    expect(screen.queryByText('Prices unavailable right now')).not.toBeInTheDocument();
  });

  it('shows a placeholder, not 0 ISK, when every line failed because prices were unreachable', () => {
    render(
      <ContractMarketValueRow value={{ total: 0, unpriced: 3, unreachable: true }} hubName="Jita" />
    );
    expect(screen.getByText('Prices unavailable right now')).toBeInTheDocument();
    expect(screen.queryByText(/unpriced/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ISK/)).not.toBeInTheDocument();
  });

  it('still shows the total when an override priced some lines despite the outage', () => {
    render(
      <ContractMarketValueRow
        value={{ total: 5000, unpriced: 1, unreachable: true }}
        hubName="Jita"
      />
    );
    expect(screen.queryByText('Prices unavailable right now')).not.toBeInTheDocument();
  });

  it('values abyssal modules on their own line, never inside the market figure', () => {
    render(
      <ContractMarketValueRow
        value={{
          total: 1000,
          unpriced: 0,
          unreachable: false,
          abyssal: { estimated: 90_000_000, priced: 1, unpriced: 1, onlyAbyssal: false },
        }}
        hubName="Jita"
      />
    );
    expect(screen.getByText('Market value at Jita (sell orders)')).toBeInTheDocument();
    expect(screen.getByText('Abyssal modules (MutaMarket estimate)')).toBeInTheDocument();
    expect(screen.getByText('(1 not priced)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Price from MutaMarket/ })).toBeInTheDocument();
  });

  it('shows only the abyssal line, saying why, when every line is abyssal and unpriced', () => {
    render(
      <ContractMarketValueRow
        value={{
          total: 0,
          unpriced: 0,
          unreachable: false,
          abyssal: { estimated: 0, priced: 0, unpriced: 2, onlyAbyssal: true },
        }}
        hubName="Jita"
      />
    );
    expect(screen.queryByText(/Market value at/)).not.toBeInTheDocument();
    expect(screen.getByText('Not priced')).toBeInTheDocument();
    expect(screen.getByText(/worth its own rolls/)).toBeInTheDocument();
  });
});
