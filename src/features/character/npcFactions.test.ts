import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadNpcFactions } from './npcFactions';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await db.esiCache.clear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function type(typeId: number, groupId: number, counter?: { calls: number }) {
  return http.get(`${ESI_BASE_URL}/universe/types/${typeId}`, () => {
    if (counter) counter.calls += 1;
    return HttpResponse.json({
      type_id: typeId,
      name: `NPC ${typeId}`,
      description: '',
      group_id: groupId,
      published: false,
    });
  });
}

function group(groupId: number, name: string, counter?: { calls: number }) {
  return http.get(`${ESI_BASE_URL}/universe/groups/${groupId}`, () => {
    if (counter) counter.calls += 1;
    return HttpResponse.json({
      group_id: groupId,
      name,
      category_id: 11,
      published: false,
      types: [],
    });
  });
}

describe('loadNpcFactions', () => {
  it("maps each NPC type to its Group's pirate faction, or null when the Group names none", async () => {
    server.use(
      type(16938, 603),
      type(17039, 631),
      type(17594, 383),
      group(603, 'Deadspace Blood Raiders Battleship'),
      group(631, 'Deadspace Serpentis Cruiser'),
      group(383, 'Destructible Sentry Gun')
    );
    const factions = await loadNpcFactions([16938, 17039, 17594]);
    expect(factions.get(16938)).toBe('Blood Raiders');
    expect(factions.get(17039)).toBe('Serpentis');
    expect(factions.get(17594)).toBeNull();
  });

  it('serves a repeat lookup from the cache without touching the network', async () => {
    server.use(type(16938, 603), group(603, 'Deadspace Blood Raiders Battleship'));
    await loadNpcFactions([16938]);
    server.resetHandlers(); // any request now is an unhandled-request error
    expect((await loadNpcFactions([16938])).get(16938)).toBe('Blood Raiders');
  });

  it('asks ESI once per type and Group that concurrent callers both want', async () => {
    const types = { calls: 0 };
    const groups = { calls: 0 };
    server.use(type(24001, 613, types), group(613, 'Deadspace Guristas Cruiser', groups));
    const [a, b] = await Promise.all([loadNpcFactions([24001]), loadNpcFactions([24001])]);
    expect(a.get(24001)).toBe('Guristas');
    expect(b.get(24001)).toBe('Guristas');
    expect(types.calls).toBe(1);
    expect(groups.calls).toBe(1);
  });

  it('leaves a type ESI cannot resolve as null rather than failing the rest', async () => {
    server.use(
      http.get(
        `${ESI_BASE_URL}/universe/types/99999`,
        () => new HttpResponse(null, { status: 404 })
      ),
      type(16938, 603),
      group(603, 'Deadspace Blood Raiders Battleship')
    );
    const factions = await loadNpcFactions([99999, 16938]);
    expect(factions.get(99999)).toBeNull();
    expect(factions.get(16938)).toBe('Blood Raiders');
  });
});
