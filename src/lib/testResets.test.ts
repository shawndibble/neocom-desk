import { describe, expect, it } from 'vitest';
import { registerTestReset, runTestResets } from './testResets';
import { FUZZWORK_AGGREGATES_URL } from '@/market/fuzzwork';
import { fetchAggregatesWithFallback } from '@/market/priceFallback';

describe('registerTestReset', () => {
  it('runs every registered reset, once each', () => {
    // Stays registered for the rest of this file; it only counts.
    let calls = 0;
    const reset = () => {
      calls += 1;
    };
    registerTestReset(reset);
    registerTestReset(reset);
    runTestResets();
    expect(calls).toBe(1);
  });
});

/**
 * The leak this exists for: a request aborted at a test's end marks Fuzzwork
 * down, and without the shared reset the next test skips Fuzzwork entirely.
 * The two tests run in order on purpose: the second is the one that fails
 * without `vitest.setup.ts`'s `runTestResets`.
 */
describe('the Fuzzwork outage flag between tests', () => {
  let fuzzworkAsked = 0;
  // Every source fails as an aborted request does; only Fuzzwork's asks are counted.
  const failing = ((input: RequestInfo | URL) => {
    if (String(input).startsWith(FUZZWORK_AGGREGATES_URL)) fuzzworkAsked += 1;
    return Promise.reject(new DOMException('aborted', 'AbortError'));
  }) as typeof fetch;

  it('records the outage', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = failing;
    try {
      await expect(fetchAggregatesWithFallback(1, [34], 'region')).rejects.toThrow();
    } finally {
      globalThis.fetch = original;
    }
    expect(fuzzworkAsked).toBeGreaterThan(0);
  });

  it('is forgotten by the next test', async () => {
    fuzzworkAsked = 0;
    const original = globalThis.fetch;
    globalThis.fetch = failing;
    try {
      await expect(fetchAggregatesWithFallback(1, [34], 'region')).rejects.toThrow();
    } finally {
      globalThis.fetch = original;
    }
    expect(fuzzworkAsked).toBeGreaterThan(0);
  });
});
