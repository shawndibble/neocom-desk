import { describe, it, expect, vi } from 'vitest';
import type { SkillQueueEntry, IndustryJob } from '@/esi/endpoints';
import { runForegroundPoll, type PollDependencies, type CharacterRef } from './foregroundPoller';
import type {
  SkillQueuePollerState,
  IndustryJobPollerState,
  ColonyPollerState,
} from './pollerState';

const CHAR: CharacterRef = { characterId: 1, name: 'Test Pilot' };
const SKILLQUEUE_SCOPE = 'esi-skills.read_skillqueue.v1';
const INDUSTRY_JOBS_SCOPE = 'esi-industry.read_character_jobs.v1';
const PLANETS_SCOPE = 'esi-planets.manage_planets.v1';

function queueEntry(overrides: Partial<SkillQueueEntry> = {}): SkillQueueEntry {
  return {
    skill_id: 100,
    finished_level: 1,
    queue_position: 0,
    ...overrides,
  } as SkillQueueEntry;
}

function industryJob(overrides: Partial<IndustryJob> = {}): IndustryJob {
  return {
    job_id: 1,
    activity_id: 1,
    blueprint_type_id: 1000,
    facility_id: 1,
    station_id: 1,
    runs: 1,
    start_date: '2026-01-01T00:00:00Z',
    end_date: '2026-01-01T01:00:00Z',
    status: 'active',
    ...overrides,
  };
}

