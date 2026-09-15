import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { CachedResult } from '@/esi/cache';
import type { CharacterSkills } from '@/esi/endpoints';
import { loadCharacterSkills } from './data';
import { useAccountSkillLevels } from './useAccountSkillLevels';

vi.mock('./data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./data')>()),
  loadCharacterSkills: vi.fn(),
}));

const mockedLoad = vi.mocked(loadCharacterSkills);

function skillsResult(rows: { skill_id: number; active: number }[]): CachedResult<CharacterSkills> {
  return {
    data: {
      total_sp: 0,
      skills: rows.map((r) => ({
        skill_id: r.skill_id,
        trained_skill_level: r.active,
        active_skill_level: r.active,
        skillpoints_in_skill: 0,
      })),
    },
    fetchedAt: new Date(0),
    fromCache: false,
    truncated: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAccountSkillLevels', () => {
  it('starts empty and fetches nothing for an empty character list', async () => {
    const { result } = renderHook(() => useAccountSkillLevels([]));
    expect(result.current.size).toBe(0);
    expect(mockedLoad).not.toHaveBeenCalled();
  });

  it('fans out to every character id and maps each result to a skill-level record', async () => {
    mockedLoad.mockImplementation(async (id: number) =>
      id === 1
        ? skillsResult([{ skill_id: 3380, active: 5 }])
        : skillsResult([{ skill_id: 3380, active: 2 }])
    );
    const { result } = renderHook(() => useAccountSkillLevels([1, 2]));
    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get(1)).toEqual({ 3380: 5 });
    expect(result.current.get(2)).toEqual({ 3380: 2 });
  });

  it('leaves a character out of the map when its skills fail to load, rather than treating it as skill-less', async () => {
    mockedLoad.mockImplementation(async (id: number) => (id === 1 ? skillsResult([]) : null));
    const { result } = renderHook(() => useAccountSkillLevels([1, 2]));
    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.has(1)).toBe(true);
    expect(result.current.has(2)).toBe(false);
  });
});
