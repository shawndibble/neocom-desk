import { describe, expect, it } from 'vitest';
import { buildView, feedsOf, kindSumsAcrossCharacters } from './models';
import type { BuildContext, FeedState } from './types';
import type { PlanetaryBoardData } from '../../data/boardData';
import { groupColoniesIntoBatches } from '@/engine/pi/colonyBatches';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;
const ctx = (patch: Partial<BuildContext> = {}): BuildContext => ({
  t,
  now: NOW,
  activeCharacterId: 1,
  scopeAll: true,
  notTrainingAlert: false,
  range: 30,
  ...patch,
});
const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });
const colonies = [
  {
    planetId: 7,
    name: 'Efa I',
    status: { idle: false, soonestExpiryMs: NOW + 3_600_000 },
    programCount: 2,
    ownerId: 22,
    ownerName: 'Pilot Two',
  },
  {
    planetId: 7,
    name: 'Efa I',
    status: { idle: false, soonestExpiryMs: NOW + 7_200_000 },
    programCount: 1,
    ownerId: 33,
    ownerName: 'Pilot Three',
  },
];
const board: PlanetaryBoardData = {
  batches: groupColoniesIntoBatches(colonies as never, (c) => c.status as never, NOW),
  colonyCount: 2,
  programCount: 3,
  needsReauth: false,
  fetchedAt: new Date(NOW),
  loadedAt: NOW,
};

describe('Planetary across every Character', () => {
  it('reads its own feed when scoped to All', () => {
    expect(kindSumsAcrossCharacters('planetary')).toBe(true);
    expect(feedsOf('planetary', undefined, true)).toEqual(['planetaryAll']);
    expect(feedsOf('planetary')).toEqual(['planetary']);
  });

  it('names each colony by its owner and keeps a shared planet as two rows', () => {
    const view = buildView('planetary', { planetaryAll: ok(board) }, ctx());
    const cells = view.table?.rows.map((row) => row.cells[0]);
    expect(cells).toEqual(['Efa I · Pilot Two', 'Efa I · Pilot Three']);
    expect(new Set(view.table?.rows.map((row) => row.key)).size).toBe(2);
    expect(view.number.secondary?.text).toBeDefined();
  });
});
