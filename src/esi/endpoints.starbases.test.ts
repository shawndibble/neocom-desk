import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import { configureEsi, ESI_BASE_URL } from './client';
import { resetEsiBudget } from './budget';
import { rejectBadEsiHeaders } from './test-helpers';
import { getCorporationStarbase, getCorporationStarbases } from './endpoints';

const CHARACTER_ID = 95465499;
const CORPORATION_ID = 98000001;
const server = mswServer();

beforeEach(() => {
  configureEsi({ getToken: vi.fn(async (id: number) => `token-${id}`) });
});
afterEach(() => {
  configureEsi({ getToken: null });
  resetEsiBudget();
});

describe('corp starbases', () => {
  it('getCorporationStarbases lists every tower, across pages', async () => {
    const tower = (starbase_id: number) => ({
      starbase_id,
      system_id: 30000142,
      type_id: 12235,
      state: 'online',
    });
    server.use(
      http.get(`${ESI_BASE_URL}/corporations/${CORPORATION_ID}/starbases`, ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        const page = new URL(request.url).searchParams.get('page');
        return HttpResponse.json(page === '2' ? [tower(2)] : [tower(1)], {
          headers: { 'X-Pages': '2' },
        });
      })
    );

    const result = await getCorporationStarbases(CHARACTER_ID, CORPORATION_ID);

    expect(result.items).toEqual([tower(1), tower(2)]);
    expect(result.truncated).toBe(false);
  });

  it("getCorporationStarbase reads one tower's bay and sends the tower's system", async () => {
    const detail = {
      fuels: [
        { type_id: 4247, quantity: 3000 },
        { type_id: 16275, quantity: 400 },
      ],
    };
    let systemId: string | null = null;
    server.use(
      http.get(`${ESI_BASE_URL}/corporations/${CORPORATION_ID}/starbases/77`, ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        systemId = new URL(request.url).searchParams.get('system_id');
        return HttpResponse.json(detail);
      })
    );

    const result = await getCorporationStarbase(CHARACTER_ID, CORPORATION_ID, 77, 30000142);

    expect(result.data).toEqual(detail);
    expect(systemId).toBe('30000142');
  });
});
