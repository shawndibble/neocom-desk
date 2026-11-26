import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deferred } from '@/test/deferred';
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

const sde = await import('@/sde/loadSde');
const { loadSkillNameMap } = await import('./typeCatalog');

async function freshLoadItemNameMap() {
  vi.resetModules();
  return (await import('./typeCatalog')).loadItemNameMap;
}

describe('loadSkillNameMap', () => {
  it('maps lowercase skill names to typeIDs', async () => {
    const map = await loadSkillNameMap();
    expect(map.get('gunnery')).toEqual({ typeID: 3336 });
    expect(map.get('GUNNERY')).toBeUndefined();
  });
});

describe('loadItemNameMap', () => {
  beforeEach(() => {
    vi.mocked(sde.loadTypes).mockClear();
  });

  it('maps lowercase item and module names to typeIDs', async () => {
    const loadItemNameMap = await freshLoadItemNameMap();
    const map = await loadItemNameMap();
    expect(map.get('damage control ii')).toEqual({ typeID: 2456 });
  });

  it('lets types.json win over a same-named skill', async () => {
    const loadItemNameMap = await freshLoadItemNameMap();
    const map = await loadItemNameMap();
    expect(map.get('rifter')).toEqual({ typeID: 587 });
  });

  it('retries after a failed load instead of remembering the failure', async () => {
    const loadItemNameMap = await freshLoadItemNameMap();
    vi.mocked(sde.loadTypes).mockRejectedValueOnce(new Error('offline'));

    await expect(loadItemNameMap()).rejects.toThrow('offline');
    const map = await loadItemNameMap();

    expect(map.get('rifter')).toEqual({ typeID: 587 });
    expect(sde.loadTypes).toHaveBeenCalledTimes(2);
  });

  it('shares one load between callers while it is in flight', async () => {
    const loadItemNameMap = await freshLoadItemNameMap();
    const types = deferred<TypeMap>();
    vi.mocked(sde.loadTypes).mockReturnValueOnce(types.promise);

    const first = loadItemNameMap();
    const second = loadItemNameMap();
    types.resolve(TYPES);

    expect(await first).toBe(await second);
    expect(sde.loadTypes).toHaveBeenCalledTimes(1);
  });

  it('reuses the built map after a successful load', async () => {
    const loadItemNameMap = await freshLoadItemNameMap();
    const first = await loadItemNameMap();
    const second = await loadItemNameMap();

    expect(second).toBe(first);
    expect(sde.loadTypes).toHaveBeenCalledTimes(1);
  });
});
