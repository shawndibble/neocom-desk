import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/features/pi/names', () => ({ loadPlanetName: vi.fn(async () => 'Amarr III') }));

import type { ProjectionRow } from '@/engine/projection';
import { db } from '@/db';
import { DEFAULT_NOTIFICATION_PREFERENCES, useNotificationPreferences } from './preferences';
import type { EventEnabledMap } from './eventSelection';
import type { CharacterRef, DomainPollState } from './foregroundPoller';
import type { PollDomain } from './pollDomains';
import { calendarDomain } from './pollDomains/calendar';
import type { PollerState } from './pollerState';
import { useSeenEveTypesStore } from './seenEveTypes';
import { rebuildProjection, type ProjectionRebuildDependencies } from './projectionRebuild';
import { HOUR_MS } from '@/lib/age';

const NOW = 1_000_000;
const CHAR: CharacterRef = { characterId: 1, name: 'Test Pilot' };
const CHAR_B: CharacterRef = { characterId: 2, name: 'Second Pilot' };
const CALENDAR_SCOPE = 'esi-calendar.read_calendar_events.v1';
const PLANETS_SCOPE = 'esi-planets.manage_planets.v1';

const calendarSnapshot = { entries: [{ calendarEventId: 5, startMs: NOW + 1000 }], nowMs: NOW };

/** Baselines keyed by domain id; every other domain reads as "no baseline yet". */
function stores(baselines: Record<string, PollerState<unknown>>) {
  const prev = vi.fn(async (domain: PollDomain) => baselines[domain.id] ?? {});
  const domainState = (domain: PollDomain): DomainPollState => ({
    prev: () => prev(domain),
    save: async () => {},
  });
  return { prev, domainState };
}

function deps(
  overrides: Partial<Omit<ProjectionRebuildDependencies, 'uploadProjection'>> & {
    baselines?: Record<string, PollerState<unknown>>;
  } = {}
) {
  const { baselines = { calendar: { [CHAR.characterId]: calendarSnapshot } }, ...rest } = overrides;
  const uploadProjection = vi.fn<ProjectionRebuildDependencies['uploadProjection']>(async () => {});
  const { prev, domainState } = stores(baselines);
  const built: ProjectionRebuildDependencies = {
    now: () => NOW,
    characters: async () => [CHAR],
    grantedScopes: async () => new Set([CALENDAR_SCOPE, PLANETS_SCOPE]),
    domainState,
    masterEnabled: async () => true,
    browserChannelEnabled: async () => true,
    eventPrefsFor: async () => ({ calendarEventStarting: true }),
    eveTypePrefsFor: async () => ({}),
    permission: () => 'granted',
    uploadProjection,
    ...rest,
  };
  return { deps: built, uploadProjection, prev };
}

async function uploaded(
  uploadProjection: ReturnType<typeof deps>['uploadProjection']
): Promise<ReadonlyMap<number, ProjectionRow[]>> {
  expect(uploadProjection).toHaveBeenCalledTimes(1);
  return uploadProjection.mock.calls[0][0];
}

beforeEach(async () => {
  await db.settings.clear();
  useSeenEveTypesStore.setState({ value: {}, hydrated: true });
  useNotificationPreferences.setState({ value: DEFAULT_NOTIFICATION_PREFERENCES, hydrated: true });
});

