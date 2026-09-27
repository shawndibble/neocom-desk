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
    reportBootStallOnce(10_000, 'require-character');
    expect(captureMessage).toHaveBeenCalledWith('Boot stalled on BootScreen', {
      level: 'warning',
      tags: { subsystem: 'boot' },
      extra: { afterMs: 10_000, gate: 'require-character' },
    });
  });

  it('reports once per session, however many times BootScreen remounts', async () => {
    const { reportBootStallOnce } = await import('./bootStallReport');
    reportBootStallOnce(10_000, 'root');
    reportBootStallOnce(10_000, 'root');
    reportBootStallOnce(10_000, 'root');
    // One stuck session, not one event per remount.
    expect(captureMessage).toHaveBeenCalledOnce();
  });
});

describe('reportBootStallResolved', () => {
  it('does nothing when no stall was ever reported', async () => {
    const { reportBootStallResolved } = await import('./bootStallReport');
    reportBootStallResolved();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('reports how long the gate took to resolve after a reported stall', async () => {
    vi.useFakeTimers();
    const { reportBootStallOnce, reportBootStallResolved } = await import('./bootStallReport');
    reportBootStallOnce(10_000, 'require-character');
    captureMessage.mockClear();
    vi.advanceTimersByTime(1_500);
    reportBootStallResolved();
    expect(captureMessage).toHaveBeenCalledWith('Boot stall resolved', {
      level: 'info',
      tags: { subsystem: 'boot' },
      extra: { resolvedAfterMs: 1_500 },
    });
    vi.useRealTimers();
  });

  it('reports the resolution only once, even called repeatedly', async () => {
    const { reportBootStallOnce, reportBootStallResolved } = await import('./bootStallReport');
    reportBootStallOnce(10_000, 'root');
    captureMessage.mockClear();
    reportBootStallResolved();
    reportBootStallResolved();
    expect(captureMessage).toHaveBeenCalledOnce();
  });
});
