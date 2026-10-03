import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PopularFit } from '@/engine/fittings/popularFits';
import type { WorkbenchFit } from './workbenchFits';

const { loadPopularFitsMock, catalog } = vi.hoisted(() => ({
  loadPopularFitsMock: vi.fn(),
  catalog: { fails: false },
}));
vi.mock('./popularFits', () => ({ loadPopularFits: loadPopularFitsMock }));
vi.mock('@/features/skills/typeCatalog', () => ({
  loadItemNameMap: async () => {
    if (catalog.fails) throw new Error('no catalog');
    return new Map([
      ['vexor', { typeID: 626 }],
      ['heavy neutron blaster ii', { typeID: 100 }],
      ['warp scrambler ii', { typeID: 200 }],
      ['damage control ii', { typeID: 300 }],
    ]);
  },
}));
vi.mock('@/sde/loadSde', () => ({
  loadFittingSlots: () => Promise.resolve({ 100: 'high', 200: 'medium', 300: 'low' }),
}));

import { loadWorkbenchSightings } from './workbenchSightings';

const POPULAR: PopularFit = {
  key: '100,200,300',
  count: 4,
  lastSeen: '2026-09-20T00:00:00Z',
  value: null,
  killmailIds: [1],
  parts: {
    hullTypeId: 626,
    modules: [
      { slot: 'high', slotIndex: 0, typeId: 100, state: 'active' },
      { slot: 'medium', slotIndex: 0, typeId: 200, state: 'active' },
      { slot: 'low', slotIndex: 0, typeId: 300, state: 'active' },
    ],
    drones: [],
    cargo: [],
    unresolved: [],
  },
};

function wbFit(id: string, eft: string): WorkbenchFit {
  return { id, name: id, authorId: null, authorName: '', dateAdded: 0, eft };
}
const MATCHING = wbFit(
  'a',
  '[Vexor]\nDamage Control II\nWarp Scrambler II\nHeavy Neutron Blaster II'
);
const OTHER = wbFit('b', '[Vexor]\nDamage Control II\nWarp Scrambler II');

describe('loadWorkbenchSightings', () => {
  beforeEach(() => {
    loadPopularFitsMock.mockReset();
    catalog.fails = false;
  });

  it("badges the fits matching the hull's Popular fits, from the zKillboard tab's load", async () => {
    loadPopularFitsMock.mockResolvedValue({ ok: true, fits: [POPULAR] });
    const sightings = await loadWorkbenchSightings(626, [MATCHING, OTHER]);
    expect(loadPopularFitsMock).toHaveBeenCalledWith(626);
    expect(sightings).toEqual(new Map([['a', { count: 4, lastSeen: '2026-09-20T00:00:00Z' }]]));
  });

  it('badges nothing when zKillboard is unreachable', async () => {
    loadPopularFitsMock.mockResolvedValue({ ok: false });
    expect((await loadWorkbenchSightings(626, [MATCHING])).size).toBe(0);
  });

  it("badges nothing, rather than throwing, when the type catalog won't load", async () => {
    loadPopularFitsMock.mockResolvedValue({ ok: true, fits: [POPULAR] });
    catalog.fails = true;
    expect((await loadWorkbenchSightings(626, [MATCHING])).size).toBe(0);
  });

  it('asks zKillboard nothing when there are no Workbench fits', async () => {
    expect((await loadWorkbenchSightings(626, [])).size).toBe(0);
    expect(loadPopularFitsMock).not.toHaveBeenCalled();
  });
});
