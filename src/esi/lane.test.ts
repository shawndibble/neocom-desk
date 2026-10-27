import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { PriorityTicket } from '@/lib/concurrency';

/** The lane each request asked the gate for, in arrival order. */
const gate = { lanes: [] as Array<PriorityTicket | undefined> };

// A fresh module graph with the gate wrapped: `vitest.setup.ts` has already
// loaded the real client (through the route-snapshot cache), so a hoisted
// `vi.mock` would reach this file but not the client it imports.
vi.resetModules();
vi.doMock('./budget', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./budget')>();
  return {
    ...actual,
    passEsiGate: (signal?: AbortSignal, lane?: PriorityTicket) => {
      gate.lanes.push(lane);
      return actual.passEsiGate(signal, lane);
    },
  };
});
const { esiFetch, configureEsi, ESI_BASE_URL } = await import('./client');
const { fetchAllPagesStatus } = await import('./paginated');
const { currentEsiLane, inBackgroundLane, withEsiLane, laneForLoad, configureActiveCharacter } =
  await import('./lane');

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
  configureActiveCharacter(null);
  gate.lanes = [];
});
afterAll(() => server.close());

function serveWallet(): void {
  server.use(http.get(`${ESI_BASE_URL}/characters/1/wallet`, () => HttpResponse.json(1)));
}

describe('the ambient ESI lane', () => {
  it('is foreground (no ticket) outside any scope', () => {
    expect(currentEsiLane()).toBeUndefined();
  });

  it('is a low ticket inside inBackgroundLane, and ends with the synchronous call', () => {
    const seen = inBackgroundLane(() => currentEsiLane());
    expect(seen?.priority).toBe('low');
    expect(currentEsiLane()).toBeUndefined();
  });

  it('restores the outer lane even when the scoped call throws', () => {
    const outer: PriorityTicket = { priority: 'low' };
    withEsiLane(outer, () => {
      expect(() =>
        withEsiLane(undefined, () => {
          throw new Error('boom');
        })
      ).toThrow('boom');
      expect(currentEsiLane()).toBe(outer);
    });
    expect(currentEsiLane()).toBeUndefined();
  });

  it('gives each background load a ticket of its own, so promoting one leaves the others', () => {
    const [a, b] = inBackgroundLane(() => [laneForLoad(), laneForLoad()]);
    expect(a?.priority).toBe('low');
    expect(b?.priority).toBe('low');
    expect(a).not.toBe(b);
    expect(laneForLoad()).toBeUndefined();
  });
});

describe('esiFetch carries its lane to the gate', () => {
  it('queues in the lane that was ambient when it was called, across its token await', async () => {
    configureEsi({
      getToken: async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        return 'token';
      },
    });
    serveWallet();

    await inBackgroundLane(() => esiFetch('/characters/1/wallet', { characterId: 1 }));

    expect(gate.lanes).toHaveLength(1);
    expect(gate.lanes[0]?.priority).toBe('low');
  });

  it('queues foreground when called outside any background scope', async () => {
    serveWallet();
    await esiFetch('/characters/1/wallet');
    expect(gate.lanes).toEqual([undefined]);
  });

  it('prefers an explicit lane over the ambient one', async () => {
    serveWallet();
    const explicit: PriorityTicket = { priority: 'low' };
    await esiFetch('/characters/1/wallet', { lane: explicit });
    expect(gate.lanes).toEqual([explicit]);
  });

  it('queues every page of a paginated walk in the lane the walk started in', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/1/assets`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
        return HttpResponse.json([page], { headers: { 'X-Pages': '3' } });
      })
    );

    const walk = inBackgroundLane(() => fetchAllPagesStatus<number>('/characters/1/assets'));
    const { items } = await walk;

    expect(items).toEqual([1, 2, 3]);
    expect(gate.lanes).toHaveLength(3);
    const [first, ...rest] = gate.lanes;
    expect(first?.priority).toBe('low');
    for (const lane of rest) expect(lane).toBe(first);
  });
});

describe('esiFetch queues the active Character’s reads first (issue #2281)', () => {
  function serveCharacter(id: number): void {
    server.use(http.get(`${ESI_BASE_URL}/characters/${id}/wallet`, () => HttpResponse.json(1)));
  }

  it('gives a foreground read for the active Character a high ticket', async () => {
    configureEsi({ getToken: async () => 'token' });
    configureActiveCharacter(() => 1);
    serveCharacter(1);
    await esiFetch('/characters/1/wallet', { characterId: 1 });
    expect(gate.lanes).toHaveLength(1);
    expect(gate.lanes[0]?.priority).toBe('high');
  });

  it('leaves a foreground read for any other Character in the normal lane', async () => {
    configureEsi({ getToken: async () => 'token' });
    configureActiveCharacter(() => 1);
    serveCharacter(2);
    await esiFetch('/characters/2/wallet', { characterId: 2 });
    expect(gate.lanes).toEqual([undefined]);
  });

  it('leaves background work for the active Character low', async () => {
    configureEsi({ getToken: async () => 'token' });
    configureActiveCharacter(() => 1);
    serveCharacter(1);
    await inBackgroundLane(() => esiFetch('/characters/1/wallet', { characterId: 1 }));
    expect(gate.lanes[0]?.priority).toBe('low');
  });

  it('queues nothing high when no active Character is configured', async () => {
    configureEsi({ getToken: async () => 'token' });
    serveCharacter(1);
    await esiFetch('/characters/1/wallet', { characterId: 1 });
    expect(gate.lanes).toEqual([undefined]);
  });

  it('queues every page of the active Character’s paginated walk high', async () => {
    configureEsi({ getToken: async () => 'token' });
    configureActiveCharacter(() => 1);
    server.use(
      http.get(`${ESI_BASE_URL}/characters/1/assets`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '1');
        return HttpResponse.json([page], { headers: { 'X-Pages': '3' } });
      })
    );

    await fetchAllPagesStatus<number>('/characters/1/assets', { characterId: 1 });

    expect(gate.lanes).toHaveLength(3);
    for (const lane of gate.lanes) expect(lane?.priority).toBe('high');
  });
});
