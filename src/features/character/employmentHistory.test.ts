import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import type { CorporationHistoryEntry } from '@/esi/endpoints';
import { deriveEmploymentHistoryRows, loadEmploymentHistory } from './employmentHistory';

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
