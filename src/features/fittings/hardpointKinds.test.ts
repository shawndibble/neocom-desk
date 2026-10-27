import { describe, expect, it, vi } from 'vitest';
import type { UniverseType } from '@/esi/endpoints';
import { loadUniverseType } from '@/features/skills/data';
import { loadTypeInfo } from '@/sde/loadTypeInfo';
import { loadHardpointKind } from './hardpointKinds';

vi.mock('@/sde/loadTypeInfo', () => ({ loadTypeInfo: vi.fn() }));
vi.mock('@/features/skills/data', () => ({
  loadUniverseType: vi.fn(),
  loadUniverseTypeOnce: vi.fn(),
  loadCharacterImplants: vi.fn(),
}));

const TURRET_FITTED = 42;
const LAUNCHER_FITTED = 40;

function baked(effects: number[]) {
  return { description: '', attributes: [], effects };
}

describe('loadHardpointKind', () => {
  it('reads turret, launcher and none from the baked effects, without asking ESI', async () => {
    vi.mocked(loadTypeInfo).mockImplementation(async (typeId) =>
      typeId === 1001
        ? baked([12, TURRET_FITTED])
        : typeId === 1002
          ? baked([LAUNCHER_FITTED])
          : baked([])
    );

    expect(await loadHardpointKind(1001)).toBe('turret');
    expect(await loadHardpointKind(1002)).toBe('launcher');
    expect(await loadHardpointKind(1003)).toBeNull();
    expect(loadUniverseType).not.toHaveBeenCalled();
  });

  it('falls back to ESI for a type the shard lacks, and is undefined when nothing has it', async () => {
    vi.mocked(loadTypeInfo).mockResolvedValue(null);
    vi.mocked(loadUniverseType).mockImplementation(async (typeId) =>
      typeId === 2001
        ? {
            data: {
              type_id: typeId,
              dogma_effects: [{ effect_id: TURRET_FITTED, is_default: false }],
            } as UniverseType,
            fetchedAt: new Date(0),
            fromCache: true,
            truncated: false,
          }
        : null
    );

    expect(await loadHardpointKind(2001)).toBe('turret');
    expect(await loadHardpointKind(2002)).toBeUndefined();
  });
});
