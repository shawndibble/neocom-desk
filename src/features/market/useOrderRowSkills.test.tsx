import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { loadUniverseTypeOnce } from '@/features/skills/data';
import { loadTypeInfo } from '@/sde/loadTypeInfo';
import { useOrderRowSkills } from './useOrderRowSkills';

vi.mock('@/sde/loadTypeInfo', () => ({ loadTypeInfo: vi.fn() }));
vi.mock('@/features/skills/data', () => ({
  loadUniverseType: vi.fn(),
  loadUniverseTypeOnce: vi.fn(),
  loadCharacterImplants: vi.fn(),
}));
vi.mock('@/sde/loadMarketSde', () => ({ loadAttributeDictionary: vi.fn(async () => ({})) }));
vi.mock('@/features/market/attributeReferenceNames', () => ({
  loadAttributeReferenceNames: vi.fn(async () => ({ types: { 3300: 'Gunnery' } })),
}));
vi.mock('@/features/skills/correctedSkills', () => ({ loadCorrectedSkills: vi.fn() }));
vi.mock('@/features/skills/useTargetPlan', () => ({ useTargetPlan: () => ({}) }));

const RIFTER = 587;
const GUNNERY = 3300;

describe('useOrderRowSkills', () => {
  it("reads the item's required skills from the baked shard, without asking ESI", async () => {
    vi.mocked(loadTypeInfo).mockResolvedValue({
      description: '',
      effects: [],
      attributes: [
        [182, GUNNERY],
        [277, 1],
      ],
    });

    const { result } = renderHook(() => useOrderRowSkills(RIFTER, null));

    await waitFor(() =>
      expect(result.current.itemSkills).toEqual({
        typeId: RIFTER,
        requiredSkills: [{ skillTypeID: GUNNERY, level: 1 }],
        skillNames: { [GUNNERY]: 'Gunnery' },
      })
    );
    expect(loadUniverseTypeOnce).not.toHaveBeenCalled();
  });

  it('falls back to cached ESI for a type the shard lacks', async () => {
    vi.mocked(loadTypeInfo).mockResolvedValue(null);
    vi.mocked(loadUniverseTypeOnce).mockResolvedValue({
      data: {
        type_id: RIFTER,
        name: 'Rifter',
        description: '',
        group_id: 25,
        published: true,
        dogma_attributes: [
          { attribute_id: 182, value: GUNNERY },
          { attribute_id: 277, value: 2 },
        ],
      },
      fetchedAt: new Date(0),
      fromCache: true,
      truncated: false,
    });

    const { result } = renderHook(() => useOrderRowSkills(RIFTER, null));

    await waitFor(() =>
      expect(result.current.itemSkills?.requiredSkills).toEqual([
        { skillTypeID: GUNNERY, level: 2 },
      ])
    );
  });
});
