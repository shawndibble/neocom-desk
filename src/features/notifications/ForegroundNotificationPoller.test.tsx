import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ForegroundNotificationPoller } from './ForegroundNotificationPoller';
import { runForegroundPoll, FIRST_POLL_DELAY_MS, POLL_INTERVAL_MS } from './foregroundPoller';

vi.mock('./foregroundPoller', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./foregroundPoller')>();
  return { ...actual, runForegroundPoll: vi.fn(async () => {}), liveDependencies: vi.fn() };
});

const leaderMock = vi.hoisted(() => {
  let leader = true;
  const listeners = new Set<() => void>();
  return {
    isTabLeader: () => leader,
    onTabLeaderChange: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Simulate the election: another tab leads (`false`) or this one does. */
    setLeader(next: boolean) {
      leader = next;
      listeners.forEach((listener) => listener());
    },
  };
});
vi.mock('@/lib/tabLeader', () => leaderMock);

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
}

afterEach(() => {
  cleanup();
  setHidden(false);
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('ForegroundNotificationPoller', () => {
  it('holds the first poll back while the visible route loads', () => {
    vi.useFakeTimers();
    render(<ForegroundNotificationPoller />);
    vi.advanceTimersByTime(FIRST_POLL_DELAY_MS - 1);
    expect(runForegroundPoll).not.toHaveBeenCalled();
  });

  it('polls once shortly after mount while visible', () => {
    vi.useFakeTimers();
    render(<ForegroundNotificationPoller />);
    vi.advanceTimersByTime(FIRST_POLL_DELAY_MS);
    expect(runForegroundPoll).toHaveBeenCalledTimes(1);
  });

  it('does not poll after mount while hidden', () => {
    vi.useFakeTimers();
    setHidden(true);
    render(<ForegroundNotificationPoller />);
    vi.advanceTimersByTime(FIRST_POLL_DELAY_MS);
    expect(runForegroundPoll).not.toHaveBeenCalled();
  });

  it('polls again every POLL_INTERVAL_MS while visible', () => {
    vi.useFakeTimers();
    render(<ForegroundNotificationPoller />);
    vi.advanceTimersByTime(FIRST_POLL_DELAY_MS);
    expect(runForegroundPoll).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(runForegroundPoll).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(runForegroundPoll).toHaveBeenCalledTimes(3);
  });

  it('skips a scheduled tick while hidden', () => {
    vi.useFakeTimers();
    render(<ForegroundNotificationPoller />);
    vi.advanceTimersByTime(FIRST_POLL_DELAY_MS);
    expect(runForegroundPoll).toHaveBeenCalledTimes(1);
    setHidden(true);
    vi.advanceTimersByTime(POLL_INTERVAL_MS);
    expect(runForegroundPoll).toHaveBeenCalledTimes(1);
  });

  it('runs an immediate catch-up poll on regaining visibility', () => {
    setHidden(true);
    render(<ForegroundNotificationPoller />);
    expect(runForegroundPoll).not.toHaveBeenCalled();
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(runForegroundPoll).toHaveBeenCalledTimes(1);
  });

  it('stops polling after unmount', () => {
    vi.useFakeTimers();
    const { unmount } = render(<ForegroundNotificationPoller />);
    vi.advanceTimersByTime(FIRST_POLL_DELAY_MS);
    expect(runForegroundPoll).toHaveBeenCalledTimes(1);
    unmount();
    vi.advanceTimersByTime(POLL_INTERVAL_MS * 2);
    expect(runForegroundPoll).toHaveBeenCalledTimes(1);
  });

  it('never runs the delayed first poll once unmounted', () => {
    vi.useFakeTimers();
    const { unmount } = render(<ForegroundNotificationPoller />);
    unmount();
    vi.advanceTimersByTime(FIRST_POLL_DELAY_MS);
    expect(runForegroundPoll).not.toHaveBeenCalled();
  });

  it('renders nothing', () => {
    const { container } = render(<ForegroundNotificationPoller />);
    expect(container).toBeEmptyDOMElement();
  });

  describe('with another tab leading', () => {
    afterEach(() => leaderMock.setLeader(true));

    it('does not poll while another tab leads', () => {
      vi.useFakeTimers();
      leaderMock.setLeader(false);
      render(<ForegroundNotificationPoller />);
      vi.advanceTimersByTime(FIRST_POLL_DELAY_MS + POLL_INTERVAL_MS);
      expect(runForegroundPoll).not.toHaveBeenCalled();
    });

    it('catches up at once on taking leadership over', () => {
      vi.useFakeTimers();
      leaderMock.setLeader(false);
      render(<ForegroundNotificationPoller />);
      vi.advanceTimersByTime(FIRST_POLL_DELAY_MS);
      leaderMock.setLeader(true);
      expect(runForegroundPoll).toHaveBeenCalledTimes(1);
    });

    it('winning leadership at boot still waits out the first-poll delay', () => {
      vi.useFakeTimers();
      leaderMock.setLeader(false);
      render(<ForegroundNotificationPoller />);
      leaderMock.setLeader(true);
      expect(runForegroundPoll).not.toHaveBeenCalled();
      vi.advanceTimersByTime(FIRST_POLL_DELAY_MS);
      expect(runForegroundPoll).toHaveBeenCalledTimes(1);
    });
  });
});
