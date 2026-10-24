import { beforeEach, describe, expect, it, vi } from 'vitest';
import { occurrenceKey } from '@/engine/occurrenceKey';
import { loadRaidableList } from '@/features/overview/widgets/data/sovRaidsLoader';
import { loadCurrentSystemId } from '@/features/route/currentSystem';
import { loadJumpBasis } from '@/features/route/jumpBasis';
import { localJumpDistances } from '@/features/route/localRoute';
import { notificationUrlForSubject } from './notificationOptions';
import { skyhookRaidableNearbyCopy } from './pollDomains/copy/skyhooksNearby';
import { skyhookNearbyDomain } from './pollDomains/skyhooksNearby';
import { DEFAULT_NOTIFICATION_PREFERENCES, useNotificationPreferences } from './preferences';

vi.mock('@/features/route/currentSystem', () => ({ loadCurrentSystemId: vi.fn() }));
vi.mock('@/features/route/jumpBasis', () => ({ loadJumpBasis: vi.fn() }));
vi.mock('@/features/route/localRoute', () => ({ localJumpDistances: vi.fn() }));
vi.mock('@/features/overview/widgets/data/sovRaidsLoader', () => ({ loadRaidableList: vi.fn() }));
vi.mock('@/features/overview/widgets/data/spaceLookups', () => ({ planetInfo: vi.fn() }));
vi.mock('@/sde/solarSystems', () => ({ lookupSolarSystem: vi.fn() }));

const CHARACTER = 90000001;
const HOME = 30000142;
const BASIS = { rules: { preference: 'shortest', securityPenalty: 50, avoid: [] }, network: {} };
const WINDOW = { start: '2026-10-23T10:00:00Z', end: '2026-10-23T14:00:00Z' };

function list(skyhooks: unknown[]) {
  return { data: { skyhooks }, fetchedAt: new Date(), fromCache: false } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadCurrentSystemId).mockResolvedValue(HOME);
  vi.mocked(loadRaidableList).mockResolvedValue(
    list([
      { solar_system_id: 30000144, planet_id: 40000001, theft_vulnerability: WINDOW },
      { solar_system_id: 30000145, planet_id: 40000002 },
    ])
  );
  vi.mocked(loadJumpBasis).mockResolvedValue(BASIS as never);
  vi.mocked(localJumpDistances).mockResolvedValue({
    kind: 'known',
    jumps: new Map([[30000144, 3]]),
  });
  useNotificationPreferences.setState({ value: DEFAULT_NOTIFICATION_PREFERENCES, hydrated: true });
});

describe('skyhookNearbyDomain.load (issue #4784)', () => {
  it('counts each readable window from the Current System, dropping listings with none', async () => {
    expect(await skyhookNearbyDomain.load(CHARACTER)).toEqual([
      {
        systemId: 30000144,
        planetId: 40000001,
        startMs: Date.parse(WINDOW.start),
        endMs: Date.parse(WINDOW.end),
        jumps: 3,
        originSystemId: HOME,
        withinJumps: 5,
      },
    ]);
    expect(loadRaidableList).toHaveBeenCalledTimes(1);
    expect(localJumpDistances).toHaveBeenCalledTimes(1);
  });

  it('skips the poll when the list or the location cannot be read', async () => {
    vi.mocked(loadRaidableList).mockResolvedValue(null);
    expect(await skyhookNearbyDomain.load(CHARACTER)).toBeNull();
    vi.mocked(loadRaidableList).mockRejectedValue(new Error('down'));
    expect(await skyhookNearbyDomain.load(CHARACTER)).toBeNull();
    vi.mocked(loadCurrentSystemId).mockResolvedValue(null);
    expect(await skyhookNearbyDomain.load(CHARACTER)).toBeNull();
  });

  it('skips the poll when no route can be counted', async () => {
    vi.mocked(localJumpDistances).mockResolvedValue({ kind: 'unknown' } as never);
    expect(await skyhookNearbyDomain.load(CHARACTER)).toBeNull();
  });
});

describe('skyhookRaidableNearby identity', () => {
  const fire = {
    eventId: 'skyhookRaidableNearby' as const,
    characterId: CHARACTER,
    systemId: 30000144,
    planetId: 40000001,
    startMs: 1000,
    endMs: 2000,
    jumps: 3,
  };

  it('is one occurrence per skyhook per window, whenever it is seen', () => {
    expect(occurrenceKey(fire, 5)).toBe(occurrenceKey(fire, 99_999_999));
    expect(occurrenceKey({ ...fire, startMs: 3000 }, 5)).not.toBe(occurrenceKey(fire, 5));
  });

  it('opens the Overview', () => {
    expect(notificationUrlForSubject('skyhookRaidableNearby', fire.systemId)).toContain(
      '/overview'
    );
  });
});

describe('skyhookRaidableNearby copy', () => {
  const fire = {
    eventId: 'skyhookRaidableNearby' as const,
    characterId: CHARACTER,
    systemId: 30000144,
    planetId: 40000001,
    startMs: Date.now() + 3_600_000,
    endMs: Date.now() + 7_200_000,
    jumps: 5,
  };
  const body = (names: { planet?: string; system?: string }) =>
    skyhookRaidableNearbyCopy.poll(fire, 'Pilot', names).body;

  it('does not repeat the system a planet name already leads with', () => {
    expect(body({ planet: '60M-TG I', system: '60M-TG' })).toMatch(/^60M-TG I can be raided/);
  });

  it('names the system for a planet whose name does not carry it', () => {
    expect(body({ planet: 'Moon', system: 'Efa' })).toMatch(/^Moon in Efa can be raided/);
  });

  it('falls back to a generic skyhook, not a planet id', () => {
    expect(body({ system: 'U-HYZN' })).toMatch(/^A skyhook in U-HYZN can be raided/);
  });
});
