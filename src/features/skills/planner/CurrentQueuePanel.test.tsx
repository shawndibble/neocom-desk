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

  it('shows an empty state once the (empty) periodic refetch settles', async () => {
    render(<CurrentQueuePanel characterId={1} catalog={catalog} />);
    await flush();
    expect(screen.getByText('No active in-game training queue cached.')).toBeInTheDocument();
  });
});