describe('rebuildProjection', () => {
  it('uploads rows built from the saved baseline', async () => {
    const { deps: d, uploadProjection } = deps();
    await rebuildProjection(d);
    const rows = await uploaded(uploadProjection);
    expect(rows.get(CHAR.characterId)).toEqual([
      expect.objectContaining({ eventId: 'calendarEventStarting', characterId: CHAR.characterId }),
    ]);
  });

  it('reflects a preference change against the same baseline', async () => {
    let prefs: EventEnabledMap = { calendarEventStarting: true };
    const { deps: d, uploadProjection } = deps({ eventPrefsFor: async () => prefs });
    await rebuildProjection(d);
    prefs = { calendarEventStarting: false };
    await rebuildProjection(d);
    expect(uploadProjection).toHaveBeenCalledTimes(2);
    expect(uploadProjection.mock.calls[0][0].get(CHAR.characterId)).toHaveLength(1);
    expect(uploadProjection.mock.calls[1][0].get(CHAR.characterId)).toEqual([]);
  });

  it('uses baselines handed in instead of reading the stores', async () => {
    const { deps: d, uploadProjection, prev } = deps({ baselines: {} });
    await rebuildProjection(
      d,
      new Map([[calendarDomain, { [CHAR.characterId]: calendarSnapshot }]])
    );
    expect(prev).not.toHaveBeenCalled();
    expect((await uploaded(uploadProjection)).get(CHAR.characterId)).toHaveLength(1);
  });

  it('uploads an empty Projection for every Character with nothing to project, so the backend drops stale rows', async () => {
    const { deps: d, uploadProjection } = deps({
      characters: async () => [CHAR, CHAR_B],
      grantedScopes: async (characterId) =>
        characterId === CHAR.characterId ? new Set([CALENDAR_SCOPE]) : new Set(),
      baselines: {
        calendar: {
          [CHAR.characterId]: calendarSnapshot,
          [CHAR_B.characterId]: calendarSnapshot,
        },
      },
    });
    await rebuildProjection(d);
    const rows = await uploaded(uploadProjection);
    expect(rows.get(CHAR.characterId)).toHaveLength(1);
    // Baseline present, scope revoked.
    expect(rows.get(CHAR_B.characterId)).toEqual([]);
  });

  it('uploads an empty Projection for a Character with no baseline yet', async () => {
    const { deps: d, uploadProjection } = deps({
      characters: async () => [CHAR, CHAR_B],
    });
    await rebuildProjection(d);
    expect((await uploaded(uploadProjection)).get(CHAR_B.characterId)).toEqual([]);
  });

  it('filters rows to the enabled events, even for a domain whose projection emits more than one event from one snapshot', async () => {
    // colonyDomain's projection always emits both planetaryExtractionDone and
    // planetaryExtractorExpiring rows from one snapshot regardless of which is
    // individually toggled, so the channel filter is load-bearing here.
    const expiryTimeMs = NOW + 20 * HOUR_MS;
    const { deps: d, uploadProjection } = deps({
      eventPrefsFor: async () => ({
        planetaryExtractorExpiring: true,
        planetaryExtractionDone: false,
      }),
      baselines: {
        colonies: {
          [CHAR.characterId]: {
            colonies: [
              {
                planetId: 4001,
                extractors: [{ pinId: 9001, expiryTimeMs, thresholdMs: 6 * HOUR_MS }],
              },
            ],
            nowMs: NOW,
          },
        },
      },
    });
    await rebuildProjection(d);
    const rows = (await uploaded(uploadProjection)).get(CHAR.characterId) ?? [];
    expect(rows.map((row) => row.eventId)).toEqual(['planetaryExtractorExpiring']);
  });

  it('does not upload a row for an event switched to feed-only — a Scheduled Push shows an OS notification, same as the browser channel', async () => {
    const { deps: d, uploadProjection } = deps({
      eventPrefsFor: async () => ({ calendarEventStarting: { browser: false, feed: true } }),
    });
    await rebuildProjection(d);
    expect((await uploaded(uploadProjection)).get(CHAR.characterId)).toEqual([]);
  });

  it('uploads empty Projections when browser notifications are switched off', async () => {
    const { deps: d, uploadProjection } = deps({ browserChannelEnabled: async () => false });
    await rebuildProjection(d);
    expect((await uploaded(uploadProjection)).get(CHAR.characterId)).toEqual([]);
  });

  it('uploads empty Projections without a live notification permission', async () => {
    const { deps: d, uploadProjection } = deps({ permission: () => 'denied' });
    await rebuildProjection(d);
    expect((await uploaded(uploadProjection)).get(CHAR.characterId)).toEqual([]);
  });

  it('uploads empty Projections when the master switch is off, clearing live Scheduled Pushes', async () => {
    const { deps: d, uploadProjection } = deps({ masterEnabled: async () => false });
    await rebuildProjection(d);
    expect((await uploaded(uploadProjection)).get(CHAR.characterId)).toEqual([]);
  });

  it('reads only the baselines of domains that project anything', async () => {
    const { deps: d, prev } = deps();
    await rebuildProjection(d);
    const read = new Set(prev.mock.calls.map(([domain]) => domain.id));
    expect(read.has('mail')).toBe(false);
    expect(read.has('calendar')).toBe(true);
  });
});

