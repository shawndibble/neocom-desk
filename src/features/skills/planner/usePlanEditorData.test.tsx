import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { CorrectedSkills } from '@/features/skills/correctedSkills';
import { usePlanEditorData } from './usePlanEditorData';

const loadCorrectedSkills = vi.fn();
const invalidateFreshness = vi.fn();

vi.mock('@/esi/cache', () => ({
  invalidateFreshness: () => invalidateFreshness(),
}));

vi.mock('@/features/skills/correctedSkills', () => ({
  loadCorrectedSkills: (...args: unknown[]) => loadCorrectedSkills(...args),
}));
vi.mock('@/features/skills/skillMap', () => ({
  loadSkillCatalog: () => Promise.resolve({ engineSkills: new Map(), bySkillTypeID: new Map() }),
  toAttributeBaseline: () => null,
}));
vi.mock('@/features/skills/data', () => ({
  loadCharacterAttributes: () => Promise.resolve(null),
  loadImplantBonuses: () => Promise.resolve({}),
}));

function corrected(fetchedAt: Date | null, level: number): CorrectedSkills {
  return {
    skillsResult: fetchedAt
      ? ({
          data: { skills: [], total_sp: 0 },
          fetchedAt,
        } as unknown as CorrectedSkills['skillsResult'])
      : null,
    skillsNeedsReauth: false,
    queueResult: null,
    queueNeedsReauth: false,
    completedLevels: new Map(),
    trained: new Map([[10, { level, sp: 0 }]]) as CorrectedSkills['trained'],
    effective: new Map(),
    completedSp: 0,
    totalSp: fetchedAt ? 0 : null,
    fetchedAt,
  };
}

beforeEach(() => {
  loadCorrectedSkills.mockReset();
  invalidateFreshness.mockReset();
});

describe('usePlanEditorData', () => {
  it("passes on the corrected-skills read's fetchedAt", async () => {
    const at = new Date('2026-10-04T10:00:00Z');
    loadCorrectedSkills.mockResolvedValue(corrected(at, 3));
    const { result } = renderHook(() => usePlanEditorData(7));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.fetchedAt).toEqual(at);
  });

  it('is null before /skills has ever been read', async () => {
    loadCorrectedSkills.mockResolvedValue(corrected(null, 0));
    const { result } = renderHook(() => usePlanEditorData(7));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.fetchedAt).toBeNull();
  });

  it('reload re-reads skills, keeping the last answer until the new one lands', async () => {
    const first = new Date('2026-10-04T10:00:00Z');
    const second = new Date('2026-10-04T11:00:00Z');
    loadCorrectedSkills.mockResolvedValueOnce(corrected(first, 3));
    const { result } = renderHook(() => usePlanEditorData(7));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let resolveSecond: (value: CorrectedSkills) => void = () => {};
    loadCorrectedSkills.mockReturnValueOnce(
      new Promise<CorrectedSkills>((resolve) => {
        resolveSecond = resolve;
      })
    );
    expect(invalidateFreshness).not.toHaveBeenCalled();
    act(() => result.current.reload());
    // A manual refresh must reach ESI, not the cached rows' freshness window.
    expect(invalidateFreshness).toHaveBeenCalledTimes(1);
    expect(loadCorrectedSkills).toHaveBeenCalledTimes(2);
    expect(loadCorrectedSkills.mock.calls[1][0]).toBe(7);
    expect(result.current.loaded).toBe(true);
    expect(result.current.trainedSkills.get(10)?.level).toBe(3);

    await act(async () => resolveSecond(corrected(second, 4)));
    expect(result.current.fetchedAt).toEqual(second);
    expect(result.current.trainedSkills.get(10)?.level).toBe(4);
  });
});
