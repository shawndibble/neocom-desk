import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { throwForEsi } from './esiThrow.js';

const b = { budgetLow: false };
const h = new Headers();
const catchIt = (fn: () => unknown): HttpsError => {
  try {
    fn();
  } catch (e) {
    return e as HttpsError;
  }
  throw new Error('did not throw');
};

describe('throwForEsi', () => {
  it('returns ok', () => {
    const ok = { kind: 'ok', body: 1, headers: h, ...b } as const;
    expect(throwForEsi(ok)).toBe(ok);
  });
  it('maps backoff', () => {
    const e = catchIt(() => throwForEsi({ kind: 'backoff', retryAfterMs: null, ...b }));
    expect(e.code).toBe('resource-exhausted');
    expect(e.details).toEqual({ reason: 'esi-backoff' });
  });
  it('maps a rejection to unavailable', () => {
    const e = catchIt(() => throwForEsi({ kind: 'error', status: null, ...b }));
    expect(e.code).toBe('unavailable');
    expect(e.details).toEqual({ reason: 'esi-error' });
  });
  it('maps 5xx with the status in the message', () => {
    expect(catchIt(() => throwForEsi({ kind: 'error', status: 503, ...b })).message).toBe(
      'ESI answered 503'
    );
  });
  it('maps forbidden only when asked', () => {
    const e = catchIt(() => throwForEsi({ kind: 'forbidden', ...b }, { forbidden: true }));
    expect(e.code).toBe('permission-denied');
    expect(catchIt(() => throwForEsi({ kind: 'forbidden', ...b })).code).toBe('unavailable');
  });
  it('maps not-found only when given', () => {
    const nf = new HttpsError('not-found', 'x', { reason: 'killmail-not-found' });
    expect(catchIt(() => throwForEsi({ kind: 'not-found', ...b }, { notFound: nf }))).toBe(nf);
    expect(catchIt(() => throwForEsi({ kind: 'not-found', ...b })).code).toBe('unavailable');
  });
});
