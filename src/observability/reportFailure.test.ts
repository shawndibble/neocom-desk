import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureException } from '@sentry/react';
import { annotateFailure, reportFailure, resetReportedFailures } from './reportFailure';
import { scrubEvent } from './scrub';

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));
const online = vi.hoisted(() => ({ value: true }));
vi.mock('@/stores/network', () => ({ isOnline: () => online.value }));

describe('reportFailure', () => {
  beforeEach(() => {
    vi.mocked(captureException).mockClear();
    resetReportedFailures();
    online.value = true;
  });

  it('captures an unexpected failure tagged with only its subsystem', () => {
    const err = new Error('boom');
    reportFailure('sync', err);
    expect(captureException).toHaveBeenCalledWith(err, { tags: { subsystem: 'sync' } });
  });

  it('skips offline and network failures', () => {
    reportFailure('esi', Object.assign(new Error('x'), { status: 0 }));
    reportFailure('sync', Object.assign(new Error('x'), { code: 'unavailable' }));
    reportFailure('sync', Object.assign(new Error('x'), { code: 'functions/unavailable' }));
    reportFailure('sync', new TypeError('Failed to fetch'));
    online.value = false;
    reportFailure('sync', new Error('anything'));
    expect(captureException).not.toHaveBeenCalled();
  });

  it('skips a dead SSO grant, but not other token endpoint failures', () => {
    const authError = (code: string) =>
      Object.assign(new Error(`${code}: x`), { name: 'AuthError', code });
    reportFailure('sync', authError('invalid_grant'));
    expect(captureException).not.toHaveBeenCalled();
    reportFailure('sync', authError('unknown_error'));
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('skips an aggregate only when every member is a network failure', () => {
    const net = Object.assign(new Error('x'), { code: 'unavailable' });
    reportFailure('sync', new AggregateError([net, net], 'x (and 1 more)'));
    expect(captureException).not.toHaveBeenCalled();
    reportFailure('sync', new AggregateError([net, new Error('real')], 'x (and 1 more)'));
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('adds the annotation, or else the error code, to the tags', () => {
    const annotated = new Error('a');
    annotateFailure(annotated, { failed_collections: 'plans,settings' });
    reportFailure('sync', annotated);
    expect(captureException).toHaveBeenLastCalledWith(annotated, {
      tags: { failed_collections: 'plans,settings', subsystem: 'sync' },
    });
    const coded = Object.assign(new Error('b'), { code: 'functions/internal' });
    reportFailure('sync', coded);
    expect(captureException).toHaveBeenLastCalledWith(coded, {
      tags: { error_codes: 'functions/internal', subsystem: 'sync' },
    });
  });

  it('dedupes a repeated message inside the window, reports again after it', () => {
    reportFailure('sync', new Error('same'), 1_000);
    reportFailure('sync', new Error('same'), 2_000);
    expect(captureException).toHaveBeenCalledTimes(1);
    reportFailure('sync', new Error('same'), 1_000 + 11 * 60_000);
    expect(captureException).toHaveBeenCalledTimes(2);
  });

  it('scrubs a token quoted in the captured error before it ships', () => {
    const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln';
    const scrubbed = scrubEvent({
      exception: {
        values: [
          {
            value: `refresh failed {"refresh_token":"abc123secret"} Authorization: Bearer ${jwt}`,
          },
        ],
      },
    });
    const text = scrubbed.exception?.values?.[0]?.value ?? '';
    expect(text).not.toContain('abc123secret');
    expect(text).not.toContain(jwt);
    expect(text).toContain('[redacted]');
  });
});

describe('reportFailure edge cases', () => {
  beforeEach(() => {
    vi.mocked(captureException).mockClear();
    resetReportedFailures();
    online.value = true;
  });

  it('reports a TypeError that merely mentions fetch in a property name', () => {
    reportFailure(
      'sync',
      new TypeError("Cannot read properties of undefined (reading 'fetchedAt')")
    );
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('wraps a non-Error value with its secrets redacted', () => {
    reportFailure('auth', { body: 'refresh_token: abc123secret' });
    const sent = vi.mocked(captureException).mock.calls[0][0] as Error;
    expect(sent).toBeInstanceOf(Error);
    expect(sent.message).not.toContain('abc123secret');
  });
});