describe('eve type upload (issue #3755)', () => {
  const NOTIFICATION_SCOPE = 'esi-characters.read_notifications.v1';

  it('uploads each Character’s browser-enabled types, defaults plus seen ones', async () => {
    useSeenEveTypesStore.setState({ value: { '1': ['SeenKind'] }, hydrated: true });
    const { deps: d, uploadProjection } = deps({
      grantedScopes: async () => new Set([NOTIFICATION_SCOPE]),
      eveTypePrefsFor: async () => ({
        StructureDestroyed: { browser: false },
        SeenKind: { browser: true },
      }),
    });
    await rebuildProjection(d);
    const types = uploadProjection.mock.calls[0][1].get(CHAR.characterId);
    expect(types).toContain('SeenKind');
    expect(types).toContain('StructureLostShields');
    expect(types).not.toContain('StructureDestroyed');
  });

  it('uploads an empty list when the browser channel is off', async () => {
    const { deps: d, uploadProjection } = deps({
      grantedScopes: async () => new Set([NOTIFICATION_SCOPE]),
      browserChannelEnabled: async () => false,
    });
    await rebuildProjection(d);
    expect(uploadProjection.mock.calls[0][1].get(CHAR.characterId)).toEqual([]);
  });

  it('uploads an empty list for a Character without the notifications scope', async () => {
    const { deps: d, uploadProjection } = deps();
    await rebuildProjection(d);
    expect(uploadProjection.mock.calls[0][1].get(CHAR.characterId)).toEqual([]);
  });
});

describe('server-pushed events upload (issue #5121)', () => {
  it('uploads each Character’s browser-enabled server events, sorted, with their inputs', async () => {
    const serverInputsFor = vi.fn(async (_characterId: number, events: readonly string[]) =>
      events.includes('shipLost') ? { shipLostMinimumIsk: 5 } : {}
    );
    const { deps: d, uploadProjection } = deps({
      // communityMemberJoined and communityRequestPledged default browser-off.
      eventPrefsFor: async () => ({ priceAlertTriggered: { browser: false, feed: true } }),
      serverInputsFor,
    });
    await rebuildProjection(d);
    expect(uploadProjection.mock.calls[0][2]?.get(CHAR.characterId)).toEqual({
      serverEvents: ['communityJoinRequest', 'shipLost'],
      serverInputs: { shipLostMinimumIsk: 5 },
    });
    expect(serverInputsFor).toHaveBeenCalledWith(CHAR.characterId, [
      'communityJoinRequest',
      'shipLost',
    ]);
  });

  it('uploads an empty list when the device cannot show a pop-up', async () => {
    for (const override of [
      { masterEnabled: async () => false },
      { browserChannelEnabled: async () => false },
      { permission: () => 'denied' as const },
    ]) {
      const { deps: d, uploadProjection } = deps(override);
      await rebuildProjection(d);
      expect(uploadProjection.mock.calls[0][2]?.get(CHAR.characterId)).toEqual({
        serverEvents: [],
        serverInputs: {},
      });
    }
  });
});
