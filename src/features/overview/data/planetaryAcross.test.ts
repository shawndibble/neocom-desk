import { describe, expect, it } from 'vitest';
import { groupColoniesIntoBatches } from '@/engine/pi/colonyBatches';
import type { BoardColony, PlanetaryBoardData } from './boardData';
import { mergePlanetaryBoards } from './planetaryAcross';

const NOW = 1_000_000;
const running = (planetId: number, expiryMs: number): BoardColony => ({
  planetId,
  name: `P${planetId}`,
  status: { idle: false, soonestExpiryMs: expiryMs } as BoardColony['status'],
  programCount: 2,
});
const stopped = (planetId: number): BoardColony => ({
  planetId,
  name: `P${planetId}`,
  status: { idle: true, soonestExpiryMs: NOW - 5 } as BoardColony['status'],
  programCount: 1,
});
const board = (
  colonies: BoardColony[],
  over: Partial<PlanetaryBoardData> = {}
): PlanetaryBoardData => ({
  batches: groupColoniesIntoBatches(colonies, (c) => c.status, NOW),
  colonyCount: colonies.length,
  programCount: colonies.reduce((sum, c) => sum + (c.programCount ?? 0), 0),
  needsReauth: false,
  fetchedAt: new Date(NOW),
  loadedAt: NOW,
  ...over,
});
const entry = (characterId: number, data: PlanetaryBoardData) => ({
  characterId,
  name: `Pilot ${characterId}`,
  data,
});

describe('mergePlanetaryBoards', () => {
  it("batches every Character's colonies together, each named by its owner", () => {
    const merged = mergePlanetaryBoards([
      entry(1, board([running(10, NOW + 100), stopped(11)])),
      entry(2, board([running(20, NOW + 100), stopped(21)])),
    ]);
    expect(merged.colonyCount).toBe(4);
    expect(merged.programCount).toBe(6);
    const kinds = merged.batches.map((b) => [b.kind, b.colonies.length]);
    expect(kinds).toEqual([
      ['expired', 2],
      ['running', 2],
    ]);
    const owners = merged.batches.flatMap((b) => b.colonies.map((c) => c.ownerName));
    expect(owners.sort()).toEqual(['Pilot 1', 'Pilot 1', 'Pilot 2', 'Pilot 2']);
  });

  it('keeps two Characters on one planet as two colonies', () => {
    const merged = mergePlanetaryBoards([
      entry(1, board([running(10, NOW + 100)])),
      entry(2, board([running(10, NOW + 200)])),
    ]);
    expect(merged.colonyCount).toBe(2);
  });

  it('needs a sign-in only when every Character does; as fresh as the stalest read', () => {
    const lapsed = board([], { needsReauth: true, fetchedAt: null });
    const fine = board([running(1, NOW + 1)], { fetchedAt: new Date(50) });
    expect(mergePlanetaryBoards([entry(1, lapsed), entry(2, fine)]).needsReauth).toBe(false);
    expect(mergePlanetaryBoards([entry(1, lapsed), entry(2, lapsed)]).needsReauth).toBe(true);
    expect(mergePlanetaryBoards([entry(1, lapsed), entry(2, fine)]).fetchedAt).toEqual(
      new Date(50)
    );
  });
});
