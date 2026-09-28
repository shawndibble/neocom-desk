import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import '@/i18n';
import { CurrentQueuePanel } from './CurrentQueuePanel';
import type { CachedResult } from '../data';
import type { SkillQueueEntry } from '@/esi/endpoints';
import type { SkillCatalog } from '../skillMap';

const loadCharacterSkillQueue =
  vi.fn<(characterId: number) => Promise<CachedResult<SkillQueueEntry[]> | null>>();

vi.mock('../data', () => ({
  loadCharacterSkillQueue: (characterId: number) => loadCharacterSkillQueue(characterId),
}));

const catalog = { bySkillTypeID: new Map() } as unknown as SkillCatalog;

function result(entries: SkillQueueEntry[]): CachedResult<SkillQueueEntry[]> {
  return { data: entries, fetchedAt: new Date(), fromCache: false, truncated: false };
}

/** Flush the microtask queue (the mocked loader's resolved promise) without relying on RTL's waitFor, which polls with real timers and hangs under `vi.useFakeTimers()`. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('CurrentQueuePanel periodic ESI refetch (#408)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    loadCharacterSkillQueue.mockReset();
    loadCharacterSkillQueue.mockResolvedValue(result([]));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches once on mount', async () => {
    render(<CurrentQueuePanel characterId={1} catalog={catalog} />);
    await flush();
    expect(loadCharacterSkillQueue).toHaveBeenCalledTimes(1);
  });

  it('refetches from ESI on a periodic interval, not just once on mount', async () => {
    render(<CurrentQueuePanel characterId={1} catalog={catalog} />);
    await flush();
    expect(loadCharacterSkillQueue).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(loadCharacterSkillQueue).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(loadCharacterSkillQueue).toHaveBeenCalledTimes(3);
  });

  it('stops refetching once unmounted', async () => {
    const { unmount } = render(<CurrentQueuePanel characterId={1} catalog={catalog} />);
    await flush();
    expect(loadCharacterSkillQueue).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(loadCharacterSkillQueue).toHaveBeenCalledTimes(1);
  });

  it('skips the refetch while the tab is hidden and catches up as soon as it is shown', async () => {
    const setHidden = (hidden: boolean) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    try {
      render(<CurrentQueuePanel characterId={1} catalog={catalog} />);
      await flush();
      expect(loadCharacterSkillQueue).toHaveBeenCalledTimes(1);

      setHidden(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15 * 60_000);
      });
      expect(loadCharacterSkillQueue).toHaveBeenCalledTimes(1);

      await act(async () => setHidden(false));
      expect(loadCharacterSkillQueue).toHaveBeenCalledTimes(2);
    } finally {
      setHidden(false);
    }
  });

  it('does not refetch again on the scheduled tick just after a visibility catch-up', async () => {
    const setHidden = (hidden: boolean) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    try {
      render(<CurrentQueuePanel characterId={1} catalog={catalog} />);
      await flush();
      setHidden(true);
      // Hidden across the 5-minute tick; shown two seconds before the 10-minute one.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10 * 60_000 - 2_000);
      });
      await act(async () => setHidden(false));
      expect(loadCharacterSkillQueue).toHaveBeenCalledTimes(2);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(loadCharacterSkillQueue).toHaveBeenCalledTimes(2);
    } finally {
      setHidden(false);
    }
  });

  it('does not refetch on becoming visible when the last fetch is still fresh', async () => {
    render(<CurrentQueuePanel characterId={1} catalog={catalog} />);
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(loadCharacterSkillQueue).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state once the (empty) periodic refetch settles', async () => {
    render(<CurrentQueuePanel characterId={1} catalog={catalog} />);
    await flush();
    expect(screen.getByText('No active in-game training queue cached.')).toBeInTheDocument();
  });
});
