import { MINUTE_MS } from '@/lib/age';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadRegionMarketTypes, regionTypesReloadSlot } from './regionMarketTypes';

const REGION_ID = 10000002;

const server = mswServer();

beforeEach(async () => {
  await db.esiCache.clear();
});

afterEach(() => vi.restoreAllMocks());

describe('loadRegionMarketTypes', () => {
  it('collects every page of the region type list into one set', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${REGION_ID}/types`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1';
        return HttpResponse.json(page === '1' ? [34, 35] : [587], {
          headers: { 'X-Pages': '2' },
        });
      })
    );

    const types = await loadRegionMarketTypes(REGION_ID);
    expect(types && [...types].sort((a, b) => a - b)).toEqual([34, 35, 587]);
  });

  it('reads a region again from the cache inside the window, without a request', async () => {
    let hits = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${REGION_ID}/types`, () => {
        hits += 1;
        return HttpResponse.json([34]);
      })
    );

    await loadRegionMarketTypes(REGION_ID);
    const again = await loadRegionMarketTypes(REGION_ID);
    expect(hits).toBe(1);
    expect(again?.has(34)).toBe(true);
  });

  it('is null when the list cannot be read, so nothing is claimed absent', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${REGION_ID}/types`, () =>
        HttpResponse.json({ error: 'down' }, { status: 503 })
      )
    );

    expect(await loadRegionMarketTypes(REGION_ID)).toBeNull();
  });

  it('is null when a page is missing, since a short list would claim live types absent', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${REGION_ID}/types`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1';
        if (page === '2') return HttpResponse.json({ error: 'down' }, { status: 503 });
        return HttpResponse.json([34], { headers: { 'X-Pages': '2' } });
      })
    );

    expect(await loadRegionMarketTypes(REGION_ID)).toBeNull();
  });

  it('is null when a refresh fails and only an out-of-window copy is saved', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${REGION_ID}/types`, () => HttpResponse.json([34]))
    );
    await loadRegionMarketTypes(REGION_ID);

    const later = Date.now() + 11 * 60_000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    server.use(
      http.get(`${ESI_BASE_URL}/markets/${REGION_ID}/types`, () =>
        HttpResponse.json({ error: 'down' }, { status: 503 })
      )
    );

    expect(await loadRegionMarketTypes(REGION_ID)).toBeNull();
  });
});

describe('regionTypesReloadSlot', () => {
  it('moves once per cache window, so a held list reloads after it', () => {
    expect(regionTypesReloadSlot(0, false)).toBe(regionTypesReloadSlot(9 * MINUTE_MS, false));
    expect(regionTypesReloadSlot(10 * MINUTE_MS, false)).not.toBe(
      regionTypesReloadSlot(9 * MINUTE_MS, false)
    );
  });

  it('moves every minute while the last load came back empty, so a failed load retries', () => {
    expect(regionTypesReloadSlot(MINUTE_MS, true)).not.toBe(regionTypesReloadSlot(0, true));
  });
});
