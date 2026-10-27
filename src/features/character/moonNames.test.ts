import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadMoonNames } from './moonNames';

let requests: string[] = [];
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await db.esiCache.clear();
  requests = [];
  server.use(
    http.get(`${ESI_BASE_URL}/universe/moons/:id`, ({ params }) => {
      requests.push(String(params.id));
      if (params.id === '404') return new HttpResponse(null, { status: 404 });
      return HttpResponse.json({
        moon_id: Number(params.id),
        name: `Efa V - Moon ${params.id}`,
        system_id: 30001000,
        position: { x: 0, y: 0, z: 0 },
      });
    })
  );
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('loadMoonNames', () => {
  it('names each moon from the public endpoint', async () => {
    const names = await loadMoonNames([1, 2]);
    expect(names.get(1)).toBe('Efa V - Moon 1');
    expect(names.get(2)).toBe('Efa V - Moon 2');
  });

  it('asks once per moon, then reads the cache', async () => {
    await loadMoonNames([1, 1, 2]);
    await loadMoonNames([1, 2]);
    expect(requests.sort()).toEqual(['1', '2']);
  });

  it('leaves out a moon ESI cannot name instead of failing the rest', async () => {
    const names = await loadMoonNames([3, 404]);
    expect([...names.keys()]).toEqual([3]);
  });
});
