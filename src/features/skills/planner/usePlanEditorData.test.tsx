import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { CorrectedSkills } from '@/features/skills/correctedSkills';
import { loadCharacterAttributes } from '@/features/skills/data';
import { usePlanEditorData } from './usePlanEditorData';

const loadCorrectedSkills = vi.fn();
const invalidateFreshness = vi.fn();

vi.mock('@/esi/cache', () => ({
  invalidateFreshness: () => invalidateFreshness(),
}));

vi.mock('@/features/skills/correctedSkills', () => ({
  loadCorrectedSkills: (...args: unknown[]) => loadCorrectedSkills(...args),
}));
const loadSkillCatalog = vi.fn();
vi.mock('@/features/skills/skillMap', () => ({
  loadSkillCatalog: () => loadSkillCatalog(),
  toAttributeBaseline: () => null,
}));
vi.mock('@/features/skills/data', () => ({
  loadCharacterAttributes: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('@/features/skills/typeDetail', () => ({
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
  loadSkillCatalog.mockReset();
  loadSkillCatalog.mockResolvedValue({ engineSkills: new Map(), bySkillTypeID: new Map() });
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

  describe('fromCache', () => {
    const at = new Date('2026-10-04T10:00:00Z');
    const read = (fromCache: boolean) => ({ data: [], fetchedAt: at, fromCache });
    const withReads = (skills: boolean | null, queue: boolean | null): CorrectedSkills => ({
      ...corrected(at, 3),
      skillsResult: (skills === null
        ? null
        : read(skills)) as unknown as CorrectedSkills['skillsResult'],
      queueResult: (queue === null
        ? null
        : read(queue)) as unknown as CorrectedSkills['queueResult'],
    });

    it.each([
      ['skills', true, false, true],
      ['queue', false, true, true],
      ['both', true, true, true],
      ['neither', false, false, false],
      ['neither read at all', null, null, false],
    ] as const)('%s cached: %s/%s -> %s', async (_name, skills, queue, expected) => {
      loadCorrectedSkills.mockResolvedValue(withReads(skills, queue));
      const { result } = renderHook(() => usePlanEditorData(7));
      await waitFor(() => expect(result.current.loaded).toBe(true));
      expect(result.current.fromCache).toBe(expected);
    });

    it("does not carry the previous Character's flag over to the next", async () => {
      loadCorrectedSkills.mockResolvedValueOnce(withReads(true, false));
      const { result, rerender } = renderHook(({ id }) => usePlanEditorData(id), {
        initialProps: { id: 7 },
      });
      await waitFor(() => expect(result.current.fromCache).toBe(true));
      loadCorrectedSkills.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      rerender({ id: 8 });
      await waitFor(() => expect(result.current.loaded).toBe(true));
      expect(result.current.fromCache).toBe(false);
    });
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

  it('sets the local catalog without waiting on the ESI reads', async () => {
    loadCorrectedSkills.mockReturnValue(new Promise<CorrectedSkills>(() => {}));
    const { result } = renderHook(() => usePlanEditorData(7));
    await waitFor(() => expect(result.current.catalog).not.toBeNull());
    expect(result.current.loaded).toBe(false);
  });

  it('finishes loading, with skills unknown, when an ESI read throws', async () => {
    loadCorrectedSkills.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => usePlanEditorData(7));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.trainedSkillsKnown).toBe(false);
    expect(result.current.catalog).not.toBeNull();
  });

  it("drops the previous Character's skills when the next one's load fails", async () => {
    loadCorrectedSkills.mockResolvedValueOnce(corrected(new Date('2026-10-04T10:00:00Z'), 3));
    const { result, rerender } = renderHook(({ id }) => usePlanEditorData(id), {
      initialProps: { id: 7 },
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.trainedSkillsKnown).toBe(true);
    expect(result.current.trainedSkills.get(10)?.level).toBe(3);

    loadCorrectedSkills.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    rerender({ id: 8 });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.trainedSkillsKnown).toBe(false);
    expect(result.current.trainedSkills.size).toBe(0);
    expect(result.current.totalSp).toBeNull();
    expect(result.current.fetchedAt).toBeNull();
  });

  it('flags a catalog that could not load, still finishing, and reload tries it again', async () => {
    loadSkillCatalog.mockRejectedValueOnce(new Error('chunk failed'));
    loadCorrectedSkills.mockResolvedValue(corrected(null, 0));
    const { result } = renderHook(() => usePlanEditorData(7));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.catalog).toBeNull();
    expect(result.current.catalogFailed).toBe(true);

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.catalog).not.toBeNull());
    expect(result.current.catalogFailed).toBe(false);
  });

  it('keeps the skills it did read when another read fails', async () => {
    loadCorrectedSkills.mockResolvedValue(corrected(new Date('2026-10-04T10:00:00Z'), 2));
    vi.mocked(loadCharacterAttributes).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => usePlanEditorData(7));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.trainedSkills.get(10)?.level).toBe(2);
    expect(result.current.trainedSkillsKnown).toBe(true);
  });
});
