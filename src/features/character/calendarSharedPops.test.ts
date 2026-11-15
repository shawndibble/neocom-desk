import { describe, expect, it } from 'vitest';
import { buildCharacterBoard } from '@/engine/character/board';
import { filterByCorporation, filterBySharingCorporation } from '@/engine/character/deadlines';
import { parseStartLink } from '@/features/survey/startLink';
import type { SharedPopView } from '@/sync/sharedPops';
import {
  sharedPopDetail,
  sharedPopStartLink,
  toSharedPopSources,
  type SharedPopEntry,
} from './calendarSharedPops';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-15T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key;

function pop(overrides: Partial<SharedPopView> = {}): SharedPopView {
  return {
    id: '98000001_x1',
    extractionId: 'x1',
    moonId: 40_000_001,
    structureId: 1_000_000_000_001,
    refineryName: 'Efa - Tatara',
    solarSystemId: 30_000_001,
    popTime: 'ready',
    popAt: iso(NOW + 10 * HOUR),
    fractured: false,
    startedAt: iso(NOW - 5 * 24 * HOUR),
    expiresAt: iso(NOW + 61 * HOUR),
    ore: [{ typeId: 45_490, quantity: 1_200_000 }],
    notes: 'Fleet forms in local.',
    ratePct: 10,
    corporationId: 98_000_001,
    syncedAt: NOW - HOUR,
    ...overrides,
  };
}

const CORP = { id: 98_000_001, name: 'Tax Corp', ticker: 'TAX' };

function entry(overrides: Partial<SharedPopView> = {}): SharedPopEntry {
  return {
    pop: pop(overrides),
    moonName: 'Efa I - Moon 1',
    corporation: CORP,
    ore: [{ name: 'Zeolites', quantity: 1_200_000 }],
  };
}

describe('Shared Pops as Calendar clocks', () => {
  it('counts down to the Pop Time, named by refinery with the moon as a second line', () => {
    const [row] = toSharedPopSources([entry()], new Set(), NOW);
    expect(row).toEqual({
      id: '98000001_x1',
      subject: 'Efa - Tatara',
      subtitle: 'Efa I - Moon 1',
      detail: 'ready',
      deadlineMs: NOW + 10 * HOUR,
      sharedBy: CORP,
    });
    expect(
      toSharedPopSources([entry({ popTime: 'auto-fracture' })], new Set(), NOW)[0]!.detail
    ).toBe('autoFracture');
  });

  it('counts down to the expiry once popped, so a late fleet still sees the field', () => {
    const [row] = toSharedPopSources([entry({ popAt: iso(NOW - HOUR) })], new Set(), NOW);
    expect(row).toMatchObject({ detail: 'expires', deadlineMs: NOW + 61 * HOUR });
  });

  it('shows only from the Extraction start until it is Expired', () => {
    const notStarted = entry({ startedAt: iso(NOW + HOUR) });
    const expired = entry({ popAt: iso(NOW - 50 * HOUR), expiresAt: iso(NOW - 1) });
    expect(toSharedPopSources([notStarted, expired], new Set(), NOW)).toEqual([]);
  });

  it('is hidden when the pilot already reads that refinery as a corp moon chunk', () => {
    const readable = new Set([1_000_000_000_001]);
    expect(toSharedPopSources([entry()], readable, NOW)).toEqual([]);
  });

  it('falls back to the moon name, then the structure id, when the refinery is unnamed', () => {
    const unnamed = { ...entry({ refineryName: null }) };
    expect(toSharedPopSources([unnamed], new Set(), NOW)[0]).toMatchObject({
      subject: 'Efa I - Moon 1',
    });
    expect(toSharedPopSources([unnamed], new Set(), NOW)[0]!.subtitle).toBeUndefined();
    expect(toSharedPopSources([{ ...unnamed, moonName: null }], new Set(), NOW)[0]!.subject).toBe(
      '#1000000000001'
    );
  });

  it('rides the board as its own kind, filtered by sharing corporation and never by Corporation events', () => {
    const other = { ...entry({ id: '98000002_x2' }), corporation: { ...CORP, id: 98_000_002 } };
    const board = buildCharacterBoard({
      nowMs: NOW,
      sharedMoonPops: toSharedPopSources([entry(), other], new Set(), NOW),
    });
    expect(board.map((item) => item.kind)).toEqual(['sharedMoonPop', 'sharedMoonPop']);
    expect(board[0]!.sharedBy).toEqual(CORP);
    expect(filterByCorporation(board, 'none')).toHaveLength(2);
    expect(filterBySharingCorporation(board, 98_000_002).map((i) => i.sourceId)).toEqual([
      '98000002_x2',
    ]);
    expect(filterBySharingCorporation(board, 'all')).toHaveLength(2);
  });
});

describe('Shared Pop start link and detail', () => {
  it('builds a Survey start link with the refinery, the sharing corporation as payee and the rate', () => {
    const path = sharedPopStartLink(entry());
    expect(path.startsWith('/survey?')).toBe(true);
    expect(parseStartLink(path.slice('/survey'.length))).toEqual({
      place: { id: 1_000_000_000_001, name: 'Efa - Tatara' },
      payee: { id: 98_000_001, name: '' },
      rate: 10,
      notes: '',
    });
  });

  it('shows the moon, Pop Time, rate, notes and ore make-up as shared, never ISK', () => {
    const detail = sharedPopDetail(entry(), NOW, t, 'UTC');
    expect(detail.title).toBe('Efa - Tatara');
    expect(detail.facts[0]).toEqual({ label: 'calendar.sharedPop.moon', value: 'Efa I - Moon 1' });
    expect(detail.facts.map((f) => f.label)).toContain('calendar.sharedPop.popTime.ready');
    expect(detail.status).toMatchObject({
      badge: 'calendar.sharedPop.popTime.ready',
      note: 'Fleet forms in local.',
    });
    expect(detail.list?.items).toEqual([
      { key: 'Zeolites', text: 'Zeolites', value: 'calendar.sharedPop.units{"count":1200000}' },
    ]);
    expect(detail.place).toEqual({ systemId: 30_000_001, name: 'Efa - Tatara' });
    expect(detail.link?.to).toBe(sharedPopStartLink(entry()));
    expect(JSON.stringify(detail)).not.toMatch(/isk/i);
  });

  it('leaves out the ore list and the notes when the book shares none', () => {
    const detail = sharedPopDetail({ ...entry({ notes: '' }), ore: null }, NOW, t, 'UTC');
    expect(detail.list).toBeUndefined();
    expect(detail.status?.note).toBeUndefined();
  });
});
