import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AttributeDictionary } from '@/engine/market/itemAttributes';

const DICTIONARY: AttributeDictionary = {
  9: { name: 'Structure Hitpoints', unit: 'HP', category: 'Structure' },
  137: { name: 'Used with (Launcher Group)', unit: 'groupID', category: 'Miscellaneous' },
  182: { name: 'Primary Skill required', unit: 'typeID', category: 'Required Skills' },
  1632: { name: 'Planet Type Restriction', unit: 'typeID', category: 'Miscellaneous' },
};

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => [{ typeID: 3436, name: 'Spaceship Command' }]),
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: vi.fn(async (ids: readonly number[]) => new Map(ids.map((id) => [id, `T${id}`]))),
}));
vi.mock('./groupNames', () => ({
  loadGroupNames: vi.fn(async (ids: readonly number[]) => new Map(ids.map((id) => [id, `G${id}`]))),
}));

const { loadSkills } = await import('@/sde/loadSde');
const { loadTypeNames } = await import('@/features/character/typeNames');
const { loadGroupNames } = await import('./groupNames');
const { loadAttributeNames } = await import('./attributeNames');

beforeEach(() => vi.clearAllMocks());

describe('loadAttributeNames', () => {
  it('resolves type and group references across every item it is given', async () => {
    const names = await loadAttributeNames(
      [[{ attribute_id: 137, value: 483 }], [{ attribute_id: 1632, value: 11 }]],
      DICTIONARY
    );
    expect(names.groups).toEqual({ 483: 'G483' });
    expect(names.types?.[11]).toBe('T11');
  });

  it('covers a skill reference from the precached snapshot, without an id lookup', async () => {
    const names = await loadAttributeNames([[{ attribute_id: 182, value: 3436 }]], DICTIONARY);
    expect(names.types?.[3436]).toBe('Spaceship Command');
    expect(loadTypeNames).not.toHaveBeenCalled();
  });

  it('asks for each distinct id once, however many items reference it', async () => {
    await loadAttributeNames(
      [[{ attribute_id: 137, value: 483 }], [{ attribute_id: 137, value: 483 }]],
      DICTIONARY
    );
    expect(loadGroupNames).toHaveBeenCalledWith([483]);
  });

  it('looks nothing up for an item whose attributes reference no ids', async () => {
    const names = await loadAttributeNames([[{ attribute_id: 9, value: 1200 }]], DICTIONARY);
    expect(loadGroupNames).not.toHaveBeenCalled();
    expect(loadTypeNames).not.toHaveBeenCalled();
    expect(names.groups).toEqual({});
  });

  it('still returns the names it could resolve when another lookup fails', async () => {
    vi.mocked(loadGroupNames).mockRejectedValueOnce(new Error('offline'));
    const names = await loadAttributeNames(
      [
        [
          { attribute_id: 137, value: 483 },
          { attribute_id: 1632, value: 11 },
        ],
      ],
      DICTIONARY
    );
    expect(names.groups).toEqual({});
    expect(names.types?.[11]).toBe('T11');
  });

  it('survives the skill snapshot being unreadable', async () => {
    vi.mocked(loadSkills).mockRejectedValueOnce(new Error('404'));
    const names = await loadAttributeNames([[{ attribute_id: 182, value: 3436 }]], DICTIONARY);
    expect(names.types?.[3436]).toBe('T3436');
  });
});
