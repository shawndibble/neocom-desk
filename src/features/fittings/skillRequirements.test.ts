import { describe, expect, it, vi } from 'vitest';
import type { UniverseType } from '@/esi/endpoints';
import { loadUniverseType } from '@/features/skills/data';
import { loadTypeInfo } from '@/sde/loadTypeInfo';
import { loadRequirementsForTypes } from './skillRequirements';

vi.mock('@/sde/loadTypeInfo', () => ({ loadTypeInfo: vi.fn() }));
vi.mock('@/features/skills/data', () => ({
  loadUniverseType: vi.fn(),
  loadUniverseTypeOnce: vi.fn(),
  loadCharacterImplants: vi.fn(),
}));

const BAKED = 3001;
const ESI_ONLY = 3002;
const UNKNOWN = 3003;
const GUNNERY = 3300;

function esiType(typeId: number): UniverseType {
  return {
    type_id: typeId,
    name: `Type ${typeId}`,
    description: '',
    group_id: 1,
    published: false,
    dogma_attributes: [
      { attribute_id: 182, value: GUNNERY },
      { attribute_id: 277, value: 2 },
    ],
  };
}

describe('loadRequirementsForTypes', () => {
  it('reads baked requirements offline, falls back to ESI, and reports the rest unknown', async () => {
    vi.mocked(loadTypeInfo).mockImplementation(async (typeId) =>
      typeId === BAKED
        ? {
            description: '',
            effects: [],
            attributes: [
              [182, GUNNERY],
              [277, 3],
            ],
          }
        : null
    );
    vi.mocked(loadUniverseType).mockImplementation(async (typeId) =>
      typeId === ESI_ONLY
        ? { data: esiType(typeId), fetchedAt: new Date(0), fromCache: true, truncated: false }
        : null
    );

    const { byType, unknownTypeIds } = await loadRequirementsForTypes([BAKED, ESI_ONLY, UNKNOWN]);

    expect(byType.get(BAKED)).toEqual([{ skillTypeID: GUNNERY, level: 3 }]);
    expect(byType.get(ESI_ONLY)).toEqual([{ skillTypeID: GUNNERY, level: 2 }]);
    expect(unknownTypeIds).toEqual([UNKNOWN]);
    expect(loadUniverseType).not.toHaveBeenCalledWith(BAKED);
  });
});
