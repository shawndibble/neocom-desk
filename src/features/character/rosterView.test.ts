import { describe, it, expect } from 'vitest';
import { rosterCoreMap, mergeRosterCore } from './rosterView';
import type { RosterEntry } from './roster';

const NOW = new Date('2026-01-01T00:00:00Z').getTime();

function entry(overrides: Partial<RosterEntry>): RosterEntry {
  return {
    characterId: 1,
    name: 'Zed',
    wallet: null,
    skills: null,
    queue: null,
    correctedTotalSp: null,
    ...overrides,
  };
}

describe('rosterCoreMap', () => {
  it('carries stats, queue, jobSlotSkills and totalSp from one roster snapshot pass', () => {
    const core = rosterCoreMap(
      [
        entry({
          characterId: 1,
          name: 'Zed',
          skills: {
            data: {
              total_sp: 1000,
              skills: [
                {
                  skill_id: 3387,
                  trained_skill_level: 3,
                  active_skill_level: 3,
                  skillpoints_in_skill: 0,
                },
              ],
            },
            fetchedAt: new Date('2026-01-01T00:00:00Z'),
            fromCache: true,
            truncated: false,
          },
          correctedTotalSp: 1000,
        }),
      ],
      NOW
    );

    const row = core.get(1);
    expect(row?.stats).toEqual({
      name: 'Zed',
      skillPoints: 1000,
      skillPointsFetchedAt: new Date('2026-01-01T00:00:00Z'),
      wallet: undefined,
      walletFetchedAt: undefined,
    });
    expect(row?.queue).toEqual({ state: 'unknown', fetchedAt: null, trainingFinishMs: null });
    expect(row?.jobSlotSkills?.massProduction).toBe(3);
    expect(row?.totalSp).toBe(1000);
  });

  it('leaves jobSlotSkills and totalSp undefined for a character with no cached skills row', () => {
    const core = rosterCoreMap([entry({ characterId: 2, name: 'NoSkills' })], NOW);
    const row = core.get(2);
    expect(row?.jobSlotSkills).toBeUndefined();
    expect(row?.totalSp).toBeUndefined();
    // stats is always present, even with nothing fetched yet
    expect(row?.stats.name).toBe('NoSkills');
  });

  it('produces one row per roster entry, keyed by characterId', () => {
    const core = rosterCoreMap(
      [entry({ characterId: 1, name: 'A' }), entry({ characterId: 2, name: 'B' })],
      NOW
    );
    expect([...core.keys()].sort()).toEqual([1, 2]);
  });
});

describe('mergeRosterCore', () => {
  it('merges one fresh entry into the previous map without dropping other rows', () => {
    const previous = rosterCoreMap(
      [entry({ characterId: 1, name: 'A' }), entry({ characterId: 2, name: 'B' })],
      NOW
    );

    const merged = mergeRosterCore(previous, entry({ characterId: 2, name: 'B-refreshed' }), NOW);

    expect(merged.get(1)?.stats.name).toBe('A');
    expect(merged.get(2)?.stats.name).toBe('B-refreshed');
    expect(merged.size).toBe(2);
  });

  it('keeps the previous jobSlotSkills/totalSp when a refresh comes back with no skills row (a failed /skills call nulls the field rather than sinking the character — roster.ts)', () => {
    const withSkills = entry({
      characterId: 1,
      name: 'A',
      skills: {
        data: {
          total_sp: 5000,
          skills: [
            { skill_id: 3387, trained_skill_level: 4, active_skill_level: 4, skillpoints_in_skill: 0 },
          ],
        },
        fetchedAt: new Date('2026-01-01T00:00:00Z'),
        fromCache: true,
        truncated: false,
      },
      correctedTotalSp: 5000,
    });
    const previous = rosterCoreMap([withSkills], NOW);
    expect(previous.get(1)?.totalSp).toBe(5000);
    expect(previous.get(1)?.jobSlotSkills?.massProduction).toBe(4);

    // A "Refresh all" pass where this character's /skills call failed:
    // `entry.skills` comes back null, but the character isn't dropped.
    const failedRefresh = entry({ characterId: 1, name: 'A', skills: null, correctedTotalSp: null });
    const merged = mergeRosterCore(previous, failedRefresh, NOW);

    expect(merged.get(1)?.totalSp).toBe(5000);
    expect(merged.get(1)?.jobSlotSkills?.massProduction).toBe(4);
    // stats/queue still take the fresh (now-unknown) reading, unlike the two skill-derived fields.
    expect(merged.get(1)?.stats.skillPoints).toBeUndefined();
  });
});
