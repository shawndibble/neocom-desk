import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MarketItemLink } from './MarketItemLink';

describe('MarketItemLink', () => {
  it('links to the Market listing for the given type', () => {
    render(
      <MemoryRouter initialEntries={['/wallet']}>
        <MarketItemLink typeId={9899}>Ocular Filter - Basic</MarketItemLink>
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Ocular Filter - Basic' })).toHaveAttribute(
      'href',
      '/market?type=9899'
    );
  });

  it('preserves an existing region param when the current page has one', () => {
    render(
      <MemoryRouter initialEntries={['/market?region=10000002']}>
        <MarketItemLink typeId={9899}>Ocular Filter - Basic</MarketItemLink>
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Ocular Filter - Basic' })).toHaveAttribute(
      'href',
      '/market?type=9899&region=10000002'
    );
  });
});
