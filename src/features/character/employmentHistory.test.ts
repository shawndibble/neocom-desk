import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import type { CorporationHistoryEntry } from '@/esi/endpoints';
import {
  deriveEmploymentHistoryRows,
  deriveEmploymentSummary,
  loadEmploymentHistory,
} from './employmentHistory';
import { DAY_MS } from '@/lib/age';

const CHAR_ID = 91;
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await db.esiCache.clear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ENTRY = (
  recordId: number,
  corporationId: number,
  startDate: string
): CorporationHistoryEntry => ({
  record_id: recordId,
  corporation_id: corporationId,
  start_date: startDate,
});

const NOW = new Date('2026-06-01T00:00:00Z').getTime();
const daysAgo = (d: number) => new Date(NOW - d * DAY_MS).toISOString();

describe('employment row flags', () => {
  it('marks a stint as returned only when the same corp appears in an earlier record', () => {
    const rows = deriveEmploymentHistoryRows(
      [ENTRY(1, 100, daysAgo(900)), ENTRY(2, 200, daysAgo(500)), ENTRY(3, 100, daysAgo(100))],
      NOW
    );

    expect(rows.map((r) => r.returned)).toEqual([true, false, false]);
  });

  it('marks stints under 14 days as short, with 14 days exactly not short', () => {
    const rows = deriveEmploymentHistoryRows(
      [ENTRY(1, 100, daysAgo(400)), ENTRY(2, 200, daysAgo(100)), ENTRY(3, 300, daysAgo(86))],
      NOW
    );

    // 300 ran 86d -> now (86d); 200 ran 100d -> 86d (14d); 100 ran 400d -> 100d.
    expect(rows.map((r) => r.shortStay)).toEqual([false, false, false]);
    const tight = deriveEmploymentHistoryRows(
      [ENTRY(1, 100, daysAgo(400)), ENTRY(2, 200, daysAgo(100)), ENTRY(3, 300, daysAgo(87))],
      NOW
    );
    expect(tight.map((r) => r.shortStay)).toEqual([false, true, false]);
  });

  it('never calls the ongoing stint a short stay, however recently it began', () => {
    const rows = deriveEmploymentHistoryRows(
      [ENTRY(1, 100, daysAgo(400)), ENTRY(2, 200, daysAgo(3))],
      NOW
    );

    expect(rows.map((r) => r.shortStay)).toEqual([false, false]);
  });

  it('gives each stint its tenure as a fraction of the longest', () => {
    const rows = deriveEmploymentHistoryRows(
      [ENTRY(1, 100, daysAgo(400)), ENTRY(2, 200, daysAgo(100))],
      NOW
    );

    expect(rows.map((r) => r.tenureRatio)).toEqual([100 / 300, 1]);
  });
});

// 1_000_125 sits in CCP's NPC corporation id block; 100/200/300 stand in for player corps.
const NPC = 1_000_125;

describe('NPC corporation stints', () => {
  it('flags NPC stints and never calls them returned or short', () => {
    const rows = deriveEmploymentHistoryRows(
      [
        ENTRY(1, NPC, daysAgo(900)),
        ENTRY(2, 100, daysAgo(800)),
        ENTRY(3, NPC, daysAgo(500)),
        ENTRY(4, 200, daysAgo(497)),
      ],
      NOW
    );

    expect(rows.map((r) => r.npc)).toEqual([false, true, false, true]);
    expect(rows.map((r) => r.returned)).toEqual([false, false, false, false]);
    expect(rows.map((r) => r.shortStay)).toEqual([false, false, false, false]);
  });

  it('scales bars to the longest player stint, capping a longer NPC stint at full', () => {
    const rows = deriveEmploymentHistoryRows(
      [ENTRY(1, 100, daysAgo(1000)), ENTRY(2, NPC, daysAgo(900)), ENTRY(3, 200, daysAgo(50))],
      NOW
    );

    // 200: 50d, NPC: 850d, 100: 100d.
    expect(rows.map((r) => r.tenureRatio)).toEqual([0.5, 1, 1]);
  });

  it('scales against every stint when the pilot has only ever been in NPC corps', () => {
    const rows = deriveEmploymentHistoryRows(
      [ENTRY(1, NPC, daysAgo(300)), ENTRY(2, 1_000_166, daysAgo(100))],
      NOW
    );

    expect(rows.map((r) => r.tenureRatio)).toEqual([0.5, 1]);
  });

  it('leaves NPC stints out of the corporation count and the longest stay', () => {
    const rows = deriveEmploymentHistoryRows(
      [ENTRY(1, 100, daysAgo(1000)), ENTRY(2, NPC, daysAgo(900)), ENTRY(3, 200, daysAgo(50))],
      NOW
    );

    expect(deriveEmploymentSummary(rows, NOW)).toEqual({
      timeInGameSeconds: 1000 * 86_400,
      corporationCount: 2,
      currentTenureSeconds: 50 * 86_400,
      longest: { corporationId: 100, seconds: 100 * 86_400 },
    });
  });

  it('has no longest stay when every stint was in an NPC corp', () => {
    const rows = deriveEmploymentHistoryRows([ENTRY(1, NPC, daysAgo(300))], NOW);

    expect(deriveEmploymentSummary(rows, NOW)).toMatchObject({
      corporationCount: 0,
      longest: null,
    });
  });
});

