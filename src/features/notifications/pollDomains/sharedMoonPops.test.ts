import { describe, expect, it } from 'vitest';
import type { SharedPopView } from '@/sync/sharedPops';
import { sharedMoonPopEntries } from './sharedMoonPops';

const pop = (over: Partial<SharedPopView> = {}): SharedPopView => ({
  id: '98000001_1035_1762900000000',
  extractionId: '1035_1762900000000',
  moonId: 40001,
  structureId: 1035,
  refineryName: 'Efa - Moon Drill',
  solarSystemId: 30001,
  popTime: 'ready',
  popAt: '2026-11-15T14:00:00.000Z',
  fractured: false,
  startedAt: '2026-11-01T14:00:00.000Z',
  expiresAt: '2026-11-17T14:00:00.000Z',
  ore: null,
  notes: '',
  ratePct: 10,
  corporationId: 98000001,
  syncedAt: null,
  ...over,
});

describe('sharedMoonPopEntries', () => {
  it('turns a pop into an entry carrying the lead time', () => {
    expect(sharedMoonPopEntries([pop()], 7, 900_000, new Set())).toEqual([
      {
        popId: '98000001_1035_1762900000000',
        corporationId: 98000001,
        refineryName: 'Efa - Moon Drill',
        popTime: 'ready',
        popAtMs: Date.parse('2026-11-15T14:00:00.000Z'),
        ratePct: 10,
        leadMs: 900_000,
      },
    ]);
  });

  it('drops a muted sharing corporation', () => {
    expect(sharedMoonPopEntries([pop()], 7, 0, new Set([98000001]))).toEqual([]);
  });

  it('keeps only pops whose audience holds this Character, when the server says', () => {
    const pops = [pop({ viewerCharacterIds: [8] })];
    expect(sharedMoonPopEntries(pops, 7, 0, new Set())).toEqual([]);
    expect(sharedMoonPopEntries(pops, 8, 0, new Set())).toHaveLength(1);
    // An older server names no Characters: every Character counts.
    expect(sharedMoonPopEntries([pop()], 7, 0, new Set())).toHaveLength(1);
  });

  it('drops a pop with an unreadable Pop Time', () => {
    expect(sharedMoonPopEntries([pop({ popAt: 'soon' })], 7, 0, new Set())).toEqual([]);
  });
});
