import { describe, it, expect, vi } from 'vitest';
import type { SkillType } from '@/sde/types';
import type { TypeMap } from '@/sde/types';

const TYPES: TypeMap = {
  '587': { name: 'Rifter', groupID: 25, volume: 27000 },
  '2456': { name: 'Damage Control II', groupID: 60, volume: 5 },
};

const SKILLS: SkillType[] = [
  {
    typeID: 3336,
    name: 'Gunnery',
    description: '',
    groupID: 10,
    groupName: 'Gunnery',
    rank: 1,
    primaryAttr: 'perception',
    secondaryAttr: 'willpower',
    prereqs: [],
  },
  // Deliberately collides with a types.json name to prove items win.
  {
    typeID: 99999,
    name: 'Rifter',
    description: '',
    groupID: 1,
    groupName: 'x',
    rank: 1,
    primaryAttr: 'memory',
    secondaryAttr: 'intelligence',
    prereqs: [],
  },
];

vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => TYPES),
  loadSkills: vi.fn(async () => SKILLS),
}));

const { loadItemNameMap, loadSkillNameMap } = await import('./typeCatalog');

describe('loadSkillNameMap', () => {
  it('maps lowercase skill names to typeIDs', async () => {
    const map = await loadSkillNameMap();
    expect(map.get('gunnery')).toEqual({ typeID: 3336 });
    expect(map.get('GUNNERY')).toBeUndefined(); // caller lowercases the lookup key
  });
});

describe('loadItemNameMap', () => {
  it('maps lowercase item and module names to typeIDs', async () => {
    const map = await loadItemNameMap();
    expect(map.get('damage control ii')).toEqual({ typeID: 2456 });
  });

  it('lets types.json win over a same-named skill', async () => {
    const map = await loadItemNameMap();
    expect(map.get('rifter')).toEqual({ typeID: 587 });
  });
});