function baseDeps(overrides: Partial<PollDependencies> = {}): PollDependencies {
  let saved: SkillQueuePollerState = {};
  let savedJobs: IndustryJobPollerState = {};
  let savedColonies: ColonyPollerState = {};
  return {
    now: () => 1_000_000,
    characters: async () => [CHAR],
    grantedScopes: async () => new Set([SKILLQUEUE_SCOPE]),
    loadSkillQueue: async () => [],
    loadIndustryJobs: async () => [],
    loadColonyExtractors: async () => [],
    masterEnabled: async () => true,
    eventPrefsFor: async () => ({}),
    permission: () => 'granted',
    prevState: async () => saved,
    saveState: async (state) => {
      saved = state;
    },
    prevIndustryJobState: async () => savedJobs,
    saveIndustryJobState: async (state) => {
      savedJobs = state;
    },
    prevColonyState: async () => savedColonies,
    saveColonyState: async (state) => {
      savedColonies = state;
    },
    notify: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('runForegroundPoll', () => {
  it('does nothing when the master switch is off', async () => {
    const characters = vi.fn(async () => [CHAR]);
    const deps = baseDeps({ masterEnabled: async () => false, characters });
    await runForegroundPoll(deps);
    expect(characters).not.toHaveBeenCalled();
  });

  it('does nothing without granted browser permission', async () => {
    const characters = vi.fn(async () => [CHAR]);
    const deps = baseDeps({ permission: () => 'default', characters });
    await runForegroundPoll(deps);
    expect(characters).not.toHaveBeenCalled();
  });

  it('skips a character with no granted skill-queue scope', async () => {
    const loadSkillQueue = vi.fn(async () => []);
    const deps = baseDeps({ grantedScopes: async () => new Set(), loadSkillQueue });
    await runForegroundPoll(deps);
    expect(loadSkillQueue).not.toHaveBeenCalled();
  });

  it('skips a character whose events are all individually disabled', async () => {
    const loadSkillQueue = vi.fn(async () => []);
    const deps = baseDeps({
      eventPrefsFor: async () => ({ skillLevelComplete: false, characterNotTraining: false }),
      loadSkillQueue,
    });
    await runForegroundPoll(deps);
    expect(loadSkillQueue).not.toHaveBeenCalled();
  });

  it('persists a snapshot on the first poll but fires nothing (no baseline yet)', async () => {
    let saved: SkillQueuePollerState | null = null;
    const deps = baseDeps({
      loadSkillQueue: async () => [queueEntry({ finished_level: 3 })],
      saveState: async (state) => {
        saved = state;
      },
    });
    await runForegroundPoll(deps);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(saved).not.toBeNull();
    expect(saved![CHAR.characterId].entries).toEqual([
      { skillId: 100, finishedLevel: 3, queuePosition: 0, finishMs: null },
    ]);
  });

  it('fires characterNotTraining when a character stops training between two polls', async () => {
    let now = 1000;
    let saved: SkillQueuePollerState = {
      [CHAR.characterId]: {
        entries: [{ skillId: 100, finishedLevel: 1, queuePosition: 0, finishMs: 2000 }],
        nowMs: now,
      },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      now: () => now,
      prevState: async () => saved,
      saveState: async (state) => {
        saved = state;
      },
      loadSkillQueue: async () => [],
      notify,
    });
    now = 3000;
    await runForegroundPoll(deps);
    expect(notify).toHaveBeenCalledTimes(1);
    const [fire, character] = notify.mock.calls[0];
    expect(fire.eventId).toBe('characterNotTraining');
    expect(character).toEqual(CHAR);
  });

  it('only runs diffs for events the character has enabled', async () => {
    let saved: SkillQueuePollerState = {
      [CHAR.characterId]: {
        entries: [{ skillId: 100, finishedLevel: 1, queuePosition: 0, finishMs: 2000 }],
        nowMs: 1000,
      },
    };
    const notify = vi.fn(async () => {});
    const deps = baseDeps({
      now: () => 3000,
      prevState: async () => saved,
      saveState: async (state) => {
        saved = state;
      },
      loadSkillQueue: async () => [],
      eventPrefsFor: async () => ({ characterNotTraining: false }),
      notify,
    });
    await runForegroundPoll(deps);
    expect(notify).not.toHaveBeenCalled();
  });

  it('does not update saved state or notify when the ESI fetch fails', async () => {
    const initial: SkillQueuePollerState = {
      [CHAR.characterId]: { entries: [], nowMs: 500 },
    };
    let saved = initial;
    const saveState = vi.fn(async (state: SkillQueuePollerState) => {
      saved = state;
    });
    const deps = baseDeps({
      prevState: async () => initial,
      saveState,
      loadSkillQueue: async () => null,
    });
    await runForegroundPoll(deps);
    expect(saveState).not.toHaveBeenCalled();
    expect(saved).toBe(initial);
  });

  it('polls multiple characters independently', async () => {
    const charB: CharacterRef = { characterId: 2, name: 'Second Pilot' };
    let saved: SkillQueuePollerState = {};
    const deps = baseDeps({
      characters: async () => [CHAR, charB],
      loadSkillQueue: async (characterId) => [queueEntry({ skill_id: characterId * 10 })],
      saveState: async (state) => {
        saved = state;
      },
    });
    await runForegroundPoll(deps);
    expect(saved[CHAR.characterId]).toBeDefined();
    expect(saved[charB.characterId]).toBeDefined();
  });

  it('skips industry jobs for a character with no granted scope', async () => {
    const loadIndustryJobs = vi.fn(async () => []);
    const deps = baseDeps({ loadIndustryJobs });
    await runForegroundPoll(deps);
    expect(loadIndustryJobs).not.toHaveBeenCalled();
  });

  it('skips industry jobs for a character who toggled the event off despite having the scope', async () => {
    const loadIndustryJobs = vi.fn(async () => []);
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, INDUSTRY_JOBS_SCOPE]),
      eventPrefsFor: async () => ({ industryJobComplete: false }),
      loadIndustryJobs,
    });
    await runForegroundPoll(deps);
    expect(loadIndustryJobs).not.toHaveBeenCalled();
  });

  it('persists a job snapshot on the first poll but fires nothing (no baseline yet)', async () => {
    let savedJobs: IndustryJobPollerState | null = null;
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, INDUSTRY_JOBS_SCOPE]),
      loadIndustryJobs: async () => [industryJob()],
      saveIndustryJobState: async (state) => {
        savedJobs = state;
      },
    });
    await runForegroundPoll(deps);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(savedJobs).not.toBeNull();
    expect(savedJobs![CHAR.characterId].entries).toEqual([
      {
        jobId: 1,
        endMs: Date.parse('2026-01-01T01:00:00Z'),
        blueprintTypeId: 1000,
        productTypeId: null,
        activityId: 1,
      },
    ]);
  });

  it('fires industryJobComplete when a job newly finishes between two polls', async () => {
    let now = Date.parse('2026-01-01T00:30:00Z');
    let savedJobs: IndustryJobPollerState = {
      [CHAR.characterId]: {
        entries: [
          {
            jobId: 1,
            endMs: Date.parse('2026-01-01T01:00:00Z'),
            blueprintTypeId: 1000,
            productTypeId: 2000,
            activityId: 1,
          },
        ],
        nowMs: now,
      },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      now: () => now,
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, INDUSTRY_JOBS_SCOPE]),
      prevIndustryJobState: async () => savedJobs,
      saveIndustryJobState: async (state) => {
        savedJobs = state;
      },
      loadIndustryJobs: async () => [
        industryJob({ end_date: '2026-01-01T01:00:00Z', product_type_id: 2000 }),
      ],
      notify,
    });
    now = Date.parse('2026-01-01T01:30:00Z');
    await runForegroundPoll(deps);
    expect(notify).toHaveBeenCalledTimes(1);
    const [fire, character] = notify.mock.calls[0];
    expect(fire).toEqual({
      eventId: 'industryJobComplete',
      characterId: CHAR.characterId,
      jobId: 1,
      blueprintTypeId: 1000,
      productTypeId: 2000,
      activityId: 1,
    });
    expect(character).toEqual(CHAR);
  });

  it('skips planetary extraction for a character with no granted scope', async () => {
    const loadColonyExtractors = vi.fn(async () => []);
    const deps = baseDeps({ loadColonyExtractors });
    await runForegroundPoll(deps);
    expect(loadColonyExtractors).not.toHaveBeenCalled();
  });

  it('skips planetary extraction for a character who toggled the event off despite having the scope', async () => {
    const loadColonyExtractors = vi.fn(async () => []);
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, PLANETS_SCOPE]),
      eventPrefsFor: async () => ({ planetaryExtractionDone: false }),
      loadColonyExtractors,
    });
    await runForegroundPoll(deps);
    expect(loadColonyExtractors).not.toHaveBeenCalled();
  });

  it('persists a colony snapshot on the first poll but fires nothing (no baseline yet)', async () => {
    let savedColonies: ColonyPollerState | null = null;
    const deps = baseDeps({
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, PLANETS_SCOPE]),
      loadColonyExtractors: async () => [
        { planetId: 40000001, extractors: [{ pinId: 1, expiryTimeMs: 2000 }] },
      ],
      saveColonyState: async (state) => {
        savedColonies = state;
      },
    });
    await runForegroundPoll(deps);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(savedColonies).not.toBeNull();
    expect(savedColonies![CHAR.characterId].colonies).toEqual([
      { planetId: 40000001, extractors: [{ pinId: 1, expiryTimeMs: 2000 }] },
    ]);
  });

  it('fires planetaryExtractionDone when a colony newly goes idle between two polls', async () => {
    let now = 1000;
    let savedColonies: ColonyPollerState = {
      [CHAR.characterId]: {
        colonies: [{ planetId: 40000001, extractors: [{ pinId: 1, expiryTimeMs: 2000 }] }],
        nowMs: now,
      },
    };
    const notify = vi.fn<PollDependencies['notify']>(async () => {});
    const deps = baseDeps({
      now: () => now,
      grantedScopes: async () => new Set([SKILLQUEUE_SCOPE, PLANETS_SCOPE]),
      prevColonyState: async () => savedColonies,
      saveColonyState: async (state) => {
        savedColonies = state;
      },
      loadColonyExtractors: async () => [
        { planetId: 40000001, extractors: [{ pinId: 1, expiryTimeMs: 2000 }] },
      ],
      notify,
    });
    now = 3000;
    await runForegroundPoll(deps);
    expect(notify).toHaveBeenCalledTimes(1);
    const [fire, character] = notify.mock.calls[0];
    expect(fire).toEqual({
      eventId: 'planetaryExtractionDone',
      characterId: CHAR.characterId,
      planetId: 40000001,
    });
    expect(character).toEqual(CHAR);
  });
});
