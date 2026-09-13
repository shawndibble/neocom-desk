import { describe, it, expect, vi, beforeEach } from 'vitest';

const { captureMessage } = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock('@sentry/react', () => ({ captureMessage }));

beforeEach(() => {
  vi.resetModules();
  captureMessage.mockClear();
});

describe('reportBootStallOnce', () => {
  it('reports the stall with the tag that pairs it with the blocked-upgrade report', async () => {
    const { reportBootStallOnce } = await import('./bootStallReport');
    reportBootStallOnce(10_000);
    expect(captureMessage).toHaveBeenCalledWith('Boot stalled on BootScreen', {
      level: 'warning',
      tags: { subsystem: 'boot' },
      extra: { afterMs: 10_000 },
    });
  });

  it('reports once per session, however many times BootScreen remounts', async () => {
    const { reportBootStallOnce } = await import('./bootStallReport');
    reportBootStallOnce(10_000);
    reportBootStallOnce(10_000);
    reportBootStallOnce(10_000);
    // Three render sites, each re-arming a timer on a wedged database: without
    // the latch one stuck session files an unbounded number of events.
    expect(captureMessage).toHaveBeenCalledOnce();
  });
});
