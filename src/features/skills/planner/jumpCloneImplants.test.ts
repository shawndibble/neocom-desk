import { describe, expect, it, vi } from 'vitest';
import { loadCharacterClones } from '@/features/character/clones';
import { loadUniverseType } from '@/features/skills/data';
import { loadTypeInfo } from '@/sde/loadTypeInfo';
import { loadJumpCloneImplantSets } from './jumpCloneImplants';

vi.mock('@/sde/loadTypeInfo', () => ({ loadTypeInfo: vi.fn() }));
vi.mock('@/features/skills/data', () => ({
  loadUniverseType: vi.fn(),
  loadUniverseTypeOnce: vi.fn(),
  loadCharacterImplants: vi.fn(),
}));
vi.mock('@/features/character/clones', () => ({ loadCharacterClones: vi.fn() }));
vi.mock('@/features/character/cloneNicknames', () => ({
  readCloneNicknames: vi.fn(async () => ({})),
  cloneOwnName: (clone: { name?: string }) => clone.name,
}));

const MEMORY_IMPLANT = 10209;
const OCULAR_FILTER = 9899;

describe('loadJumpCloneImplantSets', () => {
  it('sums baked implant bonuses, falling back to ESI for a type the shard lacks', async () => {
    vi.mocked(loadCharacterClones).mockResolvedValue({
      cached: {
        data: {
          jump_clones: [
            {
              jump_clone_id: 7,
              location_id: 60003760,
              location_type: 'station',
              implants: [MEMORY_IMPLANT, OCULAR_FILTER],
              name: 'Learning',
            },
          ],
        },
        fetchedAt: new Date(0),
        fromCache: true,
        truncated: false,
      },
    } as Awaited<ReturnType<typeof loadCharacterClones>>);
    vi.mocked(loadTypeInfo).mockImplementation(async (typeId) =>
      typeId === MEMORY_IMPLANT ? { description: '', effects: [], attributes: [[177, 5]] } : null
    );
    vi.mocked(loadUniverseType).mockImplementation(async (typeId) =>
      typeId === OCULAR_FILTER
        ? {
            data: {
              type_id: typeId,
              name: 'Ocular Filter - Basic',
              description: '',
              group_id: 300,
              published: true,
              dogma_attributes: [{ attribute_id: 178, value: 1 }],
            },
            fetchedAt: new Date(0),
            fromCache: true,
            truncated: false,
          }
        : null
    );

    expect(await loadJumpCloneImplantSets(91)).toEqual([
      { id: 7, label: 'Learning', bonuses: { memory: 5, perception: 1 } },
    ]);
    expect(loadUniverseType).not.toHaveBeenCalledWith(MEMORY_IMPLANT);
  });
});
