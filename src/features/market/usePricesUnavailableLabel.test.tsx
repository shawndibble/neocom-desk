import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import '@/i18n';
import { usePricesUnavailableLabel } from './usePricesUnavailableLabel';

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'onLine');
});

describe('usePricesUnavailableLabel', () => {
  it('says "right now" when the connection is up (a source outage)', () => {
    setOnline(true);
    expect(renderHook(() => usePricesUnavailableLabel()).result.current).toBe(
      'Prices unavailable right now'
    );
  });

  it('says "offline" when the browser is offline', () => {
    setOnline(false);
    expect(renderHook(() => usePricesUnavailableLabel()).result.current).toBe(
      'Prices unavailable offline'
    );
  });
});
