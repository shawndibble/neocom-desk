import { describe, it, expect, vi } from 'vitest';
import type { SkillQueueEntry } from '@/esi/endpoints';
import { runForegroundPoll, type PollDependencies, type CharacterRef } from './foregroundPoller';
import type { SkillQueuePollerState } from './pollerState';

const CHAR: CharacterRef = { characterId: 1, name: 'Test Pilot' };
const SKILLQUEUE_SCOPE = 'esi-skills.read_skillqueue.v1';

function queueEntry(overrides: Partial<SkillQueueEntry> = {}): SkillQueueEntry {
  return {
    skill_id: 100,
    finished_level: 1,
    queue_position: 0,
    ...overrides,
  } as SkillQueueEntry;
}

function baseDeps(overrides: Partial<PollDependencies> = {}): PollDependencies {
  let saved: SkillQueuePollerState = {};
  return {
    now: () => 1_000_000,
    characters: async () => [CHAR],
    grantedScopes: async () => new Set([SKILLQUEUE_SCOPE]),
    loadSkillQueue: async () => [],
    masterEnabled: async () => true,
    eventPrefsFor: async () => ({}),
    permission: () => 'granted',
    prevState: async () => saved,
    saveState: async (state) => {
      saved = state;
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
});
