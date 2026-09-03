import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadGroupNames } from './groupNames';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await db.esiCache.clear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function group(groupId: number, name: string) {
  return http.get(`${ESI_BASE_URL}/universe/groups/${groupId}`, () =>
    HttpResponse.json({ group_id: groupId, name, category_id: 7, published: true, types: [] })
  );
}

describe('loadGroupNames', () => {
  it('resolves each requested group id to its name', async () => {
    server.use(group(483, 'Mining Laser'), group(25, 'Frigate'));
    const names = await loadGroupNames([483, 25]);
    expect(names.get(483)).toBe('Mining Laser');
    expect(names.get(25)).toBe('Frigate');
  });

  it('asks ESI once per distinct id, however many rows referenced it', async () => {
    let calls = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/universe/groups/483`, () => {
        calls += 1;
        return HttpResponse.json({
          group_id: 483,
          name: 'Mining Laser',
          category_id: 7,
          published: true,
          types: [],
        });
      })
    );
    await loadGroupNames([483, 483, 483]);
    expect(calls).toBe(1);
  });

  it('serves a second call from the cache without touching the network', async () => {
    server.use(group(483, 'Mining Laser'));
    await loadGroupNames([483]);
    server.resetHandlers(); // any request now is an unhandled-request error
    expect((await loadGroupNames([483])).get(483)).toBe('Mining Laser');
  });

  it('omits an id ESI cannot resolve, rather than inventing a label', async () => {
    server.use(
      http.get(
        `${ESI_BASE_URL}/universe/groups/99999`,
        () => new HttpResponse(null, { status: 404 })
      )
    );
    expect((await loadGroupNames([99999])).has(99999)).toBe(false);
  });

  it('resolves what it can when one id in the batch fails', async () => {
    server.use(
      group(483, 'Mining Laser'),
      http.get(
        `${ESI_BASE_URL}/universe/groups/99999`,
        () => new HttpResponse(null, { status: 404 })
      )
    );
    const names = await loadGroupNames([483, 99999]);
    expect(names.get(483)).toBe('Mining Laser');
    expect(names.has(99999)).toBe(false);
  });

  it('makes no request at all for an empty list', async () => {
    expect((await loadGroupNames([])).size).toBe(0);
  });
});
