import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { PricesUnavailable } from './PricesUnavailable';

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'onLine');
});

describe('PricesUnavailable', () => {
  it('asks for a connection check when online', () => {
    setOnline(true);
    render(<PricesUnavailable />);
    expect(screen.getByText('Prices unavailable right now')).toBeInTheDocument();
    expect(screen.getByText(/Check your connection/)).toBeInTheDocument();
  });

  it('says prices are unavailable offline when the browser is offline', () => {
    setOnline(false);
    render(<PricesUnavailable />);
    expect(screen.getByText('Prices unavailable offline')).toBeInTheDocument();
    expect(screen.getByText(/until you're back online/)).toBeInTheDocument();
    expect(screen.queryByText(/Check your connection/)).not.toBeInTheDocument();
  });
});
