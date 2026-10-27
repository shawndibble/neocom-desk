import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncursionEntry } from '@/engine/incursions/incursionRows';
import type { IncursionNearbyFire } from '@/engine/incursions/incursionAlert';
import { occurrenceKey } from '@/engine/occurrenceKey';
import { loadCurrentSystemId } from '@/features/route/currentSystem';
import { loadJumpBasis } from '@/features/route/jumpBasis';
import { localJumpDistances } from '@/features/route/localRoute';
import { loadConstellationNames, loadIncursions } from '@/features/travel/incursionsData';
import { lookupSolarSystem } from '@/sde/solarSystems';
import { notificationUrlForSubject } from './notificationOptions';
import { incursionDomain } from './pollDomains/incursions';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  useNotificationPreferences,
  withCharacterEventThreshold,
} from './preferences';

vi.mock('@/features/route/currentSystem', () => ({ loadCurrentSystemId: vi.fn() }));
vi.mock('@/features/route/jumpBasis', () => ({ loadJumpBasis: vi.fn() }));
vi.mock('@/features/route/localRoute', () => ({ localJumpDistances: vi.fn() }));
vi.mock('@/features/travel/incursionsData', () => ({
  loadIncursions: vi.fn(),
  loadConstellationNames: vi.fn(),
}));
vi.mock('@/sde/solarSystems', () => ({ lookupSolarSystem: vi.fn() }));

const CHARACTER = 90000001;
const HOME = 30000142;
const BASIS = { rules: { preference: 'shortest', securityPenalty: 50, avoid: [] }, network: {} };

function incursion(overrides: Partial<IncursionEntry> = {}): IncursionEntry {
  return {
    constellation_id: 20000020,
    faction_id: 500019,
    has_boss: false,
    infested_solar_systems: [30000144],
    influence: 0.4,
    staging_solar_system_id: 30000144,
    state: 'established',
    type: 'Incursion',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadCurrentSystemId).mockResolvedValue(HOME);
  vi.mocked(loadIncursions).mockResolvedValue({ entries: [incursion()] });
  vi.mocked(loadJumpBasis).mockResolvedValue(BASIS as never);
  vi.mocked(localJumpDistances).mockResolvedValue({
    kind: 'known',
    jumps: new Map([[30000144, 4]]),
  });
  useNotificationPreferences.setState({ value: DEFAULT_NOTIFICATION_PREFERENCES, hydrated: true });
});

describe('incursionDomain.load (issue #3542)', () => {
  it("counts every Incursion from the Current System under Route Safety's basis, with the frame baked in", async () => {
    vi.mocked(loadIncursions).mockResolvedValue({
      entries: [incursion(), incursion({ constellation_id: 2, staging_solar_system_id: 31 })],
    });
    expect(await incursionDomain.load(CHARACTER)).toEqual([
      {
        constellationId: 20000020,
        stagingSystemId: 30000144,
        state: 'established',
        jumps: 4,
        originSystemId: HOME,
        withinJumps: 5,
      },
      {
        constellationId: 2,
        stagingSystemId: 31,
        state: 'established',
        jumps: null,
        originSystemId: HOME,
        withinJumps: 5,
      },
    ]);
    expect(localJumpDistances).toHaveBeenCalledTimes(1);
    expect(localJumpDistances).toHaveBeenCalledWith(HOME, BASIS.rules, BASIS.network);
  });

  it("reads the Character's own N", async () => {
    useNotificationPreferences.setState({
      value: withCharacterEventThreshold(
        DEFAULT_NOTIFICATION_PREFERENCES,
        CHARACTER,
        'incursionNearbyJumps',
        10
      ),
      hydrated: true,
    });
    const [entry] = (await incursionDomain.load(CHARACTER)) as { withinJumps: number }[];
    expect(entry.withinJumps).toBe(10);
  });

  it('drops an Incursion in a state it does not know, as the Incursions panel does', async () => {
    vi.mocked(loadIncursions).mockResolvedValue({
      entries: [incursion({ state: 'retreating' as never })],
    });
    expect(await incursionDomain.load(CHARACTER)).toEqual([]);
  });

  it('skips the poll rather than writing an empty baseline when an input is unreadable', async () => {
    vi.mocked(loadCurrentSystemId).mockResolvedValueOnce(null);
    expect(await incursionDomain.load(CHARACTER)).toBeNull();

    vi.mocked(loadIncursions).mockResolvedValueOnce(null);
    expect(await incursionDomain.load(CHARACTER)).toBeNull();

    vi.mocked(localJumpDistances).mockResolvedValueOnce({ kind: 'unknown' });
    expect(await incursionDomain.load(CHARACTER)).toBeNull();
  });

  it('counts nothing when no Incursion is active', async () => {
    vi.mocked(loadIncursions).mockResolvedValue({ entries: [] });
    expect(await incursionDomain.load(CHARACTER)).toEqual([]);
    expect(localJumpDistances).not.toHaveBeenCalled();
  });
});

describe('incursionNearby delivery', () => {
  const fire: IncursionNearbyFire = {
    eventId: 'incursionNearby',
    characterId: CHARACTER,
    constellationId: 20000020,
    stagingSystemId: 30000144,
    state: 'established',
    jumps: 3,
  };

  it('names the constellation, staging system, state and jumps', async () => {
    vi.mocked(loadConstellationNames).mockResolvedValue(new Map([[20000020, 'Kimotoro']]));
    vi.mocked(lookupSolarSystem).mockResolvedValue({ name: 'Perimeter' } as never);
    const copy = await incursionDomain.render(fire, 'Pilot');
    expect(copy.title).toBe('Incursion 3 jumps away');
    expect(copy.body).toContain('Kimotoro');
    expect(copy.body).toContain('Perimeter');
    expect(copy.body).toMatch(/established/i);
    expect(copy.body).toContain('3 jumps');
  });

  it('opens Route Safety with the staging system as the Stop', () => {
    expect(notificationUrlForSubject('incursionNearby', fire.stagingSystemId)).toBe(
      '/travel/route?stops=30000144'
    );
  });

  it('keys one occurrence per Incursion, with no day bucket', () => {
    expect(occurrenceKey(fire, 1_000)).toBe(occurrenceKey({ ...fire, jumps: 1 }, 999_999_999));
  });
});
