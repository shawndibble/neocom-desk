import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureException } from '@sentry/react';
import { reportFailure, resetReportedFailures } from './reportFailure';
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