describe('deriveEmploymentSummary', () => {
  it('returns zeros and no longest for an empty history', () => {
    expect(deriveEmploymentSummary([], NOW)).toEqual({
      timeInGameSeconds: 0,
      corporationCount: 0,
      currentTenureSeconds: 0,
      longest: null,
    });
  });

  it('reports time in game from the earliest start, distinct corps, current tenure and longest stay', () => {
    const rows = deriveEmploymentHistoryRows(
      [ENTRY(1, 100, daysAgo(950)), ENTRY(2, 200, daysAgo(500)), ENTRY(3, 100, daysAgo(100))],
      NOW
    );

    expect(deriveEmploymentSummary(rows, NOW)).toEqual({
      timeInGameSeconds: 950 * 86_400,
      corporationCount: 2,
      currentTenureSeconds: 100 * 86_400,
      longest: { corporationId: 100, seconds: 450 * 86_400 },
    });
  });

  it('keeps the more recent stint when two tie for longest', () => {
    const rows = deriveEmploymentHistoryRows(
      [ENTRY(1, 100, daysAgo(200)), ENTRY(2, 200, daysAgo(100))],
      NOW
    );

    expect(deriveEmploymentSummary(rows, NOW).longest?.corporationId).toBe(200);
  });
});

describe('deriveEmploymentHistoryRows', () => {
  it('sorts most-recent first and credits the current corp for the time since it started', () => {
    const now = new Date('2026-06-01T00:00:00Z').getTime();
    const rows = deriveEmploymentHistoryRows(
      [ENTRY(1, 100, '2025-01-01T00:00:00Z'), ENTRY(2, 200, '2026-01-01T00:00:00Z')],
      now
    );

    expect(rows.map((r) => r.recordId)).toEqual([2, 1]);
    expect(rows[0].tenureSeconds).toBe((now - new Date('2026-01-01T00:00:00Z').getTime()) / 1000);
  });

  it('credits a past corp for the gap until the next corp started', () => {
    const now = new Date('2026-06-01T00:00:00Z').getTime();
    const rows = deriveEmploymentHistoryRows(
      [ENTRY(1, 100, '2025-01-01T00:00:00Z'), ENTRY(2, 200, '2026-01-01T00:00:00Z')],
      now
    );

    const past = rows.find((r) => r.recordId === 1);
    const gapSeconds =
      (new Date('2026-01-01T00:00:00Z').getTime() - new Date('2025-01-01T00:00:00Z').getTime()) /
      1000;
    expect(past?.tenureSeconds).toBe(gapSeconds);
  });

  it('returns an empty list for no entries', () => {
    expect(deriveEmploymentHistoryRows([], Date.now())).toEqual([]);
  });

  it('flags only the most recent row as ongoing', () => {
    const now = new Date('2026-06-01T00:00:00Z').getTime();
    const rows = deriveEmploymentHistoryRows(
      [ENTRY(1, 100, '2025-01-01T00:00:00Z'), ENTRY(2, 200, '2026-01-01T00:00:00Z')],
      now
    );

    expect(rows.map((r) => ({ recordId: r.recordId, ongoing: r.ongoing }))).toEqual([
      { recordId: 2, ongoing: true },
      { recordId: 1, ongoing: false },
    ]);
  });
});

describe('loadEmploymentHistory', () => {
  it('fetches and caches the character-keyed history', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/corporationhistory`, () =>
        HttpResponse.json([
          ENTRY(2, 200, '2026-01-01T00:00:00Z'),
          ENTRY(1, 100, '2025-01-01T00:00:00Z'),
        ])
      )
    );

    const result = await loadEmploymentHistory(CHAR_ID);

    expect(result?.data.map((e) => e.record_id)).toEqual([2, 1]);
    expect((await db.esiCache.get([CHAR_ID, 'employment-history']))?.value).toBeDefined();
  });

  it('falls back to cache offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'employment-history',
      value: [ENTRY(1, 100, '2025-01-01T00:00:00Z')],
      fetchedAt: 9,
    });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/corporationhistory`, () =>
        HttpResponse.error()
      )
    );

    const result = await loadEmploymentHistory(CHAR_ID);

    expect(result).toEqual({
      data: [ENTRY(1, 100, '2025-01-01T00:00:00Z')],
      fetchedAt: new Date(9),
      fromCache: true,
      truncated: false,
    });
  });
});
