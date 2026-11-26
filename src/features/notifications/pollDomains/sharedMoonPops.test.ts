import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedMoonPopFire } from '@/engine/notificationDiffs';
import type { SharedPopView } from '@/sync/sharedPops';
import { sharedMoonPopCopy } from './copy/sharedMoonPop';

const mocks = vi.hoisted(() => ({ loadSharedPopsCached: vi.fn() }));
vi.mock('../sharedPopsCache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sharedPopsCache')>()),
  loadSharedPopsCached: mocks.loadSharedPopsCached,
}));
vi.mock('@/features/character/moonNames', () => ({
  loadMoonNames: async () => new Map([[40001, 'Ainsan IV - Moon 2']]),
}));

import { DEFAULT_NOTIFICATION_PREFERENCES } from '../preferencesStore';
import { useNotificationPreferences } from '../preferences';
import { alertedSharedPops, sharedMoonPopEntries } from './sharedMoonPops';

const pop = (over: Partial<SharedPopView> = {}): SharedPopView => ({
  id: '98000001_1035_1762900000000',
  extractionId: '1035_1762900000000',
  moonId: 40001,
  structureId: 1035,
  refineryName: 'Efa - Moon Drill',
  solarSystemId: 30001,
  popTime: 'ready',
  popAt: '2026-11-15T14:00:00.000Z',
  fractured: false,
  startedAt: '2026-11-01T14:00:00.000Z',
  expiresAt: '2026-11-17T14:00:00.000Z',
  ore: null,
  notes: '',
  ratePct: 10,
  corporationId: 98000001,
  syncedAt: null,
  ...over,
});

describe('sharedMoonPopEntries', () => {
  it('turns a pop into an entry carrying the lead time', () => {
    expect(sharedMoonPopEntries([pop()], 7, 900_000, new Set())).toEqual([
      {
        popId: '98000001_1035_1762900000000',
        corporationId: 98000001,
        refineryName: 'Efa - Moon Drill',
        popTime: 'ready',
        popAtMs: Date.parse('2026-11-15T14:00:00.000Z'),
        ratePct: 10,
        leadMs: 900_000,
      },
    ]);
  });

  it('keeps a muted sharing corporation, marked, so an unmute needs no new poll', () => {
    expect(sharedMoonPopEntries([pop()], 7, 0, new Set([98000001]))).toEqual([
      expect.objectContaining({ popId: '98000001_1035_1762900000000', muted: true }),
    ]);
  });

  it('keeps only pops whose audience holds this Character, when the server says', () => {
    const pops = [pop({ viewerCharacterIds: [8] })];
    expect(sharedMoonPopEntries(pops, 7, 0, new Set())).toEqual([]);
    expect(sharedMoonPopEntries(pops, 8, 0, new Set())).toHaveLength(1);
    expect(sharedMoonPopEntries([pop()], 7, 0, new Set())).toHaveLength(1);
  });

  it('drops a pop with an unreadable Pop Time', () => {
    expect(sharedMoonPopEntries([pop({ popAt: 'soon' })], 7, 0, new Set())).toEqual([]);
  });
});

describe('sharedMoonPopCopy', () => {
  const fire: SharedMoonPopFire = {
    eventId: 'sharedMoonPop',
    characterId: 7,
    popId: '98000001_1035_1762900000000',
    corporationId: 98000001,
    refineryName: 'Efa - Moon Drill',
    popTime: 'auto-fracture',
    popAtMs: Date.parse('2026-11-15T14:00:00.000Z'),
    ratePct: 10,
    thresholdMs: 0,
  };

  it('reads a chunk fractured early as such, not as its Pop Time setting', () => {
    const names = { corporation: 'Ore Co', when: '14:00' };
    expect(sharedMoonPopCopy.poll(fire, 'Pilot', names).body).toBe(
      'Auto-fracture at 14:00 · Efa - Moon Drill · taxed by Ore Co · 10%'
    );
    expect(sharedMoonPopCopy.poll({ ...fire, early: true }, 'Pilot', names).body).toBe(
      'Fractured early at 14:00 · Efa - Moon Drill · taxed by Ore Co · 10%'
    );
  });

  it('names the refinery in the body, poll and push alike, and leaves it out when unnamed', () => {
    const names = { corporation: 'Ore Co', when: '14:00' };
    expect(sharedMoonPopCopy.push(fire, 'Pilot', names).body).toBe(
      'Auto-fracture at 14:00 · Efa - Moon Drill · taxed by Ore Co · 10%'
    );
    const unnamed = { ...fire, refineryName: null };
    expect(sharedMoonPopCopy.poll(unnamed, 'Pilot', names).body).toBe(
      'Auto-fracture at 14:00 · taxed by Ore Co · 10%'
    );
    expect(sharedMoonPopCopy.push(unnamed, 'Pilot', names).body).toBe(
      'Auto-fracture at 14:00 · taxed by Ore Co · 10%'
    );
  });
});

describe('alertedSharedPops', () => {
  const setPrefs = (over: Partial<typeof DEFAULT_NOTIFICATION_PREFERENCES>) =>
    useNotificationPreferences.setState({
      value: { ...DEFAULT_NOTIFICATION_PREFERENCES, ...over },
      hydrated: true,
    });

  beforeEach(() => {
    mocks.loadSharedPopsCached.mockReset();
    setPrefs({});
  });

  it('returns the pops that alert this Character, with the moon name', async () => {
    mocks.loadSharedPopsCached.mockResolvedValue([pop()]);
    expect(await alertedSharedPops(7)).toEqual([{ pop: pop(), moonName: 'Ainsan IV - Moon 2' }]);
  });

  it('leaves out a pop for another audience', async () => {
    mocks.loadSharedPopsCached.mockResolvedValue([pop({ viewerCharacterIds: [8] })]);
    expect(await alertedSharedPops(7)).toEqual([]);
  });

  it('keeps a muted sharing corporation: dismissing the pop must not let its event alert', async () => {
    mocks.loadSharedPopsCached.mockResolvedValue([pop()]);
    setPrefs({ mutedSharedPopCorporations: [98000001] });
    expect(await alertedSharedPops(7)).toEqual([{ pop: pop(), moonName: 'Ainsan IV - Moon 2' }]);
  });

  it('returns none when Shared moon pop alerts are off for the Character, so the event keeps alerting', async () => {
    mocks.loadSharedPopsCached.mockResolvedValue([pop()]);
    setPrefs({ perCharacter: { '7': { sharedMoonPop: false } } });
    expect(await alertedSharedPops(7)).toEqual([]);
  });

  it('returns none when the read fails', async () => {
    mocks.loadSharedPopsCached.mockRejectedValue(new Error('offline'));
    expect(await alertedSharedPops(7)).toEqual([]);
  });
});
