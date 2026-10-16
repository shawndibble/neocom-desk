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
});
