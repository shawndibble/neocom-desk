import { describe, expect, it } from 'vitest';
import { registerTestReset, runTestResets } from './testResets';
import { FUZZWORK_AGGREGATES_URL } from '@/market/fuzzwork';
import { fetchAggregatesWithFallback } from '@/market/priceFallback';

describe('registerTestReset', () => {
  it('runs every registered reset, once each', () => {
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

describe('the Fuzzwork outage flag between tests', () => {
  let fuzzworkAsked = 0;
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
