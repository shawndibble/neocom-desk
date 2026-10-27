import { describe, it, expect } from 'vitest';
import { consumeStaleStores, markStoresStale } from './staleStoresReload';

describe('staleStoresReload', () => {
  it('is false when nothing was marked', () => {
    expect(consumeStaleStores()).toBe(false);
  });

  it('consumes true once after marking, even when marked twice', () => {
    markStoresStale();
    markStoresStale();
    expect(consumeStaleStores()).toBe(true);
    expect(consumeStaleStores()).toBe(false);
  });
});
