import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { loadJumpTimersWidget } from './jumpTimers';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const HOUR = 3_600_000;

const mocks = vi.hoisted(() => ({
  clones: vi.fn(),
  fatigue: vi.fn(),
  skills: vi.fn(),
}));

vi.mock('@/features/character/clones', () => ({ loadCharacterClones: mocks.clones }));
vi.mock('@/features/skills/correctedSkills', () => ({ loadCorrectedSkills: mocks.skills }));
vi.mock('@/esi/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/esi/cache')>()),
  loadWithCacheStatus: mocks.fatigue,
}));

const CLONES = 'esi-clones.read_clones.v1';
const FATIGUE = 'esi-characters.read_fatigue.v1';

async function grant(...scopes: string[]) {
  await db.tokens.put({ characterId: 7, scopes } as never);
}

const cached = (data: object) => ({
  cached: { data, fetchedAt: new Date(NOW) },
  needsReauth: false,
});

describe('loadJumpTimersWidget', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    await db.tokens.clear();
    mocks.clones.mockReset();
    mocks.fatigue.mockReset();
    mocks.skills.mockReset().mockResolvedValue({ effective: new Map([[33399, 4]]) });
    return () => vi.useRealTimers();
  });

  it('reads nothing and asks for both permissions when neither scope is granted', async () => {
    await grant();
    const data = await loadJumpTimersWidget(7);
    expect(data.clone).toEqual({ state: 'needsPermission' });
    expect(data.fatigue).toEqual({ state: 'needsPermission' });
    expect(mocks.clones).not.toHaveBeenCalled();
    expect(mocks.fatigue).not.toHaveBeenCalled();
  });

  it('applies Infomorph Synchronizing to the clone cooldown and reads the fatigue expiry', async () => {
    await grant(CLONES, FATIGUE);
    mocks.clones.mockResolvedValue(
      cached({ jump_clones: [], last_clone_jump_date: new Date(NOW - 2 * HOUR).toISOString() })
    );
    mocks.fatigue.mockResolvedValue(
      cached({ jump_fatigue_expire_date: new Date(NOW + 5 * HOUR).toISOString() })
    );
    const data = await loadJumpTimersWidget(7);
    // 24h - level 4 = 20h cooldown, 2h already spent.
    expect(data.clone).toEqual({ state: 'read', endsAt: NOW + 18 * HOUR });
    expect(data.fatigue).toEqual({ state: 'read', endsAt: NOW + 5 * HOUR });
  });

  it('reads a pilot with no jump history as nothing running', async () => {
    await grant(CLONES, FATIGUE);
    mocks.clones.mockResolvedValue(cached({ jump_clones: [] }));
    mocks.fatigue.mockResolvedValue(cached({}));
    const data = await loadJumpTimersWidget(7);
    expect(data.clone).toEqual({ state: 'read', endsAt: null });
    expect(data.fatigue).toEqual({ state: 'read', endsAt: null });
  });

  it('reads only the granted timer on a partial grant', async () => {
    await grant(CLONES);
    mocks.clones.mockResolvedValue(cached({ jump_clones: [] }));
    const data = await loadJumpTimersWidget(7);
    expect(data.clone.state).toBe('read');
    expect(data.fatigue).toEqual({ state: 'needsPermission' });
    expect(mocks.fatigue).not.toHaveBeenCalled();
  });

  it('throws when ESI did not answer, so the widget keeps its last value', async () => {
    await grant(CLONES, FATIGUE);
    mocks.clones.mockResolvedValue(cached({ jump_clones: [] }));
    mocks.fatigue.mockResolvedValue({ cached: null, needsReauth: false, fetchFailed: true });
    await expect(loadJumpTimersWidget(7)).rejects.toThrow();
  });
});
