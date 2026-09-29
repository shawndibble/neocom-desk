import { describe, expect, it } from 'vitest';
import { buildCorpBoard, type BoardStructureSource } from '@/engine/corp/board';
import type { BoardClockSource } from '@/engine/character/board';
import {
  moonChunkSeverity,
  moonChunksDeadline,
  moonChunksSeverity,
  structureCounts,
  structuresDeadline,
  structuresSeverity,
} from './corpCards';
import { moonChunksSummary, structuresSummary } from './boardSummary';

const NOW = Date.parse('2026-01-01T00:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function t(key: string, options?: Record<string, unknown>): string {
  if (options === undefined) return key;
  const args = Object.entries(options)
    .map(([name, value]) => `${name}=${String(value)}`)
    .join(',');
  return `${key}(${args})`;
}

function structure(overrides: Partial<BoardStructureSource> = {}): BoardStructureSource {
  return {
    structureId: 1,
    name: 'Home Astrahus',
    fuelExpiresMs: NOW + 30 * DAY,
    state: 'shield_vulnerable',
    stateTimerEndMs: null,
    unanchorsAtMs: null,
    services: [],
    ...overrides,
  };
}

function board(structures: BoardStructureSource[]) {
  return buildCorpBoard({ nowMs: NOW, staleWindowMs: HOUR, structures });
}

const data = (structures: BoardStructureSource[]) => ({
  items: board(structures),
  structureCount: structures.length,
  needsReauth: false,
  fetchedAt: null,
});

describe('structureCounts', () => {
  it('counts reinforcement timers, fuel within three days, and offline services', () => {
    const counts = structureCounts(
      board([
        structure({ structureId: 1, state: 'armor_reinforce', stateTimerEndMs: NOW + 20 * HOUR }),
        structure({ structureId: 2, fuelExpiresMs: NOW + 2 * DAY }),
        structure({ structureId: 3, fuelExpiresMs: null }),
        structure({
          structureId: 4,
          services: [{ name: 'Manufacturing Plant', state: 'offline' }],
        }),
      ])
    );
    expect(counts).toEqual({ timers: 1, lowFuel: 2, offline: 1 });
  });
});

describe('structuresSeverity and structuresSummary', () => {
  it('are loading-aware', () => {
    expect(structuresSeverity(null)).toBeNull();
    expect(structuresSummary(t, null)).toBe('overview.board.checking');
  });

  it('lead with a reinforcement timer', () => {
    const d = data([
      structure({ state: 'armor_reinforce', stateTimerEndMs: NOW + 20 * HOUR }),
      structure({ structureId: 2, fuelExpiresMs: NOW + 2 * DAY }),
    ]);
    expect(structuresSeverity(d)).toBe('critical');
    expect(structuresSummary(t, d)).toBe('overview.board.structuresTimers(count=1)');
  });

  it('say how many structures are fine when nothing needs doing', () => {
    const d = data([structure(), structure({ structureId: 2 })]);
    expect(structuresSeverity(d)).toBe('clear');
    expect(structuresSummary(t, d)).toBe('overview.board.structuresFine(count=2)');
  });

  it('say so when the structure list cannot be read', () => {
    const d = { items: null, structureCount: 0, needsReauth: false, fetchedAt: null };
    expect(structuresSeverity(d)).toBeNull();
    expect(structuresSummary(t, d)).toBe('overview.board.corpUnreadable');
  });
});

describe('structuresDeadline', () => {
  it('offers the soonest timed clock the snapshot can honestly count down', () => {
    const items = board([
      structure({ structureId: 1, fuelExpiresMs: NOW + 5 * DAY }),
      structure({ structureId: 2, state: 'armor_reinforce', stateTimerEndMs: NOW + 20 * HOUR }),
    ]);
    expect(structuresDeadline(items, NOW)).toMatchObject({
      atMs: NOW + 20 * HOUR,
      kind: 'structureTimer',
    });
  });

  /*
   * CCP caches corp structures for about an hour, so a twelve-minute timer
   * read from that snapshot may already be over. The Corp page will not tick
   * one down, and neither may the strip.
   */
  it('skips a clock shorter than the cache window, and a dry structure with no instant', () => {
    const items = board([
      structure({ structureId: 1, state: 'hull_reinforce', stateTimerEndMs: NOW + 12 * 60_000 }),
      structure({ structureId: 2, fuelExpiresMs: null }),
    ]);
    expect(structuresDeadline(items, NOW)?.atMs).toBe(NOW + 30 * DAY);
  });
});

describe('moon chunks', () => {
  const chunk = (hours: number, detail: 'arrival' | 'decay', id = '1'): BoardClockSource => ({
    id,
    subject: 'Refinery',
    detail,
    deadlineMs: NOW + hours * HOUR,
  });
  const moon = (chunks: BoardClockSource[] | null) => ({
    chunks,
    needsReauth: false,
    fetchedAt: null,
    loadedAt: NOW,
  });

  it('rates a landed chunk warning, one arriving within a day watch, the rest clear', () => {
    expect(moonChunkSeverity(chunk(2, 'decay'), NOW)).toBe('warning');
    expect(moonChunkSeverity(chunk(10, 'arrival'), NOW)).toBe('watch');
    expect(moonChunkSeverity(chunk(60, 'arrival'), NOW)).toBe('clear');
  });

  it('summarises ready chunks first, then the next arrival', () => {
    expect(moonChunksSummary(t, moon([chunk(2, 'decay'), chunk(40, 'arrival', '2')]), NOW)).toBe(
      'overview.board.moonChunksReady(count=1)'
    );
    expect(moonChunksSummary(t, moon([chunk(40, 'arrival')]), NOW)).toBe(
      'overview.board.moonChunksNext(when=1d 16h)'
    );
    expect(moonChunksSummary(t, moon([]), NOW)).toBe('overview.board.moonChunksNone');
    expect(moonChunksSeverity(moon([chunk(2, 'decay')]), NOW)).toBe('warning');
    expect(moonChunksSeverity(null, NOW)).toBeNull();
  });

  it('offers the soonest chunk clock still ahead as a deadline', () => {
    expect(
      moonChunksDeadline([chunk(40, 'arrival', '1'), chunk(3, 'decay', '2')], NOW)
    ).toMatchObject({ id: '2' });
    expect(moonChunksDeadline([], NOW)).toBeNull();
  });
});
