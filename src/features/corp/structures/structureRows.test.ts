import { describe, expect, it } from 'vitest';
import { buildCorpBoard, type BoardStructureSource } from '@/engine/corp/board';
import { DAY_MS, HOUR_MS } from '@/lib/age';
import { byUrgency, filterStructureRows, structureRows, type StructureRow } from './structureRows';

const NOW = Date.UTC(2026, 10, 11, 12);

function source(
  over: Partial<BoardStructureSource> & { structureId: number }
): BoardStructureSource {
  return {
    name: `Efa - Keep ${over.structureId}`,
    fuelExpiresMs: NOW + 20 * DAY_MS,
    state: 'shield_vulnerable',
    stateTimerEndMs: null,
    unanchorsAtMs: null,
    services: [],
    ...over,
  };
}

function rowsOf(structures: BoardStructureSource[]): StructureRow[] {
  return structureRows(
    structures,
    buildCorpBoard({ nowMs: NOW, staleWindowMs: HOUR_MS, structures })
  );
}

describe('structureRows', () => {
  it('names each structure’s own fuel, timer, offline services and unanchor', () => {
    const [row] = rowsOf([
      source({
        structureId: 1,
        state: 'armor_reinforce',
        stateTimerEndMs: NOW + 5 * HOUR_MS,
        unanchorsAtMs: NOW + 2 * DAY_MS,
        services: [
          { name: 'Clone Bay', state: 'online' },
          { name: 'Market', state: 'offline' },
        ],
      }),
    ]);
    expect(row.fuel?.id).toBe('fuel:1');
    expect(row.timer?.detail).toBe('armor_reinforce');
    expect(row.offline.map((item) => item.detail)).toEqual(['Market']);
    expect(row.unanchor?.detail).toBe('unanchoring');
    expect(row.problem).toBe(true);
  });

  it('a healthy structure is no problem; low fuel, a timer or an offline service is', () => {
    const rows = rowsOf([
      source({ structureId: 1 }),
      source({ structureId: 2, fuelExpiresMs: NOW + 2 * DAY_MS }),
    ]);
    const byId = new Map(rows.map((row) => [row.source.structureId, row]));
    expect(byId.get(1)?.problem).toBe(false);
    expect(byId.get(2)?.lowFuel).toBe(true);
    expect(byId.get(2)?.problem).toBe(true);
  });
});

describe('byUrgency', () => {
  it('puts timers first (soonest first), then fuel running out soonest', () => {
    const rows = rowsOf([
      source({ structureId: 1, fuelExpiresMs: NOW + 10 * DAY_MS }),
      source({ structureId: 2, fuelExpiresMs: NOW + 3 * DAY_MS }),
      source({ structureId: 3, state: 'hull_reinforce', stateTimerEndMs: NOW + 30 * HOUR_MS }),
      source({ structureId: 4, state: 'armor_reinforce', stateTimerEndMs: NOW + 3 * HOUR_MS }),
      source({ structureId: 5, fuelExpiresMs: null }),
    ]);
    expect([...rows].sort(byUrgency).map((row) => row.source.structureId)).toEqual([4, 3, 5, 2, 1]);
  });
});

describe('filterStructureRows', () => {
  const rows = rowsOf([
    source({ structureId: 1, name: 'Efa - Alpha', corporationId: 10, systemId: 100 }),
    source({
      structureId: 2,
      name: 'Amarr - Beta',
      corporationId: 20,
      systemId: 200,
      fuelExpiresMs: NOW + HOUR_MS * 2,
    }),
  ]);
  const names = {
    corporation: (id: number | undefined) =>
      id === 10 ? 'Holding One [HOLD1]' : 'Main Corp [MAIN]',
    system: (id: number | undefined) => (id === 100 ? 'Efa' : 'Amarr'),
  };
  const ids = (list: readonly StructureRow[]) => list.map((row) => row.source.structureId);

  it('keeps every row with no filter', () => {
    expect(ids(filterStructureRows(rows, { corp: null, problems: false, q: '' }, names))).toEqual([
      1, 2,
    ]);
  });

  it('narrows to one corporation', () => {
    expect(ids(filterStructureRows(rows, { corp: 20, problems: false, q: '' }, names))).toEqual([
      2,
    ]);
  });

  it('Problems only keeps the widget’s problems', () => {
    expect(ids(filterStructureRows(rows, { corp: null, problems: true, q: '' }, names))).toEqual([
      2,
    ]);
  });

  it('searches structure, system and corporation, case-insensitively', () => {
    const q = (text: string) =>
      ids(filterStructureRows(rows, { corp: null, problems: false, q: text }, names));
    expect(q('alpha')).toEqual([1]);
    expect(q('amarr')).toEqual([2]);
    expect(q('hold1')).toEqual([1]);
    expect(q('nothing')).toEqual([]);
  });
});
